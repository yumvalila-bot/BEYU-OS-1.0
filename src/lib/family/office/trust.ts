/**
 * BEYU OS — Family Office: trust / trustee engineering.
 *
 * The trust RAILS: references to trusts and their instruments, trustee
 * references and appointments, removal/replacement, decisions, and
 * clause structures.
 *
 * What is engineered: the MECHANISM — typed references, the appointment
 * chain, and clause structures with a configurable clause-type
 * vocabulary (Spendthrift, No-Contest, Discretionary Distribution, Trustee
 * Removal/Replacement, …).
 *
 * What is NOT decided here (legal policy — ratification/instrument
 * territory):
 *   - legal wording;
 *   - jurisdictional effect;
 *   - trustee eligibility (a RULE MECHANISM exists; its values are
 *     ratified);
 *   - distribution authority;
 *   - enforceability.
 *
 * A clause whose legal effect is not determined by a ratified reference
 * (legalEffectReference = null) is INERT: it structures the instrument,
 * it does not enact it.
 */

import { familyError } from "../phase3/errors";
import { isIsoDate, type EffectivePeriod } from "./types";
import type { OfficeOutcome } from "./types";

/** Reference to a trust (legal entity + instruments). */
export interface TrustReference {
  trustRef: string;
  /** Legal attribution (the trust's entity) — attribution, not control. */
  legalEntityRef: string | null;
  instrumentRefs: readonly string[];
  tenantId: string;
  /** A trust is always jurisdictional: explicit, never inferred. */
  jurisdictionRef: string;
}

export function assertTrustReference(t: TrustReference): void {
  if (typeof t.jurisdictionRef !== "string" || t.jurisdictionRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A trust reference requires an explicit jurisdiction reference — never inferred.", []);
  }
  if (t.instrumentRefs.length === 0) {
    throw familyError("EVIDENCE_INSUFFICIENT", "A trust reference must cite at least one instrument.", []);
  }
}

export interface TrustInstrument {
  instrumentRef: string;
  trustRef: string;
  version: number;
  /** Canonical document (checksum-bound). */
  documentRef: string;
  checksum: string;
  jurisdictionRef: string;
  status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
  supersededByRef: string | null;
  period: EffectivePeriod | null;
}

export interface TrustVersion {
  trustRef: string;
  version: number;
  instrumentRefs: readonly string[];
  supersededByRef: string | null;
}

/**
 * Trustee eligibility MECHANISM: the same ratified-rule lookup pattern as
 * beneficiary eligibility. No rule → INDETERMINATE. Genealogy, role, or
 * family membership never confers trustee eligibility.
 */
export interface TrusteeEligibilityRule {
  ruleRef: string;
  policyKey: string;
  contextMap: Readonly<Record<string, "ELIGIBLE" | "NOT_ELIGIBLE">>;
}

export function evaluateTrusteeEligibility(
  rule: TrusteeEligibilityRule | null,
  contextKey: string,
): OfficeOutcome<{ result: "ELIGIBLE" | "NOT_ELIGIBLE" | "INDETERMINATE"; basis: string }> {
  if (rule === null) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: "trustee.eligibility",
      reason: "No ratified trustee eligibility rule. Absence of a rule is not eligibility — a missing trustee rule never becomes authority.",
    };
  }
  const outcome = rule.contextMap[contextKey];
  if (outcome === undefined) {
    return { state: "POLICY_DECISION_REQUIRED", policyKey: rule.policyKey, reason: `Rule ${rule.ruleRef} has no determination for context "${contextKey}".` };
  }
  return { state: "RESOLVED", value: { result: outcome, basis: `rule ${rule.ruleRef}, context ${contextKey}` } };
}

export interface TrusteeReference {
  trusteeRef: string;
  partyRef: string;
  trustRef: string;
  /** The appointment record — a trustee reference without an appointment is bare. */
  appointmentRef: string | null;
  status: "PROPOSED" | "APPOINTED" | "RESIGNED" | "REMOVED" | "REPLACED";
  tenantId: string;
}

export interface TrusteeAppointment {
  appointmentRef: string;
  trusteeRef: string;
  trustRef: string;
  /** The appointing authority (instrument clause / governing body ref). */
  appointingAuthorityRef: string;
  instrumentClauseRef: string;
  period: EffectivePeriod;
  status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
}

export function assertTrusteeAppointment(a: TrusteeAppointment): void {
  if (typeof a.appointingAuthorityRef !== "string" || a.appointingAuthorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A trustee appointment must cite its appointing authority. Appointment is never self-conferred.", []);
  }
  if (typeof a.instrumentClauseRef !== "string" || a.instrumentClauseRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A trustee appointment must cite the instrument clause conferring it.", []);
  }
  if (!isIsoDate(a.period.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Appointment period must start at an ISO date.", []);
}

export interface TrusteeRemoval {
  removalRef: string;
  trusteeRef: string;
  trustRef: string;
  /** The ratified basis for removal (instrument clause / resolution ref). */
  removalBasisRef: string;
  authorityRef: string;
  effectiveFrom: string;
  tenantId: string;
}

export function assertTrusteeRemoval(r: TrusteeRemoval): void {
  if (typeof r.removalBasisRef !== "string" || r.removalBasisRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A trustee removal requires its ratified basis reference.", []);
  }
  if (!isIsoDate(r.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Removal effectiveFrom must be an ISO date.", []);
}

export interface TrusteeReplacement {
  replacementRef: string;
  trustRef: string;
  priorTrusteeRef: string;
  successorTrusteeRef: string;
  authorityRef: string;
  effectiveFrom: string;
  tenantId: string;
}

export interface TrusteeDecision {
  decisionRef: string;
  trusteeRef: string;
  trustRef: string;
  decision: string;
  /** The authority under which the trustee acts (instrument clause ref). */
  authorityRef: string;
  decidedAt: string;
  tenantId: string;
}

/** Configurable clause-type vocabulary (structural tags — no legal effect encoded). */
export const TRUST_CLAUSE_TYPES = [
  "SPENDTHRIFT_PROVISION",
  "NO_CONTEST_PROVISION",
  "DISCRETIONARY_DISTRIBUTION_CLAUSE",
  "TRUSTEE_REMOVAL_REPLACEMENT_CLAUSE",
  "OTHER",
] as const;
export type TrustClauseType = (typeof TRUST_CLAUSE_TYPES)[number];

/**
 * A trust clause. The clause TYPE is a structural tag; the clause's LEGAL
 * EFFECT is determined only by its legalEffectReference (a ratified
 * jurisdictional ruling reference). Null = inert.
 */
export interface TrustClause {
  clauseRef: string;
  instrumentRef: string;
  clauseType: TrustClauseType;
  /** Ratified reference determining the clause's jurisdictional effect (null = undetermined/inert). */
  legalEffectReference: string | null;
  version: number;
}

export function assertTrustClause(c: TrustClause): void {
  if (!(TRUST_CLAUSE_TYPES as readonly string[]).includes(c.clauseType)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown clause type "${c.clauseType}".`, []);
  }
  if (typeof c.legalEffectReference !== "string" && c.legalEffectReference !== null) {
    throw familyError("AUTHORITY_UNPROVEN", "legalEffectReference must be a reference or null (no effect is assumed).", []);
  }
}
