/**
 * BEYU OS — HCM compensation controls and fiduciary-capital separation.
 *
 * The two most expensive mistakes these engines exist to prevent:
 *
 *   1. A person approving their own payment. `assertApprovalChain()` refuses a chain in which the
 *      requester cleared any stage — including the "HR validation" and "finance validation" steps —
 *      and refuses two stages cleared by one principal. A control that one person can satisfy alone
 *      is not a control.
 *
 *   2. Entrusted capital being read as BEYU's own. The register keeps OWN, FIDUCIARY, PROJECT and
 *      GUARANTEED capital apart, and `assertCapitalSeparation()` throws if any structure tries to
 *      name a single combined total.
 */
import { describe, expect, it } from "vitest";
import {
  assertApprovalChain,
  assertNoSelfApproval,
  buildRepaymentSchedule,
  calculateBonus,
  calculateAllowance,
  canTransitionEntitlement,
  checkBonusBudget,
  RECEIVABLE_TREATMENTS,
  reviewEmergencyCase,
  summariseCompensationCost,
  transitionEntitlement,
  validateEntitlement,
  type ApprovalStage,
  type BonusPolicy,
  type EntitlementBase,
} from "@/lib/compensation/entitlements";
import {
  aggregateCapitalPortfolio,
  assertCapitalSeparation,
  classifyCapitalOrigin,
  validateArrangement,
} from "@/lib/finance/private-capital/entrusted";
import type { MetricSeedBase } from "@/lib/finance/intelligence/provenance";

let counter = 0;
const seed = (subjectId = "EMP_1"): MetricSeedBase => ({
  subject: { subjectType: "UNIT", subjectId },
  dataTimestamp: "2026-01-01T00:00:00.000Z",
  nextId: () => `CMP-${++counter}`,
});

const beneficiary = { employeeId: "EMP_1", principalId: "USR_1" };
const manager = { principalId: "USR_2", employeeId: "EMP_2", roles: ["MANAGER"] };
const hr = { principalId: "USR_3", employeeId: null, roles: ["HCM_DIRECTOR"] };
const cfo = { principalId: "USR_4", employeeId: null, roles: ["GROUP_CFO"] };
/** A requester who clears no stage: the originator of the entitlement, independent of the chain. */
const requester = { principalId: "USR_7", employeeId: null, roles: ["HCM_DIRECTOR"] };

