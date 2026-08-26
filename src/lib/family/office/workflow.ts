/**
 * BEYU OS — Family Office generic workflow engine.
 *
 * The universal governed lifecycle every office object follows:
 *
 *   DRAFT → SUBMITTED → VALIDATING → POLICY_CHECK → AUTHORITY_CHECK
 *   → APPROVAL_REQUIRED → APPROVED → EXECUTION_READY → EXECUTED → CLOSED
 *
 * Fail-closed stops (no automatic progression past them):
 *
 *   POLICY_CHECK   + unratified policy  → HALTED: POLICY_DECISION_REQUIRED
 *   AUTHORITY_CHECK + missing authority → HALTED: AUTHORITY_REQUIRED
 *
 * Rules:
 *   - steps advance ONE at a time, forward only; skipping is refused;
 *   - a halted workflow stays halted until an external governed act
 *     (ratification / authority) supplies what was missing — the engine
 *     never guesses;
 *   - EXECUTED requires an idempotency key + the execution reference owned
 *     by the executing system (Finance/legal); replaying the same key
 *     returns IDEMPOTENCY_REPLAY; the same key with a different execution
 *     reference is refused;
 *   - pure and deterministic: state in, new state out; no writes, no clocks
 *     (asOf is always supplied).
 */

import { familyError } from "../phase3/errors";
import { verifyAuthority, isAuthorityCurrent, type ActScope, type AuthorityContext, type VerifiedDelegation } from "./authority";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";
import { OFFICE_DOMAINS, isOfficeDomain } from "./types";

