import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { PatientRepository } from "../patients/patient.repository";
import { PatientsService } from "../patients/patients.service";
import { ClinicalRepository } from "./clinical.repository";
import { ClinicalService } from "./clinical.service";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";

const MIG = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
const applyUp = (c: PGliteConnection, n: string) =>
  c.exec(fs.readFileSync(path.join(MIG, `${n}.up.sql`), "utf8"));

const ACTOR = {
  userId: "00000000-0000-0000-0000-000000000003",
  email: "doc@beyu.health",
  role: "doctor",
  permissions: ["patient:read", "patient:register", "phi:read", "phi:write", "rx:write", "note:write"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
};

function runWith<T>(tc: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) =>
    requestStorage.run(
      { correlationId: "c", requestId: "r", startedAt: Date.now(), method: "T", path: "/", ip: "127.0.0.1" },
      () => tc.run(ACTOR as never, () => fn().then(res, rej)),
    ),
  );
}

describe("ClinicalService", () => {
  let conn: PGliteConnection;
  let tc: TenantContext;
  let svc: ClinicalService;
  let patientId: string;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs.readdirSync(MIG).filter((x) => x.endsWith(".up.sql")).sort()) {
      await applyUp(conn, f.replace(/\.up\.sql$/, ""));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('00000000-0000-0000-0000-000000000003','doc@beyu.health','Doc','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('11111111-1111-1111-1111-111111111111','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','doctor');
    `);
    tc = new TenantContext();
    const prepo = new PatientRepository(conn, tc);
    const audit = new AuditService(conn, tc);
    const patients = new PatientsService(prepo, audit, conn, tc);
    const crepo = new ClinicalRepository(conn, tc);
    svc = new ClinicalService(crepo, audit);
    await runWith(tc, async () => {
      const p = await patients.create({ medical_record: "MRN-C", given_name: "C", family_name: "Lin" });
      patientId = p.patient_id;
    });
  });

  it("adds and lists problems, observations, medications, allergies", () =>
    runWith(tc, async () => {
      const prob = await svc.addProblem({ patient_id: patientId, description: "Hypertension", code: "I10", code_system: "ICD-10", severity: "moderate" });
      expect(prob.problem_id).toBeTruthy();
      expect(prob.status).toBe("active");
      const probs = await svc.listProblems(patientId);
      expect(probs).toHaveLength(1);

      const obs = await svc.addObservation({ patient_id: patientId, code: "8867-4", display: "Heart rate", value_numeric: 78, value_units: "bpm", category: "vital-signs" });
      expect(obs.observation_id).toBeTruthy();
      const vitals = await svc.listObservations(patientId, "vital-signs");
      expect(vitals.length).toBeGreaterThanOrEqual(1);

      const med = await svc.addMedication({ patient_id: patientId, name: "Amlodipine", dose: "5mg", route: "oral", frequency: "once daily" });
      expect(med.medication_id).toBeTruthy();
      expect(med.status).toBe("active");

      const alg = await svc.addAllergy({ patient_id: patientId, substance_name: "Penicillin", category: "medication", severity: "severe", reaction: "Rash" });
      expect(alg.allergy_id).toBeTruthy();
      const alls = await svc.listAllergies(patientId);
      expect(alls).toHaveLength(1);
      expect(alls[0].severity).toBe("severe");
    }));

  it("CHECK constraint rejects invalid severity", () =>
    runWith(tc, async () => {
      await expect(svc.addProblem({ patient_id: patientId, description: "X", severity: "bogus" })).rejects.toThrow();
    }));
});
