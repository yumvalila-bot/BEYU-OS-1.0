/**
 * Phase 1B — Row-Level Security (RLS) enforcement.
 *
 * The application performs tenant authorization in middleware BEFORE it uses a
 * privileged (table-owner) connection, which bypasses RLS by design
 * ("authorization before privileged access"). RLS is the defense-in-depth hard
 * boundary for any NON-OWNER database role. This spec proves that boundary by
 * running queries as a freshly-created non-owner role via `SET ROLE`:
 *   - with `app.tenant_id` set, the role sees ONLY that tenant's rows,
 *   - without `app.tenant_id` (NULL), the role sees NOTHING (fail-closed),
 *   - the table-owner connection still sees all rows (RLS bypass, by design).
 *
 * Engine: a real local PostgreSQL server when TEST_DATABASE_URL is set, else
 * PGlite (a genuine PostgreSQL 16 engine) — both support roles/SET ROLE.
 */
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import {
  createTestSuperuserConnection,
  TestDbConnection,
} from "./test-connection";
import { IdentityRepository } from "./identity.repository";
import * as bcrypt from "bcryptjs";

jest.setTimeout(60_000);

describe("RLS tenant isolation (non-owner database role)", () => {
  let conn: TestDbConnection;
  let repo: IdentityRepository;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    conn = await createTestSuperuserConnection();
    repo = new IdentityRepository(conn);
    await repo.ensureSchema();

    const a = await repo.createTenant({ code: "RLS-A", name: "RLS A" });
    const b = await repo.createTenant({ code: "RLS-B", name: "RLS B" });
    tenantAId = a.tenant_id;
    tenantBId = b.tenant_id;

    const hash = await bcrypt.hash("pw", 10);
    const u = await repo.createUser({
      email: "rls@a.example",
      displayName: "RLS",
      passwordHash: hash,
    });
    await repo.ensureMembership({
      globalUserId: u.global_user_id,
      tenantId: tenantAId,
      role: "nurse",
    });
    await repo.ensureMembership({
      globalUserId: u.global_user_id,
      tenantId: tenantBId,
      role: "nurse",
    });

    // Create a NON-OWNER role with base privileges, then grant access to the
    // tenant-scoped tables. It must NOT be granted BYPASSRLS. Idempotent so the
    // spec can also run against a shared real-PostgreSQL test database.
    await conn.exec(`DROP ROLE IF EXISTS rls_app`);
    await conn.exec(`CREATE ROLE rls_app NOLOGIN`);
    await conn.exec(`GRANT USAGE ON SCHEMA beyu_identity TO rls_app`);
    await conn.exec(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON beyu_identity.tenants, beyu_identity.tenant_memberships, beyu_identity.sessions, beyu_identity.auth_events TO rls_app`,
    );
  });

  afterAll(async () => {
    await conn.close();
  });

  const rows = async (table: string, where = ""): Promise<number> => {
    const r = await conn.query(
      `SELECT count(*)::int AS n FROM beyu_identity.${table} ${where}`,
    );
    return (r[0] as { n: number }).n;
  };

  it("owner connection bypasses RLS and sees all rows", async () => {
    expect(await rows("tenant_memberships")).toBe(2);
    expect(await rows("tenants")).toBe(2);
  });

  it("non-owner with app.tenant_id=A sees only tenant A rows (fail-closed boundary)", async () => {
    await conn.exec(`SET app.tenant_id = '${tenantAId}'`);
    await conn.exec(`SET ROLE rls_app`);
    expect(await rows("tenant_memberships")).toBe(1);
    expect(
      await rows(
        "tenant_memberships",
        `WHERE tenant_id::text = '${tenantAId}'`,
      ),
    ).toBe(1);
    await conn.exec(`RESET ROLE`);
    await conn.exec(`RESET app.tenant_id`);
  });

  it("non-owner with app.tenant_id=B sees only tenant B rows", async () => {
    await conn.exec(`SET app.tenant_id = '${tenantBId}'`);
    await conn.exec(`SET ROLE rls_app`);
    expect(await rows("tenant_memberships")).toBe(1);
    expect(
      await rows(
        "tenant_memberships",
        `WHERE tenant_id::text = '${tenantBId}'`,
      ),
    ).toBe(1);
    expect(
      await rows(
        "tenant_memberships",
        `WHERE tenant_id::text = '${tenantAId}'`,
      ),
    ).toBe(0);
    await conn.exec(`RESET ROLE`);
    await conn.exec(`RESET app.tenant_id`);
  });

  it("non-owner with NO app.tenant_id sees nothing (deny-by-default / fail closed)", async () => {
    await conn.exec(`SET ROLE rls_app`);
    expect(await rows("tenant_memberships")).toBe(0);
    expect(await rows("tenants")).toBe(0);
    expect(await rows("sessions")).toBe(0);
    expect(await rows("auth_events")).toBe(0);
    await conn.exec(`RESET ROLE`);
  });
});
