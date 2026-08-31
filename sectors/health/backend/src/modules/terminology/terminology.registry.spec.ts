import "reflect-metadata";
import { TerminologyRegistry } from "./terminology.registry";

describe("TerminologyRegistry — fail-closed", () => {
  let reg: TerminologyRegistry;
  beforeEach(() => {
    reg = new TerminologyRegistry();
  });

  it("unknown code system returns CODE_SYSTEM_NOT_LOADED (fail-closed, no fabricated validation)", () => {
    const r = reg.validate("SNOMED-CT", "12345");
    expect(r.ok).toBe(false);
    expect((r as any).reason).toBe("CODE_SYSTEM_NOT_LOADED");
  });

  it("loaded code system validates known codes and rejects unknown", () => {
    reg.loadCodes("LOCAL", "v1", [{ code: "A1", display: "Test" }]);
    expect(reg.validate("LOCAL", "A1").ok).toBe(true);
    expect(reg.validate("LOCAL", "ZZZ").ok).toBe(false);
  });

  it("code mapping: missing map returns BLOCKED (no invented mappings)", () => {
    const out = reg.mapCode("ICD-10", "SNOMED-CT", "A00");
    expect(out.mappingStatus).toBe("BLOCKED");
    expect(out.mapped).toEqual([]);
  });
});
