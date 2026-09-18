/**
 * BEYU OS — P2 drift-gate self-test (the acceptance proof).
 *
 *   usage: tsx scripts/migration/gate-selftest.ts [--json] [--keep]
 *
 * WHY THIS EXISTS
 * ───────────────
 * A gate that has only ever been observed to pass proves nothing. The previous
 * drift check was green for the entire life of the repository while comparing
 * nothing at all. So P2 does not merely assert "the gate passes on main" — it
 * exercises the gate against deliberately broken states and asserts that it
 * FAILS on each of them.
 *
 * The acceptance condition is that the gate separates three outcomes:
 *
 *     VALID            → PASS
 *     DRIFT            → FAIL
 *     AMBIGUOUS / ERROR→ FAIL (never silently pass)
 *
 * CASES
 *   1  VALID                    46 migrations applied to a clean database   → PASS
 *   2  IDEMPOTENT               runner re-run applies nothing               → PASS
 *   3  MISSING MIGRATION        ledger row deleted                          → FAIL
 *   4  CHECKSUM MISMATCH        ledger checksum altered                     → FAIL
 *   5  EXTRA MIGRATION          unexpected ledger row inserted              → FAIL
 *   6  SCHEMA DRIFT             orphan table created in the database        → FAIL
 *   7  METADATA COLLISION       the live 0038/0039 collision, exit 0        → FAIL
 *   8  METADATA INCOMPLETE      real repo state: incomplete drizzle/meta but
 *                               valid SQL + ledger + schema                 → PASS
 *
 * Case 7 is the point of the whole exercise: `drizzle-kit generate` prints
 * `Error: … which is a collision.` and exits 0. The old gate compared
 * `ls drizzle/ *.sql | wc -l` before and after, so it PASSED. This harness
 * reproduces that exact behaviour, demonstrates the old logic would have passed,
 * and asserts the new gate does not.
 *
 * SAFETY
 * ──────
 * Every mutating case runs against a DISPOSABLE scratch database created and
 * dropped by this script. `beyu_os` is never modified, and no experimental or
 * destructive SQL is ever directed at a non-scratch database. The scratch name
 * is random, and the script refuses to run if the admin DSN does not point at a
 * loopback host — this harness is for local and CI PostgreSQL only.
 *
 * Exit 0 = every case behaved as expected, 1 = a case did not, 2 = setup failed.
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { assessToolOutcome } from "../../src/lib/migration/drift";

const run = promisify(execFile);
const asJson = process.argv.slice(2).includes("--json");
const keep = process.argv.slice(2).includes("--keep");

/**
 * Progress goes to stderr in --json mode so stdout stays a single valid JSON
 * document. In human mode it stays on stdout.
 */
const log = (msg: string): void => (asJson ? console.error(msg) : console.log(msg));

interface CaseResult {
  id: string;
  name: string;
  expected: "PASS" | "FAIL";
  actual: "PASS" | "FAIL";
  ok: boolean;
  detail: string;
}

const results: CaseResult[] = [];

function record(id: string, name: string, expected: "PASS" | "FAIL", actual: "PASS" | "FAIL", detail: string): boolean {
  const ok = expected === actual;
  results.push({ id, name, expected, actual, ok, detail });
  if (!asJson) log(`[selftest] case ${id} ${ok ? "ok" : "MISBEHAVED"} — expected ${expected}, got ${actual} · ${detail}`);
  return ok;
}

