/**
 * BEYU Federation & Trust — canonical state catalogues (shared capability).
 *
 * ONE capability, many jurisdictions. These catalogues are the TypeScript
 * mirror of the closed catalogues enforced by CHECK constraints in migration
 * 0071; the DB is the final boundary, this module is the single import point
 * for every engine, API and UI in the federation plane.
 *
 * DESIGN LAW (program §7, §10, §100):
 *  - "authority exists" is NEVER "BEYU is connected". Registration,
 *    verification, connection and cost are separate dimensions.
 *  - No state about external reality may be promoted without evidence rows.
 *  - Everything unverified is UNKNOWN / UNCERTAIN — never invented.
 */

/* ------------------------------------------------------------------ */
/* Federation lifecycle (program §8)                                   */
/* ------------------------------------------------------------------ */

export const FEDERATION_LIFECYCLE = [
  "DISCOVERED",
  "CLASSIFIED",
  "AUTHORITY_CONFIRMED",
  "LEGAL_BASIS_CONFIRMED",
  "AGREEMENT_REQUIRED",
  "AGREEMENT_CONFIRMED",
  "ACCESS_REQUESTED",
  "CREDENTIALS_PROVISIONED",
  "SANDBOX",
  "SECURITY_TEST",
  "INTEROPERABILITY_TEST",
  "DATA_VALIDATION",
  "AUTHORITY_ACCEPTANCE",
  "PRODUCTION_APPROVAL",
  "LIVE",
  "LIVE_VERIFIED",
  "MONITORED",
  "SUSPENDED",
  "REVOKED",
  "EXPIRED",
  "DEGRADED",
  "FAILED_VERIFICATION",
] as const;
export type FederationLifecycle = (typeof FEDERATION_LIFECYCLE)[number];

/** States that assert external production reality — evidence-gated (0071 CHECK). */
export const EVIDENCE_GATED_LIFECYCLE: readonly FederationLifecycle[] = [
  "PRODUCTION_APPROVAL",
  "LIVE",
  "LIVE_VERIFIED",
];

/**
 * Allowed lifecycle transitions. Forward path + governed exceptional moves.
 * Anything not listed here is refused by `assertLifecycleTransition`
 * (fail-closed; program §85/§86).
 */
export const LIFECYCLE_TRANSITIONS: Record<FederationLifecycle, readonly FederationLifecycle[]> = {
  DISCOVERED: ["CLASSIFIED", "SUSPENDED", "REVOKED", "FAILED_VERIFICATION"],
  CLASSIFIED: ["AUTHORITY_CONFIRMED", "FAILED_VERIFICATION", "SUSPENDED", "REVOKED"],
  AUTHORITY_CONFIRMED: ["LEGAL_BASIS_CONFIRMED", "FAILED_VERIFICATION", "SUSPENDED", "REVOKED", "EXPIRED"],
  LEGAL_BASIS_CONFIRMED: ["AGREEMENT_REQUIRED", "ACCESS_REQUESTED", "SUSPENDED", "REVOKED", "EXPIRED"],
  AGREEMENT_REQUIRED: ["AGREEMENT_CONFIRMED", "ACCESS_REQUESTED", "SUSPENDED", "REVOKED", "EXPIRED"],
  AGREEMENT_CONFIRMED: ["ACCESS_REQUESTED", "SUSPENDED", "REVOKED", "EXPIRED"],
  ACCESS_REQUESTED: ["CREDENTIALS_PROVISIONED", "SUSPENDED", "REVOKED", "EXPIRED"],
  CREDENTIALS_PROVISIONED: ["SANDBOX", "SUSPENDED", "REVOKED", "EXPIRED"],
  SANDBOX: ["SECURITY_TEST", "SUSPENDED", "REVOKED", "EXPIRED", "DEGRADED"],
  SECURITY_TEST: ["INTEROPERABILITY_TEST", "FAILED_VERIFICATION", "SUSPENDED", "REVOKED"],
  INTEROPERABILITY_TEST: ["DATA_VALIDATION", "FAILED_VERIFICATION", "SUSPENDED", "REVOKED"],
  DATA_VALIDATION: ["AUTHORITY_ACCEPTANCE", "FAILED_VERIFICATION", "SUSPENDED", "REVOKED"],
  AUTHORITY_ACCEPTANCE: ["PRODUCTION_APPROVAL", "FAILED_VERIFICATION", "SUSPENDED", "REVOKED"],
  PRODUCTION_APPROVAL: ["LIVE", "SUSPENDED", "REVOKED"],
  LIVE: ["LIVE_VERIFIED", "MONITORED", "DEGRADED", "SUSPENDED", "REVOKED"],
  LIVE_VERIFIED: ["MONITORED", "DEGRADED", "SUSPENDED", "REVOKED"],
  MONITORED: ["LIVE_VERIFIED", "DEGRADED", "SUSPENDED", "REVOKED", "EXPIRED"],
  SUSPENDED: ["MONITORED", "SUSPENDED", "REVOKED"], // resume only to monitored; re-verify before LIVE
  DEGRADED: ["MONITORED", "SUSPENDED", "REVOKED"],
  FAILED_VERIFICATION: ["SANDBOX", "REVOKED"], // must restart the testing path
  EXPIRED: ["REVOKED"],
  REVOKED: [], // terminal
};

