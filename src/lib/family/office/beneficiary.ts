/**
 * BEYU OS — Family Office: beneficiary engineering.
 *
 * The beneficiary RAILS: references, designations, classes, status,
 * effective periods, changes, reviews, decisions — and the eligibility
 * MECHANISM.
 *
 * What is engineered: a mechanism that ACCEPTS a ratified
 * BeneficiaryEligibilityRule and evaluates it deterministically. The rule
 * is DATA (a context → outcome map supplied by the ratification). The
 * engine performs lookups; it never decides who is eligible.
 *
 * Hard boundaries (enforced + tested):
 *   - genealogical relationship ≠ entitlement: a relationship record can
 *     never confer, imply, or suggest beneficiary status;
 *   - no percentages, no entitlements, no distribution rules here —
 *     those are Finance/trustee/policy territory;
 *   - a status of DESIGNATED/ACTIVE requires a statusBasisRef (a ratified
 *     basis reference) — status is never inferred.
 */

import { familyError } from "../phase3/errors";
import { ELIGIBILITY_RESULTS, type EligibilityResult } from "../model";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";
import { isIsoDate, type EffectivePeriod, type OfficeOutcome } from "./types";

export function isEligibilityResult(value: string): value is EligibilityResult {
  return (ELIGIBILITY_RESULTS as readonly string[]).includes(value);
}

/** Reference to a canonical beneficiaries record (people.beneficiaries). */
export interface BeneficiaryReference {
  beneficiaryRef: string;
  partyRef: string;
  trustRef: string | null;
  tenantId: string;
}

/**
 * A designation: a trustee/instrument act naming a beneficiary. The
 * designating authority is a REFERENCE — this structure never self-confers.
 */
export interface BeneficiaryDesignation {
  designationRef: string;
  beneficiaryRef: string;
  /** The designating authority (trustee decision / instrument clause ref). */
  designatedByRef: string;
  instrumentRef: string;
  period: EffectivePeriod;
  status: "PROPOSED" | "DESIGNATED" | "SUPERSEDED" | "REVOKED";
  tenantId: string;
}

export function assertBeneficiaryDesignation(d: BeneficiaryDesignation): void {
  if (typeof d.designatedByRef !== "string" || d.designatedByRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A beneficiary designation must cite its designating authority. Designation is never self-conferred.", []);
  }
  if (typeof d.instrumentRef !== "string" || d.instrumentRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A beneficiary designation must cite the governing instrument.", []);
  }
  if (!isIsoDate(d.period.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Designation period must start at an ISO date.", []);
}

/**
 * A beneficiary class. `ruleRef` points at the ratified eligibility rule;
 * null = no rule exists = the class has no eligibility semantics at all.
 */
export interface BeneficiaryClass {
  classRef: string;
  name: string;
  ruleRef: string | null;
  tenantId: string;
}

/**
 * The eligibility MECHANISM's input: a ratified rule. The engine evaluates
 * by lookup: the rule's `contextMap` maps a context key to a declared
 * outcome. A context key with no entry → INDETERMINATE (there is NO
 * default entry; absence is not eligibility and not ineligibility).
 */
export interface BeneficiaryEligibilityRule {
  ruleRef: string;
  policyKey: string;
  /** context key → declared outcome. Exhaustive or not — gaps are INDETERMINATE. */
  contextMap: Readonly<Record<string, "ELIGIBLE" | "NOT_ELIGIBLE">>;
}

export interface BeneficiaryContext {
  beneficiaryRef: string;
  /** The context key to evaluate (e.g. the class/designation context). */
  contextKey: string;
}

/**
 * Evaluate eligibility AGAINST a ratified rule. No rule → INDETERMINATE +
 * POLICY_DECISION_REQUIRED. Never infers from genealogy: the genealogical
 * context is merely ANOTHER context key the rule may (by ratification) map.
 */
export function evaluateBeneficiaryEligibility(
  rule: BeneficiaryEligibilityRule | null,
  context: BeneficiaryContext,
): OfficeOutcome<{ result: EligibilityResult; basis: string }> {
  if (rule === null) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: "beneficiary.eligibility",
      reason: "No ratified beneficiary eligibility rule. Absence of a rule is not eligibility and not ineligibility — it is UNRESOLVED.",
    };
  }
  const outcome = rule.contextMap[context.contextKey];
  if (outcome === undefined) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: rule.policyKey,
      reason: `Ratified rule ${rule.ruleRef} has no determination for context "${context.contextKey}". Missing is not a default.`,
    };
  }
  return { state: "RESOLVED", value: { result: outcome, basis: `rule ${rule.ruleRef}, context ${context.contextKey}` } };
}

