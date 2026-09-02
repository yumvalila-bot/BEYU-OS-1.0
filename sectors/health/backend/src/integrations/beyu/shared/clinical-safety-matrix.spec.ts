/**
 * Clinical safety matrix — enumerates each clinical safety gate, its inputs,
 * its failure mode (fail-closed), and the adversarial test that proves it.
 * Writes coverage/clinical-safety-matrix.json.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";

interface GateRecord {
  id: string;
  domain: "pharmacy" | "lab" | "radiology" | "optical" | "dialysis";
  gate: string;
  failureMode: string;
  status:
    "IMPLEMENTED" | "PARTIALLY_IMPLEMENTED" | "MISSING" | "EXTERNAL_BLOCKED";
  testFile: string;
  notes?: string;
}

const GATES: GateRecord[] = [
  {
    id: "PHARM-01",
    domain: "pharmacy",
    gate: "Controlled-substance dual-control (two-author dispense)",
    failureMode: "DENY when second author missing or same as prescriber",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "PHARM-02",
    domain: "pharmacy",
    gate: "Prescription validity (exists, not expired, matches patient)",
    failureMode: "DENY when prescription missing/expired/patient mismatch",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "PHARM-03",
    domain: "pharmacy",
    gate: "Prescriber HCM licence + scope of practice",
    failureMode: "DENY when licence invalid/expired/wrong scope",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "PHARM-04",
    domain: "pharmacy",
    gate: "Allergy interaction check",
    failureMode:
      "WARN/BLOCK depending on severity; fail-closed when mandatory checks unavailable",
    status: "PARTIALLY_IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
    notes: "Stub checks; clinical knowledge base EXTERNAL-BLOCKED",
  },
  {
    id: "PHARM-05",
    domain: "pharmacy",
    gate: "Stock validation (lot/expiry/qty)",
    failureMode: "DENY when stock insufficient or lot expired",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },

  {
    id: "LAB-01",
    domain: "lab",
    gate: "Specimen validity (integrity, patient match, not rejected)",
    failureMode: "DENY release when specimen invalid",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "LAB-02",
    domain: "lab",
    gate: "Analyzer authorization + QC pass",
    failureMode: "DENY when analyzer unauthorized or QC not passed",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "LAB-03",
    domain: "lab",
    gate: "Verifier identity + licence",
    failureMode: "DENY when verifier licence invalid",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "LAB-04",
    domain: "lab",
    gate: "Critical-result callback/escalation",
    failureMode: "BLOCK release until callback logged",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },

  {
    id: "RAD-01",
    domain: "radiology",
    gate: "Equipment authorization + radiation safety",
    failureMode: "DENY when equipment unauthorized or safety check missing",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "RAD-02",
    domain: "radiology",
    gate: "DICOM identity linkage (Study/Series/SOP UIDs, patient)",
    failureMode: "DENY when DICOM validation fails",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
    notes: "DICOM metadata validator also exists in interop/dicom",
  },
  {
    id: "RAD-03",
    domain: "radiology",
    gate: "Radiation dose capture (DLP, CTDIvol)",
    failureMode: "WARN/BLOCK for required modalities",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "RAD-04",
    domain: "radiology",
    gate: "Report verification by radiologist (HCM licence)",
    failureMode: "DENY when verifier licence invalid",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "RAD-05",
    domain: "radiology",
    gate: "Critical-finding escalation",
    failureMode: "BLOCK until escalation logged",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },

  {
    id: "OPT-01",
    domain: "optical",
    gate: "Prescription validity (not expired, matches patient)",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "OPT-02",
    domain: "optical",
    gate: "Practitioner scope (optometrist/ophthalmologist)",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "OPT-03",
    domain: "optical",
    gate: "Device traceability (lot/serial/UDI)",
    failureMode: "DENY when device data missing",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "OPT-04",
    domain: "optical",
    gate: "Dispensing verification",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },

  {
    id: "DIA-01",
    domain: "dialysis",
    gate: "Machine authorization + maintenance due",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "DIA-02",
    domain: "dialysis",
    gate: "Water-quality test validity",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "DIA-03",
    domain: "dialysis",
    gate: "Patient identity match + consent present",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "DIA-04",
    domain: "dialysis",
    gate: "Treatment parameters (vascular access, Rx weight, Rx time)",
    failureMode: "DENY",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
  {
    id: "DIA-05",
    domain: "dialysis",
    gate: "Adverse-event resolution before close",
    failureMode: "BLOCK close",
    status: "IMPLEMENTED",
    testFile: "clinical-safety.spec.ts",
  },
];

describe("Clinical safety matrix — machine-readable", () => {
  beforeAll(() => {
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "clinical-safety-matrix.json"),
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          disclaimer:
            "Clinical safety gates are fail-closed validators. They do NOT replace clinical judgement, regulatory approval, or facility-specific SOPs.",
          gates: GATES,
          summary: GATES.reduce((acc: any, g) => {
            acc[g.status] = (acc[g.status] ?? 0) + 1;
            return acc;
          }, {}),
        },
        null,
        2,
      ),
    );
  });
  it("registers at least 20 gates across 5 domains", () => {
    expect(GATES.length).toBeGreaterThanOrEqual(20);
    const domains = new Set(GATES.map((g) => g.domain));
    expect(domains.size).toBe(5);
  });
});
