/**
 * BEYU OS — P2 EXPAND/CONTRACT SAFETY stage.
 *
 *   usage: tsx scripts/migration/expand-contract.ts [--json]
 *
 * The database-compatibility portion of the release lifecycle:
 *
 *     EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT
 *     └────── P2 covers these ──────┘                  └─ CONTRACT SAFETY ─┘
 *
 * Canary and promotion are later phases; nothing here routes traffic or changes
 * release identity.
 *
 * THE INVARIANT
 *   The new schema must stay compatible with the CURRENT release and the NEXT
 *   release for the whole expansion window. A migration that removes or narrows
 *   something a still-running release depends on is an early contraction and
 *   must stop the line.
 *
 * WHAT IT ENFORCES (the smallest enforceable contract)
 *   1. every migration classifies as EXPAND or CONTRACT — never unknown;
 *   2. no migration outside HISTORICAL_DESTRUCTIVE_MIGRATIONS is a CONTRACT;
 *   3. no migration contains a destructive operation (DROP TABLE / DROP COLUMN /
 *      TRUNCATE / DROP SCHEMA|DATABASE / privilege escalation) unless it is a
 *      registered historical migration;
 *   4. the register itself cannot silently grow — it is asserted against the
 *      live scan, so registering a new destructive migration is a deliberate,
 *      reviewable edit rather than a way to quiet the gate.
 *
 * It reuses the scanner in src/lib/migration/integrity.ts — the same one
 * scripts/db-release.ts uses for its production preflight — so there is exactly
 * one definition of "destructive" in the repository. No second migration runner,
 * no speculative SQL parser.
 *
 * This stage is read-only: it inspects files and exits. Exit 0 = safe, 1 = not.
 */
import {
  HISTORICAL_DESTRUCTIVE_MIGRATIONS,
  classifyMigration,
  readMigrationFiles,
  scanDestructive,
} from "../../src/lib/migration/integrity";
import { join } from "node:path";

const asJson = process.argv.slice(2).includes("--json");

/**
 * Progress goes to stderr in --json mode so stdout stays a single valid JSON
 * document a machine can parse. In human mode it stays on stdout.
 */
const log = (msg: string): void => (asJson ? console.error(msg) : console.log(msg));

function main(): void {
  const files = readMigrationFiles(join(process.cwd(), "drizzle"));
  const registered = new Set<string>(HISTORICAL_DESTRUCTIVE_MIGRATIONS);

  const rows = files.map((f) => {
    const c = classifyMigration(f.sql);
    const d = scanDestructive(f.sql);
    return { seq: f.seq, version: f.version, verdict: c.verdict, expand: c.expand, contract: c.contract, destructive: d };
  });

  const failures: string[] = [];

  // (1) total classification — an unclassifiable migration is an ambiguous state.
  for (const r of rows) if (r.verdict !== "EXPAND" && r.verdict !== "CONTRACT") failures.push(`${r.version}: unclassifiable migration`);

  // (2) no unregistered contraction.
  for (const r of rows) {
    if (r.verdict === "CONTRACT" && !registered.has(r.version))
      failures.push(`${r.version}: unsafe early contraction (${r.contract.join(", ")}) — not a registered historical migration`);
  }

  // (3) no unregistered destructive operation.
  for (const r of rows) {
    if (r.destructive.length > 0 && !registered.has(r.version))
      failures.push(`${r.version}: destructive operations (${r.destructive.join(", ")}) — not a registered historical migration`);
  }

  // (4) the register must not carry entries that are no longer destructive. A
  // stale entry would let a future rewrite of that file slip through unnoticed.
  const destructiveNow = new Set(rows.filter((r) => r.destructive.length > 0).map((r) => r.version));
  for (const v of registered) {
    if (!destructiveNow.has(v)) failures.push(`HISTORICAL_DESTRUCTIVE_MIGRATIONS lists ${v}, which no longer contains a destructive operation — remove the stale entry`);
    if (!files.some((f) => f.version === v)) failures.push(`HISTORICAL_DESTRUCTIVE_MIGRATIONS lists ${v}, which is not a migration in drizzle/`);
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: failures.length === 0, failures, rows }, null, 2));
  } else {
    log("BEYU OS — Expand/Contract safety\n");
    log("seq  | verdict  | destructive | expand reasons");
    for (const r of rows)
      console.log(
        `${r.seq} | ${r.verdict.padEnd(8)} | ${(r.destructive.join("+") || "-").padEnd(11)} | ${r.expand.join(",") || "-"}`,
      );
    const contractions = rows.filter((r) => r.verdict === "CONTRACT");
    log(
      `\n${files.length} migrations · ${rows.length - contractions.length} EXPAND · ${contractions.length} CONTRACT · registered destructive: ${[...registered].join(", ") || "(none)"}`,
    );
    for (const f of failures) console.log(`::error::EXPAND/CONTRACT ${f}`);
  }

  if (failures.length > 0) {
    console.error(`\nEXPAND/CONTRACT SAFETY FAILED — ${failures.length} violation(s).`);
    console.error(
      "An early contraction or destructive operation reached the migration set without review. Split it into an expand phase and a later contract phase, or register it explicitly with justification.",
    );
    process.exit(1);
  }

  log("\nEXPAND/CONTRACT SAFETY PASSED.");
}

main();
