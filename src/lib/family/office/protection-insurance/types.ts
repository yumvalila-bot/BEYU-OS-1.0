/**
 * BEYU OS — Family Office PROTECTION & INSURANCE: shared taxonomy and types.
 *
 * This is a governed Family Office capability, not a separate OS. It records,
 * reviews and models life-insurance protection and succession liquidity for the
 * family; it does NOT underwrite, bind, modify or cancel coverage, and it does
 * not post to the ledger.
 *
 * Design invariants, each enforced in code and covered by tests:
 *
 *   1. Money is integer minor units. `numeric(18,2)` is the storage shape and
 *      the service layer is the only place that converts — the same discipline
 *      as `../capital-wealth` (§33).
 *   2. A death benefit is CONTINGENT PROTECTION, never liquid wealth. No total
 *      in this module adds face amounts into a wealth or liquidity figure;
 *      contingent and received values live in separate buckets that a caller
 *      cannot silently merge (`liquidity.ts`).
 *   3. Every recorded figure carries a provenance label — VERIFIED,
 *      USER_PROVIDED, MODELLED, ESTIMATED, UNVERIFIED. A missing figure stays
 *      missing: it is reported as `NOT_QUANTIFIED`, never as zero (§25).
 *   4. Policy owner, insured person, beneficiary, premium payer and assignee
 *      are five DISTINCT roles. A record that conflates them must say so
 *      explicitly; the engine never infers one from another (`policy.ts`).
 *   5. Insurance beneficiary designations are NOT trust beneficiaries. The
 *      legal relationships are distinct registers; they may reference the same
 *      person but never share an entitlement (`beneficiaries.ts`).
 *   6. Finance OS remains the sole accounting authority. Every monetary row
 *      here is stamped `authoritative_owner = 'FINANCE_OS'` with a nullable
 *      `finance_record_ref`; nothing in this module is a journal entry and no
 *      route posts (§32, CAP_POSTING untouched — this module never calls it).
 *   7. The protection gap is a deterministic, explainable calculation over
 *      caller-supplied and recorded values. It is not advice, not an actuarial
 *      result, and never an opaque model output (`protection-gap.ts`).
 *   8. No jurisdiction-specific legal or tax conclusion is ever encoded. The
 *      engine records that a review happened, by whom, with what reference —
 *      it never manufactures an outcome (§23).
 */

/* ------------------------------------------------------------------ */
/* Policy taxonomy                                                      */
/* ------------------------------------------------------------------ */

/** Controlled policy-type catalogue. Extending it is an architecture decision. */
export const INSURANCE_POLICY_TYPES = [
  "PERSONAL_LIFE",
  "FAMILY_PROTECTION",
  "KEY_PERSON",
  "SHAREHOLDER_BUY_SELL",
  "SUCCESSION_LIQUIDITY",
  "DEBT_PROTECTION",
  "EXECUTIVE_CONTINUITY",
  "GROUP_LIFE",
  "OTHER",
] as const;
export type InsurancePolicyType = (typeof INSURANCE_POLICY_TYPES)[number];

/**
 * Contract status of the policy itself. Transitions are RECORDED, never
 * automatic: nothing in this module may lapse, surrender or terminate a policy
 * on its own. A record is created or transitioned only through a governed write
 * citing the human who recorded it (§14 — no automatic policy modification).
 */
export const INSURANCE_POLICY_STATUSES = [
  "DRAFT",
  "PENDING_UNDERWRITING",
  "IN_FORCE",
  "LAPSED",
  "SURRENDERED",
  "MATURED",
  "TERMINATED",
] as const;
export type InsurancePolicyStatus = (typeof INSURANCE_POLICY_STATUSES)[number];

/**
 * Governance review lifecycle (§15). Deliberately SEPARATE from contract
 * status: whether the family has finished governing a record is a different
 * question from whether the insurer has it in force.
 */
export const INSURANCE_GOVERNANCE_STAGES = [
  "DRAFT",
  "ASSESSED",
  "REVIEW_REQUIRED",
  "LEGAL_REVIEW",
  "TAX_REVIEW",
  "FINANCE_REVIEW",
  "GOVERNANCE_APPROVAL",
  "ACTIVE",
  "REVIEW_DUE",
  "RENEWED",
  "AMENDED",
  "TERMINATED",
] as const;
export type InsuranceGovernanceStage = (typeof INSURANCE_GOVERNANCE_STAGES)[number];

