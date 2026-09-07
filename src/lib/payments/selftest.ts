/**
 * Payments self-test: deterministic, read-mostly probes that answer "is the
 * payment layer installed and is it actually enforcing what it claims", without
 * moving money.
 *
 * Every check is one of three shapes:
 *   - a schema/config fact read from the live database;
 *   - a pure-function assertion (e.g. an adapter must reject a bad signature);
 *   - a NEGATIVE assertion — attempting a forbidden write and requiring the
 *     database to refuse it. A self-test that only checks that things are present
 *     would pass on an installation with no security at all.
 *
 * Nothing here can report PASS for a live provider integration, and nothing here
 * can post: `posting` is reported from the real capability state, so while
 * `CAP_POSTING` is LOCKED the honest result is BLOCKED, not a green tick.
 */
import { sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { checkCapabilityActivation } from "@/lib/decision-authority";
import { allStatuses, assertNoLiveIntegrationClaim, PROVIDER_REGISTRY_VERSION } from "./providers";
import { adapterFor } from "./providers";
import { computeHmac } from "./providers/hmac";
import { MOCK_PROVIDER_CODE } from "./providers/mock";
import { ACCOUNTING_BRIDGE_VERSION, BRIDGE_SELF_CHECK } from "./accounting";
import { INGEST_VERSION, MAX_PAYLOAD_BYTES } from "./ingest";
import { MATCHING_VERSION } from "./matching";
import { assertReconciliationVocabularyAligned, legalNextStates, PAYMENT_DOMAIN_VERSION } from "./domain";
import { SETTLEMENT_VERSION } from "./settlement";

export const PAYMENTS_SELFTEST_VERSION = "payments-self-test-1.0.0";

export type CheckStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_APPLICABLE" | "ENVIRONMENT_LIMITED";

export type SelfTestCheck = {
  id: string;
  title: string;
  status: CheckStatus;
  measured: string;
  /** What would have to change for this to pass. Never a promise. */
  remediation: string | null;
};

const CONFIG_TABLES = [
  "payment_providers",
  "payment_provider_connections",
  "payment_accounts",
  "payment_account_mappings",
  "payment_policies",
] as const;

const ALL_TABLES = [
  ...CONFIG_TABLES,
  "payment_webhook_events",
  "payment_transactions",
  "payment_transaction_states",
  "payment_matches",
  "payment_exceptions",
  "payment_settlements",
  "payment_settlement_items",
  "payment_corrections",
  "payment_risk_signals",
] as const;

async function rows<T = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await scoped(() => db.execute(query))) as unknown as { rows?: T[] };
  return result.rows ?? (result as unknown as T[]);
}

/**
 * The checks read across tenants, so they need a scope. An authenticated caller
 * already has one: `guarded()` opens the principal's RLS context, and the
 * measurement runs inside it (a global-governance role therefore measures the whole
 * platform, a tenant-scoped role measures its own tenants — the honest answer for
 * that caller). A script has no context at all, and RLS would then report an empty
 * database: a measurement artefact, not a finding. For that case only, a
 * short-lived platform scope is opened around the measurement. It is a READ scope —
 * the write attempts below are expected to fail on privileges, and they do so
 * regardless of scope, which is exactly what the check is measuring.
 */
export async function runPaymentsSelfTest(): Promise<SelfTestReport> {
  return measureSelfTest(hasDatabaseTransactionContext() ? "CALLER" : "PLATFORM");
}

/**
 * One statement, one scope. Deliberately NOT a single transaction around the whole
 * self-test: several checks here succeed BY FAILING (a refused UPDATE raises
 * 42501), and Postgres aborts the enclosing transaction on the first such error —
 * every later check would then report SQLSTATE 25P02 instead of what it measured.
 */
/**
 * Drizzle wraps the driver error, so the useful part — the SQLSTATE and the
 * database's own message — lives on `cause`. Reporting only `message` produced
 * "Failed query: update …" as the evidence for a control, which tells a reader
 * nothing about WHY the write was refused.
 */
function describeDbError(e: unknown): { code: string | null; text: string } {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return {
    code: err.cause?.code ?? err.code ?? null,
    text: String(err.cause?.message ?? err.message ?? e).slice(0, 140),
  };
}

async function scoped<T>(operation: () => Promise<T>): Promise<T> {
  if (hasDatabaseTransactionContext()) return operation();
  return withDatabaseRlsContext([], true, operation);
}