/* ------------------------------------------------------------------ */
/* Verification levels (program §9)                                    */
/* ------------------------------------------------------------------ */

export const VERIFICATION_LEVELS = ["REGISTERED", "VERIFIED", "SANDBOX", "LIVE", "LIVE_VERIFIED"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];
/** Levels that require an evidence row (0071 CHECK + engine re-check). */
export const EVIDENCE_REQUIRED_LEVELS: readonly VerificationLevel[] = ["VERIFIED", "SANDBOX", "LIVE", "LIVE_VERIFIED"];

/* ------------------------------------------------------------------ */
/* Cost / access classification (program §10)                          */
/* ------------------------------------------------------------------ */

export const ACCESS_COST_STATUS = [
  "PUBLIC_INFORMATION",
  "PUBLIC_SERVICE",
  "PUBLIC_API",
  "AUTHORIZED_API",
  "GOVESB",
  "AGREEMENT_REQUIRED",
  "PAID_ACCESS",
  "UNKNOWN_COST",
  "NO_PUBLIC_API",
  "MANUAL_VERIFICATION",
  "ACCESS_PENDING",
  "NOT_CONNECTED",
  "FREE_CONFIRMED",
] as const;
export type AccessCostStatus = (typeof ACCESS_COST_STATUS)[number];

/**
 * FREE_CONFIRMED is the ONLY "free" state and ONLY when authoritative
 * evidence explicitly establishes no applicable access fee. It is never
 * inferred (program §10). DB CHECK: cost_evidence_id NOT NULL.
 */
export const EVIDENCE_GATED_COST: readonly AccessCostStatus[] = ["FREE_CONFIRMED"];

/**
 * Never collapse these categories (program §94). Public information is NOT
 * protected-data access; a reachable public endpoint is NOT an authorized API.
 */
export const COST_UI_LABELS: Record<AccessCostStatus, string> = {
  PUBLIC_INFORMATION: "Public Information",
  PUBLIC_SERVICE: "Public Service",
  PUBLIC_API: "Public API",
  AUTHORIZED_API: "Authorized API",
  GOVESB: "GovESB",
  AGREEMENT_REQUIRED: "Agreement Required",
  PAID_ACCESS: "Paid Access",
  UNKNOWN_COST: "Unknown Cost",
  NO_PUBLIC_API: "No Public API",
  MANUAL_VERIFICATION: "Manual Verification",
  ACCESS_PENDING: "Access Pending",
  NOT_CONNECTED: "Not Connected",
  FREE_CONFIRMED: "Free (Confirmed — evidence on file)",
};

/* ------------------------------------------------------------------ */
/* GovESB states (program §12)                                         */
/* ------------------------------------------------------------------ */

