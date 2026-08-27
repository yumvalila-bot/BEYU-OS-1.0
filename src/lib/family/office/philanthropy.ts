/**
 * BEYU OS — Family Office: philanthropy engineering.
 *
 * The philanthropy RAILS: philanthropy vehicles (foundation/fund/DAF as
 * references), gift references (pointing at Finance OS), and the
 * distribution MECHANISM.
 *
 * HARD BOUNDARIES:
 *   - a gift record is a REFERENCE to a Finance OS outflow + its approved
 *     authority; amounts live in Finance (FIR-018);
 *   - whether a cause is PERMITTED is POLICY: the engine evaluates a
 *     RATIFIED philanthropy distribution rule by lookup; without it →
 *     POLICY_DECISION_REQUIRED. No cause is permitted by default;
 *   - vehicle governance (who may decide, quorum, etc.) is the
 *     governance domain's policy, referenced here.
 */

import { familyError } from "../phase3/errors";
import { assertNoFinancialState } from "../phase3/contracts";
import { isIsoDate } from "./types";
import type { OfficeOutcome } from "./types";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";

export const PHILANTHROPY_VEHICLE_TYPES = ["FOUNDATION", "FUND", "DAF", "TRUST_DESPONSORED", "OTHER"] as const;
export type PhilanthropyVehicleType = (typeof PHILANTHROPY_VEHICLE_TYPES)[number];

export interface PhilanthropyVehicle {
  vehicleRef: string;
  vehicleType: PhilanthropyVehicleType;
  /** Legal attribution (the vehicle's legal entity). */
  legalEntityRef: string | null;
  /** Governing instrument (reference). */
  instrumentRef: string | null;
  /** The governance body governing the vehicle (reference to governance domain). */
  governingBodyRef: string | null;
  tenantId: string;
}

export function assertPhilanthropyVehicle(v: PhilanthropyVehicle): void {
  if (!(PHILANTHROPY_VEHICLE_TYPES as readonly string[]).includes(v.vehicleType)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown philanthropy vehicle type "${v.vehicleType}".`, []);
  }
  assertNoFinancialState(v, "PhilanthropyVehicle");
}

/**
 * A RATIFIED philanthropy distribution rule: maps a cause-context key to
 * a determination. The engine performs the lookup; it never decides
 * which causes are permitted. Gaps are INDETERMINATE (not permitted by
 * absence).
 */
export interface PhilanthropyDistributionRule {
  ruleRef: string;
  policyKey: string;
  contextMap: Readonly<Record<string, "PERMITTED" | "NOT_PERMITTED" | "CASE_BY_CASE">>;
}

export function evaluateCauseEligibility(
  rule: PhilanthropyDistributionRule | null,
  causeContextKey: string,
): OfficeOutcome<{ result: "PERMITTED" | "NOT_PERMITTED" | "CASE_BY_CASE"; basis: string }> {
  if (rule === null) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: "philanthropy.distribution",
      reason: "No ratified philanthropy distribution rule. No cause is permitted by default — absence of a rule is not permission.",
    };
  }
  const outcome = rule.contextMap[causeContextKey];
  if (outcome === undefined) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: rule.policyKey,
      reason: `Ratified rule ${rule.ruleRef} has no determination for cause context "${causeContextKey}". Missing is not permission.`,
    };
  }
  return { state: "RESOLVED", value: { result: outcome, basis: `rule ${rule.ruleRef}, context ${causeContextKey}` } };
}

export function philanthropyRuleFromRegistry(
  registry: PolicyRegistry,
  policyKey: string,
  asOf: string,
): PhilanthropyDistributionRule | null {
  const outcome = resolvePolicy<{ contextMap: Record<string, "PERMITTED" | "NOT_PERMITTED" | "CASE_BY_CASE"> }>(registry, policyKey, asOf);
  if (outcome.state !== "RESOLVED") return null;
  const p = outcome.parameters.find((x) => x.key === "contextMap");
  if (p === undefined || typeof p.value !== "object" || p.value === null) return null;
  return { ruleRef: `${policyKey}@v${outcome.version}`, policyKey, contextMap: p.value as Record<string, "PERMITTED" | "NOT_PERMITTED" | "CASE_BY_CASE"> };
}

export interface GiftReference {
  giftRef: string;
  vehicleRef: string;
  /** The Finance OS outflow this gift references (the truth for the amount). */
  financeGiftRef: string;
  recipientRef: string;
  causeContextKey: string;
  /** The human decision approving the gift (with proven authority). */
  authorityRef: string;
  evidenceRefs: readonly string[];
  effectiveFrom: string;
  tenantId: string;
}

export function assertGiftReference(g: GiftReference): void {
  if (typeof g.financeGiftRef !== "string" || g.financeGiftRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "A gift reference points at the Finance OS outflow. The office never stores gift amounts.", []);
  }
  if (typeof g.authorityRef !== "string" || g.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A gift reference requires its approving authority.", []);
  }
  if (!isIsoDate(g.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Gift effectiveFrom must be an ISO date.", []);
  assertNoFinancialState(g, "GiftReference");
}

export interface PhilanthropyProposal {
  proposalRef: string;
  vehicleRef: string;
  purpose: string;
  causeContextKey: string;
  policyRefs: readonly string[];
  authorityRef: string | null;
  status: "DRAFT" | "PROPOSED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  tenantId: string;
}

export function assertPhilanthropyProposal(p: PhilanthropyProposal): void {
  if (p.status === "APPROVED" && (p.authorityRef === null || p.authorityRef.trim() === "")) {
    throw familyError("AUTHORITY_UNPROVEN", "An APPROVED philanthropy proposal requires its authority reference.", []);
  }
  assertNoFinancialState(p, "PhilanthropyProposal");
}
