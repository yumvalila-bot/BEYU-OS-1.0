/**
 * HTTP E2E — Ophthalmology happy-path journey (Phase 6 evidence).
 *
 * Authenticated doctor (tenant A):
 *   register/login → patient create → structured eye-exam create →
 *   list for patient → retrieve exam → sign (clinical-safety + HCM
 *   test-bypass) → double-sign must be normalized to a mapped HTTP status
 *   (NOT 2xx).
 *
 * Scope note (honest boundary):
 *   buildE2EHarness boots the Nest app against an in-memory PGlite whose
 *   default role is the table OWNER, therefore PostgreSQL RLS is bypassed in
 *   this harness by design. HTTP-level cross-tenant isolation assertions are
 *   therefore NOT meaningful here and are NOT fabricated — they are verified
 *   by src/modules/ophthalmology/ophthalmology.rls-isolation.spec.ts against a
 *   REAL non-owner database role (real PostgreSQL when TEST_DATABASE_URL is
 *   set; PGlite `SET ROLE` otherwise).
 */
import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any
const request: any = require("supertest");
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { buildE2EHarness, E2EHarness } from "../../common/testing/e2e-harness";

interface Evidence {
  generated: string;
  schema: string;
  summary: Record<string, number>;
  /**
   * Honest scope note: the PGlite harness role is the superuser/table owner, so
   * RLS is bypassed in this file. Cross-tenant checks live in the SQL-level
   * RLS adversarial spec.
   */
  rlsProof: { engine: string; spec: string };
  steps: Array<{
    id: string;
    name: string;
    status: "PASS" | "FAIL" | "BLOCKED";
    detail: string;
  }>;
}

async function login(
  h: E2EHarness,
  email: string,
  pw: string,
  tenantCode: string,
): Promise<string> {
  const r = await request(h.app.getHttpServer())
    .post("/auth/login")
    .send({ email, password: pw, tenantCode });
  expect(r.status).toBe(200);
  return r.body.accessToken as string;
}

async function makeActor(
  h: E2EHarness,
  email: string,
  role: string,
  tenantId: string,
  tenantCode: string,
): Promise<string> {
  await h.conn.exec(
    `INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
       VALUES ('${tenantId}','${tenantCode}','Tenant ${tenantCode}','TZ','HOSP-'||'${tenantCode}')
       ON CONFLICT DO NOTHING;`,
  );
  const existing = await h.conn.query(
    "SELECT global_user_id FROM beyu_identity.users WHERE email=$1",
    [email],
  );
  if ((existing as any[]).length === 0) {
    const reg = await request(h.app.getHttpServer())
      .post("/auth/register")
      .send({
        email,
        password: "CorrectHorseBattery1!",
        full_name: email,
        tenantCode,
      });
    expect(reg.status).toBe(201);
  }
  const u = await h.conn.query(
    "SELECT global_user_id FROM beyu_identity.users WHERE email=$1",
    [email],
  );
  const uid = (u as any[])[0].global_user_id as string;
  await h.conn.exec(
    `INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
       VALUES ('${uid}','${tenantId}','${role}')
       ON CONFLICT (global_user_id, tenant_id) DO UPDATE SET role='${role}';`,
  );
  return login(h, email, "CorrectHorseBattery1!", tenantCode);
}

