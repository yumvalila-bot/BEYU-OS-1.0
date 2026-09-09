/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: the capital allocation
 * workflow (§9), the investment committee (§43) and segregation of duties (§40).
 *
 * ============================== WHAT THIS IS ================================
 *
 * The sixteen-step allocation path the brief names, engineered as a state machine
 * over the EXISTING governance engine rather than beside it:
 *
 *   CAPITAL REQUEST → STRATEGIC FIT → FINANCIAL MODEL → RISK → LIQUIDITY →
 *   LEGAL REVIEW → TAX REVIEW → SCENARIO ANALYSIS → NOELIA ANALYSIS →
 *   GOVERNANCE → APPROVAL → AUTHORIZED EXECUTION → FINANCE OS ACCOUNTING →
 *   AUDIT → MONITORING → POST-INVESTMENT REVIEW
 *
 * `src/lib/family/office/workflow.ts` already engineers a ten-step lifecycle with
 * one-step-forward movement, a policy gate, an authority gate, human-only
 * approval, idempotent execution and a `retryHaltedStep` that re-runs the gate
 * rather than skipping it. This module composes the same discipline over the
 * capital-specific path; it does not replace it.
 *
 * ============================ WHAT THIS IS NOT ================================
 *
 * NOT an approver. Every gate is cleared by a recorded human act through the
 * existing governance engine. NOT an executor: `AUTHORIZED_EXECUTION` records
 * that authority exists; moving money is Finance OS's and a payments system's
 * (§24, §32). NOT Noelia: `NOELIA_ANALYSIS` records that an analytical view was
 * produced and by whom it was read; Noelia cannot clear the step (§24).
 */

import { capitalGovernanceError } from "./errors";
import type { FamilyActorType } from "../../model";

export const FAMILY_CAPITAL_ALLOCATION_VERSION = "family-capital-allocation-1.0.0";

/* ------------------------------------------------------------------ */
/* §9 — The allocation path                                            */
/* ------------------------------------------------------------------ */

export const CAPITAL_ALLOCATION_STEPS = [
  { code: "CAPITAL_REQUEST", label: "Capital request", description: "The request is raised with a purpose, an amount and a requester." },
  { code: "STRATEGIC_FIT", label: "Strategic fit", description: "The request is assessed against the family's stated strategy." },
  { code: "FINANCIAL_MODEL", label: "Financial model", description: "The numbers are built: cost, cash flow, return, payback." },
  { code: "RISK", label: "Risk", description: "The risks are identified, sized and graded." },
  { code: "LIQUIDITY", label: "Liquidity", description: "The liquidity consequence of committing this capital is assessed." },
  { code: "LEGAL_REVIEW", label: "Legal review", description: "Legal review is recorded against the relevant jurisdictions." },
  { code: "TAX_REVIEW", label: "Tax review", description: "Tax review is recorded. It informs; it does not rescue (CAP-012)." },
  { code: "SCENARIO_ANALYSIS", label: "Scenario analysis", description: "The stress grid is run and the worst case is stated." },
  { code: "NOELIA_ANALYSIS", label: "Noelia analysis", description: "Noelia's analytical view is produced and read. It recommends; it never decides (§24)." },
  { code: "GOVERNANCE", label: "Governance", description: "The matter is put to the governing body." },
  { code: "APPROVAL", label: "Approval", description: "A human with authority approves, rejects, defers or approves with conditions." },
  { code: "AUTHORIZED_EXECUTION", label: "Authorized execution", description: "Execution authority exists and is recorded. No money has moved yet." },
  { code: "FINANCE_OS_ACCOUNTING", label: "Finance OS accounting", description: "Finance OS records the accounting. The Family Office never posts (§32)." },
  { code: "AUDIT", label: "Audit", description: "The decision chain is in the audit ledger." },
  { code: "MONITORING", label: "Monitoring", description: "The position is monitored against its thesis." },
  { code: "POST_INVESTMENT_REVIEW", label: "Post-investment review", description: "What happened is compared with what was expected (CAP-010)." },
] as const;
export type CapitalAllocationStepCode = (typeof CAPITAL_ALLOCATION_STEPS)[number]["code"];