/**
 * Registry-backed convenience: the eligibility rule is a ratified policy.
 * Resolving it pulls the rule data from the policy engine.
 */
export function eligibilityRuleFromRegistry(registry: PolicyRegistry, policyKey: string, asOf: string): BeneficiaryEligibilityRule | null {
  const outcome = resolvePolicy<{ contextMap: Record<string, "ELIGIBLE" | "NOT_ELIGIBLE"> }>(registry, policyKey, asOf);
  if (outcome.state !== "RESOLVED") return null;
  const p = outcome.parameters.find((x) => x.key === "contextMap");
  if (p === undefined || typeof p.value !== "object" || p.value === null) return null;
  return { ruleRef: `${policyKey}@v${outcome.version}`, policyKey, contextMap: p.value as Record<string, "ELIGIBLE" | "NOT_ELIGIBLE"> };
}

export interface BeneficiaryStatusRecord {
  beneficiaryRef: string;
  status: "PROPOSED" | "DESIGNATED" | "ACTIVE" | "SUPERSEDED" | "REVOKED";
  /**
   * The ratified basis for the status (designation/trustee decision ref).
   * REQUIRED for DESIGNATED/ACTIVE — status is never inferred from
   * genealogy, family membership, or anything else.
   */
  statusBasisRef: string | null;
  period: EffectivePeriod | null;
  tenantId: string;
}

export function assertBeneficiaryStatusRecord(r: BeneficiaryStatusRecord): void {
  if ((r.status === "DESIGNATED" || r.status === "ACTIVE") && (r.statusBasisRef === null || r.statusBasisRef.trim() === "")) {
    throw familyError(
      "AUTHORITY_UNPROVEN",
      `Beneficiary status ${r.status} requires a ratified statusBasisRef. Status is never conferred automatically (genealogy ≠ entitlement).`,
      [],
    );
  }
  if (r.period !== null && !isIsoDate(r.period.effectiveFrom)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Beneficiary status period must start at an ISO date.", []);
  }
}

export interface BeneficiaryChange {
  changeRef: string;
  beneficiaryRef: string;
  priorStatus: string;
  newStatus: string;
  /** The human authority deciding the change (trustee decision ref). */
  authorityRef: string;
  evidenceRefs: readonly string[];
  effectiveFrom: string;
  tenantId: string;
}

export function assertBeneficiaryChange(c: BeneficiaryChange): void {
  if (typeof c.authorityRef !== "string" || c.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A beneficiary change requires its deciding authority reference.", []);
  }
  if (!isIsoDate(c.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Beneficiary change effectiveFrom must be an ISO date.", []);
}

export interface BeneficiaryReview {
  reviewRef: string;
  beneficiaryRef: string;
  reviewedAt: string;
  reviewerRef: string;
  finding: string;
  tenantId: string;
}

export interface BeneficiaryDecision {
  decisionRef: string;
  beneficiaryRef: string;
  decision: "CONFIRMED" | "MODIFIED" | "REVOKED";
  authorityRef: string;
  decidedAt: string;
  tenantId: string;
}

export { ELIGIBILITY_RESULTS };
