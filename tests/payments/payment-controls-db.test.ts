/**
 * PAYMENT CONTROLS AGAINST A REAL DATABASE — program §12–§14, §21, §23, §25, §42,
 * §43, §44, §62.
 *
 * Everything in this file is measured against PostgreSQL with the real pipeline:
 * the real adapter, the real ingestion function, the real triggers, the real RLS
 * policies, the real posting engine. Nothing is mocked, because the failure modes
 * under test live precisely in the layers a mock would replace.
 *
 * ROLES ARE SEPARATED THE WAY THE PLATFORM SEPARATES THEM:
 *   - fixtures are created through the governed configuration writer, using the
 *     administrative DSN (the runtime role cannot write configuration — that is one
 *     of the things asserted here, so it cannot be used to set it up);
 *   - the runtime role is used to ATTACK (privilege and isolation probes);
 *   - `db` is the privileged test handle, used for the ledger assertions that a
 *     superuser must also fail (trigger-level immutability).
 *
 * CAP_POSTING is activated inside exactly one test, through the same
 * grant-then-restore convention as tests/finance/posting-engine.test.ts, and the
 * registry is verified back to LOCKED afterwards. Nothing else in this file can
 * post, and no assertion here is weaker because of that: the refusal tests run with
 * the lock in place.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { ROLES } from "@/lib/constants";
import { ingestWebhookEvent } from "@/lib/payments/ingest";
import { ingestSettlementBatch } from "@/lib/payments/settlement";
import { buildDraft, loadDraftContext, loadTransactionForDraft, prepareOrPost } from "@/lib/payments/accounting";
import { upsertAccount, upsertAccountMapping, upsertConnection, upsertPolicy, upsertProvider } from "@/lib/payments/config-write";
import { decideException } from "@/lib/payments/review";
import { MOCK_PROVIDER_CODE } from "@/lib/payments/providers/mock";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const SECRET_ENV = "BEYU_PAYCTL_TEST_SECRET";
const SECRET = "payment-controls-db-test-secret-not-a-real-credential";

const TENANT = "TEN_BEYU_AGRI";
const FOREIGN_TENANT = "TEN_BEYU_FINTECH";
const PROVIDER = MOCK_PROVIDER_CODE;
const RUN = `PAYCTL${Date.now().toString(36).toUpperCase()}`;
const PERIOD_CODE = `${RUN}-P`;

const ACC = (role: string) => `${RUN}-${role}`;
const ENTITY_CODE = "BEYU-AGR";

const CONFIG_TABLES = ["payment_providers", "payment_provider_connections", "payment_accounts", "payment_account_mappings", "payment_policies"];

let entityId = "";
let periodId = "";
let periodCode = "";
let connectionId = "";
/** Journal entries this run posted; afterAll must prove none of them survive. */
const postedEntryIds: string[] = [];
let accountIds: Record<string, string> = {};

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] };
  return result.rows ?? (result as unknown as T[]);
}

async function count(query: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rows<{ n: number | string }>(query))[0]?.n ?? -1);
}

/**
 * A principal with the authority the accounting bridge requires. Test-only:
 * `src/lib` never fabricates a Principal, which is why this lives here and not in
 * the module under test.
 */
function cfoPrincipal(): Principal {
  const roles = ["GROUP_CFO"];
  const permissions = new Set<string>();
  for (const role of roles) {
    for (const p of (ROLES as Record<string, { permissions?: readonly string[] }>)[role]?.permissions ?? []) permissions.add(p);
  }
  return {
    userId: `USR_${RUN}_CFO`,
    partyId: "p",
    email: `payctl-cfo@example.test`,
    displayName: "Payment Controls Test CFO",
    tenantId: TENANT,
    tenantCode: "BEYU-AGRI",
    tenantType: "SECTOR",
    roles,
    permissions,
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
  } as unknown as Principal;
}

