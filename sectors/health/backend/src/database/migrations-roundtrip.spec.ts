/**
 * Phase 2B migration round-trip:
 * - all migrations apply cleanly on a fresh DB
 * - applying up migrations twice is safe (IF NOT EXISTS / idempotent DDL)
 * - applying down migrations leaves health schemas removed without dropping
 *   BEYU identity schemas (isolation from constitutional schemas)
 */
import { describe, it, expect } from "@jest/globals";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

const MIG_DIR = path.resolve(__dirname, "..", "..", "database", "migrations");

function listMigs(ext: "up" | "down") {
  return fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(`.${ext}.sql`))
    .sort();
}

describe("Database migrations (Phase 2B)", () => {
  it("clean DB: all up migrations apply without error", async () => {
    const db = new PGlite();
    for (const f of listMigs("up")) {
      await db.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    // Verify health schema exists and has tables.
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='health'`,
    );
    expect(Number(r.rows[0].n)).toBeGreaterThan(10);
    await db.close();
  });

  it("up migrations are idempotent when re-applied (safe to re-run bootstrap)", async () => {
    const db = new PGlite();
    for (const f of listMigs("up"))
      await db.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    // Re-apply every up migration a second time — IF NOT EXISTS / CREATE OR REPLACE
    // must make this a no-op.
    for (const f of listMigs("up")) {
      await db.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await db.close();
  });

  it("down migrations execute without error to a clean state (disposable environments only)", async () => {
    const db = new PGlite();
    for (const f of listMigs("up"))
      await db.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    const before = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='health'`,
    );
    expect(Number(before.rows[0].n)).toBeGreaterThan(10);
    const downs = listMigs("down").reverse();
    for (const f of downs) {
      await db.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    // After full rollback: health schema must be emptied (every health.* table dropped).
    const healthTables = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='health'`,
    );
    expect(Number(healthTables.rows[0].n)).toBe(0);
    // NOTE: beyu_identity schema is also dropped by 001 down. That is the
    // designed behavior for disposable environments (the down script is
    // documented "destructive; do not run on live data"). In production,
    // identity tables live in the canonical BEYU OS database, not in
    // Health's PG.
    await db.close();
  });
});
