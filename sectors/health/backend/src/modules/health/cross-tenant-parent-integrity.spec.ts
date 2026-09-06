/**
 * Phase 14 — focused parent/child cross-tenant referential-integrity adversarial.
 *
 * Scope: child tables that carry `tenant_id` AND reference a parent table that
 * also carries `tenant_id`. RLS WITH CHECK on each child only constrains the
 * child's own tenant_id; the FK integrity check runs as the table owner and
 * bypasses parent RLS. Without an explicit guard a NON-OWNER role acting in
 * tenant B can insert a child row referencing a tenant-A parent (patient,
 * appointment parent, invoice parent, lab-order parent, etc.).
 *
 * Engine: real PostgreSQL (TEST_DATABASE_URL_SUPERUSER). Tables under test
 * (demonstrated, not speculation): appointments (patient_id + department_id),
 * encounters, observations, invoices (patient_id), invoice_items (invoice_id),
 * lab_order_items (order_id). Every other tenant-scoped FK edge in the health
 * schema is covered by migration 029's catalog-driven trigger application.
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
const PATIENT_B = "44444444-4444-4444-4444-444444444444";
const DEPT_A = "55555555-5555-5555-5555-555555555555";
const INVOICE_A = "66666666-6666-6666-6666-666666666666";
const INVOICE_B = "66666666-6666-6666-6666-666666666667";
const LAB_ORDER_A = "77777777-7777-7777-7777-777777777777";
const LAB_ORDER_B = "77777777-7777-7777-7777-777777777778";
const LAB_TEST_B = "88888888-8888-8888-8888-888888888888";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

async function nonOwnerInsert(
  conn: TestDbConnection,
  sql: string,
  params: unknown[],
): Promise<boolean> {
  // Returns true if the insert was ACCEPTED (vulnerable), false if DENIED.
  try {
    await conn.query(sql, params);
    return true;
  } catch {
    return false;
  }
}

describe("health patient child tables reject cross-tenant parent", () => {
  let conn: TestDbConnection;

  beforeAll(async () => {
    conn = await createTestSuperuserConnection();
    const migs = fs
      .readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".up.sql"))
      .sort();
    for (const f of migs) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await conn.exec(
      `INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
         VALUES ('${TENANT_A}','x-a','X A','TZ','HOSP-A'),
                ('${TENANT_B}','x-b','X B','TZ','HOSP-B')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.patients (patient_id, tenant_id, medical_record, given_name, family_name)
         VALUES ('${PATIENT_A}','${TENANT_A}','MRN-XT-001','Cross','Patient'),
                ('${PATIENT_B}','${TENANT_B}','MRN-XT-002','Cross','PatientB')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.departments (department_id, tenant_id, dept_code, name)
         VALUES ('${DEPT_A}','${TENANT_A}','DEPT-XT-A','Cross Tenant Dept')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.invoices (invoice_id, tenant_id, invoice_no, patient_id)
         VALUES ('${INVOICE_A}','${TENANT_A}','INV-XT-A','${PATIENT_A}'),
                ('${INVOICE_B}','${TENANT_B}','INV-XT-B','${PATIENT_B}')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.lab_orders (order_id, tenant_id, order_no, patient_id)
         VALUES ('${LAB_ORDER_A}','${TENANT_A}','LAB-XT-A','${PATIENT_A}'),
                ('${LAB_ORDER_B}','${TENANT_B}','LAB-XT-B','${PATIENT_B}')
         ON CONFLICT DO NOTHING;
       INSERT INTO health.lab_tests (test_id, tenant_id, name)
         VALUES ('${LAB_TEST_B}','${TENANT_B}','Cross Tenant Lab Test')
         ON CONFLICT DO NOTHING;`,
    );
    await conn.exec(`DROP ROLE IF EXISTS rls_xt_app`);
    await conn.exec(`CREATE ROLE rls_xt_app NOLOGIN`);
    await conn.exec(`GRANT USAGE ON SCHEMA health TO rls_xt_app`);
    await conn.exec(`GRANT USAGE ON SCHEMA beyu_identity TO rls_xt_app`);
    await conn.exec(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON
         health.appointments, health.encounters, health.observations,
         health.invoices, health.invoice_items, health.lab_orders,
         health.lab_order_items, health.departments, health.lab_tests
       TO rls_xt_app`,
    );
    await conn.exec(
      `GRANT SELECT ON health.patients, beyu_identity.tenants TO rls_xt_app`,
    );
  });

  afterAll(async () => {
    if (conn) await conn.close();
  });

  async function runAsTenantB<T>(fn: () => Promise<T>): Promise<T> {
    await conn.exec(`SET app.tenant_id = '${TENANT_B}'`);
    await conn.exec(`SET ROLE rls_xt_app`);
    try {
      return await fn();
    } finally {
      await conn.exec(`RESET ROLE`);
      await conn.exec(`RESET app.tenant_id`);
    }
  }

  it("appointments cannot reference a tenant-A patient", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.appointments (tenant_id, patient_id, appointment_no, scheduled_for)
         VALUES ($1,$2,'APT-XT-1',now()) RETURNING appointment_id`,
        [TENANT_B, PATIENT_A],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("encounters cannot reference a tenant-A patient", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.encounters (tenant_id, patient_id, encounter_no)
         VALUES ($1,$2,'ENC-XT-1') RETURNING encounter_id`,
        [TENANT_B, PATIENT_A],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("observations cannot reference a tenant-A patient", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.observations (tenant_id, patient_id, code)
         VALUES ($1,$2,'LOINC:8443-3') RETURNING observation_id`,
        [TENANT_B, PATIENT_A],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("invoices cannot reference a tenant-A patient", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.invoices (tenant_id, patient_id, invoice_no)
         VALUES ($1,$2,'INV-XT-1') RETURNING invoice_id`,
        [TENANT_B, PATIENT_A],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("appointments cannot reference a tenant-A department", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.appointments (tenant_id, patient_id, appointment_no, scheduled_for, department_id)
         VALUES ($1,$2,'APT-XT-2',now(),$3) RETURNING appointment_id`,
        [TENANT_B, PATIENT_B, DEPT_A],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("invoice_items cannot reference a tenant-A invoice", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.invoice_items (tenant_id, invoice_id, description, qty, unit_price, line_total)
         VALUES ($1,$2,'Cross tenant line',1,1000,1000) RETURNING item_id`,
        [TENANT_B, INVOICE_A],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("lab_order_items cannot reference a tenant-A lab order", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.lab_order_items (tenant_id, order_id, test_id)
         VALUES ($1,$2,$3) RETURNING order_item_id`,
        [TENANT_B, LAB_ORDER_A, LAB_TEST_B],
      ),
    );
    expect(accepted).toBe(false);
  });

  it("same-tenant invoice_items reference is accepted (guard is not over-blocking)", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.invoice_items (tenant_id, invoice_id, description, qty, unit_price, line_total)
         VALUES ($1,$2,'Same tenant line',1,1000,1000) RETURNING item_id`,
        [TENANT_B, INVOICE_B],
      ),
    );
    expect(accepted).toBe(true);
  });

  it("same-tenant lab_order_items reference is accepted (guard is not over-blocking)", async () => {
    const accepted = await runAsTenantB(() =>
      nonOwnerInsert(
        conn,
        `INSERT INTO health.lab_order_items (tenant_id, order_id, test_id)
         VALUES ($1,$2,$3) RETURNING order_item_id`,
        [TENANT_B, LAB_ORDER_B, LAB_TEST_B],
      ),
    );
    expect(accepted).toBe(true);
  });
});
