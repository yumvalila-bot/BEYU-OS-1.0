/**
 * BEYU OS — MULTIGENERATIONAL FAMILY INSTITUTION LAYER: shared vocabulary.
 *
 * ============================== WHAT THIS IS ==============================
 *
 * A cross-cutting institutional layer INSIDE BEYU OS → BEYU FAMILY OFFICE. It is
 * not a seventh Family Office category, not a Family Office OS, not a second
 * control plane, not a second Finance OS, not a second identity system and not
 * a second governance system. The six canonical Family Office categories
 * (Business Development, Wealth Management, Wealth Planning, Family Governance,
 * Lifestyle Management, Philanthropy) are unchanged and remain first-class
 * operating domains; this layer spans them.
 *
 * ============================== WHAT IT IS NOT ==============================
 *
 * Nothing in `src/lib/family/**` is authoritative for:
 *
 *   - financial truth  -> `src/lib/finance/**` (Finance OS owns the ledger)
 *   - identity         -> `src/lib/identity.ts` (ONE GlobalUserID)
 *   - constitutional   -> `constitution_articles` / `src/lib/policy.ts`
 *     authority           (BEYU OS Constitution outranks the Family Constitution)
 *   - fiduciary trust  -> the Trustees, under their instruments and the law
 *     authority
 *
 * A family record that needs a journal entry references Finance OS. A family
 * member that needs an identity references `parties`/`users`. A family policy
 * that touches law yields to law. This module exists so those boundaries are
 * stated once, in one place, in type form.
 *
 * ============================ THREE INVARIANTS ============================
 *
 * 1. FAIL CLOSED. Every determination that cannot be made from supplied,
 *    authoritative evidence returns INDETERMINATE plus a
 *    `PolicyDecisionRequirement`. No engine in this layer ever fills a gap with
 *    a plausible default.
 * 2. POLICY IS NEVER INVENTED. Where authoritative evidence is absent the engine
 *    raises POLICY DECISION REQUIRED. A requirement is never auto-resolved, and
 *    never resolved by an AI actor.
 * 3. AI IS NEVER AUTHORITY. `actorType: "AI"` is refused at every gate that
 *    confers, approves, amends, disburses or overrides. Noelia may analyse,
 *    compare, forecast, simulate, recommend, draft, summarise and alert.
 */

