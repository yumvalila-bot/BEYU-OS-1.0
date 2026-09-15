/**
 * BEYU OS — GOVERNED CONTRACTING SHARED VOCABULARY.
 *
 * Single definition of the contracting enums, consumed by the deterministic
 * engines (`model.ts`, `obligation.ts`, `party.ts`, `signing.ts`,
 * `documents.ts`), the governed services, the API routes and the database
 * CHECK constraints in migrations 0042/0043. A closed vocabulary is a control:
 * the services refuse any value outside these tuples, so an unreviewed state,
 * type or check can never enter the register — the same DENY-final principle
 * the equity and trust domains use for leaver conditions.
 *
 * This file defines NO authority. Permissions live in `src/lib/constants.ts`;
 * RLS remains the final database boundary; Finance OS remains the sole
 * accounting authority. Nothing here posts money, mints tokens or determines
 * legal enforceability.
 */

/* ------------------------------------------------------------------ */
/* §14 — Contract types (one governed capability, not an OS)          */
/* ------------------------------------------------------------------ */

export const CONTRACT_TYPES = [
  "EMPLOYMENT",
  "OFFER_LETTER",
  "NON_DISCLOSURE",
  "IP_ASSIGNMENT",
  "NON_COMPETE",
  "SUPPLIER",
  "PROCUREMENT",
  "SERVICE",
  "CONSULTANCY",
  "CONTRACTOR",
  "PURCHASE_ORDER",
  "FRAMEWORK",
  "SLA",
  "MOU",
  "GRANT",
  "DONOR",
  "NGO_IMPLEMENTATION",
  "GOVERNMENT",
  "AGENCY",
  "DISTRIBUTION",
  "LICENSING",
  "LEASE",
  "FINANCING",
  "SHAREHOLDER",
  "INVESTMENT",
  "RESEARCH",
  "DATA_SHARING",
  "DATA_PROCESSING",
  "HEALTH_SECTOR",
  "AGRICULTURE",
  "EXPORT",
  "TECHNOLOGY",
  "REFERRAL",
  "OUTSOURCING",
  "WORK_ORDER",
  "AMENDMENT",
  "RENEWAL",
  "TERMINATION",
  "SETTLEMENT",
  "INTERCOMPANY",
] as const;
export type ContractTypeCode = (typeof CONTRACT_TYPES)[number];

/** Human-readable governing-law expectation per type family (metadata, not law). */
export const CONTRACT_TYPE_FAMILIES: Record<ContractTypeCode, string> = {
  EMPLOYMENT: "WORKFORCE",
  OFFER_LETTER: "WORKFORCE",
  NON_DISCLOSURE: "CONFIDENTIALITY_AND_IP",
  IP_ASSIGNMENT: "CONFIDENTIALITY_AND_IP",
  NON_COMPETE: "WORKFORCE",
  SUPPLIER: "COMMERCIAL",
  PROCUREMENT: "COMMERCIAL",
  SERVICE: "COMMERCIAL",
  CONSULTANCY: "WORKFORCE",
  CONTRACTOR: "WORKFORCE",
  PURCHASE_ORDER: "COMMERCIAL",
  FRAMEWORK: "COMMERCIAL",
  SLA: "COMMERCIAL",
  MOU: "PUBLIC_AND_PARTNERSHIP",
  GRANT: "PUBLIC_AND_PARTNERSHIP",
  DONOR: "PUBLIC_AND_PARTNERSHIP",
  NGO_IMPLEMENTATION: "PUBLIC_AND_PARTNERSHIP",
  GOVERNMENT: "PUBLIC_AND_PARTNERSHIP",
  AGENCY: "PUBLIC_AND_PARTNERSHIP",
  DISTRIBUTION: "COMMERCIAL",
  LICENSING: "CONFIDENTIALITY_AND_IP",
  LEASE: "ASSET",
  FINANCING: "CAPITAL",
  SHAREHOLDER: "CAPITAL",
  INVESTMENT: "CAPITAL",
  RESEARCH: "PUBLIC_AND_PARTNERSHIP",
  DATA_SHARING: "DATA",
  DATA_PROCESSING: "DATA",
  HEALTH_SECTOR: "SECTOR",
  AGRICULTURE: "SECTOR",
  EXPORT: "SECTOR",
  TECHNOLOGY: "COMMERCIAL",
  REFERRAL: "COMMERCIAL",
  OUTSOURCING: "COMMERCIAL",
  WORK_ORDER: "COMMERCIAL",
  AMENDMENT: "LIFECYCLE",
  RENEWAL: "LIFECYCLE",
  TERMINATION: "LIFECYCLE",
  SETTLEMENT: "DISPUTE",
  INTERCOMPANY: "CAPITAL",
};

