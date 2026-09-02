import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { FhirRepository } from "./fhir.repository";
import { FhirService } from "./fhir.service";

describe("FhirService", () => {
  let bed: TestBed;
  let svc: FhirService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new FhirRepository(bed.conn, bed.tenantCtx);
    svc = new FhirService(repo);
  });

  it("maps a Patient to a FHIR R4 Patient resource with deterministic id and tenant-scoped identifier", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const r = (await svc.patient(p.patient_id)) as any;
      expect(r.resourceType).toBe("Patient");
      expect(r.id).toBe(p.patient_id);
      const tenantIdent = r.identifier?.find((x: any) =>
        x.system?.includes("beyu.health/fhir/Id"),
      );
      expect(tenantIdent).toBeTruthy();
      expect(tenantIdent.value).toBeTruthy();
    }));

  it("$everything bundle contains a valid Bundle with type=searchset and entries", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const b = (await svc.bundle(p.patient_id)) as any;
      expect(b.resourceType).toBe("Bundle");
      expect(b.type).toBe("searchset");
      expect(Array.isArray(b.entry)).toBe(true);
      // At least the Patient entry should be present.
      expect(
        b.entry.some(
          (e: any) =>
            e.resource?.resourceType === "Patient" &&
            e.resource.id === p.patient_id,
        ),
      ).toBe(true);
    }));

  it("read-only: service exposes no write operations", () => {
    const proto = Object.getOwnPropertyNames(FhirService.prototype).filter(
      (n) => n !== "constructor",
    );
    expect(proto.some((n) => /create|update|delete|put|post/i.test(n))).toBe(
      false,
    );
  });
});
