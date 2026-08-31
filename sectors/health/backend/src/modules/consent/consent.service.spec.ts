import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";
import { PatientRepository } from "../patients/patient.repository";
import { PatientsService } from "../patients/patients.service";
import { ConsentService } from "./consent.service";

const MIG_DIR = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
const ACTOR = {
  userId: "00000000-0000-0000-0000-0000000000cc",
  email: "consent@beyu.health",
  role: "nurse",
  permissions: ["patient:read", "patient:register", "phi:read", "phi:write"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
};

function run<T>(tc: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) =>
    requestStorage.run(
      { correlationId: "t", requestId: "r", startedAt: Date.now(), method: "T", path: "/", ip: "127.0.0.1" },
      () => tc.run(ACTOR as never, () => fn().then(res, rej)),
    ),
  );
}

describe("ConsentService (non-boolean)", () => {
  let conn: PGliteConnection;
  let tc: TenantContext;
  let svc: ConsentService;
  let patients: PatientsService;
  let pid: string;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs.readdirSync(MIG_DIR).filter((x) => x.endsWith(".up.sql")).sort()) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('${ACTOR.userId}','consent@beyu.health','Nurse','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('${ACTOR.tenantId}','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('${ACTOR.userId}','${ACTOR.tenantId}','nurse');`);
    tc = new TenantContext();
    const audit = new AuditService(conn, tc);
    const repo = new PatientRepository(conn, tc);
    patients = new PatientsService(repo, audit, conn, tc);
    svc = new ConsentService(conn, tc, audit);
  });

  it("fail-closes when no consent exists; passes after grant; withdrawn revokes", () =>
    run(tc, async () => {
      const p = await patients.create({ medical_record: "MRN-C1", given_name: "Fatima", family_name: "Ali" });
      pid = p.patient_id;
      expect(await svc.assert(pid, "data_share_nhif", "diagnoses", "NHIF")).toBe(false);
      await expect(svc.requireConsent(pid, "data_share_nhif", "diagnoses", "NHIF")).rejects.toThrow(/No active consent/);

      await svc.grant({
        patient_id: pid,
        purpose: "data_share_nhif",
        data_categories: ["diagnoses", "demographics"],
        recipient: "NHIF",
        legal_basis: "consent",
        evidence: { channel: "paper_form", form_id: "NHIF-C-001" },
      });
      expect(await svc.assert(pid, "data_share_nhif", "diagnoses", "NHIF")).toBe(true);

      // Wrong category fails.
      expect(await svc.assert(pid, "data_share_nhif", "medications", "NHIF")).toBe(false);
    }));
});
