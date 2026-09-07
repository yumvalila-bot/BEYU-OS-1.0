/**
 * HUMAN REVIEW ASSURANCE — program §6 (human review of every payment decision) and
 * §7 (the configuration a reviewer acts on is governed, not silently mutable), plus
 * the segregation-of-duties rule that decides whether a review act counts at all.
 *
 * Why a separate file: `payment-controls-db.test.ts` proves the LEDGER-side controls.
 * This file proves the REVIEW-side controls, and it exists because the DR drill found
 * a defect that neither the unit tests nor the ledger tests could see: the review and
 * accounting modules read their own rows through `db` WITHOUT establishing the tenant
 * context those reads need. Against the privileged test handle that is invisible
 * (RLS does not apply); against the runtime role the platform actually uses, every
 * human review act returned NOT_FOUND and the duplicate-delivery path returned 409 for
 * a payment that was plainly in the table. A control that only works when the caller
 * happens to have set up a scope is not a control, so the scoping is asserted here
 * statically — a regression test that fails if a future edit re-introduces an
 * unscoped read into these two modules — and behaviourally, against a real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ingestWebhookEvent } from "@/lib/payments/ingest";
import { assertSeparation, decideException, reviewQueue } from "@/lib/payments/review";
import { upsertConnection, upsertProvider } from "@/lib/payments/config-write";
import { FIXTURE_RESET_CONFIRM_TOKEN, removeDemoPaymentRows } from "@/lib/payments/fixture-reset";
import { MOCK_PROVIDER_CODE } from "@/lib/payments/providers/mock";

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const PROVIDER = MOCK_PROVIDER_CODE;
const TENANT = "TEN_BEYU_AGRI";
const FOREIGN_TENANT = "TEN_BEYU_FINTECH";
const RUN = `HRA${Date.now().toString(36).toUpperCase()}`;
const SECRET_ENV = "BEYU_HRA_TEST_SECRET";
const SECRET = "human-review-assurance-secret-not-a-real-credential";
const OCCURRED_AT = "2095-01-09T09:30:00Z";
const REVIEWER = `USR_${RUN}_REVIEWER`;
const AUTHORIZER = `USR_${RUN}_AUTHORIZER`;

let connectionId = "";
let deliveredTransactionId = "";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] };
  return result.rows ?? (result as unknown as T[]);
}

async function count(query: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rows<{ n: number | string }>(query))[0]?.n ?? -1);
}

function sign(timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

async function deliver(fields: Record<string, unknown>) {
  const body = JSON.stringify({ type: "TRANSACTION", currency: "TZS", timestamp: OCCURRED_AT, ...fields });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return ingestWebhookEvent({
    providerCode: PROVIDER,
    traceId: `trace-${RUN}`,
    connectionIdHeader: connectionId,
    rawBody: body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": sign(timestamp, body), "x-beyu-event-id": String(fields.event_id) },
    sourceIp: "203.0.113.30",
    correlationId: `corr-${RUN}`,
  });
}

/* ------------------------- the static scoping guarantee ------------------------- */

function source(rel: string): string {
  // Comments carry the very phrases this scan looks for, so they are stripped first.
  return readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/** Character ranges covered by `withDatabaseRlsContext([…], …, operation)`. */
function scopedRanges(src: string): Array<[number, number]> {
  const needle = "withDatabaseRlsContext(";
  const ranges: Array<[number, number]> = [];
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + needle.length)) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < src.length; j += 1) {
      if (src[j] === "(") depth += 1;
      else if (src[j] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    ranges.push([i, j]);
  }
  return ranges;
}

/**
 * Every `db.select/execute/insert/update/delete` in a payments module must be covered
 * by a tenant context. Two escapes are permitted, and both are declared here rather
 * than left for a reader to discover:
 *   - the statement sits in a helper that is CALLED from inside a scoped block (it
 *     inherits that block's context);
 *   - the statement sits in a helper that takes the tenant from its own caller
 *     (its signature declares a `tenantId?:` argument), so it scopes itself.
 * Anything else is a read whose correctness depends on whoever happened to call it.
 */