/**
 * Counterparty relationship classes (§16). These drive KYC/KYB requirements and
 * compliance screening; they are NOT an identity system. Legal identity remains
 * canonical in `parties`, organizations in `legal_entities`.
 */
export const COUNTERPARTY_KINDS = [
  "EMPLOYEE",
  "CONTRACTOR",
  "CANDIDATE",
  "FOUNDING_PARTY",
  "DIRECTOR",
  "TRUSTEE",
  "SUPPLIER",
  "VENDOR",
  "CUSTOMER",
  "SUBSIDIARY",
  "SISTER_ENTITY",
  "NGO",
  "DONOR",
  "GOVERNMENT_MINISTRY",
  "GOVERNMENT_AGENCY",
  "GOVERNMENT_DEPARTMENT",
  "GOVERNMENT_LOCAL_AUTHORITY",
  "DEVELOPMENT_PARTNER",
  "INTERNATIONAL_ORGANIZATION",
  "BANK",
  "INSURER",
  "INVESTOR",
  "UNIVERSITY",
  "SCHOOL",
  "HOSPITAL",
  "COOPERATIVE",
  "RESEARCH_INSTITUTION",
  "COMMUNITY",
  "OTHER_AUTHORIZED",
] as const;
export type CounterpartyKind = (typeof COUNTERPARTY_KINDS)[number];

/** Authority roles a BEYU signatory may hold in `entity_appointments`. */
export const SIGNATORY_ROLE_KINDS = [
  "DIRECTOR",
  "CEO",
  "CFO",
  "GENERAL_COUNSEL",
  "FOUNDATION_OFFICER",
  "TRUSTEE",
  "PROTECTOR",
  "SECTOR_DIRECTOR",
  "HCM_DIRECTOR",
  "AUTHORIZED_SIGNATORY",
] as const;
export type SignatoryRoleKind = (typeof SIGNATORY_ROLE_KINDS)[number];

/* ------------------------------------------------------------------ */
/* §15 — Lifecycle                                                     */
/* ------------------------------------------------------------------ */

export const CONTRACT_LIFECYCLE_STATES = [
  "REQUESTED",
  "DRAFTING",
  "INTERNAL_REVIEW",
  "COUNTERPARTY_REVIEW",
  "LEGAL_REVIEW",
  "RISK_REVIEW",
  "COMMERCIAL_APPROVAL",
  "AUTHORITY_VERIFICATION",
  "SIGNATURE_PENDING",
  "EXECUTED",
  "ACTIVE",
  "PERFORMANCE_MONITORING",
  "AMENDED",
  "RENEWED",
  "COMPLETED",
  "TERMINATED",
  "EXPIRED",
  "DISPUTED",
  "SUSPENDED",
  "ARCHIVED",
] as const;
export type ContractLifecycleState = (typeof CONTRACT_LIFECYCLE_STATES)[number];

/** Terminal states accept no further lifecycle transition (only governed supersession). */
export const CONTRACT_TERMINAL_STATES = [
  "COMPLETED",
  "TERMINATED",
  "EXPIRED",
  "ARCHIVED",
] as const as readonly ContractLifecycleState[];

/** States in which the agreement is operative for obligations and execution. */
export const CONTRACT_PERFORMING_STATES = [
  "ACTIVE",
  "PERFORMANCE_MONITORING",
  "AMENDED",
  "RENEWED",
] as const as readonly ContractLifecycleState[];

/** Pre-execution states: the document may still be edited; nothing is binding. */
export const CONTRACT_PRE_EXECUTION_STATES = [
  "REQUESTED",
  "DRAFTING",
  "INTERNAL_REVIEW",
  "COUNTERPARTY_REVIEW",
  "LEGAL_REVIEW",
  "RISK_REVIEW",
  "COMMERCIAL_APPROVAL",
  "AUTHORITY_VERIFICATION",
  "SIGNATURE_PENDING",
] as const as readonly ContractLifecycleState[];

