import { describe, expect, it } from "vitest";
import { complianceSummary, NOELIA_CONTROLS, NOELIA_STANDARDS_MATRIX } from "@/lib/noelia/compliance";

describe("Phase 3 compliance evidence architecture", () => {
  it("stable control ids are unique and every control has a source/test/evidence path", () => {
    const ids = NOELIA_CONTROLS.map((c) => c.controlId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const control of NOELIA_CONTROLS) {
      expect(control.controlId).toMatch(/^NOELIA-AI-CTRL-\d{3}$/);
      expect(control.sourceCode.length).toBeGreaterThan(0);
      expect(control.test.length).toBeGreaterThan(0);
      expect(control.evidence.length).toBeGreaterThan(0);
    }
  });

  it("never claims certification", () => {
    const summary = complianceSummary();
    expect(summary.status.actual_certification_status).toBe("NOT_CERTIFIED");
    expect(summary.status.external_assessment_status).toBe("NOT_STARTED");
    expect(NOELIA_STANDARDS_MATRIX.some((r) => r.framework === "ISO_42001")).toBe(true);
  });

  it("reports real generative inference honestly as blocked/environment limited", () => {
    const generativeControl = NOELIA_CONTROLS.find((c) => c.controlId === "NOELIA-AI-CTRL-003");
    expect(generativeControl?.status).toBe("BLOCKED");
    expect(generativeControl?.implementation).toContain("GENERATIVE_INFERENCE_BLOCKED");
  });
});