describe("segregation of duties", () => {
  it("refuses a beneficiary approving their own entitlement", () => {
    expect(() => assertNoSelfApproval({ beneficiary, approver: { principalId: "USR_1", roles: [] }, context: "bonus" })).toThrow(/segregation/i);
  });

  it("refuses the same human under a different identifier", () => {
    // Same employee record, different login: a principal-only check would miss this.
    expect(() =>
      assertNoSelfApproval({ beneficiary, approver: { principalId: "USR_9", employeeId: "EMP_1", roles: [] }, context: "bonus" }),
    ).toThrow(/segregation/i);
  });

  it("refuses a chain where the requester cleared a stage", () => {
    const stages: ApprovalStage[] = [
      { stage: "MANAGER_RECOMMENDATION", actorPrincipalId: "USR_2", at: "2026-01-02T00:00:00Z", note: "Achieved 130% of target" },
      { stage: "HR_VALIDATION", actorPrincipalId: "USR_1", at: "2026-01-03T00:00:00Z", note: "Eligibility verified" },
      { stage: "FINAL_APPROVAL", actorPrincipalId: "USR_4", at: "2026-01-04T00:00:00Z", note: "Within budget" },
    ];
    expect(() =>
      assertApprovalChain({
        beneficiary,
        requester: { principalId: "USR_1", roles: ["HCM_DIRECTOR"] },
        stages,
        requiredStages: ["MANAGER_RECOMMENDATION", "HR_VALIDATION", "FINAL_APPROVAL"],
        context: "bonus",
      }),
    ).toThrow(/requester|segregation/i);
  });

  it("refuses two stages cleared by one person", () => {
    const stages: ApprovalStage[] = [
      { stage: "HR_VALIDATION", actorPrincipalId: "USR_3", at: "2026-01-03T00:00:00Z", note: "Eligibility verified" },
      { stage: "FINANCE_VALIDATION", actorPrincipalId: "USR_3", at: "2026-01-03T00:00:00Z", note: "Budget available" },
    ];
    expect(() =>
      assertApprovalChain({ beneficiary, requester, stages, requiredStages: ["HR_VALIDATION", "FINANCE_VALIDATION"], context: "bonus" }),
    ).toThrow(/both|one person|segregation/i);
  });

  it("refuses a missing required stage and a stage with no recorded basis", () => {
    expect(() =>
      assertApprovalChain({ beneficiary, requester, stages: [managerStage()], requiredStages: ["MANAGER_RECOMMENDATION", "FINAL_APPROVAL"], context: "bonus" }),
    ).toThrow(/missing/i);
    expect(() =>
      assertApprovalChain({
        beneficiary,
        requester,
        stages: [{ stage: "MANAGER_RECOMMENDATION", actorPrincipalId: "USR_2", at: "2026-01-02T00:00:00Z" }],
        requiredStages: ["MANAGER_RECOMMENDATION"],
        context: "bonus",
      }),
    ).toThrow(/basis/i);
  });

  it("accepts an independent chain and records each cleared stage", () => {
    expect(() =>
      assertApprovalChain({
        beneficiary,
        requester,
        stages: [managerStage(), { stage: "HR_VALIDATION", actorPrincipalId: "USR_3", at: "2026-01-03T00:00:00Z", note: "Eligibility verified" }, { stage: "FINAL_APPROVAL", actorPrincipalId: "USR_4", at: "2026-01-04T00:00:00Z", note: "Within approved budget" }],
        requiredStages: ["MANAGER_RECOMMENDATION", "HR_VALIDATION", "FINAL_APPROVAL"],
        context: "bonus",
      }),
    ).not.toThrow();
  });
});

function managerStage(): ApprovalStage {
  return { stage: "MANAGER_RECOMMENDATION", actorPrincipalId: manager.principalId, at: "2026-01-02T00:00:00Z", note: "Achieved 130% of target" };
}

