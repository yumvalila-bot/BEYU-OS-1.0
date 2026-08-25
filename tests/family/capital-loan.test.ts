import { describe, expect, it } from "vitest";
import {
  assessAllocation,
  assessCapitalPool,
  assessInvestmentPolicyStatement,
  assessSegregationTransfer,
  assertSegregationTransferDocumented,
  poolDefinitionCompleteness,
  type AllocationRequest,
  type FamilyCapitalPool,
  type SegregationTransfer,
} from "../../src/lib/family/capital";
import {
  assessLoanDocumentation,
  assessLoanEligibility,
  assertLoanDocumented,
  assertLoanEventSound,
  assertLoanTransition,
  buildRepaymentSchedule,
  canTransition,
  summariseLoanPortfolio,
  type FamilyLoan,
  type LoanEligibilityInput,
} from "../../src/lib/family/loan";
import { FamilyInstitutionError } from "../../src/lib/family/model";

/**
 * Family Capital System and Family Loan Office — pure engines, no database.
 *
 * Finance OS remains canonical financial truth; these engines govern the
 * mandate and the terms, and never assert a balance or post a journal.
 */

const fullDefinition = {
  owner: "BEYU Holdings Ltd",
  source: "Retained earnings and founder contribution.",
  purpose: "Long-horizon capital preservation and growth.",
  permittedUse: "Equity, debt, real assets and strategic businesses.",
  restrictions: "No lifestyle use. No cross-pool movement without authority.",
  risk: "Diversified, medium risk within recorded appetite.",
  liquidity: "Minimum 24 months of obligations held liquid.",
  allocationAuthority: "Family Investment Committee recommendation, Family Council approval.",
  performance: "Measured against the benchmark in the Investment Policy Statement.",
  accountingIntegration: "Finance OS ledger; pool is a reporting dimension, not an account.",
  taxLegalClassification: "Holding-company investment capital, Tanzania.",
  audit: "Annual internal audit of pool movements.",
};

const pool = (over: Partial<FamilyCapitalPool> = {}): FamilyCapitalPool => ({
  poolId: "FPL_PERM",
  pool: "PERMANENT_CAPITAL",
  legalEntityId: "LEN_HOLDINGS",
  jurisdictionCode: "TZ",
  currency: "TZS",
  segregationClass: "FAMILY_CAPITAL",
  definition: fullDefinition,
  observedBalanceMinor: 500_000_000_00,
  observedAsOf: "2026-01-31",
  establishedByReference: "FC-RES-002",
  ...over,
});

describe("capital pools", () => {
  it("accepts a fully defined pool", () => {
    const a = assessCapitalPool(pool());
    expect(a.complete).toBe(true);
    expect(a.missing).toEqual([]);
    expect(a.blockers).toEqual([]);
    expect(a.segregationConflict).toBe(false);
  });

  it("reports every missing definition field", () => {
    const a = assessCapitalPool(pool({ definition: { owner: "BEYU Holdings Ltd" } }));
    expect(a.complete).toBe(false);
    expect(a.missing).toContain("accountingIntegration");
    expect(a.missing).toContain("taxLegalClassification");
  });

  it("detects a pool mandate inconsistent with its segregation class", () => {
    const a = assessCapitalPool(pool({ pool: "PHILANTHROPIC_CAPITAL", segregationClass: "FAMILY_CAPITAL" }));
    expect(a.segregationConflict).toBe(true);
    expect(a.blockers.join(" ")).toMatch(/incompatible with its mandate/);
  });

  it("treats a missing Finance OS balance as unavailable, never zero", () => {
    const a = assessCapitalPool(pool({ observedBalanceMinor: null }));
    expect(a.blockers.join(" ")).toMatch(/UNAVAILABLE, not zero/);
  });

  it("requires jurisdiction — national rules are never generalised", () => {
    const a = assessCapitalPool(pool({ jurisdictionCode: "" }));
    expect(a.blockers.join(" ")).toMatch(/never generalised across jurisdictions/);
  });

  it("requires legal attribution", () => {
    const a = assessCapitalPool(pool({ legalEntityId: "" }));
    expect(a.blockers.join(" ")).toMatch(/legally attributed/);
  });

  it("summarises completeness deterministically", () => {
    const summary = poolDefinitionCompleteness([
      pool(),
      pool({ poolId: "FPL_PHIL", pool: "PHILANTHROPIC_CAPITAL", definition: {} }),
    ]);
    expect(summary.map((s) => s.pool)).toEqual(["PERMANENT_CAPITAL", "PHILANTHROPIC_CAPITAL"]);
    expect(summary[0].complete).toBe(true);
    expect(summary[1].complete).toBe(false);
  });
});

