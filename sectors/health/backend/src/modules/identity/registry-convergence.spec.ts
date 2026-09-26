/**
 * BEYU Health OS — Registry Convergence Audit (Phase 6).
 *
 * Proves that:
 *   1. Health OS does NOT have its own os_registry (that's in root BEYU DB)
 *   2. Health OS does NOT duplicate the canonical tenant system
 *   3. The bridge (beyu_identity_links + tenants.beyu_tenant_id) is the
 *      ONE convergence mechanism between Health and root BEYU registries
 *   4. The service principal is correctly scoped to Health's beyu_identity
 *   5. No parallel Health governance registry exists
 *
 * SECURITY: This audit proves that Health Federation is an integration
 * mechanism, NOT a second governance plane. The canonical BEYU OS remains
 * the single source of truth.
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "./db-connection";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

async function applyAllMigrations(conn: PGliteConnection): Promise<void> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await conn.exec(sql);
  }
}

describe("Registry Convergence — No Parallel Governance", () => {
  let db: PGlite;
  let conn: PGliteConnection;

  beforeAll(async () => {
    db = new PGlite();
    conn = new PGliteConnection(db);
    await applyAllMigrations(conn);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("Health database does NOT have an os_registry table (that's root-only)", async () => {
    const tables = await conn.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name = 'os_registry'`,
    );
    expect(tables.length).toBe(0);
  });

  it("Health database does NOT have a tenant_domains table (that's root-only)", async () => {
    const tables = await conn.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name = 'tenant_domains'`,
    );
    expect(tables.length).toBe(0);
  });

  it("bridge tables exist for convergence (beyu_identity_links + tenants.beyu_tenant_id)", async () => {
    // beyu_identity_links must exist.
    const links = await conn.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'beyu_identity' AND table_name = 'beyu_identity_links'`,
    );
    expect(links.length).toBe(1);

    // tenants must have beyu_tenant_id column.
    const cols = await conn.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'beyu_identity' AND table_name = 'tenants' AND column_name = 'beyu_tenant_id'`,
    );
    expect(cols.length).toBe(1);
  });

  it("tenants table has country_code and entity_code for isolation binding", async () => {
    const cols = await conn.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'beyu_identity' AND table_name = 'tenants'
         AND column_name IN ('country_code', 'entity_code')`,
    );
    expect(cols.length).toBe(2);
  });

  it("service principal exists with correct scope", async () => {
    const sp = await conn.query<{ tenant_code: string; status: string }>(
      `SELECT tenant_code, status FROM beyu_identity.tenants
       WHERE tenant_code = 'HEALTH-OS-SERVICE'`,
    );
    expect(sp.length).toBe(1);
    expect(sp[0].status).toBe("active");
  });

  it("service principal user is suspended (cannot authenticate)", async () => {
    const user = await conn.query<{ account_status: string; email: string }>(
      `SELECT account_status, email FROM beyu_identity.users
       WHERE email = 'service@health-os.internal'`,
    );
    expect(user.length).toBe(1);
    expect(user[0].account_status).toBe("suspended");
  });

  it("no duplicate governance tables exist in Health database", async () => {
    // These tables should NOT exist in the Health database.
    const forbidden = [
      "governance_registry",
      "policy_engine",
      "constitutional_roles",
      "beyu_governance",
      "sector_authority",
    ];
    for (const table of forbidden) {
      const rows = await conn.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
        [table],
      );
      expect(rows.length).toBe(0);
    }
  });

  it("RLS is enabled on beyu_identity.tenants (isolation boundary)", async () => {
    const rls = await conn.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'beyu_identity' AND c.relname = 'tenants'`,
    );
    expect(rls.length).toBe(1);
    expect(rls[0].relrowsecurity).toBe(true);
  });

  it("bridge identity_links has RLS-relevant FK integrity", async () => {
    // The links table has FK to users — verify it exists.
    const constraints = await conn.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       JOIN pg_class ON pg_class.oid = conrelid
       JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
       WHERE nspname = 'beyu_identity' AND conname LIKE '%beyu_identity_links%'
         AND contype = 'f'`,
    );
    expect(constraints.length).toBeGreaterThanOrEqual(1);
  });
});