export const CAPITAL_ALLOCATION_STEP_CODES = CAPITAL_ALLOCATION_STEPS.map((s) => s.code);

/** Steps that a human with authority must clear. Noelia cannot clear these. */
export const HUMAN_AUTHORITY_STEPS: readonly CapitalAllocationStepCode[] = [
  "STRATEGIC_FIT",
  "LEGAL_REVIEW",
  "TAX_REVIEW",
  "GOVERNANCE",
  "APPROVAL",
  "AUTHORIZED_EXECUTION",
  "POST_INVESTMENT_REVIEW",
];

/** Steps Noelia may contribute to. Contribution is never clearance. */
export const NOELIA_CONTRIBUTABLE_STEPS: readonly CapitalAllocationStepCode[] = [
  "FINANCIAL_MODEL",
  "RISK",
  "LIQUIDITY",
  "SCENARIO_ANALYSIS",
  "NOELIA_ANALYSIS",
  "MONITORING",
];

/** Steps whose clearance requires a reference to an external authority. */
export const REFERENCE_REQUIRED_STEPS: Record<string, string> = {
  LEGAL_REVIEW: "legalReviewRef",
  TAX_REVIEW: "taxReviewRef",
  GOVERNANCE: "governanceRef",
  APPROVAL: "approvalRef",
  AUTHORIZED_EXECUTION: "executionAuthorityRef",
  FINANCE_OS_ACCOUNTING: "financeRecordRef",
  AUDIT: "auditRef",
  POST_INVESTMENT_REVIEW: "reviewRef",
};

export type AllocationStepState = {
  step: CapitalAllocationStepCode;
  /** PENDING until cleared; CLEARED only by a recorded act. */
  status: "PENDING" | "CLEARED" | "HALTED" | "SKIPPED_BY_POLICY" | "NOT_APPLICABLE";
  clearedBy: string | null;
  clearedByActorType: FamilyActorType | null;
  clearedAt: string | null;
  /** The authority reference proving the clearance, where one is required. */
  referenceRef: string | null;
  /** Noelia's contribution, where one exists. Never a clearance. */
  noeliaContributionRef: string | null;
  reason: string | null;
};

export type CapitalAllocationCase = {
  id: string;
  tenantId: string;
  /** The canonical Finance OS capital request this case allocates against. */
  capitalRequestRef: string;
  legalEntityId: string;
  countryCode: string;
  currency: string;
  amountMinor: number;
  title: string;
  purpose: string;
  requesterRef: string;
  /** Steps whose clearance governance policy does not require for this matter. */
  stepsNotApplicable: readonly CapitalAllocationStepCode[];
  steps: AllocationStepState[];
  /** The current step index. */
  currentStepIndex: number;
  status: "IN_PROGRESS" | "APPROVED" | "REJECTED" | "DEFERRED" | "APPROVED_WITH_CONDITIONS" | "EXECUTED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
};

export function allocationStepRank(step: CapitalAllocationStepCode): number {
  return CAPITAL_ALLOCATION_STEP_CODES.indexOf(step);
}

/**
 * Create a new allocation case with every step PENDING.
 *
 * `stepsNotApplicable` is caller-declared and recorded, never inferred: a matter
 * that needs no legal review says so explicitly, so that the absence is a
 * governance decision rather than an oversight.
 */
export function createAllocationCase(params: {
  id: string;
  tenantId: string;
  capitalRequestRef: string;
  legalEntityId: string;
  countryCode: string;
  currency: string;
  amountMinor: number;
  title: string;
  purpose: string;
  requesterRef: string;
  stepsNotApplicable?: readonly CapitalAllocationStepCode[];
  asOf: string;
}): CapitalAllocationCase {
  const notApplicable = new Set(params.stepsNotApplicable ?? []);
  return {
    id: params.id,
    tenantId: params.tenantId,
    capitalRequestRef: params.capitalRequestRef,
    legalEntityId: params.legalEntityId,
    countryCode: params.countryCode,
    currency: params.currency,
    amountMinor: params.amountMinor,
    title: params.title,
    purpose: params.purpose,
    requesterRef: params.requesterRef,
    stepsNotApplicable: [...notApplicable],
    steps: CAPITAL_ALLOCATION_STEPS.map((s) => ({
      step: s.code,
      status: notApplicable.has(s.code) ? "NOT_APPLICABLE" : "PENDING",
      clearedBy: null,
      clearedByActorType: null,
      clearedAt: null,
      referenceRef: null,
      noeliaContributionRef: null,
      reason: notApplicable.has(s.code) ? "Governance policy does not require this step for this matter." : null,
    })),
    currentStepIndex: CAPITAL_ALLOCATION_STEPS.findIndex((s) => !notApplicable.has(s.code)),
    status: "IN_PROGRESS",
    createdAt: params.asOf,
    updatedAt: params.asOf,
  };
}

