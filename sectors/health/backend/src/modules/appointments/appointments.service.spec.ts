import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { AppointmentRepository } from "./appointment.repository";
import { AppointmentsService } from "./appointments.service";
import { PatientRepository } from "../patients/patient.repository";
import { PatientsService } from "../patients/patients.service";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);
const applyUp = (conn: PGliteConnection, name: string) =>
  conn.exec(fs.readFileSync(path.join(MIG_DIR, `${name}.up.sql`), "utf8"));

const TENANT_A = "11111111-1111-1111-1111-111111111111";

const ACTOR = {
  userId: "00000000-0000-0000-0000-000000000002",
  email: "front@beyu.health",
  role: "front_desk",
  permissions: [
    "patient:read",
    "patient:register",
    "appointment:read",
    "appointment:book",
    "appointment:transition",
  ],
  tenantId: TENANT_A,
  countryCode: "TZ",
  entityCode: "HOSP-1",
};

function runWith<T>(
  tenantCtx: TenantContext,
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestStorage.run(
      {
        correlationId: "t",
        requestId: "t",
        startedAt: Date.now(),
        method: "TEST",
        path: "/",
        ip: "127.0.0.1",
      },
      () => tenantCtx.run(ACTOR as never, () => fn().then(resolve, reject)),
    );
  });
}

describe("AppointmentsService", () => {
  let conn: PGliteConnection;
  let tenantCtx: TenantContext;
  let patients: PatientsService;
  let svc: AppointmentsService;
  let patientId: string;
  const PROVIDER = "00000000-0000-0000-0000-0000000000aa";

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs
      .readdirSync(MIG_DIR)
      .filter((x) => x.endsWith(".up.sql"))
      .sort()) {
      await applyUp(conn, f.replace(/\.up\.sql$/, ""));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('00000000-0000-0000-0000-000000000002','front@beyu.health','Front','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('11111111-1111-1111-1111-111111111111','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('00000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','front_desk');
    `);
    tenantCtx = new TenantContext();
    const patientRepo = new PatientRepository(conn, tenantCtx);
    const audit = new AuditService(conn, tenantCtx);
    patients = new PatientsService(patientRepo, audit, conn, tenantCtx);
    const repo = new AppointmentRepository(conn, tenantCtx);
    svc = new AppointmentsService(repo, audit);
    await runWith(tenantCtx, async () => {
      const p = await patients.create({
        medical_record: "MRN-APPT",
        given_name: "B",
        family_name: "C",
      });
      patientId = p.patient_id;
      await conn.exec(
        `INSERT INTO health.providers (provider_id, tenant_id, global_user_id, cadre, title, status, created_by, correlation_id)
         VALUES ('${PROVIDER}', '${ACTOR.tenantId}', '${ACTOR.userId}', 'doctor', 'Dr', 'active', '${ACTOR.userId}', 't')`,
      );
    });
  });

  it("books an appointment and retrieves it", () =>
    runWith(tenantCtx, async () => {
      const a = await svc.create({
        patient_id: patientId,
        provider_id: PROVIDER,
        kind: "followup",
        scheduled_for: "2026-09-01T09:00:00Z",
        duration_min: 30,
        reason: "Follow-up",
      });
      expect(a.appointment_id).toBeTruthy();
      expect(a.status).toBe("scheduled");
      expect(a.kind).toBe("followup");
      expect(a.duration_min).toBe(30);
      expect(a.appointment_no).toMatch(/^APT-/);
      const got = await svc.get(a.appointment_id);
      expect(got.patient_id).toBe(patientId);
    }));

  it("rejects double-booking the same provider in overlapping windows", () =>
    runWith(tenantCtx, async () => {
      await svc.create({
        patient_id: patientId,
        provider_id: PROVIDER,
        scheduled_for: "2026-09-02T09:00:00Z",
        duration_min: 30,
        idempotency_key: "k1",
      });
      // Overlaps (starts at 09:15, 30 min overlaps with 09:00-09:30).
      await expect(
        svc.create({
          patient_id: patientId,
          provider_id: PROVIDER,
          scheduled_for: "2026-09-02T09:15:00Z",
          duration_min: 30,
        }),
      ).rejects.toBeInstanceOf(DomainError);
      // Non-overlapping (starts at 09:30 exactly) is fine.
      const later = await svc.create({
        patient_id: patientId,
        provider_id: PROVIDER,
        scheduled_for: "2026-09-02T09:30:00Z",
        duration_min: 15,
      });
      expect(later.status).toBe("scheduled");
    }));

  it("is idempotent on idempotency_key replays", () =>
    runWith(tenantCtx, async () => {
      const a1 = await svc.create({
        patient_id: patientId,
        scheduled_for: "2026-09-03T09:00:00Z",
        duration_min: 15,
        idempotency_key: "idem-1",
      });
      const a2 = await svc.create({
        patient_id: patientId,
        scheduled_for: "2026-09-03T09:00:00Z",
        duration_min: 15,
        idempotency_key: "idem-1",
      });
      expect(a2.appointment_id).toBe(a1.appointment_id);
    }));

  it("enforces state machine transitions (scheduled→checked_in→in_progress→completed)", () =>
    runWith(tenantCtx, async () => {
      const a = await svc.create({
        patient_id: patientId,
        provider_id: PROVIDER,
        scheduled_for: "2026-09-04T09:00:00Z",
        duration_min: 30,
      });
      // Illegal: scheduled → completed directly.
      await expect(
        svc.transition(a.appointment_id, "completed"),
      ).rejects.toBeInstanceOf(DomainError);
      // Legal path.
      const ci = await svc.transition(a.appointment_id, "checked_in");
      expect(ci.status).toBe("checked_in");
      expect(ci.checked_in_at).toBeTruthy();
      const ip = await svc.transition(a.appointment_id, "in_progress");
      expect(ip.status).toBe("in_progress");
      expect(ip.started_at).toBeTruthy();
      const done = await svc.transition(a.appointment_id, "completed");
      expect(done.status).toBe("completed");
      expect(done.ended_at).toBeTruthy();
      // Cannot transition out of completed.
      await expect(
        svc.transition(a.appointment_id, "cancelled"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("rejects invalid durations", () =>
    runWith(tenantCtx, async () => {
      await expect(
        svc.create({
          patient_id: patientId,
          scheduled_for: "2026-09-05T10:00:00Z",
          duration_min: 0,
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("prevents double-booking: overlapping window for same provider is rejected (transactional guard)", () =>
    runWith(tenantCtx, async () => {
      const docId = "00000000-0000-0000-0000-000000000099";
      await conn.exec(
        `INSERT INTO beyu_identity.users (global_user_id,email,display_name,password_hash)
           VALUES ('${docId}','prov@b.c','Dr Double','x') ON CONFLICT DO NOTHING;`,
      );
      const prov = await conn.query<{ provider_id: string }>(
        `INSERT INTO health.providers (tenant_id, global_user_id, cadre, created_by, correlation_id)
         VALUES ($1,$2,'doctor',$3,'c') RETURNING provider_id`,
        [TENANT_A, docId, ACTOR.userId],
      );
      const provider_id = prov[0].provider_id;
      await svc.create({
        patient_id: patientId,
        provider_id,
        scheduled_for: "2026-10-01T09:00:00Z",
        duration_min: 30,
      });
      await expect(
        svc.create({
          patient_id: patientId,
          provider_id,
          scheduled_for: "2026-10-01T09:15:00Z",
          duration_min: 30,
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }));
});
