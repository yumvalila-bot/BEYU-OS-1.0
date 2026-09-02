import "reflect-metadata";
import { validateDicomMetadata, validateDicomUid } from "./dicom.validator";

describe("DICOM validator", () => {
  it("accepts a valid UID", () => {
    expect(
      validateDicomUid("1.2.840.113619.2.55.3.604688119.913.1360090299"),
    ).toBeNull();
  });
  it("rejects UIDs with leading zero components or invalid chars", () => {
    expect(validateDicomUid("1.02.3")).toMatch(/leading_zero/);
    expect(validateDicomUid("a.b")).toMatch(/invalid_chars/);
  });
  it("validates minimal metadata and warns on optional fields", () => {
    const r = validateDicomMetadata({
      studyInstanceUid: "1.2.3",
      patientId: "P1",
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("fails closed on missing patient or invalid StudyInstanceUID", () => {
    const r = validateDicomMetadata({
      studyInstanceUid: "baduid",
      patientId: "",
    } as any);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