describe("asset segregation", () => {
  const transfer = (over: Partial<SegregationTransfer> = {}): SegregationTransfer => ({
    transferId: "FAL_1",
    from: "FAMILY_CAPITAL",
    to: "LIFESTYLE_ASSETS",
    amountMinor: 1_000_000_00,
    currency: "TZS",
    preconditions: {
      LEGAL_AUTHORITY: "Legal opinion TZ-2026-04",
      POLICY: "FC-3.9",
      APPROVAL: "FC-RES-030",
      ACCOUNTING_TREATMENT: "Distribution to member, Finance OS journal JNL_900.",
      TAX_TREATMENT: "Tax advice TZ-2026-05.",
      AUDIT: "AUD_771",
    },
    actorType: "HUMAN",
    ...over,
  });

  it("permits a cross-class movement carrying all six preconditions", () => {
    const a = assessSegregationTransfer(transfer());
    expect(a.permitted).toBe(true);
    expect(a.withinClass).toBe(false);
  });

  it("refuses a cross-class movement missing any one precondition", () => {
    const a = assessSegregationTransfer(
      transfer({ preconditions: { LEGAL_AUTHORITY: "L", POLICY: "P", APPROVAL: "A" } }),
    );
    expect(a.permitted).toBe(false);
    expect(a.missingPreconditions.sort()).toEqual(["ACCOUNTING_TREATMENT", "AUDIT", "TAX_TREATMENT"]);
  });

  it("permits movement within a single class", () => {
    const a = assessSegregationTransfer(transfer({ to: "FAMILY_CAPITAL" }));
    expect(a.permitted).toBe(true);
    expect(a.withinClass).toBe(true);
  });

  it("notes that Trust movement additionally requires Trustee authority", () => {
    const a = assessSegregationTransfer(transfer({ from: "TRUST_ASSETS", preconditions: {} }));
    expect(a.permitted).toBe(false);
    expect(a.reason).toMatch(/the Family Office cannot direct a Trustee/);
  });

  it("refuses an AI actor moving capital", () => {
    expect(() => assessSegregationTransfer(transfer({ actorType: "AI" }))).toThrow(
      FamilyInstitutionError,
    );
  });

  it("throws from the assertion form", () => {
    expect(() => assertSegregationTransferDocumented(transfer({ preconditions: {} }))).toThrow(
      /SEGREGATION|refused/i,
    );
  });

  it("rejects a non-positive amount", () => {
    expect(() => assessSegregationTransfer(transfer({ amountMinor: 0 }))).toThrow(FamilyInstitutionError);
  });
});

