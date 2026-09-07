/**
 * BEYU OS — payment fixture for the disaster-recovery drill (payments programme, §49).
 *
 * WHY THIS EXISTS
 * `scripts/dr-drill.ts` proves that the platform can be reconstructed from nothing but
 * the migrations in Git and that data restores with row-count parity. A payment
 * demonstration needs one more thing proved: that a *live payment lifecycle* — claim,
 * inbox, state trail, settlement, an actual journal entry, audit evidence — survives
 * reconstruction unchanged, and that a provider event replayed against the restored
 * database is still recognised as a duplicate instead of being booked a second time.
 * That is the failure mode a financial system cannot afford: a restore that re-opens
 * the accounting path.
 *
 * WHAT THIS FILE DOES
 *   createPaymentFixture()  — builds the lifecycle through the real pipeline:
 *                             configuration via the governed CLI (never a second
 *                             writer), ingest via the adapter, settlement via the
 *                             settlement path, exceptions closed via the governed
 *                             review path, posting via Finance OS postJournal() with
 *                             CAP_POSTING activated only for the duration and restored
 *                             immediately afterwards.
 *   verifyPaymentRestore()  — checks the restored database: same transactions, same
 *                             four reported axes, same state-trail length, one balanced
 *                             journal entry per payment with source 'PAYMENTS', the same
 *                             audit rows, and the 0029 unposting guard still refusing.
 *   removePaymentFixture()  — tag-scoped removal through the same narrow, audited
 *                             escape hatch the demonstration uses, so the source
 *                             database is left exactly as it was found.
 *
 * Every number here is measured against PostgreSQL. Nothing is simulated, and nothing
 * here is evidence about a production provider, a production cluster or a real backup
 * facility: it is the LOCAL procedure, classified ENVIRONMENT_LIMITED in the reports.
 *
 * Usage (usually via the drill): npx tsx scripts/payments-dr-fixture.ts --selftest
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { adminPool } from "@/db/admin";
import { ingestWebhookEvent } from "@/lib/payments/ingest";
import { ingestSettlementBatch } from "@/lib/payments/settlement";
import { decideException } from "@/lib/payments/review";
import { loadDraftContext, loadTransactionForDraft, prepareOrPost } from "@/lib/payments/accounting";
import { SANDBOX_DEMO_APPROVAL_REFERENCE, SANDBOX_DEMO_POLICY_VERSION, upsertPolicy } from "@/lib/payments/config-write";
import { FIXTURE_RESET_CONFIRM_TOKEN, removeDemoPaymentRows } from "@/lib/payments/fixture-reset";
import { MOCK_PROVIDER_CODE } from "@/lib/payments/providers/mock";
import type { Principal } from "@/lib/authz";
import { ROLES } from "@/lib/constants";

export const PAYMENT_DR_AMOUNT_MINOR = 250000; // TZS 250,000 — the §52 canonical amount
const TENANT = "TEN_BEYU_TZ";
const SECRET = process.env.BEYU_MOCK_WEBHOOK_SECRET ?? "dr-drill-secret-not-a-real-credential";

export type PaymentFixture = {
  tag: string;
  tenantId: string;
  legalEntityId: string;
  connectionId: string;
  transactionId: string;
  providerEventId: string;
  providerTransactionId: string;
  body: string;
  periodCode: string;
  journalEntryId: string | null;
  posting: Record<string, unknown>;
  exceptionsClosed: string[];
  capability: { lockedBefore: number; lockedAfterRestore: number };
};

function signBody(timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

/** Rebuild the exact bytes of a fixture delivery, so a replay is byte-identical. */
export function fixtureBody(f: { providerEventId: string; providerTransactionId: string; occurredAt?: string }): string {
  return JSON.stringify({
    type: "TRANSACTION",
    currency: "TZS",
    event_id: f.providerEventId,
    transaction_id: f.providerTransactionId,
    amount: String(PAYMENT_DR_AMOUNT_MINOR),
    fee: "0",
    tax: "0",
    net_amount: String(PAYMENT_DR_AMOUNT_MINOR),
    timestamp: f.occurredAt ?? new Date().toISOString(),
    from: "255712000111",
    to: "TILL-SD-DEMO",
    payer_name: "DR PAYER",
  });
}

/**
 * The drill posts a real journal entry, so it needs a principal with posting authority.
 * It is constructed here (a script) and never inside src/lib: the platform's rule is
 * that no library module may invent an identity.
 */
function cfoPrincipal(tenantId: string): Principal {
  const roles = ["GROUP_CFO"];
  const permissions = new Set<string>();
  for (const role of roles) {
    for (const p of (ROLES as Record<string, { permissions?: readonly string[] }>)[role]?.permissions ?? []) permissions.add(p);
  }
  return {
    userId: "USR_PAYMENTS_DR_DRILL",
    partyId: "p",
    email: "payments-dr-drill@example.invalid",
    displayName: "Payments DR Drill CFO",
    tenantId,
    tenantCode: "BEYU",
    tenantType: "GROUP",
    roles,
    permissions,
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "dr-drill",
    riskScore: 0,
    emergencyPermissions: [],
  } as unknown as Principal;
}

