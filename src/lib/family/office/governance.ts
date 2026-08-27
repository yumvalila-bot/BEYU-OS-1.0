/**
 * BEYU OS — Family Office: family governance engineering.
 *
 * The governance RAILS: bodies, memberships, roles, mandates, decisions,
 * resolutions, meetings, agendas, voting events, quorum evaluation and
 * approvals — as typed structures plus the deterministic evaluation
 * MECHANICS that operate on them.
 *
 * What is engineered:
 *   - the shapes and their validation;
 *   - `evaluateQuorum` / `evaluateVote` — mechanics that evaluate a
 *     gathering/vote AGAINST the ratified policy values (quorum, majority)
 *     pulled from the policy registry;
 *   - approval records — a HUMAN approval decision with its authority
 *     reference (evidence), never an AI one.
 *
 * What is NOT engineered (policy — configuration only after ratification):
 *   - membership criteria;
 *   - quorum values;
 *   - voting percentages;
 *   - election method;
 *   - appointment/removal authority;
 *   - governance thresholds.
 *
 * A body with no ratified mandate ref is INERT: its decisions carry no
 * force until the mandate exists. Quorum/vote evaluation without a ratified
 * value is INDETERMINATE + POLICY_DECISION_REQUIRED, never a guess.
 */

import { familyError } from "../phase3/errors";
import { GOVERNANCE_COMMITTEES, type GovernanceCommittee } from "../model";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";
import { isIsoDate, type EffectivePeriod, type OfficeScope } from "./types";
import type { OfficeOutcome } from "./types";

export function isGovernanceCommittee(value: string): value is GovernanceCommittee {
  return (GOVERNANCE_COMMITTEES as readonly string[]).includes(value);
}

/**
 * A governance body (council, board-like family body, committee).
 * `committeeType` reuses the canonical committee vocabulary. `mandateRef`
 * is the reference to the ratified mandate (instrument/resolution) — null
 * means the body holds NO ratified mandate, and nothing it does is
 * effective.
 */
export interface FamilyGovernanceBody {
  bodyRef: string;
  name: string;
  committeeType: GovernanceCommittee | "COUNCIL" | "BOARD";
  /** Ratified mandate reference (null = unmandated = inert). */
  mandateRef: string | null;
  scope: OfficeScope;
}

export function assertFamilyGovernanceBody(b: FamilyGovernanceBody): void {
  if (typeof b.bodyRef !== "string" || b.bodyRef.trim() === "") throw familyError("AUTHORITY_UNPROVEN", "bodyRef is required.", []);
  if (b.committeeType !== "COUNCIL" && b.committeeType !== "BOARD" && !isGovernanceCommittee(b.committeeType)) {
    throw familyError("AUTHORITY_UNPROVEN", `Unknown body type "${b.committeeType}". The canonical vocabulary is closed.`, []);
  }
}

export interface FamilyOfficeCommittee {
  committeeRef: string;
  bodyRef: string;
  committeeType: GovernanceCommittee;
  scope: OfficeScope;
}

/**
 * A seat in a body. Membership is a REFERENCE + period — the criteria for
 * who may hold a seat are policy (FIR-008/021), not encoded here.
 */
export interface GovernanceMembership {
  membershipRef: string;
  bodyRef: string;
  memberRef: string;
  seatRef: string;
  /** Ratified mandate reference covering this seat (null = none recorded). */
  mandateRef: string | null;
  period: EffectivePeriod;
  status: "ACTIVE" | "VACANT" | "TERMINATED";
  tenantId: string;
}

export function assertGovernanceMembership(m: GovernanceMembership): void {
  if (!isIsoDate(m.period.effectiveFrom) || (m.period.effectiveTo !== null && !isIsoDate(m.period.effectiveTo))) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Membership period must be ISO dates.", []);
  }
}

/**
 * A governance role. A role NAME confers nothing: `authorityRef` is the
 * only path to authority, and it must be a ratified reference.
 */
export interface GovernanceRole {
  roleRef: string;
  name: string;
  bodyRef: string;
  authorityRef: string | null;
}

export interface Mandate {
  mandateRef: string;
  bodyRef: string;
  /** The instrument conferring the mandate (canonical instrument ref). */
  instrumentRef: string;
  /** The ratifying resolution (null where the instrument alone suffices —
   *  determined by ratified policy, not here). */
  resolutionRef: string | null;
  period: EffectivePeriod;
}

/** Canonical decision/resolution status vocabulary (enums.ts decisionStatusEnum). */
export const GOVERNANCE_DECISION_STATUSES = ["DRAFT", "TABLED", "VOTED", "APPROVED", "REJECTED", "DEFERRED", "DEADLOCKED"] as const;
export type GovernanceDecisionStatus = (typeof GOVERNANCE_DECISION_STATUSES)[number];

export interface FamilyDecision {
  decisionRef: string;
  bodyRef: string;
  matter: string;
  policyRefs: readonly string[];
  evidenceRefs: readonly string[];
  status: GovernanceDecisionStatus;
  /** The approving authority reference (present only for APPROVED). */
  authorityRef: string | null;
  createdAt: string;
  tenantId: string;
}