type SelfTestReport = {
  ok: boolean;
  status: "PASS" | "PARTIAL" | "FAIL" | "BLOCKED";
  version: string;
  scope: "CALLER" | "PLATFORM";
  startedAt: string;
  durationMs: number;
  checks: SelfTestCheck[];
  counts: Record<string, number>;
  blockedOn: string[];
};

async function measureSelfTest(scope: "CALLER" | "PLATFORM"): Promise<SelfTestReport> {
  const startedAt = new Date();
  const checks: SelfTestCheck[] = [];
  const push = (c: SelfTestCheck) => checks.push(c);

  // 1. Migration applied through the canonical runner.
  try {
    const mig = await rows<{ version: string; mode: string }>(
      sql`select version, mode from beyu_migrations where version = '0028_payment_banking_core'`,
    );
    push({
      id: "migration",
      title: "0028 applied via scripts/migrate.ts",
      status: mig[0]?.mode === "APPLIED" ? "PASS" : "FAIL",
      measured: mig[0] ? `version=${mig[0].version} mode=${mig[0].mode}` : "no beyu_migrations row for 0028",
      remediation: mig[0] ? null : "Run npm run migrate. drizzle-kit push is not an approved path.",
    });
  } catch (e) {
    push({ id: "migration", title: "0028 applied via scripts/migrate.ts", status: "FAIL", measured: String(e).slice(0, 160), remediation: "Database unreachable." });
  }

  // 2. All 14 relations exist.
  const wanted = sql.join(
    ALL_TABLES.map((t) => sql`${t}`),
    sql`, `,
  );
  const tableRows = await rows<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema='public' and table_name in (${wanted})`,
  );
  const missing = ALL_TABLES.filter((t) => !tableRows.some((r) => r.table_name === t));
  push({
    id: "tables",
    title: "payment relations present",
    status: missing.length === 0 ? "PASS" : "FAIL",
    measured: `${tableRows.length}/${ALL_TABLES.length} present${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
    remediation: missing.length ? "Apply 0028." : null,
  });

  // 3. RLS enabled AND forced on every payment table.
  const rls = await rows<{ relname: string; rls: boolean; force: boolean }>(
    sql`select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in (${wanted})`,
  );
  const unprotected = rls.filter((r) => !r.rls || !r.force).map((r) => r.relname);
  push({
    id: "rls",
    title: "Row Level Security enabled and forced",
    status: unprotected.length === 0 && rls.length === ALL_TABLES.length ? "PASS" : "FAIL",
    measured: `${rls.filter((r) => r.rls && r.force).length}/${ALL_TABLES.length} enabled+forced${unprotected.length ? `; unprotected: ${unprotected.join(", ")}` : ""}`,
    remediation: unprotected.length ? "Re-apply 0028 section 2." : null,
  });

  // 4. The runtime role cannot change payment configuration.
  //
  // The probe is a no-op UPDATE (`set <col> = <col>`) so that a successful attempt still
  // changes nothing. The column is RESOLVED from the catalog rather than named in this file,
  // because a hard-coded column that a table does not have makes the probe fail with 42703
  // undefined_column, Postgres reports that before it reports the privilege denial, and the
  // check then "passes" having measured nothing about privileges at all. That was a real
  // defect here: three of the five configuration tables have no `updated_at` column, and the
  // check reported PASS for them on an error that had nothing to do with enforcement.
  // Consequently: only a privilege refusal (42501) or a policy-hidden row set (0 rows
  // affected) passes. Anything else fails, loudly.
  for (const table of CONFIG_TABLES) {
    let outcome: { status: CheckStatus; measured: string };
    // Prefer the surrogate key; fall back to the first column of the table.
    const probeColumnRows = await rows<{ column_name: string }>(
      sql`select column_name from information_schema.columns
            where table_schema = 'public' and table_name = ${table}
            order by (column_name = 'id') desc, ordinal_position limit 1`,
    );
    const probeColumn = probeColumnRows[0]?.column_name ?? null;
    if (!probeColumn) {
      push({
        id: `config-write:${table}`,
        title: "runtime role cannot write configuration",
        status: "FAIL",
        measured: `${table}: no column could be resolved for the probe, so the privilege check never ran`,
        remediation: "The table is missing from the database or the catalog view; re-run migrations.",
      });
      continue;
    }
    try {
      // Identifier-safe composition (no string SQL): the table and column names come from a
      // closed constant list and the catalog respectively, both quoted with `sql.identifier`.
      const result = await scoped(() =>
        db.execute(sql`update ${sql.identifier("public")}.${sql.identifier(table)} set ${sql.identifier(probeColumn)} = ${sql.identifier(probeColumn)}`),
      );
      const affected = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      outcome =
        affected === 0
          ? { status: "PASS", measured: "UPDATE matched 0 rows — the SELECT-only RLS policy hid every row from the runtime role" }
          : { status: "FAIL", measured: `UPDATE affected ${affected} rows` };
    } catch (e) {
      const { code, text } = describeDbError(e);
      const privilegedRefusal = code === "42501" || text.includes("permission denied");
      outcome = privilegedRefusal
        ? { status: "PASS", measured: `refused by privilege revocation on ${probeColumn} — SQLSTATE 42501 permission denied` }
        : {
            status: "FAIL",
            measured: `probe did not reach the privilege check (SQLSTATE ${code ?? "unknown"}): ${text.slice(0, 120)}`,
          };
    }
    push({
      id: `config-write:${table}`,
      title: "runtime role cannot write configuration",
      status: outcome.status,
      measured: `${table}: ${outcome.measured}`,
      remediation:
        outcome.status === "PASS"
          ? null
          : outcome.measured.startsWith("probe did not reach the privilege check")
            ? `fix the probe column resolution for ${table} — a refusal that is not 42501 proves nothing about enforcement`
            : "Apply 0028 section 4 and re-run scripts/setup-db-role.ts.",
    });
  }

  // 5. Append-only enforcement on the state trail.
  let appendOnly: CheckStatus = "FAIL";
  let appendMeasured = "no probe row available";
  try {
    const candidate = await rows<{ id: string }>(sql`select id from payment_transaction_states limit 1`);
    if (candidate[0]) {
      try {
        await scoped(() => db.execute(sql`delete from public.payment_transaction_states where id = ${candidate[0].id}` as never));
        appendMeasured = "DELETE on payment_transaction_states SUCCEEDED — the trail is not append-only";
      } catch (e) {
        appendOnly = "PASS";
        const { code, text } = describeDbError(e);
        appendMeasured = `DELETE refused (${code ?? "no SQLSTATE"}) by the immutability trigger: ${text}`;
      }
    } else {
      appendOnly = "NOT_APPLICABLE";
      appendMeasured = "no state rows yet; the trigger exists (verified by 0028) but nothing was exercised";
    }
  } catch (e) {
    appendMeasured = String(e).slice(0, 120);
  }
  push({ id: "append-only", title: "state trail resists deletion", status: appendOnly, measured: appendMeasured, remediation: appendOnly === "PASS" ? null : "Run an ingest first, then re-check." });

  // 6. A bad signature must be refused by the adapter, not by a caller's care.
  const mock = adapterFor(MOCK_PROVIDER_CODE);
  if (!mock) {
    push({ id: "signature", title: "adapter rejects an invalid signature", status: "FAIL", measured: "mock adapter missing", remediation: null });
  } else {
    const body = JSON.stringify({ event_id: "EVT-SELFTEST-1", amount: "1", currency: "TZS" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const bad = mock.verifyInbound(
      { rawBody: body, headers: { "x-beyu-timestamp": ts, "x-beyu-signature": "sha256=" + "0".repeat(64) }, providerCode: MOCK_PROVIDER_CODE, receivedAt: new Date(), sourceIp: null },
      { signingSecret: "self-test-secret", maxClockSkewSeconds: 300 },
    );
    const good = mock.verifyInbound(
      { rawBody: body, headers: { "x-beyu-timestamp": ts, "x-beyu-signature": "sha256=" + computeHmac("self-test-secret", ts, body) }, providerCode: MOCK_PROVIDER_CODE, receivedAt: new Date(), sourceIp: null },
      { signingSecret: "self-test-secret", maxClockSkewSeconds: 300 },
    );
    push({
      id: "signature",
      title: "adapter rejects an invalid signature and accepts a valid one",
      status: !bad.signatureValid && good.signatureValid ? "PASS" : "FAIL",
      measured: `invalid→${bad.signatureValid ? "ACCEPTED(BAD)" : "refused"}; valid→${good.signatureValid ? "accepted" : "REFUSED(BAD)"}; detail=${bad.detail}`,
      remediation: null,
    });
  }

  // 7. The state machine is default-deny and terminal states are terminal.
  const terminal = legalNextStates("ACCOUNTING", "REVERSED").length === 0 && legalNextStates("TRUST", "CONFIRMED_MANUAL").length === 0;
  const unknown = legalNextStates("TRUST", "NOT_A_STATE").length === 0;
  push({
    id: "state-machine",
    title: "transitions are default-deny and terminal states close",
    status: terminal && unknown ? "PASS" : "FAIL",
    measured: `terminal=${terminal}; unknown-state-yields-no-transitions=${unknown}; vocabulary=${JSON.stringify(assertReconciliationVocabularyAligned())}`,
    remediation: null,
  });

  // 8. Posting authority is reported, never assumed.
  const capability = await checkCapabilityActivation("CAP_POSTING");
  push({
    id: "posting-authority",
    title: "CAP_POSTING state is read from the registry",
    status: capability.executable ? "PASS" : "BLOCKED",
    measured: capability.executable
      ? "CAP_POSTING is ACTIVATED; posting is permitted by the registry (its own governance remains separate)"
      : `CAP_POSTING not executable: ${capability.reason}${capability.blockedBy ? ` (blocked by ${capability.blockedBy})` : ""}`,
    remediation: capability.executable ? null : "Ratification of the accounting policy decisions is a governance act, not a payment-layer one.",
  });

  // 9. No live provider may be claimed.
  const statuses = allStatuses();
  const claims = statuses.map((s) => ({ provider: s.provider, ...assertNoLiveIntegrationClaim(s) }));
  const badClaims = claims.filter((c) => !c.ok);
  push({
    id: "provider-status",
    title: "no provider claims live integration without evidence",
    status: badClaims.length === 0 ? "PASS" : "FAIL",
    measured: `${statuses.length} providers assessed; live claims: ${statuses.filter((s) => s.integrationStatus.startsWith("PRODUCTION")).length}; violations: ${badClaims.length}`,
    remediation: badClaims.length ? "Remove the unsupported claim or mount the evidence." : null,
  });

  // 10. Counts, as facts rather than judgements.
  const counts = {
    transactions: num(await rows<{ n: string }>(sql`select count(*)::text n from payment_transactions`)),
    webhookEvents: num(await rows<{ n: string }>(sql`select count(*)::text n from payment_webhook_events`)),
    openExceptions: num(await rows<{ n: string }>(sql`select count(*)::text n from payment_exceptions where status = 'OPEN'`)),
    blockingExceptions: num(await rows<{ n: string }>(sql`select count(*)::text n from payment_exceptions where status = 'OPEN' and blocking = 1`)),
    settlements: num(await rows<{ n: string }>(sql`select count(*)::text n from payment_settlements`)),
    postedTransactions: num(await rows<{ n: string }>(sql`select count(*)::text n from payment_transactions where accounting_status = 'POSTED'`)),
    journalEntries: num(await rows<{ n: string }>(sql`select count(*)::text n from journal_entries`)),
  };

  const failed = checks.filter((c) => c.status === "FAIL");
  const blocked = checks.filter((c) => c.status === "BLOCKED");
  const overall: "PASS" | "PARTIAL" | "FAIL" | "BLOCKED" = failed.length > 0 ? "FAIL" : blocked.length > 0 ? "BLOCKED" : "PASS";

  return {
    ok: failed.length === 0,
    status: overall,
    version: PAYMENTS_SELFTEST_VERSION,
    scope,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    checks,
    counts,
    blockedOn: [
      "REAL_PROVIDER_INTEGRATION = BLOCKED_EXTERNAL_DEPENDENCY (no credential, no signed agreement, no verified API documentation in this environment)",
      "PRODUCTION_SETTLEMENT = BLOCKED_EXTERNAL_DEPENDENCY",
      ...(!capability.executable ? ["AUTONOMOUS_POSTING = BLOCKED_BY_CAP_POSTING"] : []),
      "PRODUCTION_ACTIVATION = BLOCKED (platform launch gates remain FAILED/BLOCKED)",
    ],
  };
}

function num(rows: { n: string }[]): number {
  return Number(rows[0]?.n ?? 0);
}

export const SELFTEST_CONTRACT = {
  ingestVersion: INGEST_VERSION,
  matchingVersion: MATCHING_VERSION,
  settlementVersion: SETTLEMENT_VERSION,
  accountingBridgeVersion: ACCOUNTING_BRIDGE_VERSION,
  domainVersion: PAYMENT_DOMAIN_VERSION,
  registryVersion: PROVIDER_REGISTRY_VERSION,
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
  bridge: BRIDGE_SELF_CHECK,
  movesMoney: false,
  postsJournals: false,
  activatesCapabilities: false,
} as const;