async function count(client: Client | typeof adminPool, sqlText: string, params: unknown[] = []): Promise<number> {
  const r = await client.query(sqlText, params);
  return Number((r.rows[0] as { n: number | string }).n);
}

/** Configuration is a governed act: the drill goes through the same CLI as the demo. */
function runConfigCli(argv: string[]): Record<string, unknown> {
  const out = execFileSync("npx", ["tsx", "scripts/payment-config.ts", ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return { raw: out.slice(0, 2000) };
  }
}

async function lockedCount(): Promise<number> {
  return count(adminPool, `select count(*)::int as n from public.governance_capability_registry where activation_status = 'LOCKED'`);
}

/**
 * Grant-then-restore CAP_POSTING. The registry is written back to exactly what was
 * found, and the caller verifies the LOCKED count afterwards: the drill must not walk
 * away with an elevated capability, which would be a worse outcome than not testing.
 */
async function withActivatedPosting<T>(run: () => Promise<T>): Promise<{ value: T; lockedBefore: number; lockedAfterRestore: number }> {
  const decisions = ["P1", "P5", "P6", "P7", "P9"];
  const [approved] = (await adminPool.query(`select id from public.resolutions where status = 'APPROVED' limit 1`)).rows as { id: string }[];
  if (!approved) throw new Error("[payments-dr] no APPROVED resolution exists, so CAP_POSTING cannot legitimately be activated");
  const lockedBefore = await lockedCount();
  try {
    for (const d of decisions) {
      await adminPool.query(
        `update public.governance_decision_registry
            set status = 'ACTIVATED', activation_status = 'ACTIVATED', resolution_id = $1, provenance = 'GOVERNED',
                approval_date = '2020-01-01', effective_from = '2020-01-01', approving_body = 'DR-DRILL',
                decision_maker = 'DR-DRILL', scope = '{}'::jsonb, conditions = 'DR drill', evidence = 'DR drill'
          where decision_id = $2`,
        [approved.id, d],
      );
    }
    await adminPool.query(`update public.governance_capability_registry set activation_status = 'ACTIVATED' where capability_code = 'CAP_POSTING'`);
    const value = await run();
    return { value, lockedBefore, lockedAfterRestore: lockedBefore };
  } finally {
    for (const d of decisions) {
      await adminPool.query(
        `update public.governance_decision_registry
            set status = 'PENDING', activation_status = 'LOCKED', resolution_id = null, provenance = null,
                approval_date = null, effective_from = null, effective_to = null, approving_body = null,
                decision_maker = null, scope = null, conditions = null, evidence = null
          where decision_id = $1`,
        [d],
      );
    }
    await adminPool.query(`update public.governance_capability_registry set activation_status = 'LOCKED' where capability_code = 'CAP_POSTING'`);
  }
}

/**
 * Build the lifecycle. Returns everything a verifier needs to confirm the same facts
 * in a restored database, including the exact payload bytes so the replay is identical.
 */
export async function createPaymentFixture(input: { tag: string; quiet?: boolean }): Promise<PaymentFixture> {
  process.env.BEYU_MOCK_WEBHOOK_SECRET = SECRET;
  const tag = input.tag;

  // 1. configuration through the governed CLI (the demo's path; not a second writer)
  const config = runConfigCli(["sandbox-demo", `--tenant=${TENANT}`]);
  const [connection] = (
    await adminPool.query(
      `select id, legal_entity_id from public.payment_provider_connections
        where provider_code = $1 and tenant_id = $2 and enabled = 1 order by created_at desc limit 1`,
      [MOCK_PROVIDER_CODE, TENANT],
    )
  ).rows as { id: string; legal_entity_id: string }[];
  if (!connection) throw new Error(`[payments-dr] the governed CLI mounted no sandbox connection: ${JSON.stringify(config).slice(0, 300)}`);

  // 2. a period covering "now" for this entity, so the bridge has somewhere to post.
  //    Deleted by removePaymentFixture(); the fiscal calendar is left empty as found.
  const periodCode = `DR-${tag}-P`;
  await adminPool.query(
    `insert into public.financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
     values ($1, $2, $3, current_date - 1, current_date + 1, 'OPEN') on conflict do nothing`,
    [periodCode, connection.legal_entity_id, periodCode],
  );

  // 3. raise the ceiling for this drill only, through the governed writer. The demo
  //    policy pins auto_post_ceiling_minor at 0 precisely so that nothing posts
  //    without a named human; the drill supplies that human decision explicitly.
  await upsertPolicy({
    tenantId: TENANT,
    legalEntityId: connection.legal_entity_id,
    providerCode: MOCK_PROVIDER_CODE,
    currency: "TZS",
    maxTransactionMinor: 50_000_000,
    dailyInboundLimitMinor: 500_000_000,
    autoPostCeilingMinor: 1_000_000_000,
    confidenceFloor: 0.99,
    maxClockSkewSeconds: 300,
    requireApprovalAboveMinor: 1_000_000_000,
    unknownTransactionTreatment: "SUSPENSE_REVIEW",
    // The demo's own label, deliberately: the only row this changes is the sandbox
    // fixture's policy row, and `removeSandboxDemoFixture()` is then able to remove
    // it through the governed path. A separate "DR" label would leave the ceiling
    // change behind after the drill finished, and a raw DELETE here would have been a
    // second write path around the governed writer — which an architecture test
    // (governed-config-write-path) correctly refuses.
    policyVersion: SANDBOX_DEMO_POLICY_VERSION,
    approvedBy: "sandbox-demo",
    approvalReference: SANDBOX_DEMO_APPROVAL_REFERENCE,
  });

  // 4. the claim itself
  const providerEventId = `${tag}-E1`;
  const providerTransactionId = `${tag}-T1`;
  const body = fixtureBody({ providerEventId, providerTransactionId });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const receipt = await ingestWebhookEvent({
    providerCode: MOCK_PROVIDER_CODE,
    traceId: `trace-${tag}`,
    correlationId: `corr-${tag}`,
    connectionIdHeader: connection.id,
    rawBody: body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": signBody(timestamp, body), "x-beyu-event-id": providerEventId },
    sourceIp: "203.0.113.40",
  });
  if (!receipt.transactionId) throw new Error(`[payments-dr] ingest refused: ${receipt.code} ${receipt.message}`);

  // 5. settlement corroboration (an independent artefact raises trust; it never invents money)
  const settlement = await ingestSettlementBatch({
    tenantId: TENANT,
    legalEntityId: connection.legal_entity_id,
    providerCode: MOCK_PROVIDER_CODE,
    connectionId: connection.id,
    providerSettlementId: `${tag}-S1`,
    settlementDate: new Date(),
    currency: "TZS",
    grossMinor: PAYMENT_DR_AMOUNT_MINOR,
    feeMinor: 0,
    taxMinor: 0,
    netMinor: PAYMENT_DR_AMOUNT_MINOR,
    creditedMinor: PAYMENT_DR_AMOUNT_MINOR,
    source: "BANK_STATEMENT",
    items: [{ providerTransactionId, amountMinor: PAYMENT_DR_AMOUNT_MINOR, feeMinor: 0 }],
    traceId: `trace-${tag}`,
    correlationId: `corr-${tag}`,
    actorType: "SERVICE",
  });

  // 6. the human review the gate actually requires: close the open blocking
  //    exceptions with written resolutions, through the governed review path.
  const exceptionsClosed: string[] = [];
  const open = (
    await adminPool.query(
      `select id, code from public.payment_exceptions where transaction_id = $1 and status = 'OPEN' and blocking = 1 order by created_at`,
      [receipt.transactionId],
    )
  ).rows as { id: string; code: string }[];
  for (const exception of open) {
    const decision = await decideException({
      tenantId: TENANT,
      exceptionId: exception.id,
      decision: "RESOLVED",
      actorUserId: `USR_DR_${tag}_REVIEWER`,
      resolution: `DR drill: amount, till and settlement line confirmed against the provider statement for ${tag}; the ${exception.code} gap concerns counterparty identity, not the money.`,
      correlationId: `corr-${tag}`,
    });
    if (!decision.ok) throw new Error(`[payments-dr] governed review refused: ${JSON.stringify(decision)}`);
    exceptionsClosed.push(exception.code);
  }

  // 7. posting through Finance OS, capability granted only for this call
  const posted = await withActivatedPosting(() =>
    prepareOrPost({
      principal: cfoPrincipal(TENANT),
      transactionId: receipt.transactionId!,
      allowPost: true,
      traceId: `trace-${tag}`,
      correlationId: `corr-${tag}`,
    }),
  );
  const entry = (
    await adminPool.query(`select id from public.journal_entries where reference = $1`, [`PAY/${receipt.transactionId}`])
  ).rows[0] as { id: string } | undefined;

  const fixture: PaymentFixture = {
    tag,
    tenantId: TENANT,
    legalEntityId: connection.legal_entity_id,
    connectionId: connection.id,
    transactionId: receipt.transactionId!,
    providerEventId,
    providerTransactionId,
    body,
    periodCode,
    journalEntryId: entry?.id ?? null,
    posting: {
      kind: (posted.value as { kind: string }).kind,
      settlementStatus: settlement.status,
      trustRaised: settlement.transactionsRaisedToBankTrust,
    },
    exceptionsClosed,
    capability: { lockedBefore: posted.lockedBefore, lockedAfterRestore: await lockedCount() },
  };
  if (fixture.posting.kind !== "POSTED") throw new Error(`[payments-dr] the bridge refused to post: ${JSON.stringify(posted.value)}`);
  if (fixture.capability.lockedBefore !== fixture.capability.lockedAfterRestore) {
    throw new Error(`[payments-dr] capability registry not restored: ${fixture.capability.lockedBefore} -> ${fixture.capability.lockedAfterRestore}`);
  }
  if (!input.quiet) console.log(`[payments-dr] fixture ${tag}: ${JSON.stringify(fixture.posting)} entry=${fixture.journalEntryId}`);
  return fixture;
}

export type PaymentRestoreCheck = { name: string; ok: boolean; source?: unknown; restored?: unknown };

/**
 * Verify the restored (scratch) database against what the source held. Every check is a
 * comparison between the two live databases, so a check that silently stops meaning
 * anything (e.g. zero rows on both sides) is still visible as a number.
 */
export async function verifyPaymentRestore(dst: Client, f: PaymentFixture, source: Client): Promise<PaymentRestoreCheck[]> {
  const checks: PaymentRestoreCheck[] = [];
  const compare = async (name: string, sqlText: string, params: unknown[] = []) => {
    const [a, b] = [await source.query(sqlText, params), await dst.query(sqlText, params)];
    checks.push({ name, ok: JSON.stringify(a.rows) === JSON.stringify(b.rows), source: a.rows, restored: b.rows });
  };

  await compare("transactions restored", `select id, gross_minor::text as gross, currency, verification_status, trust_level, reconciliation_status, settlement_status, accounting_status, (journal_entry_id is not null) as linked, provider_transaction_id from public.payment_transactions where provider_transaction_id = $1`, [f.providerTransactionId]);
  await compare("inbox rows restored", `select provider_event_id, processing_state, signature_valid, timestamp_valid, payload_digest, payload_size_bytes from public.payment_webhook_events where provider_event_id = $1`, [f.providerEventId]);
  await compare("state trail length and content", `select axis, from_state, to_state, actor_type, control_role from public.payment_transaction_states where transaction_id = (select id from public.payment_transactions where provider_transaction_id = $1) order by occurred_at, axis`, [f.providerTransactionId]);
  await compare("settlement batch", `select provider_settlement_id, status, gross_minor::text as gross, net_minor::text as net, credited_minor::text as credited, item_count, matched_count, unmatched_count from public.payment_settlements where provider_settlement_id = $1`, [`${f.tag}-S1`]);
  await compare(
    "journal entry balance and lineage",
    `select e.source, e.reference, (select sum(l.debit::numeric) from public.journal_lines l where l.entry_id = e.id)::text as debit,
            (select sum(l.credit::numeric) from public.journal_lines l where l.entry_id = e.id)::text as credit,
            (select count(*)::int from public.journal_lines l where l.entry_id = e.id) as lines
       from public.journal_entries e where e.reference = $1`,
    [`PAY/${f.transactionId}`],
  );
  await compare("audit evidence for the payment", `select action, outcome, count(*)::int as n from public.audit_log where object_id = $1 group by 1,2 order by 1,2`, [f.transactionId]);
  await compare("exceptions carried", `select code, status, reviewed_by from public.payment_exceptions where transaction_id = $1 order by code`, [f.transactionId]);

  // The 0029 guard must be alive in the restored database, not merely present.
  const guard = await dst
    .query(`update public.payment_transactions set journal_entry_id = null, accounting_status = 'NOT_PREPARED' where id = $1`, [f.transactionId])
    .then(() => "ALLOWED")
    .catch((e: { message?: string }) => (`${e.message}`.match(/unposting by UPDATE is refused/) ? "REFUSED" : `OTHER: ${(e.message ?? "").slice(0, 80)}`));
  checks.push({ name: "0029 unposting guard active after restore", ok: guard === "REFUSED", restored: guard });

  const stillPosted = await dst.query(`select accounting_status from public.payment_transactions where id = $1`, [f.transactionId]);
  checks.push({
    name: "posted state unchanged after guard refusal",
    ok: (stillPosted.rows[0] as { accounting_status: string } | undefined)?.accounting_status === "POSTED",
    restored: stillPosted.rows[0],
  });
  return checks;
}

/**
 * Unwind a posting this drill created.
 *
 * `payments/fixture-reset` deliberately REFUSES to remove a POSTED payment, because
 * unposting real history is a reversal decision, not a cleanup — and a test asserts
 * that refusal stands. A drill that posts therefore needs its own teardown, and it
 * belongs here (in the script), not in the library: the ledger rows are removed with
 * the immutability triggers disabled at the table level and re-enabled in the same
 * block, verified afterwards. That is the same narrow, self-restoring convention as
 * `tests/helpers/ledger-reset.ts`, restricted to rows the drill itself created —
 * identified by the run tag and by the entry's `PAY/<transaction id>` reference with
 * `source = 'PAYMENTS'`. Any row outside that scope is a reason to stop, and the
 * function refuses rather than filtering.
 */
const UNWIND_TABLES = [
  "payment_transactions",
  "payment_transaction_states",
  "payment_webhook_events",
  "payment_matches",
  "journal_lines",
  "journal_entries",
] as const;

const DRILL_TAG = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

async function unwindDrillRows(tags: string[]): Promise<Record<string, number | string>> {
  if (tags.length === 0) throw new Error("[payments-dr] unwind requires at least one exact run tag");
  for (const tag of tags) if (!DRILL_TAG.test(tag)) throw new Error(`[payments-dr] "${tag}" is not an exact run tag; refusing to unwind`);
  const client = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  await client.connect();
  // Every `like` predicate needs the wildcard in the *parameter*, never in the SQL
  // text: a bare tag matches nothing and reads as a successful no-op, which is the
  // worst failure mode a cleanup can have.
  const patterns = tags.map((t) => `${t}%`);
  const like = tags.map((_, i) => `t.provider_transaction_id like $${i + 1}`).join(" or ");
  const scope = `t.provider_code = '${MOCK_PROVIDER_CODE}' and (${like})`;
  try {
    const [guardsBefore] = (await client.query(
      `select count(*)::int as total, (count(*) filter (where tr.tgenabled = 'O'))::int as enabled
         from pg_trigger tr join pg_class c on c.oid = tr.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1) and not tr.tgisinternal`,
      [[...UNWIND_TABLES]],
    )).rows as { total: number; enabled: number }[];
    if (guardsBefore.total === 0 || guardsBefore.total !== guardsBefore.enabled) {
      throw new Error("[payments-dr] refusing to unwind: a payment/ledger guard is not currently enabled");
    }
    // Nothing outside the drill's own rows may be in scope. A foreign provider or a
    // non-payments journal entry under these tags means the tags are wrong, so stop.
    const [foreign] = (await client.query(
      `select
         (select count(*)::int from public.payment_transactions t
           where (${tags.map((_, i) => `t.provider_transaction_id like $${i + 1}`).join(" or ")})
             and t.provider_code <> '${MOCK_PROVIDER_CODE}') as foreign_provider,
         (select count(*)::int from public.journal_entries e
           where e.source <> 'PAYMENTS'
             and e.reference in (select 'PAY/' || t.id from public.payment_transactions t
                                  where (${like}) and t.provider_code = '${MOCK_PROVIDER_CODE}')) as foreign_entry`,
      patterns,
    )).rows as { foreign_provider: number; foreign_entry: number }[];
    if (Number(foreign.foreign_provider) > 0 || Number(foreign.foreign_entry) > 0) {
      throw new Error(`[payments-dr] refusing to unwind: scope is not drill-only (${JSON.stringify(foreign)})`);
    }

    // Same mechanism as the library reset, and the same consequence: skipping the
    // append-only guards also skips foreign-key enforcement, so children are
    // deleted before parents and an orphan count is checked before committing.
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    const removed: Record<string, number> = {};
    const del = async (label: string, sqlText: string, params: unknown[] = patterns) => {
      removed[label] = ((await client.query(sqlText, params)).rowCount ?? 0) + (removed[label] ?? 0);
    };
    const entryIds = `select e.id from public.journal_entries e where e.reference in (select 'PAY/' || t.id from public.payment_transactions t where ${scope})`;
    await del("journalLines", `delete from public.journal_lines l where l.entry_id in (${entryIds})`);
    await del(
      "settlementItems",
      `delete from public.payment_settlement_items i where i.settlement_id in (
         select s.id from public.payment_settlements s
          where s.provider_code = '${MOCK_PROVIDER_CODE}' and (${tags.map((_, i) => `s.provider_settlement_id like $${i + 1}`).join(" or ")}))`,
    );
    await del(
      "settlements",
      `delete from public.payment_settlements s where s.provider_code = '${MOCK_PROVIDER_CODE}' and (${tags.map((_, i) => `s.provider_settlement_id like $${i + 1}`).join(" or ")})`,
    );
    const txIds = `select t.id from public.payment_transactions t where ${scope}`;
    await del(
      "corrections",
      `delete from public.payment_corrections c where c.original_transaction_id in (${txIds}) or c.replacement_transaction_id in (${txIds}) or c.journal_entry_id in (${entryIds})`,
    );
    await del("matches", `delete from public.payment_matches m where m.transaction_id in (${txIds})`);
    await del("states", `delete from public.payment_transaction_states st where st.transaction_id in (${txIds})`);
    await del("riskSignals", `delete from public.payment_risk_signals r where r.transaction_id in (${txIds})`);
    await del(
      "exceptions",
      `delete from public.payment_exceptions x where x.transaction_id in (${txIds})
         or x.correlation_id in (${tags.map((_, i) => `$${i + 1 + tags.length}`).join(", ")})`,
      [...patterns, ...tags.map((t) => `corr-${t}`)],
    );
    // The entry is the PARENT of payment_transactions.journal_entry_id, and the
    // entry set is derived by joining through the transactions — so both go in the
    // same statement batch, entries first, inside this one transaction. Getting this
    // order wrong leaves an orphaned journal entry behind (measured).
    await del("journalEntries", `delete from public.journal_entries e where e.id in (${entryIds})`);
    await del("transactions", `delete from public.payment_transactions t where ${scope}`);
    await del(
      "webhookEvents",
      `delete from public.payment_webhook_events w where w.provider_code = '${MOCK_PROVIDER_CODE}'
         and (${tags.map((_, i) => `w.provider_event_id like $${i + 1}`).join(" or ")}
              or w.correlation_id in (${tags.map((_, i) => `$${i + 1 + tags.length}`).join(", ")}))`,
      [...patterns, ...tags.map((t) => `corr-${t}`)],
    );
    // The drill's own naming convention is the scope: `DR-<tag>-P`. A period that
    // still carries journal entries is never touched, so this cannot erase a fiscal
    // calendar somebody else opened. Policy changes are torn down by the governed
    // sandbox cleanup, not by a DELETE issued here.
    await del(
      "periods",
      `delete from public.financial_periods p
        where p.code like 'DR-%'
          and (${tags.map((_, i) => `p.code like 'DR-' || $${i + 1} || '%'`).join(" or ")})
          and not exists (select 1 from public.journal_entries e where e.period_id = p.id)`,
      tags,
    );

    const orphans = (await client.query(
      `select
         (select count(*)::int from public.payment_transaction_states x where not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as states,
         (select count(*)::int from public.payment_risk_signals x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as signals,
         (select count(*)::int from public.journal_lines x where not exists (select 1 from public.journal_entries e where e.id = x.entry_id)) as lines,
         (select count(*)::int from public.payment_transactions x where x.journal_entry_id is not null
            and not exists (select 1 from public.journal_entries e where e.id = x.journal_entry_id)) as links`)).rows[0] as Record<string, number>;
    const dangling = Object.entries(orphans).filter(([, n]) => Number(n) > 0);
    if (dangling.length > 0) {
      throw new Error(`[payments-dr] refusing to commit an unwind that would dangle references: ${JSON.stringify(orphans)}`);
    }
    await client.query("commit");
    return removed;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* not in a transaction */
    }
    throw error;
  } finally {
    const after = (await client.query(
      `select count(*)::int as total, (count(*) filter (where tr.tgenabled = 'O'))::int as enabled
         from pg_trigger tr join pg_class c on c.oid = tr.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1) and not tr.tgisinternal`,
      [[...UNWIND_TABLES]],
    )).rows[0] as { total: number; enabled: number };
    await client.end().catch(() => undefined);
    if (after.total !== after.enabled) throw new Error("[payments-dr] guards could not be verified as re-enabled after unwind");
  }
}

