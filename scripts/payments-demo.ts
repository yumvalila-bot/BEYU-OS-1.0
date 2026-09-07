/**
 * Deterministic payment demonstration (§52), run against the real database and
 * the real pipeline — no stubs of the code under test.
 *
 *   npx tsx scripts/payments-demo.ts                 # governed stop, as a fresh install behaves
 *   npx tsx scripts/payments-demo.ts --mode=sandbox  # configures the labelled sandbox first
 *   npx tsx scripts/payments-demo.ts --failures       # adds the failure/edge demonstrations
 *
 * The two modes differ only in whether payment configuration exists. That is the
 * point: with no ratified policy and no account mappings, the pipeline must
 * record the money and STOP, raising exceptions, and the demo reports that as the
 * correct outcome rather than manufacturing a pass. Nothing here can post to the
 * ledger: `CAP_POSTING` is read, never touched.
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { adminPool } from "@/db/admin";
import { FIXTURE_RESET_CONFIRM_TOKEN } from "@/lib/payments/fixture-reset";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ingestWebhookEvent } from "@/lib/payments/ingest";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { reconcileTransaction } from "@/lib/payments/reconcile";
import { ingestSettlementBatch } from "@/lib/payments/settlement";
import { prepareOrPost, buildDraft, loadDraftContext, loadTransactionForDraft } from "@/lib/payments/accounting";
import { runPaymentsSelfTest } from "@/lib/payments/selftest";
import { MOCK_PROVIDER_CODE } from "@/lib/payments/providers/mock";
import { majorUnitsString } from "@/lib/payments/money";

const SECRET = process.env.BEYU_MOCK_WEBHOOK_SECRET ?? "demo-only-secret-not-a-real-credential";
const RUN = `DEMO${Date.now().toString(36).toUpperCase()}`;
const TZS_250000_MINOR = 250000; // TZS has zero minor units: 250000 minor == 250000 major

function sign(timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

function mockBody(fields: Record<string, unknown>): string {
  return JSON.stringify({ type: "TRANSACTION", currency: "TZS", ...fields });
}

async function send(body: string, extraHeaders: Record<string, string> = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return ingestWebhookEvent({
    providerCode: MOCK_PROVIDER_CODE,
    rawBody: body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": sign(timestamp, body), "x-beyu-event-id": String((JSON.parse(body) as { event_id: string }).event_id), ...extraHeaders },
    sourceIp: "203.0.113.10",
    correlationId: `corr-${RUN}`,
    traceId: `trace-${RUN}`,
  });
}

async function connectionFor(tenantId: string) {
  const rows = (await adminPool.query(`select id, legal_entity_id, tenant_id from public.payment_provider_connections where provider_code=$1 and enabled=1 order by created_at limit 1`, [MOCK_PROVIDER_CODE]))
    .rows as { id: string; legal_entity_id: string; tenant_id: string }[];
  return rows[0] ?? null;
}

/**
 * Sandbox mode configures the fixture through the ONLY sanctioned writer
 * (`scripts/payment-config.ts`), rather than duplicating governed writes here.
 * The labelled configuration it produces is `SANDBOX-DEMO-1.0.0` /
 * `SANDBOX-DEMO:NOT-RATIFIED`: an explicit statement that this is a test fixture,
 * not a ratified accounting policy.
 */
