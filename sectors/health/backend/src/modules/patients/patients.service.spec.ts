import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../../modules/identity/db-connection";
import { PatientRepository, CreatePatientInput } from "./patient.repository";
import { PatientsService } from "./patients.service";
import { TenantContext, tenantStorage } from "../../common/security/tenant-context";
import { DomainError } from "../../common/errors/domain.error";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";

const MIG_DIR = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
function applyUp(conn: PGliteConnection, name: string) {
  const sql = fs.readFileSync(path.join(MIG_DIR, `${name}.up.sql`), "utf8");
  return conn.exec(sql);
}

const DEFAULT_ACTOR = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "doctor@beyu.health",
  role: "doctor",
  permissions: ["patient:read", "patient:register"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
};

function runWithActor<T>(tenantCtx: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestStorage.run(
      { correlationId: "test-cid", requestId: "test-rid", startedAt: Date.now(), method: "TEST", path: "/", ip: "127.0.0.1" },
      () => tenantCtx.run(DEFAULT_ACTOR as never, () => fn().then(resolve, reject)),
    );
  });
}

describe("PatientsService", () => {
  let conn: PGliteConnection;
  let tenantCtx: TenantContext;
  let repo: PatientRepository;
  let svc: PatientsService;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    const migs = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".up.sql")).sort();
    for (const f of migs) await applyUp(conn, f.replace(/\.up\.sql$/, ""));
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('00000000-0000-0000-0000-000000000001','doctor@beyu.health','Dr T','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('11111111-1111-1111-1111-111111111111','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','doctor');
    `);
    tenantCtx = new TenantContext();
    repo = new PatientRepository(conn, tenantCtx);
    const audit = new AuditService(conn, tenantCtx);
    svc = new PatientsService(repo, audit, conn, tenantCtx);
  });

  it("creates and retrieves a patient within the tenant, and writes an audit row", () =>
    runWithActor(tenantCtx, async () => {
      const input: CreatePatientInput = {
        medical_record: "MRN-001",
        given_name: "Amani",
        family_name: "Beyu",
        sex: "female",
        dob: "1990-01-01",
        phone: "+255700000000",
      };
      const created = await svc.create(input);
      expect(created.patient_id).toBeTruthy();
      expect(created.medical_record).toBe("MRN-001");
      expect(created.tenant_id).toBe("11111111-1111-1111-1111-111111111111");
      expect(created.created_by).toBe("00000000-0000-0000-0000-000000000001");

      const got = await svc.get(created.patient_id);
      expect(got.given_name).toBe("Amani");
      const list = await svc.list();
      expect(list.find((p) => p.patient_id === created.patient_id)).toBeTruthy();

      // Audit row was written atomically with the patient insert.
      const auditRows = await conn.query<{ operation: string; resource_id: string }>(
        `SELECT operation, resource_id FROM health.audit_log WHERE resource_type='patient' AND resource_id=$1`,
        [created.patient_id],
      );
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].operation).toBe("patient.register");
    }));

  it("rejects duplicate MRN in the same tenant", () =>
    runWithActor(tenantCtx, async () => {
      await svc.create({ medical_record: "MRN-DUP2", given_name: "X", family_name: "Y" });
      await expect(
        svc.create({ medical_record: "MRN-DUP2", given_name: "X2", family_name: "Y2" }),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("stamps every patient row with tenant_id and created_by (provenance)", () =>
    runWithActor(tenantCtx, async () => {
      const created = await svc.create({ medical_record: "MRN-PROV3", given_name: "Prov", family_name: "Enance" });
      expect(created.tenant_id).toBe("11111111-1111-1111-1111-111111111111");
      expect(created.created_by).toBe("00000000-0000-0000-0000-000000000001");
      expect(created.status).toBe("active");
    }));

  it("RLS policy exists on health.patients", () =>
    runWithActor(tenantCtx, async () => {
      const rows = await conn.query<{ policyname: string }>(
        `SELECT policyname FROM pg_policies WHERE schemaname='health' AND tablename='patients'`,
      );
      expect(rows.map((r) => r.policyname)).toContain("health_patients_isolation");
    }));
});
