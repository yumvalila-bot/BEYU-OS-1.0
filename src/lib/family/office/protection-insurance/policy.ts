/**
 * BEYU OS — Family Office protection: the policy record and its lifecycles.
 *
 * Two state machines live here, deliberately independent:
 *
 *   - contract status      (what the insurer-side record says), and
 *   - governance stage     (how far the family has governed the record).
 *
 * Neither machine ever advances on its own. `advancePolicyStatus` and
 * `advanceGovernanceStage` are PURE: they validate a proposed transition with
 * its recorded evidence and return findings; the service layer persists a
 * transition only when the findings are empty and a human actor is attached
 * (§14 — no automatic policy modification).
 *
 * Ownership model (§9): owner, insured, beneficiary, payer and assignee are
 * five recorded roles. They may name the same person; the engine NEVER derives
 * one from another, and it refuses a record that leaves owner or insured blank
 * "to be filled later" once the policy leaves DRAFT.
 */

import {
  ASSIGNMENT_STATUSES,
  FAMILY_OFFICE_PROTECTION_VERSION,
  INSURANCE_GOVERNANCE_STAGES,
  INSURANCE_POLICY_STATUSES,
  INSURANCE_POLICY_TYPES,
  POLICY_ROLE_KINDS,
  PREMIUM_FREQUENCIES,
  PROFESSIONAL_REVIEW_STATUSES,
  PROVENANCE_CLASSES,
  isCurrency,
  isIsoDate,
  type AssignmentStatus,
  type DesignationType,
  type InsuranceGovernanceStage,
  type InsurancePolicyStatus,
  type InsurancePolicyType,
  type PolicyRoleKind,
  type PremiumFrequency,
  type ProfessionalReviewStatus,
  type ProvenanceClass,
} from "./types";

/** Amounts are integer minor units; null means "does not exist for this contract". */
export type PolicyRecord = {
  id: string;
  tenantId: string;
  policyNumber: string;
  policyType: InsurancePolicyType;
  /** The five roles (§9). Owner and insured are mandatory outside DRAFT. */
  ownerRef: string | null;
  ownerKind: PolicyRoleKind | null;
  insuredRef: string | null;
  insuredKind: PolicyRoleKind | null;
  premiumPayerRef: string | null;
  insurerRef: string;
  brokerRef: string | null;
  /** Legal-entity association for corporate-adjacent policies (§21) — a VIEW reference. */
  legalEntityId: string | null;
  countryCode: string | null;
  currency: string;
  /** Face/death-benefit amount in minor units. Contingent, never liquid wealth. */
  deathBenefitMinor: number;
  coverageAmountMinor: number;
  /** Nullable by law of nature, not by convenience: not every contract has cash value. */
  cashValueMinor: number | null;
  surrenderValueMinor: number | null;
  premiumAmountMinor: number;
  premiumFrequency: PremiumFrequency;
  nextPremiumDueDate: string | null;
  effectiveDate: string | null;
  maturityDate: string | null;
  reviewIntervalDays: number | null;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  status: InsurancePolicyStatus;
  governanceStage: InsuranceGovernanceStage;
  assignmentStatus: AssignmentStatus;
  collateralBeneficiaryRef: string | null;
  policyLoanOutstanding: boolean;
  /** Purpose and the cross-domain links (§12) — references only, effects never. */
  purpose: string;
  successionPlanRef: string | null;
  liquidityObjectiveRef: string | null;
  riskAssessmentRef: string | null;
  /** Group life derives eligibility FROM HCM; this is a pointer, not a copy (§20). */
  hcmEmployeeRef: string | null;
  documentRefs: string[];
  /** Review POSTURE only — no jurisdiction-specific legal/tax conclusion (§23). */
  legalReviewStatus: ProfessionalReviewStatus;
  taxReviewStatus: ProfessionalReviewStatus;
  jurisdictionRef: string | null;
  /** Provenance of the headline amount (deathBenefitMinor). */
  amountProvenance: ProvenanceClass;
  amountSourceRef: string | null;
};

export type PolicyFinding = { field: string; rule: string; message: string };

