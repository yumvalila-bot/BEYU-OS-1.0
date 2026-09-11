/**
 * Family Office protection & insurance — pure engine tests.
 *
 * These cover the guarantees the domain is built on, with values derived by
 * hand in the test bodies (never by calling the same function under test):
 *
 *   - §4  death benefit is contingent: totals never blend protection and cash;
 *   - §6  insurance designations are their own legal register, with exact
 *         integer-percentage allocation arithmetic;
 *   - §9  the five ownership roles are recorded separately and required
 *         (as a pair) outside DRAFT;
 *   - §11 gap math is deterministic, explainable, and refuses to zero-fill:
 *         missing inputs move the answer between EXACT / UPPER_BOUND /
 *         LOWER_BOUND / NOT_QUANTIFIED;
 *   - §13 proceeds are cash only at RECEIVED/ALLOCATED;
 *   - §14 review flags fire on real recorded states and a flag with no data
 *         says NOT_QUANTIFIED rather than verdict;
 *   - §15 lifecycle machines refuse illegal transitions and AI actors;
 *   - §16 claims cannot fabricate insurer amounts;
 *   - §22 no arithmetic in here is accounting: minor units are integers only.
 */
import { describe, expect, it } from "vitest";
import {
  validatePolicy,
  canTransitionPolicyStatus,
  canAdvanceGovernanceStage,
  isCorporateViewedPolicy,
  type PolicyRecord,
} from "../../../../src/lib/family/office/protection-insurance/policy";
import {
  summariseAllocations,
  validateDesignation,
  designationStands,
  type BeneficiaryDesignation,
} from "../../../../src/lib/family/office/protection-insurance/beneficiaries";
import {
  annualPremiumObligationMinor,
  effectivePremiumStatus,
  sumPremiumsByCurrency,
  validatePremiumRecord,
  type PremiumRecord,
} from "../../../../src/lib/family/office/protection-insurance/premiums";
import {
  canTransitionClaim,
  proceedsAreContingent,
  proceedsCountAsCash,
  validateClaimRecord,
  validateProceedsAdvance,
  type ClaimRecord,
} from "../../../../src/lib/family/office/protection-insurance/claims";
import {
  computeProtectionGap,
  ProtectionGapInputError,
  sumInForceDeathBenefits,
  type GapComponent,
} from "../../../../src/lib/family/office/protection-insurance/protection-gap";
import { modelSuccessionLiquidity, SuccessionLiquidityInputError, type LiquidityInputRow } from "../../../../src/lib/family/office/protection-insurance/liquidity";
import { computeReviewFlags, type ReviewFlagInput } from "../../../../src/lib/family/office/protection-insurance/reviews";
import { PROTECTION_MODELED_DISCLAIMER } from "../../../../src/lib/family/office/protection-insurance/types";

const AS_OF = "2026-09-11";

