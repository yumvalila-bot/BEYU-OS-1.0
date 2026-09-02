/**
 * Shared test helper: boots a fresh PGlite, applies every migration, seeds
 * an actor tenant, and exposes helpers for wrapping code in actor ALS
 * contexts.
 */
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../../modules/identity/db-connection";
import { TenantContext } from "../security/tenant-context";
import { requestStorage } from "../observability/correlation-id.middleware";
import { AuditService } from "../../modules/audit/audit.service";
import { PatientRepository } from "../../modules/patients/patient.repository";
import { PatientsService } from "../../modules/patients/patients.service";

export const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

export const TEST_ACTOR = {
  userId: "00000000-0000-0000-0000-000000000001",
  globalUserId: "00000000-0000-0000-0000-000000000001",
  email: "doc@beyu.health",
  role: "doctor",
  permissions: [
    "patient:read",
    "patient:register",
    "phi:read",
    "phi:write",
    "rx:write",
    "rx:dispense",
    "rx:controlled",
    "order:lab",
    "order:imaging",
    "note:write",
    "note:sign",
    "appointment:read",
    "appointment:book",
    "appointment:transition",
    "encounter:start",
    "encounter:complete",
    "billing:read",
    "billing:write",
    "payment:receive",
    "inventory:read",
    "inventory:write",
    "audit:read",
    "report:read",
    "report:submit",
    "tenant:admin",
  ],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
  timezone: "Africa/Dar_es_Salaam",
};

export interface TestBed {
  db: PGlite;
  conn: PGliteConnection;
  tenantCtx: TenantContext;
  audit: AuditService;
  patientService: PatientsService;
  patientRepo: PatientRepository;
  /** Run fn wrapped in the test actor's correlation + tenant ALS context. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Create and return a test patient. */
  seedPatient(mrn?: string): Promise<{ patient_id: string }>;
}

export async function buildTestBed(): Promise<TestBed> {
  const db = new PGlite();
  const conn = new PGliteConnection(db);
  const migs = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();
  for (const f of migs) {
    await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
  }
  await conn.exec(
    `INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
       VALUES ('${TEST_ACTOR.userId}','${TEST_ACTOR.email}','Test Doctor','x')
       ON CONFLICT DO NOTHING;
     INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
       VALUES ('${TEST_ACTOR.tenantId}','test','Test Tenant','TZ','HOSP-1')
       ON CONFLICT DO NOTHING;
     INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
       VALUES ('${TEST_ACTOR.userId}','${TEST_ACTOR.tenantId}','doctor')
       ON CONFLICT DO NOTHING;`,
  );
  const tenantCtx = new TenantContext();
  const audit = new AuditService(conn, tenantCtx);
  const patientRepo = new PatientRepository(conn, tenantCtx);
  const patientService = new PatientsService(
    patientRepo,
    audit,
    conn,
    tenantCtx,
  );

  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((res, rej) => {
      requestStorage.run(
        {
          correlationId: "test-cid",
          requestId: "test-rid",
          startedAt: Date.now(),
          method: "TEST",
          path: "/",
          ip: "127.0.0.1",
        },
        () => tenantCtx.run(TEST_ACTOR as never, () => fn().then(res, rej)),
      );
    });
  }

  let seq = 0;
  async function seedPatient(mrn?: string): Promise<{ patient_id: string }> {
    seq += 1;
    return run(() =>
      patientService.create({
        medical_record: mrn ?? `MRN-T${seq}`,
        given_name: "Test",
        family_name: `Patient${seq}`,
      }),
    );
  }

  return {
    db,
    conn,
    tenantCtx,
    audit,
    patientService,
    patientRepo,
    run,
    seedPatient,
  };
}