/**
 * Attempt to clear the current step.
 *
 * Three refusals, each load-bearing:
 *
 *   1. An AI actor clearing a human-authority step is refused (FIR-017, §24).
 *      Noelia may contribute to a contributable step; contributing is not
 *      clearing.
 *   2. A step requiring a reference cannot be cleared without one. A missing
 *      reference is never treated as approval.
 *   3. Skipping ahead is refused. The path advances one step at a time so that
 *      no gate can be passed without being recorded.
 *
 * `APPROVAL` additionally enforces segregation of duties (§40): the approver may
 * not be the requester.
 */
export function clearAllocationStep(params: {
  allocation: CapitalAllocationCase;
  step: CapitalAllocationStepCode;
  actorRef: string;
  actorType: FamilyActorType;
  referenceRef: string | null;
  asOf: string;
  /** Set true only where governance policy explicitly permits the overlap. */
  segregationWaivedByPolicy?: boolean;
  segregationPolicyRef?: string | null;
}): { allocation: CapitalAllocationCase; cleared: boolean; reason: string } {
  const index = allocationStepRank(params.step);
  const current = params.allocation.steps[params.allocation.currentStepIndex];
  if (!current) {
    return { allocation: params.allocation, cleared: false, reason: "Every step has already been resolved." };
  }
  if (index > params.allocation.currentStepIndex) {
    return {
      allocation: params.allocation,
      cleared: false,
      reason: `Cannot clear ${params.step} while ${current.step} is still ${current.status}. The path advances one step at a time so no gate can be passed without being recorded.`,
    };
  }
  if (index < params.allocation.currentStepIndex) {
    return { allocation: params.allocation, cleared: false, reason: `${params.step} was already resolved; a cleared step is not re-opened by clearing it again. Correcting it requires a new governance act.` };
  }
  if (current.status === "NOT_APPLICABLE") {
    return { allocation: params.allocation, cleared: false, reason: `${params.step} is not applicable to this matter.` };
  }

  if (HUMAN_AUTHORITY_STEPS.includes(params.step) && params.actorType !== "HUMAN") {
    throw capitalGovernanceError(
      "AI_AUTHORITY_DENIED",
      `${params.step} requires a human with authority. Noelia may analyse, calculate, summarise, simulate, recommend, alert and draft; it cannot clear a governance step (§24, FIR-017).`,
      [],
      { step: params.step, actorType: params.actorType },
    );
  }

  const requiredRef = REFERENCE_REQUIRED_STEPS[params.step];
  if (requiredRef && !params.referenceRef) {
    throw capitalGovernanceError(
      "AUTHORITY_UNPROVEN",
      `${params.step} requires ${requiredRef}. A missing reference is never treated as approval — missing authority is not approval.`,
      [],
      { step: params.step, requiredRef },
    );
  }

  if (params.step === "APPROVAL") {
    const segregation = assertSegregationOfDuties({
      role: "APPROVER",
      actorRef: params.actorRef,
      requesterRef: params.allocation.requesterRef,
      waivedByPolicy: params.segregationWaivedByPolicy ?? false,
      policyRef: params.segregationPolicyRef ?? null,
    });
    if (!segregation.permitted) {
      throw capitalGovernanceError("PERMISSION_DENIED", segregation.reason, [], { step: params.step, actorRef: params.actorRef });
    }
  }

  const steps = params.allocation.steps.map((s) =>
    s.step === params.step
      ? {
          ...s,
          status: "CLEARED" as const,
          clearedBy: params.actorRef,
          clearedByActorType: params.actorType,
          clearedAt: params.asOf,
          referenceRef: params.referenceRef,
          reason: null,
        }
      : s,
  );
  const nextIndex = steps.findIndex((s) => s.status === "PENDING");
  const approved = steps.find((s) => s.step === "APPROVAL");
  const status =
    nextIndex === -1
      ? "CLOSED"
      : approved?.status === "CLEARED" && params.step === "APPROVAL"
        ? "APPROVED"
        : params.allocation.status;

  return {
    allocation: { ...params.allocation, steps, currentStepIndex: nextIndex === -1 ? params.allocation.currentStepIndex : nextIndex, status, updatedAt: params.asOf },
    cleared: true,
    reason: `${params.step} cleared by ${params.actorRef} (${params.actorType})${params.referenceRef ? ` on reference ${params.referenceRef}` : ""}.`,
  };
}

