/**
 * BEYU OS — HCM COMPENSATION, BENEFITS & EMPLOYEE WELFARE ENGINE.
 *
 * HCM → Compensation & Benefits → Employee Welfare → Incentives.
 *
 * HCM is a SHARED enterprise capability, never an HR OS. This module is the HCM–Compensation domain
 * inside it: it owns the EMPLOYEE ENTITLEMENT — who is owed what, why, under which policy, and at which
 * stage of approval. It owns no ledger. Finance OS records every financial transaction (§53, §54);
 * this module produces the authorised entitlement that Finance then pays and accounts for.
 *
 * ============================== THE CONTROL THAT MATTERS =====================
 *
 * SEGREGATION OF DUTIES. The single most common compensation fraud in an enterprise system is a person
 * with approval rights approving their own payment. `assertNoSelfApproval()` refuses it structurally and
 * is called by every approval path in this module. `assertApprovalChain()` goes further and refuses a
 * chain in which the requester is ANY of the approvers — including the "HR validation" and "finance
 * validation" steps, which are approvals under any other name.
 *
 * The rule is enforced on PRINCIPAL IDS resolved server-side from the authenticated session. It is not a
 * UI rule and there is no parameter that switches it off.
 *
 * ============================== THREE SPONSORSHIPS, NOT ONE ==================
 *
 * §17 requires the three sponsorship categories to stay apart, and they are three separate types here:
 *
 *   EmployeeSponsorship   HCM → Learning & Development. A benefit to a worker.
 *   CommunitySponsorship  Foundation / CSR. A charitable disbursement. Owned by Foundation OS.
 *   InvestmentSponsorship FINANCE_OS. Capital deployed for a financial return.
 *
 * They have different owners, different authorities and different accounting. A single "sponsorship"
 * table would let a CSR payment be read as staff cost and an investment as a benefit — the failure the
 * separation exists to prevent.
 *
 * ============================== MONEY IS INTEGER MINOR UNITS =================
 *
 * Every amount is integer minor units, every rate is basis points, every date is an ISO-8601 string.
 * No floating point touches a monetary figure. Repayment schedules are computed deterministically with
 * a stated residual-rounding convention.
 */
import { BPS_BASE, FinanceArithmeticError, assertMoney, assertPercent, multiple } from "@/lib/finance/intelligence/arithmetic";
import type { MetricInput, MetricOutcome, MetricSeedBase } from "@/lib/finance/intelligence/provenance";
import { calculated, invalid, missing, seedFor } from "@/lib/finance/intelligence/provenance";

export const COMPENSATION_ENGINE_VERSION = "compensation-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Entitlement lifecycle                                               */
/* ------------------------------------------------------------------ */

/**
 * The canonical entitlement lifecycle (§13).
 *
 * DRAFT → PENDING → APPROVED → PAID is the only forward path. REJECTED, CANCELLED and EXPIRED are
 * terminal and are reachable from specific states only. There is no transition INTO DRAFT and none out
 * of PAID: a paid entitlement is a fact, and correcting it is a new compensating entitlement rather
 * than an edit of settled history.
 */
export const ENTITLEMENT_STATUS = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "PAID", "CANCELLED", "EXPIRED"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUS)[number];

export const ENTITLEMENT_TRANSITIONS: Readonly<Record<EntitlementStatus, readonly EntitlementStatus[]>> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED", "EXPIRED"],
  REJECTED: [],
  PAID: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionEntitlement(from: EntitlementStatus, to: EntitlementStatus): boolean {
  return ENTITLEMENT_TRANSITIONS[from].includes(to);
}

