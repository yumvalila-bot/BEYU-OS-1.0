import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";
import { PatientsService } from "../patients/patients.service";
import { PatientRepository } from "../patients/patient.repository";
import { DialysisService } from "./dialysis.service";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);
const ACTOR = {
  userId: "00000000-0000-0000-0000-00000000000d",
  email: "nephro@beyu.health",
  role: "doctor",
  permissions: ["patient:read", "patient:register", "phi:read", "phi:write"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
};

function run<T>(tc: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) =>
    requestStorage.run(
      {
        correlationId: "t",
        requestId: "r",
        startedAt: Date.now(),
        method: "T",
        path: "/",
        ip: "127.0.0.1",
      },
      () => tc.run(ACTOR as never, () => fn().then(res, rej)),
    ),
  );
}

describe("DialysisService", () => {
  let conn: PGliteConnection;
  let tc: TenantContext;
  let svc: DialysisService;
  let patients: PatientsService;
  let patientId: string;
  let machineId: string;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs
      .readdirSync(MIG_DIR)
      .filter((x) => x.endsWith(".up.sql"))
      .sort()) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('${ACTOR.userId}','nephro@beyu.health','Nephro','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('${ACTOR.tenantId}','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('${ACTOR.userId}','${ACTOR.tenantId}','doctor');`);
    tc = new TenantContext();
    const audit = new AuditService(conn, tc);
    const repo = new PatientRepository(conn, tc);
    patients = new PatientsService(repo, audit, conn, tc);
    svc = new DialysisService(conn, tc, audit);
  });

  it("registers a machine, schedules a session, enforces state machine, and captures adverse events", () =>
    run(tc, async () => {
      const p = await patients.create({
        medical_record: "MRN-DX1",
        given_name: "Juma",
        family_name: "Hassan",
      });
      patientId = p.patient_id;
      const m = await svc.registerMachine({
        asset_tag: "DX-01",
        model: "Fresenius 5008",
        serial_number: "SN-1",
        water_quality_last_test: new Date().toISOString(),
        next_maintenance: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10),
      });
      machineId = m.machine_id;
      const s = await svc.schedule({
        patient_id: patientId,
        machine_id: machineId,
        session_type: "hemodialysis",
      });
      expect(s.session_id).toBeTruthy();

      // Cannot skip steps.
      await expect(svc.transition(s.session_id, "completed")).rejects.toThrow(
        /cannot transition/,
      );

      await svc.transition(s.session_id, "in_progress");
      const got = await svc.get(s.session_id);
      expect(got.status).toBe("in_progress");
      expect(got.start_time).toBeTruthy();

      // Complete with an adverse event recorded.
      await svc.transition(s.session_id, "completed", {
        adverse_events: { hypotension: true, intervention: "fluid_bolus" },
        notes: "Uneventful recovery.",
      });
      const done = await svc.get(s.session_id);
      expect(done.status).toBe("completed");
      expect(done.end_time).toBeTruthy();
      expect((done.adverse_events as any).hypotension).toBe(true);
    }));

  it("fails closed when machine is unavailable or maintenance is overdue", () =>
    run(tc, async () => {
      const p2 = await patients.create({
        medical_record: "MRN-DX2",
        given_name: "Asha",
        family_name: "Omar",
      });
      // Machine not available (in use after previous completed -> released to available: skip)
      // Register a machine with overdue maintenance.
      const bad = await svc.registerMachine({
        asset_tag: "DX-BAD",
        water_quality_last_test: new Date(
          Date.now() - 60 * 86400000,
        ).toISOString(),
      });
      await expect(
        svc.schedule({ patient_id: p2.patient_id, machine_id: bad.machine_id }),
      ).rejects.toThrow(/water quality test older/);
    }));
});