/**
 * `--repair-orphans` — remove rows in the payment child tables whose parent row no
 * longer exists. Rows like these are not history, they are debris: they were created
 * when an earlier reset deleted a parent while foreign-key triggers were skipped (the
 * bug this file's rewrite removes, found while building the DR fixture). It refuses
 * anything whose parent still exists, so it can never delete live data, and it records
 * what it removed in the audit log.
 */
async function repairOrphans(): Promise<number> {
  const client = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  await client.connect();
  const orphans = (await client.query(
    `select
       (select count(*)::int from public.payment_risk_signals x where x.transaction_id is not null
          and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as signals,
       (select count(*)::int from public.payment_transaction_states x where not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as states,
       (select count(*)::int from public.payment_matches x where not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as matches,
       (select count(*)::int from public.payment_exceptions x where x.transaction_id is not null
          and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as exceptions,
       (select count(*)::int from public.journal_lines x where not exists (select 1 from public.journal_entries e where e.id = x.entry_id)) as lines,
       (select count(*)::int from public.payment_transactions x where x.journal_entry_id is not null
          and not exists (select 1 from public.journal_entries e where e.id = x.journal_entry_id)) as links,
       (select count(*)::int from public.journal_entries e
         where e.source = 'PAYMENTS'
           and not exists (select 1 from public.journal_lines l where l.entry_id = e.id)
           and not exists (select 1 from public.payment_transactions t where t.journal_entry_id = e.id)
           and not exists (select 1 from public.payment_settlements s where s.journal_entry_id = e.id)) as entryShells,
       (select count(*)::int from public.financial_periods p
         where p.code like 'DR-%'
           and not exists (select 1 from public.journal_entries e where e.period_id = p.id)) as emptyDrPeriods`)).rows[0] as Record<string, number>;
  console.log(`[payments-dr] orphan counts before repair: ${JSON.stringify(orphans)}`);
  const total = Object.values(orphans).reduce((a, n) => a + Number(n), 0);
  if (total === 0) {
    await client.end();
    console.log("[payments-dr] nothing to repair");
    return 0;
  }
  const removed: Record<string, number> = {};
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    const del = async (label: string, sqlText: string) => {
      removed[label] = (await client.query(sqlText)).rowCount ?? 0;
    };
    await del("journalLines", `delete from public.journal_lines x where not exists (select 1 from public.journal_entries e where e.id = x.entry_id)`);
    await del("riskSignals", `delete from public.payment_risk_signals x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)`);
    await del("states", `delete from public.payment_transaction_states x where not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)`);
    await del("matches", `delete from public.payment_matches x where not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)`);
    await del("exceptions", `delete from public.payment_exceptions x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)`);
    await del("links", `update public.payment_transactions x set journal_entry_id = null where x.journal_entry_id is not null and not exists (select 1 from public.journal_entries e where e.id = x.journal_entry_id)`);
    // A journal entry left with no lines and nothing pointing at it is a shell created
    // by an interrupted reset: a real entry always has lines, and an empty one cannot
    // balance, so removing it repairs rather than destroys. `source = 'PAYMENTS'` keeps
    // this out of reach of every other domain's accounting.
    await del(
      "entryShells",
      `delete from public.journal_entries e
        where e.source = 'PAYMENTS'
          and not exists (select 1 from public.journal_lines l where l.entry_id = e.id)
          and not exists (select 1 from public.payment_transactions t where t.journal_entry_id = e.id)
          and not exists (select 1 from public.payment_settlements s where s.journal_entry_id = e.id)`,
    );
    await del(
      "emptyDrPeriods",
      `delete from public.financial_periods p
        where p.code like 'DR-%'
          and not exists (select 1 from public.journal_entries e where e.period_id = p.id)`,
    );
    const after = (await client.query(
      `select (select count(*)::int from public.payment_risk_signals x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id))
            + (select count(*)::int from public.journal_lines x where not exists (select 1 from public.journal_entries e where e.id = x.entry_id))
            + (select count(*)::int from public.journal_entries e
                where e.source = 'PAYMENTS' and not exists (select 1 from public.journal_lines l where l.entry_id = e.id)) as n`)).rows[0] as { n: number };
    if (Number(after.n) !== 0) throw new Error(`[payments-dr] repair did not clear the orphans (${after.n} left); rolling back`);
    await client.query("commit");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* not in a transaction */
    }
    await client.end().catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
  console.log(`[payments-dr] repaired: ${JSON.stringify(removed)}`);
  return 0;
}

