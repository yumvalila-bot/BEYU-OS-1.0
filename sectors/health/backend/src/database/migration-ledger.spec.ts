/**
 * Migration ledger — real PostgreSQL engine (PGlite) tests.
 *
 *   T-2  The Health runner must refuse a root-BEYU-shaped `beyu_migrations`
 *        ledger BEFORE issuing any statement (no ALTER of another authority's
 *        governed evidence).
 *   DEP-3 Readiness evidence: after the full 001..N chain is applied through
 *        the governed ledger, `readMigrationState` is `up` and its fingerprint
 *        equals the source governance fingerprint.
 */
import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../modules/identity/db-connection";
import {
  assertNotForeignLedger,
  ForeignLedgerError,
  inspectLedger,
  readMigrationState,
} from "./migration-ledger";
import {
  HEALTH_MIGRATION_OWNER,
  HEALTH_MIGRATION_SECTOR,
  readHealthMigrations,
  verifyGovernance,
} from "./migration-governance";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "database",
  "migrations",
);

/** Exact DDL of the root BEYU OS ledger (scripts/migrate.ts ensureMetadata). */
const ROOT_LEDGER_DDL = `create table if not exists beyu_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now(),
    mode text not null,
    description text
  )`;

async function columnsOf(conn: PGliteConnection): Promise<string[]> {
  const rows = await conn.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'beyu_migrations'
      ORDER BY column_name`,
  );
  return rows.map((r) => r.column_name);
}

describe("migration ledger collision guard (T-2)", () => {
  it("classifies an absent ledger as ABSENT", async () => {
    const conn = new PGliteConnection(new PGlite());
    try {
      await expect(inspectLedger(conn)).resolves.toEqual({
        kind: "ABSENT",
        columns: [],
      });
      await expect(assertNotForeignLedger(conn)).resolves.toMatchObject({
        kind: "ABSENT",
      });
    } finally {
      await conn.close();
    }
  });

  it("refuses the root BEYU OS ledger and leaves it byte-for-byte unaltered", async () => {
    const conn = new PGliteConnection(new PGlite());
    try {
      await conn.exec(ROOT_LEDGER_DDL);
      await conn.exec(
        `insert into beyu_migrations(version, checksum, mode, description)
         values ('0070_example','abc','APPLIED','root row')`,
      );
      const before = await columnsOf(conn);

      await expect(assertNotForeignLedger(conn)).rejects.toBeInstanceOf(
        ForeignLedgerError,
      );
      await expect(assertNotForeignLedger(conn)).rejects.toThrow(
        /GOVERNANCE VIOLATION/,
      );

      expect(await columnsOf(conn)).toEqual(before);
      expect(before).not.toContain("owner");
      const rows = await conn.query<{ n: number }>(
        `select count(*)::int as n from beyu_migrations`,
      );
      expect(rows[0].n).toBe(1);

      const state = await readMigrationState(conn, MIGRATIONS_DIR);
      expect(state).toMatchObject({
        status: "down",
        ledger: "FOREIGN",
        reasons: ["LEDGER_FOREIGN"],
      });
    } finally {
      await conn.close();
    }
  });

  it("accepts the legacy Health ledger shape (id, applied_at) as HEALTH", async () => {
    const conn = new PGliteConnection(new PGlite());
    try {
      await conn.exec(
        `CREATE TABLE beyu_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      await expect(assertNotForeignLedger(conn)).resolves.toMatchObject({
        kind: "HEALTH",
      });
      const state = await readMigrationState(conn, MIGRATIONS_DIR);
      expect(state.status).toBe("down");
      expect(state.reasons).toContain("MIGRATIONS_PENDING");
    } finally {
      await conn.close();
    }
  });

  it("the runner invokes the guard before any ledger DDL or direction dispatch", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "migration-runner.ts"),
      "utf8",
    );
    const runBody = src.slice(src.indexOf("async function run("));
    const guard = runBody.indexOf("await assertNotForeignLedger(conn)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(runBody.indexOf('if (direction === "up")'));
  });
});

describe("readMigrationState over the real 001..N chain (DEP-3)", () => {
  it("is `up` with the governance fingerprint after a governed apply; detects drift", async () => {
    const conn = new PGliteConnection(new PGlite());
    try {
      await conn.exec(`
        CREATE TABLE beyu_migrations (
          id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(),
          checksum text, owner text, sector text, mode text, provenance text)`);
      const migs = readHealthMigrations(MIGRATIONS_DIR);
      for (const m of migs) {
        await conn.exec(
          fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), "utf8"),
        );
        await conn.query(
          `INSERT INTO beyu_migrations (id, checksum, owner, sector, mode, provenance)
           VALUES ($1,$2,$3,$4,'APPLIED','test')`,
          [m.id, m.checksum, HEALTH_MIGRATION_OWNER, HEALTH_MIGRATION_SECTOR],
        );
      }

      const state = await readMigrationState(conn, MIGRATIONS_DIR);
      const gov = verifyGovernance(MIGRATIONS_DIR);
      expect(state).toMatchObject({
        status: "up",
        reasons: [],
        ledger: "HEALTH",
        committed: migs.length,
        applied: migs.length,
        latest: migs[migs.length - 1].id,
      });
      expect(state.expectedFingerprint).toBe(gov.fingerprint);
      expect(state.ledgerFingerprint).toBe(gov.fingerprint);

      await conn.query(
        `UPDATE beyu_migrations SET checksum = $1 WHERE id = $2`,
        ["0".repeat(64), migs[5].id],
      );
      const drifted = await readMigrationState(conn, MIGRATIONS_DIR);
      expect(drifted.status).toBe("down");
      expect(drifted.reasons).toEqual(["CHECKSUM_DRIFT"]);
      expect(drifted.drift).toEqual([migs[5].id]);
      expect(drifted.ledgerFingerprint).not.toBe(gov.fingerprint);
    } finally {
      await conn.close();
    }
  }, 120_000);

  it("reports MIGRATION_SOURCE_UNAVAILABLE when the image ships no migrations", async () => {
    const conn = new PGliteConnection(new PGlite());
    try {
      const state = await readMigrationState(
        conn,
        path.join(MIGRATIONS_DIR, "__absent__"),
      );
      expect(state).toMatchObject({
        status: "down",
        reasons: ["MIGRATION_SOURCE_UNAVAILABLE"],
      });
    } finally {
      await conn.close();
    }
  });
});
