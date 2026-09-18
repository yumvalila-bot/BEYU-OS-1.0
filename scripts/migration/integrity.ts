/**
 * BEYU OS — P2 MIGRATION INTEGRITY stage.
 *
 * The pipeline step that proves the canonical migration set is coherent BEFORE
 * anything is applied or compared. It shares its logic with the regression
 * suite (`src/lib/migration/integrity.ts`), so CI and `npm test` can never
 * disagree about what integrity means.
 *
 *   usage: tsx scripts/migration/integrity.ts [--with-ledger] [--json]
 *
 *   --with-ledger   additionally reconcile against the real `beyu_migrations`
 *                   ledger in the target database (requires
 *                   BEYU_ADMIN_DATABASE_URL or DATABASE_URL). Without it the
 *                   stage is fully DB-free.
 *   --json          emit the machine-readable report instead of the matrix.
 *
 * Exit codes: 0 = coherent, 1 = integrity violation, 2 = database unreachable.
 *
 * Fail-closed by design: an unacknowledged discrepancy is a failure, not a
 * warning. Acknowledged historical metadata debt (see KNOWN_METADATA_DEBT) is
 * reported loudly but does not fail, so the debt cannot grow unnoticed without
 * a deliberate, reviewable edit to the register.
 *
 * This script never mutates anything: no database write, no file write.
 */
import "dotenv/config";
import { join } from "node:path";
import { blockingIssues, formatMatrix, reconcile, type LedgerRow } from "../../src/lib/migration/integrity";

const args = process.argv.slice(2);
const withLedger = args.includes("--with-ledger");
const asJson = args.includes("--json");
const drizzleDir = join(process.cwd(), "drizzle");

async function readLedger(): Promise<LedgerRow[]> {
  const url = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("--with-ledger requires BEYU_ADMIN_DATABASE_URL or DATABASE_URL");
    process.exit(2);
  }
  // Imported lazily so the DB-free path has no database dependency at all.
  const { Client } = await import("pg");
  const { buildPgConnectionConfig } = await import("../../src/db/tls");
  const { connectionString, ssl } = buildPgConnectionConfig(url, "BEYU_ADMIN_DATABASE_URL");
  const client = new Client({ connectionString, ssl, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
  } catch {
    // No DSN is echoed: connection failures are reported without their details.
    console.error("::error::MIGRATION INTEGRITY — database unreachable; cannot reconcile the ledger");
    process.exit(2);
  }
  try {
    const r = await client.query("select version, checksum, mode from beyu_migrations order by version");
    return r.rows as LedgerRow[];
  } catch {
    // An absent ledger table means migrations were never applied here, which is
    // a legitimate state for the DB-free stages — report it, do not invent rows.
    return [];
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const ledger = withLedger ? await readLedger() : undefined;
  const result = reconcile(drizzleDir, ledger);
  const blocking = blockingIssues(result);

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("BEYU OS — migration integrity reconciliation\n");
    console.log(formatMatrix(result));
    console.log(
      `\nsql files: ${result.sqlCount} · journal entries: ${result.journalCount} · snapshots: ${result.snapshotCount} · ledger rows: ${result.ledgerCount ?? "n/a"}`,
    );
    const ack = result.issues.filter((i) => i.acknowledged);
    console.log(`\nissues: ${result.issues.length} total · ${ack.length} acknowledged historical debt · ${blocking.length} blocking`);
    for (const i of ack) console.log(`  [acknowledged] ${i.code} ${i.subject} — ${i.detail}`);
    for (const i of blocking) console.log(`::error::${i.code} ${i.subject} — ${i.detail}`);
  }

  if (blocking.length > 0) {
    console.error(`\nMIGRATION INTEGRITY FAILED — ${blocking.length} unacknowledged discrepancy(ies).`);
    console.error(
      "A migration was added or altered without keeping its metadata honest. Either generate the missing metadata, or record the gap explicitly in KNOWN_METADATA_DEBT with a justification.",
    );
    process.exit(1);
  }

  console.log("\nMIGRATION INTEGRITY PASSED.");
}

main().catch((e) => {
  console.error("::error::MIGRATION INTEGRITY — unexpected failure");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