export function assertFamilyDecision(d: FamilyDecision): void {
  if (!isIsoDate(d.createdAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Decision.createdAt must be an ISO date.", []);
  if (d.status === "APPROVED" && (d.authorityRef === null || d.authorityRef.trim() === "")) {
    throw familyError("AUTHORITY_UNPROVEN", "An APPROVED decision must carry its authority reference. Approval without proven authority is refused.", []);
  }
}

export interface FamilyResolution {
  resolutionRef: string;
  bodyRef: string;
  decisionRef: string | null;
  status: GovernanceDecisionStatus;
  authorityRef: string | null;
  period: EffectivePeriod | null;
  tenantId: string;
}

export interface FamilyMeeting {
  meetingRef: string;
  bodyRef: string;
  scheduledAt: string;
  agendaRef: string | null;
  tenantId: string;
}

export interface Agenda {
  agendaRef: string;
  itemRefs: readonly string[];
  bodyRef: string;
}

export interface VotingEvent {
  votingEventRef: string;
  decisionRef: string;
  /** Evidence: who voted (references). */
  voterRefs: readonly string[];
  /** Recorded outcome (evidence when a vote was held). */
  recordedOutcome: { for: number; against: number; abstain: number } | null;
  heldAt: string | null;
}

/**
 * Quorum evaluation MECHANIC: compares present voters to the RATED quorum
 * from the policy registry. No ratified quorum → INDETERMINATE +
 * POLICY_DECISION_REQUIRED. The quorum value is configuration, never a
 * default (no 0.66, no "majority of members", nothing).
 */
export function evaluateQuorum(
  registry: PolicyRegistry,
  policyKey: string,
  presentVoters: number,
  asOf: string,
): OfficeOutcome<{ met: boolean; required: number; present: number }> {
  const outcome = resolvePolicy<{ quorum: number }>(registry, policyKey, asOf);
  if (outcome.state !== "RESOLVED") {
    return outcome.state === "ARCHITECTURE_DECISION_REQUIRED"
      ? { state: "ARCHITECTURE_DECISION_REQUIRED", policyKey, reason: outcome.reason }
      : { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `No ratified quorum value: ${outcome.reason}` };
  }
  const q = outcome.parameters.find((p) => p.key === "quorum");
  if (q === undefined || typeof q.value !== "number") {
    return { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `Resolved ${policyKey} has no numeric "quorum" parameter. Missing is not a default.` };
  }
  return { state: "RESOLVED", value: { met: presentVoters >= q.value, required: q.value, present: presentVoters } };
}

/**
 * Vote evaluation MECHANIC: the passing threshold is the ratified policy
 * value. Without it → INDETERMINATE. The mechanic performs arithmetic on
 * the RATED value; it never chooses one.
 */
export function evaluateVote(
  registry: PolicyRegistry,
  policyKey: string,
  event: VotingEvent,
  asOf: string,
): OfficeOutcome<{ passed: boolean; for: number; against: number; abstain: number; threshold: number }> {
  if (event.recordedOutcome === null) {
    return { state: "DENIED", code: "EVIDENCE_INSUFFICIENT", reason: "No recorded vote outcome. A vote that was not recorded has no result." };
  }
  const outcome = resolvePolicy<{ approvalThreshold: number }>(registry, policyKey, asOf);
  if (outcome.state !== "RESOLVED") {
    return outcome.state === "ARCHITECTURE_DECISION_REQUIRED"
      ? { state: "ARCHITECTURE_DECISION_REQUIRED", policyKey, reason: outcome.reason }
      : { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `No ratified approval threshold: ${outcome.reason}` };
  }
  const t = outcome.parameters.find((p) => p.key === "approvalThreshold");
  if (t === undefined || typeof t.value !== "number") {
    return { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `Resolved ${policyKey} has no numeric "approvalThreshold" parameter.` };
  }
  const { for: f, against, abstain } = event.recordedOutcome;
  const cast = f + against;
  const passed = cast > 0 && f / cast >= t.value;
  return { state: "RESOLVED", value: { passed, for: f, against, abstain, threshold: t.value } };
}

export interface ApprovalRequest {
  approvalRef: string;
  decisionRef: string;
  requestedFrom: string;
  bodyRef: string;
  createdAt: string;
  tenantId: string;
}

/**
 * A human approval decision. The approver is a named human; the authority
 * reference proves their authority; AI is structurally impossible here
 * (validated + refused at the workflow layer as well).
 */
export interface ApprovalDecision {
  approvalRef: string;
  requestId: string;
  approverUserId: string;
  decision: "APPROVED" | "REJECTED";
  authorityRef: string;
  decidedAt: string;
  tenantId: string;
}

export function assertApprovalDecision(a: ApprovalDecision): void {
  if (typeof a.approverUserId !== "string" || a.approverUserId.trim() === "") {
    throw familyError("HUMAN_ACTOR_REQUIRED", "An approval decision names its human approver.", []);
  }
  if (a.approverUserId.toUpperCase() === "NOELIA" || a.approverUserId.toUpperCase() === "AI") {
    throw familyError("HUMAN_ACTOR_REQUIRED", "An AI actor cannot record an approval (FIR-017).", []);
  }
  if (typeof a.authorityRef !== "string" || a.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "An approval decision must cite the authority under which it is made.", []);
  }
  if (!isIsoDate(a.decidedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Approval.decidedAt must be an ISO date.", []);
}