/** Run a repository script and return its exit code without throwing. */
async function scriptExit(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  try {
    const r = await run("npx", ["tsx", script, ...args], {
      cwd: process.cwd(),
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out: `${r.stdout}\n${r.stderr}` };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof err.code === "number" ? err.code : 1, out: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
}

async function main(): Promise<void> {
  const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) {
    console.error("::error::gate-selftest requires BEYU_ADMIN_DATABASE_URL or DATABASE_URL");
    process.exit(2);
  }

  // Refuse to run against anything but loopback: this harness deliberately
  // corrupts a database and must never be pointed at a real deployment.
  const host = new URL(adminUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error(`::error::gate-selftest refuses to run against non-loopback host "${host}"`);
    process.exit(2);
  }

  const scratch = `beyu_p2_selftest_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const maintUrl = new URL(adminUrl);
  maintUrl.pathname = "/postgres";
  const scratchUrl = new URL(adminUrl);
  scratchUrl.pathname = `/${scratch}`;

  const maint = new pg.Client({ connectionString: maintUrl.toString() });
  await maint.connect();
  await maint.query(`create database ${scratch}`);
  await maint.end();
  log(`[selftest] disposable scratch database created: ${scratch}`);

  const scratchEnv = {
    ...process.env,
    DATABASE_URL: scratchUrl.toString(),
    BEYU_ADMIN_DATABASE_URL: scratchUrl.toString(),
    BEYU_TEST_DATABASE_URL: scratchUrl.toString(),
  };

  // One managed client for the whole run. Leaking clients is not cosmetic:
  // `drop database … with (force)` terminates them, and an unhandled 'error'
  // event on a pg.Client crashes the process mid-report.
  const scratchClient = new pg.Client({ connectionString: scratchUrl.toString() });
  scratchClient.on("error", () => undefined);
  await scratchClient.connect();
  const q = async (sql: string) => (await scratchClient.query(sql)).rows;

  // Exact ledger backup, populated once case 1 has applied the migrations.
  // Cases 3–5 mutate the ledger, and the runner cannot simply be re-run to
  // repair it: the schema is no longer empty, so migrate.ts correctly refuses
  // historical migration 0001. Restoring the recorded rows is both accurate and
  // a further demonstration that the destructive guard works.
  let ledgerBackup: Array<{ version: string; checksum: string; mode: string; description: string | null }> = [];
  const restoreLedger = async (): Promise<void> => {
    await q("delete from beyu_migrations");
    for (const r of ledgerBackup)
      await scratchClient.query("insert into beyu_migrations(version, checksum, mode, description) values ($1,$2,$3,$4)", [
        r.version,
        r.checksum,
        r.mode,
        r.description,
      ]);
  };

  try {
    // ── CASE 1 — VALID: clean apply ─────────────────────────────────────────
    {
      const r = await scriptExit("scripts/migrate.ts", [], scratchEnv);
      const rows = await q("select count(*)::int n from beyu_migrations");
      record("1", "VALID — clean apply of every canonical migration", "PASS", r.code === 0 ? "PASS" : "FAIL", `exit ${r.code}, ledger rows ${rows[0]?.n}`);
    }

    // ── CASE 2 — IDEMPOTENT: re-run applies nothing ─────────────────────────
    {
      const before = (await q("select count(*)::int n from beyu_migrations"))[0].n;
      const r = await scriptExit("scripts/migrate.ts", [], scratchEnv);
      const after = (await q("select count(*)::int n from beyu_migrations"))[0].n;
      record("2", "IDEMPOTENT — re-run applies nothing", "PASS", r.code === 0 && before === after ? "PASS" : "FAIL", `exit ${r.code}, ledger ${before} → ${after}`);
      ledgerBackup = await q("select version, checksum, mode, description from beyu_migrations");
    }

    // ── CASE 8 — METADATA INCOMPLETE BUT PRODUCTION TRUTH VALID ─────────────
    // The real repository state: drizzle/meta is missing 9 snapshots and 6
    // journal entries, and 0038/0039 collide. The SQL, the ledger and the
    // resulting schema are all correct. Metadata is design-time scaffolding
    // with no runtime consumer, so this MUST pass — and it passes because the
    // gate is built on measured truth, not on drizzle/meta.
    {
      const integrity = await scriptExit("scripts/migration/integrity.ts", ["--with-ledger"], scratchEnv);
      const drift = await scriptExit("scripts/migration/schema-drift.ts", [], scratchEnv);
      const ok = integrity.code === 0 && drift.code === 0;
      record(
        "8",
        "METADATA INCOMPLETE — valid SQL/ledger/schema, incomplete drizzle/meta",
        "PASS",
        ok ? "PASS" : "FAIL",
        `integrity exit ${integrity.code}, drift exit ${drift.code} (metadata treated as non-authoritative)`,
      );
    }

    // ── CASE 6 — SCHEMA DRIFT: orphan object in the database ────────────────
    {
      await q("create table p2_drift_probe_orphan (id text primary key, surprise text)");
      const drift = await scriptExit("scripts/migration/schema-drift.ts", [], scratchEnv);
      const caught = /p2_drift_probe_orphan/.test(drift.out);
      // Clean up so later cases start from the validated state again.
      await q("drop table if exists p2_drift_probe_orphan");
      record("6", "SCHEMA DRIFT — orphan table present in the database", "FAIL", drift.code !== 0 && caught ? "FAIL" : "PASS", `exit ${drift.code}, orphan named in report: ${caught}`);
    }

    // ── CASE 3 — MISSING MIGRATION ──────────────────────────────────────────
    {
      await q("delete from beyu_migrations where version like '0044%'");
      const r = await scriptExit("scripts/migration/integrity.ts", ["--with-ledger"], scratchEnv);
      const caught = /LEDGER_MISSING_MIGRATION/.test(r.out);
      await restoreLedger();
      record("3", "MISSING MIGRATION — ledger row absent", "FAIL", r.code !== 0 && caught ? "FAIL" : "PASS", `exit ${r.code}, LEDGER_MISSING_MIGRATION reported: ${caught}`);
    }

    // ── CASE 4 — CHECKSUM MISMATCH ──────────────────────────────────────────
    {
      await q("update beyu_migrations set checksum = repeat('f',64) where version like '0045%'");
      const r = await scriptExit("scripts/migration/integrity.ts", ["--with-ledger"], scratchEnv);
      const caught = /LEDGER_CHECKSUM_MISMATCH/.test(r.out);
      await restoreLedger();
      record("4", "CHECKSUM MISMATCH — ledger identity differs from file", "FAIL", r.code !== 0 && caught ? "FAIL" : "PASS", `exit ${r.code}, LEDGER_CHECKSUM_MISMATCH reported: ${caught}`);
    }

    // ── CASE 5 — EXTRA MIGRATION ────────────────────────────────────────────
    {
      await q("insert into beyu_migrations(version, checksum, mode) values ('9999_not_a_real_migration', repeat('a',64), 'APPLIED')");
      const r = await scriptExit("scripts/migration/integrity.ts", ["--with-ledger"], scratchEnv);
      const caught = /LEDGER_UNEXPECTED_MIGRATION/.test(r.out);
      await restoreLedger();
      record("5", "EXTRA MIGRATION — unexpected ledger row", "FAIL", r.code !== 0 && caught ? "FAIL" : "PASS", `exit ${r.code}, LEDGER_UNEXPECTED_MIGRATION reported: ${caught}`);
    }

    // ── CASE 7 — METADATA COLLISION, error + exit 0 ─────────────────────────
    {
      // Reproduce the live condition against the real repository metadata.
      let code = -1;
      let out = "";
      try {
        const r = await run("npx", ["drizzle-kit", "generate", "--name", "p2_selftest_probe"], {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 16 * 1024 * 1024,
        });
        code = 0;
        out = `${r.stdout}\n${r.stderr}`;
      } catch (e) {
        const err = e as { code?: number; stdout?: string; stderr?: string };
        code = typeof err.code === "number" ? err.code : 1;
        out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      }
      const reportedCollision = /collision/i.test(out);

      // The OLD gate: compare the SQL file count before and after. Because the
      // command aborts having written nothing, the count is unchanged and the
      // old gate declares "No schema drift" — a PASS on an ERROR.
      const oldGateWouldPass = code === 0;

      // The NEW rule: an error in the output is a failure regardless of exit
      // code, and a run that produced no snapshot is unverifiable.
      const verdict = assessToolOutcome(code, out, false);

      const detail = `drizzle-kit exit ${code}, reported collision: ${reportedCollision}, OLD gate would have passed: ${oldGateWouldPass}, new gate ok=${verdict.ok} (${verdict.reason ?? "n/a"})`;
      const ok = reportedCollision && oldGateWouldPass && verdict.ok === false;
      record("7", "METADATA COLLISION — error reported with exit 0 must not pass", "FAIL", ok ? "FAIL" : "PASS", detail);
    }
  } finally {
    await scratchClient.end().catch(() => undefined);
    if (keep) {
      log(`[selftest] --keep: scratch database ${scratch} retained for inspection`);
    } else {
      const m = new pg.Client({ connectionString: maintUrl.toString() });
      await m.connect();
      await m.query(`drop database if exists ${scratch} with (force)`);
      await m.end();
      log(`[selftest] disposable scratch database dropped: ${scratch}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (asJson) {
    console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  } else {
    log("\nBEYU OS — drift-gate self-test\n");
    log("case | expected | actual | ok   | name");
    for (const r of results)
      log(`${r.id.padEnd(4)} | ${r.expected.padEnd(8)} | ${r.actual.padEnd(6)} | ${r.ok ? "ok" : "FAIL"} | ${r.name}`);
    log("");
    for (const r of results) log(`  case ${r.id}: ${r.detail}`);
  }

  if (failed.length > 0) {
    console.error(`\n::error::GATE SELF-TEST FAILED — ${failed.length} case(s) did not behave as expected: ${failed.map((f) => f.id).join(", ")}`);
    process.exit(1);
  }
  log(`\nGATE SELF-TEST PASSED — ${results.length}/${results.length} cases behaved as expected.`);
  log("The gate separates VALID (pass) from DRIFT (fail) from AMBIGUOUS/ERROR (fail).");
}

main().catch((e) => {
  console.error("::error::gate-selftest setup or execution failure");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
});