export function assertEntitlementTransition(from: EntitlementStatus, to: EntitlementStatus): void {
  if (!canTransitionEntitlement(from, to)) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `An entitlement cannot move from ${from} to ${to}. Permitted from ${from}: ${ENTITLEMENT_TRANSITIONS[from].join(", ") || "(terminal)"}.`,
      { from, to },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Segregation of duties                                               */
/* ------------------------------------------------------------------ */

export type CompensationActor = {
  /** GlobalUserID. Resolved server-side from the authenticated session — never client-supplied. */
  principalId: string;
  /** The employee record this principal is, when the principal is also an employee. */
  employeeId?: string | null;
  roles: readonly string[];
};

export type ApprovalStage = {
  stage: "MANAGER_RECOMMENDATION" | "HR_VALIDATION" | "FINANCE_VALIDATION" | "FINAL_APPROVAL" | "PAYMENT";
  /** GlobalUserID of the actor who cleared this stage. */
  actorPrincipalId: string;
  /** ISO-8601 timestamp. */
  at: string;
  /** Required for every stage except PAYMENT: what the approver relied on. */
  note?: string | null;
};

/**
 * Refuse an approval by the beneficiary.
 *
 * Compares principal identity AND employee identity. A principal is refused if they are the
 * beneficiary's own principal, OR if they are the employee record the entitlement belongs to — the
 * second check catches the case where a user holds two identifiers for the same human, which is exactly
 * the case a naive principal-only check misses.
 */
export function assertNoSelfApproval(params: {
  beneficiary: { employeeId: string; principalId?: string | null };
  approver: CompensationActor;
  context: string;
}): void {
  const { beneficiary, approver } = params;
  if (beneficiary.principalId && approver.principalId === beneficiary.principalId) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Segregation of duties: a beneficiary cannot approve their own ${params.context}.`, {
      principalId: approver.principalId,
    });
  }
  if (approver.employeeId && approver.employeeId === beneficiary.employeeId) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `Segregation of duties: employee ${beneficiary.employeeId} cannot approve their own ${params.context}, even under a different login.`,
      { employeeId: beneficiary.employeeId },
    );
  }
}

/**
 * Refuse an approval chain that is not independent of the requester or of itself.
 *
 * Four structural failures are refused, each of which has a real-world counterpart:
 *   1. the requester appears anywhere in the chain, including as an "HR validation"
 *   2. two stages were cleared by the same principal — one person is not a control
 *   3. the same stage is cleared twice
 *   4. a required stage is missing
 */
export function assertApprovalChain(params: {
  beneficiary: { employeeId: string; principalId?: string | null };
  requester: CompensationActor;
  stages: readonly ApprovalStage[];
  requiredStages: readonly ApprovalStage["stage"][];
  context: string;
}): void {
  const { beneficiary, requester, stages } = params;
  for (const stage of stages) {
    assertNoSelfApproval({ beneficiary, approver: { principalId: stage.actorPrincipalId, roles: [] }, context: params.context });
    if (stage.actorPrincipalId === requester.principalId) {
      throw new FinanceArithmeticError(
        "INVALID_RATIO",
        `Segregation of duties: the requester also cleared the ${stage.stage} stage of their own ${params.context}. An originator is never an approver.`,
        { stage: stage.stage, principalId: stage.actorPrincipalId },
      );
    }
    if (stage.stage !== "PAYMENT" && (!stage.note || stage.note.trim().length < 4)) {
      throw new FinanceArithmeticError(
        "INVALID_RATIO",
        `The ${stage.stage} stage of this ${params.context} records no basis. An approval without a recorded basis is not an approval.`,
        { stage: stage.stage },
      );
    }
  }
  const seenStages = new Set<string>();
  const seenActors = new Map<string, string>();
  for (const stage of stages) {
    if (seenStages.has(stage.stage)) {
      throw new FinanceArithmeticError("INVALID_RATIO", `Stage ${stage.stage} was cleared twice on one ${params.context}.`, { stage: stage.stage });
    }
    seenStages.add(stage.stage);
    const prior = seenActors.get(stage.actorPrincipalId);
    if (prior) {
      throw new FinanceArithmeticError(
        "INVALID_RATIO",
        `Segregation of duties: one principal (${stage.actorPrincipalId}) cleared both ${prior} and ${stage.stage}. Two stages cleared by one person are one control, not two.`,
        { principalId: stage.actorPrincipalId, stages: [prior, stage.stage] },
      );
    }
    seenActors.set(stage.actorPrincipalId, stage.stage);
  }
  const missing = params.requiredStages.filter((required) => !seenStages.has(required));
  if (missing.length > 0) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `The ${params.context} is missing required approval stage(s): ${missing.join(", ")}. Each stage exists to be cleared.`,
      { missing },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Entitlement base                                                   */
/* ------------------------------------------------------------------ */

export const ENTITLEMENT_KIND = [
  "BASE_COMPENSATION",
  "PERFORMANCE_BONUS",
  "PROFIT_SHARING",
  "SALES_COMMISSION",
  "PROJECT_COMPLETION_BONUS",
  "RETENTION_BONUS",
  "RECOGNITION_AWARD",
  "DISCRETIONARY_BONUS",
  "ALLOWANCE",
  "BENEFIT",
  "EMPLOYEE_CREDIT",
  "EMERGENCY_ASSISTANCE",
  "EDUCATION_SPONSORSHIP",
  "PROFESSIONAL_DEVELOPMENT",
] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KIND)[number];

/**
 * The financial treatment of an entitlement — i.e. how Finance OS must account for it.
 *
 * Declaring it here rather than in Finance keeps the employee-facing meaning with HCM while leaving the
 * accounting to the ledger owner. `PAYROLL` items are paid through the payroll run; `EXPENSE_REIMBURSEMENT`
 * through payables; `FRINGE_BENEFIT` may be non-cash; `LOAN_ADVANCE` creates a receivable rather than a
 * cost, which is why it must never be summed into compensation cost.
 */
export const FINANCIAL_TREATMENT = [
  "PAYROLL",
  "EXPENSE_REIMBURSEMENT",
  "FRINGE_BENEFIT",
  "LOAN_ADVANCE",
  "NON_CASH_RECOGNITION",
  "NON_REPAYABLE_WELFARE",
] as const;
export type FinancialTreatment = (typeof FINANCIAL_TREATMENT)[number];

/** Treatments that create a receivable, not a cost. Never summed into compensation expense. */
export const RECEIVABLE_TREATMENTS: readonly FinancialTreatment[] = ["LOAN_ADVANCE"];

export type EntitlementBase = {
  id: string;
  kind: EntitlementKind;
  employeeId: string;
  /** The principal this employee is, where known. Used for the segregation-of-duties check. */
  employeePrincipalId?: string | null;
  employmentRelationshipId?: string | null;
  legalEntityId: string;
  tenantId: string;
  departmentId?: string | null;
  countryCode: string;
  currency: string;
  /** Gross value of the entitlement, minor units. */
  amountMinor: number;
  effectiveDate: string;
  eligibility: string;
  reason: string;
  /** Policy reference (a bonus policy, an allowance policy, a welfare policy). */
  policyRef: string;
  status: EntitlementStatus;
  financialTreatment: FinancialTreatment;
  /** Every stage cleared so far. */
  approvalChain: readonly ApprovalStage[];
  /** The principal who raised it. */
  raisedBy: string;
  raisedAt: string;
};

/**
 * Validate an entitlement.
 *
 * Structural faults THROW; governance gaps are RETURNED so a compliance report can enumerate every
 * finding across a population rather than stopping at the first.
 */
export function validateEntitlement(e: EntitlementBase): string[] {
  const findings: string[] = [];
  assertMoney(e.amountMinor, `${e.id}.amountMinor`, { allowNegative: false });
  if (!e.currency || e.currency.trim().length !== 3) {
    throw new FinanceArithmeticError("INVALID_MONEY", `Entitlement ${e.id} must carry a 3-letter ISO-4217 currency.`, { id: e.id });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.effectiveDate)) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Entitlement ${e.id} has a malformed effective date '${e.effectiveDate}'.`, { id: e.id });
  }
  if (!e.employeeId) throw new FinanceArithmeticError("INVALID_RATIO", `Entitlement ${e.id} has no employee.`, { id: e.id });
  if (!e.legalEntityId || !e.tenantId) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Entitlement ${e.id} is not attached to both a legal entity and a tenant.`, { id: e.id });
  }
  if (!e.eligibility || e.eligibility.trim().length < 3) {
    findings.push(`Entitlement ${e.id} states no eligibility basis. Every entitlement must record why this employee qualifies.`);
  }
  if (!e.reason || e.reason.trim().length < 3) {
    findings.push(`Entitlement ${e.id} states no reason.`);
  }
  if (!e.policyRef) {
    findings.push(`Entitlement ${e.id} cites no policy. An entitlement without a policy is discretionary by another name.`);
  }
  if (e.status === "APPROVED" || e.status === "PAID") {
    const hasApproval = e.approvalChain.some((stage) => stage.stage === "FINAL_APPROVAL");
    if (!hasApproval) findings.push(`Entitlement ${e.id} is ${e.status} without a FINAL_APPROVAL stage on its chain.`);
  }
  if (e.status === "PAID" && e.approvalChain.some((stage) => stage.actorPrincipalId === e.raisedBy)) {
    findings.push(`Entitlement ${e.id} is PAID and its raiser cleared one of its approval stages. This is a segregation-of-duties breach.`);
  }
  return findings;
}

/** Move an entitlement to a new status, enforcing the lifecycle. Returns the updated record, purely. */
export function transitionEntitlement(
  e: EntitlementBase,
  to: EntitlementStatus,
  actor: CompensationActor,
  params: { at: string; note?: string | null },
): EntitlementBase {
  assertEntitlementTransition(e.status, to);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(params.at)) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Entitlement ${e.id}: a transition timestamp must be ISO-8601, received '${params.at}'.`, { id: e.id });
  }
  if (to === "APPROVED" || to === "PAID") {
    assertNoSelfApproval({
      beneficiary: { employeeId: e.employeeId, principalId: e.employeePrincipalId ?? null },
      approver: actor,
      context: `${e.kind} entitlement`,
    });
  }
  const stage: ApprovalStage["stage"] | null = to === "PAID" ? "PAYMENT" : to === "APPROVED" ? "FINAL_APPROVAL" : null;
  const chain = stage
    ? [...e.approvalChain, { stage, actorPrincipalId: actor.principalId, at: params.at, note: params.note ?? null }]
    : e.approvalChain;
  return { ...e, status: to, approvalChain: chain };
}