export const GOVESB_STATUS = [
  "GOVESB_UNKNOWN",
  "GOVESB_NOT_REQUIRED",
  "GOVESB_REQUIRED",
  "GOVESB_ELIGIBLE",
  "GOVESB_REGISTERED",
  "GOVESB_SANDBOX",
  "GOVESB_TESTED",
  "GOVESB_PRODUCTION_APPROVED",
  "GOVESB_LIVE",
  "GOVESB_LIVE_VERIFIED",
] as const;
export type GovESBStatus = (typeof GOVESB_STATUS)[number];
export const GOVESB_EVIDENCE_GATED: readonly GovESBStatus[] = ["GOVESB_LIVE", "GOVESB_LIVE_VERIFIED"];

/* ------------------------------------------------------------------ */
/* Authority-level status (program §7 — independent dimensions)        */
/* ------------------------------------------------------------------ */

export const AUTHORITY_RECORD_STATUS = ["REGISTERED", "VERIFIED", "AUTHORITY_CONFIRMED", "LIVE", "LIVE_VERIFIED", "UNCERTAIN", "INACTIVE", "RETIRED"] as const;
export type AuthorityRecordStatus = (typeof AUTHORITY_RECORD_STATUS)[number];

export const API_STATUS = ["UNVERIFIED", "PUBLIC", "AUTHORIZED", "PAID", "NONE_PUBLISHED", "UNKNOWN"] as const;
export type ApiStatus = (typeof API_STATUS)[number];

export const AUTHORITY_TYPES = [
  "MINISTRY",
  "DEPARTMENT",
  "AGENCY",
  "COMMISSION",
  "BOARD",
  "COUNCIL",
  "FUND",
  "PUBLIC_CORPORATION",
  "INSTITUTION",
  "REGULATOR",
  "JUDICIARY",
  "PARLIAMENT",
  "REGIONAL_GOVERNMENT",
  "LOCAL_GOVERNMENT",
  "NGO_REGULATOR",
  "INTL_AUTHORITY",
  "OTHER",
] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Connector model (program §49, §81)                                  */
/* ------------------------------------------------------------------ */

export const CONNECTOR_TYPES = [
  "REST_JSON",
  "SOAP_XML",
  "GOVESB",
  "SFTP",
  "WEBHOOK",
  "MESSAGE_QUEUE",
  "BATCH",
  "DB_MEDIATED",
  "OAUTH_OIDC",
  "MTLS",
  "API_KEY",
  "DIGITAL_CERTIFICATE",
  "SIGNED_DOCUMENT",
  "MANUAL_PORTAL",
] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_STATUS = ["PROPOSED", "PROVISIONED", "ENABLED", "DISABLED", "SUSPENDED", "REVOKED"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUS)[number];

export const CONNECTOR_HEALTH = ["HEALTHY", "DEGRADED", "DOWN", "SUSPENDED", "REVOKED", "UNKNOWN"] as const;
export type ConnectorHealth = (typeof CONNECTOR_HEALTH)[number];

export const CREDENTIAL_CLASS = ["SANDBOX", "PRODUCTION", "MOCK"] as const;
export type CredentialClass = (typeof CREDENTIAL_CLASS)[number];

export const CREDENTIAL_STATUS = ["NOT_ISSUED", "PENDING", "ISSUED", "ROTATION_REQUIRED", "EXPIRED", "REVOKED", "REFUSED"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUS)[number];

/* ------------------------------------------------------------------ */
/* Evidence (program §53)                                              */
/* ------------------------------------------------------------------ */

