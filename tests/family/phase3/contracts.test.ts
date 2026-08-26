/**
 * Phase 3A typed contracts — validation and boundary tests.
 * Proves the contracts are policy-neutral (no defaults) and that the
 * ratified boundaries (FIR-017, FIR-018) are enforced structurally.
 * Pure; no database.
 */
import { describe, expect, it } from "vitest";
import {
  ADVISORY_EPISTEMIC_LABELS,
  CAPITAL_INSTRUCTION_FAMILY_STATUSES,
  assertFinanceReferenceImmutable,
  assertNoAuthorityClaim,
  assertNoFinancialState,
  findForbiddenKeys,
  validateAdvisoryOutput,
  validateCapitalInstruction,
  validateLoanInstruction,
  validateSubmission,
  type FamilyCapitalInstruction,
  type FamilyLoanInstruction,
} from "../../../src/lib/family/phase3/contracts";
import { FamilyError } from "../../../src/lib/family/phase3/errors";
import { FamilyInstitutionError } from "../../../src/lib/family/model";

const validCapital = (): FamilyCapitalInstruction => ({
  id: "FCI_T_0001",
  tenantId: "TEN_TEST",
  institutionScopeRef: null,
  purpose: "Equity participation in an industrial venture (assessment aid only).",
  requesterPartyId: "PTY_BEN_1",
  targetLegalEntityId: "LEN_HOLDINGS",
  policyRefs: [{ policyId: "FIP_T_001", policyVersion: "1.0.0" }],
  resolutionRefs: [{ kind: "RESOLUTION", referenceId: "FC-RES-T_041" }],
  evidenceRefs: [{ documentId: "DOC_T_001", documentChecksum: "sha256:abc123" }],
  actor: { actorType: "HUMAN", actorUserId: "USR_T_001" },
  jurisdictionRef: null,
  assessment: { engineVersion: "family-capital-1.0.0", inputChecksum: "sha256:def456", result: "COMPLETE" },
  submittedPayload: { amount: "250000000", currency: "TZS" },
  financeRequestId: null,
  familyStatus: "DRAFT",
  createdAt: "2026-08-26T00:00:00.000Z",
});

const validLoan = (): FamilyLoanInstruction => ({
  id: "FLI_T_0001",
  tenantId: "TEN_TEST",
  institutionScopeRef: null,
  purpose: "Working-capital loan request (terms governed by cited documents).",
  borrowerPartyId: "PTY_BEN_2",
  lenderLegalEntityId: "LEN_HOLDINGS",
  termsSourceDocIds: ["DOC_TERMS_T_001"],
  approvalRefs: [{ kind: "RESOLUTION", referenceId: "FC-RES-T_042" }],
  policyRefs: [{ policyId: "FLP_T_001", policyVersion: "1.0.0" }],
  evidenceRefs: [],
  actor: { actorType: "HUMAN", actorUserId: "USR_T_002" },
  jurisdictionRef: null,
  financeRef: null,
  legalRef: null,
  familyStatus: "DRAFT",
  createdAt: "2026-08-26T00:00:00.000Z",
});