/* ------------------------------------------------------------------ */
/* §14 — Bonus engine                                                  */
/* ------------------------------------------------------------------ */

export const BONUS_POLICY_TYPE = [
  "PERFORMANCE",
  "PROFIT_SHARING",
  "SALES",
  "PROJECT_COMPLETION",
  "RETENTION",
  "SPECIAL_RECOGNITION",
  "DISCRETIONARY",
] as const;
export type BonusPolicyType = (typeof BONUS_POLICY_TYPE)[number];

/**
 * How a bonus is computed from its basis.
 *
 *   PERCENTAGE_OF_BASE        target × (base × rate)
 *   PERCENTAGE_OF_PROFIT      a declared share of a profit pool; the pool is an INPUT, never derived here
 *   FIXED_AMOUNT              a stated sum
 *   COMMISSION_ON_SALES       sales value × commission rate, optionally with a quota threshold
 *   TEAM_POOL_SPLIT           a team pool divided by a declared weight per member
 */
export const BONUS_CALCULATION_BASIS = [
  "PERCENTAGE_OF_BASE",
  "PERCENTAGE_OF_PROFIT",
  "FIXED_AMOUNT",
  "COMMISSION_ON_SALES",
  "TEAM_POOL_SPLIT",
] as const;
export type BonusCalculationBasis = (typeof BONUS_CALCULATION_BASIS)[number];

export type BonusPolicy = {
  id: string;
  version: number;
  type: BonusPolicyType;
  calculationBasis: BonusCalculationBasis;
  /** Rate in basis points for the percentage bases and commission. */
  rateBps?: number | null;
  /** Fixed amount for FIXED_AMOUNT, minor units. */
  fixedAmountMinor?: number | null;
  currency: string;
  period: string;
  /** Budget for the policy's period, minor units. A total above budget is refused. */
  budgetMinor?: number | null;
  /** Minimum service months to qualify. */
  minimumServiceMonths?: number;
  /** Performance threshold, basis points of target (8000 = 80% of target required). */
  performanceThresholdBps?: number | null;
  /** Sales quota, minor units. Commission below the quota is refused when set. */
  quotaMinor?: number | null;
  /** True when a manager recommendation is required before HR validation. */
  requiresManagerRecommendation: boolean;
  /** True when a human authority must give final approval. Always required for a bonus. */
  requiresFinalApproval: boolean;
  /** Eligibility statement, carried onto every award. */
  eligibilityRule: string;
  approved: boolean;
  approvalRef?: string | null;
};

export type BonusAwardRequest = {
  employeeId: string;
  employeePrincipalId?: string | null;
  legalEntityId: string;
  tenantId: string;
  departmentId?: string | null;
  countryCode: string;
  currency: string;
  /** The employee's base salary, minor units, when the basis needs it. */
  baseSalaryMinor?: number | null;
  /** The declared profit pool, minor units. Only ever an INPUT. */
  profitPoolMinor?: number | null;
  /** Sales achieved in the period, minor units. */
  salesAchievedMinor?: number | null;
  /** Monthly sales target, minor units. */
  salesTargetMinor?: number | null;
  /** Service months completed. */
  serviceMonths?: number;
  /** Performance achieved, basis points of target, when the basis needs it. */
  performanceAchievedBps?: number | null;
  /** Team pool and this member's weight, for TEAM_POOL_SPLIT. */
  teamPoolMinor?: number | null;
  teamWeight?: number | null;
  teamWeightTotal?: number | null;
};

export type BonusCalculation =
  | { kind: "AWARD"; amountMinor: number; basis: BonusCalculationBasis; explanation: string }
  | { kind: "NO_AWARD"; reason: string }
  | { kind: "REFUSED"; reason: string };

/**
 * Compute a bonus award from a GOVERNED policy.
 *
 * The amount is a pure function of the policy and the request. No cap, floor or discretion is invented:
 * where a policy does not state one, the computed figure stands and is recorded as CALCULATED.
 *
 * `NO_AWARD` and `REFUSED` are DIFFERENT outcomes and are kept apart deliberately:
 *   NO_AWARD  the employee did not qualify — correct, expected, and reportable as "no bonus earned"
 *   REFUSED   the calculation cannot be made as specified — a missing input or an unusable policy
 * A system that collapsed these would report a data gap as a performance outcome.
 */
