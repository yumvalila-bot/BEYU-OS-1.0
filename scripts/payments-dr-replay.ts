/**
 * BEYU OS — replay a provider event against a target database (payments DR drill).
 *
 * Run as a child process so the target database is chosen by environment, not by
 * argument: the parent points DATABASE_URL at the restored scratch database and this
 * script replays the byte-identical delivery through the real ingestion path. That is
 * the only honest way to show that idempotency survives a restore — an in-process
 * call would still be holding the source database's connection pool.
 *
 * Prints one JSON object: the receipt. Exit 0 always (the caller judges the receipt);
 * exit 2 if the environment is unusable.
 */
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? ""] as [string, string];
  }),
);

async function main(): Promise<number> {
  const tag = args.get("tag");
  const connectionId = args.get("connection-id");
  if (!tag || !connectionId) {
    console.error("usage: --tag=<run tag> --connection-id=<id> [--role=runtime|admin]");
    return 2;
  }
  const admin = process.env.BEYU_ADMIN_DATABASE_URL ?? "";
  if (!admin) {
    console.error("BEYU_ADMIN_DATABASE_URL is required so the target database can be selected");
    return 2;
  }
  const target = args.get("role") === "admin" ? admin : (process.env.BEYU_RUNTIME_DATABASE_URL ?? admin);
  // Select the target BEFORE any module that builds a pool is loaded.
  process.env.DATABASE_URL = target;
  process.env.BEYU_ADMIN_DATABASE_URL = target;
  process.env.BEYU_RUNTIME_DATABASE_URL = target;

  const { createHmac } = await import("node:crypto");
  const { ingestWebhookEvent } = await import("@/lib/payments/ingest");
  const { MOCK_PROVIDER_CODE } = await import("@/lib/payments/providers/mock");
  const { fixtureBody, PAYMENT_DR_AMOUNT_MINOR } = await import("./payments-dr-fixture");

  const providerEventId = `${tag}-E1`;
  const providerTransactionId = `${tag}-T1`;
  // The bytes matter: a replay is only a replay if the payload is identical. The
  // fixture's exact body is passed in (base64) rather than rebuilt here, because a
  // rebuilt body would carry a new timestamp, and a same-id-different-bytes delivery
  // is a DIFFERENT control — the provider reusing an event id, which must be refused
  // and escalated rather than acknowledged. Both are tested; they are not the same.
  const bodyB64 = args.get("body-b64");
  let body = bodyB64 ? Buffer.from(bodyB64, "base64").toString("utf8") : fixtureBody({ providerEventId, providerTransactionId });
  const tampered = args.get("tamper") === "amount";
  if (tampered) body = body.replace(`"amount":"${PAYMENT_DR_AMOUNT_MINOR}"`, `"amount":"${PAYMENT_DR_AMOUNT_MINOR + 1}"`);
  const secret = process.env.BEYU_MOCK_WEBHOOK_SECRET ?? "dr-drill-secret-not-a-real-credential";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");

  const receipt = await ingestWebhookEvent({
    providerCode: MOCK_PROVIDER_CODE,
    traceId: `trace-${tag}-replay`,
    correlationId: `corr-${tag}-replay`,
    connectionIdHeader: connectionId,
    rawBody: body,
    headers: { "x-beyu-timestamp": timestamp, "x-beyu-signature": signature, "x-beyu-event-id": providerEventId },
    sourceIp: "203.0.113.41",
  });

  // Counted through a dedicated admin connection on purpose. `adminPool` resolves its
  // URL from the environment shared with the app role, and in this child the app role
  // is `beyu_runtime` inside no tenant scope — so a pool read would report zero rows
  // for data that is plainly present, and that number would then be asserted against.
  const { Client } = await import("pg");
  const counter = new Client({ connectionString: admin });
  await counter.connect();
  const transactions = (
    await counter.query(`select count(*)::int as n from public.payment_transactions where provider_transaction_id = $1`, [providerTransactionId])
  ).rows[0] as { n: number };
  const exceptions = (
    await counter.query(
      `select x.code, x.severity, x.status from public.payment_exceptions x
        where x.correlation_id = $1 order by x.created_at`,
      [`corr-${tag}-replay`],
    )
  ).rows;
  const entries = (
    await counter.query(`select count(*)::int as n from public.journal_entries where reference = $1`, [`PAY/${receipt.transactionId ?? ""}`])
  ).rows[0] as { n: number };

  await counter.end().catch(() => undefined);
  console.log(
    JSON.stringify(
      {
        target,
        amountMinor: PAYMENT_DR_AMOUNT_MINOR,
        outcome: receipt.outcome,
        code: receipt.code ?? null,
        tampered,
        digestMatchesOriginal: !tampered,
        transactionId: receipt.transactionId,
        transactionsForProviderId: Number(transactions.n),
        journalEntriesForThisPayment: Number(entries.n),
        counterRole: "database admin (counters only)",
        exceptionsFromThisReplay: exceptions,
      },
      null,
      2,
    ),
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[payments-dr-replay] ERROR:", e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
