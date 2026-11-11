import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_URL_SUPERUSER;
const runtimeSuite = runtimeUrl && adminUrl ? describe : describe.skip;

runtimeSuite(
  "Health assertion resolver — non-owner runtime PostgreSQL integration",
  () => {
    let runtime: Client | undefined;
    let admin: Client | undefined;
    const globalUserId = randomUUID();
    const tenantId = randomUUID();
    const beyuUserId = `BEYU_RUNTIME_USER_${randomUUID()}`;
    const beyuTenantId = `BEYU_RUNTIME_TENANT_${randomUUID()}`;
    const email = `health-runtime-${globalUserId}@example.test`;
    const tenantCode = `HEALTH-RUNTIME-${tenantId}`;

    beforeAll(async () => {
      runtime = new Client({ connectionString: runtimeUrl! });
      admin = new Client({ connectionString: adminUrl! });
      await runtime.connect();
      await admin.connect();

      await admin.query(
        `INSERT INTO beyu_identity.users
          (global_user_id, email, display_name, password_hash, account_status)
         VALUES ($1, $2, 'Runtime Resolver Test', 'test-only-hash', 'active')`,
        [globalUserId, email],
      );
      await admin.query(
        `INSERT INTO beyu_identity.tenants
          (tenant_id, tenant_code, name, status, beyu_tenant_id, country_code, entity_code)
         VALUES ($1, $2, 'Runtime Resolver Tenant', 'active', $3, 'TZ', 'BEYU')`,
        [tenantId, tenantCode, beyuTenantId],
      );
      await admin.query(
        `INSERT INTO beyu_identity.tenant_memberships
          (global_user_id, tenant_id, role, status)
         VALUES ($1, $2, 'doctor', 'active')`,
        [globalUserId, tenantId],
      );
      await admin.query(
        `INSERT INTO beyu_identity.beyu_identity_links
          (global_user_id, beyu_user_id, linked_by, status)
         VALUES ($1, $2, 'runtime-integration-test', 'active')`,
        [globalUserId, beyuUserId],
      );
    });

    afterAll(async () => {
      if (admin) {
        await admin.query("DELETE FROM beyu_identity.beyu_identity_links WHERE global_user_id = $1", [globalUserId]).catch(() => undefined);
        await admin.query("DELETE FROM beyu_identity.tenant_memberships WHERE global_user_id = $1", [globalUserId]).catch(() => undefined);
        await admin.query("DELETE FROM beyu_identity.users WHERE global_user_id = $1", [globalUserId]).catch(() => undefined);
        await admin.query("DELETE FROM beyu_identity.tenants WHERE tenant_id = $1", [tenantId]).catch(() => undefined);
        await admin.end().catch(() => undefined);
      }
      if (runtime) await runtime.end().catch(() => undefined);
    });

    it("executes as beyu_health_runtime while the function remains migration-owned", async () => {
      const owner = await runtime!.query(
        `SELECT current_user AS runtime_role,
                pg_get_userbyid(p.proowner) AS function_owner
           FROM pg_proc p
          WHERE p.oid = 'beyu_identity.resolve_beyu_authorization(text,text)'::regprocedure`,
      );
      expect(owner.rows[0]?.runtime_role).toBe("beyu_health_runtime");
      expect(owner.rows[0]?.function_owner).not.toBe("beyu_health_runtime");

      const resolved = await runtime!.query(
        "SELECT * FROM beyu_identity.resolve_beyu_authorization($1, $2)",
        [beyuUserId, beyuTenantId],
      );
      expect(resolved.rows[0]).toMatchObject({
        decision_code: "AUTHORIZED",
        global_user_id: globalUserId,
        email,
        tenant_id: tenantId,
        role: "doctor",
      });
    });

    it("denies revoked local membership and returns no user profile fields", async () => {
      await admin!.query(
        "UPDATE beyu_identity.tenant_memberships SET status = 'revoked' WHERE global_user_id = $1 AND tenant_id = $2",
        [globalUserId, tenantId],
      );
      const denied = await runtime!.query(
        "SELECT * FROM beyu_identity.resolve_beyu_authorization($1, $2)",
        [beyuUserId, beyuTenantId],
      );
      expect(denied.rows[0]?.decision_code).toBe("HEALTH_LOCAL_MEMBERSHIP_NOT_ACTIVE");
      expect(denied.rows[0]?.global_user_id).toBeNull();
      expect(denied.rows[0]?.email).toBeNull();
      expect(denied.rows[0]?.role).toBeNull();
    });
  },
);