export function calculateBonus(params: { policy: BonusPolicy; request: BonusAwardRequest }): BonusCalculation {
  const { policy, request } = params;
  if (!policy.approved) {
    return { kind: "REFUSED", reason: `Bonus policy ${policy.id} v${policy.version} is not approved. An unapproved policy cannot produce an award.` };
  }
  if (policy.currency.toUpperCase() !== request.currency.toUpperCase()) {
    return {
      kind: "REFUSED",
      reason: `Policy currency ${policy.currency} does not match the award currency ${request.currency}. Convert with a governed FX rate rather than mixing currencies.`,
    };
  }
  if (policy.minimumServiceMonths !== undefined && policy.minimumServiceMonths > 0) {
    const months = request.serviceMonths ?? 0;
    if (months < policy.minimumServiceMonths) {
      return { kind: "NO_AWARD", reason: `The employee has ${months} month(s) of service; the policy requires at least ${policy.minimumServiceMonths}.` };
    }
  }
  if (policy.performanceThresholdBps !== null && policy.performanceThresholdBps !== undefined) {
    const achieved = request.performanceAchievedBps ?? 0;
    if (achieved < policy.performanceThresholdBps) {
      return {
        kind: "NO_AWARD",
        reason: `Performance of ${achieved} bps is below the policy threshold of ${policy.performanceThresholdBps} bps.`,
      };
    }
  }

  switch (policy.calculationBasis) {
    case "PERCENTAGE_OF_BASE": {
      if (request.baseSalaryMinor === null || request.baseSalaryMinor === undefined) {
        return { kind: "REFUSED", reason: "The policy computes a percentage of base salary but no base salary was supplied." };
      }
      if (policy.rateBps === null || policy.rateBps === undefined) {
        return { kind: "REFUSED", reason: `Bonus policy ${policy.id} computes a percentage of base but states no rate.` };
      }
      assertMoney(request.baseSalaryMinor, "baseSalaryMinor", { allowNegative: false });
      assertPercent(policy.rateBps, "rateBps", { allowNegative: false });
      const amount = Math.round((request.baseSalaryMinor * policy.rateBps) / BPS_BASE);
      return { kind: "AWARD", amountMinor: amount, basis: policy.calculationBasis, explanation: `Base salary ${request.baseSalaryMinor} × ${policy.rateBps} bps.` };
    }
    case "PERCENTAGE_OF_PROFIT": {
      if (request.profitPoolMinor === null || request.profitPoolMinor === undefined) {
        return { kind: "REFUSED", reason: "The policy shares a profit pool but no pool was declared for the period." };
      }
      if (policy.rateBps === null || policy.rateBps === undefined) {
        return { kind: "REFUSED", reason: `Bonus policy ${policy.id} shares profit but states no share rate.` };
      }
      assertMoney(request.profitPoolMinor, "profitPoolMinor");
      if (request.profitPoolMinor <= 0) return { kind: "NO_AWARD", reason: "The declared profit pool is zero or negative, so there is nothing to share." };
      const amount = Math.round((request.profitPoolMinor * policy.rateBps) / BPS_BASE);
      return { kind: "AWARD", amountMinor: amount, basis: policy.calculationBasis, explanation: `Profit pool ${request.profitPoolMinor} × ${policy.rateBps} bps.` };
    }
    case "FIXED_AMOUNT": {
      if (policy.fixedAmountMinor === null || policy.fixedAmountMinor === undefined) {
        return { kind: "REFUSED", reason: `Bonus policy ${policy.id} is a fixed amount but states none.` };
      }
      assertMoney(policy.fixedAmountMinor, "fixedAmountMinor", { allowNegative: false });
      return { kind: "AWARD", amountMinor: policy.fixedAmountMinor, basis: policy.calculationBasis, explanation: "Fixed amount per the policy." };
    }
    case "COMMISSION_ON_SALES": {
      if (request.salesAchievedMinor === null || request.salesAchievedMinor === undefined) {
        return { kind: "REFUSED", reason: "A sales commission requires the sales actually achieved in the period." };
      }
      if (policy.rateBps === null || policy.rateBps === undefined) {
        return { kind: "REFUSED", reason: `Commission policy ${policy.id} states no commission rate.` };
      }
      assertMoney(request.salesAchievedMinor, "salesAchievedMinor", { allowNegative: false });
      assertPercent(policy.rateBps, "rateBps", { allowNegative: false });
      if (policy.quotaMinor !== null && policy.quotaMinor !== undefined && request.salesAchievedMinor < policy.quotaMinor) {
        return {
          kind: "NO_AWARD",
          reason: `Sales of ${request.salesAchievedMinor} are below the quota of ${policy.quotaMinor}; commission does not accrue below quota for this policy.`,
        };
      }
      const amount = Math.round((request.salesAchievedMinor * policy.rateBps) / BPS_BASE);
      return {
        kind: "AWARD",
        amountMinor: amount,
        basis: policy.calculationBasis,
        explanation: `Sales ${request.salesAchievedMinor} × ${policy.rateBps} bps${policy.quotaMinor ? ` (quota ${policy.quotaMinor} cleared)` : ""}.`,
      };
    }
    case "TEAM_POOL_SPLIT": {
      if (request.teamPoolMinor === null || request.teamPoolMinor === undefined || request.teamWeight === null || request.teamWeight === undefined || !request.teamWeightTotal) {
        return { kind: "REFUSED", reason: "A team pool split requires the pool, this member's weight and the total weight." };
      }
      assertMoney(request.teamPoolMinor, "teamPoolMinor", { allowNegative: false });
      if (!Number.isFinite(request.teamWeight) || request.teamWeight < 0) {
        return { kind: "REFUSED", reason: "The team member weight must be a non-negative number." };
      }
      if (!Number.isFinite(request.teamWeightTotal) || request.teamWeightTotal <= 0) {
        return { kind: "REFUSED", reason: "The total team weight must be positive." };
      }
      if (request.teamWeight > request.teamWeightTotal) {
        return { kind: "REFUSED", reason: "This member's weight exceeds the declared total weight for the team." };
      }
      const amount = Math.floor((request.teamPoolMinor * request.teamWeight) / request.teamWeightTotal);
      return {
        kind: "AWARD",
        amountMinor: amount,
        basis: policy.calculationBasis,
        explanation: `Team pool ${request.teamPoolMinor} × weight ${request.teamWeight}/${request.teamWeightTotal}, floored deterministically.`,
      };
    }
    default: {
      const never: never = policy.calculationBasis;
      throw new FinanceArithmeticError("INVALID_RATIO", `Unknown bonus calculation basis ${String(never)}.`, {});
    }
  }
}

/**
 * Total awards against a policy budget.
 *
 * Returns `withinBudget: false` with the overshoot when the awards exceed the budget. It does NOT clamp
 * them: silently reducing an approved award to fit a budget is a payment error with a legal
 * consequence, and the correct response is to surface the breach to the authority that set the budget.
 */
export function checkBonusBudget(params: { policy: BonusPolicy; awardsMinor: readonly number[] }): {
  totalMinor: number;
  budgetMinor: number | null;
  remainingMinor: number | null;
  withinBudget: boolean;
  overshootMinor: number;
} {
  for (const [i, amount] of params.awardsMinor.entries()) assertMoney(amount, `awardsMinor[${i}]`, { allowNegative: false });
  const total = params.awardsMinor.reduce((a, b) => a + b, 0);
  const budget = params.policy.budgetMinor ?? null;
  if (budget === null) {
    return { totalMinor: total, budgetMinor: null, remainingMinor: null, withinBudget: true, overshootMinor: 0 };
  }
  assertMoney(budget, "budgetMinor", { allowNegative: false });
  return {
    totalMinor: total,
    budgetMinor: budget,
    remainingMinor: budget - total,
    withinBudget: total <= budget,
    overshootMinor: Math.max(0, total - budget),
  };
}

/* ------------------------------------------------------------------ */
/* §16 — Allowances                                                    */
/* ------------------------------------------------------------------ */

export const ALLOWANCE_TYPE = [
  "TRANSPORT",
  "HOUSING",
  "COMMUNICATION",
  "MEAL",
  "FIELD",
  "TRAVEL",
  "PROJECT",
  "HARDSHIP",
  "RESPONSIBILITY",
  "OTHER_POLICY_APPROVED",
] as const;
export type AllowanceType = (typeof ALLOWANCE_TYPE)[number];

