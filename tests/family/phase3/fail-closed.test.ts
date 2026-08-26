/**
 * Phase 3A fail-closed policy gate — behavior tests.
 * Proves: unratified ⇒ POLICY DECISION REQUIRED + full FC-1 set; deterministic;
 * no silent defaults; the ratification state is explicit and empty by default.
 * Pure; no database.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_FIR_REFS,
  FC1_CONSEQUENCES,
  RATIFIED_BOUNDARY_FIR_REFS,
  RATIFIED_FIR_REFS,
  assertPolicyGate,
  evaluatePolicyGate,
  isFc1Consequence,
  isFirRef,
  knownFirRef,
  type FirRef,
} from "../../../src/lib/family/phase3/fail-closed";
import { PolicyDecisionRequiredError } from "../../../src/lib/family/phase3/errors";

describe("the ratification state", () => {
  it("knows all 27 FIRs and no more", () => {
    expect(ALL_FIR_REFS).toHaveLength(27);
    expect(ALL_FIR_REFS[0]).toBe("FIR-001");
    expect(ALL_FIR_REFS[26]).toBe("FIR-027");
    for (const fir of ALL_FIR_REFS) expect(isFirRef(fir)).toBe(true);
  });

  it("has NO ratified business authority (empty by default)", () => {
    expect(RATIFIED_FIR_REFS).toHaveLength(0);
  });

  it("carries the three ratified boundaries as constraints, not gates", () => {
    expect(RATIFIED_BOUNDARY_FIR_REFS).toEqual(["FIR-017", "FIR-018", "FIR-019"]);
    for (const fir of RATIFIED_BOUNDARY_FIR_REFS) {
      expect(ALL_FIR_REFS).toContain(fir);
    }
  });
});

describe("evaluatePolicyGate", () => {
  it("fails closed for every unratified single FIR with the full FC-1 set", () => {
    for (const fir of ALL_FIR_REFS) {
      const result = evaluatePolicyGate({ operation: "test-op", actorType: "HUMAN", requiredFirRefs: [fir] });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("POLICY_DECISION_REQUIRED");
      expect(result.missingFirRefs).toEqual([fir]);
      expect(result.consequences).toEqual(FC1_CONSEQUENCES);
    }
  });

  it("fails closed for every one of the 24 business-blocking combinations used by the architecture", () => {
    const combos: readonly FirRef[][] = [
      ["FIR-001"],
      ["FIR-002"],
      ["FIR-003", "FIR-009"],
      ["FIR-004", "FIR-016"],
      ["FIR-005"],
      ["FIR-006", "FIR-007", "FIR-022"],
      ["FIR-008", "FIR-021"],
      ["FIR-009", "FIR-010"],
      ["FIR-011"],
      ["FIR-012", "FIR-025", "FIR-016"],
      ["FIR-013", "FIR-026", "FIR-016"],
      ["FIR-014"],
      ["FIR-015", "FIR-024"],
      ["FIR-020"],
      ["FIR-023"],
      ["FIR-027"],
    ];
    for (const combo of combos) {
      const result = evaluatePolicyGate({ operation: "combo-op", actorType: "HUMAN", requiredFirRefs: combo });
      expect(result.allowed, combo.join("+")).toBe(false);
      expect([...result.missingFirRefs].sort(), combo.join("+")).toEqual([...combo].sort());
    }
  });

  it("allows only when every required FIR is in the (explicit) ratified set", () => {
    // TEST-RATIFICATION: test-scope only, never persisted.
    const testRatified: readonly FirRef[] = ["FIR-012", "FIR-016", "FIR-025"];
    const result = evaluatePolicyGate({
      operation: "capital-submit",
      actorType: "HUMAN",
      requiredFirRefs: ["FIR-012", "FIR-016", "FIR-025"],
      ratifiedFirRefs: testRatified,
    });
    expect(result.allowed).toBe(true);
    expect(result.code).toBeNull();
    expect(result.missingFirRefs).toEqual([]);
    expect(result.consequences).toEqual([]);
  });

  it("is deterministic (same input, same output, every time)", () => {
    const input = { operation: "op", actorType: "HUMAN" as const, requiredFirRefs: ["FIR-004", "FIR-005"] as readonly FirRef[] };
    const a = evaluatePolicyGate(input);
    const b = evaluatePolicyGate(input);
    expect(a).toEqual(b);
  });

  it("never invents a default for a missing value (missing set is verbatim)", () => {
    const input = { operation: "op", actorType: "HUMAN" as const, requiredFirRefs: ["FIR-010", "FIR-009", "FIR-010"] as readonly FirRef[] };
    const result = evaluatePolicyGate(input);
    expect(result.missingFirRefs).toEqual(["FIR-010", "FIR-009"]);
  });

  it("a behavior requiring no FIR is structurally permitted (vacuous truth, not a default)", () => {
    const result = evaluatePolicyGate({ operation: "noop", actorType: "HUMAN", requiredFirRefs: [] });
    expect(result.allowed).toBe(true);
    expect(result.code).toBeNull();
  });
});

describe("assertPolicyGate", () => {
  it("throws PolicyDecisionRequiredError naming the missing FIRs", () => {
    expect(() =>
      assertPolicyGate({ operation: "beneficiary-write", actorType: "HUMAN", requiredFirRefs: ["FIR-009", "FIR-010"] }),
    ).toThrow(PolicyDecisionRequiredError);
    try {
      assertPolicyGate({ operation: "beneficiary-write", actorType: "HUMAN", requiredFirRefs: ["FIR-009", "FIR-010"] });
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyDecisionRequiredError);
      const err = e as PolicyDecisionRequiredError;
      expect(err.firRefs).toEqual(["FIR-009", "FIR-010"]);
      expect(err.message).toContain("beneficiary-write");
    }
  });

  it("passes when the ratified set covers the requirement (TEST-RATIFICATION)", () => {
    const testRatified: readonly FirRef[] = ["FIR-014"];
    expect(() =>
      assertPolicyGate({ operation: "jurisdiction-sensitive-op", actorType: "HUMAN", requiredFirRefs: ["FIR-014"], ratifiedFirRefs: testRatified }),
    ).not.toThrow();
  });
});

describe("vocabulary guards", () => {
  it("identifies FC-1 consequences", () => {
    for (const c of FC1_CONSEQUENCES) expect(isFc1Consequence(c)).toBe(true);
    expect(isFc1Consequence("NO_SUCH_CONSEQUENCE")).toBe(false);
  });

  it("identifies FIR refs and known FIRs", () => {
    expect(isFirRef("FIR-042")).toBe(true);
    expect(isFirRef("FIR-04")).toBe(false);
    expect(knownFirRef("FIR-027")).toBe(true);
    expect(knownFirRef("FIR-042")).toBe(false);
  });
});
