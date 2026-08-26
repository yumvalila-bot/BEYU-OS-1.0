/**
 * BEYU OS — Family Office: family education engineering.
 *
 * The education RAILS: education engagements, funding REFERENCES (pointing
 * at the Finance OS — the office never stores scholarship/fees/tuition
 * values), and education decisions.
 *
 * HARD BOUNDARIES:
 *   - education funding is a REFERENCE to a Finance OS disbursement
 *     (FIR-018: no amounts, no balances);
 *   - a funding decision requires a human authority reference — who may
 *     be funded, on what criteria, is POLICY (ratified rule), never a
 *     genealogical inference (a child's relationship to a parent is not
 *     an entitlement to funding);
 *   - program eligibility, if defined, is a ratified rule evaluated by
 *     lookup (the same mechanism pattern as beneficiary/trustee).
 */

import { familyError } from "../phase3/errors";
import { assertNoFinancialState } from "../phase3/contracts";
import { isIsoDate, type EffectivePeriod } from "./types";
import type { OfficeOutcome } from "./types";

export interface EducationEngagement {
  engagementRef: string;
  partyRef: string;
  programRef: string | null;
  institutionRef: string | null;
  status: "PROPOSED" | "ACTIVE" | "COMPLETED" | "TERMINATED";
  period: EffectivePeriod | null;
  advisorRef: string | null;
  tenantId: string;
}

export function assertEducationEngagement(e: EducationEngagement): void {
  if (e.period !== null && !isIsoDate(e.period.effectiveFrom)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Education engagement period must start at an ISO date.", []);
  }
  assertNoFinancialState(e, "EducationEngagement");
}

export interface EducationFundingReference {
  fundingRef: string;
  engagementRef: string;
  /** The Finance OS disbursement this funding references (the truth). */
  financeFundingRef: string;
  /** The human decision approving the funding (with proven authority). */
  authorityRef: string;
  /** The ratified funding policy this decision applied (reference). */
  policyRef: string;
  effectiveFrom: string;
  tenantId: string;
}

export function assertEducationFundingReference(f: EducationFundingReference): void {
  if (typeof f.financeFundingRef !== "string" || f.financeFundingRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "Education funding references the Finance OS disbursement. The office never stores funding amounts.", []);
  }
  if (typeof f.authorityRef !== "string" || f.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "Education funding requires its approving authority reference.", []);
  }
  if (typeof f.policyRef !== "string" || f.policyRef.trim() === "") {
    throw familyError("POLICY_DECISION_REQUIRED", "Education funding cites the ratified funding policy it applied. Funding without a ratified policy is refused.", []);
  }
  if (!isIsoDate(f.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Education funding effectiveFrom must be an ISO date.", []);
  assertNoFinancialState(f, "EducationFundingReference");
}

export interface EducationDecision {
  decisionRef: string;
  engagementRef: string;
  decision: string;
  authorityRef: string;
  decidedAt: string;
  tenantId: string;
}

export function assertEducationDecision(d: EducationDecision): void {
  if (typeof d.authorityRef !== "string" || d.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "An education decision requires its authority reference.", []);
  }
  if (!isIsoDate(d.decidedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Education decision decidedAt must be an ISO date.", []);
}

/**
 * A ratified program eligibility rule (same lookup mechanism as the
 * beneficiary/trustee engines). No rule → INDETERMINATE; a context not
 * covered → INDETERMINATE. Genealogy never appears as an automatic path:
 * it is only a context key the rule may, by ratification, map.
 */
export interface EducationEligibilityRule {
  ruleRef: string;
  policyKey: string;
  contextMap: Readonly<Record<string, "ELIGIBLE" | "NOT_ELIGIBLE">>;
}

export function evaluateEducationEligibility(
  rule: EducationEligibilityRule | null,
  contextKey: string,
): OfficeOutcome<{ result: "ELIGIBLE" | "NOT_ELIGIBLE"; basis: string }> {
  if (rule === null) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: "education.eligibility",
      reason: "No ratified education eligibility rule. Relationship to the family is not an entitlement to funding.",
    };
  }
  const outcome = rule.contextMap[contextKey];
  if (outcome === undefined) {
    return { state: "POLICY_DECISION_REQUIRED", policyKey: rule.policyKey, reason: `Rule ${rule.ruleRef} has no determination for context "${contextKey}".` };
  }
  return { state: "RESOLVED", value: { result: outcome, basis: `rule ${rule.ruleRef}, context ${contextKey}` } };
}