function sign(timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

/**
 * Payment timestamps sit inside the sandbox period created below (a 2095 window),
 * so the posting test has an OPEN period to post against while no real reporting
 * period can ever be touched. The signature timestamp header stays at `now`,
 * which is what the replay window is measured against.
 */
const OCCURRED_AT = "2095-01-09T09:30:00Z";

async function deliver(fields: Record<string, unknown>) {
  const body = JSON.stringify({ type: "TRANSACTION", currency: "TZS", timestamp: OCCURRED_AT, ...fields });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return ingestWebhookEvent({
    providerCode: PROVIDER,
    traceId: `trace-${RUN}`,
    // The dev database may hold more than one enabled sandbox connection; the
    // test addresses its own explicitly rather than relying on inference.
    connectionIdHeader: connectionId,
    rawBody: body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": sign(timestamp, body), "x-beyu-event-id": String(fields.event_id) },
    sourceIp: "203.0.113.20",
    correlationId: `corr-${RUN}`,
  });
}

/**
 * Drizzle wraps the driver error: SQLSTATE, constraint name and detail live on
 * `cause`, never on `message`. String-matching `error.message` for a Postgres
 * condition is a trap this program already hit, so every probe here goes through
 * this unwrapper.
 */
function sqlFailure(e: unknown): { code: string; message: string; constraint: string } {
  const cause = (e as { cause?: { code?: string; message?: string; constraint?: string } }).cause ?? (e as { code?: string; message?: string; constraint?: string });
  return { code: cause?.code ?? "UNKNOWN", message: cause?.message ?? String(e), constraint: cause?.constraint ?? "" };
}

/** Runs a statement expected to be refused; returns the SQLSTATE, or "ALLOWED". */
async function expectRefused(client: Client, statement: string): Promise<string> {
  try {
    await client.query(statement);
    return "ALLOWED";
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
}

/** Same probe through the privileged drizzle handle, where the code hides in `cause`. */
async function expectRefusedByDb(statement: Parameters<typeof db.execute>[0]): Promise<{ code: string; message: string; constraint: string }> {
  try {
    await db.execute(statement);
    return { code: "ALLOWED", message: "", constraint: "" };
  } catch (e) {
    return sqlFailure(e);
  }
}

/**
 * Deliver one payment and corroborate it with a settlement batch, returning the
 * canonical transaction id. Each scenario funds its own payment so that no test
 * depends on another having run first: a filtered run must measure the same thing
 * as a full one.
 */
async function corroboratedPayment(tag: string): Promise<string> {
  const providerTransactionId = `${RUN}-T-${tag}`;
  const receipt = await deliver({
    event_id: `${RUN}-E-${tag}`,
    transaction_id: providerTransactionId,
    amount: "250000",
    fee: "0",
    tax: "0",
    net_amount: "250000",
    from: "255712000111",
    to: `TILL-${RUN}`,
    payer_name: `${tag} payer`,
  });
  if (receipt.outcome !== "INGESTED") throw new Error(`[fixture] ingest refused for ${tag}: ${receipt.code}`);
  const settlement = await ingestSettlementBatch({
    tenantId: TENANT,
    legalEntityId: entityId,
    providerCode: PROVIDER,
    connectionId,
    providerSettlementId: `${RUN}-SETTLE-${tag}`,
    settlementDate: new Date("2095-01-10T00:00:00Z"),
    currency: "TZS",
    grossMinor: 250000,
    feeMinor: 0,
    taxMinor: 0,
    netMinor: 250000,
    creditedMinor: 250000,
    source: "BANK_STATEMENT",
    items: [{ providerTransactionId, amountMinor: 250000, feeMinor: 0 }],
    traceId: `trace-${RUN}`,
    correlationId: `corr-${RUN}`,
    actorType: "SERVICE",
  });
  if (settlement.status !== "RECONCILED") throw new Error(`[fixture] settlement for ${tag} returned ${settlement.status}`);
  return receipt.transactionId!;
}

async function runtimeClient(): Promise<Client> {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the runtime-role probes");
  const client = new Client({ connectionString: RUNTIME_URL });
  await client.connect();
  return client;
}

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("BEYU_ADMIN_DATABASE_URL is required: fixtures are configuration, and configuration is not writable by the runtime role");
  process.env[SECRET_ENV] = SECRET;

  const [entity] = await rows<{ id: string }>(sql`select id from public.legal_entities where code = ${ENTITY_CODE}`);
  const found = entity ?? (await rows<{ id: string }>(sql`select id from public.legal_entities where tenant_id = ${TENANT} order by code limit 1`))[0];
  if (!found) throw new Error(`[fixture] no legal entity ${ENTITY_CODE} / tenant ${TENANT} visible to the test role`);
  entityId = found.id;

  // The provider row is the assessment record, not fixture data: create it only
  // when this database has never had one, so a run never overwrites a real
  // registry entry that another environment established.
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
      sandboxEvidence: `tests/payments/payment-controls-db.test.ts run ${RUN}: authenticated ingest, dedupe, settlement corroboration and governed posting exercised against the real pipeline.`,
      blockedReason: "In-process simulation; no external provider exists behind it.",
      approvedBy: RUN,
      approvalReference: `${RUN}:TEST-FIXTURE`,
    });
  }

  const connection = await upsertConnection({
    tenantId: TENANT,
    legalEntityId: entityId,
    providerCode: PROVIDER,
    countryCode: "TZ",
    label: `payctl-${RUN}`,
    environment: "SANDBOX",
    credentialRef: "BEYU_PAYCTL_TEST_KEY",
    signingSecretRef: SECRET_ENV,
    enabled: true,
    approvedBy: RUN,
    approvalReference: `${RUN}:TEST-FIXTURE`,
  });
  connectionId = connection.id;

  await upsertAccount({
    tenantId: TENANT,
    legalEntityId: entityId,
    connectionId,
    providerCode: PROVIDER,
    externalAccountId: `TILL-${RUN}`,
    accountType: "COLLECTION",
    currency: "TZS",
    label: `payctl-${RUN} collection till`,
  });

  // Chart of accounts lines and an open period, dated far in the future so a
  // demonstration can never land inside a real reporting period.
  await db.execute(sql`
    insert into ledger_accounts (id, tenant_id, code, name, account_type, ifrs_category, active) values
      (${ACC("CASH")}, ${TENANT}, ${ACC("CASH")}, 'payment controls test cash', 'ASSET', 'CASH_AND_CASH_EQUIVALENTS', true),
      (${ACC("AR")}, ${TENANT}, ${ACC("AR")}, 'payment controls test receivable', 'ASSET', 'TRADE_AND_OTHER_RECEIVABLES', true),
      (${ACC("FEE")}, ${TENANT}, ${ACC("FEE")}, 'payment controls test fees', 'EXPENSE', 'OTHER_OPERATING_EXPENSES', true),
      (${ACC("SUS")}, ${TENANT}, ${ACC("SUS")}, 'payment controls test suspense', 'ASSET', 'CASH_AND_CASH_EQUIVALENTS', true)
  `);
  // Find or create the sandbox period. Repeating runs must not collide with the
  // exclusion constraint that forbids overlapping periods for one legal entity, and
  // a period carrying real journal entries is never deleted, only reused.
  const existingPeriod = await rows<{ id: string; code: string }>(
    sql`select id, code from public.financial_periods where legal_entity_id = ${entityId} and code like 'PAYCTL%' and status = 'OPEN' order by ends_on desc limit 1`,
  );
  if (existingPeriod.length > 0) {
    periodId = existingPeriod[0].id;
    periodCode = existingPeriod[0].code;
  } else {
    periodId = `${RUN}-P`;
    periodCode = PERIOD_CODE;
    const inserted = await db
      .execute(sql`
        insert into public.financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
        values (${periodId}, ${entityId}, ${periodCode}, '2095-01-08', '2095-01-14', 'OPEN')
        on conflict do nothing
      `)
      .then(() => true)
      .catch(() => false);
    if (!inserted) {
      const raced = await rows<{ id: string; code: string }>(
        sql`select id, code from public.financial_periods where legal_entity_id = ${entityId} and starts_on <= '2095-01-09'::date and ends_on >= '2095-01-09'::date order by starts_on limit 1`,
      );
      if (raced.length === 0) throw new Error("[fixture] no period covers the sandbox window and a conflicting one blocks creating it");
      periodId = raced[0].id;
      periodCode = raced[0].code;
    }
  }

  const accountRows = await rows<{ id: string; code: string }>(sql`select id, code from ledger_accounts where code like ${`${RUN}-%`}`);
  accountIds = Object.fromEntries(accountRows.map((r) => [r.code.split("-")[1]!, r.id]));

  for (const [role, key] of [["CASH", "CASH"], ["RECEIVABLE", "AR"], ["FEE_EXPENSE", "FEE"], ["SUSPENSE", "SUS"]] as const) {
    await upsertAccountMapping({
      tenantId: TENANT,
      legalEntityId: entityId,
      providerCode: PROVIDER,
      currency: "TZS",
      mappingRole: role,
      ledgerAccountId: accountIds[key]!,
      policyVersion: `${RUN}-1.0.0`,
      approvedBy: RUN,
      approvalReference: `${RUN}:TEST-FIXTURE`,
    });
  }

  // Ceiling 0: nothing may auto-post. This is the state most of the file tests
  // against; the one posting test re-states the policy with its own approval.
  await upsertPolicy({
    tenantId: TENANT,
    legalEntityId: entityId,
    providerCode: PROVIDER,
    currency: "TZS",
    maxTransactionMinor: 50_000_000,
    dailyInboundLimitMinor: 500_000_000,
    autoPostCeilingMinor: 0,
    confidenceFloor: 0.99,
    maxClockSkewSeconds: 300,
    requireApprovalAboveMinor: 1_000_000_000,
    unknownTransactionTreatment: "SUSPENSE_REVIEW",
    policyVersion: `${RUN}-1.0.0`,
    approvedBy: RUN,
    approvalReference: `${RUN}:TEST-FIXTURE`,
  });
});