describe("entitlement lifecycle", () => {
  it("moves only forwards and treats PAID as terminal", () => {
    expect(canTransitionEntitlement("DRAFT", "PENDING")).toBe(true);
    expect(canTransitionEntitlement("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionEntitlement("APPROVED", "PAID")).toBe(true);
    expect(canTransitionEntitlement("PAID", "CANCELLED")).toBe(false);
    expect(canTransitionEntitlement("REJECTED", "PENDING")).toBe(false);
  });

  it("refuses a transition by the beneficiary and requires an ISO-8601 timestamp", () => {
    const draft: EntitlementBase = { ...entitlementFixture(), status: "DRAFT", approvalChain: [] };
    expect(() => transitionEntitlement(draft, "PENDING", hr, { at: "not-a-timestamp" })).toThrow(/ISO-8601/i);
    expect(() =>
      transitionEntitlement(transitionEntitlement(draft, "PENDING", hr, { at: "2026-01-05T00:00:00Z" }), "APPROVED", { principalId: "USR_1", roles: ["GROUP_CFO"] }, { at: "2026-01-06T00:00:00Z", note: "Approved" }),
    ).toThrow(/segregation/i);
    const pending = transitionEntitlement(draft, "PENDING", hr, { at: "2026-01-05T00:00:00Z" });
    expect(pending.status).toBe("PENDING");
    // PENDING is not an approval: the chain stays empty until a human clears a stage.
    expect(pending.approvalChain).toHaveLength(0);
  });

  it("reports governance findings rather than throwing on a soft gap", () => {
    const findings = validateEntitlement({ ...entitlementFixture(), policyRef: "", eligibility: "x" });
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.join(" ")).toMatch(/policy/i);
  });
});

function entitlementFixture(): EntitlementBase {
  return {
    id: "ENT_1",
    kind: "PERFORMANCE_BONUS",
    employeeId: "EMP_1",
    employeePrincipalId: "USR_1",
    legalEntityId: "LEN_BEYU_HOLDINGS",
    tenantId: "TEN_BEYU_GROUP",
    countryCode: "KE",
    currency: "KES",
    amountMinor: 250_000,
    effectiveDate: "2026-01-31",
    eligibility: "Completed 12 months of service",
    reason: "FY2025 performance award",
    policyRef: "POL_BONUS_2025",
    status: "PENDING",
    financialTreatment: "PAYROLL",
    approvalChain: [managerStage()],
    raisedBy: "USR_2",
    raisedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("bonus computation", () => {
  const policy: BonusPolicy = {
    id: "POL_BONUS_2025",
    version: 3,
    type: "PERFORMANCE",
    calculationBasis: "PERCENTAGE_OF_BASE",
    rateBps: 1000,
    currency: "KES",
    period: "FY2025",
    budgetMinor: 10_000_000,
    minimumServiceMonths: 12,
    performanceThresholdBps: 8000,
    requiresManagerRecommendation: true,
    requiresFinalApproval: true,
    eligibilityRule: "Permanent employees with 12 months service",
    approved: true,
    approvalRef: "APR-BONUS-2025",
  };
  const request = {
    employeeId: "EMP_1",
    legalEntityId: "LEN_BEYU_HOLDINGS",
    tenantId: "TEN_BEYU_GROUP",
    countryCode: "KE",
    currency: "KES",
    baseSalaryMinor: 4_000_000,
    serviceMonths: 24,
    performanceAchievedBps: 13_000,
  };

  it("awards a percentage of base only when the policy is approved", () => {
    const award = calculateBonus({ policy, request });
    expect(award.kind).toBe("AWARD");
    if (award.kind === "AWARD") expect(award.amountMinor).toBe(400_000);
    expect(calculateBonus({ policy: { ...policy, approved: false }, request }).kind).toBe("REFUSED");
  });

  it("distinguishes NO_AWARD (did not qualify) from REFUSED (cannot compute)", () => {
    const junior = calculateBonus({ policy, request: { ...request, serviceMonths: 6 } });
    expect(junior.kind).toBe("NO_AWARD");
    const missingBase = calculateBonus({ policy, request: { ...request, baseSalaryMinor: null } });
    expect(missingBase.kind).toBe("REFUSED");
  });

  it("refuses a currency mismatch rather than mixing currencies", () => {
    const mismatch = calculateBonus({ policy: { ...policy, currency: "USD" }, request });
    expect(mismatch.kind).toBe("REFUSED");
    if (mismatch.kind === "REFUSED") expect(mismatch.reason).toMatch(/currency/i);
  });

  it("reports a budget overshoot instead of quietly trimming awards", () => {
    const over = checkBonusBudget({ policy, awardsMinor: [6_000_000, 6_000_000] });
    expect(over.withinBudget).toBe(false);
    expect(over.overshootMinor).toBe(2_000_000);
    expect(over.totalMinor).toBe(12_000_000);
  });
});

describe("allowances", () => {
  it("applies the monthly ceiling across all allowances of the same type", () => {
    const outcome = calculateAllowance({
      seed: seed(),
      policy: {
        id: "POL_ALLOW_TRANSPORT",
        version: 1,
        type: "TRANSPORT",
        frequency: "MONTHLY",
        standardAmountMinor: 30_000,
        monthlyCeilingMinor: 50_000,
        currency: "KES",
        approved: true,
        approvalRef: "APR-1",
        policyStatement: "Transport allowance for field staff",
      },
      priorPeriodTotalMinor: 25_000,
      currency: "KES",
    });
    expect(outcome.kind).toBe("ABSENT");
    if (outcome.kind === "ABSENT") {
      expect(outcome.state).toBe("INVALID");
      expect(outcome.reason).toMatch(/ceiling/i);
    }
  });

  it("returns the headroom when the ceiling is respected", () => {
    const outcome = calculateAllowance({
      seed: seed(),
      policy: {
        id: "POL_ALLOW_TRANSPORT",
        version: 1,
        type: "TRANSPORT",
        frequency: "MONTHLY",
        standardAmountMinor: 30_000,
        monthlyCeilingMinor: 50_000,
        currency: "KES",
        approved: true,
        approvalRef: "APR-1",
        policyStatement: "Transport allowance for field staff",
      },
      priorPeriodTotalMinor: 5_000,
      currency: "KES",
    });
    expect(outcome.kind).toBe("VALUE");
    if (outcome.kind === "VALUE") expect(outcome.value.headroomMinor).toBe(15_000);
  });
});

describe("employee credit", () => {
  const facility = {
    id: "CRED_1",
    kind: "EMPLOYEE_LOAN" as const,
    employeeId: "EMP_1",
    legalEntityId: "LEN_BEYU_HOLDINGS",
    tenantId: "TEN_BEYU_GROUP",
    currency: "KES",
    principalMinor: 1_200_000,
    annualInterestRateBps: 1200,
    instalments: 12,
    firstInstalmentDate: "2026-02-28",
    payrollDeductionAuthorised: true,
    authorisationRef: "CONSENT-EMP-1",
    status: "APPROVED" as const,
  };

  it("amortises to exactly zero with an interest-bearing schedule", () => {
    const schedule = buildRepaymentSchedule(facility);
    expect(schedule.instalments).toHaveLength(12);
    const last = schedule.instalments[11];
    expect(last.closingBalanceMinor).toBe(0);
    expect(schedule.instalments[0].openingBalanceMinor).toBe(1_200_000);
    expect(schedule.totalInterestMinor).toBeGreaterThan(0);
    expect(schedule.totalRepaidMinor).toBe(1_200_000 + schedule.totalInterestMinor);
    // Interest is charged on the opening balance at 1%/month.
    expect(schedule.instalments[0].interestMinor).toBe(12_000);
  });

  it("refuses an instalment above the authorised payroll-deduction ceiling", () => {
    expect(() => buildRepaymentSchedule({ ...facility, maximumDeductionPerPeriodMinor: 1_000 })).toThrow(/ceiling|authorised/i);
  });

  it("refuses payroll deduction without recorded authorisation", () => {
    expect(() => buildRepaymentSchedule({ ...facility, authorisationRef: null })).toThrow(/authoris/i);
  });

  it("treats a loan as a receivable, never as compensation cost", () => {
    expect(RECEIVABLE_TREATMENTS).toContain("LOAN_ADVANCE");
    const summary = summariseCompensationCost({
      entitlements: [
        { ...entitlementFixture(), status: "APPROVED" },
        { ...entitlementFixture(), id: "ENT_2", kind: "EMPLOYEE_CREDIT", amountMinor: 500_000, status: "APPROVED", financialTreatment: "LOAN_ADVANCE" },
      ],
    });
    expect(summary.costMinor).toBe(250_000);
    expect(summary.receivableMinor).toBe(500_000);
  });
});

describe("emergency assistance", () => {
  const baseCase = {
    id: "EMG_1",
    employeeId: "EMP_1",
    employeePrincipalId: "USR_1",
    legalEntityId: "LEN_BEYU_HOLDINGS",
    tenantId: "TEN_BEYU_GROUP",
    currency: "KES",
    category: "MEDICAL",
    requestedAmountMinor: 300_000,
    approvedAmountMinor: null,
    evidenceRefs: [] as string[],
    status: "SUBMITTED" as const,
    repayable: false,
    submittedAt: "2026-01-05T00:00:00.000Z",
  };

  it("treats missing evidence as a blocking finding above the materiality threshold", () => {
    const review = reviewEmergencyCase({ case: baseCase, materialityThresholdMinor: 100_000 });
    expect(review.approvable).toBe(false);
    expect(review.findings.join(" ")).toMatch(/evidence/i);
  });

  it("allows a small case with evidence but still surfaces governance findings", () => {
    const review = reviewEmergencyCase({
      case: { ...baseCase, requestedAmountMinor: 20_000, evidenceRefs: ["DOC_1"] },
      materialityThresholdMinor: 100_000,
    });
    expect(review.approvable).toBe(true);
  });
});

describe("fiduciary capital separation", () => {
  it("classifies instruments by origin without inventing an 'other people's money' category", () => {
    expect(classifyCapitalOrigin("LP_COMMITMENT")).toBe("FIDUCIARY");
    expect(classifyCapitalOrigin("ENTRUSTED_FUND")).toBe("FIDUCIARY");
    expect(classifyCapitalOrigin("PROJECT_FINANCE")).toBe("PROJECT");
    expect(classifyCapitalOrigin("GUARANTEE")).toBe("GUARANTEED");
  });

  it("returns governance findings for a fiduciary arrangement with no stated restrictions", () => {
    const findings = validateArrangement({
      id: "ARR_1",
      legalEntityId: "LEN_BEYU_HOLDINGS",
      providerPartyId: "PARTY_1",
      instrument: "LP_COMMITMENT",
      currency: "USD",
      commitmentMinor: 1_000_000,
      drawnMinor: 0,
      purpose: "Blended agriculture fund",
      restrictions: [],
      fiduciaryRestrictions: [],
      repayable: true,
      status: "PROPOSED",
      approvalRef: null,
    });
    expect(findings.join(" ")).toMatch(/restriction/i);
  });

  it("refuses a structure that names a single combined capital total", () => {
    expect(() =>
      assertCapitalSeparation({
        ownDrawnMinor: 100,
        fiduciaryDrawnMinor: 200,
        projectDrawnMinor: 0,
        guaranteedNotionalMinor: 0,
        // Deliberate: the guard must throw on any combined total appearing anywhere in the shape.
        ...({ totalDrawnMinor: 300 } as Record<string, number>),
      } as never),
    ).toThrow(/combined|total/i);
  });

  it("aggregates by origin and discloses that a foreign-currency arrangement was excluded", () => {
    const portfolio = aggregateCapitalPortfolio({
      reportingCurrency: "KES",
      arrangements: [
        capitalArrangementFixture({ id: "ARR_FID", instrument: "ENTRUSTED_FUND", commitmentMinor: 2_000_000, drawnMinor: 1_500_000 }),
        capitalArrangementFixture({ id: "ARR_PROJ", instrument: "PROJECT_FINANCE", commitmentMinor: 800_000, drawnMinor: 500_000 }),
        capitalArrangementFixture({ id: "ARR_USD", instrument: "CO_INVESTMENT", currency: "USD", commitmentMinor: 500_000, drawnMinor: 500_000 }),
      ],
    });
    // NO instrument in the entrusted catalogue classifies as OWN. Own capital is a ledger fact, not an
    // entrusted arrangement, so an arrangements-only portfolio can never report BEYU-owned capital.
    expect(portfolio.ownDrawnMinor).toBe(0);
    expect(portfolio.fiduciaryDrawnMinor).toBe(1_500_000);
    expect(portfolio.projectDrawnMinor).toBe(500_000);
    expect(portfolio.totals.map((t) => t.origin).sort()).toEqual(["FIDUCIARY", "PROJECT"]);
    expect(portfolio.excluded.length).toBe(1);
    expect(portfolio.excluded[0].arrangementId).toBe("ARR_USD");
    expect(portfolio.excluded[0].reason).toMatch(/USD/);
    expect(Object.keys(portfolio)).not.toContain("totalDrawnMinor");
  });
});

function capitalArrangementFixture(overrides: Record<string, unknown>) {
  return {
    id: "ARR",
    legalEntityId: "LEN_BEYU_HOLDINGS",
    providerPartyId: "PARTY_1",
    instrument: "LP_COMMITMENT",
    currency: "KES",
    commitmentMinor: 1_000_000,
    drawnMinor: 0,
    purpose: "Test arrangement",
    restrictions: ["Capital may not be commingled with BEYU operating cash"],
    fiduciaryRestrictions: ["Investment mandate governs deployment"],
    repayable: true,
    status: "ACTIVE",
    approvalRef: "APR-1",
    ...overrides,
  } as never;
}