/**
 * Review-gate identities (§15, §17). A gate is closed only by a recorded human
 * act carrying the named authority; the software never infers closure.
 */
export const CONTRACT_REVIEW_GATES = [
  "INTERNAL_REVIEW",
  "COUNTERPARTY_REVIEW",
  "LEGAL_REVIEW",
  "RISK_REVIEW",
  "COMMERCIAL_APPROVAL",
  "AUTHORITY_VERIFICATION",
] as const;
export type ContractReviewGate = (typeof CONTRACT_REVIEW_GATES)[number];

/* ------------------------------------------------------------------ */
/* §17 — Authority engine                                              */
/* ------------------------------------------------------------------ */

export const AUTHORITY_CHECK_KINDS = [
  "CONTRACTING_ENTITY_IDENTIFIED",
  "COUNTERPARTY_IDENTIFIED",
  "SIGNATORY_AUTHORITY",
  "DELEGATION_VALID",
  "APPROVAL_THRESHOLD_MET",
  "BOARD_APPROVAL",
  "TRUSTEE_APPROVAL",
  "SHAREHOLDER_APPROVAL",
  "FINANCE_APPROVAL",
  "PROCUREMENT_APPROVAL",
  "LEGAL_REVIEW_CLOSED",
  "RISK_REVIEW_CLOSED",
  "REGULATORY_RESTRICTIONS_CHECKED",
  "CONFLICTS_CHECKED",
  "COMPLIANCE_RESTRICTIONS_CHECKED",
  "RESERVED_MATTERS_CHECKED",
] as const;
export type AuthorityCheckKind = (typeof AUTHORITY_CHECK_KINDS)[number];

/** A determination row is stored per check; these are the only permitted results. */
export const AUTHORITY_CHECK_RESULTS = [
  "SATISFIED",
  "MISSING",
  "NOT_REQUIRED",
  "BLOCKED_BY_RESTRICTION",
] as const;
export type AuthorityCheckResult = (typeof AUTHORITY_CHECK_RESULTS)[number];

/* ------------------------------------------------------------------ */
/* §18 — Obligations                                                   */
/* ------------------------------------------------------------------ */