/** Monthly, per-diem, per-mileage or one-off. Determines how an entitlement recurs. */
export const ALLOWANCE_FREQUENCY = ["MONTHLY", "QUARTERLY", "ANNUAL", "PER_DIEM", "PER_UNIT", "ONE_OFF"] as const;
export type AllowanceFrequency = (typeof ALLOWANCE_FREQUENCY)[number];

export type AllowancePolicy = {
  id: string;
  version: number;
  type: AllowanceType;
  frequency: AllowanceFrequency;
  /** Standard amount per period, minor units. Null when the policy is formula-driven. */
  standardAmountMinor?: number | null;
  /** Per-unit rate for PER_UNIT/PER_DIEM frequencies, minor units. */
  unitRateMinor?: number | null;
  /** Monthly ceiling across all allowances of this type for one employee, minor units. */
  monthlyCeilingMinor?: number | null;
  currency: string;
  /** Grades/bands eligible. Empty means all. */
  eligibleGrades?: readonly string[];
  approved: boolean;
  approvalRef?: string | null;
  policyStatement: string;
};

/**
 * Compute one allowance payment period.
 *
 * The monthly ceiling is applied ACROSS ALLOWANCES OF THE SAME TYPE for an employee, so
 * `priorPeriodTotalMinor` is a required input whenever a ceiling is set: computing a single allowance in
 * isolation would let an employee breach the ceiling by holding three allowances of the same type.
 *
 * An amount over the ceiling is REFUSED rather than trimmed, because the shortfall between what a policy
 * promises and what is paid is itself a payroll error.
 */
export function calculateAllowance(params: {
  seed: MetricSeedBase;
  policy: AllowancePolicy;
  quantity?: number | null;
  priorPeriodTotalMinor?: number | null;
  currency: string;
}): MetricOutcome<{ amountMinor: number; explanation: string; ceilingApplied: boolean; headroomMinor: number | null }> {
  const inputs: MetricInput[] = [
    { name: "allowanceType", value: params.policy.type, unit: "ENUM", kind: "POLICY", source: params.policy.id, period: null, currency: null },
    { name: "frequency", value: params.policy.frequency, unit: "ENUM", kind: "POLICY", source: params.policy.id, period: null, currency: null },
    { name: "standardAmountMinor", value: params.policy.standardAmountMinor === null || params.policy.standardAmountMinor === undefined ? null : String(params.policy.standardAmountMinor), unit: params.currency, kind: "POLICY", source: params.policy.id, period: null, currency: params.currency },
    { name: "unitRateMinor", value: params.policy.unitRateMinor === null || params.policy.unitRateMinor === undefined ? null : String(params.policy.unitRateMinor), unit: params.currency, kind: "POLICY", source: params.policy.id, period: null, currency: params.currency },
    { name: "monthlyCeilingMinor", value: params.policy.monthlyCeilingMinor === null || params.policy.monthlyCeilingMinor === undefined ? null : String(params.policy.monthlyCeilingMinor), unit: params.currency, kind: "POLICY", source: params.policy.id, period: null, currency: params.currency },
    { name: "quantity", value: params.quantity === null || params.quantity === undefined ? null : String(params.quantity), unit: "COUNT", kind: "OBSERVED", source: "period usage", period: null, currency: null },
    { name: "priorPeriodTotalMinor", value: params.priorPeriodTotalMinor === null || params.priorPeriodTotalMinor === undefined ? null : String(params.priorPeriodTotalMinor), unit: params.currency, kind: "OBSERVED", source: "this employee's other allowances of the same type", period: null, currency: params.currency },
  ];
  const seed = () =>
    seedFor(params.seed, "HCM.ALLOWANCE", `Allowance = ${params.policy.frequency} ${params.policy.type} entitlement per policy ${params.policy.id} v${params.policy.version}`, inputs, {
      period: null,
      currency: params.currency,
      quality: "MANAGEMENT",
    });

  if (!params.policy.approved) {
    return invalid(seed(), `Allowance policy ${params.policy.id} v${params.policy.version} is not approved; an unapproved policy cannot create an entitlement.`);
  }
  if (params.policy.currency.toUpperCase() !== params.currency.toUpperCase()) {
    return invalid(seed(), `The allowance policy is denominated in ${params.policy.currency} but the entitlement is in ${params.currency}.`);
  }

  let amount: number;
  let explanation: string;
  if (params.policy.frequency === "PER_UNIT" || params.policy.frequency === "PER_DIEM") {
    const rate = params.policy.unitRateMinor;
    if (rate === null || rate === undefined) return missing(seed(), `A ${params.policy.frequency} allowance requires a per-unit rate on the policy.`);
    if (params.quantity === null || params.quantity === undefined) {
      return missing(seed(), `A ${params.policy.frequency} allowance requires the quantity claimed for the period.`);
    }
    if (!Number.isFinite(params.quantity) || params.quantity < 0) {
      return invalid(seed(), "The claimed quantity must be a non-negative number.");
    }
    assertMoney(rate, "unitRateMinor", { allowNegative: false });
    amount = Math.round(rate * params.quantity);
    explanation = `${params.quantity} unit(s) at ${rate} minor units each.`;
  } else {
    const standard = params.policy.standardAmountMinor;
    if (standard === null || standard === undefined) {
      return missing(seed(), `The ${params.policy.frequency} ${params.policy.type} allowance policy states no standard amount.`);
    }
    assertMoney(standard, "standardAmountMinor", { allowNegative: false });
    amount = standard;
    explanation = `Standard ${params.policy.frequency} amount per policy ${params.policy.id}.`;
  }

  const ceiling = params.policy.monthlyCeilingMinor;
  if (ceiling !== null && ceiling !== undefined) {
    assertMoney(ceiling, "monthlyCeilingMinor", { allowNegative: false });
    const prior = params.priorPeriodTotalMinor ?? 0;
    assertMoney(prior, "priorPeriodTotalMinor", { allowNegative: false });
    const headroom = ceiling - prior;
    if (amount > headroom) {
      return invalid(
        seed(),
        `This allowance of ${amount} would take this employee's ${params.policy.type} allowance to ${prior + amount}, above the policy ceiling of ${ceiling} for the period. The payment is refused rather than trimmed: the gap between a promised entitlement and a paid one is itself a payroll error.`,
      );
    }
    return calculated(seed(), { amountMinor: amount, explanation, ceilingApplied: true, headroomMinor: headroom - amount });
  }
  return calculated(seed(), { amountMinor: amount, explanation, ceilingApplied: false, headroomMinor: null });
}

/* ------------------------------------------------------------------ */
/* §15 — Employee credits and loans                                    */
/* ------------------------------------------------------------------ */

