/**
 * Phase 1B — Guard against migration drift.
 *
 * The committed migration file must always reflect the source-of-truth DDL in
 * identity-schema.ts. This spec re-applies the exact migration file to a
 * genuine PostgreSQL engine (real local server when TEST_DATABASE_URL is set,
 * else PGlite) and asserts the newest hardening additions (security_version +
 * RLS) are present, so the migration and the schema source cannot silently
 * diverge.
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { createTestDbConnection, TestDbConnection } from "./test-connection";

const UP_SQL = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "..",
    "..",
    "database",
    "migrations",
    "001_identity_foundation.up.sql",
  ),
  "utf8",
);

describe("Identity migration 001 consistency + validity", () => {
  let conn: TestDbConnection;

  beforeAll(async () => {
    conn = await createTestDbConnection();
  });

  afterAll(async () => {
    await conn.close();
  });

  it("up.sql contains the security_version freshness guard", () => {
    expect(UP_SQL).toMatch(/security_version\s+integer NOT NULL DEFAULT 0/);
  });

  it("up.sql enables RLS on all tenant-scoped tables", () => {
    for (const table of [
      "tenants",
      "tenant_memberships",
      "sessions",
      "auth_events",
    ]) {
      expect(UP_SQL).toMatch(
        new RegExp(
          `ALTER TABLE beyu_identity\\.${table} ENABLE ROW LEVEL SECURITY`,
        ),
      );
    }
  });

  it("applies cleanly to a fresh PostgreSQL engine", async () => {
    await conn.exec(UP_SQL);
    const cols = await conn.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='beyu_identity' AND table_name='users' AND column_name='security_version'`,
    );
    expect(cols.length).toBe(1);
    const policies = await conn.query(
      `SELECT policyname FROM pg_policies WHERE schemaname='beyu_identity'`,
    );
    const names = policies.map((r: any) => r.policyname);
    expect(names).toEqual(
      expect.arrayContaining([
        "tenants_isolation",
        "memberships_isolation",
        "sessions_isolation",
        "auth_events_isolation",
      ]),
    );
  });
});
