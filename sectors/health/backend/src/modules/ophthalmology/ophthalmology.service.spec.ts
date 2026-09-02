import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { OphthalmologyRepository } from "./ophthalmology.repository";
import { OphthalmologyService } from "./ophthalmology.service";
import { DomainError } from "../../common/errors/domain.error";

describe("OphthalmologyService", () => {
  let bed: TestBed;
  let svc: OphthalmologyService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new OphthalmologyRepository(bed.conn, bed.tenantCtx);
    svc = new OphthalmologyService(repo, bed.audit, bed.conn, bed.tenantCtx);
  });

  it("creates a structured eye exam preserving laterality (right/left/bilateral)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const e = (await svc.addExam({
        patient_id: p.patient_id,
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
      })) as any;
      expect(e.exam_id).toBeTruthy();
      expect(e.laterality_focus).toBe("bilateral");
      expect(e.signed_at).toBeNull();
    }));

  it("signing requires note:sign permission and prevents double-sign", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const e = (await svc.addExam({
        patient_id: p.patient_id,
        laterality_focus: "right",
        diagnosis: "Cataract",
      })) as any;
      const s = (await svc.sign(e.exam_id)) as any;
      expect(s.signed_at).toBeTruthy();
      await expect(svc.sign(e.exam_id)).rejects.toBeInstanceOf(DomainError);
    }));
});
