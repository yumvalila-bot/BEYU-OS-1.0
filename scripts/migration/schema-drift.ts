/**
 * BEYU OS — P2 SCHEMA / MIGRATION DRIFT gate.
 *
 *   usage: tsx scripts/migration/schema-drift.ts [--json] [--keep-artifacts]
 *
 * Proves that the schema produced by applying every `drizzle/ *.sql` migration is
 * the schema `src/db/schema.ts` declares. Requires a PostgreSQL that has already
 * been migrated (run `npm run migrate` first); connects with the admin DSN, the
 * same one `scripts/migrate.ts` uses, and performs NO writes.
 *
 * WHY THE OLD GATE WAS REPLACED
 * ─────────────────────────────
 * `npx drizzle-kit generate --name=ci_drift_check` on this repository prints
 *
 *   Error: [drizzle/meta/0038_snapshot.json, drizzle/meta/0039_snapshot.json]
 *   are pointing to a parent snapshot: … which is a collision.
 *
 * and then EXITS 0 having written nothing. The old gate compared
 * `ls drizzle/*.sql | wc -l` before and after, saw no change, and printed "No
 * schema drift." It never ran a comparison. This script does the opposite: a
 * command that exits 0 but reports an error, or that fails to produce the
 * artifact it was asked for, is a FAILURE — not a pass. Ambiguity fails closed.
 *
 * Because it measures two fresh snapshots (introspection of the real database vs
 * generation from schema.ts) in throwaway directories, it does not read or trust
 * `drizzle/meta` at all. Editing metadata cannot make it green, and the known
 * historical metadata debt cannot make it red.
 *
 * Exit codes: 0 = no drift, 1 = drift or unverifiable state, 2 = DB unreachable.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessToolOutcome,
  compareSnapshots,
  stripAnsi,
  type DrizzleSnapshot,
  type DriftDifference,
} from "../../src/lib/migration/drift";

const args = process.argv.slice(2);
const asJson = args.includes("--json");

/**
 * Progress goes to stderr in --json mode so stdout stays a single valid JSON
 * document that a machine can parse. In human mode it stays on stdout.
 */
const log = (msg: string): void => (asJson ? console.error(msg) : console.log(msg));
const keepArtifacts = args.includes("--keep-artifacts");

const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("::error::SCHEMA DRIFT — BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");
  process.exit(2);
}

interface KitResult {
  ok: boolean;
  code: number;
  output: string;
  reason?: string;
}

/** Run drizzle-kit and decide success from BOTH the exit code and the output. */
function runDrizzleKit(label: string, kitArgs: string[], expectDir: string): KitResult {
  const proc = spawnSync("npx", ["drizzle-kit", ...kitArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: adminUrl, BEYU_ADMIN_DATABASE_URL: adminUrl },
    maxBuffer: 64 * 1024 * 1024,
  });

  const output = stripAnsi(`${proc.stdout ?? ""}\n${proc.stderr ?? ""}`);
  const code = proc.status ?? -1;

  if (proc.error) return { ok: false, code, output, reason: `failed to start drizzle-kit: ${proc.error.message}` };

  // Even a clean, error-free run is untrustworthy if it produced nothing.
  const metaDir = join(expectDir, "meta");
  let snapshot: string | undefined;
  try {
    snapshot = readdirSync(metaDir)
      .filter((f) => /^\d+_snapshot\.json$/.test(f))
      .sort()
      .at(-1);
  } catch {
    snapshot = undefined;
  }

  const verdict = assessToolOutcome(code, output, snapshot !== undefined);
  if (!verdict.ok) return { ok: false, code, output, reason: verdict.reason };

  log(`[schema-drift] ${label}: ok (exit ${code}) \u2192 ${join("meta", snapshot!)}`);
  return { ok: true, code, output };
}

function readSnapshot(dir: string): DrizzleSnapshot {
  const metaDir = join(dir, "meta");
  const file = readdirSync(metaDir)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort()
    .at(-1)!;
  return JSON.parse(readFileSync(join(metaDir, file), "utf8")) as DrizzleSnapshot;
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "beyu-schema-drift-"));
  const pullDir = join(work, "db");
  const genDir = join(work, "declared");

  try {
    // STEP 1 — the schema the MIGRATIONS actually produce, read from the live DB.
    const pull = runDrizzleKit(
      "introspect migrated database",
      ["pull", "--dialect", "postgresql", "--url", adminUrl!, "--out", pullDir],
      pullDir,
    );
    if (!pull.ok) {
      console.error(`::error::SCHEMA DRIFT unverifiable — ${pull.reason}`);
      console.error(pull.output.trim());
      process.exit(1);
    }

    // STEP 2 — the schema src/db/schema.ts DECLARES. Written to an isolated
    // folder, so the committed drizzle/ directory is never touched.
    const gen = runDrizzleKit(
      "render src/db/schema.ts",
      ["generate", "--dialect", "postgresql", "--schema", "./src/db/schema.ts", "--out", genDir, "--name", "drift_probe"],
      genDir,
    );
    if (!gen.ok) {
      console.error(`::error::SCHEMA DRIFT unverifiable — ${gen.reason}`);
      console.error(gen.output.trim());
      process.exit(1);
    }

    const db = readSnapshot(pullDir);
    const declared = readSnapshot(genDir);
    const result = compareSnapshots(db, declared);

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      log(
        `\n[schema-drift] database tables: ${result.dbTableCount} · declared tables: ${result.declaredTableCount}`,
      );
      log(
        `[schema-drift] differences: ${result.differences.length} total · ${result.blocking.length} blocking · ${result.informational.length} informational`,
      );
      for (const d of result.blocking) printDiff(d, true);
      if (result.informational.length > 0) {
        log(
          "\n[schema-drift] informational — database-side objects the ORM does not model (created by integrity migrations):",
        );
        for (const d of result.informational) printDiff(d, false);
      }
    }

    if (result.blocking.length > 0) {
      console.error(
        `\n::error::SCHEMA DRIFT DETECTED — ${result.blocking.length} divergence(s) between the applied migrations and src/db/schema.`,
      );
      console.error(
        "Fix the divergence: add a migration that creates what the schema declares, or correct the declaration. Do not weaken this gate.",
      );
      process.exit(1);
    }

    log("\nSCHEMA DRIFT PASSED — the applied migrations and src/db/schema agree.");
  } finally {
    if (keepArtifacts) console.log(`[schema-drift] artifacts kept at ${work}`);
    else rmSync(work, { recursive: true, force: true });
  }
}

function printDiff(d: DriftDifference, blocking: boolean): void {
  const prefix = blocking ? "::error::" : "  [info]";
  log(`${prefix}${d.direction} ${d.kind} ${d.table}.${d.subject} — ${d.detail}`);
}

main().catch((e) => {
  console.error("::error::SCHEMA DRIFT — unexpected failure");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