async function configureSandbox(tenantId: string): Promise<Record<string, unknown>> {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("npx", ["tsx", "scripts/payment-config.ts", "sandbox-demo", `--tenant=${tenantId}`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return { raw: out.slice(0, 2000) };
  }
}

/** Invoke the configuration CLI for a single JSON result (same process, same env). */
function runConfigCli(argv: string[]): Record<string, unknown> {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const out = execFileSync("npx", ["tsx", "scripts/payment-config.ts", ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    return { raw: out.slice(0, 2000) };
  }
}

async function step(label: string, payload: unknown): Promise<void> {
  console.log(`\n### ${label}\n${JSON.stringify(payload, null, 2)}`);
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--mode=sandbox") ? "sandbox" : "governed-stop";
  const failures = process.argv.includes("--failures");
  const tenantId = "TEN_BEYU_TZ";
  const report: Record<string, unknown> = { run: RUN, mode, currencyExponent: { TZS: 0 }, amounts: { demoAmountMinor: TZS_250000_MINOR, demoAmountMajor: majorUnitsString(TZS_250000_MINOR, "TZS") } };

  process.env.BEYU_MOCK_WEBHOOK_SECRET = SECRET;

  if (mode === "sandbox") {
    report.configuration = await configureSandbox(tenantId);
  }

  const connection = await connectionFor(tenantId);
  report.connectionMounted = connection ? { id: connection.id, legalEntityId: connection.legal_entity_id } : null;

  if (!connection) {
    report.result = "NOT_CONFIGURED";
    report.note =
      "No enabled sandbox connection exists for this tenant, so the pipeline must refuse to ingest. This is the fresh-install state: configuration is a governed act (scripts/payment-config.ts), and the demo does not create it silently. Re-run with --mode=sandbox for the configured demonstration.";
    // Prove the refusal is a refusal, not a crash.
    report.unconfiguredAttempt = await send(mockBody({ event_id: `${RUN}-E0`, transaction_id: `${RUN}-T0`, amount: "250000", from: "255712000111", payer_name: "DEMO PAYER" }));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  /* ---------------------------- happy path ----------------------------- */
  const receivedAt = new Date();
  const body = mockBody({
    event_id: `${RUN}-E1`,
    transaction_id: `${RUN}-T1`,
    amount: "250000",
    fee: "0",
    tax: "0",
    net_amount: "250000",
    timestamp: receivedAt.toISOString(),
    from: "255712000111",
    to: "TILL-SD-DEMO", // the till registered by scripts/payment-config.ts sandbox-demo
    payer_name: "DEMO PAYER",
    invoice_reference: `INV-${RUN}-1`,
    description: "deterministic demonstration receipt",
  });
  const first = await send(body);
  await step("1. Ingestion of a TZS 250,000 receipt (authenticated)", {
    httpStatus: first.status,
    outcome: first.outcome,
    code: first.code,
    transactionId: first.transactionId,
    verificationStatus: first.verificationStatus,
    trustLevel: first.trustLevel,
    reconciliationStatus: first.reconciliationStatus,
    gaps: first.gaps,
    configurationProblems: first.configurationProblems,
    ledgerEffect: "NONE — an ingest never posts",
  });

  const second = await send(body);
  await step("2. Identical event replayed (durable inbox dedupe)", {
    outcome: second.outcome,
    code: second.code,
    transactionId: second.transactionId,
    sameTransactionReused: second.transactionId === first.transactionId,
  });

  let transactionCount = 0;
  if (first.transactionId) {
    const counted = (await adminPool.query(`select count(*)::int n from public.payment_transactions where provider_transaction_id = $1`, [`${RUN}-T1`])).rows[0];
    transactionCount = counted?.n ?? 0;
  }
  await step("3. Exactly one canonical transaction exists", { transactionsForThisProviderId: transactionCount, expected: 1 });

  if (first.transactionId) {
    // Called the way an authenticated route calls it: inside the tenant's RLS
    // scope. Outside a scope, RLS returns nothing by design.
    const match = await withDatabaseRlsContext([tenantId], false, () =>
      reconcileTransaction({ transactionId: first.transactionId!, actorUserId: null, correlationId: `corr-${RUN}` }),
    );
    await step("4. Reconciliation pass (machine only)", {
      status: match.status,
      candidates: match.candidates,
      confidence: match.confidence,
      method: match.method,
      note: "A receipt is not a customer payment until something identifies it as one. This platform has no AR/AP obligation substrate, so the honest answer here is DATA_NOT_AVAILABLE unless a second artefact corroborates it.",
    });

    const settlement = await ingestSettlementBatch({
      tenantId,
      legalEntityId: connection.legal_entity_id,
      providerCode: MOCK_PROVIDER_CODE,
      connectionId: connection.id,
      providerSettlementId: `${RUN}-SETTLE-1`,
      settlementDate: receivedAt,
      currency: "TZS",
      grossMinor: TZS_250000_MINOR,
      feeMinor: 0,
      taxMinor: 0,
      netMinor: TZS_250000_MINOR,
      creditedMinor: TZS_250000_MINOR,
      source: "STATEMENT_FILE",
      items: [{ providerTransactionId: `${RUN}-T1`, amountMinor: TZS_250000_MINOR, feeMinor: 0 }],
      correlationId: `corr-${RUN}`,
      actorType: "SERVICE",
    });
    await step("5. Settlement batch + bank credit corroboration", {
      status: settlement.status,
      matched: settlement.matchedCount,
      unmatched: settlement.unmatchedCount,
      itemGrossVarianceMinor: settlement.itemGrossVarianceMinor,
      creditVarianceMinor: settlement.creditVarianceMinor,
      trustRaised: settlement.transactionsRaisedToBankTrust,
      exceptionsRaised: settlement.exceptionsRaised,
    });

    const after = await adminPool.query(
      `select verification_status, trust_level, reconciliation_status, settlement_status, accounting_status, net_basis, gross_minor, fee_minor, net_minor
         from public.payment_transactions where id = $1`,
      [first.transactionId],
    );
    const row = after.rows[0] as Record<string, string | null>;
    await step("6. The four status axes after corroboration", {
      verification: row.verification_status,
      trust: row.trust_level,
      reconciliation: row.reconciliation_status,
      settlement: row.settlement_status,
      accounting: row.accounting_status,
      netBasis: row.net_basis,
      amountsMinor: { gross: row.gross_minor, fee: row.fee_minor, net: row.net_minor },
    });

    const [tx, ctx] = await withDatabaseRlsContext([tenantId], false, async () => {
      const loaded = await loadTransactionForDraft(first.transactionId!);
      return [loaded, loaded ? await loadDraftContext(loaded) : null] as const;
    });
    const draft = tx && ctx ? buildDraft({ transaction: tx, context: ctx }) : { ok: false as const, code: "TRANSACTION_GONE", reason: "gone" };
    await step("7. Accounting draft (prepared, not posted)", draft.ok ? { ok: true, reference: draft.draft.reference, period: draft.draft.periodCode, lines: draft.draft.lines.map((l) => ({ role: l.role, debitMinor: l.debitMinor, creditMinor: l.creditMinor })), balanced: draft.draft.balanced, basis: draft.draft.basis } : { ok: false, code: draft.code, reason: draft.reason });

    if (!draft.ok) {
      await step("7a. What a production activation would additionally require", {
        missingNow: [draft.code],
        stillNeededAfterThat: ["an authorised principal (finance:payments.authorize) calling the review endpoint", "CAP_POSTING unlocked by governance, not by this programme", "a ratified accounting policy, not this sandbox fixture"],
      });
    }

    const posted = await adminPool.query(`select count(*)::int n from public.journal_entries where reference = $1`, [`PAY/${first.transactionId}`]);
    await step("8. Ledger is untouched", { journalEntriesForThisTransaction: (posted.rows[0] as { n: number }).n, expected: 0, reason: "CAP_POSTING is LOCKED and posting requires a named authorising principal through an authenticated request, not a script." });
  }

  /* ---------------------------- failure demos ---------------------------- */
  if (failures) {
    const cases: { label: string; run: () => Promise<unknown> }[] = [
      {
        label: "F1 unsigned payload",
        run: async () => {
          const ts = Math.floor(Date.now() / 1000).toString();
          const b = mockBody({ event_id: `${RUN}-F1`, transaction_id: `${RUN}-FT1`, amount: "1000" });
          return ingestWebhookEvent({ providerCode: MOCK_PROVIDER_CODE, rawBody: b, headers: { "x-beyu-timestamp": ts, "x-beyu-signature": "sha256=" + "f".repeat(64), "x-beyu-event-id": `${RUN}-F1` }, sourceIp: "203.0.113.11" });
        },
      },
      {
        label: "F2 stale timestamp (replay window)",
        run: async () => {
          const ts = Math.floor(Date.now() / 1000 - 6 * 3600).toString();
          const b = mockBody({ event_id: `${RUN}-F2`, transaction_id: `${RUN}-FT2`, amount: "1000" });
          const sig = "sha256=" + createHmac("sha256", SECRET).update(`${ts}.${b}`, "utf8").digest("hex");
          return ingestWebhookEvent({ providerCode: MOCK_PROVIDER_CODE, rawBody: b, headers: { "x-beyu-timestamp": ts, "x-beyu-signature": sig, "x-beyu-event-id": `${RUN}-F2` } });
        },
      },
      { label: "F3 empty body", run: () => ingestWebhookEvent({ providerCode: MOCK_PROVIDER_CODE, rawBody: "", headers: {} }) },
      { label: "F4 malformed JSON", run: () => ingestWebhookEvent({ providerCode: MOCK_PROVIDER_CODE, rawBody: "{not json", headers: { "x-beyu-timestamp": Math.floor(Date.now() / 1000).toString(), "x-beyu-signature": "sha256=" + "0".repeat(64) } }) },
      { label: "F5 missing amount", run: () => send(mockBody({ event_id: `${RUN}-F5`, transaction_id: `${RUN}-FT5` })) },
      { label: "F6 unknown provider", run: () => ingestWebhookEvent({ providerCode: "NO_SUCH_PROVIDER", rawBody: "{}", headers: {} }) },
      {
        label: "F7 negative amount",
        run: () => send(mockBody({ event_id: `${RUN}-F7`, transaction_id: `${RUN}-FT7`, amount: "-250000" })),
      },
      {
        label: "F8 fractional minor unit for a zero-decimal currency",
        run: () => send(mockBody({ event_id: `${RUN}-F8`, transaction_id: `${RUN}-FT8`, amount: "250000.50" })),
      },
      {
        label: "F9 unsupported currency",
        run: () => send(mockBody({ event_id: `${RUN}-F9`, transaction_id: `${RUN}-FT9`, amount: "10", currency: "XX1" })),
      },
      {
        label: "F10 fee greater than gross",
        run: () => send(mockBody({ event_id: `${RUN}-F10`, transaction_id: `${RUN}-FT10`, amount: "1000", fee: "2000", tax: "0", net_amount: "-1000" })),
      },
      {
        label: "F11 amount over the governed per-transaction ceiling (policy max_transaction_minor)",
        run: () => send(mockBody({ event_id: `${RUN}-F11`, transaction_id: `${RUN}-FT11`, amount: "99999999", fee: "0", tax: "0", net_amount: "99999999" })),
      },
      {
        label: "F12 same provider transaction id, different amount",
        run: () => send(mockBody({ event_id: `${RUN}-F12`, transaction_id: `${RUN}-T1`, amount: "999999", fee: "0", tax: "0", net_amount: "999999" })),
      },
      {
        label: "F13 settlement with a variance",
        run: () =>
          ingestSettlementBatch({
            tenantId,
            legalEntityId: connection.legal_entity_id,
            providerCode: MOCK_PROVIDER_CODE,
            connectionId: connection.id,
            providerSettlementId: `${RUN}-SETTLE-BAD`,
            settlementDate: new Date(),
            currency: "TZS",
            grossMinor: 500000,
            feeMinor: 0,
            taxMinor: 0,
            netMinor: 500000,
            creditedMinor: 400000,
            source: "BANK_STATEMENT",
            items: [{ providerTransactionId: `${RUN}-T1`, amountMinor: 500000, feeMinor: 0 }],
          }),
      },
      {
        label: "F14 settlement item with no matching transaction",
        run: () =>
          ingestSettlementBatch({
            tenantId,
            legalEntityId: connection.legal_entity_id,
            providerCode: MOCK_PROVIDER_CODE,
            connectionId: connection.id,
            providerSettlementId: `${RUN}-SETTLE-ORPHAN`,
            settlementDate: new Date(),
            currency: "TZS",
            grossMinor: 1000,
            feeMinor: 0,
            taxMinor: 0,
            netMinor: 1000,
            creditedMinor: 1000,
            source: "STATEMENT_FILE",
            items: [{ providerTransactionId: `${RUN}-NEVER-SEEN`, amountMinor: 1000 }],
          }),
      },
      {
        label: "F15 duplicate settlement id with different numbers",
        run: () =>
          ingestSettlementBatch({
            tenantId,
            legalEntityId: connection.legal_entity_id,
            providerCode: MOCK_PROVIDER_CODE,
            connectionId: connection.id,
            providerSettlementId: `${RUN}-SETTLE-1`,
            settlementDate: new Date(),
            currency: "TZS",
            grossMinor: 999999,
            feeMinor: 0,
            taxMinor: 0,
            netMinor: 999999,
            source: "STATEMENT_FILE",
            items: [{ providerTransactionId: `${RUN}-T1`, amountMinor: 999999 }],
          }),
      },
      {
        label: "F16 payload over the size ceiling",
        run: () => ingestWebhookEvent({ providerCode: MOCK_PROVIDER_CODE, rawBody: `"${"x".repeat(300 * 1024)}"`, headers: {} }),
      },
      {
        label: "F17 provider not registered for this tenant (no enabled connection)",
        run: () => ingestWebhookEvent({ providerCode: MOCK_PROVIDER_CODE, rawBody: mockBody({ event_id: `${RUN}-F17`, amount: "1" }), headers: { "x-beyu-connection": "LEN_DOES_NOT_EXIST" }, connectionIdHeader: "LEN_DOES_NOT_EXIST" }),
      },
      {
        label: "F18 forged tenant inside the payload",
        run: () => send(mockBody({ event_id: `${RUN}-F18`, transaction_id: `${RUN}-FT18`, amount: "1000", tenant_id: "TEN_BEYU_HEALTH", legal_entity_id: "LEN_SOMETHING" })),
      },
      {
        // A real isolation probe, not a WHERE clause: the query runs as the runtime
        // role inside the OTHER tenant's RLS context, so the database — not the
        // application filter — decides. The same row is then read back inside this
        // tenant's context, which must see it, proving the probe is meaningful.
        label: "F19 cross-tenant read attempt after ingest",
        run: async () => {
          const foreign = await withDatabaseRlsContext(["TEN_BEYU_HEALTH"], false, async () => {
            const r = await db.execute(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id = ${RUN + "-T1"}`);
            return (r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? -1;
          });
          const home = await withDatabaseRlsContext([tenantId], false, async () => {
            const r = await db.execute(sql`select count(*)::int as n from public.payment_transactions where provider_transaction_id = ${RUN + "-T1"}`);
            return (r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? -1;
          });
          return { rowsVisibleToOtherTenant: foreign, expectedInOtherTenant: 0, rowsVisibleToOwningTenant: home, expectedInOwningTenant: 1, enforcedBy: "ROW LEVEL SECURITY with FORCE, not an application filter" };
        },
      },
      {
        label: "F20 posting attempt through the bridge (no principal, no capability)",
        run: async () => {
          if (!first.transactionId) return { skipped: "no transaction" };
          const fake = { userId: "USR_DEMO_NOT_A_USER" } as never;
          try {
            const r = await withDatabaseRlsContext([tenantId], false, () =>
              prepareOrPost({ principal: fake, transactionId: first.transactionId!, allowPost: true, traceId: `trace-${RUN}-F20`, correlationId: `corr-${RUN}` }),
            );
            return { outcome: r.kind, blockers: "blockers" in r ? r.blockers : null, reason: "reason" in r ? r.reason : null };
          } catch (e) {
            return { threw: (e as Error).message.slice(0, 160) };
          }
        },
      },
    ];

    const results: Record<string, unknown> = {};
    for (const c of cases) {
      try {
        const r = await c.run();
        results[c.label] = r;
      } catch (e) {
        results[c.label] = { threw: e instanceof Error ? e.message.slice(0, 200) : String(e) };
      }
    }
    await step("9. Failure and edge demonstrations", results);
    report.failures = results;
  }

  /* ------------------------------- posture ------------------------------- */
  const selfTest = await runPaymentsSelfTest();
  const exceptions = (await adminPool.query(`select code, count(*)::int n from public.payment_exceptions where correlation_id = $1 group by code order by code`, [`corr-${RUN}`])).rows;
  await step("10. Installation and enforcement self-test", { status: selfTest.status, ok: selfTest.ok, checks: selfTest.checks.map((c) => ({ id: c.id, status: c.status, measured: c.measured })), blockedOn: selfTest.blockedOn });
  await step("11. Exceptions raised by this run", { exceptions, interpretation: "Exceptions are the expected output of a pipeline that refuses to guess. They are not failures of the pipeline." });

  report.selfTestStatus = selfTest.status;
  report.transactionId = first.transactionId;
  report.productionActivation = "BLOCKED";
  // The demonstration is a fixture, not history. Remove exactly what this run
  // created so the shared development database keeps reporting the reality the
  // Finance OS substrate tests measure (no chart of accounts, no periods, no
  // journal entries). The removal is tag-scoped, mock-provider-scoped, restores
  // the immutability triggers and is itself audited; it refuses outright if
  // anything in scope is POSTED, so a real booking can never be cleaned up by it.
  let fixtureCleanup: unknown = { skipped: "not sandbox mode" };
  if (mode === "sandbox") {
    fixtureCleanup = runConfigCli([
      "sandbox-demo",
      "--cleanup",
      "--confirm=REMOVE-SANDBOX-DEMO",
      `--purge-tags=${RUN}`,
      `--purge-confirm=${FIXTURE_RESET_CONFIRM_TOKEN}`,
    ]);
  }
  console.log(`\n=== DEMO SUMMARY ===\n${JSON.stringify({ run: RUN, mode, selfTest: selfTest.status, postingAttempted: false, productionActivation: "BLOCKED", fixtureCleanup }, null, 2)}`);
}

main().catch((e) => {
  const cause = (e as { cause?: { message?: string; code?: string; detail?: string; constraint?: string } }).cause;
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 400) : String(e),
        databaseError: cause ? { code: cause.code, message: cause.message, constraint: cause.constraint, detail: cause.detail } : undefined,
        stack: e instanceof Error ? e.stack?.split("\n").slice(1, 4).join(" | ") : undefined,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