export const CREDIT_KIND = ["SALARY_ADVANCE", "EMPLOYEE_LOAN", "EMERGENCY_CREDIT", "EDUCATION_CREDIT"] as const;
export type CreditKind = (typeof CREDIT_KIND)[number];

export type CreditFacility = {
  id: string;
  kind: CreditKind;
  employeeId: string;
  employeePrincipalId?: string | null;
  legalEntityId: string;
  tenantId: string;
  currency: string;
  /** Principal advanced, minor units. */
  principalMinor: number;
  /** Annual interest rate, basis points. Zero means interest-free. */
  annualInterestRateBps: number;
  /** Number of instalments. */
  instalments: number;
  /** ISO-8601 first instalment date. */
  firstInstalmentDate: string;
  /** True when payroll deductions are authorised in writing. Required for deduction by payroll. */
  payrollDeductionAuthorised: boolean;
  authorisationRef?: string | null;
  /** Ceiling on the deduction per period, minor units. Protects against an unlawful deduction. */
  maximumDeductionPerPeriodMinor?: number | null;
  status: EntitlementStatus;
};

export type RepaymentInstalment = {
  number: number;
  date: string;
  openingBalanceMinor: number;
  interestMinor: number;
  principalMinor: number;
  instalmentMinor: number;
  closingBalanceMinor: number;
};

export type RepaymentSchedule = {
  facilityId: string;
  currency: string;
  instalments: RepaymentInstalment[];
  totalInterestMinor: number;
  totalRepaidMinor: number;
  /** Instalment amount for every period except the final one, which absorbs residual rounding. */
  levelInstalmentMinor: number;
  finalInstalmentMinor: number;
  roundingConvention: string;
};

/**
 * Build a repayment schedule.
 *
 * The instalment is computed from the annuity formula in integer arithmetic, rounded half away from
 * zero. Because the rounded instalment does not divide the balance exactly, the FINAL instalment absorbs
 * the residual — the standard convention, stated on the result so an employee-facing statement can
 * explain a final payment that differs by a few minor units.
 *
 * Refused: a non-positive principal, a non-positive instalment count, an interest rate at or below
 * −100%, and a payroll-deduction facility with no written authorisation or with an instalment above the
 * authorised per-period ceiling. Payroll deduction without authorisation is not a modelling problem; it
 * is a legal one, and the engine will not produce a schedule that presumes it.
 */
export function buildRepaymentSchedule(facility: CreditFacility): RepaymentSchedule {
  assertMoney(facility.principalMinor, "principalMinor", { allowNegative: false });
  assertPercent(facility.annualInterestRateBps, "annualInterestRateBps");
  if (facility.principalMinor <= 0) {
    throw new FinanceArithmeticError("INVALID_MONEY", "A credit facility must have a positive principal.", { facilityId: facility.id });
  }
  if (!Number.isSafeInteger(facility.instalments) || facility.instalments <= 0) {
    throw new FinanceArithmeticError("INVALID_RATIO", "A repayment schedule requires a positive whole number of instalments.", { facilityId: facility.id });
  }
  if (facility.annualInterestRateBps <= -BPS_BASE) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", "An interest rate at or below −100% makes the schedule undefined.", { facilityId: facility.id });
  }
  if (facility.payrollDeductionAuthorised && !facility.authorisationRef) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `Credit facility ${facility.id} authorises payroll deduction without a written authorisation reference. A deduction without recorded consent is not lawful.`,
      { facilityId: facility.id },
    );
  }

  const periodicRateBps = facility.annualInterestRateBps / 12;
  const n = facility.instalments;
  let instalment: number;
  if (periodicRateBps === 0) {
    instalment = Math.round(facility.principalMinor / n);
  } else {
    const rate = periodicRateBps / BPS_BASE;
    const factor = Math.pow(1 + rate, n);
    instalment = Math.round((facility.principalMinor * rate * factor) / (factor - 1));
  }
  assertMoney(instalment, "levelInstalment", { allowNegative: false });
  if (
    facility.payrollDeductionAuthorised &&
    facility.maximumDeductionPerPeriodMinor !== null &&
    facility.maximumDeductionPerPeriodMinor !== undefined &&
    instalment > facility.maximumDeductionPerPeriodMinor
  ) {
    throw new FinanceArithmeticError(
      "INVALID_MONEY",
      `The computed instalment of ${instalment} exceeds the authorised payroll deduction ceiling of ${facility.maximumDeductionPerPeriodMinor} per period. The schedule is refused rather than deducting more than was authorised.`,
      { facilityId: facility.id },
    );
  }

  const instalments: RepaymentInstalment[] = [];
  let balance = facility.principalMinor;
  let totalInterest = 0;
  for (let i = 1; i <= n; i += 1) {
    const opening = balance;
    const interest = Math.round((opening * periodicRateBps) / BPS_BASE);
    let principalPortion: number;
    let payment: number;
    if (i === n) {
      principalPortion = opening;
      payment = opening + interest;
    } else {
      principalPortion = Math.min(opening, instalment - interest);
      if (principalPortion < 0) {
        // An instalment smaller than the periodic interest never repays principal. Refusing here rather
        // than emitting an infinite-balance schedule is the difference between a rejected application and
        // a debt that grows silently.
        throw new FinanceArithmeticError(
          "INVALID_MONEY",
          `Instalment ${instalment} does not cover the periodic interest of ${interest}; the loan would never amortise. Increase the instalment or the term.`,
          { facilityId: facility.id },
        );
      }
      payment = principalPortion + interest;
    }
    balance = opening - principalPortion;
    totalInterest += interest;
    instalments.push({
      number: i,
      date: addMonths(facility.firstInstalmentDate, i - 1),
      openingBalanceMinor: opening,
      interestMinor: interest,
      principalMinor: principalPortion,
      instalmentMinor: payment,
      closingBalanceMinor: balance,
    });
  }

  return {
    facilityId: facility.id,
    currency: facility.currency,
    instalments,
    totalInterestMinor: totalInterest,
    totalRepaidMinor: facility.principalMinor + totalInterest,
    levelInstalmentMinor: instalment,
    finalInstalmentMinor: instalments[instalments.length - 1].instalmentMinor,
    roundingConvention: "Level instalment rounded half away from zero; the final instalment absorbs the residual so the closing balance is exactly zero.",
  };
}

/** Add whole months to an ISO date without timezone drift. Pure. */
export function addMonths(iso: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new FinanceArithmeticError("INVALID_RATIO", `Date '${iso}' must be ISO-8601 (yyyy-mm-dd).`, { iso });
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const zeroBased = month - 1 + months;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth + 1).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

