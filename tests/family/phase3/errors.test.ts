/**
 * Phase 3A error taxonomy — integrity tests.
 * Pure; no database.
 */
import { describe, expect, it } from "vitest";
import {
  FAMILY_ERROR_CODES,
  FAMILY_ERROR_TAXONOMY,
  FamilyError,
  PolicyDecisionRequiredError,
  familyError,
  isFamilyError,
  isFamilyErrorCode,
} from "../../../src/lib/family/phase3/errors";

describe("the family error taxonomy", () => {
  it("has exactly the 20 spec §37.1 codes, each with complete metadata", () => {
    expect(FAMILY_ERROR_CODES).toHaveLength(20);
    expect(new Set(FAMILY_ERROR_CODES).size).toBe(20);
    for (const code of FAMILY_ERROR_CODES) {
      const meta = FAMILY_ERROR_TAXONOMY[code];
      // IDEMPOTENCY_REPLAY is the one non-error outcome (200: original ref returned).
      const floor = code === "IDEMPOTENCY_REPLAY" ? 200 : 400;
      expect(meta.httpStatus).toBeGreaterThanOrEqual(floor);
      expect(meta.retryable).toBeTypeOf("boolean");
      expect(["NEVER", "AFTER_STEP_UP", "AFTER_RATIFICATION", "AFTER_INPUT_FIX", "PER_REJECTING_OWNER"]).toContain(meta.retryAfter);
      expect(meta.audited).toBeTypeOf("boolean");
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("maps POLICY_DECISION_REQUIRED to 422, audited, retryable after ratification", () => {
    const meta = FAMILY_ERROR_TAXONOMY.POLICY_DECISION_REQUIRED;
    expect(meta.httpStatus).toBe(422);
    expect(meta.audited).toBe(true);
    expect(meta.retryable).toBe(true);
    expect(meta.retryAfter).toBe("AFTER_RATIFICATION");
  });

  it("marks denial-class boundary errors audited and non-retryable", () => {
    for (const code of [
      "TENANT_ISOLATION_DENIED",
      "HUMAN_ACTOR_REQUIRED",
      "AI_AUTHORITY_DENIED",
      "POLICY_INVENTION_REFUSED",
      "FINANCE_BOUNDARY_VIOLATION",
      "SUPERIOR_INSTRUMENT_CONFLICT",
      "TRUSTEE_RESERVED_MATTER_DENIED",
      "DUPLICATE_IDENTITY_DENIED",
    ] as const) {
      expect(FAMILY_ERROR_TAXONOMY[code].audited).toBe(true);
      expect(FAMILY_ERROR_TAXONOMY[code].retryable).toBe(false);
    }
  });

  it("PolicyDecisionRequiredError carries the FIR refs and FC-1 semantics", () => {
    const err = new PolicyDecisionRequiredError(["FIR-012", "FIR-025"]);
    expect(err).toBeInstanceOf(FamilyError);
    expect(err.code).toBe("POLICY_DECISION_REQUIRED");
    expect(err.firRefs).toEqual(["FIR-012", "FIR-025"]);
    expect(err.httpStatus).toBe(422);
    expect(err.message).toContain("POLICY DECISION REQUIRED");
    const fc1Phrases = ["no write", "no approval", "no execution", "no financial consequence", "no legal-status change"];
    for (const phrase of fc1Phrases) {
      expect(err.message.toLowerCase()).toContain(phrase);
    }
    expect(isFamilyError(err)).toBe(true);
  });

  it("isFamilyErrorCode guards the union", () => {
    expect(isFamilyErrorCode("POLICY_DECISION_REQUIRED")).toBe(true);
    expect(isFamilyErrorCode("NOT_A_CODE")).toBe(false);
  });

  it("familyError factory preserves metadata", () => {
    const err = familyError("FINANCE_BOUNDARY_VIOLATION", "shadow ledger attempt", ["FIR-018"]);
    expect(err.code).toBe("FINANCE_BOUNDARY_VIOLATION");
    expect(err.httpStatus).toBe(409);
    expect(err.firRefs).toEqual(["FIR-018"]);
  });
});