/** Who holds each legal role. Never inferred — each is recorded explicitly. */
export const POLICY_ROLE_KINDS = [
  "FAMILY_MEMBER",
  "LEGAL_ENTITY",
  "TRUST",
  "OTHER",
] as const;
export type PolicyRoleKind = (typeof POLICY_ROLE_KINDS)[number];

/** Assignment posture on the policy. COLLATERAL and ABSOLUTE are distinct. */
export const ASSIGNMENT_STATUSES = ["NONE", "COLLATERAL_ASSIGNED", "ABSOLUTELY_ASSIGNED"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const PREMIUM_FREQUENCIES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "SINGLE"] as const;
export type PremiumFrequency = (typeof PREMIUM_FREQUENCIES)[number];

/* ------------------------------------------------------------------ */
/* Provenance — the honesty layer                                       */
/* ------------------------------------------------------------------ */

/**
 * Where a value came from. This is the whole of §11's transparency promise:
 * a number without provenance cannot be recorded, so a modelled figure can
 * never quietly become a verified one.
 *
 *  - VERIFIED        an authoritative document or statement was cited (ref required),
 *  - USER_PROVIDED   a human typed it as fact about their own arrangement,
 *  - MODELLED        derived by the deterministic engine from other inputs,
 *  - ESTIMATED       a human's estimate, no document behind it,
 *  - UNVERIFIED      recorded but explicitly not trusted (e.g. broker recollection).
 */
export const PROVENANCE_CLASSES = [
  "VERIFIED",
  "USER_PROVIDED",
  "MODELLED",
  "ESTIMATED",
  "UNVERIFIED",
] as const;
export type ProvenanceClass = (typeof PROVENANCE_CLASSES)[number];

/** A quantity in integer minor units WITH its provenance, or absent. */
export type ProvenancedMinor = {
  valueMinor: number;
  provenance: ProvenanceClass;
  /** Required unless provenance is USER_PROVIDED/ESTIMATED: document/record ref. */
  sourceRef: string | null;
};

/* ------------------------------------------------------------------ */
/* Review findings                                                        */
/* ------------------------------------------------------------------ */

export const REVIEW_FINDING_CODES = [
  "MISSING_BENEFICIARY",
  "OUTDATED_BENEFICIARY",
  "BENEFICIARY_ALLOCATION_MISMATCH",
  "MISSING_POLICY_DOCUMENT",
  "OVERDUE_PREMIUM",
  "UPCOMING_REVIEW",
  "UPCOMING_RENEWAL",
  "COVERAGE_BELOW_MODELED_TARGET",
  "POLICY_ASSIGNED",
  "POLICY_LOAN_OUTSTANDING",
  "OWNERSHIP_INCONSISTENT",
  "PREMIUM_PAYER_UNRECORDED",
  "INSURED_RELATIONSHIP_CHANGED",
  "SUCCESSION_PLAN_CHANGED",
  "MAJOR_FAMILY_CHANGE",
  "MAJOR_BUSINESS_OWNERSHIP_CHANGE",
  "CORPORATE_POLICY_VIEWED_FROM_FAMILY",
] as const;
export type ReviewFindingCode = (typeof REVIEW_FINDING_CODES)[number];

export const REVIEW_FINDING_SEVERITIES = ["INFO", "NOTICE", "WARNING", "ESCALATE"] as const;
export type ReviewFindingSeverity = (typeof REVIEW_FINDING_SEVERITIES)[number];

export type ReviewFinding = {
  code: ReviewFindingCode;
  severity: ReviewFindingSeverity;
  detail: string;
};

/* ------------------------------------------------------------------ */
/* Beneficiary designations                                               */
/* ------------------------------------------------------------------ */

export const DESIGNATION_TYPES = ["PRIMARY", "CONTINGENT"] as const;
export type DesignationType = (typeof DESIGNATION_TYPES)[number];

export const ENTITLEMENT_BASES = ["PERCENTAGE", "FIXED_AMOUNT", "RESIDUARY"] as const;
export type EntitlementBasis = (typeof ENTITLEMENT_BASES)[number];

export const DESIGNATION_STATUSES = ["PROPOSED", "ACTIVE", "SUPERSEDED", "REVOKED"] as const;
export type DesignationStatus = (typeof DESIGNATION_STATUSES)[number];

export const REVIEW_STATUSES = ["UNREVIEWED", "IN_REVIEW", "CONFIRMED", "FLAGGED"] as const;
export type DesignationReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * The legal/tax review posture of a designation. The engine records review
 * STATE only. It never encodes an outcome such as "tax-free": treatment varies
 * by jurisdiction, ownership structure and policy type (§23), so an outcome
 * that arrives in this system arrives as a cited professional record, not as a
 * derived fact.
 */