export const OBLIGATION_KINDS = [
  "PAYMENT",
  "DELIVERY",
  "MILESTONE",
  "REPORTING",
  "COMPLIANCE",
  "DATA",
  "AUDIT",
  "PERFORMANCE",
  "RENEWAL_NOTICE",
  "TERMINATION_NOTICE",
  "INSURANCE",
  "QUALITY",
  "ACCEPTANCE",
  "SAFEGUARDING",
  "OTHER",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OBLIGATION_STATES = [
  "PENDING",
  "IN_PROGRESS",
  "DELIVERED",
  "VERIFIED",
  "CLOSED",
  "WAIVED",
  "DISPUTED",
  "OVERDUE",
  "TERMINATED_WITH_CONTRACT",
] as const;
export type ObligationState = (typeof OBLIGATION_STATES)[number];

/** Who owes the performance. Legal identity stays canonical in `parties`. */
export const OBLIGATION_RESPONSIBLE_PARTY_ROLES = [
  "BEYU_ENTITY",
  "COUNTERPARTY",
  "THIRD_PARTY",
  "JOINT",
] as const;
export type ObligationResponsiblePartyRole = (typeof OBLIGATION_RESPONSIBLE_PARTY_ROLES)[number];

export const OBLIGATION_RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ObligationSeverity = (typeof OBLIGATION_RISK_SEVERITIES)[number];

/* ------------------------------------------------------------------ */
/* §22 — Legal document lifecycle (registry extension)                 */
/* ------------------------------------------------------------------ */

/**
 * Document classes recognised by the legal document registry extension. The
 * canonical rows, checksums, retention policy codes and storage URIs remain in
 * `documents` (platform.ts); this class list only organises the governed legal
 * surface the mandate requires (Founders Agreement → Term sheets).
 */
export const LEGAL_DOCUMENT_CLASSES = [
  "FOUNDERS_AGREEMENT",
  "INCORPORATION",
  "SHAREHOLDERS_AGREEMENT",
  "COFOUNDER_EXIT",
  "CAP_TABLE",
  "ESOP_AGREEMENT",
  "NDA",
  "IP_ASSIGNMENT",
  "NON_COMPETE",
  "TRADEMARK_IP",
  "EMPLOYEE_CONTRACT",
  "OFFER_LETTER",
  "HR_POLICY",
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
  "DATA_PROTECTION_POLICY",
  "DATA_SHARING_AGREEMENT",
  "COMPLIANCE_DOCUMENT",
  "DONOR_AGREEMENT",
  "NGO_AGREEMENT",
  "GOVERNMENT_AGREEMENT",
  "FINANCING_DOCUMENT",
  "TERM_SHEET",
  "GRANT_AGREEMENT",
  "BOARD_RESOLUTION",
  "TRUST_INSTRUMENT",
  "OTHER_LEGAL",
] as const;
export type LegalDocumentClass = (typeof LEGAL_DOCUMENT_CLASSES)[number];

export const LEGAL_DOCUMENT_STATES = [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "EXECUTED",
  "SUPERSEDED",
  "EXPIRED",
  "WITHDRAWN",
  "LEGAL_HOLD",
  "ARCHIVED",
] as const;
export type LegalDocumentState = (typeof LEGAL_DOCUMENT_STATES)[number];

/** Execution method is metadata about HOW a document was executed, never a legal conclusion. */
export const EXECUTION_METHODS = [
  "WET_INK",
  "QUALIFIED_ELECTRONIC_SIGNATURE",
  "SIMPLE_ELECTRONIC_SIGNATURE",
  "BOARD_RESOLUTION",
  "DEED_UNDER_SEAL",
  "COUNTERSIGNED_DIGITAL",
  "ONCHAIN_ATTESTED",
  "NOT_APPLICABLE",
] as const;
export type ExecutionMethod = (typeof EXECUTION_METHODS)[number];

/**
 * Enforceability states. `REQUIRES_LEGAL_REVIEW` is the mandatory default: the
 * software never assumes a document, signature or on-chain anchor is legally
 * enforceable in a jurisdiction (§23, §74).
 */
export const ENFORCEABILITY_STATES = [
  "REQUIRES_LEGAL_REVIEW",
  "LEGAL_REVIEW_OPEN",
  "LEGAL_REVIEW_CLOSED",
  "COUNSEL_CONFIRMED_ENFORCEABLE",
  "COUNSEL_CONFIRMED_UNENFORCEABLE",
  "JURISDICTION_DEPENDENT",
  "NOT_APPLICABLE",
] as const;
export type EnforceabilityState = (typeof ENFORCEABILITY_STATES)[number];

/** Canonical legal-review tokens shared with the equity/trust domains. */
export const LEGAL_REVIEW_CLOSED = "LEGAL_REVIEW_CLOSED";
export const REQUIRES_LEGAL_REVIEW = "REQUIRES_LEGAL_REVIEW";

/* ------------------------------------------------------------------ */
/* §38 — Signatures                                                    */
/* ------------------------------------------------------------------ */

export const SIGNATURE_STATES = [
  "PENDING",
  "SIGNED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;
export type SignatureState = (typeof SIGNATURE_STATES)[number];

/* ------------------------------------------------------------------ */
/* §39 — Disputes                                                      */
/* ------------------------------------------------------------------ */

export const DISPUTE_TYPES = [
  "OBLIGATION_DISPUTED",
  "BREACH",
  "PAYMENT_DISPUTE",
  "DELIVERY_DISPUTE",
  "PERFORMANCE_DISPUTE",
  "ORACLE_DISPUTE",
  "MEDIATION",
  "ARBITRATION",
  "LITIGATION",
  "SETTLEMENT",
] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const DISPUTE_STATES = [
  "OPEN",
  "ESCALATED",
  "IN_MEDIATION",
  "IN_ARBITRATION",
  "IN_LITIGATION",
  "SETTLED",
  "WITHDRAWN",
  "CLOSED",
] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

/* ------------------------------------------------------------------ */
/* §20 — Supplier / vendor contracting                                 */
/* ------------------------------------------------------------------ */

export const SLA_METRIC_OUTCOMES = ["MET", "PARTIALLY_MET", "MISSED", "NOT_MEASURED"] as const;
export type SlaMetricOutcome = (typeof SLA_METRIC_OUTCOMES)[number];

/**
 * Money-adjacent obligations are recorded as governed references to Finance OS;
 * this constant names the authoritative owner used in every reference column so
 * there is exactly one accounting authority (§44, §45).
 */
export const FINANCE_OS_AUTHORITATIVE_OWNER = "FINANCE_OS";