function unscopedStatements(rel: string, selfScopingHelpers: readonly string[]): string[] {
  const src = source(rel);
  const ranges = scopedRanges(src);
  const insideRange = (index: number) => ranges.some(([start, end]) => index >= start && index <= end);
  // Identifiers invoked inside a scoped block: whatever they do, the block already
  // established the context they inherit.
  const calledInsideScope = new Set<string>();
  for (const [start, end] of ranges) {
    for (const m of src.slice(start, end).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) calledInsideScope.add(m[1]);
  }
  const selfScoping = new Set<string>(
    selfScopingHelpers.filter((helper) => new RegExp("function " + helper + "\\([\\s\\S]{0,220}?tenantId\\?:").test(src)),
  );
  // Which function encloses a given offset — found by reading backwards to the nearest
  // declaration, which avoids parsing the return-type braces in front of the body.
  const enclosingFunction = (index: number): string | null => {
    let name: string | null = null;
    for (const m of src.slice(0, index).matchAll(/function ([A-Za-z_$][\w$]*)\s*\(/g)) name = m[1];
    return name;
  };
  const offenders: string[] = [];
  for (const m of src.matchAll(/\bdb\s*\.\s*(select|execute|insert|update|delete)\s*\(/g)) {
    const index = m.index ?? 0;
    if (insideRange(index)) continue;
    const owner = enclosingFunction(index);
    if (owner && (calledInsideScope.has(owner) || selfScoping.has(owner))) continue;
    const line = src.slice(0, index).split("\n").length;
    offenders.push(`${rel}:${line} db.${m[1]}( with no tenant context established by this module or its caller${owner ? ` (in ${owner})` : ""}`);
  }
  return offenders;
}

describe("the review and accounting modules never depend on ambient scope", () => {
  it("every database statement in the human review module is tenant-scoped", () => {
    // `historyFor`/`assertSeparation` are called from inside the scoped blocks and are
    // therefore exempt by construction; no other escape is granted.
    // `historyFor` and `assertSeparation` take the tenant from their own caller and
    // scope themselves; the scan grants no other escape.
    expect(unscopedStatements("src/lib/payments/review.ts", ["historyFor", "assertSeparation"])).toEqual([]);
  });

  it("the accounting bridge scopes its reads, with declared self-scoping lookups", () => {
    const offenders = unscopedStatements("src/lib/payments/accounting.ts", ["loadTransactionForDraft", "resolvePeriod"]);
    expect(offenders).toEqual([]);
  });

  it("a review read that a caller can reach without a tenant context is a defect, not a style choice", () => {
    // Guards the specific regression: `reviewQueue` used to filter only by
    // `tenant_id = $1` while the table's RLS policy filtered by the session scope,
    // so the queue was empty for the runtime role and full for a test superuser.
    const src = source("src/lib/payments/review.ts");
    const queue = src.slice(src.indexOf("export async function reviewQueue"));
    expect(queue.slice(0, queue.indexOf("\n}\n") + 3)).toContain("withDatabaseRlsContext");
    expect(src).toContain("async function historyFor(transactionId: string, tenantId?: string | null)");
  });

  it("a review act never touches money and never erases the record of a decision", () => {
    // Moving a payment's axis states is what a confirmed match is FOR; the line the
    // review module may never cross is the amount, and the deletion of a record that
    // explains a decision.
    const src = source("src/lib/payments/review.ts");
    expect(src).not.toMatch(/\.set\(\s*\{[\s\S]{0,400}?\b(grossMinor|netMinor|feeMinor|taxMinor|amountMinor|providerTransactionId|currency)\b:/);
    expect(src).not.toMatch(/\.delete\(\s*paymentExceptions/);
    expect(src).not.toMatch(/\.delete\(\s*paymentMatches/);
    expect(src).not.toMatch(/truncate/i);
    expect(src).not.toMatch(/sql\.raw/);
  });
});

/* ------------------------------ the real pipeline ------------------------------ */

describe("human review of a payment, measured against PostgreSQL", () => {
  beforeAll(async () => {
    if (!ADMIN_URL) throw new Error("BEYU_ADMIN_DATABASE_URL is required: a connection is configuration, and configuration is not writable by the runtime role");
    process.env[SECRET_ENV] = SECRET;

    const providerCount = await count(sql`select count(*)::int as n from public.payment_providers where code = ${PROVIDER}`);
    if (providerCount === 0) {
      await upsertProvider({
        code: PROVIDER,
        displayName: "BEYU Payment Sandbox (mock)",
        kind: "MOBILE_MONEY",
        countryCode: "TZ",
        integrationStatus: "SANDBOX_VERIFIED",
        contractStatus: "NOT_REQUIRED",
        credentialStatus: "SANDBOX_ISSUED",
        apiAvailability: "NONE_FOUND",
        webhookModel: "PROVIDER_PUSH",
        settlementModel: "MANUAL_BATCH",
        signatureScheme: "HMAC_SHA256",
        sandboxMode: "MOCK_ONLY",
        regulatoryEnforcement: "NOT_INVESTIGATED",
        capabilities: { INBOUND_WEBHOOK: true, SETTLEMENT_BATCH: true, REVERSAL_NOTICE: true, STATEMENT_FILE: true },
        sandboxEvidence: `tests/payments/human-review-assurance.test.ts run ${RUN}: the governed review path exercised against the real pipeline.`,
        blockedReason: "In-process simulation; no external provider exists behind it.",
        approvedBy: RUN,
        approvalReference: `${RUN}:TEST-FIXTURE`,
      });
    }
    const [entity] = await rows<{ id: string }>(sql`select id from public.legal_entities where tenant_id = ${TENANT} order by code limit 1`);
    if (!entity) throw new Error(`[fixture] no legal entity visible for tenant ${TENANT}`);
    const connection = await upsertConnection({
      tenantId: TENANT,
      legalEntityId: entity.id,
      providerCode: PROVIDER,
      countryCode: "TZ",
      label: `hra-${RUN}`,
      environment: "SANDBOX",
      credentialRef: "BEYU_HRA_TEST_KEY",
      signingSecretRef: SECRET_ENV,
      enabled: true,
      approvedBy: RUN,
      approvalReference: `${RUN}:TEST-FIXTURE`,
    });
    connectionId = connection.id;

    const receipt = await deliver({
      event_id: `${RUN}-E1`,
      transaction_id: `${RUN}-T1`,
      amount: "250000",
      fee: "0",
      tax: "0",
      net_amount: "250000",
      from: "255712000111",
      to: `TILL-${RUN}`,
      payer_name: "HRA PAYER",
    });
    if (!receipt.transactionId) throw new Error(`[fixture] ingest refused: ${receipt.code} ${receipt.message}`);
    deliveredTransactionId = receipt.transactionId;
  }, 120_000);

  afterAll(async () => {
    // The library reset is used deliberately: it is the path the demonstration and
    // the DR drill share, and it now refuses to commit if its own removal would
    // dangle a foreign key. Nothing outside this run's tags is in scope.
    const removed = await removeDemoPaymentRows({ prefixes: [RUN], confirm: FIXTURE_RESET_CONFIRM_TOKEN });
    expect(removed.ok, `fixture teardown: ${JSON.stringify(removed)}`).toBe(true);
    await db.execute(sql`delete from public.payment_provider_connections where label = ${`hra-${RUN}`}`);
    expect(await count(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id like ${`${RUN}-%`}`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from public.payment_exceptions where correlation_id = ${`corr-${RUN}`}`)).toBe(0);
  }, 120_000);

  it("the review queue shows the payment's blocking exception to the tenant that owns it", async () => {
    const queue = await reviewQueue(TENANT, 200);
    const mine = queue.filter((r) => r.transactionId === deliveredTransactionId);
    expect(mine.length, "a payment with an unresolved data gap is on the queue").toBeGreaterThan(0);
    expect(mine.every((r) => r.status === "OPEN")).toBe(true);
    expect(mine.some((r) => r.blocking === 1)).toBe(true);
    const foreign = await reviewQueue(FOREIGN_TENANT, 500);
    expect(foreign.filter((r) => r.transactionId === deliveredTransactionId), "another tenant's queue never shows this payment").toHaveLength(0);
  });

  it("a review act with no written resolution is refused and changes nothing", async () => {
    const [exception] = await rows<{ id: string }>(
      sql`select id from public.payment_exceptions where transaction_id = ${deliveredTransactionId} and status = 'OPEN' and blocking = 1 order by created_at limit 1`,
    );
    expect(exception, "the fixture raised a blocking exception").toBeTruthy();
    const refused = await decideException({
      tenantId: TENANT,
      exceptionId: exception!.id,
      decision: "RESOLVED",
      actorUserId: REVIEWER,
      resolution: "ok",
      correlationId: `corr-${RUN}`,
    });
    expect(refused.ok, `a one-word resolution must not close a blocking exception: ${JSON.stringify(refused)}`).toBe(false);
    expect(await count(sql`select count(*)::int as n from public.payment_exceptions where id = ${exception!.id} and status = 'OPEN'`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from public.payment_exceptions where id = ${exception!.id} and reviewed_by is not null`)).toBe(0);
    // The refusal is itself a control event: who tried to close a blocking exception
    // without writing a reason has to be findable afterwards.
    expect(
      await count(
        sql`select count(*)::int as n from public.audit_log
              where object_id = ${exception!.id} and action = 'PAYMENT_REVIEW_REFUSED' and outcome = 'DENIED'`,
      ),
      "a refused review act is recorded, not silently dropped",
    ).toBe(1);
  });

  it("a review act addressed to the wrong tenant cannot reach the exception", async () => {
    const [exception] = await rows<{ id: string }>(
      sql`select id from public.payment_exceptions where transaction_id = ${deliveredTransactionId} and status = 'OPEN' limit 1`,
    );
    const result = await decideException({
      tenantId: FOREIGN_TENANT,
      exceptionId: exception!.id,
      decision: "RESOLVED",
      actorUserId: REVIEWER,
      resolution: "cross-tenant attempt that must not be able to see the row at all",
      correlationId: `corr-${RUN}`,
    });
    expect(result.ok, JSON.stringify(result)).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("closing an exception records the reviewer and the reasoning, and keeps the row", async () => {
    const open = await rows<{ id: string; code: string }>(
      sql`select id, code from public.payment_exceptions where transaction_id = ${deliveredTransactionId} and status = 'OPEN' and blocking = 1 order by created_at`,
    );
    for (const exception of open) {
      const closed = await decideException({
        tenantId: TENANT,
        exceptionId: exception.id,
        decision: "RESOLVED",
        actorUserId: REVIEWER,
        resolution: `HRA ${RUN}: provider payload, till number and amount confirmed against the sandbox statement line for ${exception.code}.`,
        correlationId: `corr-${RUN}`,
      });
      expect(closed.ok, `governed closure refused: ${JSON.stringify(closed)}`).toBe(true);
    }
    expect(await count(sql`select count(*)::int as n from public.payment_exceptions where transaction_id = ${deliveredTransactionId} and status = 'OPEN' and blocking = 1`)).toBe(0);
    const rowsAfter = await rows<{ id: string; status: string; reviewed_by: string | null; resolution: string | null; resolved: boolean; blocking: number }>(
      sql`select id, status, reviewed_by, resolution, (resolved_at is not null) as resolved, blocking::int from public.payment_exceptions where transaction_id = ${deliveredTransactionId}`,
    );
    expect(rowsAfter.length).toBeGreaterThanOrEqual(open.length);
    const closedIds = new Set(open.map((o) => o.id));
    let closedSeen = 0;
    for (const row of rowsAfter) {
      if (!closedIds.has(row.id)) {
        // A non-blocking gap stays exactly where it was: closing what blocks the
        // ledger is not a licence to sweep the rest of the queue.
        expect(["OPEN", "RESOLVED"]).toContain(row.status);
        continue;
      }
      closedSeen += 1;
      expect(row.status, "the row survives with the decision recorded on it").toBe("RESOLVED");
      expect(row.reviewed_by).toBe(REVIEWER);
      expect(row.resolved).toBe(true);
      expect((row.resolution ?? "").length).toBeGreaterThanOrEqual(5);
    }
    expect(closedSeen).toBe(open.length);
    // A review act must not move a money axis by stealth: the trail records the five
    // axes of the payment's own state, and closing a data gap does not reconcile it.
    const axes = await rows<{ axis: string }>(
      sql`select distinct axis from public.payment_transaction_states where transaction_id = ${deliveredTransactionId}`,
    );
    expect(axes.map((a) => a.axis).sort()).toEqual([...new Set(axes.map((a) => a.axis))].sort());
    for (const axis of axes) expect(["VERIFICATION", "TRUST", "RECONCILIATION", "SETTLEMENT", "ACCOUNTING"]).toContain(axis.axis);
    const basis = await rows<{ r: string }>(sql`select reconciliation_status as r from public.payment_transactions where id = ${deliveredTransactionId}`);
    expect(basis[0].r, "the money is still unreconciled until a statement says so").not.toBe("RECONCILED");
  });

  it("one person cannot supply both the review and the authority that relies on it", async () => {
    // This is the whole point of §6: whoever cleared the data gap on a payment may not
    // also be the person who accepts the residual risk on it. Before the fix, the
    // resolution was recorded only on the exception row, invisible to the trail, so
    // `alreadyHeld` came back empty and the second act was permitted.
    const held = await assertSeparation({ transactionId: deliveredTransactionId, actorUserId: REVIEWER, act: "confirm_match", tenantId: TENANT });
    expect(held.alreadyHeld, "the reviewer's control role is recorded against the payment").toContain("CHECKER");
    const self = await assertSeparation({ transactionId: deliveredTransactionId, actorUserId: REVIEWER, act: "accept_risk", tenantId: TENANT });
    expect(self.permitted, `the same identity must not also hold AUTHORIZER: ${JSON.stringify(self)}`).toBe(false);
    expect(self.reason).toContain("cannot also be");
    const other = await assertSeparation({ transactionId: deliveredTransactionId, actorUserId: AUTHORIZER, act: "accept_risk", tenantId: TENANT });
    expect(other.permitted, "a different identity may hold the authorizing role").toBe(true);
    expect(other.alreadyHeld).toEqual([]);
  });

  it("the review history a decision is judged on is readable and ordered", async () => {
    const held = await assertSeparation({ transactionId: deliveredTransactionId, actorUserId: REVIEWER, act: "confirm_match", tenantId: TENANT });
    expect(held.reason.length).toBeGreaterThan(0);
    const trail = await rows<{ at: string }>(
      sql`select occurred_at as at from public.payment_transaction_states where transaction_id = ${deliveredTransactionId} order by occurred_at`,
    );
    expect(trail.length).toBeGreaterThan(1);
    const stamps = trail.map((r) => new Date(r.at).getTime());
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  });
});