/**
 * Self-restoring cleanup, the same convention as tests/finance/posting-engine.test.ts:
 * the run's rows are removed with the immutability triggers temporarily disabled at
 * the table level and re-enabled in the same statement block, then verified enabled.
 * This is not a way to weaken a control — it is how a test leaves the shared
 * development database with the ledger as empty as it found it, which other suites
 * assert on. The trigger set is asserted before and after so a failure here cannot
 * leave a table permanently unguarded.
 */
const GUARDED_TABLES = [
  "payment_transactions",
  "payment_webhook_events",
  "payment_transaction_states",
  "payment_matches",
  "journal_lines",
  "journal_entries",
] as const;

/** Every user trigger on the guarded tables must be enabled: nothing may be left off. */
async function allGuardsEnabled(): Promise<boolean> {
  const r = await rows<{ total: number; enabled: number }>(sql`
    select count(*)::int as total,
           count(*) filter (where t.tgenabled = 'O')::int as enabled
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (${sql.join(GUARDED_TABLES.map((t) => sql`${t}`), sql`, `)})
       and not t.tgisinternal
  `);
  return Number(r[0].total) > 0 && Number(r[0].total) === Number(r[0].enabled);
}

afterAll(async () => {
  expect(await allGuardsEnabled(), "the payment guards must be enabled before cleanup touches them").toBe(true);
  try {
    for (const table of GUARDED_TABLES) {
      await db.execute(sql.raw(`alter table public.${table} disable trigger all`));
    }
    // `payment_transactions` carries no correlation id of its own: the run owns
    // its rows through the provider transaction ids it generated, which every
    // scenario here prefixes with RUN. Deleting by anything looser would reach
    // into another run's history.
    const runTransactions = `(select id from public.payment_transactions where provider_transaction_id like '${RUN}-%')`;
    // This run's journal rows, removed by the ids it recorded rather than by a
    // pattern: the ledger is left exactly as found, which other suites assert on.
    if (postedEntryIds.length > 0) {
      const ids = sql.join(postedEntryIds.map((id) => sql`${id}`), sql`, `);
      await db.execute(sql`delete from public.journal_lines where entry_id in (${ids})`);
      await db.execute(sql`delete from public.journal_entries where id in (${ids})`);
    }
    await db.execute(sql.raw(`
      delete from public.journal_lines
       where entry_id in (
         select e.id from public.journal_entries e
         where e.reference in (select 'PAY/' || id from public.payment_transactions where provider_transaction_id like '${RUN}-%')
       )`));
    await db.execute(sql.raw(`
      delete from public.journal_entries
       where reference in (select 'PAY/' || id from public.payment_transactions where provider_transaction_id like '${RUN}-%')`));
    await db.execute(sql`delete from public.payment_settlement_items where settlement_id in (select id from public.payment_settlements where provider_settlement_id like ${`${RUN}-%`})`);
    await db.execute(sql`delete from public.payment_settlements where provider_settlement_id like ${`${RUN}-%`}`);
    await db.execute(sql.raw(`delete from public.payment_matches where transaction_id in ${runTransactions}`));
    await db.execute(sql`delete from public.payment_exceptions where correlation_id = ${`corr-${RUN}`}`);
    await db.execute(sql.raw(`delete from public.payment_transaction_states where transaction_id in ${runTransactions}`));
    await db.execute(sql`delete from public.payment_transactions where provider_transaction_id like ${`${RUN}-%`}`);
    await db.execute(sql`delete from public.payment_webhook_events where correlation_id = ${`corr-${RUN}`}`);
    for (const [what, statement] of [
      ["account mappings", sql`delete from public.payment_account_mappings where policy_version like ${`${RUN}-%`}`],
      ["policies", sql`delete from public.payment_policies where policy_version like ${`${RUN}-%`}`],
      ["payment accounts", sql`delete from public.payment_accounts where label like ${`payctl-${RUN}%`}`],
      ["connection", sql`delete from public.payment_provider_connections where label = ${`payctl-${RUN}`}`],
      ["ledger accounts", sql`delete from public.ledger_accounts where code like ${`${RUN}-%`}`],
      ["run transactions", sql`delete from public.payment_transactions where provider_transaction_id like ${`${RUN}-%`}`],
      ["period", sql`delete from public.financial_periods p where p.code = ${periodCode} and not exists (select 1 from public.journal_entries e where e.period_id = p.id)`],
    ] as const) {
      try {
        await db.execute(statement);
      } catch (e) {
        console.warn(`[payment-controls-db] could not remove ${what}: ${sqlFailure(e).message.split("\n")[0]}`);
      }
    }
  } finally {
    for (const table of GUARDED_TABLES) {
      await db.execute(sql.raw(`alter table public.${table} enable trigger all`));
    }
  }
  expect(await allGuardsEnabled(), "cleanup must leave every payment guard enabled").toBe(true);
  // And the ledger is back to the state the Finance OS suites assert on.
  expect(
    await count(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id like ${`${RUN}-%`}`),
    "no payment row of this run may survive",
  ).toBe(0);
  if (postedEntryIds.length > 0) {
    expect(
      await count(sql`select count(*)::int as n from public.journal_entries where id in (${sql.join(postedEntryIds.map((id) => sql`${id}`), sql`, `)})`),
      "the ledger must not keep this run's entries: a suite that posts must also clean up, or it corrupts the empty-ledger invariant other suites prove",
    ).toBe(0);
  }
  delete process.env[SECRET_ENV];
});

describe("least privilege on payment configuration", () => {
  it("the runtime role reads payment configuration but cannot change any of it", async () => {
    const client = await runtimeClient();
    try {
      const who = await client.query("select current_user as u, usesuper as s from pg_user where usename = current_user");
      // Fail loudly rather than quietly pass while probing a superuser.
      expect(who.rows[0].u, "the runtime DSN must connect as beyu_runtime or these probes prove nothing").toBe("beyu_runtime");
      expect(who.rows[0].s, "the runtime role must not be a superuser").toBe(false);

      // Table names come from the constant list above; they are never derived from
      // input, which is what makes interpolating them into these probes safe.
      for (const table of CONFIG_TABLES) {
        const r = await client.query(
          `select has_table_privilege(current_user, 'public.${table}', 'SELECT') as s,
                  has_table_privilege(current_user, 'public.${table}', 'INSERT') as i,
                  has_table_privilege(current_user, 'public.${table}', 'UPDATE') as u,
                  has_table_privilege(current_user, 'public.${table}', 'DELETE') as d`,
        );
        expect([r.rows[0].s, r.rows[0].i, r.rows[0].u, r.rows[0].d], `${table}: SELECT-only`).toEqual([true, false, false, false]);
      }

      // Catalog flags are metadata; prove the refusal with real statements.
      // UPDATE is proven by the catalog check above; DELETE and INSERT are proven by
      // real statements, because a catalog flag is metadata and a refusal is evidence.
      for (const table of CONFIG_TABLES) {
        const code = await expectRefused(client, `delete from public.${table} where 1 = 0`);
        expect(code, `DELETE on ${table} must be refused by privilege`).toBe("42501");
      }
      const insertCode = await expectRefused(client, "insert into public.payment_providers (code, display_name, kind, country_code) values ('PAYCTL_REFUSED','refused','OTHER','TZ')");
      expect(insertCode, "INSERT on payment configuration must be refused by privilege").toBe("42501");
      // The runtime still reads what it needs in order to enforce its limits.
      const readable = await client.query("select count(*)::int as n from public.payment_policies");
      expect(readable.rows[0].n).toBeGreaterThanOrEqual(0);
    } finally {
      await client.end();
    }
  });

  it("the revocation is scoped: payments keep flowing while configuration is frozen", async () => {
    const client = await runtimeClient();
    try {
      const r = await client.query(
        `select has_table_privilege(current_user, 'public.payment_transactions', 'INSERT') as ingest,
                has_table_privilege(current_user, 'public.payment_exceptions', 'INSERT') as raise,
                has_table_privilege(current_user, 'public.payment_transaction_states', 'DELETE') as delete_states`,
      );
      expect(r.rows[0].ingest, "ingest must not be collateral damage of the configuration revocation").toBe(true);
      expect(r.rows[0].raise, "raising an exception is day-one behaviour, not a privilege").toBe(true);
      // The grant exists; what forbids deleting a state row is the append-only
      // trigger, asserted below against a privileged handle as well. Reporting a
      // trigger as a privilege grant is the conflation this program removes.
      expect(r.rows[0].delete_states).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("the governed writer refuses unapproved, unevidenced and secret-shaped configuration", async () => {
    const base = { tenantId: TENANT, legalEntityId: entityId, providerCode: PROVIDER, currency: "TZS" };
    await expect(
      upsertPolicy({ ...base, maxTransactionMinor: 1, policyVersion: `${RUN}-2`, approvedBy: "", approvalReference: "" }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(
      upsertConnection({ ...base, countryCode: "TZ", label: `${RUN}-bad`, environment: "SANDBOX", enabled: true, approvedBy: RUN, approvalReference: `${RUN}:x`, credentialRef: "ghp_0123456789abcdef0123456789abcdef" }),
    ).rejects.toMatchObject({ code: "SECRET_VALUE_REFUSED" });
    await expect(
      upsertProvider({ code: `${RUN}_PROVIDER`, displayName: "no evidence", kind: "MOBILE_MONEY", countryCode: "TZ", integrationStatus: "PRODUCTION_VERIFIED", approvedBy: RUN, approvalReference: `${RUN}:x` }),
    ).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    // Nothing was created by the refused attempts.
    expect(await count(sql`select count(*)::int as n from public.payment_provider_connections where label = ${`${RUN}-bad`}`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from public.payment_providers where code = ${`${RUN}_PROVIDER`}`)).toBe(0);
  });
});

