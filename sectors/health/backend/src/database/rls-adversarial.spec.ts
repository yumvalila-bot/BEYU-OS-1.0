import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../modules/identity/db-connection";

const MIG = path.resolve(__dirname, "..", "..", "database", "migrations");
const applyUp = (c: PGliteConnection, n: string) =>
  c.exec(fs.readFileSync(path.join(MIG, `${n}.up.sql`), "utf8"));

describe("RLS adversarial: non-owner role", () => {
  let owner: PGliteConnection;
  const TENANT_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const TENANT_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const USER_A = "11111111-1111-4111-1111-111111111111";

  beforeAll(async () => {
    const db = new PGlite();
    owner = new PGliteConnection(db);
    for (const f of fs.readdirSync(MIG).filter((x) => x.endsWith(".up.sql")).sort()) {
      await applyUp(owner, f.replace(/\.up\.sql$/, ""));
    }
    await owner.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('${USER_A}','a@beyu.health','A','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('${TENANT_A}','ta','A','TZ','HOSP-1'),
               ('${TENANT_B}','tb','B','TZ','HOSP-2');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('${USER_A}','${TENANT_A}','doctor');

      DROP ROLE IF EXISTS rls_app;
      CREATE ROLE rls_app NOLOGIN;
      GRANT USAGE ON SCHEMA health, beyu_identity TO rls_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA health TO rls_app;
      GRANT SELECT ON beyu_identity.tenants, beyu_identity.users, beyu_identity.tenant_memberships TO rls_app;
    `);
    await owner.exec(
      `INSERT INTO health.patients (patient_id, tenant_id, medical_record, given_name, family_name, sex, created_by, correlation_id)
       VALUES ('00000000-0000-4000-0000-000000000001','${TENANT_A}','MRN-A1','Tenant','A','male','${USER_A}','adv')`,
    );
  });

  afterEach(async () => {
    // Always reset role back to superuser after each test.
    try { await owner.exec("RESET ROLE"); } catch { /* ignore */ }
  });

  async function setRole(tenantId: string | null, country = "TZ", entity = "HOSP-1") {
    await owner.exec("SET ROLE rls_app");
    await owner.exec(`SELECT set_config('app.tenant_id', ${tenantId ? `'${tenantId}'` : "''"}, true),
                          set_config('app.country_code', '${country}', true),
                          set_config('app.entity_code', '${entity}', true)`);
  }

  it("sees rows when app.tenant_id matches", async () => {
    await owner.exec("SET ROLE rls_app");
    const r = await owner.query<{ n: number }>(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.country_code', 'TZ', true),
              set_config('app.entity_code', 'HOSP-1', true),
              (SELECT count(*)::int FROM health.patients WHERE medical_record='MRN-A1') AS n`,
      [TENANT_A],
    );
    expect(r[0].n).toBe(1);
  });

  it("sees ZERO rows when app.tenant_id is empty (fail-closed)", async () => {
    await owner.exec("SET ROLE rls_app");
    const r = await owner.query<{ n: number }>(
      `SELECT set_config('app.tenant_id', '', true),
              set_config('app.country_code', '', true),
              set_config('app.entity_code', '', true),
              (SELECT count(*)::int FROM health.patients WHERE medical_record='MRN-A1') AS n`,
    );
    expect(r[0].n).toBe(0);
  });

  it("cross-tenant read returns zero rows (tenant B sees nothing of A)", async () => {
    await owner.exec("SET ROLE rls_app");
    const r = await owner.query<{ n: number }>(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.country_code', 'TZ', true),
              set_config('app.entity_code', 'HOSP-2', true),
              (SELECT count(*)::int FROM health.patients WHERE medical_record='MRN-A1') AS n`,
      [TENANT_B],
    );
    expect(r[0].n).toBe(0);
  });

  it("cross-tenant INSERT blocked by RLS WITH CHECK", async () => {
    await owner.exec("SET ROLE rls_app");
    await owner.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.country_code', 'TZ', true),
              set_config('app.entity_code', 'HOSP-2', true)`,
      [TENANT_B],
    );
    await expect(
      owner.exec(
        `INSERT INTO health.patients (patient_id, tenant_id, medical_record, given_name, family_name, sex)
         VALUES ('00000000-0000-4000-0000-000000000002','${TENANT_A}','SHOULD-FAIL','X','Y','male')`,
      ),
    ).rejects.toThrow();
  });
});