describe("the 13-step allocation chain", () => {
  const authorisedRequest = (over: Partial<AllocationRequest> = {}): AllocationRequest => ({
    requestId: "FAL_REQ_1",
    poolId: "FPL_OPP",
    pool: "OPPORTUNITY_CAPITAL",
    financeCapitalRequestId: "CAP_500",
    legalEntityId: "LEN_HOLDINGS",
    jurisdictionCode: "TZ",
    amountMinor: 250_000_000_00,
    currency: "TZS",
    purpose: "Acquisition of a 20% stake in an industrial venture.",
    requestedBy: "CIO",
    actorType: "HUMAN",
    asOf: "2026-06-01",
    eligibilityDetermination: { result: "ELIGIBLE", reference: "FAM-ELG-12" },
    policyReference: "FIP-2.4",
    riskAssessment: { score: 40, appetiteBreach: false, reference: "RSK_88" },
    availableLiquidityMinor: 500_000_000_00,
    legalTaxReview: { legalReference: "LEGAL-2026-020", taxReference: "TAX-2026-031" },
    conflictAssessment: { cleared: true, reference: "FCI_12" },
    authorityReference: "FC-3.2",
    approval: { approvedBy: "FAMILY_COUNCIL", approvalReference: "FC-RES-041", validUntil: "2026-12-31" },
    ...over,
  });

  it("passes every governance step through APPROVAL for a fully evidenced request", () => {
    const a = assessAllocation(authorisedRequest());
    expect(a.blockingStep).toBeNull();
    expect(a.authorizationSufficient).toBe(true);
    expect(a.executed).toBe(false);
    expect(a.steps.find((s) => s.step === "APPROVAL")?.state).toBe("PASSED");
    expect(a.steps.find((s) => s.step === "EXECUTION")?.state).toBe("REQUIRES_HUMAN");
    expect(a.steps.find((s) => s.step === "FINANCIAL_RECORD")?.state).toBe("REQUIRES_HUMAN");
  });

  it("halts at ELIGIBILITY and marks every later step NOT_REACHED", () => {
    const a = assessAllocation(
      authorisedRequest({ eligibilityDetermination: { result: "NOT_ELIGIBLE", reference: "FAM-ELG-13" } }),
    );
    expect(a.blockingStep).toBe("ELIGIBILITY");
    expect(a.authorizationSufficient).toBe(false);
    expect(a.steps.find((s) => s.step === "AUTHORITY")?.state).toBe("NOT_REACHED");
  });

  it("treats indeterminate eligibility as a failure, not a pass", () => {
    const a = assessAllocation(
      authorisedRequest({ eligibilityDetermination: { result: "INDETERMINATE", reference: null } }),
    );
    expect(a.blockingStep).toBe("ELIGIBILITY");
  });

  it("treats missing liquidity data as UNAVAILABLE rather than sufficient", () => {
    const a = assessAllocation(authorisedRequest({ availableLiquidityMinor: null }));
    expect(a.blockingStep).toBe("LIQUIDITY");
    expect(a.steps.find((s) => s.step === "LIQUIDITY")?.state).toBe("UNAVAILABLE");
  });

  it("fails when liquidity is insufficient", () => {
    const a = assessAllocation(authorisedRequest({ availableLiquidityMinor: 100 }));
    expect(a.blockingStep).toBe("LIQUIDITY");
  });

  it("fails when an approval has expired", () => {
    const a = assessAllocation(
      authorisedRequest({
        approval: { approvedBy: "FAMILY_COUNCIL", approvalReference: "FC-RES-041", validUntil: "2026-05-31" },
      }),
    );
    expect(a.blockingStep).toBe("APPROVAL");
  });

  it("fails without both legal and tax review, citing jurisdiction", () => {
    const a = assessAllocation(authorisedRequest({ legalTaxReview: { legalReference: "L", taxReference: null } }));
    expect(a.blockingStep).toBe("LEGAL_TAX");
    expect(a.steps.find((s) => s.step === "LEGAL_TAX")?.reason).toMatch(/Tanzanian law is never assumed/);
  });

  it("raises a policy decision when no policy reference exists", () => {
    const a = assessAllocation(authorisedRequest({ policyReference: null }));
    expect(a.blockingStep).toBe("POLICY");
    expect(a.policyDecisionRequired).not.toBeNull();
    expect(a.policyDecisionRequired?.domain).toBe("OPPORTUNITY_CAPITAL");
  });

  it("refuses an AI actor", () => {
    expect(() => assessAllocation(authorisedRequest({ actorType: "AI" }))).toThrow(FamilyInstitutionError);
  });

  it("never reports execution as performed", () => {
    for (const a of [
      assessAllocation(authorisedRequest()),
      assessAllocation(authorisedRequest({ policyReference: null })),
    ]) {
      expect(a.executed).toBe(false);
      expect(a.steps.find((s) => s.step === "EXECUTION")?.state).not.toBe("PASSED");
    }
  });
});

describe("Investment Policy Statement", () => {
  it("reports missing elements", () => {
    const a = assessInvestmentPolicyStatement({ OBJECTIVES: "Preserve and grow." });
    expect(a.complete).toBe(false);
    expect(a.missing).toContain("REBALANCING_RULES");
  });
});

/* ------------------------------------------------------------------ */
/* Family Loan Office                                                  */
/* ------------------------------------------------------------------ */

const documentedLoan = (over: Partial<FamilyLoan> = {}): FamilyLoan => ({
  loanId: "FLN_1",
  loanType: "ENTREPRENEURSHIP",
  borrowerClass: "ELIGIBLE_DESCENDANT",
  borrowerId: "FAM_G3A",
  lenderEntityId: "LEN_HOLDINGS",
  amountMinor: 100_000_000_00,
  currency: "TZS",
  purpose: "Working capital for an approved family venture.",
  annualRateBps: 1200,
  tenorMonths: 60,
  repaymentTerms: "Monthly instalments over 60 months.",
  collateral: "NONE",
  guarantor: "NONE",
  authorityReference: "FC-3.7",
  approvalReference: "FC-RES-050",
  legalDocumentation: "Loan agreement executed 2026-04-01, ref LA-2026-07.",
  taxTreatment: "Interest income to lender; TZ advice TAX-2026-040.",
  accountingTreatment: "Loan receivable; Finance OS accounts 1310/4210.",
  status: "APPROVED",
  auditTrailReference: "AUD_900",
  journalEntryReferences: [],
  disbursedAt: null,
  jurisdictionCode: "TZ",
  ...over,
});