export const WORKFLOW_STEPS = [
  "DRAFT",
  "SUBMITTED",
  "VALIDATING",
  "POLICY_CHECK",
  "AUTHORITY_CHECK",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "EXECUTION_READY",
  "EXECUTED",
  "CLOSED",
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_HALTS = ["POLICY_DECISION_REQUIRED", "AUTHORITY_REQUIRED"] as const;
export type WorkflowHalt = (typeof WORKFLOW_HALTS)[number];

export interface StepRecord {
  step: WorkflowStep;
  at: string;
  actorUserId: string | null;
  reference: string | null;
  note: string | null;
}

export interface OfficeWorkflowState {
  workflowId: string;
  domain: (typeof OFFICE_DOMAINS)[number] | "FAMILY_GOVERNANCE" | "FAMILY_INSTITUTION";
  objectType: string;
  objectId: string;
  tenantId: string;
  currentStep: WorkflowStep;
  haltedBy: WorkflowHalt | null;
  haltedReason: string | null;
  history: readonly StepRecord[];
  idempotencyKey: string | null;
  executionReference: string | null;
  version: number;
}

export interface WorkflowPolicyRequirement {
  /** Policy keys + the specific parameter each requires, checked at POLICY_CHECK. */
  required: readonly { policyKey: string; field: string }[];
  /** Whether the workflow requires a proven authority at AUTHORITY_CHECK. */
  requiresAuthority: boolean;
}

export interface AdvanceRequest {
  toStep: WorkflowStep;
  asOf: string;
  actor: { actorType: "HUMAN" | "SERVICE" | "AI"; actorUserId: string };
  registry: PolicyRegistry;
  policyRequirement: WorkflowPolicyRequirement;
  authorityContext: AuthorityContext | null;
  delegations?: ReadonlyMap<string, VerifiedDelegation>;
  approvalRef?: string | null;
  idempotencyKey?: string | null;
  executionReference?: string | null;
  reference?: string | null;
}

export interface AdvanceResult {
  state: OfficeWorkflowState;
  outcome: "ADVANCED" | "HALTED" | "REPLAY" | "REFUSED";
  reason: string;
}

function stepIndex(s: WorkflowStep): number {
  return WORKFLOW_STEPS.indexOf(s);
}

export function createWorkflow(input: {
  workflowId: string;
  domain: OfficeWorkflowState["domain"];
  objectType: string;
  objectId: string;
  tenantId: string;
  createdAt: string;
  actorUserId: string;
}): OfficeWorkflowState {
  if (!isIsoDateLocal(input.createdAt)) throw new Error("createdAt must be an ISO date.");
  return {
    workflowId: input.workflowId,
    domain: input.domain,
    objectType: input.objectType,
    objectId: input.objectId,
    tenantId: input.tenantId,
    currentStep: "DRAFT",
    haltedBy: null,
    haltedReason: null,
    history: [{ step: "DRAFT", at: input.createdAt, actorUserId: input.actorUserId, reference: null, note: "workflow created (draft is inert — no effect)." }],
    idempotencyKey: null,
    executionReference: null,
    version: 1,
  };
}

function isIsoDateLocal(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function record(state: OfficeWorkflowState, r: StepRecord): OfficeWorkflowState {
  return { ...state, history: [...state.history, r], version: state.version + 1 };
}

/** The POLICY_CHECK gate: the exact unratified gaps, or none. Pure. */
function policyGateGaps(registry: PolicyRegistry, policyRequirement: WorkflowPolicyRequirement, asOf: string): string[] {
  const gaps: string[] = [];
  for (const { policyKey, field } of policyRequirement.required) {
    const outcome = resolvePolicy(registry, policyKey, asOf);
    if (outcome.state !== "RESOLVED") {
      gaps.push(`${policyKey}.${field}: ${outcome.state === "ARCHITECTURE_DECISION_REQUIRED" ? "configuration conflict" : "unratified"}.`);
    } else {
      const param = outcome.parameters.find((p) => p.key === field);
      if (param === undefined) gaps.push(`${policyKey}.${field}: resolved version has no ratified parameter.`);
    }
  }
  return gaps;
}

/** The AUTHORITY_CHECK gate: the exact failure, or null when authority verifies. Pure. */
function authorityGateFailure(req: AdvanceRequest, state: OfficeWorkflowState): string | null {
  if (!req.policyRequirement.requiresAuthority) return null;
  if (req.authorityContext === null) {
    return "No authority context supplied for a gated workflow.";
  }
  const act: ActScope = {
    tenantId: state.tenantId,
    legalEntityId: null,
    jurisdictionRef: null,
    action: `${state.domain.toLowerCase()}.authority_check`,
    objectId: state.objectId,
  };
  const result = verifyAuthority(req.authorityContext, act, req.delegations ?? new Map());
  if (!result.ok) return `${result.code}: ${result.reason}`;
  if (!isAuthorityCurrent(req.authorityContext, req.asOf)) {
    return `AUTHORITY_EXPIRED: the cited authority expired before ${req.asOf}.`;
  }
  if (req.authorityContext.actorType === "AI") {
    return "HUMAN_ACTOR_REQUIRED: AI may not authorize (FIR-017).";
  }
  return null;
}

/**
 * Advance the workflow to the NEXT step (`req.toStep` must be exactly one
 * step ahead). Runs the policy gate and authority gate at their steps.
 * Deterministic; returns the new state plus the outcome.
 */
export function advanceWorkflow(state: OfficeWorkflowState, req: AdvanceRequest): AdvanceResult {
  if (state.haltedBy !== null) {
    return { state, outcome: "REFUSED", reason: `Workflow is halted by ${state.haltedBy}: ${state.haltedReason} A halt is cleared only by the governed act that supplies what was missing — never by the engine.` };
  }
  // Idempotent replay detection: requesting EXECUTED again on an already
  // EXECUTED workflow is a replay check, not a step advance.
  if (state.currentStep === "EXECUTED" && req.toStep === "EXECUTED") {
    return execute(state, req);
  }
  const from = stepIndex(state.currentStep);
  const to = stepIndex(req.toStep);
  if (to !== from + 1) {
    if (to < from) return { state, outcome: "REFUSED", reason: `Workflows only move forward (requested ${req.toStep} from ${state.currentStep}).` };
    return { state, outcome: "REFUSED", reason: `No automatic progression: ${req.toStep} is not the next step after ${state.currentStep}.` };
  }
  if (state.currentStep === "EXECUTED" && req.toStep === "CLOSED") {
    return finish(state, req);
  }
  if (req.toStep === "EXECUTED") {
    return execute(state, req);
  }
  if (state.currentStep === "VALIDATING") {
    // Entering POLICY_CHECK: evaluate the policy gate NOW.
    const gaps = policyGateGaps(req.registry, req.policyRequirement, req.asOf);
    if (gaps.length > 0) {
      const halted = record(state, {
        step: "POLICY_CHECK",
        at: req.asOf,
        actorUserId: req.actor.actorUserId,
        reference: null,
        note: `POLICY DECISION REQUIRED: ${gaps.join(" ")}`,
      });
      return {
        state: { ...halted, currentStep: "POLICY_CHECK", haltedBy: "POLICY_DECISION_REQUIRED", haltedReason: gaps.join(" ") },
        outcome: "HALTED",
        reason: `POLICY DECISION REQUIRED: ${gaps.join(" ")}`,
      };
    }
  }
  if (state.currentStep === "POLICY_CHECK") {
    // Entering AUTHORITY_CHECK: verify authority NOW (when required).
    const failure = authorityGateFailure(req, state);
    if (failure !== null) {
      return haltAuthority(state, req, failure);
    }
  }
  if (req.toStep === "APPROVED") {
    if (req.approvalRef === null || req.approvalRef === undefined || req.approvalRef.trim() === "") {
      return {
        state,
        outcome: "REFUSED",
        reason: "APPROVED requires a human approval reference. An approval is a recorded human act — it is never inferred, and missing approval is not approval.",
      };
    }
    if (req.actor.actorType === "AI") {
      return { state, outcome: "REFUSED", reason: "An AI actor may not record an approval (FIR-017)." };
    }
  }
  const next = record(state, {
    step: req.toStep,
    at: req.asOf,
    actorUserId: req.actor.actorUserId,
    reference: req.reference ?? null,
    note: req.actor.actorType,
  });
  return { state: { ...next, currentStep: req.toStep }, outcome: "ADVANCED", reason: `Advanced to ${req.toStep}.` };
}

function haltAuthority(state: OfficeWorkflowState, req: AdvanceRequest, reason: string): AdvanceResult {
  const halted = record(state, {
    step: "AUTHORITY_CHECK",
    at: req.asOf,
    actorUserId: req.actor.actorUserId,
    reference: null,
    note: `AUTHORITY REQUIRED: ${reason}`,
  });
  return {
    state: { ...halted, currentStep: "AUTHORITY_CHECK", haltedBy: "AUTHORITY_REQUIRED", haltedReason: reason },
    outcome: "HALTED",
    reason,
  };
}

function execute(state: OfficeWorkflowState, req: AdvanceRequest): AdvanceResult {
  if (req.actor.actorType === "AI") {
    return { state, outcome: "REFUSED", reason: "Execution references are recorded by a human actor (FIR-017); AI is advisory." };
  }
  if (req.idempotencyKey === null || req.idempotencyKey === undefined || req.idempotencyKey.trim() === "") {
    return { state, outcome: "REFUSED", reason: "EXECUTED requires an idempotency key (canonical idempotencyRecords). Execution is never anonymous." };
  }
  if (req.executionReference === null || req.executionReference === undefined || req.executionReference.trim() === "") {
    return {
      state,
      outcome: "REFUSED",
      reason: "EXECUTED requires the execution reference owned by the executing system (Finance/legal). The Family Office records the reference; it does not execute.",
    };
  }
  // Duplicate-execution protection.
  if (state.currentStep === "EXECUTED") {
    if (state.idempotencyKey === req.idempotencyKey && state.executionReference === req.executionReference) {
      return { state, outcome: "REPLAY", reason: "IDEMPOTENCY_REPLAY: the identical execution was already recorded; the original reference stands." };
    }
    if (state.idempotencyKey === req.idempotencyKey) {
      return { state, outcome: "REFUSED", reason: "IDEMPOTENCY CONFLICT: this idempotency key is bound to a different execution reference. Reuse of an idempotency key for a different act is refused." };
    }
    return { state, outcome: "REFUSED", reason: "The workflow is already EXECUTED; a new act is a new workflow." };
  }
  const next = record(state, {
    step: "EXECUTED",
    at: req.asOf,
    actorUserId: req.actor.actorUserId,
    reference: req.executionReference,
    note: `idempotency:${req.idempotencyKey}`,
  });
  return {
    state: { ...next, currentStep: "EXECUTED", idempotencyKey: req.idempotencyKey, executionReference: req.executionReference },
    outcome: "ADVANCED",
    reason: `Executed under ${req.executionReference} (reference only — the executing system owns the effect).`,
  };
}

function finish(state: OfficeWorkflowState, req: AdvanceRequest): AdvanceResult {
  if (state.currentStep !== "EXECUTED") return { state, outcome: "REFUSED", reason: "Only an EXECUTED workflow can be CLOSED." };
  const next = record(state, { step: "CLOSED", at: req.asOf, actorUserId: req.actor.actorUserId, reference: null, note: "terminal" });
  return { state: { ...next, currentStep: "CLOSED" }, outcome: "ADVANCED", reason: "Closed (terminal)." };
}

/**
 * Re-clear a halted workflow after the missing governed input has been
 * supplied (e.g. the policy was ratified, or authority is now proven).
 * The workflow re-runs the same step's gate; it does NOT skip it.
 */
export function retryHaltedStep(state: OfficeWorkflowState, req: AdvanceRequest): AdvanceResult {
  if (state.haltedBy === null) return { state, outcome: "REFUSED", reason: "The workflow is not halted." };
  if (state.currentStep === "POLICY_CHECK" && state.haltedBy === "POLICY_DECISION_REQUIRED") {
    // RE-RUN the policy gate — never skip it.
    const gaps = policyGateGaps(req.registry, req.policyRequirement, req.asOf);
    if (gaps.length > 0) {
      const rerun = record(state, { step: "POLICY_CHECK", at: req.asOf, actorUserId: req.actor.actorUserId, reference: null, note: `POLICY DECISION REQUIRED (gate re-run): ${gaps.join(" ")}` });
      return {
        state: { ...rerun, currentStep: "POLICY_CHECK", haltedBy: "POLICY_DECISION_REQUIRED", haltedReason: gaps.join(" ") },
        outcome: "HALTED",
        reason: `POLICY DECISION REQUIRED: ${gaps.join(" ")}`,
      };
    }
    const resumed = { ...state, haltedBy: null, haltedReason: null };
    return advanceWorkflow(resumed, { ...req, toStep: "AUTHORITY_CHECK" });
  }
  if (state.currentStep === "AUTHORITY_CHECK" && state.haltedBy === "AUTHORITY_REQUIRED") {
    // RE-RUN the authority gate — never skip it.
    const failure = authorityGateFailure(req, state);
    if (failure !== null) {
      const rerun = record(state, { step: "AUTHORITY_CHECK", at: req.asOf, actorUserId: req.actor.actorUserId, reference: null, note: `AUTHORITY REQUIRED (gate re-run): ${failure}` });
      return {
        state: { ...rerun, currentStep: "AUTHORITY_CHECK", haltedBy: "AUTHORITY_REQUIRED", haltedReason: failure },
        outcome: "HALTED",
        reason: failure,
      };
    }
    const resumed = { ...state, haltedBy: null, haltedReason: null };
    return advanceWorkflow(resumed, { ...req, toStep: "APPROVAL_REQUIRED" });
  }
  return { state, outcome: "REFUSED", reason: `Halt ${state.haltedBy} at ${state.currentStep} cannot be retried with this request.` };
}

export function assertWorkflowNotHalted(state: OfficeWorkflowState): void {
  if (state.haltedBy !== null) {
    throw familyError(
      state.haltedBy === "POLICY_DECISION_REQUIRED" ? "POLICY_DECISION_REQUIRED" : "AUTHORITY_UNPROVEN",
      `Workflow ${state.workflowId} is halted: ${state.haltedReason}`,
      [],
      { workflowId: state.workflowId },
    );
  }
}