export const EVIDENCE_TYPES = [
  "OFFICIAL_WEBSITE",
  "OFFICIAL_DIRECTORY",
  "OFFICIAL_DOCUMENTATION",
  "OFFICIAL_API_SPEC",
  "OFFICIAL_AGREEMENT",
  "OFFICIAL_CERTIFICATE",
  "SECURITY_ASSESSMENT",
  "SANDBOX_EVIDENCE",
  "PRODUCTION_TEST",
  "SERVICE_RESPONSE",
  "SIGNED_AUTHORITY_CONFIRMATION",
  "SEARCH_INDEX_SNAPSHOT",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_SUBJECT_TYPES = [
  "AUTHORITY",
  "SERVICE",
  "DATASET",
  "SCHEMA",
  "CONNECTOR",
  "CREDENTIAL",
  "AGREEMENT",
  "LEGAL_BASIS",
  "COST",
  "GOVESB",
  "JURISDICTION",
] as const;
export type EvidenceSubjectType = (typeof EVIDENCE_SUBJECT_TYPES)[number];

export const EVIDENCE_STATUS = ["VALID", "EXPIRED", "INVALIDATED"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

/* ------------------------------------------------------------------ */
/* Legal basis / consent / agreement (program §78–80)                  */
/* ------------------------------------------------------------------ */

export const LEGAL_BASIS_TYPES = [
  "STATUTORY_AUTHORITY",
  "CONTRACT",
  "CONSENT",
  "LEGITIMATE_INTEREST",
  "REGULATORY_REQUIREMENT",
  "PUBLIC_INTEREST",
  "VITAL_INTERESTS",
  "JURISDICTION_SPECIFIC",
] as const;
export type LegalBasisType = (typeof LEGAL_BASIS_TYPES)[number];

export const LEGAL_BASIS_STATUS = ["DRAFT", "CONFIRMED", "EXPIRED", "REVOKED"] as const;
export type LegalBasisStatus = (typeof LEGAL_BASIS_STATUS)[number];

export const CONSENT_STATUS = ["REQUESTED", "GRANTED", "DENIED", "WITHDRAWN", "EXPIRED", "SUPERSEDED"] as const;
export type ConsentStatus = (typeof CONSENT_STATUS)[number];

export const AGREEMENT_TYPES = [
  "MOU",
  "DATA_SHARING_AGREEMENT",
  "API_AGREEMENT",
  "SERVICE_AGREEMENT",
  "RESEARCH_AGREEMENT",
  "CROSS_BORDER_AGREEMENT",
  "GOVERNMENT_INTEGRATION_AGREEMENT",
] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const AGREEMENT_STATUS = ["PROPOSED", "NEGOTIATING", "ACTIVE", "EXPIRED", "TERMINATED", "SUPERSEDED"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUS)[number];

/* ------------------------------------------------------------------ */
/* Capability negotiation (program §61)                                */
/* ------------------------------------------------------------------ */

export const CAPABILITY_AVAILABILITY = [
  "AVAILABLE",
  "NOT_AVAILABLE",
  "REQUIRES_AUTHORIZATION",
  "REQUIRES_CONSENT",
  "REQUIRES_AGREEMENT",
  "REQUIRES_LOCAL_ENTITY",
  "REQUIRES_GOVERNMENT_CONNECTION",
  "REQUIRES_HUMAN_APPROVAL",
  "NOT_IMPLEMENTED",
  "NOT_CERTIFIED",
] as const;
export type CapabilityAvailability = (typeof CAPABILITY_AVAILABILITY)[number];

/* ------------------------------------------------------------------ */
/* Reconciliation (program §55)                                        */
/* ------------------------------------------------------------------ */

export const RECONCILIATION_STATES = [
  "MATCH",
  "NEW",
  "MISSING",
  "DUPLICATE",
  "RENAMED",
  "MERGED",
  "DISSOLVED",
  "UNCERTAIN",
  "MANUAL_REVIEW",
  "PENDING_RECONCILIATION",
] as const;
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

/* ------------------------------------------------------------------ */
/* Incidents (program §82)                                             */
/* ------------------------------------------------------------------ */

export const INCIDENT_STATUS = ["DETECTED", "TRIAGED", "CONTAINED", "INVESTIGATING", "REMEDIATED", "VERIFIED", "CLOSED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

export const INCIDENT_CATEGORIES = [
  "UNAUTHORIZED_ACCESS",
  "CREDENTIAL_COMPROMISE",
  "CERTIFICATE_COMPROMISE",
  "DATA_LEAK",
  "SCHEMA_CORRUPTION",
  "INCORRECT_MAPPING",
  "AUTHORITY_OUTAGE",
  "GOVESB_OUTAGE",
  "REPEATED_AUTH_FAILURE",
  "POLICY_VIOLATION",
  "AGREEMENT_EXPIRY",
  "LEGAL_CHANGE",
  "DATA_QUALITY_FAILURE",
  "CONNECTOR_DEGRADATION",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/* ------------------------------------------------------------------ */
/* External data classification (program §11)                          */
/* ------------------------------------------------------------------ */
/**
 * How the AUTHORITY classifies its data. Distinct from BEYU's own clearance
 * ladder (PUBLIC…HIGHLY_RESTRICTED in constants.ts): PROTECTED is an
 * external-authority tier with no BEYU clearance equivalent of its own —
 * mapping: PROTECTED ⇒ handled at ≥ RESTRICTED internally;
 * HIGHLY_RESTRICTED ⇒ HIGHLY_RESTRICTED. Enforced in `minBeyuClearanceFor`.
 */
export const EXTERNAL_DATA_CLASSIFICATION = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "PROTECTED",
  "HIGHLY_RESTRICTED",
] as const;
export type ExternalDataClassification = (typeof EXTERNAL_DATA_CLASSIFICATION)[number];

export const BEYU_CLEARANCE_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"] as const;
export type BeyuClearance = (typeof BEYU_CLEARANCE_ORDER)[number];

/** Minimum BEYU clearance required to touch data at an external class. */
export function minBeyuClearanceFor(ext: ExternalDataClassification): BeyuClearance {
  switch (ext) {
    case "PUBLIC": return "PUBLIC";
    case "INTERNAL": return "INTERNAL";
    case "CONFIDENTIAL": return "CONFIDENTIAL";
    case "RESTRICTED": return "RESTRICTED";
    case "PROTECTED": return "RESTRICTED";
    case "HIGHLY_RESTRICTED": return "HIGHLY_RESTRICTED";
  }
}

/* ------------------------------------------------------------------ */
/* Access requests / approvals / transitions                           */
/* ------------------------------------------------------------------ */

export const ACCESS_REQUEST_STATUS = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "DENIED", "REVOKED"] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUS)[number];

export const APPROVAL_DECISIONS = ["APPROVED", "DENIED"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const TRANSITION_STATUS = ["PROPOSED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"] as const;
export type TransitionStatus = (typeof TRANSITION_STATUS)[number];

export const TRANSITION_SUBJECT_TYPES = ["PERSON", "ORGANIZATION", "TENANT", "ENTITY", "DATA"] as const;
export type TransitionSubjectType = (typeof TRANSITION_SUBJECT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Jurisdictions / record status                                       */
/* ------------------------------------------------------------------ */

export const JURISDICTION_KINDS = ["COUNTRY", "REGIONAL_BLOC", "INTERNATIONAL", "PRIVATE_INSTITUTION"] as const;
export type JurisdictionKind = (typeof JURISDICTION_KINDS)[number];

export const JURISDICTION_STATUS = ["PROPOSED", "ACTIVE", "INACTIVE"] as const;
export type JurisdictionStatus = (typeof JURISDICTION_STATUS)[number];

/* ------------------------------------------------------------------ */
/* Connector/service/verification metadata                             */
/* ------------------------------------------------------------------ */

export const SCHEMA_STATUS = ["PROPOSED", "ACTIVE", "DEPRECATED", "RETIRED"] as const;
export type SchemaStatus = (typeof SCHEMA_STATUS)[number];

export const SCHEMA_COMPATIBILITY = ["ADDITIVE", "BREAKING", "COMPATIBLE"] as const;
export type SchemaCompatibility = (typeof SCHEMA_COMPATIBILITY)[number];

/* ------------------------------------------------------------------ */
/* Federation events (program §66) — values in the EXISTING audit/event */
/* ledger, never a second event system.                                */
/* ------------------------------------------------------------------ */

export const FEDERATION_EVENTS = [
  "FEDERATION_AUTHORITY_REGISTERED",
  "FEDERATION_AUTHORITY_VERIFIED",
  "FEDERATION_SERVICE_REGISTERED",
  "FEDERATION_ACCESS_REQUESTED",
  "FEDERATION_ACCESS_APPROVED",
  "FEDERATION_ACCESS_DENIED",
  "FEDERATION_AGREEMENT_CREATED",
  "FEDERATION_AGREEMENT_EXPIRED",
  "FEDERATION_CREDENTIAL_PROVISIONED",
  "FEDERATION_CREDENTIAL_ROTATED",
  "FEDERATION_CONNECTOR_CREATED",
  "FEDERATION_CONNECTOR_ENABLED",
  "FEDERATION_CONNECTOR_DISABLED",
  "FEDERATION_SCHEMA_CHANGED",
  "FEDERATION_DATA_ACCESSED",
  "FEDERATION_DATA_EXPORTED",
  "FEDERATION_DATA_REJECTED",
  "FEDERATION_VERIFICATION_COMPLETED",
  "FEDERATION_VERIFICATION_FAILED",
  "FEDERATION_INCIDENT",
  "FEDERATION_SUSPENDED",
  "FEDERATION_REVOKED",
  "FEDERATION_LIVE",
  "FEDERATION_LIVE_VERIFIED",
  "FEDERATION_CHANGE_DETECTED",
  "FEDERATION_RECONCILIATION_COMPLETED",
  "FEDERATION_CONSENT_GRANTED",
  "FEDERATION_CONSENT_WITHDRAWN",
  "FEDERATION_JURISDICTION_TRANSITION",
] as const;
export type FederationEvent = (typeof FEDERATION_EVENTS)[number];

/* ------------------------------------------------------------------ */
/* Invariant helpers (shared by engines; DB CHECKs mirror these)       */
/* ------------------------------------------------------------------ */

export class FederationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FederationInvariantError";
  }
}

export function isLifecycle(state: string): state is FederationLifecycle {
  return (FEDERATION_LIFECYCLE as readonly string[]).includes(state);
}

export function canTransition(from: FederationLifecycle, to: FederationLifecycle): boolean {
  return LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Fail-closed promotion guard (program §86): a record may only enter an
 * evidence-gated lifecycle state when (a) a production evidence row id is
 * present, (b) a named approver is present, (c) an approval reference is
 * present. This is the engine-level twin of the 0071 CHECK constraint.
 */
export function assertPromotable(
  to: FederationLifecycle,
  ctx: { productionEvidenceId: string | null; approvedBy: string | null; approvalReference: string | null },
): void {
  if (!EVIDENCE_GATED_LIFECYCLE.includes(to)) return;
  if (!ctx.productionEvidenceId || !ctx.approvedBy || !ctx.approvalReference) {
    throw new FederationInvariantError(
      `FAIL-CLOSED: lifecycle promotion to ${to} requires production evidence, a named approver and an approval reference. ` +
        "Discovered, public or unverified facts never become LIVE.",
    );
  }
}

/** Fail-closed FREE guard (program §10): FREE_CONFIRMED requires cost evidence. */
export function assertFreeConfirmed(costEvidenceId: string | null): void {
  if (!costEvidenceId) {
    throw new FederationInvariantError(
      "FAIL-CLOSED: FREE_CONFIRMED requires authoritative cost evidence. Public information / public endpoints are never evidence of no fee.",
    );
  }
}

/** Verification guard (program §9): level-up requires an evidence row. */
export function assertVerifiable(level: VerificationLevel, evidenceId: string | null): void {
  if (EVIDENCE_REQUIRED_LEVELS.includes(level) && !evidenceId) {
    throw new FederationInvariantError(
      `FAIL-CLOSED: verification level ${level} requires a recorded evidence row (who/when/what/test/result/environment/credentials-class/schema-version).`,
    );
  }
}