describe("capital instruction contract", () => {
  it("accepts a complete non-financial instruction", () => {
    const result = validateCapitalInstruction(validCapital());
    expect(result.ok).toBe(true);
  });

  it("rejects financial-state keys (FIR-018 boundary)", () => {
    for (const key of ["balance", "balances", "accountNumber", "posting", "journalRef", "treasuryRef", "waterfallRef", "receivable", "disbursement", "ledgerRef", "settlementRef"]) {
      const result = validateCapitalInstruction({ ...validCapital(), [key]: "should-not-exist" });
      expect(result.ok, key).toBe(false);
      if (!result.ok) {
        expect(result.violations.some((v) => v.code === "FINANCE_BOUNDARY_VIOLATION")).toBe(true);
      }
    }
  });

  it("rejects a non-human actor (I-11)", () => {
    const result = validateCapitalInstruction({ ...validCapital(), actor: { actorType: "AI", actorUserId: "NOELIA" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.some((v) => v.code === "HUMAN_ACTOR_REQUIRED")).toBe(true);
  });

  it("requires policy and resolution references (no un-proven authority)", () => {
    for (const over of [{ policyRefs: [] }, { resolutionRefs: [] }] as const) {
      const result = validateCapitalInstruction({ ...validCapital(), ...over });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.violations.some((v) => v.code === "AUTHORITY_UNPROVEN")).toBe(true);
    }
  });

  it("rejects unknown lifecycle statuses (no invented states)", () => {
    const result = validateCapitalInstruction({ ...validCapital(), familyStatus: "EFFECTIVE_BY_DEFAULT" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.some((v) => v.field === "familyStatus")).toBe(true);
    expect(CAPITAL_INSTRUCTION_FAMILY_STATUSES).not.toContain("EFFECTIVE_BY_DEFAULT");
  });

  it("assertNoFinancialState throws a boundary error naming FIR-018", () => {
    expect(() => assertNoFinancialState({ balance: 1 }, "FamilyCapitalInstruction")).toThrow(FamilyError);
    try {
      assertNoFinancialState({ balances: {} }, "X");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyError);
      expect((e as FamilyError).code).toBe("FINANCE_BOUNDARY_VIOLATION");
      expect((e as FamilyError).firRefs).toContain("FIR-018");
    }
    expect(() => assertNoFinancialState({ purpose: "fine" }, "X")).not.toThrow();
  });

  it("enforces the write-once Finance reference (F-4)", () => {
    expect(() => assertFinanceReferenceImmutable(null, "CAP_500")).not.toThrow();
    expect(() => assertFinanceReferenceImmutable("CAP_500", "CAP_500")).not.toThrow();
    expect(() => assertFinanceReferenceImmutable("CAP_500", "CAP_999")).toThrow(FamilyError);
    expect(() => assertFinanceReferenceImmutable("CAP_500", null)).toThrow(FamilyError);
  });
});

describe("loan instruction contract", () => {
  it("accepts a complete non-financial loan instruction", () => {
    expect(validateLoanInstruction(validLoan()).ok).toBe(true);
  });

  it("rejects invented loan terms (FIR-013)", () => {
    for (const key of ["interestRate", "taxTreatment", "accountingTreatment", "collateral", "creditLimit", "repaymentScheduleOfRecord"]) {
      const result = validateLoanInstruction({ ...validLoan(), [key]: "invented" });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.violations.some((v) => v.code === "FINANCE_BOUNDARY_VIOLATION")).toBe(true);
    }
  });

  it("requires cited terms-source documents (no invented terms)", () => {
    const result = validateLoanInstruction({ ...validLoan(), termsSourceDocIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.some((v) => v.field === "termsSourceDocIds")).toBe(true);
  });
});

describe("Finance hand-off submission contract", () => {
  it("accepts a human-submitted idempotent submission", () => {
    const result = validateSubmission({
      instructionId: "FCI_T_0001",
      idempotencyKey: "idk-0001",
      destination: "FINANCE",
      submittedBy: { actorType: "HUMAN", actorUserId: "USR_T_001" },
      submittedAt: "2026-08-26T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects AI submission and unknown destinations", () => {
    const base = {
      instructionId: "FCI_T_0001",
      idempotencyKey: "idk-0001",
      destination: "FINANCE",
      submittedAt: "2026-08-26T00:00:00.000Z",
    };
    expect(validateSubmission({ ...base, submittedBy: { actorType: "AI", actorUserId: "NOELIA" } }).ok).toBe(false);
    expect(validateSubmission({ ...base, submittedBy: { actorType: "HUMAN", actorUserId: "U" }, destination: "TREASURY" }).ok).toBe(false);
  });
});

describe("advisory (Noelia/HIVE) contract — FIR-017", () => {
  it("accepts a labeled advisory output requiring human approval", () => {
    const result = validateAdvisoryOutput({
      epistemicLabel: "RECOMMENDATION",
      content: "Option B appears consistent with the stated policy record.",
      requiresHumanApproval: true,
      aiDecisionRef: "AID_T_001",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses requiresHumanApproval: false by construction", () => {
    const result = validateAdvisoryOutput({
      epistemicLabel: "RECOMMENDATION",
      content: "x",
      requiresHumanApproval: false,
      aiDecisionRef: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.some((v) => v.field === "requiresHumanApproval")).toBe(true);
  });

  it("refuses authority claims in AI output", () => {
    expect(() => assertNoAuthorityClaim({ authorityClaim: "I am the final authority" })).toThrow(FamilyError);
    expect(() => assertNoAuthorityClaim({ isAuthoritative: true, content: 1 })).toThrow(FamilyError);
    expect(() => assertNoAuthorityClaim({ content: "plain advisory" })).not.toThrow();
    // Authority claims are hard refusals: the validator throws, it does not downgrade.
    expect(() =>
      validateAdvisoryOutput({
        epistemicLabel: "EXPLANATION",
        content: "x",
        requiresHumanApproval: true,
        aiDecisionRef: null,
        trusteeAuthority: true,
      }),
    ).toThrow(FamilyError);
  });

  it("refuses unknown epistemic labels", () => {
    const result = validateAdvisoryOutput({
      epistemicLabel: "FINAL_DECISION",
      content: "x",
      requiresHumanApproval: true,
      aiDecisionRef: null,
    });
    expect(result.ok).toBe(false);
    expect(ADVISORY_EPISTEMIC_LABELS).not.toContain("FINAL_DECISION");
  });
});

describe("policy-neutrality of the contracts", () => {
  it("findForbiddenKeys is case-insensitive and covers the canonical list", () => {
    expect(findForbiddenKeys({ Balance: 1 })).toEqual(["Balance"]);
    expect(findForbiddenKeys({ Purpose: "x" })).toEqual([]);
    // interestRate is a loan-terms key: supplied via the extra list, as loan
    // validation does (LOAN_TERMS_FORBIDDEN_KEYS).
    expect(findForbiddenKeys({ interestRate: 5 }, ["interestRate", "collateral"])).toEqual(["interestRate"]);
    expect(findForbiddenKeys({ disbursement: 1, collateral: "x" }, ["collateral"])).toEqual(["disbursement", "collateral"]);
  });

  it("does not reference the Phase 1-2 engine error class (separation of layers)", () => {
    expect(FamilyInstitutionError).toBeInstanceOf(Function);
    expect(() => {
      const e = new FamilyError("POLICY_DECISION_REQUIRED", "x", ["FIR-001"]);
      expect(e).not.toBeInstanceOf(FamilyInstitutionError);
    }).not.toThrow();
  });
});