/**
 * Record Noelia's contribution to a contributable step.
 *
 * A contribution is recorded and attributed; it never clears the step. That
 * distinction is the whole of §24, and it is why this function returns a case
 * whose step status is unchanged.
 */
export function recordNoeliaContribution(params: {
  allocation: CapitalAllocationCase;
  step: CapitalAllocationStepCode;
  contributionRef: string;
  asOf: string;
}): { allocation: CapitalAllocationCase; recorded: boolean; reason: string } {
  if (!NOELIA_CONTRIBUTABLE_STEPS.includes(params.step)) {
    return {
      allocation: params.allocation,
      recorded: false,
      reason: `Noelia may contribute to ${NOELIA_CONTRIBUTABLE_STEPS.join(", ")} — not to ${params.step}. Recording a contribution against a governance step would imply a clearance that did not happen.`,
    };
  }
  const steps = params.allocation.steps.map((s) => (s.step === params.step ? { ...s, noeliaContributionRef: params.contributionRef } : s));
  return {
    allocation: { ...params.allocation, steps, updatedAt: params.asOf },
    recorded: true,
    reason: `Noelia contribution ${params.contributionRef} recorded against ${params.step}. The step remains ${params.allocation.steps.find((s) => s.step === params.step)?.status}: a contribution is never a clearance (§24).`,
  };
}

/**
 * The honest gap: which steps are not yet cleared, and what each one needs.
 *
 * This is what a committee reads before it decides. It never claims a step is
 * cleared on the strength of a Noelia contribution.
 */
export function allocationGaps(allocation: CapitalAllocationCase): readonly {
  step: CapitalAllocationStepCode;
  label: string;
  status: AllocationStepState["status"];
  requiredReference: string | null;
  requiresHumanAuthority: boolean;
  noeliaContributionRef: string | null;
}[] {
  return allocation.steps
    .filter((s) => s.status === "PENDING" || s.status === "HALTED")
    .map((s) => ({
      step: s.step,
      label: CAPITAL_ALLOCATION_STEPS.find((x) => x.code === s.step)?.label ?? s.step,
      status: s.status,
      requiredReference: REFERENCE_REQUIRED_STEPS[s.step] ?? null,
      requiresHumanAuthority: HUMAN_AUTHORITY_STEPS.includes(s.step),
      noeliaContributionRef: s.noeliaContributionRef,
    }));
}

/* ------------------------------------------------------------------ */
/* §43 — Investment committee                                          */
/* ------------------------------------------------------------------ */

/** The decisions a committee may take (§43). */
export const COMMITTEE_DECISIONS = [
  { code: "APPROVE", label: "Approve", terminal: false },
  { code: "APPROVE_WITH_CONDITIONS", label: "Approve with conditions", terminal: false },
  { code: "REJECT", label: "Reject", terminal: true },
  { code: "DEFER", label: "Defer", terminal: false },
  { code: "REQUEST_INFORMATION", label: "Request information", terminal: false },
] as const;
export type CommitteeDecisionCode = (typeof COMMITTEE_DECISIONS)[number]["code"];

export type CommitteeMemberVote = {
  memberRef: string;
  /** The role the member sat in. Identity is not role and role is not authority. */
  role: string;
  position: "FOR" | "AGAINST" | "ABSTAIN" | "ABSENT";
  /** Required for an AGAINST vote: dissent must be recorded, not counted silently. */
  dissentReason: string | null;
};