export type CreditPosition = {
  facilityId: string;
  principalMinor: number;
  repaidMinor: number;
  outstandingMinor: number;
  /** Instalments whose due date has passed and which remain unpaid. */
  arrears: { number: number; date: string; dueMinor: number }[];
  arrearsMinor: number;
  settled: boolean;
  /** Outstanding ÷ principal, fixed-point. */
  utilisationScaled: number | null;
};

/**
 * Position of a credit facility as at a date.
 *
 * Arrears are computed from a supplied list of actually-paid instalment numbers rather than inferred,
 * because when a payment was received is a fact about the payment ledger and this module does not guess
 * it. An instalment due on or before `asOf` and not in `paidInstalments` is in arrears.
 */
export function creditPosition(params: {
  facility: CreditFacility;
  schedule: RepaymentSchedule;
  paidInstalments: readonly number[];
  asOf: string;
}): CreditPosition {
  const paid = new Set(params.paidInstalments);
  const arrears = params.schedule.instalments
    .filter((instalment) => !paid.has(instalment.number) && instalment.date <= params.asOf)
    .map((instalment) => ({ number: instalment.number, date: instalment.date, dueMinor: instalment.instalmentMinor }));
  const arrearsAmount = arrears.reduce((a, b) => a + b.dueMinor, 0);
  const repaid = params.schedule.instalments.filter((i) => paid.has(i.number)).reduce((a, b) => a + b.principalMinor, 0);
  const outstanding = params.facility.principalMinor - repaid;
  const utilisation = multiple(outstanding, params.facility.principalMinor);
  return {
    facilityId: params.facility.id,
    principalMinor: params.facility.principalMinor,
    repaidMinor: repaid,
    outstandingMinor: outstanding,
    arrears,
    arrearsMinor: arrearsAmount,
    settled: outstanding === 0,
    utilisationScaled: utilisation.kind === "MULTIPLE" ? utilisation.scaled : null,
  };
}

/* ------------------------------------------------------------------ */
/* §18 — Emergency fund                                                */
/* ------------------------------------------------------------------ */

export const EMERGENCY_CASE_STATUS = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DISBURSED", "CLOSED"] as const;
export type EmergencyCaseStatus = (typeof EMERGENCY_CASE_STATUS)[number];

export const EMERGENCY_TRANSITIONS: Readonly<Record<EmergencyCaseStatus, readonly EmergencyCaseStatus[]>> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["DISBURSED", "REJECTED"],
  REJECTED: [],
  DISBURSED: ["CLOSED"],
  CLOSED: [],
};

export function assertEmergencyTransition(from: EmergencyCaseStatus, to: EmergencyCaseStatus): void {
  if (!EMERGENCY_TRANSITIONS[from].includes(to)) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `An emergency-assistance case cannot move from ${from} to ${to}. Permitted from ${from}: ${EMERGENCY_TRANSITIONS[from].join(", ") || "(terminal)"}.`,
      { from, to },
    );
  }
}

export type EmergencyCase = {
  id: string;
  employeeId: string;
  employeePrincipalId?: string | null;
  legalEntityId: string;
  tenantId: string;
  currency: string;
  category: string;
  requestedAmountMinor: number;
  approvedAmountMinor?: number | null;
  /** Evidence references — never the evidence itself; documents live in the records capability. */
  evidenceRefs: readonly string[];
  status: EmergencyCaseStatus;
  /** Whether the assistance is repayable. A non-repayable grant is a welfare payment, not a loan. */
  repayable: boolean;
  reviewNotes?: string | null;
  approvalRef?: string | null;
  submittedAt: string;
};

/** Descriptions of the standard evidence a case needs, by category. Absence is a finding, not a refusal. */
const MINIMUM_EVIDENCE_BY_CATEGORY: Readonly<Record<string, string>> = {
  MEDICAL: "a treatment bill, diagnosis or hospital admission record",
  BEREAVEMENT: "a death certificate or burial authorisation",
  FIRE_OR_DISASTER: "a police, fire-service or disaster-authority report",
  ACCIDENT: "a police or hospital report",
  EMERGENCY_TRAVEL: "a travel authorisation or stranded-relative notification",
  HOUSING_EVICTION: "an eviction notice or landlord demand",
  DEFAULT: "supporting documentary evidence appropriate to the claimed emergency",
};

/**
 * Validate an emergency-assistance case.
 *
 * Findings rather than throws, so a welfare officer sees every open item at once. The evidence minimum
 * is a HARD finding when the requested amount is material (above `materialityThresholdMinor`): an
 * emergency fund without evidence discipline is an unaudited cash channel, and this engine will say so
 * rather than approve one.
 */
export function reviewEmergencyCase(params: { case: EmergencyCase; materialityThresholdMinor: number }): { findings: string[]; approvable: boolean } {
  const c = params.case;
  const findings: string[] = [];
  assertMoney(c.requestedAmountMinor, "requestedAmountMinor", { allowNegative: false });
  assertMoney(params.materialityThresholdMinor, "materialityThresholdMinor", { allowNegative: false });
  if (c.requestedAmountMinor <= 0) findings.push(`Case ${c.id} requests a non-positive amount.`);
  if (!c.category) findings.push(`Case ${c.id} states no emergency category.`);
  if (c.evidenceRefs.length === 0) {
    const expected = MINIMUM_EVIDENCE_BY_CATEGORY[c.category] ?? MINIMUM_EVIDENCE_BY_CATEGORY.DEFAULT;
    findings.push(`Case ${c.id} has no evidence attached; this category requires ${expected}.`);
  }
  if (c.approvedAmountMinor !== null && c.approvedAmountMinor !== undefined) {
    assertMoney(c.approvedAmountMinor, "approvedAmountMinor", { allowNegative: false });
    if (c.approvedAmountMinor > c.requestedAmountMinor) {
      findings.push(`Case ${c.id} approves ${c.approvedAmountMinor}, more than the ${c.requestedAmountMinor} requested. An approval above the request needs its own authority reference.`);
    }
  }
  if (c.status === "APPROVED" || c.status === "DISBURSED") {
    if (!c.approvalRef) findings.push(`Case ${c.id} is ${c.status} without an approval reference.`);
    if (c.approvedAmountMinor === null || c.approvedAmountMinor === undefined) findings.push(`Case ${c.id} is ${c.status} with no approved amount recorded.`);
  }
  const material = c.requestedAmountMinor >= params.materialityThresholdMinor;
  const approvable = findings.length === 0 || (!material && c.evidenceRefs.length > 0);
  if (material && c.evidenceRefs.length === 0) {
    findings.push(`Case ${c.id} requests ${c.requestedAmountMinor}, at or above the materiality threshold of ${params.materialityThresholdMinor}. Evidence is mandatory at this level and its absence is a blocking finding.`);
  }
  return { findings, approvable: approvable && !(material && c.evidenceRefs.length === 0) };
}

