/**
 * Clinical safety gate adversarial tests.
 * All gates must fail CLOSED when any required condition is missing.
 */
import "reflect-metadata";
import { buildTestBed, TEST_ACTOR } from "../../../common/testing/test-bed";
import { ClinicalSafetyGates } from "./clinical-safety.gates";
import { GovernanceAdapter } from "../governance/governance.adapter";
import { HcmAdapter } from "../hcm/hcm.adapter";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";

describe("Clinical safety gates (fail-closed)", () => {
  let bed: any;
  let gates: ClinicalSafetyGates;

  beforeAll(async () => {
    bed = await buildTestBed();
    const cfg = { get: () => undefined } as any;
    const cb = new CircuitBreaker(bed.conn, bed.tenantCtx);
    const hcm = new HcmAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    gates = new ClinicalSafetyGates(bed.tenantCtx, hcm);
  });

  it("pharmacy controlled-substance dispense fails without dual control + unverified licence", async () => {
    await bed.run(async () => {
      const r = await gates.pharmacyDispense({
        action: "pharmacy.dispense.controlled", resourceType: "pharmacy.dispense",
        facilityId: null, controlledSubstance: true, prescriptionId: "rx-1", quantity: 10,
        requiresDualControl: true,
      });
      expect(r.allowed).toBe(false);
      expect(["HCM", "DUAL_CONTROL"]).toContain(r.failedGate);
    });
  });

  it("lab release fails without QC/verification/critical callback", async () => {
    await bed.run(async () => {
      const r = await gates.labRelease({
        action: "lab.result.release", resourceType: "lab.result", facilityId: null,
        specimenIntegrity: true, analyzerAuthorized: true, qcPassed: false,
      });
      expect(r.allowed).toBe(false);
    });
  });

  it("radiology verification fails without radiation safety + DICOM linkage + dose + verification", async () => {
    await bed.run(async () => {
      const r = await gates.radiologyVerify({
        action: "radiology.report.verify", resourceType: "radiology.report", facilityId: null,
        equipmentAuthorized: true, radiationSafetyCleared: false,
      });
      expect(r.allowed).toBe(false);
    });
  });

  it("dialysis treatment fails without water quality / maintenance / patient match / consent", async () => {
    await bed.run(async () => {
      const r = await gates.dialysisTreatment({
        action: "dialysis.treatment.start", resourceType: "dialysis.session", facilityId: null,
        machineAuthorized: true, maintenanceCurrent: true, waterQualityPassed: false,
      });
      expect(r.allowed).toBe(false);
    });
  });

  it("optical dispense fails without device traceability / verification", async () => {
    await bed.run(async () => {
      // HCM licence unverified -> HCM denies first, but even with all flags false
      // it must not allow.
      const r = await gates.ophthalmologyDispense({
        action: "optical.dispense", resourceType: "optical.prescription", facilityId: null,
      });
      expect(r.allowed).toBe(false);
    });
  });
});