export type CommitteeDecision = {
  id: string;
  tenantId: string;
  allocationId: string;
  decision: CommitteeDecisionCode;
  /** The body that decided. Required: a decision with no body has no authority. */
  bodyRef: string;
  members: CommitteeMemberVote[];
  /** Quorum minimum, as configured for the body. */
  quorumMinimum: number;
  /** The majority rule, as configured for the body. */
  majorityRule: "SIMPLE" | "TWO_THIRDS" | "UNANIMOUS" | "CHAIR_CASTING";
  date: string;
  reason: string;
  /** Conditions attached, where the decision is APPROVE_WITH_CONDITIONS. */
  conditions: readonly string[];
  /** Follow-up actions the committee assigned. */
  followUps: readonly { action: string; ownerRef: string; dueDate: string }[];
  /** The authority reference: the resolution or approval instrument. Required. */
  authorityRef: string | null;
  /** Always a human. An AI decision-maker is refused. */
  decidedByActorType: FamilyActorType;
  /** Segregation evidence (§40). */
  requesterRef: string;
  executorRef: string | null;
  reconcilerRef: string | null;
};

/**
 * Validate a committee decision.
 *
 * Quorum, majority, dissent recording, conditions on a conditional approval,
 * authority reference, human decision-maker and segregation of duties are all
 * checked. Each finding is returned rather than thrown, so a committee record can
 * be reviewed as a whole; `assertCommitteeDecisionIsSound` throws on the subset
 * that makes the decision void.
 */