describe("HTTP E2E — Ophthalmology clinical journey (happy path + mapped denials)", () => {
  jest.setTimeout(90_000);
  let h: E2EHarness;
  let doctorAToken: string;
  let patientId: string;
  let examId: string;
  const steps: Evidence["steps"] = [];

  async function step(
    id: string,
    name: string,
    fn: () => Promise<{ status: boolean; detail: string }>,
  ): Promise<void> {
    const r = await fn();
    steps.push({
      id,
      name,
      status: r.status ? "PASS" : "FAIL",
      detail: r.detail,
    });
    if (!r.status) throw new Error(`Step ${id} FAILED: ${r.detail}`);
  }

  beforeAll(async () => {
    h = await buildE2EHarness({ normalizeDomainErrors: true });
    h.app.useLogger(["error", "warn", "log"]);
    doctorAToken = await makeActor(
      h,
      `eye-a-${Date.now()}@example.com`,
      "doctor",
      "11111111-1111-1111-1111-111111111111",
      "test",
    );
  });

  afterAll(async () => {
    const evidence: Evidence = {
      generated: new Date().toISOString(),
      schema: "ophthalmology-happy-path-e2e-v1",
      summary: {
        total: steps.length,
        pass: steps.filter((s) => s.status === "PASS").length,
        fail: steps.filter((s) => s.status === "FAIL").length,
        blocked: steps.filter((s) => s.status === "BLOCKED").length,
      },
      rlsProof: {
        engine: process.env.TEST_DATABASE_URL
          ? "real-postgres"
          : "pglite-setrole",
        spec: "src/modules/ophthalmology/ophthalmology.rls-isolation.spec.ts",
      },
      steps,
    };
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "ophthalmology-happy-path-e2e.json"),
      JSON.stringify(evidence, null, 2),
    );
    if (h) await h.close();
  });

  it("authenticated doctor creates a patient", async () => {
    await step(
      "01-patient-create",
      "Tenant-A doctor POST /api/patients creates a patient",
      async () => {
        const r = await request(h.app.getHttpServer())
          .post("/api/patients")
          .set("Authorization", `Bearer ${doctorAToken}`)
          .send({
            medical_record: `MRN-OPH-${Date.now()}`,
            given_name: "Eye",
            family_name: "Patient",
          });
        patientId = r.body?.patient_id;
        return {
          status: r.status === 201 && !!patientId,
          detail: `status=${r.status} patient_id=${patientId ?? "none"}`,
        };
      },
    );
  });

  it("authenticated doctor creates a structured bilateral eye exam", async () => {
    await step(
      "02-exam-create",
      "Tenant-A doctor POST /api/eye-exams creates bilateral exam",
      async () => {
        const r = await request(h.app.getHttpServer())
          .post("/api/eye-exams")
          .set("Authorization", `Bearer ${doctorAToken}`)
          .send({
            patient_id: patientId,
            laterality_focus: "bilateral",
            va_od: "20/20",
            va_os: "20/25",
            refraction_od: "-1.00",
            refraction_os: "-0.50",
            iop_od: 16,
            iop_os: 17,
            slit_lamp_od: "Clear",
            slit_lamp_os: "Clear",
            fundus_od: "Normal",
            fundus_os: "Normal",
            diagnosis_ou: "Myopia",
            plan: "Spectacles",
          });
        examId = r.body?.exam_id;
        return {
          status:
            r.status === 201 &&
            !!examId &&
            r.body?.laterality_focus === "bilateral" &&
            r.body?.signed_at === null,
          detail: `status=${r.status} exam_id=${examId ?? "none"} body=${JSON.stringify(r.body).slice(0, 200)}`,
        };
      },
    );
  });

  it("listForPatient returns the eye exam (retrieve)", async () => {
    await step(
      "03-exam-list",
      "Tenant-A doctor GET /api/eye-exams?patient_id retrieves the exam",
      async () => {
        const r = await request(h.app.getHttpServer())
          .get("/api/eye-exams")
          .query({ patient_id: patientId })
          .set("Authorization", `Bearer ${doctorAToken}`);
        const arr = Array.isArray(r.body) ? r.body : [];
        return {
          status:
            r.status === 200 &&
            arr.length === 1 &&
            arr[0].exam_id === examId &&
            arr[0].va_od === "20/20",
          detail: `status=${r.status} count=${arr.length} match=${arr[0]?.exam_id === examId}`,
        };
      },
    );
  });

  it("doctor signs the exam once and double-sign is mapped to conflict", async () => {
    await step(
      "04-exam-sign-single",
      "Tenant-A doctor signs the eye exam once",
      async () => {
        const r = await request(h.app.getHttpServer())
          .post(`/api/eye-exams/${examId}/sign`)
          .set("Authorization", `Bearer ${doctorAToken}`)
          .send({});
        return {
          status: (r.status === 200 || r.status === 201) && !!r.body?.signed_at,
          detail: `status=${r.status} signed_at=${r.body?.signed_at ?? "none"}`,
        };
      },
    );
    await step(
      "05-exam-sign-double-deny",
      "Double-sign of the same exam is rejected with mapped 409",
      async () => {
        const r = await request(h.app.getHttpServer())
          .post(`/api/eye-exams/${examId}/sign`)
          .set("Authorization", `Bearer ${doctorAToken}`)
          .send({});
        return {
          status: r.status === 409 && r.body?.error?.code === "INVALID_STATE",
          detail: `status=${r.status} code=${r.body?.error?.code ?? "none"}`,
        };
      },
    );
  });

  it("unauthenticated list is rejected", async () => {
    await step(
      "06-exam-list-unauth",
      "Unauthenticated GET /api/eye-exams is denied",
      async () => {
        const r = await request(h.app.getHttpServer()).get("/api/eye-exams");
        return {
          status: r.status === 401 || r.status === 403,
          detail: `status=${r.status}`,
        };
      },
    );
  });
});
