/**
 * Phase 6 / Phase 4 adversarial — `health.eye_exams` Row-Level Security.
 *
 * Proves that ophthalmology data is isolated by a NON-OWNER database role
 * (the production `beyu_runtime` model), not just by application middleware.
 *
 * Engine: a real local PostgreSQL server when TEST_DATABASE_URL_SUPERUSER
 * (or TEST_DATABASE_URL/DATABASE_URL) is set, otherwise PGlite. In both cases
 * the spec connects via a SUPERUSER test connection, creates a NON-OWNER role
 * (`rls_oph_app`, NOLOGIN), grants table access WITHOUT BYPASSRLS, and runs
 * queries/inserts via `SET ROLE`:
 *
 *   1. owner connection sees all rows (RLS bypassed, by design),
 *   2. non-owner with app.tenant_id=A sees only tenant A eye exams,
 *   3. non-owner with app.tenant_id=B sees zero tenant A rows,
 *   4. non-owner with NO app.tenant_id sees nothing (fail-closed),
 *   5. non-owner in tenant B CANNOT insert an eye exam that references a
 *      tenant-A patient (cross-tenant referential integrity).
 *
 * Step 5 is a strict adversarial assertion. If the RLS/FK combination allows
 * the cross-tenant insert, the spec FAILS and the finding is surfaced in
 * coverage/ophthalmology-rls.json — it is never hidden.
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import {
  createTestSuperuserConnection,
  TestDbConnection,
} from "../identity/test-connection";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const PATIENT_A = "33333333-3333-3333-3333-333333333333";
const EXAM_A = "44444444-4444-4444-4444-444444444444";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

async function count(conn: TestDbConnection, where = ""): Promise<number> {
  const r = await conn.query(
    `SELECT count(*)::int AS n FROM health.eye_exams ${where}`,
  );
  return (r[0] as { n: number }).n;
}

describe("health.eye_exams RLS (non-owner database role)", () => {
  let conn: TestDbConnection;

  beforeAll(async () => {
    conn = await createTestSuperuserConnection();
    // Apply the full committed migration chain on a fresh scratch DB (or fresh
    // in-memory PGlite), identical to the production path order.
    const migs = fs
      .readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".up.sql"))
      .sort();
    for (const f of migs) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }

    await conn.exec(
      `INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
         VALUES ('${TENANT_A}','rls-a','RLS A','TZ','HOSP-A'),
                ('${TENANT_B}','rls-b','RLS B','TZ','HOSP-B')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.patients (patient_id, tenant_id, medical_record, given_name, family_name)
         VALUES ('${PATIENT_A}','${TENANT_A}','MRN-RLS-OPH-E2E','RLS','Eye')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.eye_exams (exam_id, tenant_id, patient_id, laterality_focus, diagnosis_ou)
         VALUES ('${EXAM_A}','${TENANT_A}','${PATIENT_A}','right','Myopia')
         ON CONFLICT DO NOTHING;`,
    );

    // Idempotent NON-OWNER helper role with access to the ophthalmology table
    // and the referenced schemas. It is never granted BYPASSRLS.
    await conn.exec(`DROP ROLE IF EXISTS rls_oph_app`);
    await conn.exec(`CREATE ROLE rls_oph_app NOLOGIN`);
    await conn.exec(`GRANT USAGE ON SCHEMA beyu_identity TO rls_oph_app`);
    await conn.exec(`GRANT USAGE ON SCHEMA health TO rls_oph_app`);
    await conn.exec(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON health.eye_exams TO rls_oph_app`,
    );
    await conn.exec(
      `GRANT SELECT ON health.patients, beyu_identity.tenants TO rls_oph_app`,
    );
  });

  afterAll(async () => {
    // Best-effort: record evidence regardless of pass/fail.
    let crossTenantInsertAllowed = false;
    try {
      if (conn) {
        await conn.exec(`SET app.tenant_id = '${TENANT_B}'`);
        await conn.exec(`SET ROLE rls_oph_app`);
        const inserted = await conn.query(
          `INSERT INTO health.eye_exams (tenant_id, patient_id, laterality_focus, diagnosis_ou)
             VALUES ('${TENANT_B}','${PATIENT_A}','right','cross-tenant')
             RETURNING exam_id`,
        );
        crossTenantInsertAllowed = inserted.length > 0;
        await conn.exec(`RESET ROLE`);
        await conn.exec(`RESET app.tenant_id`);
      }
    } catch {
      // Expected denial path.
    }
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "ophthalmology-rls.json"),
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          schema: "ophthalmology-rls-v1",
          engine: process.env.TEST_DATABASE_URL_SUPERUSER
            ? "real-postgres"
            : "pglite-setrole",
          crossTenantInsertDenied: !crossTenantInsertAllowed,
          finding: crossTenantInsertAllowed
            ? {
                id: "HEALTH-OPH-CROSS-TENANT-CREATE-001",
                severity: "P1",
                title:
                  "Cross-tenant eye-exam insert can reference another tenant's patient",
                detail:
                  "A non-owner role acting in tenant B successfully INSERTed an eye_exams row whose patient_id belongs to tenant A. RLS WITH CHECK constrains only eye_exams.tenant_id and the FK integrity check runs as the table owner (RLS-bypassed), so no statement-level guard prevents the cross-tenant foreign key.",
              }
            : null,
        },
        null,
        2,
      ),
    );
  });

  it("owner connection bypasses RLS and sees the eye exam", async () => {
    expect(await count(conn)).toBe(1);
  });

  it("non-owner with app.tenant_id=A sees only tenant A eye exams", async () => {
    await conn.exec(`SET app.tenant_id = '${TENANT_A}'`);
    await conn.exec(`SET ROLE rls_oph_app`);
    expect(await count(conn)).toBe(1);
    expect(await count(conn, `WHERE tenant_id::text = '${TENANT_A}'`)).toBe(1);
    await conn.exec(`RESET ROLE`);
    await conn.exec(`RESET app.tenant_id`);
  });

  it("non-owner with app.tenant_id=B sees zero tenant A rows", async () => {
    await conn.exec(`SET app.tenant_id = '${TENANT_B}'`);
    await conn.exec(`SET ROLE rls_oph_app`);
    expect(await count(conn)).toBe(0);
    await conn.exec(`RESET ROLE`);
    await conn.exec(`RESET app.tenant_id`);
  });

  it("non-owner with NO app.tenant_id sees nothing (fail-closed)", async () => {
    await conn.exec(`SET ROLE rls_oph_app`);
    expect(await count(conn)).toBe(0);
    await conn.exec(`RESET ROLE`);
  });

  it("non-owner in tenant B cannot INSERT an exam referencing tenant-A patient", async () => {
    await conn.exec(`SET app.tenant_id = '${TENANT_B}'`);
    await conn.exec(`SET ROLE rls_oph_app`);
    await expect(
      conn.query(
        `INSERT INTO health.eye_exams (tenant_id, patient_id, laterality_focus, diagnosis_ou)
           VALUES ('${TENANT_B}','${PATIENT_A}','right','cross-tenant-test')
           RETURNING exam_id`,
      ),
    ).rejects.toBeTruthy();
    await conn.exec(`RESET ROLE`);
    await conn.exec(`RESET app.tenant_id`);
  });

  afterAll(async () => {
    if (conn) await conn.close();
  });
});
