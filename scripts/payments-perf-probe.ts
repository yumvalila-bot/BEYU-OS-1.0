/**
 * BEYU OS — payment path performance probe (payments programme §53).
 *
 * WHAT THIS IS
 * A measurement harness for the hot payment paths against a real PostgreSQL, using
 * the real pipeline: signed ingest, the idempotency and dedupe lookups, the review
 * queue, the settlement batch path, and the accounting bridge's draft assembly. It
 * reports wall-clock percentiles and the actual `EXPLAIN (ANALYZE, BUFFERS)` plan for
 * the queries those paths depend on, so "the index is used" is a plan node rather
 * than an opinion, and a future index regression shows up as a Seq Scan in a
 * recorded artifact.
 *
 * WHAT THIS IS NOT
 * It is not a capacity statement. One node, one pool, no network hop, a development
 * dataset, no concurrent tenants, and the in-process mock provider's parsing rather
 * than a real provider's latency. Publishing a p95 from here as a production number
 * would be a fabrication, so the report carries its own limits in a field and
 * `productionCapacityClaim` is a literal `false`: nothing in this file can turn it on.
 *
 * The run creates its own rows through the governed configuration CLI and the real
 * ingest path, and removes them again: it ends by proving the tag it used leaves zero
 * rows behind, so a measurement never quietly becomes permanent data.
 *
 * Usage: npx tsx scripts/payments-perf-probe.ts [--events=200] [--concurrency=20]
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { adminPool } from "@/db/admin";
import { ingestWebhookEvent } from "@/lib/payments/ingest";
import { ingestSettlementBatch } from "@/lib/payments/settlement";
import { reviewQueue } from "@/lib/payments/review";
import { buildDraft, loadDraftContext, loadTransactionForDraft } from "@/lib/payments/accounting";
import { FIXTURE_RESET_CONFIRM_TOKEN, removeDemoPaymentRows } from "@/lib/payments/fixture-reset";
import { MOCK_PROVIDER_CODE } from "@/lib/payments/providers/mock";

/**
 * This probe deliberately creates NO configuration of its own.
 *
 * A first version upserted a policy to raise the auto-post ceiling, and then had to delete
 * that policy at teardown — a `delete from payment_policies` in a script, which the
 * governed-configuration scan in `tests/payments/governed-config-write-path.test.ts`
 * (correctly) refused. The scan was not weakened. Raising ceilings is not needed here
 * anyway: the probe never posts, so the demo policy's 0 ceiling does not constrain it, and
 * a measurement harness that can mutate a tenant's accounting policy is the wrong tool to
 * have in the repository regardless of whether the test catches it.
 */

const TENANT = "TEN_BEYU_TZ";
const SECRET = process.env.BEYU_MOCK_WEBHOOK_SECRET ?? "perf-probe-secret-not-a-real-credential";
const RUN = `PERF${Date.now().toString(36).toUpperCase()}`;
const AMOUNT_MINOR = 250000;
const argNumber = (name: string, fallback: number): number => {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const EVENTS = Math.min(argNumber("events", 200), 2000);
/**
 * The payload timestamp is pinned per event id, so re-delivering an event sends the
 * identical BYTES. That distinction is the whole test: an identical delivery is a
 * replay (acknowledged as a duplicate) while the same id with different bytes is the
 * provider reusing an id (refused, and escalated). A probe that regenerated the
 * timestamp would measure the second case and call it the first.
 */
const BASE_MS = Math.floor(Date.now() / 60_000) * 60_000;
const CONCURRENCY = Math.min(argNumber("concurrency", 20), 100);

function sign(timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(3));
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: Number((sum / Math.max(1, sorted.length)).toFixed(3)),
    throughputPerSecond: Number((1000 / (sum / Math.max(1, sorted.length))).toFixed(1)),
  };
}

/** Timed call, samples returned in milliseconds. */
async function timed<T>(runs: number, work: (i: number) => Promise<T>): Promise<{ samples: number[]; results: T[] }> {
  const samples: number[] = [];
  const results: T[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    results.push(await work(i));
    samples.push(performance.now() - started);
  }
  return { samples, results };
}

