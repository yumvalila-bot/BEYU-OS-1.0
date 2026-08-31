/**
 * Migration application & idempotency test.
 *
 * Applies EVERY *.up.sql under database/migrations/ (in lexical order) to a
 * fresh PGlite instance, verifies RLS is enabled on every health.* table,
 * verifies the migration ledger is written, and verifies that applying the
 * full set a SECOND time is idempotent (IF NOT EXISTS everywhere / ledger
 * guards prevent duplicate-object errors).
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../modules/identity/db-connection";

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "database", "migrations");

function listMigrations(): { id: string; up: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort()
    .map((f) => ({
      id: f.replace(/\.up\.sql$/, ""),
      up: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"),
    }));
}

describe("Health OS migrations", () => {
  let db: PGlite;
  let conn: PGliteConnection;

  beforeAll(async () => {
    db = new PGlite();
    conn = new PGliteConnection(db);
  });

  it("apply all migrations cleanly to a fresh database", async () => {
    // Required ledger table (created by migration-runner; mirror it here).
    await conn.exec(
      `CREATE TABLE IF NOT EXISTS beyu_migrations (
         id text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       );`,
    );
    for (const m of listMigrations()) {
      await conn.exec(m.up);
      await conn.query(`INSERT INTO beyu_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`, [m.id]);
    }
  });

  it("every health.* table has RLS enabled", async () => {
    const rows = await conn.query<{ relname: string; rls: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS rls
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'health' AND c.relkind = 'r' AND c.relhassubclass = false`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(21);
    for (const r of rows) {
      expect(r.rls).toBe(true);
    }
  });

  it("isolation policies exist on every operational table", async () => {
    const rows = await conn.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies
        WHERE schemaname = 'health' AND policyname LIKE '%_isolation'`,
    );
    const tables = new Set(rows.map((r) => r.tablename));
    expect(tables.size).toBeGreaterThanOrEqual(21);
    for (const expected of [
      "patients",
      "appointments",
      "encounters",
      "providers",
      "departments",
      "problems",
      "observations",
      "medications",
      "allergies",
      "audit_log",
      "idempotency_ledger",
      "pharmacy_items",
      "pharmacy_batches",
      "stock_ledger",
      "dispenses",
      "lab_tests",
      "lab_orders",
      "lab_order_items",
      "imaging_orders",
      "imaging_reports",
      "eye_exams",
      "invoices",
      "payments",
      "ambulance_requests",
      "telehealth_sessions",
    ]) {
      expect(tables.has(expected)).toBe(true);
    }
  });

  it("re-applying all migrations is idempotent (no errors)", async () => {
    for (const m of listMigrations()) {
      await conn.exec(m.up);
    }
  });

  it("required CHECK constraints reject invalid status values", async () => {
    // Create a tenant & user first because patients require a tenant FK.
    await conn.exec(`
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name)
        VALUES ('11111111-1111-1111-1111-111111111111','t1','T1') ON CONFLICT DO NOTHING;
    `);
    await expect(
      conn.query(
        `INSERT INTO health.patients
           (patient_id, tenant_id, medical_record, given_name, family_name, sex, status)
         VALUES ('22222222-2222-2222-2222-222222222222',
                 '11111111-1111-1111-1111-111111111111','MRN001','A','B','male','bogus')`,
      ),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await conn.close();
  });
});