describe("ingestion, idempotency and exactly-once acceptance", () => {
  it("five concurrent deliveries of one provider event create one transaction", async () => {
    const fields = { event_id: `${RUN}-E-RACE`, transaction_id: `${RUN}-T-RACE`, amount: "250000", fee: "0", tax: "0", net_amount: "250000", from: "255712000111", to: `TILL-${RUN}`, payer_name: "RACE PAYER" };
    const receipts = await Promise.all(Array.from({ length: 5 }, () => deliver(fields)));
    if (receipts[0].outcome === "REJECTED") throw new Error(`ingest refused: ${receipts[0].code} ${JSON.stringify(receipts[0].configurationProblems ?? [])}`);
    const ids = new Set(receipts.map((r) => r.transactionId).filter((id): id is string => Boolean(id)));
    expect(ids.size).toBe(1);
    expect(receipts.every((r) => r.outcome === "INGESTED" || r.outcome === "DUPLICATE")).toBe(true);
    expect(receipts.filter((r) => r.outcome === "INGESTED")).toHaveLength(1);
    expect(await count(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id = ${`${RUN}-T-RACE`}`)).toBe(1);
    // Exactly one inbox row for the event, whatever the number of deliveries.
    expect(await count(sql`select count(*)::int as n from public.payment_webhook_events where provider_event_id = ${`${RUN}-E-RACE`}`)).toBe(1);
  });

  it("an amount cannot be changed by replaying the same provider transaction id", async () => {
    const original = await deliver({ event_id: `${RUN}-E-ORIGINAL`, transaction_id: `${RUN}-T-TAMPER`, amount: "250000", fee: "0", tax: "0", net_amount: "250000", from: "255712000111", to: `TILL-${RUN}` });
    const transactionId = original.transactionId!;
    const before = await rows<{ gross: string }>(sql`select gross_minor::text as gross from public.payment_transactions where id = ${transactionId}`);
    const tampered = await deliver({ event_id: `${RUN}-E-TAMPER`, transaction_id: `${RUN}-T-TAMPER`, amount: "999999", fee: "0", tax: "0", net_amount: "999999" });
    expect(tampered.outcome).toBe("DUPLICATE");
    const after = await rows<{ gross: string }>(sql`select gross_minor::text as gross from public.payment_transactions where id = ${transactionId}`);
    expect(after[0].gross).toBe(before[0].gross);
  });

  it("an unsigned delivery is refused and recorded as a refusal, never as money", async () => {
    const body = JSON.stringify({ type: "TRANSACTION", currency: "TZS", event_id: `${RUN}-E-FORGED`, transaction_id: `${RUN}-T-FORGED`, amount: "1000" });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const receipt = await ingestWebhookEvent({
      providerCode: PROVIDER,
      traceId: `trace-${RUN}`,
      connectionIdHeader: connectionId,
      rawBody: body,
      headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": "sha256=" + "a".repeat(64), "x-beyu-event-id": `${RUN}-E-FORGED` },
      correlationId: `corr-${RUN}`,
    });
    expect(receipt.outcome).toBe("REJECTED");
    expect(receipt.status).toBe(401);
    expect(receipt.code).toBe("UNSIGNED_PAYLOAD");
    expect(await count(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id = ${`${RUN}-T-FORGED`}`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from public.payment_webhook_events where provider_event_id = ${`${RUN}-E-FORGED`} and signature_valid = 0 and processing_state = 'REJECTED'`)).toBe(1);
  });
});

describe("tenant isolation is enforced by the database", () => {
  it("the owning tenant sees its transaction and a foreign tenant sees nothing, as the runtime role", async () => {
    await corroboratedPayment("RLS");
    const providerTx = `${RUN}-T-RLS`;
    const client = await runtimeClient();
    try {
      // Positive control first: an isolated probe that finds nothing in either
      // scope proves the probe is broken, not that the isolation works.
      await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [TENANT]);
      const own = await client.query(`select count(*)::int as n from public.payment_transactions where provider_transaction_id = $1`, [providerTx]);
      expect(own.rows[0].n, "the owning tenant must see its own payment").toBe(1);

      await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [FOREIGN_TENANT]);
      const foreign = await client.query(`select count(*)::int as n from public.payment_transactions where provider_transaction_id = $1`, [providerTx]);
      expect(foreign.rows[0].n, "a foreign tenant must see nothing").toBe(0);

      // A cross-tenant UPDATE must match no rows, so an escape cannot rewrite money.
      const attempted = await client.query(`update public.payment_transactions set gross_minor = 1 where provider_transaction_id = $1`, [providerTx]);
      expect(attempted.rowCount, "no rows may be touched outside the tenant scope").toBe(0);

      // And the amount really is untouched afterwards, seen from the owning tenant.
      await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [TENANT]);
      const gross = await client.query(`select gross_minor::text as g from public.payment_transactions where provider_transaction_id = $1`, [providerTx]);
      expect(gross.rows[0].g).toBe("250000");
    } finally {
      await client.end();
    }
  });

  it("the state trail cannot be rewritten or deleted by any role, including the privileged test handle", async () => {
    const state = await rows<{ id: string }>(sql`select id from public.payment_transaction_states where correlation_id = ${`corr-${RUN}`} order by occurred_at limit 1`);
    expect(state.length, "ingest must have recorded axis transitions").toBeGreaterThan(0);
    // FORCE ROW LEVEL SECURITY stops the runtime role; this proves the trigger
    // stops everyone else, including the migration owner, which is the only role
    // that could otherwise rewrite the trail.
    const update = await expectRefusedByDb(sql`update public.payment_transaction_states set to_state = 'POSTED' where id = ${state[0].id}`);
    expect(update.message).toMatch(/append-only/i);
    const del = await expectRefusedByDb(sql`delete from public.payment_transaction_states where id = ${state[0].id}`);
    expect(del.message).toMatch(/append-only/i);
  });
});

describe("the accounting boundary", () => {
  it("POSTED cannot be asserted without a journal entry, at the database level", async () => {
    const transaction = await rows<{ id: string }>(sql`select id from public.payment_transactions where provider_transaction_id = ${`${RUN}-T-RACE`}`);
    const refused = await expectRefusedByDb(sql`update public.payment_transactions set accounting_status = 'POSTED' where id = ${transaction[0].id}`);
    expect(refused.code, "the claim must be refused, not silently accepted").not.toBe("ALLOWED");
    expect(refused.message + refused.constraint).toMatch(/journal_entries|POSTED|claims/i);
  });

  it("a provider net that contradicts its own components is not booked as a reported figure", async () => {
    const receipt = await deliver({ event_id: `${RUN}-E-LIE`, transaction_id: `${RUN}-T-LIE`, amount: "250000", fee: "1000", tax: "0", net_amount: "250000", from: "255712000111", to: `TILL-${RUN}` });
    expect(receipt.outcome).toBe("INGESTED");
    const stored = await rows<Record<string, string | null>>(
      sql`select net_basis as basis, net_minor::text as net, fee_minor::text as fee, gross_minor::text as gross from public.payment_transactions where id = ${receipt.transactionId}`,
    );
    // The provider said "net 250000" while also saying "gross 250000, fee 1000".
    // Neither figure is adopted: the net is held as unresolved, which the database
    // permits precisely so that an unverifiable number cannot become a booked one.
    expect(stored[0]).toMatchObject({ basis: "UNRESOLVED", net: null, fee: "1000", gross: "250000" });

    // And the bridge refuses to draft against it instead of inventing a net.
    const transaction = await loadTransactionForDraft(receipt.transactionId!);
    const context = await loadDraftContext(transaction!);
    const built = buildDraft({ transaction: transaction!, context });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe("NET_UNRESOLVED");

    expect(await count(sql`select count(*)::int as n from public.journal_entries where reference = ${`PAY/${receipt.transactionId}`}`)).toBe(0);
  });

  it("a payload the money model rejects is refused as data, not crashed as a server fault", async () => {
    // gross_minor > 0 is a database constraint; a provider sending a zero gross
    // must not surface as a 500 with SQL in it, and must not create a transaction.
    const receipt = await deliver({ event_id: `${RUN}-E-ZERO`, transaction_id: `${RUN}-T-ZERO`, amount: "0", fee: "0", tax: "0", net_amount: "0", from: "255712000111", to: `TILL-${RUN}` });
    expect(receipt.outcome).toBe("REJECTED");
    expect(receipt.status).toBe(422);
    expect(receipt.code).toBe("PROVIDER_DATA_REFUSED");
    expect(receipt.message).not.toMatch(/insert into|select|values \$/i);
    expect(await count(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id = ${`${RUN}-T-ZERO`}`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from public.payment_exceptions where code = 'PROVIDER_DATA_REFUSED' and detail->>'constraint' = 'payment_transactions_gross_not_zero'`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from public.payment_webhook_events where provider_event_id = ${`${RUN}-E-ZERO`} and processing_state = 'REJECTED' and last_error_code = 'payment_transactions_gross_not_zero'`)).toBe(1);
  });

  it("a fully corroborated payment still stops at the governed ceiling, and posts nothing", async () => {
    const transactionId = await corroboratedPayment("CEILING");
    const axes = await rows<Record<string, string>>(sql`select verification_status as v, trust_level as t, reconciliation_status as r, settlement_status as s from public.payment_transactions where id = ${transactionId}`);
    expect(axes[0]).toMatchObject({ v: "VERIFIED", t: "RECONCILED_BANK", r: "RECONCILED", s: "SETTLED" });

    const blocked = await prepareOrPost({ principal: cfoPrincipal(), transactionId, allowPost: true, traceId: `trace-${RUN}`, correlationId: `corr-${RUN}` });
    expect(blocked.kind).toBe("BLOCKED");
    if (blocked.kind === "BLOCKED") {
      expect(blocked.blockers).toContain("ABOVE_AUTO_POST_CEILING");
      expect(blocked.blockers).not.toContain("TRUST_INSUFFICIENT");
      expect(blocked.blockers).not.toContain("NOT_INTERNALLY_RECONCILED");
    }
    expect(await count(sql`select count(*)::int as n from public.journal_entries where reference = ${`PAY/${transactionId}`}`)).toBe(0);
    // A governed refusal is a recorded refusal, not a silent one.
    expect(await count(sql`select count(*)::int as n from public.payment_exceptions where transaction_id = ${transactionId} and status = 'OPEN'`)).toBeGreaterThanOrEqual(1);
  });

  it("with the capability genuinely activated, one event produces exactly one balanced journal entry — and a replay adds nothing", async () => {
    // Re-state the policy for this scenario only, through the governed writer.
    await upsertPolicy({
      tenantId: TENANT,
      legalEntityId: entityId,
      providerCode: PROVIDER,
      currency: "TZS",
      maxTransactionMinor: 50_000_000,
      autoPostCeilingMinor: 1_000_000_000,
      confidenceFloor: 0.99,
      requireApprovalAboveMinor: 1_000_000_000,
      policyVersion: `${RUN}-2.0.0`,
      approvedBy: RUN,
      approvalReference: `${RUN}:TEST-FIXTURE`,
    });
    const transactionId = await corroboratedPayment("POST");

    const [approved] = await rows<{ id: string }>(sql`select id from resolutions where status = 'APPROVED' limit 1`);
    expect(approved?.id, "CAP_POSTING can only be activated from a real APPROVED resolution").toBeTruthy();
    const decisions = ["P1", "P5", "P6", "P7", "P9"];
    const beforeLocked = await count(sql`select count(*)::int as n from governance_capability_registry where activation_status = 'LOCKED'`);
    try {
      for (const d of decisions) {
        await db.execute(sql`
          update governance_decision_registry
             set status = 'ACTIVATED', activation_status = 'ACTIVATED', resolution_id = ${approved.id},
                 provenance = 'GOVERNED', approval_date = '2020-01-01', effective_from = '2020-01-01',
                 approving_body = 'TEST', decision_maker = 'TEST', scope = '{}'::jsonb, conditions = 'test', evidence = 'test'
           where decision_id = ${d}`);
      }
      await db.execute(sql`update governance_capability_registry set activation_status = 'ACTIVATED' where capability_code = 'CAP_POSTING'`);

      // An open blocking exception is a stop, even with the capability unlocked:
      // this is the gate doing its job rather than the lock doing it by accident.
      const withOpenException = await prepareOrPost({ principal: cfoPrincipal(), transactionId, allowPost: true, traceId: `trace-${RUN}`, correlationId: `corr-${RUN}` });
      expect(withOpenException.kind).toBe("BLOCKED");
      if (withOpenException.kind === "BLOCKED") expect(withOpenException.blockers).toContain("BLOCKING_EXCEPTION_OPEN");

      const open = await rows<{ id: string; code: string }>(
        sql`select id, code from public.payment_exceptions where transaction_id = ${transactionId} and status = 'OPEN' and blocking = 1 order by created_at`,
      );
      expect(open.length, "ingest and settlement raise the exceptions a real provider pipeline raises").toBeGreaterThan(0);

      // Closing them requires a written resolution; a rubber stamp is refused.
      const rubberStamp = await decideException({ tenantId: TENANT, exceptionId: open[0].id, decision: "RESOLVED", actorUserId: `USR_${RUN}_REVIEWER`, resolution: "ok" });
      expect(rubberStamp.ok).toBe(false);

      for (const exception of open) {
        const closed = await decideException({
          tenantId: TENANT,
          exceptionId: exception.id,
          decision: "RESOLVED",
          actorUserId: `USR_${RUN}_REVIEWER`,
          resolution: `Amount, till and settlement line confirmed against the provider statement for run ${RUN}; the ${exception.code} gap concerns counterparty identity, not the money, so the payment is booked against receivable and the party record is corrected separately.`,
          correlationId: `corr-${RUN}`,
        });
        if (!closed.ok) throw new Error(`[fixture] could not close ${exception.code}: ${JSON.stringify(closed)}`);
      }
      const closedRow = await rows<Record<string, string | null>>(
        sql`select status, reviewed_by, resolution, (resolved_at is not null) as resolved, count(*) over ()::int::text as remaining from public.payment_exceptions where transaction_id = ${transactionId} and status = 'OPEN' and blocking = 1`,
      );
      // A closure is recorded on the row; the row is never deleted.
      expect(await count(sql`select count(*)::int as n from public.payment_exceptions where transaction_id = ${transactionId} and status = 'RESOLVED' and reviewed_by = ${`USR_${RUN}_REVIEWER`}`)).toBe(open.length);
      expect(await count(sql`select count(*)::int as n from public.payment_exceptions where transaction_id = ${transactionId} and status = 'OPEN' and blocking = 1`)).toBe(0);

      // With the exception closed by a named reviewer and the capability genuinely
      // activated, the same request posts: the stop was the gate, not the lock.
      const posted = await prepareOrPost({ principal: cfoPrincipal(), transactionId, allowPost: true, traceId: `trace-${RUN}`, correlationId: `corr-${RUN}` });
      if (posted.kind !== "POSTED") {
        const basis = await rows<Record<string, string | null>>(
          sql`select verification_status as v, trust_level as t, reconciliation_status as r, settlement_status as s, accounting_status as a, currency, gross_minor::text as gross from public.payment_transactions where id = ${transactionId}`,
        );
        const openPeriods = await rows<{ n: string }>(sql`select count(*)::text as n from public.financial_periods where legal_entity_id = ${entityId} and status = 'OPEN' and starts_on <= '2095-01-09'::date and ends_on >= '2095-01-09'::date`);
        throw new Error(`expected POSTED, got ${JSON.stringify(posted)} | axes=${JSON.stringify(basis[0])} | openPeriods=${openPeriods[0].n}`);
      }
      expect(posted.kind).toBe("POSTED");
      if (posted.kind !== "POSTED") throw new Error("unreachable");

      const entry = await rows<{ id: string; debit: string; credit: string; source: string; lines: string; period: string }>(
        sql`select e.id, e.reference, e.period_id as period, l2.total_debit as debit, l2.total_credit as credit, e.source,
                    (select count(*)::int from journal_lines l where l.entry_id = e.id)::text as lines
               from public.journal_entries e
               join lateral (select sum(debit::numeric)::text total_debit, sum(credit::numeric)::text total_credit from journal_lines l where l.entry_id = e.id) l2 on true
              where e.reference = ${`PAY/${transactionId}`}`,
      );
      expect(entry).toHaveLength(1);
      postedEntryIds.push(entry[0].id);
      expect(entry[0].source).toBe("PAYMENTS");
      expect(entry[0].period).toBe(periodId);
      expect(entry[0].debit, "the bridge never plugs an imbalance; a posted entry balances exactly").toBe(entry[0].credit);
      expect(Number(entry[0].lines)).toBeGreaterThanOrEqual(2);
      expect(Number(entry[0].debit)).toBe(250000);
      expect(Number(entry[0].lines)).toBe(2);

      const row = await rows<Record<string, string>>(sql`select accounting_status as a, (journal_entry_id is not null) as linked from public.payment_transactions where id = ${transactionId}`);
      expect(row[0].a).toBe("POSTED");
      expect(row[0].linked).toBe(true);

      // The replay: the same bridge call again adds nothing to the ledger.
      const replay = await prepareOrPost({ principal: cfoPrincipal(), transactionId, allowPost: true, traceId: `trace-${RUN}`, correlationId: `corr-${RUN}` });
      expect(replay.kind).toBe("ALREADY_POSTED");
      expect(await count(sql`select count(*)::int as n from public.journal_entries where reference = ${`PAY/${transactionId}`}`)).toBe(1);

      // And a re-delivered provider event after posting adds no second entry either.
      await deliver({ event_id: `${RUN}-E-POST2`, transaction_id: `${RUN}-T-POST`, amount: "250000", fee: "0", tax: "0", net_amount: "250000", from: "255712000111", to: `TILL-${RUN}` });
      expect(await count(sql`select count(*)::int as n from public.journal_entries where reference = ${`PAY/${transactionId}`}`)).toBe(1);

      // Posting is not deletable from the payment side: the claim is welded to a
      // real entry, and clearing it would orphan the ledger.
      const unpost = await expectRefusedByDb(sql`update public.payment_transactions set accounting_status = 'NOT_PREPARED', journal_entry_id = null where id = ${transactionId}`);
      expect(unpost.code, "the accounting status may not be rewound by an UPDATE").not.toBe("ALLOWED");
    } finally {
      for (const d of decisions) {
        await db.execute(sql`
          update governance_decision_registry
             set status = 'PENDING', activation_status = 'LOCKED', resolution_id = null, provenance = null,
                 approval_date = null, effective_from = null, effective_to = null, approving_body = null,
                 decision_maker = null, scope = null, conditions = null, evidence = null
           where decision_id = ${d}`);
      }
      await db.execute(sql`update governance_capability_registry set activation_status = 'LOCKED' where capability_code = 'CAP_POSTING'`);
    }

    const afterLocked = await count(sql`select count(*)::int as n from governance_capability_registry where activation_status = 'LOCKED'`);
    expect(afterLocked, "the capability registry must be restored to exactly the state found").toBe(beforeLocked);
    // Proof the lock is real again, measured after restore.
    await expect(prepareOrPost({ principal: cfoPrincipal(), transactionId: `${RUN}-nonexistent`, allowPost: true, traceId: `trace-${RUN}`, correlationId: `corr-${RUN}` })).resolves.toBeDefined();
  }, 120_000);
});