function runConfigCli(argv: string[]): Record<string, unknown> {
  const out = execFileSync("npx", ["tsx", "scripts/payment-config.ts", ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return { raw: out.slice(0, 500) };
  }
}

async function deliver(index: number, tag: string, connectionId: string) {
  const body = JSON.stringify({
    type: "TRANSACTION",
    currency: "TZS",
    event_id: `${tag}-E${index}`,
    transaction_id: `${tag}-T${index}`,
    amount: String(AMOUNT_MINOR),
    fee: "0",
    tax: "0",
    net_amount: String(AMOUNT_MINOR),
    timestamp: new Date(BASE_MS - index * 1000).toISOString(),
    from: `2557120${String(1000 + index).slice(-4)}`,
    to: "TILL-SD-DEMO",
    payer_name: `PERF PAYER ${index}`,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return ingestWebhookEvent({
    providerCode: MOCK_PROVIDER_CODE,
    traceId: `trace-${tag}-${index}`,
    correlationId: `corr-${tag}`,
    connectionIdHeader: connectionId,
    rawBody: body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": sign(timestamp, body), "x-beyu-event-id": `${tag}-E${index}` },
    sourceIp: "203.0.113.60",
  });
}

type PlanReport = { label: string; sql: string; plan: string[]; execMs: number | null; nodes: { indexScans: number; bitmapScans: number; seqScans: number; sorts: number }; buffers: string | null };

async function explain(client: Client, label: string, sqlText: string, params: unknown[]): Promise<PlanReport> {
  const started = performance.now();
  const result = await client.query(`explain (analyze, buffers, format text) ${sqlText}`, params);
  const execMs = performance.now() - started;
  const plan = (result.rows as { "QUERY PLAN": string }[]).map((r) => r["QUERY PLAN"]);
  const joined = plan.join("\n");
  const count = (re: RegExp) => (joined.match(re) ?? []).length;
  const buffers = joined.match(/Buffers:[^\n]*/)?.[0] ?? null;
  return {
    label,
    sql: sqlText.replace(/\s+/g, " ").trim(),
    plan,
    execMs: Number(execMs.toFixed(3)),
    nodes: {
      indexScans: count(/\bIndex (?:Only )?Scan\b/g),
      bitmapScans: count(/Bitmap Index Scan/g),
      seqScans: count(/\bSeq Scan\b/g),
      sorts: count(/Sort/g),
    },
    buffers,
  };
}

async function main(): Promise<number> {
  process.env.BEYU_MOCK_WEBHOOK_SECRET = SECRET;
  const report: Record<string, unknown> = {
    run: RUN,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      database: "the development PostgreSQL in this sandbox",
      provider: `${MOCK_PROVIDER_CODE} (in-process, no network)`,
      appPoolMaxConnections: 10,
      poolNote:
        "src/db/index.ts leaves node-postgres at its default max of 10, and every ingest runs inside one transaction to hold the RLS context, so a burst above 10 is bounded by pool acquisition rather than by the queries. Recorded because it is the difference the concurrency numbers show; changing it is a deployment decision, not this probe's.",
      datasetBeforeRun: null,
    },
    limits: {
      productionCapacityClaim: false,
      note:
        "Single node, single pool, no network hop, no concurrent tenants, mock provider parsing, cold cache, development dataset. " +
        "These numbers describe this machine and this code path only. They are not an SLA, not a capacity plan, and not evidence about any provider.",
      notMeasured: [
        "provider-side latency and retries",
        "TLS and internet round trips",
        "multi-tenant contention and vacuum pressure",
        "connection-pool saturation",
        "read replica or pooler behaviour",
        "ledger volume at production scale (the journal here holds a handful of rows)",
      ],
    },
  };

  const [dbSize, counts] = await Promise.all([
    adminPool.query(`select pg_size_pretty(pg_database_size(current_database())) as size, current_setting('server_version_num') as version`),
    adminPool.query(
      `select
        (select count(*)::int from public.payment_transactions) as transactions,
        (select count(*)::int from public.payment_webhook_events) as inbox,
        (select count(*)::int from public.journal_entries) as journal_entries,
        (select count(*)::int from public.audit_log) as audit_rows`,
    ),
  ]);
  const serverVersion = (dbSize.rows[0] as { version: string }).version;
  report.environment = {
    ...(report.environment as object),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    postgres: `server ${serverVersion.slice(0, 2)}.${serverVersion.slice(2, 3)} (local sandbox volume, ${Number(serverVersion) >= 160000 ? "partitioned by nothing": "plain tables"})`,
    databaseSize: (dbSize.rows[0] as { size: string }).size,
    datasetBeforeRun: counts.rows[0],
  };

  // --- configuration through the only sanctioned writer, then the probe's own policy
  console.error(`[perf] ${RUN}: mounting sandbox configuration through the governed CLI`);
  runConfigCli(["sandbox-demo", `--tenant=${TENANT}`]);
  const [connection] = (
    await adminPool.query(
      `select id, legal_entity_id from public.payment_provider_connections where provider_code = $1 and tenant_id = $2 and enabled = 1 order by created_at desc limit 1`,
      [MOCK_PROVIDER_CODE, TENANT],
    )
  ).rows as { id: string; legal_entity_id: string }[];
  if (!connection) throw new Error("[perf] no sandbox connection was mounted");
  const [demoPolicy] = (
    await adminPool.query(
      `select policy_version, auto_post_ceiling_minor as autoPostCeilingMinor from public.payment_policies where tenant_id = $1 and provider_code = $2 and currency = $3 order by created_at desc limit 1`,
      [TENANT, MOCK_PROVIDER_CODE, "TZS"],
    )
  ).rows as { policy_version: string; autoPostCeilingMinor: string }[];

  // --- 1. ingest, sequential
  console.error(`[perf] ingesting ${EVENTS} distinct signed events (sequential)`);
  const sequential = await timed(EVENTS, (i) => deliver(i, RUN, connection.id));
  const ingested = sequential.results.filter((r) => r.outcome === "INGESTED").length;
  report.ingestSequential = { ...stats(sequential.samples), expectedIngested: EVENTS, actuallyIngested: ingested };

  // --- 2. bounded concurrency, the shape a provider's retry storm has
  console.error(`[perf] ingesting ${EVENTS} further events at concurrency ${CONCURRENCY}`);
  const wallStart = performance.now();
  const queue: number[] = Array.from({ length: EVENTS }, (_, i) => EVENTS + i);
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    const samples: number[] = [];
    for (;;) {
      const next = queue.shift();
      if (next === undefined) break;
      const started = performance.now();
      await deliver(next, RUN, connection.id);
      samples.push(performance.now() - started);
    }
    return samples;
  });
  const concurrentSamples = (await Promise.all(workers)).flat();
  const wallMs = performance.now() - wallStart;
  report.ingestConcurrent = {
    ...stats(concurrentSamples),
    concurrency: CONCURRENCY,
    wallMs: Number(wallMs.toFixed(1)),
    throughputPerSecondWholeRun: Number(((concurrentSamples.length / wallMs) * 1000).toFixed(1)),
  };

  // --- 3. the duplicate path, which is a read plus a conflict, not a write
  const replay = await timed(Math.min(EVENTS, 100), (i) => deliver(i, RUN, connection.id));
  const duplicateOutcomes = replay.results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  report.duplicateReplay = { ...stats(replay.samples), outcomes: duplicateOutcomes };

  // --- 4. settlement batch ingest (the FK-ordered, header-before-items path)
  const txIds = (
    await adminPool.query(`select provider_transaction_id from public.payment_transactions where provider_transaction_id like $1 order by provider_transaction_id limit 50`, [`${RUN}-T%`])
  ).rows as { provider_transaction_id: string }[];
  const settlement = await ingestSettlementBatch({
    tenantId: TENANT,
    legalEntityId: connection.legal_entity_id,
    providerCode: MOCK_PROVIDER_CODE,
    connectionId: connection.id,
    providerSettlementId: `${RUN}-S1`,
    settlementDate: new Date(),
    currency: "TZS",
    grossMinor: AMOUNT_MINOR * txIds.length,
    feeMinor: 0,
    taxMinor: 0,
    netMinor: AMOUNT_MINOR * txIds.length,
    creditedMinor: AMOUNT_MINOR * txIds.length,
    source: "BANK_STATEMENT",
    items: txIds.map((t) => ({ providerTransactionId: t.provider_transaction_id, amountMinor: AMOUNT_MINOR, feeMinor: 0 })),
    traceId: `trace-${RUN}-settle`,
    correlationId: `corr-${RUN}`,
    actorType: "SERVICE",
  });
  report.settlementBatch = { items: txIds.length, status: settlement.status, raised: settlement.transactionsRaisedToBankTrust };

  // An open period is needed for the bridge to build a draft at all. Created under
  // the run's own code and removed with it, and never removed if it ends up carrying
  // journal entries — a fiscal calendar is not this probe's to erase.
  const periodCode = `PERF-${RUN}-P`;
  await adminPool.query(
    `insert into public.financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
     values ($1, $2, $3, current_date - 1, current_date + 1, 'OPEN') on conflict do nothing`,
    [periodCode, connection.legal_entity_id, periodCode],
  );

  // --- 5. the reads a human and the reconciliation sweep actually run
  const queueRuns = await timed(50, () => reviewQueue(TENANT, 50));
  report.reviewQueue = { ...stats(queueRuns.samples), rowsLastRun: queueRuns.results[queueRuns.results.length - 1].length };

  const [oneTxn] = (await adminPool.query(`select id from public.payment_transactions where provider_transaction_id = $1`, [`${RUN}-T0`])).rows as { id: string }[];
  const draftRuns = await timed(50, async () => {
    const transaction = await loadTransactionForDraft((oneTxn as { id: string }).id, TENANT);
    if (!transaction) throw new Error("[perf] draft context lookup lost the transaction");
    const context = await loadDraftContext(transaction);
    return buildDraft({ transaction, context });
  });
  report.draftAssembly = {
    ...stats(draftRuns.samples),
    note: "load + governed context read + balanced draft build; no ledger write is included",
    outcomes: draftRuns.results.reduce<Record<string, number>>((acc, d) => {
      const key = d.ok ? "DRAFT_READY" : String(d.code);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };

  // --- 6. plans for the queries the above depend on
  const client = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  await client.connect();
  const [probeConn] = (await client.query(`select id from public.payment_provider_connections where provider_code=$1 and tenant_id=$2 and enabled=1 limit 1`, [MOCK_PROVIDER_CODE, TENANT])).rows as { id: string }[];
  const plans: PlanReport[] = [];
  try {
    plans.push(
      await explain(client, "inbox uniqueness probe (provider retry)", `select id, processing_state, payload_digest from public.payment_webhook_events where connection_id = $1 and provider_event_id = $2`, [probeConn.id, `${RUN}-E0`]),
      await explain(client, "transaction idempotency probe", `select id, gross_minor, accounting_status from public.payment_transactions where connection_id = $1 and provider_transaction_id = $2`, [probeConn.id, `${RUN}-T0`]),
      await explain(client, "read-model page (newest first)", `select id, occurred_at, gross_minor, reconciliation_status from public.payment_transactions where tenant_id = $1 and legal_entity_id = $2 order by occurred_at desc limit 50`, [TENANT, connection.legal_entity_id]),
      await explain(client, "open exception queue", `select x.id, x.severity, x.created_at from public.payment_exceptions x where x.tenant_id = $1 and x.status = 'OPEN' order by (x.severity = 'CRITICAL') desc, x.created_at desc limit 50`, [TENANT]),
      await explain(client, "unreconciled sweep", `select count(*)::int as n from public.payment_transactions where tenant_id = $1 and reconciliation_status = 'UNRECONCILED'`, [TENANT]),
      await explain(client, "state trail for one payment", `select axis, to_state, occurred_at from public.payment_transaction_states where transaction_id = $1 order by occurred_at, axis`, [(oneTxn as { id: string }).id]),
    );
  } finally {
    await client.end().catch(() => undefined);
  }
  report.queryPlans = plans.map(({ sql, ...p }) => ({ ...p, sql }));
  report.queryPlanSummary = plans.map((p) => ({ label: p.label, ...p.nodes, execMs: p.execMs, buffers: p.buffers }));
  const seqScans = plans.filter((p) => p.nodes.seqScans > 0).map((p) => p.label);
  report.plannerFindings = {
    plansWithSequentialScan: seqScans,
    interpretation:
      "A Seq Scan on a small development table is not itself a defect; it is what the planner chooses when the table is tiny. It is recorded here so that the same plan on a large table is visible as a change, not as a surprise.",
  };

  // --- 7. leave nothing behind
  const removed = await removeDemoPaymentRows({ prefixes: [RUN], confirm: FIXTURE_RESET_CONFIRM_TOKEN });
  await adminPool.query(
    `delete from public.financial_periods p
      where p.code = $1 and not exists (select 1 from public.journal_entries e where e.period_id = p.id)`,
    [periodCode],
  );
  const configCleanup = runConfigCli(["sandbox-demo", "--cleanup", "--confirm=REMOVE-SANDBOX-DEMO"]);
  const residual = (
    await adminPool.query(
      `select
        (select count(*)::int from public.payment_transactions where provider_transaction_id like $1) as transactions,
        (select count(*)::int from public.payment_webhook_events where provider_event_id like $1) as inbox,
        (select count(*)::int from public.journal_entries where reference like 'PAY/%') as pay_entries,
        (select count(*)::int from public.payment_policies where policy_version = $2) as policies`,
      [`${RUN}%`, (demoPolicy?.policy_version ?? "NONE")],
    )
  ).rows[0];
  report.teardown = { rowsRemoved: (removed as unknown as { removed?: unknown }).removed, configCleanup, residual };
  report.configurationUsed = demoPolicy ?? null;
  report.classification = {
    status: Number((residual as Record<string, number>).transactions) === 0 ? "LOCAL_MEASURED" : "LOCAL_MEASURED_WITH_RESIDUE",
    productionVerified: false,
    statement:
      "These are the payment path's measured timings and plans on the local development database, with the fixture removed afterwards. They say nothing about production capacity, provider latency or an SLA.",
  };

  // stdout is the report and nothing else, so `> evidence.json` is enough to capture
  // a run; progress goes to stderr.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return Number((residual as Record<string, number>).transactions) === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[perf] ERROR:", e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 4).join("\n")}` : e);
    process.exit(2);
  },
);