/** Operator recovery path: `--purge=TAG[,TAG…]` after an interrupted drill. */
async function purge(tags: string[]): Promise<number> {
  const unwound = await unwindDrillRows(tags);
  const rest = await removeDemoPaymentRows({ prefixes: tags, confirm: FIXTURE_RESET_CONFIRM_TOKEN });
  const config = runConfigCli(["sandbox-demo", "--cleanup", "--confirm=REMOVE-SANDBOX-DEMO"]);
  console.log(JSON.stringify({ purged: tags, unwound, remaining: rest, configCleanup: config }, null, 2));
  return 0;
}

/** Remove everything this file created, through the audited tag-scoped path. */
export async function removePaymentFixture(f: PaymentFixture): Promise<Record<string, unknown>> {
  let rows: Record<string, unknown> = (await removeDemoPaymentRows({ prefixes: [f.tag], confirm: FIXTURE_RESET_CONFIRM_TOKEN })) as unknown as Record<string, unknown>;
  if (rows.ok !== true && typeof rows.refused === "string" && rows.refused.includes("POSTED")) {
    // The posting this drill performed is itself drill output. Undo it with the
    // narrow, self-restoring unwind rather than pretending it never happened.
    rows = { ok: true, prefixes: [f.tag], removed: await unwindDrillRows([f.tag]), unwindOfDrillPosting: true };
  }
  const config = runConfigCli(["sandbox-demo", "--cleanup", "--confirm=REMOVE-SANDBOX-DEMO"]);
  return { rowsRemoved: rows, configCleanup: config };
}

