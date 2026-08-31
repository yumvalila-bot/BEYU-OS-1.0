import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { RadiologyRepository } from "./radiology.repository";
import { RadiologyService } from "./radiology.service";
import { DomainError } from "../../common/errors/domain.error";

describe("RadiologyService", () => {
  let bed: TestBed;
  let svc: RadiologyService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new RadiologyRepository(bed.conn, bed.tenantCtx);
    svc = new RadiologyService(repo, bed.audit, bed.tenantCtx);
  });

  async function seedEncounter(patientId: string): Promise<{ encounter_id: string }> {
    const r = await bed.conn.query<{ encounter_id: string }>(
      `INSERT INTO health.encounters (tenant_id, encounter_no, patient_id, status, created_by, correlation_id)
       VALUES ($1,$2,$3,'in_progress',$4,'c') RETURNING encounter_id`,
      [bed.tenantCtx.tenantId(), `E${Date.now()}-${Math.random()}`, patientId, "00000000-0000-0000-0000-000000000001"],
    );
    return r[0];
  }

  it("creates an imaging order with modality/body_part/laterality/contrast/urgency", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const o = (await svc.createOrder({
        encounter_id: enc.encounter_id, patient_id: p.patient_id,
        modality: "xray", body_part: "chest", laterality: "bilateral", contrast: false, urgency: "routine",
      })) as any;
      expect(o.imaging_order_id).toBeTruthy();
      expect(o.status).toBe("ordered");
    }));

  it("state machine ordered -> scheduled -> in_progress -> preliminary -> final (with note:sign verification)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const o = (await svc.createOrder({
        encounter_id: enc.encounter_id, patient_id: p.patient_id, modality: "ct", body_part: "head",
      })) as any;
      await svc.transition(o.imaging_order_id, "scheduled");
      await svc.transition(o.imaging_order_id, "in_progress");
      await svc.transition(o.imaging_order_id, "preliminary");
      const r = (await svc.addReport({ imaging_order_id: o.imaging_order_id, findings: "Normal", impression: "No acute process" })) as any;
      expect(r.report_id).toBeTruthy();
      const v = (await svc.verifyReport(r.report_id)) as any;
      expect(v.verified_at).toBeTruthy();
      expect(v.status).toBe("final");
      // Double-verify rejected.
      await expect(svc.verifyReport(r.report_id)).rejects.toBeInstanceOf(DomainError);
    }));

  it("rejects invalid state transitions", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const o = (await svc.createOrder({ encounter_id: enc.encounter_id, patient_id: p.patient_id, modality: "ultrasound", body_part: "abdomen" })) as any;
      await expect(svc.transition(o.imaging_order_id, "in_progress")).rejects.toBeInstanceOf(DomainError);
    }));

  it("idempotency key prevents duplicate order submission", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const o1 = (await svc.createOrder({ encounter_id: enc.encounter_id, patient_id: p.patient_id, modality: "mri", body_part: "spine", idempotency_key: "idem-img-1" })) as any;
      const o2 = (await svc.createOrder({ encounter_id: enc.encounter_id, patient_id: p.patient_id, modality: "mri", body_part: "spine", idempotency_key: "idem-img-1" })) as any;
      expect(o2.imaging_order_id).toBe(o1.imaging_order_id);
    }));
});