/** Who is acting. Mirrors `audit_log.actor_type` — deliberately the same three values. */
export const FAMILY_ACTOR_TYPES = ["HUMAN", "SERVICE", "AI"] as const;
export type FamilyActorType = (typeof FAMILY_ACTOR_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Legal supremacy                                                     */
/* ------------------------------------------------------------------ */

/**
 * Instruments that OUTRANK the Family Constitution, in descending order.
 *
 * The Family Constitution is the family's governed policy and stewardship
 * framework. It is a policy instrument. It cannot and does not create legal
 * authority, and it can never override anything on this list. The order here is
 * recorded so a conflict can be reported deterministically; it is NOT a claim
 * that BEYU OS has adjudicated precedence between these instruments — that is a
 * question for counsel in the relevant jurisdiction.
 */
export const SUPERIOR_INSTRUMENTS = [
  "APPLICABLE_LAW",
  "COURT_ORDER",
  "TRUST_INSTRUMENT",
  "TRUSTEE_FIDUCIARY_DUTY",
  "TRUST_PROTECTOR_POWER",
  "REGULATORY_REQUIREMENT",
  "CORPORATE_CONSTITUTIONAL_DOCUMENT",
  "SHAREHOLDER_AGREEMENT",
  "LETTER_OF_WISHES",
] as const;
export type SuperiorInstrument = (typeof SUPERIOR_INSTRUMENTS)[number];

export function isSuperiorInstrument(value: string): value is SuperiorInstrument {
  return (SUPERIOR_INSTRUMENTS as readonly string[]).includes(value);
}

/**
 * Matters reserved to Trustees (or to the Trust Protector where the instrument
 * grants the power). A family body may ADVISE on these; it may not DECIDE them
 * unless a superior instrument validly confers the power.
 */
export const TRUSTEE_RESERVED_MATTERS = [
  "TRUST_DISTRIBUTION",
  "TRUST_AMENDMENT",
  "TRUSTEE_APPOINTMENT",
  "TRUSTEE_REMOVAL",
  "TRUSTEE_REPLACEMENT",
  "TRUST_INVESTMENT",
  "BENEFICIARY_DETERMINATION",
  "TRUST_PROTECTOR_EXERCISE",
] as const;
export type TrusteeReservedMatter = (typeof TRUSTEE_RESERVED_MATTERS)[number];

export function isTrusteeReservedMatter(value: string): value is TrusteeReservedMatter {
  return (TRUSTEE_RESERVED_MATTERS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Family line                                                         */
/* ------------------------------------------------------------------ */

/**
 * How a person is connected to the family line.
 *
 * Only `BIRTH_DESCENDANT` — and `ADOPTED_CHILD` where a governing instrument
 * says so — can ever produce DIRECT_DESCENDANT status. Everything else is
 * affinity, not descent, and marriage never converts one into the other.
 */
export const LINEAGE_RELATIONSHIPS = [
  "BIRTH_DESCENDANT",
  "ADOPTED_CHILD",
  "STEPCHILD",
  "SPOUSE_OF_MEMBER",
  "FORMER_SPOUSE_OF_MEMBER",
  "OTHER_AFFINAL",
  "NON_FAMILY",
] as const;
export type LineageRelationship = (typeof LINEAGE_RELATIONSHIPS)[number];

/** Relationships that are affinity (created by marriage/partnership), never descent. */
export const AFFINAL_RELATIONSHIPS: readonly LineageRelationship[] = [
  "SPOUSE_OF_MEMBER",
  "FORMER_SPOUSE_OF_MEMBER",
  "OTHER_AFFINAL",
];

/** Relationships that are, or may be, descent. */
export const DESCENT_RELATIONSHIPS: readonly LineageRelationship[] = [
  "BIRTH_DESCENDANT",
  "ADOPTED_CHILD",
  "STEPCHILD",
];

export function isAffinalRelationship(r: LineageRelationship): boolean {
  return AFFINAL_RELATIONSHIPS.includes(r);
}

/**
 * The four possible answers to "is this person a direct descendant?".
 *
 * INDETERMINATE is a first-class answer, not an error state: an unverified
 * lineage, an adoption whose treatment is not fixed by the governing framework,
 * or a broken parent chain all produce it, together with the specific reason.
 */
export const DESCENDANT_STATUSES = [
  "DIRECT_DESCENDANT",
  "ADOPTION_UNCONFIRMED",
  "NON_DESCENDANT",
  "INDETERMINATE",
] as const;
export type DescendantStatus = (typeof DESCENDANT_STATUSES)[number];

/** Lineage verification states already defined by `beyu_verification_status`. */
export const LINEAGE_VERIFICATION_STATES = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const;
export type LineageVerificationState = (typeof LINEAGE_VERIFICATION_STATES)[number];

/** Evidence that may support a lineage claim. Recorded, never inferred from names. */
export const LINEAGE_EVIDENCE_TYPES = [
  "BIRTH_CERTIFICATE",
  "NATIONAL_ID",
  "PASSPORT",
  "COURT_ORDER_ADOPTION",
  "MARRIAGE_CERTIFICATE",
  "DIVORCE_DECREE",
  "DNA_TEST",
  "TRUST_REGISTER_ENTRY",
  "FAMILY_COUNCIL_RESOLUTION",
  "SWORN_DECLARATION",
  "OTHER_DOCUMENT",
] as const;
export type LineageEvidenceType = (typeof LINEAGE_EVIDENCE_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

/**
 * The domains in which the DIRECT DESCENDANT PRINCIPLE applies.
 *
 * Every one of these is subject to the governing legal instruments, applicable
 * law, jurisdiction and valid estate/trust arrangements. This engine decides
 * eligibility UNDER THE FAMILY'S OWN POLICY only; a positive result is a family
 * policy determination and never a legal or trust conferral.
 */
export const ELIGIBILITY_DOMAINS = [
  "FAMILY_OWNERSHIP",
  "SHARES",
  "DIRECT_FAMILY_PRIVILEGES",
  "DIRECT_TRUST_BENEFIT",
  "DIRECT_CAPITAL_PARTICIPATION",
  "DIRECT_SUCCESSION_RIGHT",
] as const;
export type EligibilityDomain = (typeof ELIGIBILITY_DOMAINS)[number];

export const ELIGIBILITY_RESULTS = ["ELIGIBLE", "NOT_ELIGIBLE", "INDETERMINATE"] as const;
export type EligibilityResult = (typeof ELIGIBILITY_RESULTS)[number];

/* ------------------------------------------------------------------ */
/* Institution layer: forums, participation, committees                */
/* ------------------------------------------------------------------ */

/**
 * The family governance ladder. Order is escalation order, not authority order:
 * a Family Council recommendation is ADVISORY to Trustees whatever its rank.
 */
export const FORUM_TYPES = [
  "FAMILY_MEETING",
  "FAMILY_ASSEMBLY",
  "FAMILY_COUNCIL",
  "GOVERNANCE_COMMITTEE",
  "FAMILY_OFFICE",
  "PROFESSIONAL_MANAGEMENT",
] as const;
export type ForumType = (typeof FORUM_TYPES)[number];

/** Forums that are family bodies rather than professional execution. */
export const FAMILY_FORUMS: readonly ForumType[] = [
  "FAMILY_MEETING",
  "FAMILY_ASSEMBLY",
  "FAMILY_COUNCIL",
  "GOVERNANCE_COMMITTEE",
];

export function forumRank(forum: ForumType): number {
  return FORUM_TYPES.indexOf(forum);
}

/**
 * Participation is SIX INDEPENDENT AXES, not one ladder.
 *
 * Attendance, consultation, voting, ownership, beneficiary status and governance
 * rights are not automatically equivalent, and none of them is derived from
 * another. A person may attend without voting, own without governing, benefit
 * without owning, or govern without owning. Conflating any two is a modelling
 * error and `assertParticipationAxesIndependent` rejects it.
 */
export const PARTICIPATION_AXES = [
  "ATTENDANCE",
  "CONSULTATION",
  "VOTING",
  "OWNERSHIP",
  "BENEFICIARY",
  "GOVERNANCE_RIGHT",
] as const;
export type ParticipationAxis = (typeof PARTICIPATION_AXES)[number];

export type ParticipationGrant = Partial<Record<ParticipationAxis, boolean>>;

/** The ten configurable governance committees named in the institution mandate. */
export const GOVERNANCE_COMMITTEES = [
  "FAMILY_INVESTMENT_COMMITTEE",
  "FAMILY_CAPITAL_COMMITTEE",
  "TRUST_COMMITTEE",
  "EDUCATION_COMMITTEE",
  "SUCCESSION_COMMITTEE",
  "FAMILY_BUSINESS_COMMITTEE",
  "PHILANTHROPY_COMMITTEE",
  "RISK_COMMITTEE",
  "AUDIT_COMPLIANCE_COMMITTEE",
  "FAMILY_HEALTH_PROTECTION_COMMITTEE",
  "FAMILY_LOAN_COMMITTEE",
] as const;
export type GovernanceCommittee = (typeof GOVERNANCE_COMMITTEES)[number];

/** A committee mandate is incomplete unless all ten elements are present. */
export const COMMITTEE_MANDATE_ELEMENTS = [
  "mandate",
  "membership",
  "authority",
  "term",
  "quorum",
  "voting",
  "conflicts",
  "recusal",
  "reporting",
  "escalation",
] as const;
export type CommitteeMandateElement = (typeof COMMITTEE_MANDATE_ELEMENTS)[number];

/* ------------------------------------------------------------------ */
/* Family Constitution                                                 */
/* ------------------------------------------------------------------ */

export const CONSTITUTION_DOMAINS = [
  "FAMILY_PURPOSE",
  "FAMILY_GOVERNANCE",
  "FAMILY_CAPITAL",
  "FAMILY_DEVELOPMENT",
  "FAMILY_SUCCESSION",
  "FAMILY_CONDUCT",
  "FAMILY_PHILANTHROPY",
  "AMENDMENT_PROCEDURE",
] as const;
export type ConstitutionDomain = (typeof CONSTITUTION_DOMAINS)[number];

/**
 * The governed amendment pipeline. A proposal moves strictly forward through
 * these stages; skipping one is refused, and no stage may be completed by an
 * AI actor.
 */
export const AMENDMENT_STAGES = [
  "PROPOSED",
  "LEGAL_REVIEW",
  "GOVERNANCE_REVIEW",
  "VOTING",
  "APPROVED",
  "VERIFIED",
  "EFFECTIVE",
  "RECORDED",
] as const;
export type AmendmentStage = (typeof AMENDMENT_STAGES)[number];

export function amendmentStageRank(stage: AmendmentStage): number {
  return AMENDMENT_STAGES.indexOf(stage);
}

export const AMENDMENT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "IN_VOTING",
  "APPROVED",
  "REJECTED",
  "EFFECTIVE",
  "SUPERSEDED",
  "WITHDRAWN",
] as const;
export type AmendmentStatus = (typeof AMENDMENT_STATUSES)[number];

/** Version status vocabulary already defined by `beyu_version_status`. */
export const VERSION_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED", "RETIRED"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Family capital                                                      */
/* ------------------------------------------------------------------ */

/** The six canonical capital pools. A pool is a MANDATE, not a bank account. */
export const CAPITAL_POOLS = [
  "PERMANENT_CAPITAL",
  "OPPORTUNITY_CAPITAL",
  "FAMILY_LENDING_CAPITAL",
  "LIQUIDITY_RESERVE",
  "PHILANTHROPIC_CAPITAL",
  "NEXT_GENERATION_CAPITAL",
] as const;
export type CapitalPool = (typeof CAPITAL_POOLS)[number];

/**
 * Asset segregation classes. Capital may never move from one class to another
 * without legal authority, policy, approval, accounting treatment, tax
 * treatment and audit — all six, always.
 */
export const ASSET_SEGREGATION_CLASSES = [
  "TRUST_ASSETS",
  "FAMILY_CAPITAL",
  "PERSONAL_ASSETS",
  "FAMILY_OFFICE_OPERATING",
  "COMPANY_ASSETS",
  "BUSINESS_ASSETS",
  "PHILANTHROPIC_ASSETS",
  "INVESTMENT_VEHICLES",
  "LIFESTYLE_ASSETS",
] as const;
export type AssetSegregationClass = (typeof ASSET_SEGREGATION_CLASSES)[number];

export const SEGREGATION_PRECONDITIONS = [
  "LEGAL_AUTHORITY",
  "POLICY",
  "APPROVAL",
  "ACCOUNTING_TREATMENT",
  "TAX_TREATMENT",
  "AUDIT",
] as const;
export type SegregationPrecondition = (typeof SEGREGATION_PRECONDITIONS)[number];

/** The 13-step capital allocation chain. Order is the enforced order. */
export const CAPITAL_ALLOCATION_STEPS = [
  "CAPITAL_REQUEST",
  "PURPOSE",
  "ELIGIBILITY",
  "POLICY",
  "RISK",
  "LIQUIDITY",
  "LEGAL_TAX",
  "CONFLICT",
  "AUTHORITY",
  "APPROVAL",
  "EXECUTION",
  "FINANCIAL_RECORD",
  "MONITORING",
] as const;
export type CapitalAllocationStep = (typeof CAPITAL_ALLOCATION_STEPS)[number];

/* ------------------------------------------------------------------ */
/* Family Loan Office                                                  */
/* ------------------------------------------------------------------ */

export const LOAN_TYPES = [
  "EDUCATION",
  "PROFESSIONAL_DEVELOPMENT",
  "HOUSING",
  "ENTREPRENEURSHIP",
  "BUSINESS_EXPANSION",
  "ASSET_ACQUISITION",
  "INVESTMENT",
  "EMERGENCY",
  "BRIDGE",
  "STRATEGIC_FAMILY_LENDING",
] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

export const LOAN_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_ASSESSMENT",
  "APPROVED",
  "DOCUMENTED",
  "DISBURSED",
  "REPAYING",
  "RESTRUCTURED",
  "REFINANCED",
  "IN_DEFAULT",
  "IN_RECOVERY",
  "FORGIVEN",
  "CLOSED",
  "REJECTED",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** The disciplines a family loan must record. Absent any one, it is not a loan. */
export const LOAN_DISCIPLINE_FIELDS = [
  "lender",
  "borrower",
  "amount",
  "currency",
  "purpose",
  "interest",
  "tenor",
  "repayment",
  "collateral",
  "guarantor",
  "authority",
  "approval",
  "legalDocumentation",
  "taxTreatment",
  "accountingTreatment",
  "status",
  "auditTrail",
] as const;
export type LoanDisciplineField = (typeof LOAN_DISCIPLINE_FIELDS)[number];

export const BORROWER_CLASSES = [
  "ELIGIBLE_DESCENDANT",
  "AUTHORIZED_FAMILY_MEMBER",
  "APPROVED_FAMILY_VENTURE",
  "FAMILY_CONTROLLED_ENTITY",
  "APPROVED_STRATEGIC_PROJECT",
] as const;
export type BorrowerClass = (typeof BORROWER_CLASSES)[number];

/* ------------------------------------------------------------------ */
/* Decision gate                                                       */
/* ------------------------------------------------------------------ */

/** Every material decision follows this pipeline, in this order. */
export const DECISION_GATE_STEPS = [
  "REQUEST",
  "VALIDATE",
  "CHECK_POLICY",
  "CHECK_AUTHORITY",
  "CHECK_CONFLICT",
  "CHECK_RISK",
  "APPROVE",
  "EXECUTE",
  "RECORD",
  "AUDIT",
  "MONITOR",
] as const;
export type DecisionGateStep = (typeof DECISION_GATE_STEPS)[number];

/** The last step an AI actor may reach. APPROVE and beyond are human-only. */
export const LAST_AI_PERMITTED_STEP: DecisionGateStep = "CHECK_RISK";

/* ------------------------------------------------------------------ */
/* Noelia governance alignment                                         */
/* ------------------------------------------------------------------ */

export const ALIGNMENT_STATUSES = [
  "ALIGNED",
  "PARTIALLY_ALIGNED",
  "DEVIATING",
  "MATERIALLY_DEVIATING",
  "UNAUTHORIZED",
  "POLICY_UNKNOWN",
] as const;
export type AlignmentStatus = (typeof ALIGNMENT_STATUSES)[number];

export const DEVIATION_SEVERITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type DeviationSeverity = (typeof DEVIATION_SEVERITIES)[number];

/**
 * The reference set a decision is measured against. A reference that is absent
 * is not a pass: uncovered policy yields POLICY_UNKNOWN.
 */
export const ALIGNMENT_REFERENCE_DOMAINS = [
  "FAMILY_CONSTITUTION",
  "TRUST_POLICY",
  "FAMILY_OFFICE_MANDATE",
  "FAMILY_CAPITAL_POLICY",
  "INVESTMENT_POLICY",
  "GOVERNANCE_RESOLUTIONS",
  "CORPORATE_STRATEGY",
  "LEGAL_CONSTRAINTS",
  "RISK_POLICY",
  "APPROVED_CAPITAL_ALLOCATION",
  "SUCCESSION_OBJECTIVES",
  "FAMILY_VALUES",
] as const;
export type AlignmentReferenceDomain = (typeof ALIGNMENT_REFERENCE_DOMAINS)[number];

export const REFERENCE_COVERAGE_STATES = [
  "COVERED",
  "NOT_APPLICABLE",
  "NOT_RATIFIED",
  "MISSING",
] as const;
export type ReferenceCoverageState = (typeof REFERENCE_COVERAGE_STATES)[number];

/* ------------------------------------------------------------------ */
/* Institutional memory                                                */
/* ------------------------------------------------------------------ */

/**
 * Every institutional-memory record must declare which of these it is. A record
 * with no class is refused: an AI-generated analysis that is stored unclassified
 * will eventually be read as a verified fact.
 */
export const MEMORY_RECORD_CLASSES = [
  "VERIFIED_FACT",
  "OFFICIAL_DECISION",
  "HISTORICAL_RECORD",
  "OPINION",
  "RECOMMENDATION",
  "AI_GENERATED_ANALYSIS",
] as const;
export type MemoryRecordClass = (typeof MEMORY_RECORD_CLASSES)[number];

/* ------------------------------------------------------------------ */
/* Policy decisions                                                    */
/* ------------------------------------------------------------------ */

export const POLICY_DECISION_STATUSES = ["OPEN", "IN_REVIEW", "DECIDED", "REJECTED"] as const;
export type PolicyDecisionStatus = (typeof POLICY_DECISION_STATUSES)[number];

/**
 * POLICY DECISION REQUIRED.
 *
 * Raised whenever authoritative evidence is absent. It records the question; it
 * never answers it. `decision` stays null until a human with the recorded
 * authority decides it, and the resolution must cite a governance reference.
 */
export type PolicyDecisionRequirement = {
  /** Stable code, e.g. "FAM-PD-004". */
  code: string;
  issue: string;
  domain: ConstitutionDomain | EligibilityDomain | CapitalPool | "INSTITUTION";
  /** The genuine options, including "do nothing yet". Never a recommended answer. */
  options: string[];
  /** Assumptions the question rests on. An empty list asserts none were made. */
  assumptions: string[];
  legalImplications: string;
  taxImplications: string;
  financialImplications: string;
  risk: string;
  /** Descriptive: who must decide. This is a requirement, not a grant. */
  decisionAuthority: string;
  status: PolicyDecisionStatus;
  /** Null until a human authority decides. Never populated by an AI actor. */
  decision: string | null;
  /** Governance reference (resolution / instrument) evidencing the decision. */
  decisionReference: string | null;
  effectiveDate: string | null;
};

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type FamilyInstitutionErrorCode =
  | "RULE_VIOLATION"
  | "AI_AUTHORITY_REFUSED"
  | "LEGAL_SUPREMACY_VIOLATION"
  | "TRUSTEE_AUTHORITY_VIOLATION"
  | "SEGREGATION_VIOLATION"
  | "UNDOCUMENTED_TRANSFER"
  | "AUTOMATIC_CONFERMENT_REFUSED"
  | "POLICY_DECISION_REQUIRED";

/**
 * Thrown when a caller asks this layer to do something it structurally cannot
 * do. These are not validation errors on user input — they are refusals of
 * architecturally forbidden operations, and no amount of correct input makes
 * them permitted.
 */
export class FamilyInstitutionError extends Error {
  constructor(
    readonly code: FamilyInstitutionErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FamilyInstitutionError";
  }
}

/**
 * Refuse an AI actor at any gate that confers authority.
 *
 * Noelia operates through identity, permissions, governance, data boundaries,
 * audit and human accountability. It never creates legal authority and never
 * becomes constitutional authority.
 */
export function assertHumanAuthority(actorType: FamilyActorType, gate: string): void {
  if (actorType === "AI") {
    throw new FamilyInstitutionError(
      "AI_AUTHORITY_REFUSED",
      `An AI actor may not ${gate}. Noelia may analyse, recommend and draft; authority is human.`,
      { gate },
    );
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      `${label} must be an ISO date (YYYY-MM-DD); received "${value}".`,
    );
  }
}

/** Present means a non-empty string, or a number, or a non-empty array/object. */
export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

/** Ordered list of the keys whose value is absent — deterministic, for audit. */
export function absentFields(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((k) => !isPresent(record[k]))
    .sort();
}
