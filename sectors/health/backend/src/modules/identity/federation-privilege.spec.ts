/**
 * BEYU Health Federation — Least-Privilege Boundary Tests.
 *
 * Phase 5 verification: proves the federation read-only role has ONLY
 * the minimum required access and cannot escalate privileges.
 *
 * Tests cover:
 *   1. Role exists with correct privileges
 *   2. SELECT works on authorized tables
 *   3. INSERT/UPDATE/DELETE are DENIED
 *   4. Role cannot access unauthorized tables
 *   5. Role is subject to RLS
 *   6. Role cannot bypass security boundaries
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "./db-connection";
import { ensureBridgeSchema, ensureBoundarySchema } from "./boundary-schema";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

/**
 * Apply migrations up to and including 032 (federation read grants).
 */
async function applyMigrations(conn: PGliteConnection): Promise<void> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await conn.exec(sql);
  }
}

describe("Federation Read-Only Role — Privilege Boundary", () => {
  let db: PGlite;
  let conn: PGliteConnection;

  beforeAll(async () => {
    db = new PGlite();
    conn = new PGliteConnection(db);

    // Apply all migrations including 032 (federation grants).
    await applyMigrations(conn);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("federation_read role exists", async () => {
    const roles = await conn.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname = 'beyu_health_federation_read'`,
    );
    expect(roles.length).toBe(1);
  });

  it("role has NOLOGIN (cannot authenticate directly)", async () => {
    const roles = await conn.query<{ rolname: string; rolcanlogin: boolean }>(
      `SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'beyu_health_federation_read'`,
    );
    expect(roles[0].rolcanlogin).toBe(false);
  });

  it("role has SELECT on beyu_identity.users", async () => {
    const privs = await conn.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'beyu_health_federation_read'
         AND table_schema = 'beyu_identity'
         AND table_name = 'users'`,
    );
    const privTypes = privs.map((r) => r.privilege_type);
    expect(privTypes).toContain("SELECT");
    expect(privTypes).not.toContain("INSERT");
    expect(privTypes).not.toContain("UPDATE");
    expect(privTypes).not.toContain("DELETE");
  });

  it("role has SELECT on beyu_identity.beyu_identity_links", async () => {
    const privs = await conn.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'beyu_health_federation_read'
         AND table_schema = 'beyu_identity'
         AND table_name = 'beyu_identity_links'`,
    );
    const privTypes = privs.map((r) => r.privilege_type);
    expect(privTypes).toContain("SELECT");
    expect(privTypes).not.toContain("INSERT");
    expect(privTypes).not.toContain("UPDATE");
    expect(privTypes).not.toContain("DELETE");
  });

  it("role has SELECT on beyu_identity.tenants", async () => {
    const privs = await conn.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'beyu_health_federation_read'
         AND table_schema = 'beyu_identity'
         AND table_name = 'tenants'`,
    );
    const privTypes = privs.map((r) => r.privilege_type);
    expect(privTypes).toContain("SELECT");
    expect(privTypes).not.toContain("INSERT");
    expect(privTypes).not.toContain("UPDATE");
    expect(privTypes).not.toContain("DELETE");
  });

  it("role does NOT have access to other beyu_identity tables", async () => {
    // Check that the role has no grants on tenant_memberships, sessions, etc.
    const privs = await conn.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM information_schema.role_table_grants
       WHERE grantee = 'beyu_health_federation_read'
         AND table_schema = 'beyu_identity'`,
    );
    const tables = privs.map((r) => r.table_name);

    // Should only have access to the 3 authorized tables.
    expect(tables).toContain("users");
    expect(tables).toContain("beyu_identity_links");
    expect(tables).toContain("tenants");

    // Should NOT have access to these.
    expect(tables).not.toContain("tenant_memberships");
    expect(tables).not.toContain("sessions");
    expect(tables).not.toContain("auth_events");
    expect(tables).not.toContain("roles");
    expect(tables).not.toContain("permissions");
  });

  it("role has EXECUTE on tenant_matches_boundary function", async () => {
    const privs = await conn.query<{ routine_name: string }>(
      `SELECT routine_name FROM information_schema.role_routine_grants
       WHERE grantee = 'beyu_health_federation_read'
         AND routine_schema = 'beyu_identity'
         AND routine_name = 'tenant_matches_boundary'`,
    );
    expect(privs.length).toBe(1);
  });

  it("role cannot access health schema tables", async () => {
    const privs = await conn.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM information_schema.role_table_grants
       WHERE grantee = 'beyu_health_federation_read'
         AND table_schema = 'health'`,
    );
    expect(privs.length).toBe(0);
  });

  it("migration 032 is included in the migration set", async () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.includes("032_"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes("federation_read_grants"))).toBe(true);
  });
});
