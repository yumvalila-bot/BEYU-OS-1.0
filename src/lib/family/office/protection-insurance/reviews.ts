/**
 * BEYU OS — Family Office protection: the review engine (§14).
 *
 * `computeReviewFlags` is the whole of the module's surveillance: a pure,
 * deterministic function from RECORDED STATE to FINDINGS. It never writes. A
 * review that finds something is recorded as a REVIEW row (through the
 * service, with an actor and evidence), so "the system flagged it" and "a
 * human dealt with it" stay two different, separately audited facts.
 *
 * Design rules this file must not break:
 *   - every flag names the inputs it read, so a reviewer can re-derive it;
 *   - an absent input yields MISSING-INPUT findings, never a silent pass;
 *   - "coverage below modeled target" compares ONLY against the latest FINAL
 *     assessment in the same currency — with no assessment the engine reports
 *     NOT_QUANTIFIED rather than inventing a target;
 *   - event-driven flags (family change, ownership change, succession plan
 *     changed) are SUPPLIED by the caller from the event ledger; the engine
 *     maps them to review posture, it does not watch other domains.
 */

import { summariseAllocations, type BeneficiaryDesignation } from "./beneficiaries";
import { effectivePremiumStatus, type PremiumRecord } from "./premiums";
import { isIsoDate, type ReviewFinding } from "./types";

export type ReviewFlagInput = {
  asOf: string;
  policy: {
    policyId: string;
    status: string;
    governanceStage: string;
    documentRefs: string[];
    lastReviewDate: string | null;
    nextReviewDate: string | null;
    reviewIntervalDays: number | null;
    maturityDate: string | null;
    effectiveDate: string | null;
    assignmentStatus: "NONE" | "COLLATERAL_ASSIGNED" | "ABSOLUTELY_ASSIGNED";
    policyLoanOutstanding: boolean;
    premiumPayerRef: string | null;
    ownerRef: string | null;
    insuredRef: string | null;
    currency: string;
    deathBenefitMinor: number;
    /** Latest FINAL protection assessment result for this policy, same currency. */
    modeledTargetMinor: number | null;
    /** Succession plan linkage may go stale when the plan changes; caller compares refs. */
    successionPlanStillCurrent: boolean | null;
  };
  designations: readonly BeneficiaryDesignation[];
  premiums: readonly PremiumRecord[];
  /** Caller-supplied change events touching this policy's world (§14). */
  changes: {
    insuredRelationshipChanged: boolean;
    successionPlanChanged: boolean;
    majorFamilyChange: boolean;
    majorBusinessOwnershipChange: boolean;
  };
};

/** 90-day look-ahead for review/renewal up-coming flags: a constant of CALENDAR
 * arithmetic, not a policy threshold — it decides only WHEN a date counts as
 * "approaching", never whether an amount is acceptable. */