/** §11/§25: a missing input is reported missing; it is never filled with zero. */
export function validatePolicy(p: PolicyRecord): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const push = (field: string, rule: string, message: string) =>
    findings.push({ field, rule, message });

  if (!p.tenantId) push("tenantId", "REQUIRED", "tenantId is server-derived and may never be empty.");
  if (!p.policyNumber?.trim()) push("policyNumber", "REQUIRED", "A policy without a number cannot be reconciled against the insurer record.");
  if (!INSURANCE_POLICY_TYPES.includes(p.policyType)) push("policyType", "TAXONOMY", `policyType must be one of ${INSURANCE_POLICY_TYPES.join(" | ")}.`);
  if (!isCurrency(p.currency)) push("currency", "FORMAT", "currency must be an ISO 4217 three-letter code.");
  if (p.countryCode !== null && !/^[A-Z]{2}$/.test(p.countryCode)) push("countryCode", "FORMAT", "countryCode must be ISO 3166-1 alpha-2 or null.");
  if (!p.insurerRef?.trim()) push("insurerRef", "REQUIRED", "Every policy record names its insurer; a record without one cannot be verified.");
  if (!isCurrency(p.currency) && p.currency !== "") push("currency", "FORMAT", "currency must be a 3-letter code.");

  for (const [field, ref, kind] of [
    ["ownerRef", p.ownerRef, p.ownerKind],
    ["insuredRef", p.insuredRef, p.insuredKind],
  ] as const) {
    if ((ref === null) !== (kind === null)) {
      push(field, "ROLE_PAIR", `${field} and its role kind are recorded as a pair — one without the other is unattributable.`);
    }
  }
  if (p.premiumPayerRef !== null && p.premiumPayerRef.trim() === "") push("premiumPayerRef", "REQUIRED", "premiumPayerRef is either a reference or null (unrecorded), never blank.");
  for (const [field, kind] of [
    ["ownerKind", p.ownerKind],
    ["insuredKind", p.insuredKind],
  ] as const) {
    if (kind !== null && !POLICY_ROLE_KINDS.includes(kind)) push(field, "TAXONOMY", `${field} must be one of ${POLICY_ROLE_KINDS.join(" | ")}.`);
  }

  // Outside DRAFT the ownership model must be legally explicit (§9).
  if (p.status !== "DRAFT") {
    if (!p.ownerRef) push("ownerRef", "OWNERSHIP_MODEL", "A policy that is not DRAFT must record its legal owner explicitly.");
    if (!p.insuredRef) push("insuredRef", "OWNERSHIP_MODEL", "A policy that is not DRAFT must record the insured person explicitly.");
    if (!p.effectiveDate) push("effectiveDate", "REQUIRED", "A non-draft policy must record its effective date.");
  }

  // Amounts: contingent protection is mandatory; cash value is not (§4).
  if (!Number.isSafeInteger(p.deathBenefitMinor) || p.deathBenefitMinor < 0) push("deathBenefitMinor", "MONEY", "deathBenefitMinor must be a non-negative integer in minor units.");
  if (!Number.isSafeInteger(p.coverageAmountMinor) || p.coverageAmountMinor < 0) push("coverageAmountMinor", "MONEY", "coverageAmountMinor must be a non-negative integer in minor units.");
  for (const [field, v] of [
    ["cashValueMinor", p.cashValueMinor],
    ["surrenderValueMinor", p.surrenderValueMinor],
  ] as const) {
    if (v !== null && (!Number.isSafeInteger(v) || v < 0)) push(field, "MONEY", `${field} must be a non-negative integer in minor units, or null when the contract has no such value.`);
  }
  if (p.cashValueMinor !== null && p.surrenderValueMinor !== null && p.surrenderValueMinor > p.cashValueMinor) {
    push("surrenderValueMinor", "CASH_ORDER", "Surrender value exceeding recorded cash value is refused as contradictory; correct the recorded pair with the insurer statement.");
  }
  if (!Number.isSafeInteger(p.premiumAmountMinor) || p.premiumAmountMinor < 0) push("premiumAmountMinor", "MONEY", "premiumAmountMinor must be a non-negative integer in minor units.");
  if (!PREMIUM_FREQUENCIES.includes(p.premiumFrequency)) push("premiumFrequency", "TAXONOMY", `premiumFrequency must be one of ${PREMIUM_FREQUENCIES.join(" | ")}.`);
  if (p.premiumAmountMinor > 0 && p.premiumFrequency === "SINGLE" && p.nextPremiumDueDate !== null) {
    push("nextPremiumDueDate", "FREQUENCY", "A single-premium contract has no next due date; record null.");
  }

  for (const [field, v] of [
    ["nextPremiumDueDate", p.nextPremiumDueDate],
    ["effectiveDate", p.effectiveDate],
    ["maturityDate", p.maturityDate],
    ["lastReviewDate", p.lastReviewDate],
    ["nextReviewDate", p.nextReviewDate],
  ] as const) {
    if (v !== null && !isIsoDate(v)) push(field, "DATE", `${field} must be an ISO calendar date or null.`);
  }
  if (p.effectiveDate && p.maturityDate && p.maturityDate <= p.effectiveDate) {
    push("maturityDate", "DATE_ORDER", "maturityDate must fall after effectiveDate.");
  }
  if (p.lastReviewDate && p.nextReviewDate && p.nextReviewDate <= p.lastReviewDate) {
    push("nextReviewDate", "DATE_ORDER", "nextReviewDate must fall after lastReviewDate.");
  }
  if (p.reviewIntervalDays !== null && (!Number.isSafeInteger(p.reviewIntervalDays) || p.reviewIntervalDays <= 0)) {
    push("reviewIntervalDays", "RANGE", "reviewIntervalDays must be a positive integer number of days, or null when no interval is ratified for this record.");
  }

  if (!INSURANCE_POLICY_STATUSES.includes(p.status)) push("status", "TAXONOMY", `status must be one of ${INSURANCE_POLICY_STATUSES.join(" | ")}.`);
  if (!INSURANCE_GOVERNANCE_STAGES.includes(p.governanceStage)) push("governanceStage", "TAXONOMY", "governanceStage is outside the governed lifecycle.");
  if (!ASSIGNMENT_STATUSES.includes(p.assignmentStatus)) push("assignmentStatus", "TAXONOMY", "assignmentStatus is outside the controlled taxonomy.");
  if (p.assignmentStatus !== "NONE" && !p.collateralBeneficiaryRef) {
    push("collateralBeneficiaryRef", "ASSIGNMENT", "An assigned policy must name the assignee the assignment runs to.");
  }
  if (p.assignmentStatus === "NONE" && p.collateralBeneficiaryRef) {
    push("collateralBeneficiaryRef", "ASSIGNMENT", "A policy with no assignment records no assignee; clear one of the two.");
  }

  for (const [field, v] of [
    ["legalReviewStatus", p.legalReviewStatus],
    ["taxReviewStatus", p.taxReviewStatus],
  ] as const) {
    if (!PROFESSIONAL_REVIEW_STATUSES.includes(v)) push(field, "TAXONOMY", `${field} records review POSTURE only, from the controlled set.`);
  }

  // Provenance: VERIFIED cannot be claimed without a source (§11).
  if (!PROVENANCE_CLASSES.includes(p.amountProvenance)) push("amountProvenance", "PROVENANCE", "amountProvenance must be a controlled class.");
  if ((p.amountProvenance === "VERIFIED" || p.amountProvenance === "MODELLED") && !p.amountSourceRef) {
    push("amountSourceRef", "PROVENANCE", `${p.amountProvenance} amounts must cite their source (document, statement or computation reference).`);
  }

  // Group life (§20): eligibility is DERIVED FROM HCM, recorded as a pointer.
  if (p.policyType === "GROUP_LIFE" && !p.hcmEmployeeRef && p.status !== "DRAFT") {
    push("hcmEmployeeRef", "HCM_DERIVATION", "A non-draft GROUP_LIFE coverage record names its HCM identity reference; HCM remains the canonical employee master and this module stores no copy of it.");
  }

  // Key-person / buy-sell remain VIEWED from the family office, owned by their entity (§21).
  if ((p.policyType === "KEY_PERSON" || p.policyType === "SHAREHOLDER_BUY_SELL") && !p.legalEntityId && p.status !== "DRAFT") {
    push("legalEntityId", "ENTITY_LINK", "A corporate-adjacent policy must link the owning legal entity; the Family Office view never absorbs corporate ownership (§21).");
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Contract-status lifecycle                                              */
/* ------------------------------------------------------------------ */

/**
 * Legal transitions of the recorded contract status. Terminal states have no
 * successors: re-instating a terminated contract is a NEW record citing the
 * insurer's reinstatement, not an overwrite of history.
 */
export const POLICY_STATUS_TRANSITIONS: Record<InsurancePolicyStatus, readonly InsurancePolicyStatus[]> = {
  DRAFT: ["PENDING_UNDERWRITING", "IN_FORCE", "TERMINATED"],
  PENDING_UNDERWRITING: ["IN_FORCE", "TERMINATED"],
  IN_FORCE: ["LAPSED", "SURRENDERED", "MATURED", "TERMINATED"],
  LAPSED: ["IN_FORCE", "TERMINATED"],
  SURRENDERED: ["TERMINATED"],
  MATURED: ["TERMINATED"],
  TERMINATED: [],
};

/**
 * `LAPSED → IN_FORCE` (reinstatement) additionally requires the insurer
 * evidence ref — the engine refuses it without one, because only the contract
 * can reinstate coverage; a family office record cannot.
 */
export function canTransitionPolicyStatus(
  from: InsurancePolicyStatus,
  to: InsurancePolicyStatus,
  evidenceRef: string | null,
  asOf: string,
  record: Pick<PolicyRecord, "maturityDate">,
): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  if (!POLICY_STATUS_TRANSITIONS[from].includes(to)) {
    findings.push({
      field: "status",
      rule: "LIFECYCLE",
      message: `A policy recorded ${from} cannot transition to ${to}. Corrections are recorded as a new transition from the true current status, citing the insurer record.`,
    });
    return findings;
  }
  if (from === "LAPSED" && to === "IN_FORCE" && !evidenceRef) {
    findings.push({ field: "evidenceRef", rule: "REINSTATEMENT_EVIDENCE", message: "Reinstating a lapsed policy requires the insurer evidence reference; this module never re-activates coverage by assertion." });
  }
  if (to === "MATURED" && (record.maturityDate === null || asOf < record.maturityDate)) {
    findings.push({ field: "maturityDate", rule: "MATURITY_DATE", message: "A transition to MATURED requires a recorded maturityDate that has been reached; otherwise report the true status." });
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Governance-stage lifecycle (§15)                                      */
/* ------------------------------------------------------------------ */

export const GOVERNANCE_STAGE_TRANSITIONS: Record<InsuranceGovernanceStage, readonly InsuranceGovernanceStage[]> = {
  DRAFT: ["ASSESSED", "TERMINATED"],
  ASSESSED: ["REVIEW_REQUIRED", "TERMINATED"],
  REVIEW_REQUIRED: ["LEGAL_REVIEW", "TERMINATED"],
  LEGAL_REVIEW: ["TAX_REVIEW", "TERMINATED"],
  TAX_REVIEW: ["FINANCE_REVIEW", "TERMINATED"],
  FINANCE_REVIEW: ["GOVERNANCE_APPROVAL", "TERMINATED"],
  GOVERNANCE_APPROVAL: ["ACTIVE", "REVIEW_REQUIRED", "TERMINATED"],
  ACTIVE: ["REVIEW_DUE", "AMENDED", "RENEWED", "TERMINATED"],
  REVIEW_DUE: ["ACTIVE", "AMENDED", "TERMINATED"],
  RENEWED: ["ACTIVE", "TERMINATED"],
  AMENDED: ["ASSESSED", "REVIEW_REQUIRED", "ACTIVE", "TERMINATED"],
  TERMINATED: [],
} as const;

export type StageAdvanceContext = {
  /** The human or authorized governance act approving the step. */
  authorityRef: string | null;
  /** Actor type of the requester — an AI actor never clears a governance step. */
  actorType: "HUMAN" | "SERVICE" | "AI";
  /** Recorded findings that justify calling the record assessed. */
  reviewFindingCount: number | null;
  isHighValue: boolean | null;
  /**
   * Whether a policy-engine threshold made this a high-value record. The engine
   * holds NO threshold of its own: when the caller supplies no threshold answer
   * (`isHighValue: null`), the conservative posture applies — the full review
   * chain is required rather than skipped.
   */
  thresholdSourceRef: string | null;
};

/**
 * Validate one governance-stage advance.
 *
 * §15 says low-risk records must not be forced through unnecessary approval —
 * but WHO decides "low-risk" is a policy question, so the skip rule is driven
 * by the ratified threshold the caller supplies: with `isHighValue === false`
 * AND a `thresholdSourceRef`, LEGAL/TAX/FINANCE review steps may be advanced
 * through in one recorded, audited step; without it, they may not.
 */
export function canAdvanceGovernanceStage(
  from: InsuranceGovernanceStage,
  to: InsuranceGovernanceStage,
  ctx: StageAdvanceContext,
): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const legalSkip =
    (from === "ASSESSED" || from === "REVIEW_REQUIRED") &&
    to === "GOVERNANCE_APPROVAL" &&
    skipChainAuthorized(ctx);
  if (!GOVERNANCE_STAGE_TRANSITIONS[from].includes(to) && !legalSkip) {
    findings.push({
      field: "governanceStage",
      rule: "LIFECYCLE",
      message: `Governance stage ${from} cannot advance to ${to}. The only chain shortcut (§15, low-risk records) is ASSESSED/REVIEW_REQUIRED → GOVERNANCE_APPROVAL, and it requires BOTH a recorded isHighValue=false AND a thresholdSourceRef citing the ratified policy that made that call.`,
    });
    return findings;
  }
  if (ctx.actorType === "AI") {
    findings.push({
      field: "actor",
      rule: "HUMAN_AUTHORITY",
      message: "An AI actor cannot advance a governance stage. Noelia may prepare the review package; a human records the step (§27, FIR-017 lineage).",
    });
  }
  const terminal = to === "TERMINATED";
  const needsAuthority = terminal || to === "ACTIVE" || to === "GOVERNANCE_APPROVAL" || from === "AMENDED";
  if (needsAuthority && !ctx.authorityRef) {
    findings.push({ field: "authorityRef", rule: "AUTHORITY_REQUIRED", message: `Transition to ${to} requires an authority reference (resolution, delegation or recorded instrument). Missing authority is never approval.` });
  }
  if (to === "ASSESSED" && (ctx.reviewFindingCount === null || ctx.reviewFindingCount < 0)) {
    findings.push({ field: "reviewFindingCount", rule: "EVIDENCE", message: "Calling a record ASSESSED requires the review outcome that justifies it, recorded or referenced." });
  }
  if (to === "REVIEW_REQUIRED" && from === "GOVERNANCE_APPROVAL") {
    // returning a record for review is itself a governance act.
    if (!ctx.authorityRef) findings.push({ field: "authorityRef", rule: "AUTHORITY_REQUIRED", message: "Returning an approved record to review requires an authority reference." });
  }
  return findings;
}

/**
 * Whether a review-chain step may be advanced through in one audited skip.
 * Exposed so the SERVICE can phrase the refusal consistently; the rule lives
 * here, once, and is tested once.
 */
export function skipChainAuthorized(ctx: StageAdvanceContext): boolean {
  return ctx.isHighValue === false && ctx.thresholdSourceRef !== null;
}

/**
 * Corporate-viewed-from-family marker (§21). A KEY_PERSON /
 * SHAREHOLDER_BUY_SELL / EXECUTIVE_CONTINUITY policy is *visible* to the
 * family office as risk context while remaining owned by its corporate
 * entity; the flag exists so views cannot silently absorb it into family
 * wealth totals.
 */
export function isCorporateViewedPolicy(p: Pick<PolicyRecord, "policyType" | "legalEntityId">): boolean {
  return (
    p.legalEntityId !== null &&
    (p.policyType === "KEY_PERSON" || p.policyType === "SHAREHOLDER_BUY_SELL" || p.policyType === "EXECUTIVE_CONTINUITY")
  );
}

/** Designation type alias re-export used by the UI/summary layering. */
export type { DesignationType };

export const POLICY_ENGINE_VERSION = FAMILY_OFFICE_PROTECTION_VERSION;