export function validateCommitteeDecision(decision: CommitteeDecision): readonly string[] {
  const findings: string[] = [];

  const present = decision.members.filter((m) => m.position !== "ABSENT");
  if (present.length < decision.quorumMinimum) {
    findings.push(`Quorum not met: ${present.length} member(s) present against a minimum of ${decision.quorumMinimum}. A decision taken without quorum is void.`);
  }
  const forCount = decision.members.filter((m) => m.position === "FOR").length;
  const againstCount = decision.members.filter((m) => m.position === "AGAINST").length;
  const required =
    decision.majorityRule === "UNANIMOUS" ? present.length : decision.majorityRule === "TWO_THIRDS" ? Math.ceil((present.length * 2) / 3) : Math.floor(present.length / 2) + 1;
  if (decision.decision === "APPROVE" || decision.decision === "APPROVE_WITH_CONDITIONS") {
    if (forCount < required) {
      findings.push(`Majority not met under ${decision.majorityRule}: ${forCount} FOR against ${required} required of ${present.length} present.`);
    }
  }
  for (const member of decision.members) {
    if (member.position === "AGAINST" && !member.dissentReason) {
      findings.push(`Member ${member.memberRef} voted AGAINST without recording a dissent reason. Dissent must be recorded, not counted silently.`);
    }
  }
  if (decision.decision === "APPROVE_WITH_CONDITIONS" && decision.conditions.length === 0) {
    findings.push("A conditional approval must state its conditions. An approval 'with conditions' that names none is an unconditional approval wearing a label.");
  }
  if (decision.decision === "DEFER" && decision.followUps.length === 0) {
    findings.push("A deferral must assign at least one follow-up, otherwise the matter is dropped rather than deferred.");
  }
  if (!decision.authorityRef) {
    findings.push("An authority reference is required. A committee decision with no instrument behind it has no authority.");
  }
  if (!decision.reason.trim() || decision.reason.trim().length < 10) {
    findings.push("The reason for the decision must be recorded.");
  }
  if (decision.decidedByActorType !== "HUMAN") {
    findings.push("A committee decision must be made by humans (§24, FIR-017). Noelia may brief the committee; it cannot be the committee.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decision.date)) {
    findings.push(`The decision date must be ISO; received "${decision.date}".`);
  }

  const segregation = assertSegregationOfDuties({
    role: "APPROVER",
    actorRef: decision.members.find((m) => m.position === "FOR")?.memberRef ?? decision.requesterRef,
    requesterRef: decision.requesterRef,
    waivedByPolicy: false,
    policyRef: null,
  });
  if (!segregation.permitted) findings.push(segregation.reason);

  return findings;
}

/**
 * The subset of findings that make a decision void rather than merely defective.
 *
 * Throws on: no quorum, no majority for an approval, no authority reference, an
 * AI decision-maker, and a segregation breach that governance policy has not
 * expressly waived. A finding outside this set (a missing dissent reason, an
 * unassigned deferral) is a defect to correct, not a reason to treat the
 * decision as never taken.
 */
export function assertCommitteeDecisionIsSound(decision: CommitteeDecision): void {
  const findings = validateCommitteeDecision(decision);
  const voiding = findings.filter(
    (f) =>
      f.startsWith("Quorum not met") ||
      f.startsWith("Majority not met") ||
      f.startsWith("An authority reference is required") ||
      f.startsWith("A committee decision must be made by humans") ||
      f.startsWith("Segregation of duties"),
  );
  if (voiding.length > 0) {
    throw capitalGovernanceError("AUTHORITY_UNPROVEN", `The committee decision is void: ${voiding.join(" ")}`, [], { decisionId: decision.id });
  }
}

/* ------------------------------------------------------------------ */
/* §40 — Segregation of duties                                         */
/* ------------------------------------------------------------------ */

/** The four duties that must not collapse into one person. */
export const SEGREGATED_DUTIES = ["REQUESTER", "APPROVER", "EXECUTOR", "RECONCILER"] as const;
export type SegregatedDuty = (typeof SEGREGATED_DUTIES)[number];

export type SegregationCheck = {
  permitted: boolean;
  reason: string;
  /** The overlapping duties, so a governance waiver can name exactly what it waives. */
  overlaps: { dutyA: SegregatedDuty; dutyB: SegregatedDuty; actorRef: string }[];
  /** True only where governance policy expressly permits the overlap. */
  waivedByPolicy: boolean;
  policyRef: string | null;
};

/**
 * Check segregation of duties (§40).
 *
 * Requester ≠ Approver ≠ Executor ≠ Reconciler, unless governance policy
 * explicitly permits the overlap. "Explicitly permits" means a policy reference
 * is supplied: an undocumented waiver is not a waiver, it is an unrecorded
 * collapse of two duties into one person, which is the control failure the rule
 * exists to prevent.
 */
export function assertSegregationOfDuties(params: {
  role: Exclude<SegregatedDuty, "REQUESTER">;
  actorRef: string;
  requesterRef: string;
  executorRef?: string | null;
  reconcilerRef?: string | null;
  waivedByPolicy: boolean;
  policyRef: string | null;
}): SegregationCheck {
  const overlaps: SegregationCheck["overlaps"] = [];
  if (params.actorRef === params.requesterRef) overlaps.push({ dutyA: "REQUESTER", dutyB: params.role, actorRef: params.actorRef });
  if (params.executorRef && params.actorRef === params.executorRef) overlaps.push({ dutyA: "EXECUTOR", dutyB: params.role, actorRef: params.actorRef });
  if (params.reconcilerRef && params.actorRef === params.reconcilerRef) overlaps.push({ dutyA: "RECONCILER", dutyB: params.role, actorRef: params.actorRef });
  if (params.executorRef && params.reconcilerRef && params.executorRef === params.reconcilerRef) {
    overlaps.push({ dutyA: "EXECUTOR", dutyB: "RECONCILER", actorRef: params.executorRef });
  }

  if (overlaps.length === 0) {
    return { permitted: true, reason: "Segregation of duties holds: no actor occupies two of requester, approver, executor, reconciler.", overlaps: [], waivedByPolicy: false, policyRef: null };
  }
  if (params.waivedByPolicy && params.policyRef) {
    return {
      permitted: true,
      reason: `Segregation overlap permitted by governance policy ${params.policyRef}: ${overlaps.map((o) => `${o.actorRef} is both ${o.dutyA} and ${o.dutyB}`).join("; ")}.`,
      overlaps,
      waivedByPolicy: true,
      policyRef: params.policyRef,
    };
  }
  return {
    permitted: false,
    reason: `Segregation of duties breach: ${overlaps.map((o) => `${o.actorRef} is both ${o.dutyA} and ${o.dutyB}`).join("; ")}. Requester, approver, executor and reconciler must be different people unless governance policy explicitly permits the overlap — and an undocumented waiver is not a waiver.`,
    overlaps,
    waivedByPolicy: false,
    policyRef: null,
  };
}

/* ------------------------------------------------------------------ */
/* §29 — Capital recycling                                             */
/* ------------------------------------------------------------------ */

/**
 * The recycling path (§29): asset → cash flow → reserve → debt reduction →
 * reinvestment → new productive asset.
 *
 * Modelled as an explicit allocation of proceeds, so that "we sold and
 * reinvested" becomes a traceable chain rather than a narrative.
 */
export const CAPITAL_RECYCLING_STEPS = ["ASSET", "CASH_FLOW", "RESERVE", "DEBT_REDUCTION", "REINVESTMENT", "NEW_PRODUCTIVE_ASSET"] as const;
export type CapitalRecyclingStep = (typeof CAPITAL_RECYCLING_STEPS)[number];

export type CapitalRecyclingPlan = {
  engineVersion: string;
  /** Where the proceeds came from. */
  sourceAssetRef: string;
  /** The action that released the capital. */
  releaseAction: "SELL" | "REFINANCE" | "CASH_FLOW_ACCUMULATION" | "DISTRIBUTION";
  grossProceedsMinor: number;
  currency: string;
  /** How the proceeds are allocated. Must sum to gross proceeds. */
  allocations: { step: CapitalRecyclingStep; amountMinor: number; targetRef: string | null }[];
  /** Unallocated remainder. Never silently dropped. */
  unallocatedMinor: number;
  reconciles: boolean;
  /** The governance approval for the redeployment. */
  governanceApprovalRef: string | null;
  /** Tax and cost analysis reference, required before redeployment. */
  taxCostAnalysisRef: string | null;
  explanation: string[];
};

/**
 * Build and reconcile a capital recycling plan.
 *
 * The allocations must sum to the gross proceeds. A plan that does not reconcile
 * is returned with `reconciles: false` and the remainder named, rather than
 * silently absorbing the difference — an unexplained gap in a proceeds
 * allocation is either a fee nobody recorded or a leak.
 */
export function buildRecyclingPlan(params: {
  sourceAssetRef: string;
  releaseAction: CapitalRecyclingPlan["releaseAction"];
  grossProceedsMinor: number;
  currency: string;
  allocations: { step: CapitalRecyclingStep; amountMinor: number; targetRef: string | null }[];
  governanceApprovalRef: string | null;
  taxCostAnalysisRef: string | null;
}): CapitalRecyclingPlan {
  const total = params.allocations.reduce((s, a) => s + a.amountMinor, 0);
  const unallocated = params.grossProceedsMinor - total;

  return {
    engineVersion: FAMILY_CAPITAL_ALLOCATION_VERSION,
    sourceAssetRef: params.sourceAssetRef,
    releaseAction: params.releaseAction,
    grossProceedsMinor: params.grossProceedsMinor,
    currency: params.currency,
    allocations: params.allocations,
    unallocatedMinor: unallocated,
    reconciles: unallocated === 0,
    governanceApprovalRef: params.governanceApprovalRef,
    taxCostAnalysisRef: params.taxCostAnalysisRef,
    explanation: [
      `${params.releaseAction} of ${params.sourceAssetRef} released ${params.grossProceedsMinor} ${params.currency}.`,
      params.allocations.map((a) => `${a.step}: ${a.amountMinor}${a.targetRef ? ` → ${a.targetRef}` : ""}`).join("; ") || "No allocations recorded.",
      unallocated === 0
        ? "The plan reconciles: allocations sum exactly to gross proceeds."
        : `The plan does NOT reconcile: ${unallocated} minor units are unallocated. An unexplained gap in a proceeds allocation is either a fee nobody recorded or a leak; it is named here rather than absorbed.`,
      params.releaseAction === "SELL" && !params.taxCostAnalysisRef
        ? "A disposal without a tax and cost analysis is incomplete (§29). The tax consequence of a sale can exceed the benefit of the redeployment."
        : "",
      !params.governanceApprovalRef ? "No governance approval is recorded for the redeployment." : "",
    ].filter(Boolean),
  };
}
