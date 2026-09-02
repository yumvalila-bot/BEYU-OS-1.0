/**
 * BEYU OS integration — adversarial country/entity isolation boundaries.
 *
 * Proves the upgraded RLS boundary for tenants LINKED to a canonical BEYU
 * tenant, by running queries as a freshly-created NON-OWNER role via
 * `SET ROLE` (the defense-in-depth boundary a privileged connection bypasses
 * by design):
 *
 *   - with tenant + matching country + entity context: ONLY that tenant's rows;
 *   - with tenant + FOREIGN country: NOTHING (cross-country denied);
 *   - with tenant + FOREIGN entity: NOTHING (cross-entity denied);
 *   - cross-tenant INSERT/UPDATE/DELETE: denied (0 rows / no persistence);
 *   - unlinked legacy tenants: existing tenant-only behavior preserved;
 *   - no context: NOTHING (fail-closed);
 *   - the table-owner connection still sees all rows (bypass, by design).
 *
 * Engine: a real local PostgreSQL server when TEST_DATABASE_URL is set, else
 * PGlite (a genuine PostgreSQL 16 engine) — both support roles/SET ROLE.
 */
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import * as bcrypt from "bcryptjs";
import {
  createTestSuperuserConnection,
  type TestDbConnection,
} from "./test-connection";
import { IdentityRepository } from "./identity.repository";
import { ensureBridgeSchema, ensureBoundarySchema } from "./boundary-schema";

jest.setTimeout(60_000);

