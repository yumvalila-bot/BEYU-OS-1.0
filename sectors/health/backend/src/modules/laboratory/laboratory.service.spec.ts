import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { LaboratoryRepository } from "./laboratory.repository";
import { LaboratoryService } from "./laboratory.service";
import { DomainError } from "../../common/errors/domain.error";

describe("LaboratoryService", () => {
  let bed: TestBed;
  let svc: LaboratoryService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new LaboratoryRepository(bed.conn, bed.tenantCtx);
    svc = new LaboratoryService(repo, bed.audit);
  });

  async function seedEncounter(
    patientId: string,
  ): Promise<{ encounter_id: string }> {
    const r = await bed.conn.query<{ encounter_id: string }>(
      `INSERT INTO health.encounters (tenant_id, encounter_no, patient_id, status, created_by, correlation_id)
       VALUES ($1,$2,$3,'in_progress',$4,'c') RETURNING encounter_id`,
      [
        bed.tenantCtx.tenantId(),
        `E${Date.now()}-${Math.random()}`,
        patientId,
        "00000000-0000-0000-0000-000000000001",
      ],
    );
    return r[0];
  }

  it("catalogs lab tests and creates a multi-test order", () =>
    bed.run(async () => {
      const cbc = (await svc.createTest({
        code: "CBC",
        name: "Complete Blood Count",
        specimen_type: "blood",
      })) as any;
      const cmp = (await svc.createTest({
        code: "CMP",
        name: "Comprehensive Metabolic Panel",
        specimen_type: "blood",
      })) as any;
      expect(cbc.test_id).toBeTruthy();
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const order = (await svc.createOrder({
        encounter_id: enc.encounter_id,
        patient_id: p.patient_id,
        test_ids: [cbc.test_id, cmp.test_id],
      })) as any;
      expect(order.order_id).toBeTruthy();
      expect(order.status).toBe("ordered");
      const items = await bed.conn.query(
        `SELECT * FROM health.lab_order_items WHERE order_id=$1`,
        [order.order_id],
      );
      expect(items).toHaveLength(2);
    }));

  it("advances order state machine ordered->collected->received->in_progress->completed", () =>
    bed.run(async () => {
      const cat = (await svc.createTest({
        code: "HB",
        name: "Hemoglobin",
        specimen_type: "blood",
        unit: "g/dL",
      })) as any;
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const order = (await svc.createOrder({
        encounter_id: enc.encounter_id,
        patient_id: p.patient_id,
        test_ids: [cat.test_id],
      })) as any;
      const collected = (await svc.transition(
        order.order_id,
        "collected",
      )) as any;
      expect(collected.status).toBe("collected");
      expect(collected.collected_at).toBeTruthy();
      await svc.transition(order.order_id, "received");
      await svc.transition(order.order_id, "in_progress");
      const completed = (await svc.transition(
        order.order_id,
        "completed",
      )) as any;
      expect(completed.status).toBe("completed");
      expect(completed.completed_at).toBeTruthy();
    }));

  it("rejects invalid state transitions (ordered -> in_progress skips steps)", () =>
    bed.run(async () => {
      const cat = (await svc.createTest({
        code: "GLU",
        name: "Glucose",
        specimen_type: "blood",
      })) as any;
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const order = (await svc.createOrder({
        encounter_id: enc.encounter_id,
        patient_id: p.patient_id,
        test_ids: [cat.test_id],
      })) as any;
      await expect(
        svc.transition(order.order_id, "in_progress"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("unverified results carry verified_at NULL; verify + double-verify gate", () =>
    bed.run(async () => {
      const cat = (await svc.createTest({
        code: "K",
        name: "Potassium",
        specimen_type: "blood",
      })) as any;
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const order = (await svc.createOrder({
        encounter_id: enc.encounter_id,
        patient_id: p.patient_id,
        test_ids: [cat.test_id],
      })) as any;
      const items = await bed.conn.query<{ order_item_id: string }>(
        `SELECT order_item_id FROM health.lab_order_items WHERE order_id=$1`,
        [order.order_id],
      );
      const itemId = items[0].order_item_id;
      await expect(svc.verifyResult(itemId)).rejects.toBeInstanceOf(
        DomainError,
      );
      const r = (await svc.enterResult(itemId, {
        value_numeric: 4.1,
        abnormal_flag: "normal",
        comment: "ok",
      })) as any;
      expect(r.verified_at).toBeNull();
      const v = (await svc.verifyResult(itemId)) as any;
      expect(v.verified_at).toBeTruthy();
      // Double-verify is rejected (row already has verified_at -> UPDATE returns zero rows).
      await expect(svc.verifyResult(itemId)).rejects.toBeInstanceOf(
        DomainError,
      );
    }));

  it("idempotency key prevents duplicate order submission", () =>
    bed.run(async () => {
      const cat = (await svc.createTest({
        code: "NA",
        name: "Sodium",
        specimen_type: "blood",
      })) as any;
      const p = await bed.seedPatient();
      const enc = await seedEncounter(p.patient_id);
      const o1 = (await svc.createOrder({
        encounter_id: enc.encounter_id,
        patient_id: p.patient_id,
        test_ids: [cat.test_id],
        idempotency_key: "idem-lab-1",
      })) as any;
      const o2 = (await svc.createOrder({
        encounter_id: enc.encounter_id,
        patient_id: p.patient_id,
        test_ids: [cat.test_id],
        idempotency_key: "idem-lab-1",
      })) as any;
      expect(o2.order_id).toBe(o1.order_id);
    }));
});