/* ------------------------------------------------------------------ */
/* §17 — Sponsorship separation                                        */
/* ------------------------------------------------------------------ */

/**
 * A worker's education or professional-development sponsorship. HCM → Learning & Development.
 *
 * This is a BENEFIT to an employee. Its financial treatment is `FRINGE_BENEFIT` or
 * `EXPENSE_REIMBURSEMENT`, never a charitable disbursement and never an investment.
 */
export type EmployeeSponsorship = {
  domain: "EMPLOYEE_DEVELOPMENT";
  id: string;
  employeeId: string;
  legalEntityId: string;
  tenantId: string;
  currency: string;
  programme: string;
  amountMinor: number;
  financialTreatment: Extract<FinancialTreatment, "FRINGE_BENEFIT" | "EXPENSE_REIMBURSEMENT">;
  /** Whether the employee must remain employed for a period, and for how long. */
  retentionObligationMonths?: number | null;
  /** Whether the sponsorship is repayable if the employee leaves early. */
  repayableOnEarlyExit: boolean;
  policyRef: string;
};

/**
 * A community or public-interest sponsorship. Foundation / CSR capability — NOT HCM's.
 *
 * `ownerCapability` is fixed to `FOUNDATION` by the type, so an HCM caller cannot construct one of these
 * as though it were a staff benefit. Foundation OS owns the relationship; this type exists here only so
 * that the three categories are visible side by side and cannot be conflated.
 */
export type CommunitySponsorship = {
  domain: "COMMUNITY";
  id: string;
  /** Always the Foundation capability. Never HCM, never Finance. */
  ownerCapability: "FOUNDATION";
  beneficiaryRef: string;
  foundationProgramRef: string;
  currency: string;
  amountMinor: number;
  category: "EDUCATION" | "HEALTH" | "ENVIRONMENT" | "SPORT" | "CULTURE" | "EMERGENCY_RELIEF" | "OTHER";
  policyRef: string;
};

/**
 * An INVESTMENT sponsorship. FINANCE_OS.
 *
 * Capital deployed for a financial return — a sponsorship arrangement that is really an investment is
 * accounted for as one, with a valuation, a return expectation and a beneficiary of the return. Calling
 * it a "sponsorship" does not change what it is.
 */
export type InvestmentSponsorship = {
  domain: "INVESTMENT";
  ownerCapability: "FINANCE_OS";
  id: string;
  investmentId: string;
  currency: string;
  amountMinor: number;
  expectedReturnBps: number;
  instrument: string;
  policyRef: string;
};

export type Sponsorship = EmployeeSponsorship | CommunitySponsorship | InvestmentSponsorship;

/**
 * Refuse a sponsorship whose declared domain does not match its owner.
 *
 * A community sponsorship that claims to be owned by HCM, or an employee-development sponsorship owned
 * by Finance, is a mis-classification with a reporting consequence: CSR spend would appear as staff
 * cost, or a benefit would appear as an investment. `assertSponsorshipClassified` catches it.
 */
export function assertSponsorshipClassified(sponsorship: Sponsorship): void {
  // The owner is read through a widened alias. The TYPE system already fixes each domain's owner, so
  // these comparisons are unreachable for a well-typed caller — which is exactly why they exist: the
  // guard is for the runtime value a caller may have produced with an `as` cast or from untyped row
  // data, and that value must be checked as strictly as any other input.
  const record = sponsorship as unknown as { domain: string; ownerCapability?: string };
  switch (record.domain) {
    case "EMPLOYEE_DEVELOPMENT":
      if (record.ownerCapability !== undefined && record.ownerCapability !== "HCM") {
        throw new FinanceArithmeticError("INVALID_RATIO", "An employee-development sponsorship is owned by HCM.", {
          ownerCapability: record.ownerCapability,
        });
      }
      break;
    case "COMMUNITY":
      if (record.ownerCapability !== "FOUNDATION") {
        throw new FinanceArithmeticError("INVALID_RATIO", "A community sponsorship must be owned by the Foundation capability.", {
          ownerCapability: record.ownerCapability ?? null,
        });
      }
      break;
    case "INVESTMENT":
      if (record.ownerCapability !== "FINANCE_OS") {
        throw new FinanceArithmeticError("INVALID_RATIO", "An investment sponsorship must be owned by FINANCE_OS.", {
          ownerCapability: record.ownerCapability ?? null,
        });
      }
      break;
    default:
      throw new FinanceArithmeticError("INVALID_RATIO", `Unknown sponsorship domain '${record.domain}'.`, { domain: record.domain });
  }
}

/**
 * Total HCM compensation cost for a set of entitlements.
 *
 * EXCLUDES receivable treatments: an employee loan or salary advance is not compensation cost, and a
 * total that included it would overstate staff cost while simultaneously creating an asset that the
 * report does not show. The two figures are returned separately and are never added.
 */
export function summariseCompensationCost(params: { entitlements: readonly EntitlementBase[] }): {
  currency: string;
  costMinor: number;
  receivableMinor: number;
  nonCashMinor: number;
  byKind: { kind: EntitlementKind; amountMinor: number; count: number }[];
  /** Entitlements that are not yet approved; included in nothing above. */
  pending: { id: string; amountMinor: number; status: EntitlementStatus }[];
  currencies: string[];
} {
  const currencies = [...new Set(params.entitlements.map((e) => e.currency.toUpperCase()))].sort();
  const currency = currencies.length === 1 ? currencies[0] : "";
  let cost = 0;
  let receivable = 0;
  let nonCash = 0;
  const byKind = new Map<EntitlementKind, { kind: EntitlementKind; amountMinor: number; count: number }>();
  const pending: { id: string; amountMinor: number; status: EntitlementStatus }[] = [];
  for (const e of params.entitlements) {
    if (e.status === "DRAFT" || e.status === "PENDING") {
      pending.push({ id: e.id, amountMinor: e.amountMinor, status: e.status });
      continue;
    }
    if (e.status === "REJECTED" || e.status === "CANCELLED") continue;
    if (RECEIVABLE_TREATMENTS.includes(e.financialTreatment)) {
      receivable += e.amountMinor;
      continue;
    }
    if (e.financialTreatment === "NON_CASH_RECOGNITION") {
      nonCash += e.amountMinor;
      continue;
    }
    cost += e.amountMinor;
    const bucket = byKind.get(e.kind) ?? { kind: e.kind, amountMinor: 0, count: 0 };
    bucket.amountMinor += e.amountMinor;
    bucket.count += 1;
    byKind.set(e.kind, bucket);
  }
  return {
    currency,
    costMinor: cost,
    receivableMinor: receivable,
    nonCashMinor: nonCash,
    byKind: [...byKind.values()].sort((a, b) => (a.kind < b.kind ? -1 : 1)),
    pending,
    currencies,
  };
}