describe("loan documentation discipline", () => {
  it("accepts a fully documented loan, including an explicit NONE collateral position", () => {
    const a = assessLoanDocumentation(documentedLoan());
    expect(a.documented).toBe(true);
    expect(a.missing).toEqual([]);
  });

  it("refuses an undocumented transfer", () => {
    const a = assessLoanDocumentation(
      documentedLoan({ legalDocumentation: null, taxTreatment: null, accountingTreatment: null }),
    );
    expect(a.documented).toBe(false);
    expect(a.missing.sort()).toEqual(["accountingTreatment", "legalDocumentation", "taxTreatment"]);
    expect(a.reason).toMatch(/must not be disbursed/);
  });

  it("throws from the assertion form", () => {
    expect(() => assertLoanDocumented(documentedLoan({ purpose: null }))).toThrow(
      /UNDOCUMENTED|not a documented loan/i,
    );
  });

  it("raises a policy decision on a zero rate with no recorded tax treatment", () => {
    const a = assessLoanDocumentation(documentedLoan({ annualRateBps: 0, taxTreatment: null }));
    expect(a.policyDecisionRequired?.code).toMatch(/^FAM-PD-LOAN-IMPUTED/);
  });

  it("does not raise the imputed-interest question once tax treatment is recorded", () => {
    const a = assessLoanDocumentation(documentedLoan({ annualRateBps: 0 }));
    expect(a.policyDecisionRequired).toBeNull();
  });
});

describe("loan lifecycle", () => {
  it("permits documented transitions", () => {
    expect(canTransition("APPROVED", "DOCUMENTED")).toBe(true);
    expect(canTransition("REPAYING", "IN_DEFAULT")).toBe(true);
  });

  it("refuses an undocumented jump and terminal re-entry", () => {
    expect(canTransition("DRAFT", "DISBURSED")).toBe(false);
    expect(canTransition("CLOSED", "REPAYING")).toBe(false);
    expect(() => assertLoanTransition("REJECTED", "APPROVED")).toThrow(FamilyInstitutionError);
  });
});

describe("borrower eligibility", () => {
  const eligibleInput = (over: Partial<LoanEligibilityInput> = {}): LoanEligibilityInput => ({
    loanId: "FLN_1",
    borrowerClass: "ELIGIBLE_DESCENDANT",
    directDescendant: true,
    memberAuthorisationReference: null,
    approvalReference: null,
    controlEvidenceReference: null,
    creditAssessment: { score: 720, assessedByReference: "CREDIT-2026-04" },
    affordability: { affordable: true, basis: "Venture cash-flow forecast covers instalments 2.4x." },
    ...over,
  });

  it("accepts a verified direct descendant with credit and affordability evidence", () => {
    expect(assessLoanEligibility(eligibleInput()).eligible).toBe(true);
  });

  it("refuses a borrower whose descendant status was never determined", () => {
    const e = assessLoanEligibility(eligibleInput({ directDescendant: null }));
    expect(e.eligible).toBe(false);
    expect(e.blockers.join(" ")).toMatch(/cannot be presumed/);
  });

  it("refuses a family member with no authorisation reference", () => {
    const e = assessLoanEligibility(
      eligibleInput({ borrowerClass: "AUTHORIZED_FAMILY_MEMBER", memberAuthorisationReference: null }),
    );
    expect(e.eligible).toBe(false);
    expect(e.blockers.join(" ")).toMatch(/membership alone does not confer borrowing rights/);
  });

  it("refuses an unapproved venture", () => {
    const e = assessLoanEligibility(eligibleInput({ borrowerClass: "APPROVED_FAMILY_VENTURE" }));
    expect(e.eligible).toBe(false);
  });

  it("refuses a negative affordability assessment", () => {
    const e = assessLoanEligibility(
      eligibleInput({ affordability: { affordable: false, basis: "Coverage 0.6x." } }),
    );
    expect(e.eligible).toBe(false);
  });
});