function policy(over: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    id: "P-1",
    tenantId: "T-1",
    policyNumber: "LIFE-0001",
    policyType: "FAMILY_PROTECTION",
    ownerRef: "TRUST-1",
    ownerKind: "TRUST",
    insuredRef: "FM-1",
    insuredKind: "FAMILY_MEMBER",
    premiumPayerRef: "FM-1",
    insurerRef: "INS-1",
    brokerRef: null,
    legalEntityId: null,
    countryCode: "MU",
    currency: "MUR",
    deathBenefitMinor: 10_000_000,
    coverageAmountMinor: 10_000_000,
    cashValueMinor: null,
    surrenderValueMinor: null,
    premiumAmountMinor: 120_000,
    premiumFrequency: "ANNUAL",
    nextPremiumDueDate: "2026-12-01",
    effectiveDate: "2024-01-01",
    maturityDate: null,
    reviewIntervalDays: 365,
    lastReviewDate: null,
    nextReviewDate: "2026-12-01",
    status: "IN_FORCE",
    governanceStage: "ACTIVE",
    assignmentStatus: "NONE",
    collateralBeneficiaryRef: null,
    policyLoanOutstanding: false,
    purpose: "Succession liquidity for the family trust obligations",
    successionPlanRef: null,
    liquidityObjectiveRef: null,
    riskAssessmentRef: null,
    hcmEmployeeRef: null,
    documentRefs: ["DOC-1"],
    legalReviewStatus: "COMPLETED",
    taxReviewStatus: "COMPLETED",
    jurisdictionRef: null,
    amountProvenance: "USER_PROVIDED",
    amountSourceRef: null,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* §7–§9 — the policy record                                            */
/* ------------------------------------------------------------------ */
describe("policy record — ownership model is explicit (§9)", () => {
  it("accepts a complete, coherent policy", () => {
    expect(validatePolicy(policy())).toEqual([]);
  });

  it("refuses a non-draft policy without an owner", () => {
    const findings = validatePolicy(policy({ ownerRef: null, ownerKind: null }));
    expect(findings.some((f) => f.field === "ownerRef" && f.rule === "OWNERSHIP_MODEL")).toBe(true);
  });

  it("refuses half-recorded role pairs (ref without kind)", () => {
    const findings = validatePolicy(policy({ insuredKind: null }));
    expect(findings.some((f) => f.rule === "ROLE_PAIR")).toBe(true);
  });

  it("DRAFT tolerates the roles not yet settled", () => {
    expect(validatePolicy(policy({ status: "DRAFT", ownerRef: null, ownerKind: null, insuredRef: null, insuredKind: null, effectiveDate: null }))).toEqual([]);
  });

  it("cash value and maturity date are optional by law of nature, not by convenience", () => {
    expect(validatePolicy(policy({ cashValueMinor: null, maturityDate: null }))).toEqual([]);
    const withCash = validatePolicy(policy({ cashValueMinor: 1_000_000, surrenderValueMinor: 900_000 }));
    expect(withCash).toEqual([]);
  });

  it("refuses surrender value above recorded cash value as contradictory", () => {
    const findings = validatePolicy(policy({ cashValueMinor: 500_000, surrenderValueMinor: 900_000 }));
    expect(findings.some((f) => f.rule === "CASH_ORDER")).toBe(true);
  });

  it("a VERIFIED amount without a source citation is refused (§11)", () => {
    const findings = validatePolicy(policy({ amountProvenance: "VERIFIED", amountSourceRef: null }));
    expect(findings.some((f) => f.rule === "PROVENANCE" && f.field === "amountSourceRef")).toBe(true);
    expect(validatePolicy(policy({ amountProvenance: "VERIFIED", amountSourceRef: "DOC-2026-INSURER-STATEMENT" }))).toEqual([]);
  });

  it("GROUP_LIFE outside DRAFT must name its HCM identity ref — and only that (§20)", () => {
    expect(validatePolicy(policy({ policyType: "GROUP_LIFE", hcmEmployeeRef: null })).some((f) => f.rule === "HCM_DERIVATION")).toBe(true);
    expect(validatePolicy(policy({ policyType: "GROUP_LIFE", hcmEmployeeRef: "EMP-77" }))).toEqual([]);
  });

  it("corporate-adjacent types must link their owning legal entity (§21)", () => {
    expect(validatePolicy(policy({ policyType: "KEY_PERSON", legalEntityId: null })).some((f) => f.rule === "ENTITY_LINK")).toBe(true);
    expect(validatePolicy(policy({ policyType: "KEY_PERSON", legalEntityId: "LEN-2" }))).toEqual([]);
    expect(isCorporateViewedPolicy({ policyType: "KEY_PERSON", legalEntityId: "LEN-2" })).toBe(true);
    expect(isCorporateViewedPolicy({ policyType: "PERSONAL_LIFE", legalEntityId: null })).toBe(false);
  });

  it("single-premium contracts have no next due date", () => {
    expect(validatePolicy(policy({ premiumFrequency: "SINGLE", nextPremiumDueDate: null }))).toEqual([]);
    expect(validatePolicy(policy({ premiumFrequency: "SINGLE", nextPremiumDueDate: "2027-01-01" })).some((f) => f.rule === "FREQUENCY")).toBe(true);
  });

  it("date arithmetic is coherent", () => {
    expect(validatePolicy(policy({ effectiveDate: "2026-05-01", maturityDate: "2025-01-01" })).some((f) => f.rule === "DATE_ORDER")).toBe(true);
    expect(validatePolicy(policy({ lastReviewDate: "2026-06-01", nextReviewDate: "2026-06-01" })).some((f) => f.rule === "DATE_ORDER")).toBe(true);
  });

  it("an assignment posture without an assignee is incoherent", () => {
    expect(validatePolicy(policy({ assignmentStatus: "COLLATERAL_ASSIGNED", collateralBeneficiaryRef: null })).some((f) => f.rule === "ASSIGNMENT")).toBe(true);
    expect(validatePolicy(policy({ assignmentStatus: "NONE", collateralBeneficiaryRef: "BANK-1" })).some((f) => f.rule === "ASSIGNMENT")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* §14/§15 — lifecycles                                                 */
/* ------------------------------------------------------------------ */
describe("policy lifecycle — recorded, never automatic (§14)", () => {
  it("refuses illegal transitions, including TERMINATED → anything", () => {
    expect(canTransitionPolicyStatus("TERMINATED", "IN_FORCE", "EV-1", AS_OF, { maturityDate: null }).some((f) => f.rule === "LIFECYCLE")).toBe(true);
    expect(canTransitionPolicyStatus("DRAFT", "SURRENDERED", null, AS_OF, { maturityDate: null }).some((f) => f.rule === "LIFECYCLE")).toBe(true);
  });

  it("reinstating a LAPSED policy requires insurer evidence", () => {
    expect(canTransitionPolicyStatus("LAPSED", "IN_FORCE", null, AS_OF, { maturityDate: null }).some((f) => f.rule === "REINSTATEMENT_EVIDENCE")).toBe(true);
    expect(canTransitionPolicyStatus("LAPSED", "IN_FORCE", "INS-REINSTATE-88", AS_OF, { maturityDate: null })).toEqual([]);
  });

  it("MATURED requires a reached recorded maturity date", () => {
    expect(canTransitionPolicyStatus("IN_FORCE", "MATURED", null, AS_OF, { maturityDate: null }).some((f) => f.rule === "MATURITY_DATE")).toBe(true);
    expect(canTransitionPolicyStatus("IN_FORCE", "MATURED", null, AS_OF, { maturityDate: "2026-08-01" })).toEqual([]);
  });
});

describe("governance lifecycle — the §15 chain", () => {
  const human = { actorType: "HUMAN" as const, authorityRef: null, reviewFindingCount: null, isHighValue: null, thresholdSourceRef: null };
  it("an AI actor cannot advance any stage", () => {
    const f = canAdvanceGovernanceStage("DRAFT", "ASSESSED", { ...human, actorType: "AI", reviewFindingCount: 0 });
    expect(f.some((x) => x.rule === "HUMAN_AUTHORITY")).toBe(true);
  });
  it("ACTIVE requires an authority reference", () => {
    expect(canAdvanceGovernanceStage("GOVERNANCE_APPROVAL", "ACTIVE", { ...human }).some((f) => f.rule === "AUTHORITY_REQUIRED")).toBe(true);
    expect(canAdvanceGovernanceStage("GOVERNANCE_APPROVAL", "ACTIVE", { ...human, authorityRef: "RES-2026-14" })).toEqual([]);
  });
  it("ASSESSED requires recorded review substance", () => {
    expect(canAdvanceGovernanceStage("DRAFT", "ASSESSED", { ...human }).some((f) => f.rule === "EVIDENCE")).toBe(true);
    expect(canAdvanceGovernanceStage("DRAFT", "ASSESSED", { ...human, reviewFindingCount: 3 })).toEqual([]);
  });
  it("the low-risk skip exists ONLY with a proven threshold decision (§15: no invented thresholds)", () => {
    expect(canAdvanceGovernanceStage("REVIEW_REQUIRED", "GOVERNANCE_APPROVAL", { ...human, reviewFindingCount: 0 }).length).toBeGreaterThan(0);
    expect(
      canAdvanceGovernanceStage("REVIEW_REQUIRED", "GOVERNANCE_APPROVAL", {
        ...human,
        authorityRef: "RES-2026-15",
        reviewFindingCount: 0,
        isHighValue: false,
        thresholdSourceRef: null, // provenance absent → refused
      }).some((f) => f.rule === "LIFECYCLE"),
    ).toBe(true);
    expect(
      canAdvanceGovernanceStage("REVIEW_REQUIRED", "GOVERNANCE_APPROVAL", {
        ...human,
        authorityRef: "RES-2026-15",
        reviewFindingCount: 0,
        isHighValue: false,
        thresholdSourceRef: "POLICY-CAP-THRESHOLD-7",
      }),
    ).toEqual([]);
  });
  it("TERMINATED is terminal", () => {
    expect(canAdvanceGovernanceStage("TERMINATED", "DRAFT", { ...human, authorityRef: "X" }).some((f) => f.rule === "LIFECYCLE")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* §6 — designations                                                    */
/* ------------------------------------------------------------------ */
function designation(over: Partial<BeneficiaryDesignation> = {}): BeneficiaryDesignation {
  return {
    id: "D-1",
    policyId: "P-1",
    beneficiaryRef: "FM-2",
    beneficiaryKind: "FAMILY_MEMBER",
    designationType: "PRIMARY",
    entitlementBasis: "PERCENTAGE",
    pctMillionths: 100_000_000,
    fixedAmountMinor: null,
    currency: null,
    effectiveDate: "2024-01-01",
    endDate: null,
    status: "ACTIVE",
    relationshipBasis: "policy owner instruction recorded 2024-01",
    notes: null,
    ...over,
  };
}

describe("beneficiary designations — exact allocation arithmetic (§6)", () => {
  it("validates each field's shape and basis coherence", () => {
    expect(validateDesignation(designation())).toEqual([]);
    expect(validateDesignation(designation({ beneficiaryRef: "  " })).some((f) => f.code === "MISSING_BENEFICIARY")).toBe(true);
    expect(validateDesignation(designation({ pctMillionths: 0 })).some((f) => f.code === "BENEFICIARY_ALLOCATION_MISMATCH")).toBe(true);
    expect(validateDesignation(designation({ entitlementBasis: "FIXED_AMOUNT", pctMillionths: null, fixedAmountMinor: 500_000, currency: null })).some((f) => f.code === "BENEFICIARY_ALLOCATION_MISMATCH")).toBe(true);
    expect(validateDesignation(designation({ entitlementBasis: "FIXED_AMOUNT", pctMillionths: 50_000_000, fixedAmountMinor: 500_000, currency: "MUR" })).some((f) => f.severity === "NOTICE")).toBe(true);
  });

  it("standing means ACTIVE within its effective window", () => {
    expect(designationStands(designation(), AS_OF)).toBe(true);
    expect(designationStands(designation({ status: "SUPERSEDED" }), AS_OF)).toBe(false);
    expect(designationStands(designation({ endDate: "2026-01-01" }), AS_OF)).toBe(false);
    expect(designationStands(designation({ effectiveDate: "2027-01-01" }), AS_OF)).toBe(false);
  });

  it("100% across primaries passes; 99.99% without residuary is a WARNING; 101% is an ESCALATE", () => {
    expect(summariseAllocations([designation()], AS_OF).ok).toBe(true);
    const under = summariseAllocations([designation({ pctMillionths: 50_000_000 }), designation({ id: "D-2", beneficiaryRef: "FM-3", pctMillionths: 49_990_000 })], AS_OF);
    expect(under.ok).toBe(false);
    expect(under.primaryPercentageSumMillionths).toBe(99_990_000);
    const over = summariseAllocations([designation({ pctMillionths: 60_000_000 }), designation({ id: "D-2", pctMillionths: 51_000_000 })], AS_OF);
    expect(over.findings.some((f) => f.severity === "ESCALATE")).toBe(true);
  });

  it("a single residuary absorbs the remainder", () => {
    const ok = summariseAllocations([designation({ pctMillionths: 60_000_000 }), designation({ id: "D-R", entitlementBasis: "RESIDUARY", pctMillionths: null })], AS_OF);
    expect(ok.hasResiduary).toBe(true);
    expect(ok.ok).toBe(true);
  });

  it("two residuaries is contradictory", () => {
    const r = summariseAllocations(
      [designation({ id: "D-R1", entitlementBasis: "RESIDUARY", pctMillionths: null }), designation({ id: "D-R2", entitlementBasis: "RESIDUARY", pctMillionths: null })],
      AS_OF,
    );
    expect(r.findings.some((f) => f.severity === "ESCALATE" && f.detail.includes("RESIDUARY"))).toBe(true);
  });

  it("mixing PERCENTAGE and FIXED_AMOUNT primaries yields no consolidated allocation", () => {
    const mixed = summariseAllocations(
      [designation({ pctMillionths: 50_000_000 }), designation({ id: "D-F", entitlementBasis: "FIXED_AMOUNT", pctMillionths: null, fixedAmountMinor: 1_000_000, currency: "MUR" })],
      AS_OF,
    );
    expect(mixed.primaryPercentageSumMillionths).toBeNull();
    expect(mixed.fixedAmountSumMinor).toBeNull();
    expect(mixed.ok).toBe(false);
  });

  it("no standing primary is an ESCALATE — the policy would pay into an estate nobody chose", () => {
    const none = summariseAllocations([designation({ status: "PROPOSED" })], AS_OF);
    expect(none.findings.some((f) => f.code === "MISSING_BENEFICIARY" && f.severity === "ESCALATE")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* §10 — premiums                                                       */
/* ------------------------------------------------------------------ */
function premium(over: Partial<PremiumRecord> = {}): PremiumRecord {
  return {
    id: "PM-1",
    policyId: "P-1",
    dueDate: "2026-12-01",
    amountMinor: 120_000,
    currency: "MUR",
    frequency: "ANNUAL",
    status: "SCHEDULED",
    payerRef: "FM-1",
    paidDate: null,
    paymentEvidenceDocumentRef: null,
    financeRecordRef: null,
    notes: null,
    ...over,
  };
}

describe("premiums — obligation math, no accounting (§10)", () => {
  it("annualizes by exact integer multipliers", () => {
    expect(annualPremiumObligationMinor(10_000, "MONTHLY")).toBe(120_000);
    expect(annualPremiumObligationMinor(25_000, "QUARTERLY")).toBe(100_000);
    expect(annualPremiumObligationMinor(60_000, "SEMI_ANNUAL")).toBe(120_000);
    expect(annualPremiumObligationMinor(120_000, "ANNUAL")).toBe(120_000);
    expect(annualPremiumObligationMinor(1_200_000, "SINGLE")).toBe(0);
  });

  it("OVERDUE is a read-time derivation and never mutates the record", () => {
    const overdue = premium({ dueDate: "2026-01-01" });
    expect(effectivePremiumStatus(overdue, AS_OF)).toBe("OVERDUE");
    expect(overdue.status).toBe("SCHEDULED"); // untouched
    expect(effectivePremiumStatus(premium({ dueDate: "2026-12-01" }), AS_OF)).toBe("SCHEDULED");
    expect(effectivePremiumStatus(premium({ status: "PAID", paidDate: "2026-01-01", paymentEvidenceDocumentRef: "DOC-R", dueDate: "2026-01-15" }), AS_OF)).toBe("PAID");
  });

  it("PAID requires paidDate AND evidence — an unevidenced payment is not a fact", () => {
    expect(validatePremiumRecord(premium({ status: "PAID" })).length).toBeGreaterThan(0);
    expect(validatePremiumRecord(premium({ status: "PAID", paidDate: "2026-01-10", paymentEvidenceDocumentRef: "DOC-R" }))).toEqual([]);
  });

  it("currency sums stay per currency", () => {
    const sums = sumPremiumsByCurrency([premium(), premium({ id: "PM-2", currency: "USD", amountMinor: 90_000 })]);
    expect(sums).toEqual({ MUR: 120_000, USD: 90_000 });
  });
});

/* ------------------------------------------------------------------ */
/* §13/§16 — claims                                                     */
/* ------------------------------------------------------------------ */
function claim(over: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    id: "CL-1",
    policyId: "P-1",
    claimReference: "INS-CLM-9001",
    insuredRef: "FM-1",
    insurerRef: "INS-1",
    incidentDate: "2026-08-01",
    notificationDate: "2026-08-05",
    status: "CLAIM_OPENED",
    proceedsState: "NONE",
    approvedAmountMinor: null,
    receivedAmountMinor: null,
    currency: "MUR",
    proceedsReceivedDate: null,
    allocationRef: null,
    decisionEvidenceRef: null,
    documentRefs: [],
    ...over,
  };
}

describe("claims — no fabricated insurer facts (§16)", () => {
  it("records an APPROVED decision only with the insurer's own amount and evidence", () => {
    const f = canTransitionClaim("INSURER_REVIEW", "APPROVED", { evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, actorType: "HUMAN" });
    expect(f.some((x) => x.rule === "EVIDENCE")).toBe(true);
    expect(f.some((x) => x.rule === "NO_FABRICATION")).toBe(true);
    expect(canTransitionClaim("INSURER_REVIEW", "APPROVED", { evidenceRef: "DOC-INS-DEC", approvedAmountMinor: 10_000_000, receivedAmountMinor: null, receivedDate: null, allocationRef: null, actorType: "HUMAN" })).toEqual([]);
  });

  it("receipt needs amount + date; allocation needs the Finance-side reference", () => {
    expect(canTransitionClaim("PROCEEDS_PENDING", "PROCEEDS_RECEIVED", { evidenceRef: null, approvedAmountMinor: 10_000_000, receivedAmountMinor: null, receivedDate: null, allocationRef: null, actorType: "HUMAN" }).some((f) => f.rule === "RECEIPT_AMOUNT")).toBe(true);
    expect(canTransitionClaim("PROCEEDS_PENDING", "PROCEEDS_RECEIVED", { evidenceRef: "BANK-STATEMENT-7", approvedAmountMinor: 10_000_000, receivedAmountMinor: 10_000_000, receivedDate: "2026-09-01", allocationRef: null, actorType: "HUMAN" })).toEqual([]);
    expect(canTransitionClaim("PROCEEDS_RECEIVED", "ALLOCATED", { evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, actorType: "HUMAN" }).some((f) => f.rule === "ALLOCATION_REF")).toBe(true);
  });

  it("an AI actor never records a claim transition", () => {
    expect(canTransitionClaim("INSURER_REVIEW", "APPROVED", { evidenceRef: "E", approvedAmountMinor: 1, receivedAmountMinor: null, receivedDate: null, allocationRef: null, actorType: "AI" }).some((f) => f.rule === "HUMAN_AUTHORITY")).toBe(true);
  });

  it("the machine refuses history rewrites: CLOSED is terminal, states cannot jump", () => {
    expect(canTransitionClaim("CLOSED", "APPROVED", { evidenceRef: "E", approvedAmountMinor: 1, receivedAmountMinor: null, receivedDate: null, allocationRef: null, actorType: "HUMAN" }).some((f) => f.rule === "LIFECYCLE")).toBe(true);
    expect(canTransitionClaim("CLAIM_OPENED", "PROCEEDS_RECEIVED", { evidenceRef: "E", approvedAmountMinor: 1, receivedAmountMinor: 1, receivedDate: AS_OF, allocationRef: null, actorType: "HUMAN" }).some((f) => f.rule === "LIFECYCLE")).toBe(true);
  });

  it("a record claiming DENIED must cite the decision evidence", () => {
    expect(validateClaimRecord(claim({ status: "DENIED" })).some((f) => f.rule === "EVIDENCE")).toBe(true);
    expect(validateClaimRecord(claim({ status: "DENIED", decisionEvidenceRef: "DOC-DEC-2" }))).toEqual([]);
  });

  it("received > approved is contradictory", () => {
    expect(validateClaimRecord(claim({ approvedAmountMinor: 500, receivedAmountMinor: 600, proceedsState: "RECEIVED", proceedsReceivedDate: "2026-09-01" })).some((f) => f.rule === "AMOUNT_ORDER")).toBe(true);
  });

  it("proceeds advance strictly forward, and only cash states count as cash", () => {
    expect(validateProceedsAdvance("NONE", "RECEIVED").length).toBeGreaterThan(0);
    expect(validateProceedsAdvance("EXPECTED", "CLAIMED")).toEqual([]);
    expect(proceedsCountAsCash("APPROVED")).toBe(false);
    expect(proceedsCountAsCash("RECEIVED")).toBe(true);
    expect(proceedsCountAsCash("ALLOCATED")).toBe(true);
    expect(proceedsAreContingent("EXPECTED")).toBe(true);
    expect(proceedsAreContingent("RECEIVED")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* §11 — the protection gap                                             */
/* ------------------------------------------------------------------ */
function comps(over: Partial<Record<GapComponent["code"], number | null>> = {}): GapComponent[] {
  const defaults: Record<GapComponent["code"], number> = {
    ECONOMIC_FAMILY_EXPOSURE: 10_000_000,
    SUCCESSION_LIQUIDITY_NEED: 4_000_000,
    DEBT_OBLIGATION_EXPOSURE: 3_000_000,
    BUSINESS_DEPENDENCY_EXPOSURE: 2_000_000,
    QUALIFYING_RESOURCES: 1_500_000,
    EXISTING_QUALIFYING_PROTECTION: 5_000_000,
  };
  // `in` rather than `??`: an explicitly NULL component must survive as null —
  // it is the very "missing input" the bound tests are about.
  const mk = (code: GapComponent["code"], label: string): GapComponent => ({
    code,
    valueMinor: code in over ? (over[code] as number | null) : defaults[code],
    provenance: "USER_PROVIDED",
    sourceRef: null,
    label,
  });
  return [
    mk("ECONOMIC_FAMILY_EXPOSURE", "Family economic exposure"),
    mk("SUCCESSION_LIQUIDITY_NEED", "Succession liquidity need"),
    mk("DEBT_OBLIGATION_EXPOSURE", "Debt & obligation exposure"),
    mk("BUSINESS_DEPENDENCY_EXPOSURE", "Business dependency"),
    mk("QUALIFYING_RESOURCES", "Qualifying resources"),
    mk("EXISTING_QUALIFYING_PROTECTION", "Existing qualifying protection"),
  ];
}

describe("protection gap — deterministic, explainable, never zero-filled (§11)", () => {
  it("computes the exact modeled gap and explains every line", () => {
    const r = computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps() });
    // 10,000,000 + 4,000,000 + 3,000,000 + 2,000,000 − 1,500,000 − 5,000,000 = 10,500,000
    expect(r.totalExposureMinor).toBe(19_000_000);
    expect(r.totalQualifyingMinor).toBe(6_500_000);
    expect(r.modeledGapMinor).toBe(12_500_000); // 19,000,000 − 6,500,000
    expect(r.bound).toBe("EXACT");
    expect(r.completeness).toBe("COMPLETE");
    // coverage = qualifying / exposure = 6_500_000 / 19_000_000 → 3421 bps floored.
    expect(r.coverageRatioBps).toBe(3421);
    expect(r.lines.map((l) => l.effect)).toEqual(["+", "+", "+", "+", "−", "−"]);
    expect(r.disclaimer).toBe(PROTECTION_MODELED_DISCLAIMER);
    expect(r.epistemicClass).toBe("MODELLED");
  });

  it("is deterministic: same inputs, byte-identical results", () => {
    const a = JSON.stringify(computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps() }));
    const b = JSON.stringify(computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps() }));
    expect(a).toBe(b);
  });

  it("a missing ADDITIVE input caps the gap from below, never zeroes it", () => {
    const r = computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps({ BUSINESS_DEPENDENCY_EXPOSURE: null }) });
    expect(r.modeledGapMinor).toBe(10_500_000); // known exposure 17,000,000 − qualifying 6,500,000
    expect(r.bound).toBe("LOWER_BOUND");
    expect(r.missingInputs).toEqual(["BUSINESS_DEPENDENCY_EXPOSURE"]);
    expect(r.totalExposureMinor).toBeNull();
  });

  it("a missing SUBTRACTIVE input caps the gap from above", () => {
    const r = computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps({ QUALIFYING_RESOURCES: null }) });
    // full exposure 19,000,000 − only-supplied protection 5,000,000 = 14,000,000 as an UPPER bound;
    // the missing resources line can only pull it further down.
    expect(r.modeledGapMinor).toBe(14_000_000);
    expect(r.bound).toBe("UPPER_BOUND");
  });

  it("zero coverage present ⇒ gap is the whole exposure (complete case)", () => {
    const r = computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps({ EXISTING_QUALIFYING_PROTECTION: 0 }) });
    expect(r.modeledGapMinor).toBe(17_500_000); // 19,000,000 − 1,500,000
    expect(r.bound).toBe("EXACT");
  });

  it("protection exceeding exposure floors the gap at zero with capped coverage", () => {
    const r = computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps({ EXISTING_QUALIFYING_PROTECTION: 30_000_000 }) });
    expect(r.modeledGapMinor).toBe(0);
    expect(r.coverageRatioBps).toBe(10_000);
  });

  it("refuses to run on fewer than six components — an omitted line is a fabricated zero", () => {
    expect(() => computeProtectionGap({ asOf: AS_OF, currency: "MUR", components: comps().slice(1) })).toThrow(ProtectionGapInputError);
  });

  it("refuses float amounts, negatives, and unproven VERIFIED figures", () => {
    expect(() =>
      computeProtectionGap({
        asOf: AS_OF,
        currency: "MUR",
        components: comps().map((c) => (c.code === "QUALIFYING_RESOURCES" ? { ...c, valueMinor: 1000.5 } : c)),
      }),
    ).toThrow(/minor units/);
    expect(() =>
      computeProtectionGap({
        asOf: AS_OF,
        currency: "MUR",
        components: comps().map((c) => (c.code === "ECONOMIC_FAMILY_EXPOSURE" ? { ...c, provenance: "VERIFIED" as const, sourceRef: null } : c)),
      }),
    ).toThrow(/source ref/);
  });

  it("sums in-force protection only within the assessment currency", () => {
    expect(sumInForceDeathBenefits([{ currency: "MUR", deathBenefitMinor: 1 }, { currency: "MUR", deathBenefitMinor: 2 }], "MUR")).toBe(3);
    expect(() => sumInForceDeathBenefits([{ currency: "USD", deathBenefitMinor: 1 }], "MUR")).toThrow(ProtectionGapInputError);
  });
});

/* ------------------------------------------------------------------ */
/* §13 — succession liquidity                                           */
/* ------------------------------------------------------------------ */
function row(over: Partial<LiquidityInputRow>): LiquidityInputRow {
  return {
    kind: "LIQUID_RESOURCE",
    amountMinor: 1_000_000,
    currency: "MUR",
    label: "recorded cash",
    provenance: "VERIFIED",
    sourceRef: "FIN-BAL-2026-08",
    ...over,
  } as LiquidityInputRow;
}

describe("succession liquidity — contingent never becomes cash (§13)", () => {
  it("the total includes received but excludes expected proceeds", () => {
    const r = modelSuccessionLiquidity({
      asOf: AS_OF,
      currency: "MUR",
      rows: [
        row({}), // liquid 1,000,000
        row({ kind: "TRUST_LIQUIDITY", amountMinor: 500_000, label: "trust reserve" }),
        row({ kind: "INSURANCE_PROCEEDS", amountMinor: 10_000_000, label: "claim A", proceedsState: "RECEIVED", sourceRef: "CL-A" }),
        row({ kind: "INSURANCE_PROCEEDS", amountMinor: 7_000_000, label: "claim B", proceedsState: "EXPECTED", sourceRef: "CL-B" }),
        row({ kind: "POLICY_DEATH_BENEFIT", amountMinor: 9_000_000, label: "in-force face amount" }),
        row({ kind: "OBLIGATION", amountMinor: 400_000, label: "debts due" }),
      ],
    });
    expect(r.buckets.receivedInsuranceProceedsMinor).toBe(10_000_000);
    expect(r.buckets.expectedClaimProceedsMinor).toBe(7_000_000);
    expect(r.buckets.contingentInsuranceProceedsMinor).toBe(9_000_000);
    // total = 1,000,000 + 500,000 + 10,000,000 − 400,000 (expected + contingent excluded)
    expect(r.modeledTotalMinor).toBe(11_100_000);
    expect(r.buckets.knownObligationsMinor).toBe(400_000);
    expect(r.shortfallMinor).toBe(0);
    expect(r.notes.some((n) => n.includes("EXPECTED/CLAIMED/APPROVED"))).toBe(true);
  });

  it("shortfall is stated positively when obligations exceed liquidity", () => {
    const r = modelSuccessionLiquidity({
      asOf: AS_OF,
      currency: "MUR",
      rows: [row({ amountMinor: 100 }), row({ kind: "OBLIGATION", amountMinor: 900, label: "due" })],
    });
    expect(r.modeledTotalMinor).toBe(-800);
    expect(r.shortfallMinor).toBe(800);
    expect(r.coverageBps).toBe(1111); // floor(100*10000/900)
  });

  it("surrender value is modeled potential, reported outside the total with the trade-off note", () => {
    const r = modelSuccessionLiquidity({
      asOf: AS_OF,
      currency: "MUR",
      rows: [row({}), row({ kind: "POLICY_SURRENDER_VALUE", amountMinor: 2_000_000, label: "surrender" })],
    });
    expect(r.buckets.policySurrenderValuePotentialMinor).toBe(2_000_000);
    expect(r.modeledTotalMinor).toBe(1_000_000);
    expect(r.excludedRows.some((e) => e.label === "surrender")).toBe(true);
    expect(r.notes.some((n) => n.includes("surrendering coverage"))).toBe(true);
  });

  it("a proceeds row in state NONE is reported, never dropped", () => {
    const r = modelSuccessionLiquidity({ asOf: AS_OF, currency: "MUR", rows: [row({ kind: "INSURANCE_PROCEEDS", label: "orphan", proceedsState: "NONE" })] });
    expect(r.excludedRows.some((e) => e.reason.includes("no proceeds posture"))).toBe(true);
  });

  it("cross-currency rows are refused, not blended (§15 parity)", () => {
    expect(() => modelSuccessionLiquidity({ asOf: AS_OF, currency: "MUR", rows: [row({}), row({ currency: "USD", label: "usd" })] })).toThrow(SuccessionLiquidityInputError);
  });
});

/* ------------------------------------------------------------------ */
/* §14 — the review engine                                              */
/* ------------------------------------------------------------------ */
function flagInput(over: Partial<ReviewFlagInput["policy"]> = {}, designations: BeneficiaryDesignation[] = [], premiums: PremiumRecord[] = []): ReviewFlagInput {
  return {
    asOf: AS_OF,
    policy: {
      policyId: "P-1",
      status: "IN_FORCE",
      governanceStage: "ACTIVE",
      documentRefs: ["DOC-1"],
      lastReviewDate: "2026-01-01",
      nextReviewDate: "2027-01-01",
      reviewIntervalDays: 365,
      maturityDate: null,
      effectiveDate: "2024-01-01",
      assignmentStatus: "NONE",
      policyLoanOutstanding: false,
      premiumPayerRef: "FM-1",
      ownerRef: "TRUST-1",
      insuredRef: "FM-1",
      currency: "MUR",
      deathBenefitMinor: 10_000_000,
      modeledTargetMinor: null,
      successionPlanStillCurrent: null,
      ...over,
    },
    designations,
    premiums,
    changes: { insuredRelationshipChanged: false, successionPlanChanged: false, majorFamilyChange: false, majorBusinessOwnershipChange: false },
  };
}

describe("review engine — flags fire on recorded states (§14)", () => {
  it("clean policy with standing beneficiaries and no dates due raises nothing", () => {
    const flags = computeReviewFlags(flagInput({}, [designation()], [premium()]));
    expect(flags.filter((f) => f.severity === "WARNING" || f.severity === "ESCALATE")).toEqual([]);
  });

  it("overdue premium is escalated; the flag lists the count", () => {
    const flags = computeReviewFlags(flagInput({}, [], [premium({ dueDate: "2026-01-01" })]));
    expect(flags.some((f) => f.code === "OVERDUE_PREMIUM" && f.severity === "ESCALATE")).toBe(true);
  });

  it("missing policy document warns on live policies only", () => {
    expect(computeReviewFlags(flagInput({ documentRefs: [] })).some((f) => f.code === "MISSING_POLICY_DOCUMENT")).toBe(true);
    expect(computeReviewFlags(flagInput({ documentRefs: [], status: "DRAFT" })).some((f) => f.code === "MISSING_POLICY_DOCUMENT")).toBe(false);
  });

  it("coverage vs modeled target: no assessment says NOT_QUANTIFIED, short cover warns with the gap", () => {
    const absent = computeReviewFlags(flagInput());
    expect(absent.some((f) => f.code === "COVERAGE_BELOW_MODELED_TARGET" && f.severity === "INFO" && f.detail.includes("NOT_QUANTIFIED"))).toBe(true);
    const short = computeReviewFlags(flagInput({ modeledTargetMinor: 12_000_000 }));
    const hit = short.find((f) => f.code === "COVERAGE_BELOW_MODELED_TARGET" && f.severity === "WARNING");
    expect(hit).toBeDefined();
    expect(hit!.detail).toContain("2000000 minor units below");
    expect(hit!.detail).toContain("8333bps");
  });

  it("due and upcoming reviews; interval-derived overdue when no date was recorded", () => {
    expect(computeReviewFlags(flagInput({ nextReviewDate: AS_OF })).some((f) => f.code === "UPCOMING_REVIEW" && f.severity === "WARNING")).toBe(true);
    expect(computeReviewFlags(flagInput({ nextReviewDate: "2026-11-01" })).some((f) => f.code === "UPCOMING_REVIEW" && f.severity === "INFO")).toBe(true);
    expect(
      computeReviewFlags(flagInput({ nextReviewDate: null, lastReviewDate: "2025-09-01", reviewIntervalDays: 30 })).some(
        (f) => f.code === "UPCOMING_REVIEW" && f.detail.includes("2025-10-01"),
      ),
    ).toBe(true);
  });

  it("maturity passed while still IN_FORCE escalates; assignments and loans are recorded as NOTICEs", () => {
    expect(computeReviewFlags(flagInput({ maturityDate: "2026-08-01" })).some((f) => f.code === "UPCOMING_RENEWAL" && f.severity === "ESCALATE")).toBe(true);
    expect(computeReviewFlags(flagInput({ assignmentStatus: "COLLATERAL_ASSIGNED" })).some((f) => f.code === "POLICY_ASSIGNED")).toBe(true);
    expect(computeReviewFlags(flagInput({ policyLoanOutstanding: true })).some((f) => f.code === "POLICY_LOAN_OUTSTANDING")).toBe(true);
  });

  it("caller-supplied change posture maps to review findings (the engine does not watch other domains)", () => {
    const withChanges = flagInput();
    withChanges.changes.insuredRelationshipChanged = true;
    withChanges.changes.successionPlanChanged = true;
    const flags = computeReviewFlags(withChanges);
    expect(flags.some((f) => f.code === "INSURED_RELATIONSHIP_CHANGED")).toBe(true);
    expect(flags.some((f) => f.code === "SUCCESSION_PLAN_CHANGED")).toBe(true);
    expect(computeReviewFlags(flagInput({ successionPlanStillCurrent: false })).some((f) => f.severity === "ESCALATE" && f.detail.includes("no longer current"))).toBe(true);
  });

  it("an in-force record outside ACTIVE/RENEWED governance is visible as an inconsistency", () => {
    expect(computeReviewFlags(flagInput({ governanceStage: "TAX_REVIEW" })).some((f) => f.detail.includes("has not concluded its own review"))).toBe(true);
  });
});