describe("BEYU isolation boundaries (country/entity) for linked tenants", () => {
  let conn: TestDbConnection;
  let repo: IdentityRepository;
  let tenantAId: string; // linked: country TZ, entity LE-A
  let tenantBId: string; // linked: country KE, entity LE-B
  let tenantLId: string; // unlinked legacy tenant
  let userId: string;

  beforeAll(async () => {
    conn = await createTestSuperuserConnection();
    repo = new IdentityRepository(conn);
    await repo.ensureSchema();
    await ensureBridgeSchema(conn);
    await ensureBoundarySchema(conn);

    const a = await repo.createTenant({ code: "BND-A", name: "Boundary A" });
    const b = await repo.createTenant({ code: "BND-B", name: "Boundary B" });
    const l = await repo.createTenant({ code: "BND-L", name: "Legacy L" });
    tenantAId = a.tenant_id;
    tenantBId = b.tenant_id;
    tenantLId = l.tenant_id;

    // Canonical linkage (set-once boundary) applied the way the bridge does.
    await conn.query(
      `update beyu_identity.tenants
          set beyu_tenant_id = 'T-BND-A', country_code = 'TZ', entity_code = 'LE-A'
        where tenant_id = $1`,
      [tenantAId],
    );
    await conn.query(
      `update beyu_identity.tenants
          set beyu_tenant_id = 'T-BND-B', country_code = 'KE', entity_code = 'LE-B'
        where tenant_id = $1`,
      [tenantBId],
    );

    const hash = await bcrypt.hash("pw", 10);
    const u = await repo.createUser({
      email: "boundary@example.com",
      displayName: "Boundary",
      passwordHash: hash,
    });
    userId = u.global_user_id;
    await repo.ensureMembership({
      globalUserId: userId,
      tenantId: tenantAId,
      role: "nurse",
    });
    await repo.ensureMembership({
      globalUserId: userId,
      tenantId: tenantBId,
      role: "nurse",
    });
    await repo.ensureMembership({
      globalUserId: userId,
      tenantId: tenantLId,
      role: "nurse",
    });

    // One session + one auth event per linked tenant (raw inserts: these
    // tables are owned by the session/auth services, not the repository API).
    await conn.query(
      `insert into beyu_identity.sessions
         (session_id, global_user_id, tenant_id, refresh_token_hash, expires_at)
       values (gen_random_uuid(), $1, $2, 'hash-session-a', now() + interval '12 hours'),
              (gen_random_uuid(), $1, $3, 'hash-session-b', now() + interval '12 hours')`,
      [userId, tenantAId, tenantBId],
    );
    await conn.query(
      `insert into beyu_identity.auth_events
         (global_user_id, tenant_id, event_type, result)
       values ($1, $2, 'login', 'SUCCESS'),
              ($1, $3, 'login', 'SUCCESS')`,
      [userId, tenantAId, tenantBId],
    );

    // Non-owner role with DML on the tenant-scoped tables (no BYPASSRLS).
    await conn.exec(`DROP ROLE IF EXISTS rls_bnd`);
    await conn.exec(`CREATE ROLE rls_bnd NOLOGIN`);
    await conn.exec(`GRANT USAGE ON SCHEMA beyu_identity TO rls_bnd`);
    await conn.exec(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON beyu_identity.tenants, beyu_identity.tenant_memberships, beyu_identity.sessions, beyu_identity.auth_events TO rls_bnd`,
    );
  });

  afterAll(async () => {
    await conn.close();
  });

  const asRls = async (
    tenant: string | null,
    country: string | null,
    entity: string | null,
    fn: () => Promise<unknown>,
  ): Promise<unknown> => {
    if (tenant !== null) await conn.exec(`SET app.tenant_id = '${tenant}'`);
    if (country !== null)
      await conn.exec(`SET app.country_code = '${country}'`);
    if (entity !== null) await conn.exec(`SET app.entity_code = '${entity}'`);
    await conn.exec(`SET ROLE rls_bnd`);
    try {
      return await fn();
    } finally {
      await conn.exec(`RESET ROLE`);
      await conn.exec(`RESET app.tenant_id`);
      await conn.exec(`RESET app.country_code`);
      await conn.exec(`RESET app.entity_code`);
    }
  };

  const count = async (table: string, extra = ""): Promise<number> => {
    const r = await conn.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM beyu_identity.${table} ${extra}`,
    );
    return r[0].n;
  };

  it("owner connection sees all rows (RLS bypass by design)", async () => {
    expect(await count("tenants")).toBe(3);
    expect(await count("tenant_memberships")).toBe(3);
    expect(await count("sessions")).toBe(2);
    expect(await count("auth_events")).toBe(2);
  });

  it("matching tenant+country+entity context sees ONLY that tenant's rows", async () => {
    await asRls(tenantAId, "TZ", "LE-A", async () => {
      expect(await count("tenants")).toBe(1);
      expect(await count("tenant_memberships")).toBe(1);
      expect(await count("sessions")).toBe(1);
      expect(await count("auth_events")).toBe(1);
    });
  });

  it("cross-COUNTRY context is denied at the database layer (0 rows)", async () => {
    await asRls(tenantAId, "KE", "LE-A", async () => {
      expect(await count("tenants")).toBe(0);
      expect(await count("tenant_memberships")).toBe(0);
      expect(await count("sessions")).toBe(0);
      expect(await count("auth_events")).toBe(0);
    });
  });

  it("cross-ENTITY context is denied at the database layer (0 rows)", async () => {
    await asRls(tenantAId, "TZ", "LE-B", async () => {
      expect(await count("tenant_memberships")).toBe(0);
      expect(await count("sessions")).toBe(0);
      expect(await count("auth_events")).toBe(0);
    });
  });

  it("a different, correctly-contexted linked tenant sees its own rows only", async () => {
    await asRls(tenantBId, "KE", "LE-B", async () => {
      expect(await count("tenants")).toBe(1);
      expect(await count("tenant_memberships")).toBe(1);
      expect(await count("sessions")).toBe(1);
      expect(await count("auth_events")).toBe(1);
    });
  });

  it("unlinked legacy tenant keeps tenant-only isolation (not weakened)", async () => {
    await asRls(tenantLId, null, null, async () => {
      expect(await count("tenants")).toBe(1);
      expect(await count("tenant_memberships")).toBe(1);
    });
  });

  it("no context at all: fail-closed (0 rows on every tenant-scoped table)", async () => {
    await asRls(null, null, null, async () => {
      expect(await count("tenants")).toBe(0);
      expect(await count("tenant_memberships")).toBe(0);
      expect(await count("sessions")).toBe(0);
      expect(await count("auth_events")).toBe(0);
    });
  });

  it("cross-tenant INSERT is denied and persists nothing", async () => {
    await asRls(tenantAId, "TZ", "LE-A", async () => {
      await conn
        .query(
          `insert into beyu_identity.tenant_memberships
           (membership_id, global_user_id, tenant_id, role, status)
         values (gen_random_uuid(), $1, $2, 'nurse', 'active')`,
          [userId, tenantBId],
        )
        .catch(() => undefined); // RLS violation OR silent 0-row: both must not persist
    });
    expect(
      await count("tenant_memberships", `WHERE tenant_id = '${tenantBId}'`),
    ).toBe(1); // only the pre-existing row
  });

  it("INSERT under a mismatched (foreign country) context is denied and persists nothing", async () => {
    await asRls(tenantAId, "KE", "LE-A", async () => {
      await conn
        .query(
          `insert into beyu_identity.tenant_memberships
           (membership_id, global_user_id, tenant_id, role, status)
         values (gen_random_uuid(), $1, $2, 'nurse', 'active')`,
          [userId, tenantAId],
        )
        .catch(() => undefined);
    });
    expect(
      await count("tenant_memberships", `WHERE tenant_id = '${tenantAId}'`),
    ).toBe(1);
  });

  it("cross-tenant UPDATE affects 0 rows (record unchanged)", async () => {
    await asRls(tenantAId, "TZ", "LE-A", async () => {
      await conn.query(
        `update beyu_identity.tenant_memberships
            set role = 'pharmacy'
          where tenant_id = $1`,
        [tenantBId],
      );
    });
    const r = await conn.query<{ role: string }>(
      `select role from beyu_identity.tenant_memberships where tenant_id = $1`,
      [tenantBId],
    );
    expect(r[0].role).toBe("nurse");
  });

  it("cross-tenant DELETE affects 0 rows (record survives)", async () => {
    await asRls(tenantAId, "TZ", "LE-A", async () => {
      await conn.query(
        `delete from beyu_identity.tenant_memberships where tenant_id = $1`,
        [tenantBId],
      );
    });
    expect(
      await count("tenant_memberships", `WHERE tenant_id = '${tenantBId}'`),
    ).toBe(1);
  });

  it("forged context (tenant of a foreign country) cannot read that tenant's rows", async () => {
    // Context claims tenant B but the country context is A's: the linked
    // boundary must fail closed even though the tenant id matches a row.
    await asRls(tenantBId, "TZ", "LE-A", async () => {
      expect(await count("tenant_memberships")).toBe(0);
      expect(await count("sessions")).toBe(0);
    });
  });
});
