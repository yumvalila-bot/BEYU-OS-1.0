/**
 * BEYU OS — FAMILY GOVERNANCE & DECISION ENGINE (pure).
 *
 * Every material decision follows:
 *
 *   REQUEST → VALIDATE → CHECK POLICY → CHECK AUTHORITY → CHECK CONFLICT →
 *   CHECK RISK → APPROVE → EXECUTE → RECORD → AUDIT → MONITOR
 *
 * ============================ FOUR INVARIANTS =============================
 *
 * 1. NO MATERIAL DECISION WITHOUT AUDITABILITY. RECORD and AUDIT are steps in
 *    the chain, not afterthoughts. A decision that cannot be recorded and audited
 *    cannot be made.
 * 2. AN AI ACTOR STOPS AT CHECK_RISK. Noelia may request, validate, compare
 *    against policy, evaluate authority, detect conflicts and assess risk. It may
 *    never APPROVE or EXECUTE. `LAST_AI_PERMITTED_STEP` is the hard boundary.
 * 3. MATERIALITY IS NEVER DEFAULTED. If no materiality threshold has been
 *    ratified, every decision is treated as MATERIAL and a policy decision is
 *    raised. Treating an unthresholded decision as immaterial is how material
 *    decisions escape governance.
 * 4. THE CHAIN HALTS. A step after a failure is NOT_REACHED, never PASSED.
 */
import {
  DECISION_GATE_STEPS,
  LAST_AI_PERMITTED_STEP,
  absentFields,
  assertHumanAuthority,
  isPresent,
  type DecisionGateStep,
  type FamilyActorType,
  type PolicyDecisionRequirement,
} from "./model";

export const DECISION_GATE_VERSION = "family-decision-gate-1.0.0";

export type GateStepState = "PASSED" | "FAILED" | "NOT_REACHED" | "REQUIRES_HUMAN";

export type GateStepResult = {
  step: DecisionGateStep;
  state: GateStepState;
  reason: string;
  reference: string | null;
};

export type DecisionRequest = {
  decisionId: string;
  /** What is being decided, in one sentence. */
  matter: string | null;
  domain: string;
  requestedBy: string | null;
  actorType: FamilyActorType;
  /** Amount in minor units where the decision carries a financial consequence. Null where it does not. */
  amountMinor: number | null;
  currency: string | null;

  /** Ratified materiality threshold in minor units. Null means none was supplied. */
  materialityThresholdMinor: number | null;

  validation: { complete: boolean; missingFields: string[] } | null;
  policyReference: string | null;
  authorityReference: string | null;
  conflictAssessment: { cleared: boolean; reference: string | null } | null;
  riskAssessment: { withinAppetite: boolean; score: number; reference: string | null } | null;
  approval: { approvedBy: string | null; reference: string | null } | null;
  /** Finance OS / domain record reference once executed. */
  executionReference: string | null;
  recordReference: string | null;
  auditReference: string | null;
  monitoringPlan: string | null;
};

