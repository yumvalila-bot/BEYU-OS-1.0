/**
 * P2 — schema / migration drift gate.
 *
 * Two layers:
 *
 *   1. DB-free tests of the comparison and of the child-process trust rule. The
 *      trust rule is the single most important assertion in this file: it pins
 *      the defect P2 was opened for — a command that prints `Error: … collision`
 *      and then EXITS 0 must be a failure, never a pass.
 *   2. A real-PostgreSQL end-to-end run of the actual CI stage, asserting the
 *      applied migrations and `src/db/schema.ts` agree.
 *
 * Layer 2 is skipped when no database is configured, so the suite still runs in a
 * DB-free environment. In CI it runs after `npm run migrate`.
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DB_ONLY_TABLE_ALLOWLIST,
  assessToolOutcome,
  compareSnapshots,
  stripAnsi,
  type DrizzleSnapshot,
} from "../../src/lib/migration/drift";

// ─────────────────────────────────────────────────────────────────────────────
// The exit-0-with-error defect
// ─────────────────────────────────────────────────────────────────────────────

describe("P2 — a command that reports an error is a failure even when it exits 0", () => {
  // This is the verbatim output `npx drizzle-kit generate --name=ci_drift_check`
  // produces on this repository, captured during P2 forensics.
  const REAL_COLLISION_OUTPUT = `No config path provided, using default 'drizzle.config.ts'
Reading config file '/repo/drizzle.config.ts'
Error: [drizzle/meta/0038_snapshot.json, drizzle/meta/0039_snapshot.json] are pointing to a parent snapshot: drizzle/meta/0038_snapshot.json/snapshot.json which is a collision.`;

  it("the recorded collision output exits 0 yet MUST fail the gate", () => {
    const v = assessToolOutcome(0, REAL_COLLISION_OUTPUT, false);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/collision/i);
  });

  it("fails even if a snapshot artifact happens to exist", () => {
    // An error plus a stale artifact is still not a verified result.
    expect(assessToolOutcome(0, REAL_COLLISION_OUTPUT, true).ok).toBe(false);
  });

  it("a clean run that produced no artifact fails closed", () => {
    const v = assessToolOutcome(0, "[✓] 349 tables fetched\n[✓] done", false);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/no snapshot artifact/);
  });

  it("a clean run that produced its artifact passes", () => {
    expect(assessToolOutcome(0, "[✓] 349 tables fetched\n[✓] done", true).ok).toBe(true);
  });

  it("a non-zero exit fails regardless of output", () => {
    expect(assessToolOutcome(1, "all good", true).ok).toBe(false);
    expect(assessToolOutcome(2, "", false).ok).toBe(false);
  });

  it("recognises the other ways drizzle-kit fails without a useful exit code", () => {
    expect(assessToolOutcome(0, "Error  Please provide required params:\n    [x] dialect: undefined", false).reason).toMatch(
      /configuration incomplete/i,
    );
    expect(assessToolOutcome(0, "[✗] something broke", true).ok).toBe(false);
    expect(assessToolOutcome(0, "connect ECONNREFUSED 127.0.0.1:5432", true).ok).toBe(false);
  });

  it("ANSI colour codes cannot hide an error from the signatures", () => {
    const coloured = "\u001b[31m\u001b[1mError\u001b[22m\u001b[39m: snapshot collision";
    expect(stripAnsi(coloured)).toBe("Error: snapshot collision");
    expect(assessToolOutcome(0, coloured, true).ok).toBe(false);
  });

  it("an ordinary line containing the word 'error' in a path is not a false failure", () => {
    // The signature is anchored to a line START, so prose mentioning errors
    // (this very comment, or a filename) does not trip it.
    expect(assessToolOutcome(0, "[✓] handled 3 error_log rows", true).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The comparison
// ─────────────────────────────────────────────────────────────────────────────

const table = (name: string, over: Record<string, unknown> = {}) => ({
  [name]: {
    name,
    columns: { id: { name: "id", type: "text", notNull: true } },
    indexes: {},
    foreignKeys: {},
    compositePrimaryKeys: {},
    uniqueConstraints: {},
    checkConstraints: {},
    ...over,
  },
});

describe("P2 — drift comparison detects real divergence", () => {
  it("a table declared in the schema but never created by a migration is drift", () => {
    const db: DrizzleSnapshot = { tables: table("tenants") };
    const declared: DrizzleSnapshot = { tables: { ...table("tenants"), ...table("ghost") } };
    const r = compareSnapshots(db, declared);
    expect(r.blocking.map((d) => `${d.kind}:${d.subject}`)).toContain("table:ghost");
    expect(r.blocking[0].direction).toBe("DECLARED_NOT_IN_DB");
  });

  it("the runner's own ledger table is allowlisted and does not fail the gate", () => {
    const db: DrizzleSnapshot = { tables: { ...table("tenants"), ...table("beyu_migrations") } };
    const declared: DrizzleSnapshot = { tables: table("tenants") };
    const r = compareSnapshots(db, declared);
    expect(r.blocking).toEqual([]);
    expect(DB_ONLY_TABLE_ALLOWLIST).toEqual(["beyu_migrations"]);
  });

  it("an unallowlisted table present only in the database is drift", () => {
    const db: DrizzleSnapshot = { tables: { ...table("tenants"), ...table("orphan_leftover") } };
    const declared: DrizzleSnapshot = { tables: table("tenants") };
    const r = compareSnapshots(db, declared);
    expect(r.blocking.map((d) => d.subject)).toContain("orphan_leftover");
  });

  it("the P2 index drift is detected — declared in schema, created by no migration", () => {
    const idx = { payment_webhook_events_tenant_idx: { name: "payment_webhook_events_tenant_idx", columns: ["tenant_id"] } };
    const db: DrizzleSnapshot = { tables: table("payment_webhook_events") };
    const declared: DrizzleSnapshot = { tables: table("payment_webhook_events", { indexes: idx }) };
    const r = compareSnapshots(db, declared);
    expect(r.blocking.map((d) => `${d.kind}:${d.subject}`)).toContain("index:payment_webhook_events_tenant_idx");
  });

  it("an index that exists in the database but not in the schema is informational, not blocking", () => {
    // BEYU's integrity migrations legitimately add append-only hash-chain
    // indexes the ORM does not model. Failing on those would make the gate
    // permanently red.
    const idx = { audit_log_prev_hash_uidx: { name: "audit_log_prev_hash_uidx", columns: ["prev_hash"], isUnique: true } };
    const db: DrizzleSnapshot = { tables: table("audit_log", { indexes: idx }) };
    const declared: DrizzleSnapshot = { tables: table("audit_log") };
    const r = compareSnapshots(db, declared);
    expect(r.blocking).toEqual([]);
    expect(r.informational.map((d) => d.subject)).toContain("audit_log_prev_hash_uidx");
  });

  it("an index definition mismatch is blocking", () => {
    const dbIdx = { t_idx: { name: "t_idx", columns: ["a"], isUnique: false } };
    const decIdx = { t_idx: { name: "t_idx", columns: ["a", "b"], isUnique: true } };
    const r = compareSnapshots({ tables: table("t", { indexes: dbIdx }) }, { tables: table("t", { indexes: decIdx }) });
    expect(r.blocking.map((d) => d.detail).join()).toMatch(/definition mismatch/);
  });

  it("a column type mismatch is blocking", () => {
    const db: DrizzleSnapshot = { tables: table("t", { columns: { c: { name: "c", type: "integer", notNull: false } } }) };
    const dec: DrizzleSnapshot = { tables: table("t", { columns: { c: { name: "c", type: "text", notNull: false } } }) };
    expect(compareSnapshots(db, dec).blocking.map((d) => d.detail).join()).toMatch(/type mismatch/);
  });

  it("a nullability mismatch is blocking — tightening nullability breaks old writers", () => {
    const db: DrizzleSnapshot = { tables: table("t", { columns: { c: { name: "c", type: "text", notNull: false } } }) };
    const dec: DrizzleSnapshot = { tables: table("t", { columns: { c: { name: "c", type: "text", notNull: true } } }) };
    expect(compareSnapshots(db, dec).blocking.map((d) => d.detail).join()).toMatch(/nullability mismatch/);
  });

  it("a column present in the database but undeclared is blocking", () => {
    const db: DrizzleSnapshot = { tables: table("t", { columns: { id: { name: "id", type: "text", notNull: true }, extra: { name: "extra", type: "text", notNull: false } } }) };
    const dec: DrizzleSnapshot = { tables: table("t") };
    expect(compareSnapshots(db, dec).blocking.map((d) => `${d.direction}:${d.subject}`)).toContain("IN_DB_NOT_DECLARED:extra");
  });

  it("check constraints are matched by NAME, not by rewritten expression text", () => {
    // PostgreSQL rewrites `status IN ('A','B')` into
    // `status = ANY (ARRAY['A'::text,'B'::text])`. Comparing expression text
    // reported 17 phantom drifts against migrations that were in fact correct.
    const db: DrizzleSnapshot = {
      tables: table("ujenzi_projects", {
        checkConstraints: { ujenzi_projects_status_ck: { name: "ujenzi_projects_status_ck", value: "status = ANY (ARRAY['PLANNED'::text])" } },
      }),
    };
    const dec: DrizzleSnapshot = {
      tables: table("ujenzi_projects", {
        checkConstraints: { ujenzi_projects_status_ck: { name: "ujenzi_projects_status_ck", value: "status IN ('PLANNED')" } },
      }),
    };
    expect(compareSnapshots(db, dec).blocking).toEqual([]);
  });

  it("a declared check constraint that no migration creates is still blocking", () => {
    const dec: DrizzleSnapshot = {
      tables: table("t", { checkConstraints: { t_status_ck: { name: "t_status_ck", value: "status IN ('A')" } } }),
    };
    expect(compareSnapshots({ tables: table("t") }, dec).blocking.map((d) => d.subject)).toContain("t_status_ck");
  });

  it("foreign keys are matched by content, never by their synthesised name", () => {
    const dbFk = { aaa_bbb_fk: { tableFrom: "t", tableTo: "p", columnsFrom: ["p_id"], columnsTo: ["id"] } };
    const decFk = { t_p_id_p_id_fk: { tableFrom: "t", tableTo: "p", columnsFrom: ["p_id"], columnsTo: ["id"] } };
    expect(compareSnapshots({ tables: table("t", { foreignKeys: dbFk }) }, { tables: table("t", { foreignKeys: decFk }) }).blocking).toEqual([]);
    const decOther = { x: { tableFrom: "t", tableTo: "other", columnsFrom: ["p_id"], columnsTo: ["id"] } };
    expect(compareSnapshots({ tables: table("t", { foreignKeys: dbFk }) }, { tables: table("t", { foreignKeys: decOther }) }).blocking.length).toBe(1);
  });

  it("an enum declared but not created is blocking", () => {
    const r = compareSnapshots({ tables: table("t"), enums: {} }, { tables: table("t"), enums: { beyu_status: {} } });
    expect(r.blocking.map((d) => `${d.kind}:${d.subject}`)).toContain("enum:beyu_status");
  });

  it("identical snapshots produce no differences at all", () => {
    const s: DrizzleSnapshot = { tables: table("t"), enums: {} };
    const r = compareSnapshots(s, JSON.parse(JSON.stringify(s)));
    expect(r.differences).toEqual([]);
    expect(r.blocking).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end against real PostgreSQL — runs the actual CI stage
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const dbConfigured = Boolean(ADMIN_URL) && existsSync(join(process.cwd(), "drizzle"));

describe.skipIf(!dbConfigured)("P2 — drift gate end-to-end against real PostgreSQL", () => {
  // Async, not spawnSync: a blocking child process for ~75s stalls vitest's
  // worker heartbeat and produces a spurious "Timeout calling onTaskUpdate".
  const run = promisify(execFile);

  it(
    "the shipped CI stage reports no drift between the applied migrations and src/db/schema",
    async () => {
      let stdout = "";
      let status = 0;
      try {
        // Invokes scripts/migration/schema-drift.ts exactly as CI does, so this
        // covers the real command line rather than a reimplementation of it.
        const r = await run("npx", ["tsx", "scripts/migration/schema-drift.ts", "--json"], {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 64 * 1024 * 1024,
        });
        stdout = r.stdout;
      } catch (e) {
        const err = e as { code?: number; stdout?: string };
        status = typeof err.code === "number" ? err.code : 1;
        stdout = err.stdout ?? "";
      }

      // --json keeps stdout a single JSON document; progress goes to stderr.
      const report = JSON.parse(stripAnsi(stdout));
      if (status !== 0) {
        const detail = (report.blocking ?? [])
          .map((d: { kind: string; table: string; subject: string; detail: string }) => `${d.kind} ${d.table}.${d.subject}: ${d.detail}`)
          .join("\n");
        throw new Error(`schema drift gate exited ${status}\n${detail}`);
      }

      expect(report.blocking).toEqual([]);
      expect(report.dbTableCount).toBeGreaterThan(300);
      expect(report.declaredTableCount).toBeGreaterThan(300);
    },
    300_000,
  );

  it(
    "the migration integrity stage passes with the ledger reconciled",
    async () => {
      let out = "";
      let status = 0;
      try {
        const r = await run("npx", ["tsx", "scripts/migration/integrity.ts", "--with-ledger"], {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 16 * 1024 * 1024,
        });
        out = `${r.stdout}\n${r.stderr}`;
      } catch (e) {
        const err = e as { code?: number; stdout?: string; stderr?: string };
        status = typeof err.code === "number" ? err.code : 1;
        out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      }
      out = stripAnsi(out);
      if (status !== 0) throw new Error(`migration integrity exited ${status}\n${out.slice(-3000)}`);
      expect(out).toContain("MIGRATION INTEGRITY PASSED");
      // The ledger must account for every SQL file on disk.
      expect(out).toMatch(/ledger rows: \d+/);
      expect(out).not.toContain("LEDGER_MISSING_MIGRATION");
      expect(out).not.toContain("LEDGER_CHECKSUM_MISMATCH");
      expect(out).not.toContain("LEDGER_UNEXPECTED_MIGRATION");
    },
    180_000,
  );
});