describe("repayment schedule arithmetic", () => {
  it("repays exactly the principal and reconciles", () => {
    const s = buildRepaymentSchedule({
      principalMinor: 100_000_000_00,
      annualRateBps: 1200,
      tenorMonths: 60,
      frequencyPerYear: 12,
    });
    expect(s.instalments.length).toBe(60);
    expect(s.totalPrincipalMinor).toBe(100_000_000_00);
    expect(s.reconciles).toBe(true);
    expect(s.instalments[59].balanceAfterMinor).toBe(0);
    expect(s.totalRepayableMinor).toBe(s.totalPrincipalMinor + s.totalInterestMinor);
  });

  it("carries the rounding remainder to the final instalment", () => {
    // 100_001 minor units over 3 monthly periods does not divide evenly.
    const s = buildRepaymentSchedule({
      principalMinor: 100_001,
      annualRateBps: 0,
      tenorMonths: 3,
      frequencyPerYear: 12,
    });
    expect(s.totalPrincipalMinor).toBe(100_001);
    expect(s.instalments[0].principalMinor).toBe(33_333);
    expect(s.instalments[2].principalMinor).toBe(33_335);
    expect(s.reconciles).toBe(true);
  });

  it("produces no interest at a zero rate", () => {
    const s = buildRepaymentSchedule({
      principalMinor: 120_000,
      annualRateBps: 0,
      tenorMonths: 12,
      frequencyPerYear: 12,
    });
    expect(s.totalInterestMinor).toBe(0);
  });

  it("is deterministic", () => {
    const a = buildRepaymentSchedule({ principalMinor: 500_000, annualRateBps: 950, tenorMonths: 24, frequencyPerYear: 4 });
    const b = buildRepaymentSchedule({ principalMinor: 500_000, annualRateBps: 950, tenorMonths: 24, frequencyPerYear: 4 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("rejects a tenor that is not a whole number of periods", () => {
    expect(() =>
      buildRepaymentSchedule({ principalMinor: 100_000, annualRateBps: 500, tenorMonths: 10, frequencyPerYear: 4 }),
    ).toThrow(FamilyInstitutionError);
  });

  it("rejects non-integer principal", () => {
    expect(() =>
      buildRepaymentSchedule({ principalMinor: 100.5, annualRateBps: 500, tenorMonths: 12, frequencyPerYear: 12 }),
    ).toThrow(FamilyInstitutionError);
  });
});

describe("loan events", () => {
  it("requires a Finance OS journal reference for a disbursement", () => {
    expect(() =>
      assertLoanEventSound({
        eventId: "FLEV_1",
        loanId: "FLN_1",
        type: "DISBURSED",
        occurredAt: "2026-04-01T10:00:00Z",
        actorType: "HUMAN",
        actorReference: "FINANCE_DIRECTOR",
        journalReference: null,
        detail: "Disbursed to borrower account.",
      }),
    ).toThrow(/must reference the Finance OS journal entry/);
  });

  it("accepts a disbursement with a journal reference", () => {
    expect(() =>
      assertLoanEventSound({
        eventId: "FLEV_2",
        loanId: "FLN_1",
        type: "DISBURSED",
        occurredAt: "2026-04-01T10:00:00Z",
        actorType: "HUMAN",
        actorReference: "FINANCE_DIRECTOR",
        journalReference: "JNL_901",
        detail: "Disbursed to borrower account.",
      }),
    ).not.toThrow();
  });

  it("refuses an AI actor recording a loan event", () => {
    expect(() =>
      assertLoanEventSound({
        eventId: "FLEV_3",
        loanId: "FLN_1",
        type: "APPLIED",
        occurredAt: "2026-04-01T10:00:00Z",
        actorType: "AI",
        actorReference: "NOELIA",
        journalReference: null,
        detail: "Application recorded.",
      }),
    ).toThrow(FamilyInstitutionError);
  });
});

describe("loan portfolio reporting", () => {
  it("counts undocumented loans without exposing borrowers", () => {
    const summary = summariseLoanPortfolio([
      documentedLoan(),
      documentedLoan({ loanId: "FLN_2", status: "DISBURSED", purpose: null }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.undocumentedCount).toBe(1);
    expect(summary.undocumentedLoanIds).toEqual(["FLN_2"]);
    expect(summary.outstandingPrincipalMinor).toBe(100_000_000_00);
    expect(JSON.stringify(summary.byStatus)).not.toContain("FAM_G3A");
  });
});