export type DecisionGateAssessment = {
  engineVersion: string;
  decisionId: string;
  /** True when the decision carries a financial consequence at or above the threshold, or when no threshold exists. */
  material: boolean;
  /** Why the materiality conclusion is what it is. */
  materialityReason: string;
  steps: GateStepResult[];
  blockingStep: DecisionGateStep | null;
  /** The furthest step legitimately reached. */
  stepReached: DecisionGateStep;
  /** True when every step through MONITOR is satisfied. */
  complete: boolean;
  /** True when an AI actor was stopped before APPROVE. */
  aiBoundaryApplied: boolean;
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

function stepRank(step: DecisionGateStep): number {
  return DECISION_GATE_STEPS.indexOf(step);
}

/**
 * Run the decision gate.
 *
 * The gate is a pure evaluation: it never records a decision, never approves one
 * and never executes anything. It answers "how far has this decision legitimately
 * got, and what stops it?"
 */
export function evaluateDecisionGate(request: DecisionRequest): DecisionGateAssessment {
  const steps: GateStepResult[] = [];
  let halted = false;
  let aiBoundaryApplied = false;
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  const push = (
    step: DecisionGateStep,
    state: GateStepState,
    reason: string,
    reference: string | null = null,
  ): void => {
    steps.push({ step, state, reason, reference });
    if (state === "FAILED") halted = true;
  };

  // --- materiality --------------------------------------------------------
  let material: boolean;
  let materialityReason: string;

  if (request.amountMinor === null) {
    // A decision with no financial consequence is material if it changes
    // governance, policy, ownership or succession. Absent a ratified rule we
    // treat it as material: the conservative answer.
    material = true;
    materialityReason =
      "No financial amount was supplied. Treated as material because a non-financial decision can change governance, policy, ownership or succession.";
  } else if (request.materialityThresholdMinor === null) {
    material = true;
    materialityReason =
      "No materiality threshold has been ratified. Treating the decision as material rather than assuming it is immaterial.";
    policyDecisionRequired = {
      code: `FAM-PD-MATERIALITY-${request.decisionId}`,
      issue: "What is the materiality threshold for family institution decisions?",
      domain: "INSTITUTION",
      options: [
        "Set a single monetary threshold across all family institution decisions.",
        "Set thresholds per domain (loans, distributions, investments, appointments).",
        "Set thresholds per pool and per jurisdiction.",
        "Define materiality by consequence rather than amount.",
      ],
      assumptions: ["No ratified materiality threshold was supplied."],
      legalImplications: "Thresholds interact with delegated authority limits and with Trust instrument consent thresholds.",
      taxImplications: "None directly.",
      financialImplications: "Without a threshold, either every decision needs Council time or decisions escape governance.",
      risk: "Governance failure in both directions: overload or under-governance.",
      decisionAuthority: "Family Council, recorded in the Family Constitution.",
      status: "OPEN",
      decision: null,
      decisionReference: null,
      effectiveDate: null,
    };
  } else if (request.amountMinor >= request.materialityThresholdMinor) {
    material = true;
    materialityReason = `Amount ${request.amountMinor} minor units is at or above the ratified threshold of ${request.materialityThresholdMinor}.`;
  } else {
    material = false;
    materialityReason = `Amount ${request.amountMinor} minor units is below the ratified threshold of ${request.materialityThresholdMinor}.`;
  }

  // --- 1. REQUEST ---------------------------------------------------------
  const requestMissing = absentFields({ matter: request.matter, domain: request.domain, requestedBy: request.requestedBy });
  if (requestMissing.length > 0) {
    push("REQUEST", "FAILED", `Request incomplete — missing: ${requestMissing.join(", ")}.`, null);
  } else {
    push("REQUEST", "PASSED", `${request.matter} (${request.domain}), requested by ${request.requestedBy}.`, null);
  }

  // --- 2. VALIDATE --------------------------------------------------------
  if (halted) push("VALIDATE", "NOT_REACHED", "The request step failed.", null);
  else if (!request.validation) push("VALIDATE", "FAILED", "No validation was performed.", null);
  else if (!request.validation.complete) {
    push("VALIDATE", "FAILED", `Validation failed — missing: ${request.validation.missingFields.join(", ")}.`, null);
  } else push("VALIDATE", "PASSED", "All required fields present and well-formed.", null);

  // --- 3. CHECK POLICY ----------------------------------------------------
  if (halted) push("CHECK_POLICY", "NOT_REACHED", "An earlier step failed.", null);
  else if (!isPresent(request.policyReference)) {
    push("CHECK_POLICY", "FAILED", "No governing policy reference. A decision is taken under policy, never by discretion alone.", null);
  } else push("CHECK_POLICY", "PASSED", `Governed by ${request.policyReference}.`, request.policyReference);

  // --- 4. CHECK AUTHORITY -------------------------------------------------
  if (halted) push("CHECK_AUTHORITY", "NOT_REACHED", "An earlier step failed.", null);
  else if (!isPresent(request.authorityReference)) {
    push("CHECK_AUTHORITY", "FAILED", "No authority reference. Governance determines authority; it is never assumed from seniority or family status.", null);
  } else push("CHECK_AUTHORITY", "PASSED", `Authority: ${request.authorityReference}.`, request.authorityReference);

  // --- 5. CHECK CONFLICT --------------------------------------------------
  if (halted) push("CHECK_CONFLICT", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.conflictAssessment) push("CHECK_CONFLICT", "FAILED", "No conflict assessment was performed.", null);
  else if (!request.conflictAssessment.cleared) {
    push("CHECK_CONFLICT", "FAILED", "A declared conflict has not cleared the conflict workflow.", request.conflictAssessment.reference);
  } else push("CHECK_CONFLICT", "PASSED", "No uncleared conflict of interest.", request.conflictAssessment.reference);

  // --- 6. CHECK RISK ------------------------------------------------------
  if (halted) push("CHECK_RISK", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.riskAssessment) push("CHECK_RISK", "FAILED", "No risk assessment was performed.", null);
  else if (!request.riskAssessment.withinAppetite) {
    push("CHECK_RISK", "FAILED", `Risk score ${request.riskAssessment.score} is outside the recorded appetite.`, request.riskAssessment.reference);
  } else push("CHECK_RISK", "PASSED", `Risk score ${request.riskAssessment.score} within appetite.`, request.riskAssessment.reference);

  // --- AI BOUNDARY --------------------------------------------------------
  //
  // Everything above is analysis. Everything below confers or exercises
  // authority. An AI actor stops here, and the stop is recorded rather than
  // silent, so the audit trail shows the boundary was reached and held.
  if (request.actorType === "AI" && !halted) {
    aiBoundaryApplied = true;
  }

  // --- 7. APPROVE ---------------------------------------------------------
  if (halted) push("APPROVE", "NOT_REACHED", "An earlier step failed.", null);
  else if (aiBoundaryApplied) {
    push(
      "APPROVE",
      "REQUIRES_HUMAN",
      `An AI actor may reach ${LAST_AI_PERMITTED_STEP} but may never approve. Noelia's output at this point is a recommendation requiring an accountable human decision.`,
      null,
    );
  } else if (!request.approval || !isPresent(request.approval.approvedBy) || !isPresent(request.approval.reference)) {
    push("APPROVE", "FAILED", "No approval by a named authority with a recorded reference.", null);
  } else push("APPROVE", "PASSED", `Approved by ${request.approval.approvedBy}.`, request.approval.reference);

  // --- 8. EXECUTE ---------------------------------------------------------
  if (halted || aiBoundaryApplied) {
    push("EXECUTE", "NOT_REACHED", halted ? "An earlier step failed." : "Approval has not been given by a human.", null);
  } else if (!isPresent(request.executionReference)) {
    push("EXECUTE", "REQUIRES_HUMAN", "Approved but not yet executed. Execution is a separate, accountable act.", null);
  } else push("EXECUTE", "PASSED", `Executed under ${request.executionReference}.`, request.executionReference);

  // --- 9. RECORD ----------------------------------------------------------
  if (!isPresent(request.recordReference)) {
    push("RECORD", "NOT_REACHED", "No decision record exists yet. Every material decision must be recorded.", null);
  } else push("RECORD", "PASSED", `Recorded as ${request.recordReference}.`, request.recordReference);

  // --- 10. AUDIT ----------------------------------------------------------
  if (!isPresent(request.auditReference)) {
    push("AUDIT", "NOT_REACHED", "No audit record. A material decision without auditability cannot be made.", null);
  } else push("AUDIT", "PASSED", `Audit record ${request.auditReference}.`, request.auditReference);

  // --- 11. MONITOR --------------------------------------------------------
  if (!isPresent(request.monitoringPlan)) {
    push("MONITOR", "NOT_REACHED", "No monitoring plan. Post-decision monitoring is part of the decision.", null);
  } else push("MONITOR", "PASSED", `Monitoring: ${request.monitoringPlan}.`, null);

  const blockingStep = steps.find((s) => s.state === "FAILED")?.step ?? null;
  const stepReached =
    steps.filter((s) => s.state === "PASSED").slice(-1)[0]?.step ?? "REQUEST";
  const complete =
    blockingStep === null &&
    !aiBoundaryApplied &&
    steps.every((s) => s.state === "PASSED");

  return {
    engineVersion: DECISION_GATE_VERSION,
    decisionId: request.decisionId,
    material,
    materialityReason,
    steps,
    blockingStep,
    stepReached: complete ? "MONITOR" : stepReached,
    complete,
    aiBoundaryApplied,
    policyDecisionRequired,
  };
}

/**
 * Emergency authority.
 *
 * Emergency authority is a real capability and a real risk, so it is modelled
 * explicitly rather than left to improvisation: it requires a declared emergency,
 * a named authoriser, a time limit, and retrospective ratification. An emergency
 * decision with no ratification deadline is an ordinary decision that skipped
 * governance.
 */
export type EmergencyAuthority = {
  emergencyId: string;
  declaredBy: string;
  declaration: string | null;
  authorisedBy: string | null;
  authorisedScope: string | null;
  expiresAt: string | null;
  ratificationDeadline: string | null;
  ratifiedByReference: string | null;
  actorType: FamilyActorType;
};

export type EmergencyAssessment = {
  engineVersion: string;
  emergencyId: string;
  valid: boolean;
  retrospectiveRatificationRequired: boolean;
  overdue: boolean;
  blockers: string[];
};

export function assessEmergencyAuthority(
  emergency: EmergencyAuthority,
  asOf: string,
): EmergencyAssessment {
  const blockers: string[] = [];
  if (emergency.actorType === "AI") {
    blockers.push("An AI actor may not declare or exercise emergency authority.");
  }
  if (!isPresent(emergency.declaration)) blockers.push("No emergency declaration recorded.");
  if (!isPresent(emergency.authorisedBy)) blockers.push("No named authoriser.");
  if (!isPresent(emergency.authorisedScope)) blockers.push("No scope limit on the emergency authority.");
  if (!isPresent(emergency.expiresAt)) blockers.push("No expiry. Emergency authority must be time-limited.");
  if (!isPresent(emergency.ratificationDeadline)) {
    blockers.push("No ratification deadline. Retrospective ratification is what distinguishes emergency authority from ungoverned action.");
  }

  const overdue =
    isPresent(emergency.ratificationDeadline) &&
    !isPresent(emergency.ratifiedByReference) &&
    (emergency.ratificationDeadline as string) < asOf;
  if (overdue) {
    blockers.push(
      `Retrospective ratification was due on ${emergency.ratificationDeadline} and has not occurred as at ${asOf}. The action must be reported to the governing body.`,
    );
  }

  return {
    engineVersion: DECISION_GATE_VERSION,
    emergencyId: emergency.emergencyId,
    valid: blockers.length === 0,
    retrospectiveRatificationRequired: !isPresent(emergency.ratifiedByReference),
    overdue,
    blockers,
  };
}

/* ------------------------------------------------------------------ */
/* Delegated authority                                                 */
/* ------------------------------------------------------------------ */

export type DelegatedAuthority = {
  delegationId: string;
  fromRole: string;
  toRole: string;
  scope: string[];
  /** Minor-unit ceiling. Null means no ceiling, which is refused. */
  ceilingMinor: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Whether the delegating role may itself sub-delegate. */
  subDelegationPermitted: boolean;
  delegable: boolean;
};

export type DelegationAssessment = {
  engineVersion: string;
  delegationId: string;
  valid: boolean;
  blockers: string[];
};

/**
 * Delegated authority.
 *
 * A delegation with no ceiling, no scope or no end date is a transfer of
 * authority rather than a delegation, and is refused. Sub-delegation is refused
 * unless the original instrument permits it — otherwise authority diffuses until
 * nobody can say who holds it.
 */
export function assessDelegation(delegation: DelegatedAuthority, asOf: string): DelegationAssessment {
  const blockers: string[] = [];
  if (delegation.ceilingMinor === null) blockers.push("No monetary ceiling. An unbounded delegation is a transfer of authority, not a delegation.");
  if (delegation.ceilingMinor !== null && delegation.ceilingMinor <= 0) blockers.push("Ceiling must be positive.");
  if (delegation.scope.length === 0) blockers.push("No scope. A delegation must say what it covers.");
  if (!isPresent(delegation.effectiveTo)) blockers.push("No end date. Delegated authority must expire.");
  if (isPresent(delegation.effectiveTo) && (delegation.effectiveTo as string) < asOf) blockers.push("The delegation has expired.");
  if (delegation.effectiveFrom > asOf) blockers.push("The delegation is not yet effective.");
  if (delegation.delegable && !delegation.subDelegationPermitted) {
    blockers.push("Sub-delegation is not permitted by the delegating authority.");
  }
  if (!isPresent(delegation.fromRole) || !isPresent(delegation.toRole)) blockers.push("Both delegating and receiving roles must be recorded.");

  return {
    engineVersion: DECISION_GATE_VERSION,
    delegationId: delegation.delegationId,
    valid: blockers.length === 0,
    blockers,
  };
}

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

/** Approval and execution may never be performed by an AI actor. */
export function assertDecisionAuthorityIsHuman(
  actorType: FamilyActorType,
  operation: "approve" | "execute" | "record",
): void {
  assertHumanAuthority(actorType, `${operation} a material family institution decision`);
}

export function stepRankOf(step: DecisionGateStep): number {
  return stepRank(step);
}