export const REVIEW_LOOKAHEAD_DAYS = 90;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeReviewFlags(input: ReviewFlagInput): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const { policy, asOf } = input;
  const inForce = policy.status === "IN_FORCE" || policy.status === "LAPSED";

  // 1 — beneficiary integrity (delegated to the designation engine, same code path).
  const alloc = summariseAllocations(input.designations, asOf);
  for (const f of alloc.findings) {
    findings.push({ ...f, detail: `[${policy.policyId}] ${f.detail}` });
  }

  // 2 — documents.
  if (policy.documentRefs.length === 0 && policy.status !== "DRAFT") {
    findings.push({ code: "MISSING_POLICY_DOCUMENT", severity: "WARNING", detail: `[${policy.policyId}] No policy document is referenced; the record cannot be checked against the contract it describes.` });
  }

  // 3 — premiums.
  const overdue = input.premiums.filter((p) => effectivePremiumStatus(p, asOf) === "OVERDUE");
  if (overdue.length > 0) {
    findings.push({ code: "OVERDUE_PREMIUM", severity: "ESCALATE", detail: `[${policy.policyId}] ${overdue.length} premium obligation(s) recorded SCHEDULED past their due date as of ${asOf}. Lapse risk; recorded, never auto-acted.` });
  }
  if (policy.premiumPayerRef === null && inForce) {
    findings.push({ code: "PREMIUM_PAYER_UNRECORDED", severity: "NOTICE", detail: `[${policy.policyId}] In-force with no recorded premium payer; the liquidity plan cannot attribute the obligation.` });
  }

  // 4 — review cadence.
  if (policy.nextReviewDate !== null && isIsoDate(policy.nextReviewDate)) {
    if (policy.nextReviewDate <= asOf) {
      findings.push({ code: "UPCOMING_REVIEW", severity: inForce ? "WARNING" : "NOTICE", detail: `[${policy.policyId}] Review due ${policy.nextReviewDate} (as of ${asOf}).` });
    } else if (policy.nextReviewDate <= addDaysIso(asOf, REVIEW_LOOKAHEAD_DAYS)) {
      findings.push({ code: "UPCOMING_REVIEW", severity: "INFO", detail: `[${policy.policyId}] Review window opening: next review ${policy.nextReviewDate}.` });
    }
  } else if (policy.nextReviewDate === null && policy.lastReviewDate !== null && policy.reviewIntervalDays !== null && isIsoDate(policy.lastReviewDate)) {
    const derived = addDaysIso(policy.lastReviewDate, policy.reviewIntervalDays);
    if (derived <= asOf) findings.push({ code: "UPCOMING_REVIEW", severity: "WARNING", detail: `[${policy.policyId}] No nextReviewDate recorded; the policy's own interval (${policy.reviewIntervalDays}d from ${policy.lastReviewDate}) puts the review at ${derived}, already passed.` });
  }

  // 5 — maturity/renewal window (only when a maturity date exists at all).
  if (policy.maturityDate !== null && isIsoDate(policy.maturityDate)) {
    if (policy.maturityDate <= asOf && policy.status === "IN_FORCE") {
      findings.push({ code: "UPCOMING_RENEWAL", severity: "ESCALATE", detail: `[${policy.policyId}] Recorded maturity date has passed while the record still says IN_FORCE; reconcile with the insurer record.` });
    } else if (policy.maturityDate <= addDaysIso(asOf, REVIEW_LOOKAHEAD_DAYS) && policy.maturityDate > asOf) {
      findings.push({ code: "UPCOMING_RENEWAL", severity: "WARNING", detail: `[${policy.policyId}] Maturity/renewal falls inside the ${REVIEW_LOOKAHEAD_DAYS}-day window (${policy.maturityDate}).` });
    }
  }

  // 6 — coverage vs modeled target.
  if (policy.modeledTargetMinor === null) {
    findings.push({ code: "COVERAGE_BELOW_MODELED_TARGET", severity: "INFO", detail: `[${policy.policyId}] NO MODELED TARGET: no final protection assessment exists in this currency, so coverage adequacy is NOT_QUANTIFIED — not "adequate", not "inadequate".` });
  } else if (policy.deathBenefitMinor < policy.modeledTargetMinor) {
    const shortMinor = policy.modeledTargetMinor - policy.deathBenefitMinor;
    const ratioBps = policy.modeledTargetMinor > 0 ? Math.floor((policy.deathBenefitMinor * 10_000) / policy.modeledTargetMinor) : 0;
    findings.push({ code: "COVERAGE_BELOW_MODELED_TARGET", severity: "WARNING", detail: `[${policy.policyId}] Recorded death benefit is ${shortMinor} minor units below the MODELED target (coverage ${ratioBps}bps of target). Target is modeled planning data, not an insurer obligation.` });
  }

  // 7 — assignment & loan posture.
  if (policy.assignmentStatus !== "NONE") {
    findings.push({ code: "POLICY_ASSIGNED", severity: "NOTICE", detail: `[${policy.policyId}] Policy is ${policy.assignmentStatus}; proceeds may be encumbered. Beneficiary planning must read the assignment instrument, not this flag.` });
  }
  if (policy.policyLoanOutstanding) {
    findings.push({ code: "POLICY_LOAN_OUTSTANDING", severity: "NOTICE", detail: `[${policy.policyId}] A policy loan is recorded outstanding; net benefit and cash value both depend on the loan balance in the insurer statement.` });
  }

  // 8 — ownership-model consistency (§9/§31).
  if (inForce && policy.ownerRef !== null && policy.insuredRef !== null && policy.ownerRef === policy.insuredRef && policy.documentRefs.length === 0) {
    findings.push({ code: "OWNERSHIP_INCONSISTENT", severity: "NOTICE", detail: `[${policy.policyId}] Owner and insured are the same record AND no policy document is referenced; that may be correct (self-owned personal policy) — the flag asks for the document that proves it, not a change.` });
  }

  // 9 — caller-supplied change posture (§14: the system flags, humans amend).
  if (input.changes.insuredRelationshipChanged) findings.push({ code: "INSURED_RELATIONSHIP_CHANGED", severity: "WARNING", detail: `[${policy.policyId}] A recorded change to the insured relationship exists; the designation register and the succession plan both need re-reading against the contract.` });
  if (input.changes.successionPlanChanged) findings.push({ code: "SUCCESSION_PLAN_CHANGED", severity: "WARNING", detail: `[${policy.policyId}] The linked succession plan changed; this policy's succession purpose and the ownership model need review. (Insurance supplies LIQUIDITY; the legal instrument supplies the OUTCOME.)` });
  if (input.changes.majorFamilyChange) findings.push({ code: "MAJOR_FAMILY_CHANGE", severity: "WARNING", detail: `[${policy.policyId}] A major family change (marriage, birth, death, divorce, migration) is recorded for the policy's household; beneficiary designations rarely survive one unexamined.` });
  if (input.changes.majorBusinessOwnershipChange) findings.push({ code: "MAJOR_BUSINESS_OWNERSHIP_CHANGE", severity: "WARNING", detail: `[${policy.policyId}] A major business-ownership change is recorded; buy-sell and key-person arrangements reference it.` });
  if (policy.successionPlanStillCurrent === false) findings.push({ code: "SUCCESSION_PLAN_CHANGED", severity: "ESCALATE", detail: `[${policy.policyId}] The linked succession plan is marked as no longer current; this policy references a plan that has moved.` });

  // Governance-stage coherence (not duplication of policy.ts, which owns legality):
  if (inForce && policy.governanceStage !== "ACTIVE" && policy.governanceStage !== "RENEWED") {
    findings.push({ code: "OWNERSHIP_INCONSISTENT", severity: "NOTICE", detail: `[${policy.policyId}] Contract status ${policy.status} while governance stage is ${policy.governanceStage}: an in-force record outside ACTIVE (or RENEWED) means the family has not concluded its own review of it.` });
  }

  return findings;
}

export { addDaysIso };
