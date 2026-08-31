import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { PharmacyRepository } from "./pharmacy.repository";
import { PharmacyService } from "./pharmacy.service";
import { DomainError } from "../../common/errors/domain.error";

describe("PharmacyService", () => {
  let bed: TestBed;
  let svc: PharmacyService;
  let itemId: string;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new PharmacyRepository(bed.conn, bed.tenantCtx);
    svc = new PharmacyService(repo, bed.audit, bed.tenantCtx);
  });

  it("creates a catalog item and receives stock (no negative stock)", () =>
    bed.run(async () => {
      const item = (await svc.createCatalogItem({
        sku: "AML-5", name: "Amlodipine 5mg", form: "tablet", strength: "5mg", unit: "each",
      })) as { item_id: string };
      expect(item.item_id).toBeTruthy();
      itemId = item.item_id;
      const r = await svc.receiveStock({ item_id: itemId, lot_number: "LOT1", expiry_date: "2027-12-31", qty: 100 });
      expect(Number(r.on_hand)).toBe(100);
    }));

  it("dispense decrements stock and writes a dispense record", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const med = await bed.conn.query<{ medication_id: string }>(
        `INSERT INTO health.medications (tenant_id, patient_id, name, dose, status, created_by, correlation_id)
         VALUES ($1,$2,'Amlodipine','5mg oral','active',$3,'t') RETURNING medication_id`,
        [bed.tenantCtx.tenantId(), p.patient_id, "00000000-0000-0000-0000-000000000001"],
      );
      const d = await svc.dispense({ medication_id: med[0].medication_id, patient_id: p.patient_id, item_id: itemId, qty: 30 });
      expect((d as any).dispense.status).toBe("dispensed");
      expect(Number((d as any).on_hand)).toBe(70);
    }));

  it("rejects dispensing more than on hand (negative stock prevention)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const med = await bed.conn.query<{ medication_id: string }>(
        `INSERT INTO health.medications (tenant_id, patient_id, name, dose, status, created_by, correlation_id)
         VALUES ($1,$2,'Over dispense','1 tab','active',$3,'t') RETURNING medication_id`,
        [bed.tenantCtx.tenantId(), p.patient_id, "00000000-0000-0000-0000-000000000001"],
      );
      await expect(
        svc.dispense({ medication_id: med[0].medication_id, patient_id: p.patient_id, item_id: itemId, qty: 9999 }),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("re-dispensing with same idempotency key returns the original record", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const med = await bed.conn.query<{ medication_id: string }>(
        `INSERT INTO health.medications (tenant_id, patient_id, name, dose, status, created_by, correlation_id)
         VALUES ($1,$2,'idem','1','active',$3,'t') RETURNING medication_id`,
        [bed.tenantCtx.tenantId(), p.patient_id, "00000000-0000-0000-0000-000000000001"],
      );
      const d1 = await svc.dispense({ medication_id: med[0].medication_id, patient_id: p.patient_id, item_id: itemId, qty: 1, idempotency_key: "idem-d1" });
      const d2 = await svc.dispense({ medication_id: med[0].medication_id, patient_id: p.patient_id, item_id: itemId, qty: 1, idempotency_key: "idem-d1" });
      const id1 = (d1 as any).dispense ? (d1 as any).dispense.dispense_id : (d1 as any).dispense_id;
      const id2 = (d2 as any).dispense ? (d2 as any).dispense.dispense_id : (d2 as any).dispense_id;
      expect(id2).toBe(id1);
    }));
});