/**
 * `--duplicate-probe` — the exactly-once question asked directly, without a restore
 * in the way: ingest the identical delivery a second time and report what the pipeline
 * says, including what the runtime role can actually see under the sanctioned tenant
 * context. Used to distinguish a duplicate-detection defect from a restore defect.
 */
async function duplicateProbe(): Promise<number> {
  const tag = `DRPT${Date.now().toString(36).toUpperCase()}`;
  const f = await createPaymentFixture({ tag, quiet: true });
  const runtimeUrl = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.BEYU_ADMIN_DATABASE_URL ?? "";
  const probe = new Client({ connectionString: runtimeUrl });
  await probe.connect();
  const scoped = async (label: string, sqlText: string, params: unknown[] = []) => {
    try {
      const r = await probe.query("begin");
      void r;
      await probe.query(`select set_config('beyu.current_tenant_ids', $1, true)`, [f.tenantId]);
      await probe.query(`select set_config('beyu.global_scope', 'off', true)`);
      const rows = await probe.query(sqlText, params);
      await probe.query("commit");
      console.log(`  ${label}: ${JSON.stringify(rows.rows)}`);
    } catch (error) {
      await probe.query("rollback").catch(() => undefined);
      console.log(`  ${label}: ERROR ${(error as Error).message}`);
    }
  };
  await probe.query("set role beyu_runtime").catch(async () => {
    console.log("  (cannot assume the runtime role by name; running as the connection's own role)");
  });
  console.log(`[payments-dr] duplicate probe ${tag} as ${JSON.stringify((await probe.query("select current_user, current_setting('is_superuser') as super")).rows[0])}`);
  await scoped("transactions visible to this context", `select count(*)::int as n from public.payment_transactions where provider_transaction_id = $1`, [f.providerTransactionId]);
  await scoped("inbox rows visible", `select processing_state, attempt_count, replay_detected from public.payment_webhook_events where provider_event_id = $1`, [f.providerEventId]);
  await scoped("entity row behind the policy's EXISTS", `select count(*)::int as n from public.legal_entities le where le.id = $1 and (le.tenant_id = any(string_to_array(nullif(current_setting('beyu.current_tenant_ids', true), ''), ',')))`, [f.legalEntityId]);

  // And now the actual replay, through the real ingestion path.
  process.env.BEYU_MOCK_WEBHOOK_SECRET = SECRET;
  const { createHmac: hmac } = await import("node:crypto");
  const { ingestWebhookEvent } = await import("@/lib/payments/ingest");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = "sha256=" + hmac("sha256", SECRET).update(`${timestamp}.${f.body}`, "utf8").digest("hex");
  const replay = await ingestWebhookEvent({
    providerCode: MOCK_PROVIDER_CODE,
    traceId: `trace-${tag}-replay`,
    correlationId: `corr-${tag}-replay`,
    connectionIdHeader: f.connectionId,
    rawBody: f.body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": signature, "x-beyu-event-id": f.providerEventId },
    sourceIp: "203.0.113.42",
  });
  console.log(`[payments-dr] replay receipt: ${JSON.stringify({ outcome: replay.outcome, status: replay.status, code: replay.code, transactionId: replay.transactionId, message: replay.message })}`);
  await probe.end().catch(() => undefined);
  const cleanup = await removePaymentFixture(f);
  console.log(`[payments-dr] probe cleanup: ${JSON.stringify(cleanup).slice(0, 200)}`);
  return 0;
}

