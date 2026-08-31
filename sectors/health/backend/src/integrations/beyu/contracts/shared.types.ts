/**
 * Shared types for governed BEYU integration contracts.
 *
 * These types define the wire- and request-shape for cross-domain calls from
 * Health OS → Governance / HCM / Finance / Tax / Noelia / HIVE / shared
 * services. Every cross-domain call MUST propagate:
 *   - globalUserId (canonical)
 *   - tenantId + entityCode + countryCode (mandatory isolation axes)
 *   - correlationId + causationId + requestId (observability)
 *   - idempotencyKey where applicable
 *   - actor professional/practitioner/facility context
 *
 * When a required canonical value is absent, Health OS fails CLOSED and does
 * not fabricate identifiers or credentials.
 */

/** Integration state machine used by every governed adapter. */
export type IntegrationState =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "VALIDATED"
  | "CONNECTED"
  | "VERIFIED"
  | "DEGRADED"
  | "BLOCKED";

/** Risk classification of the action (Governance + AI use). */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Governance decision outcomes. */
export type GovernanceDecision = "APPROVE" | "DENY" | "APPROVAL_REQUIRED";

/** AI output classification (authoritative human-approved action requires explicit flag). */
export type AiOutputClass =
  | "informational"
  | "decision-support"
  | "recommendation"
  | "action-proposal"
  | "human-approved-action"
  | "rejected"
  | "blocked";

/** Practitioner licence states — consumed from HCM; Health OS never promotes an unverified/expired licence silently. */
export type PractitionerLicenceState =
  | "verified"
  | "unverified"
  | "expired"
  | "suspended"
  | "revoked"
  | "external_verification_required"
  | "blocked";

/**
 * Canonical actor context propagated to every governed outbound call.
 * Sourced from TenantContext (which is populated by JwtAuthGuard).
 */
export interface CanonicalActorContext {
  globalUserId: string;
  email?: string | null;
  tenantId: string;
  entityCode: string | null;
  countryCode: string | null;
  licenceNumber: string | null;
  practitionerId: string | null;
  facilityId: string | null;
  sessionId: string | null;
  role: string;
  permissions: string[];
  timezone: string | null;
  /** Service originating the call (always "health-os" for outbound). */
  sourceService: "health-os";
}

/** Observability propagation envelope (always attached). */
export interface PropagationEnvelope {
  correlationId: string;
  causationId: string | null;
  requestId: string;
  idempotencyKey?: string;
  timestamp: string; // ISO-8601
}

/** Health OS → Governance */
export interface GovernanceDecisionRequest {
  actor: CanonicalActorContext;
  propagation: PropagationEnvelope;
  action: string;           // e.g. "prescription.dispense.controlled"
  resourceType: string;     // e.g. "pharmacy.dispense"
  resourceId?: string | null;
  requestedScope?: string[];
  riskLevel: RiskLevel;
  metadata?: Record<string, unknown>;
}

export interface GovernanceDecisionResponse {
  decision: GovernanceDecision;
  decisionId: string | null;  // null when engine unavailable (but then decision is DENY)
  policyVersion: string | null;
  reasonCode: string | null;
  approvalRequired: boolean;
  approverRole: string | null;
  expiresAt: string | null; // ISO-8601
  failureReason?: string;
}

/** Health OS → HCM (workforce / practitioner) */
export interface HcmPractitionerQuery {
  actor: CanonicalActorContext;
  propagation: PropagationEnvelope;
  practitionerId?: string | null;
  globalUserId?: string | null;
  licenceNumber?: string | null;
}

export interface HcmPractitionerRecord {
  globalUserId: string | null;
  practitionerId: string | null;
  employmentStatus: "active" | "inactive" | "suspended" | "terminated" | "unknown";
  facilityIds: string[];
  department: string | null;
  ward: string | null;
  role: string | null;
  professionalCategory: string | null;
  licenceNumber: string | null;
  licensingAuthority: string | null;
  licenceState: PractitionerLicenceState;
  scopeOfPractice: string[];
  credentialStatus: "verified" | "unverified" | "expired" | "suspended" | "revoked" | "unknown";
  cpdStatus: "compliant" | "non_compliant" | "unknown";
  supervisorGlobalUserId: string | null;
  employmentStart: string | null;
  employmentEnd: string | null;
  externalVerificationRequired: boolean;
}

/** Health OS → Finance OS */
export type FinanceEventType =
  | "charge"
  | "invoice_request"
  | "payment_request"
  | "refund_request"
  | "claim"
  | "claim_adjustment"
  | "receivable"
  | "payable"
  | "revenue_event"
  | "expense_event"
  | "inventory_valuation"
  | "facility_financial_event"
  | "practitioner_compensation_event";

export interface FinanceEventRequest {
  actor: CanonicalActorContext;
  propagation: PropagationEnvelope;
  eventType: FinanceEventType;
  healthResourceType: string;
  healthResourceId: string | null;
  facilityId: string | null;
  amount: { value: string; currency: string }; // string to preserve precision
  metadata?: Record<string, unknown>;
}

export interface FinanceEventResponse {
  accepted: boolean;
  financeEventId: string | null; // only populated if Finance OS assigned one
  status: "accepted" | "rejected" | "pending" | "blocked";
  reasonCode: string | null;
}

/** Health OS → Tax Engine */
export interface TaxDeterminationRequest {
  actor: CanonicalActorContext;
  propagation: PropagationEnvelope;
  taxableEventType: string;
  jurisdiction: string;
  entityCode: string | null;
  taxpayerReference: string | null;
  amount: { value: string; currency: string };
  taxCategory: string | null;
  effectiveDate: string; // ISO-8601
  exemptions?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaxLine {
  taxType: string;
  rate: string;
  taxableAmount: string;
  taxAmount: string;
  ruleId: string | null;
  ruleVersion: string | null;
  taxAuthorityRef: string | null;
}

export interface TaxDeterminationResponse {
  determined: boolean;
  status: "determined" | "exempt" | "degraded" | "blocked";
  totalTax: string | null;
  lines: TaxLine[];
  policyVersion: string | null;
  reasonCode: string | null;
  failureReason?: string;
}

/** Health OS → Noelia / HIVE */
export interface AiInvocationRequest {
  actor: CanonicalActorContext;
  propagation: PropagationEnvelope;
  capability:
    | "clinical_decision_support"
    | "operational_intelligence"
    | "executive_intelligence"
    | "risk_analysis"
    | "compliance_analysis"
    | "documentation_assist"
    | "workflow_assist"
    | "anomaly_detection"
    | "reporting_assist";
  inputRef: string;         // opaque reference (DO NOT log content)
  riskLevel: RiskLevel;
  modelProviderId?: string | null; // only if genuinely known, else null
  modelVersion?: string | null;
  requiresHumanApproval?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AiInvocationResponse {
  invocationId: string;
  outputClass: AiOutputClass;
  outputRef: string | null;
  riskClassification: RiskLevel;
  humanReviewer: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | "not_required";
  blocked: boolean;
  failureReason?: string;
}

/** Health OS → Shared identity (GlobalUserID canonical lookup). */
export interface GlobalUserLookupRequest {
  actor: CanonicalActorContext;
  propagation: PropagationEnvelope;
  globalUserId?: string | null;
  email?: string | null;
  practitionerId?: string | null;
}

export interface GlobalUserRecord {
  globalUserId: string;
  email: string | null;
  status: "active" | "suspended" | "deactivated" | "unknown";
  linkedIdentities: Array<{ system: string; id: string }>;
}
