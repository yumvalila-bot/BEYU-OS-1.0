/**
 * BEYU OS — Family Office: wealth management + wealth planning engineering.
 *
 * The wealth RAILS: references to wealth (pointing at the FINANCE OS — the
 * sole financial truth), planning engagements, planning assessments,
 * lifecycle observations, and the mechanics that validate them.
 *
 * HARD BOUNDARIES:
 *   - the Family Office NEVER stores a balance, holding, valuation,
 *     allocation, or income figure; every "wealth" record is a REFERENCE
 *     to the Finance OS;
 *   - planning is structured (engagements, assessments, observations) but
 *     carries no recommendation values — an advisory output (Noelia/HIVE)
 *     is a classified advisory reference, never an executable
 *     determination;
 *   - a lifecycle observation is INPUT TO REVIEW — it never automatically
 *     changes beneficiary status, entitlement, or authority
 *     (`assertObservationIsNotAuthority`).
 */

import { familyError, FamilyError } from "../phase3/errors";
import { assertNoFinancialState } from "../phase3/contracts";
import { isIsoDate, type EffectivePeriod } from "./types";

/** Reference to wealth as held in the Finance OS (the truth). */
export interface WealthReference {
  wealthRef: string;
  /** The Finance OS reference for this wealth (balance/holding lives there). */
  financeWealthRef: string;
  partyRef: string;
  legalEntityRef: string | null;
  tenantId: string;
}

export function assertWealthReference(w: WealthReference): void {
  if (typeof w.financeWealthRef !== "string" || w.financeWealthRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "A wealth reference points at the Finance OS. The office never stores wealth state.", []);
  }
  assertNoFinancialState(w, "WealthReference");
}

export const PLANNING_TYPES = ["LIFECYCLE", "SUCCESSION", "EDUCATION", "PHILANTHROPY", "OTHER"] as const;
export type PlanningType = (typeof PLANNING_TYPES)[number];

export interface PlanningEngagement {
  planningRef: string;
  partyRef: string;
  planningType: PlanningType;
  advisorRef: string;
  status: "PROPOSED" | "ACTIVE" | "COMPLETED" | "TERMINATED";
  period: EffectivePeriod | null;
  tenantId: string;
}

export function assertPlanningEngagement(p: PlanningEngagement): void {
  if (!(PLANNING_TYPES as readonly string[]).includes(p.planningType)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown planning type "${p.planningType}".`, []);
  }
  if (typeof p.advisorRef !== "string" || p.advisorRef.trim() === "") {
    throw familyError("EVIDENCE_INSUFFICIENT", "A planning engagement names its advisor (reference; advisory capacity only).", []);
  }
  if (p.period !== null && !isIsoDate(p.period.effectiveFrom)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Planning period must start at an ISO date.", []);
  }
  assertNoFinancialState(p, "PlanningEngagement");
}

/**
 * A planning assessment. If it originates from Noelia/HIVE it is an
 * ADVISORY output: classified, labelled advisory, and never executable —
 * no field of this record can grant authority or create a determination.
 */
export interface PlanningAssessment {
  assessmentRef: string;
  planningRef: string;
  /** Present when the output is AI-originated (advisory only, FIR-017). */
  advisoryOutputRef: string | null;
  /** The human who reviewed/accepted the advisory output (or null if unreviewed). */
  reviewedBy: string | null;
  summary: string;
  status: "DRAFT" | "ADVISORY" | "REVIEWED" | "ACCEPTED" | "REJECTED";
  assessedAt: string;
  tenantId: string;
}

export function assertPlanningAssessment(a: PlanningAssessment): void {
  if (!isIsoDate(a.assessedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Planning assessment must carry an assessedAt ISO date.", []);
  if (a.advisoryOutputRef !== null) {
    if (a.status === "ACCEPTED" && (a.reviewedBy === null || a.reviewedBy.trim() === "")) {
      throw familyError("HUMAN_ACTOR_REQUIRED", "An ACCEPTED advisory assessment requires a human reviewer. AI output is advisory only; it becomes a record only through human acceptance.", []);
    }
  }
  assertNoFinancialState(a, "PlanningAssessment");
}

export const LIFECYCLE_EVENT_TYPES = ["BIRTH", "DEATH", "MARRIAGE", "DIVORCE", "EDUCATION_MILESTONE", "HEALTH_EVENT", "NATIONALITY_CHANGE", "OTHER"] as const;
export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export interface LifecycleObservation {
  observationRef: string;
  partyRef: string;
  eventType: LifecycleEventType;
  observedAt: string;
  /** Evidence document (checksum-bound) the observation is based on. */
  evidenceRef: string;
  tenantId: string;
}

export function assertLifecycleObservation(o: LifecycleObservation): void {
  if (!(LIFECYCLE_EVENT_TYPES as readonly string[]).includes(o.eventType)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown lifecycle event type "${o.eventType}".`, []);
  }
  if (!isIsoDate(o.observedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Lifecycle observation must carry an observedAt ISO date.", []);
  if (typeof o.evidenceRef !== "string" || o.evidenceRef.trim() === "") {
    throw familyError("EVIDENCE_INSUFFICIENT", "A lifecycle observation is evidence-based; it names its evidence document.", []);
  }
}

/**
 * The no-automatic-effect guarantee: a lifecycle observation CHANGES
 * NOTHING by itself. It is input to a governed review (beneficiary
 * review, trustee decision, governance decision). This function is the
 * machine-checkable statement of that boundary — it always returns the
 * same no-op result and exists so the workflow can assert it at a gate.
 */
export function assertObservationIsNotAuthority(observation: LifecycleObservation): { changesAuthority: false; changesEntitlement: false; changesBeneficiaryStatus: false } {
  assertLifecycleObservation(observation);
  return { changesAuthority: false, changesEntitlement: false, changesBeneficiaryStatus: false };
}

export interface WealthPlanningProposal {
  proposalRef: string;
  planningType: PlanningType;
  partyRef: string;
  description: string;
  policyRefs: readonly string[];
  evidenceRefs: readonly string[];
  authorityRef: string | null;
  status: "DRAFT" | "PROPOSED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  tenantId: string;
}

export function assertWealthPlanningProposal(p: WealthPlanningProposal): void {
  if (p.status === "APPROVED" && (p.authorityRef === null || p.authorityRef.trim() === "")) {
    throw familyError("AUTHORITY_UNPROVEN", "An APPROVED wealth planning proposal must carry its authority reference.", []);
  }
  assertNoFinancialState(p, "WealthPlanningProposal");
}

/**
 * Validate that a set of wealth-domain records is finance-boundary clean.
 * Runs the canonical FIR-018 assertion against each; throws the first
 * violation (the exact forbidden key named).
 */
export function assertWealthDomainFinanceClean(records: readonly object[]): void {
  for (const r of records) assertNoFinancialState(r, "wealth-domain record");
}

/** Re-export for callers who want the error class without importing phase3. */
export { FamilyError };