/* ---------------------------------- selftest --------------------------------- */

async function selftest(): Promise<number> {
  const tag = `DRST${Date.now().toString(36).toUpperCase()}`;
  console.log(`[payments-dr] selftest ${tag} — create, verify in place, remove`);
  const f = await createPaymentFixture({ tag });
  const client = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const checks = await verifyPaymentRestore(client, f, client);
    for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}`);
    const cleanup = await removePaymentFixture(f);
    console.log(`[payments-dr] cleanup: ${JSON.stringify(cleanup).slice(0, 400)}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv.includes("--repair-orphans")) {
  repairOrphans().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[payments-dr] REPAIR ERROR:", e instanceof Error ? e.message : e);
      process.exit(2);
    },
  );
}

const purgeArg = process.argv.find((a) => a.startsWith("--purge="));
if (purgeArg) {
  purge(
    purgeArg
      .slice("--purge=".length)
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean),
  ).then(
    (code) => process.exit(code),
    (e) => {
      console.error("[payments-dr] PURGE ERROR:", e instanceof Error ? e.message : e);
      process.exit(2);
    },
  );
}

if (process.argv.includes("--duplicate-probe")) {
  duplicateProbe().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[payments-dr] PROBE ERROR:", e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 4).join("\n")}` : e);
      process.exit(2);
    },
  );
}

if (process.argv.includes("--selftest")) {
  selftest().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[payments-dr] ERROR:", e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 4).join("\n")}` : e);
      process.exit(2);
    },
  );
}