export const PROFESSIONAL_REVIEW_STATUSES = [
  "NOT_STARTED",
  "REQUIRED",
  "IN_PROGRESS",
  "COMPLETED",
  "NOT_APPLICABLE_RECORDED",
] as const;
export type ProfessionalReviewStatus = (typeof PROFESSIONAL_REVIEW_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Premiums                                                               */
/* ------------------------------------------------------------------ */

export const PREMIUM_STATUSES = ["SCHEDULED", "PAID", "WAIVED", "VOID"] as const;
export type PremiumStatus = (typeof PREMIUM_STATUSES)[number];

/**
 * The status a scheduled premium presents as at a date, WITHOUT writing
 * anything. OVERDUE is computed at read time — a background job flipping rows
 * would be this module "modifying" records, which §14 forbids.
 */
export type EffectivePremiumStatus = PremiumStatus | "OVERDUE";

/* ------------------------------------------------------------------ */
/* Claims                                                                 */
/* ------------------------------------------------------------------ */

export const CLAIM_STATUSES = [
  "CLAIM_OPENED",
  "DOCUMENTATION_PENDING",
  "UNDER_REVIEW",
  "SUBMITTED",
  "INSURER_REVIEW",
  "APPROVED",
  "DENIED",
  "DISPUTED",
  "PROCEEDS_PENDING",
  "PROCEEDS_RECEIVED",
  "ALLOCATED",
  "CLOSED",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * Proceeds posture (§13). EXPECTED proceeds are NOT cash: the buckets in
 * `liquidity.ts` keep every pre-RECEIVED state out of any liquidity total, and
 * ALLOCATED only records the family office's allocation REFERENCE — the money
 * movement itself is Finance OS truth (`finance_record_ref`).
 */
export const PROCEEDS_STATES = ["NONE", "EXPECTED", "CLAIMED", "APPROVED", "RECEIVED", "ALLOCATED"] as const;
export type ProceedsState = (typeof PROCEEDS_STATES)[number];

export const CLAIM_EVENT_KINDS = [
  "OPENED",
  "DOCUMENT_REQUESTED",
  "DOCUMENT_SUPPLIED",
  "SUBMITTED",
  "INSURER_DECISION",
  "DISPUTE_RAISED",
  "PROCEEDS_NOTED",
  "ALLOCATED",
  "NOTE",
  "CLOSED",
] as const;
export type ClaimEventKind = (typeof CLAIM_EVENT_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Review records                                                         */
/* ------------------------------------------------------------------ */

export const REVIEW_KINDS = [
  "POLICY_REVIEW",
  "BENEFICIARY_REVIEW",
  "CLAIM_REVIEW",
  "SUCCESSION_ALIGNMENT",
  "MAJOR_FAMILY_CHANGE",
  "MAJOR_OWNERSHIP_CHANGE",
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_OUTCOMES = ["COMPLETED", "EXCEPTIONS_RAISED", "DEFERRED"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/* ------------------------------------------------------------------ */
/* Shared primitives                                                      */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): boolean {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

export function isCurrency(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

/** Compare two ISO dates lexicographically — valid for `YYYY-MM-DD` strings. */
export function isoBefore(a: string, b: string): boolean {
  return a < b;
}

/** Inclusive compare, same reasoning. */
export function isoAtOrBefore(a: string, b: string): boolean {
  return a <= b;
}

/**
 * The module's version, recorded on every assessment so a stored result can
 * always be re-derived from the engine version that produced it.
 */
export const FAMILY_OFFICE_PROTECTION_VERSION = "family-office-protection-insurance-1.0.0";

/**
 * Fixed disclaimer text carried on modeled outputs. It is a CONSTANT, not a
 * configuration: making it configurable would let the honesty be turned off.
 */
export const PROTECTION_MODELED_DISCLAIMER =
  "MODELED planning information recorded inside the BEYU OS Family Office. Not legal, tax, actuarial or financial advice, and not an offer, solicitation or quotation. Outcomes depend on the policy contract, applicable law and professional review.";

/** Boundary statement repeated at every surface that reports money (§32). */
export const PROTECTION_ACCOUNTING_BOUNDARY =
  "Finance OS is the sole authority for accounting, journals, posting, periods and reconciliation. Nothing recorded or computed here is a posted financial entry; CAP_POSTING is not invoked by this module at any layer.";
