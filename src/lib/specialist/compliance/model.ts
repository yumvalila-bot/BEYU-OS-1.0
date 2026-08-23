/**
 * BEYU OS — Compliance & Obligation Intelligence domain model (Phase 7E).
 *
 * Types only. No obligations, no deadlines, no legal rules, no penalties, no filing requirements.
 *
 * WHY THIS MODULE IS DELIBERATELY THIN. Compliance is the domain where a fabricated fact does the
 * most legal damage. An invented filing deadline, or a "COMPLIANT" verdict inferred from silence,
 * is worse than no system at all because it manufactures false assurance. This model therefore
 * encodes three separations that the engines cannot collapse:
 *
 *   1. OBLIGATION TRUTH vs EVIDENCE STATE. A missing document does not mean the obligation does
 *      not exist, and an attached document does not mean the obligation is satisfied. They are
 *      different questions with different answers, so they are different types.
 *
 *   2. OBSERVED vs DERIVED vs UNKNOWN. Anything not present in governed source data is
 *      DATA_NOT_AVAILABLE or REQUIRES_AUTHORITY. Never a default, never an inference from a name.
 *
 *   3. ANALYSIS vs CONCLUSION. This module reports what the register says and where the register
 *      is internally inconsistent. It never states a legal position.
 *
 * WHAT THE SUBSTRATE ACTUALLY SUPPORTS (verified against the live schema, not assumed):
 *   compliance_obligations  — status, next_due_at, frequency, jurisdiction, owner_role, control_ids
 *                             NOTE: there are NO effective_from / effective_to columns. Obligation
 *                             effective windows are therefore DATA_NOT_AVAILABLE, not invented.
 *   compliance_assessments  — state, period, evidence_document_id, remediation, human_confirmed
 *   documents               — effective_date, authority_status (incl. EXPIRED/SUPERSEDED)
 *   controls                — frameworks, risk_id, last_tested_at, effectiveness
 *   risks                   — residual scores, appetite_threshold, status, escalated
 */

/** Epistemic status of any compliance value. Mirrors the 7C/7D convention deliberately. */
export const COMPLIANCE_BASIS = [
  "OBSERVED",
  "DERIVED",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_AUTHORITY",
  "REQUIRES_SPECIALIST_REVIEW",
] as const;
export type ComplianceBasis = (typeof COMPLIANCE_BASIS)[number];

/**
 * Evidence state, kept strictly separate from obligation state.
 *
 * Every value here is derivable from existing columns — no new repository, no new table:
 *   UNKNOWN       no assessment exists, so nothing is claimed either way
 *   REQUIRED      an assessment exists and evidence is expected for its state
 *   MISSING       evidence is expected but evidence_document_id is null, or points nowhere
 *   PRESENT       a document is linked, effective, and not withdrawn
 *   UNDER_REVIEW  documents.authority_status = UNDER_REVIEW
 *   VERIFIED      PRESENT and the assessment was confirmed by a human
 *   EXPIRED       documents.authority_status in (EXPIRED, SUPERSEDED, REJECTED), or not yet effective
 */
export const EVIDENCE_STATE = [
  "UNKNOWN",
  "REQUIRED",
  "MISSING",
  "PRESENT",
  "UNDER_REVIEW",
  "VERIFIED",
  "EXPIRED",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATE)[number];

/**
 * Deadline position relative to a stated `asOf`. Purely temporal arithmetic over `next_due_at`.
 * A future obligation is NEVER overdue, and an obligation with no due date is NO_DUE_DATE rather
 * than silently treated as current.
 */
export const DEADLINE_STATE = ["NO_DUE_DATE", "FUTURE", "DUE_TODAY", "OVERDUE"] as const;
export type DeadlineState = (typeof DEADLINE_STATE)[number];

/** A reference to a real governed record an analysis was derived from. */
export type ComplianceSource = {
  type:
    | "COMPLIANCE_OBLIGATION"
    | "COMPLIANCE_ASSESSMENT"
    | "DOCUMENT"
    | "CONTROL"
    | "RISK"
    | "LEGAL_ENTITY";
  id: string;
  basis: Extract<ComplianceBasis, "OBSERVED" | "DERIVED">;
};

/** A data-quality or governance defect found in the register. Reported, never repaired. */
export type DataQualityFinding = {
  code: DataQualityCode;
  severity: "INFO" | "WARNING" | "GOVERNANCE";
  subjectType: ComplianceSource["type"];
  subjectId: string;
  detail: string;
  /** Always true: identifying a defect never authorises correcting it. */
  advisoryOnly: true;
};

export const DATA_QUALITY_CODE = [
  "MISSING_OWNER",
  "MISSING_DUE_DATE",
  "MISSING_JURISDICTION",
  "TENANT_ENTITY_ATTRIBUTION_MISMATCH",
  "ORPHANED_ENTITY_REFERENCE",
  "ORPHANED_RISK_REFERENCE",
  "ORPHANED_EVIDENCE_REFERENCE",
  "DUPLICATE_OBLIGATION",
  "DUPLICATE_ASSESSMENT",
  "INVALID_DATE_ORDER",
  "FUTURE_DATED_RECORD",
  "STALE_ASSESSMENT",
  "INCONSISTENT_STATUS",
  "EVIDENCE_EXPIRED",
  "EVIDENCE_MISSING",
  "NO_CONTROL_COVERAGE",
  "NO_ASSESSMENT",
] as const;
export type DataQualityCode = (typeof DATA_QUALITY_CODE)[number];

/**
 * The compliance view of a single obligation.
 *
 * `state` is copied from the governed assessment — it is NEVER computed by this module. If no
 * assessment exists, `state` is null and `stateBasis` is DATA_NOT_AVAILABLE, because "no
 * assessment" is emphatically not "compliant".
 */
export type ObligationStatus = {
  obligationId: string;
  code: string;
  title: string;
  framework: string;
  reference: string;
  jurisdictionCode: string;
  tenantId: string;
  legalEntityId: string | null;
  ownerRole: string | null;
  frequency: string;
  lifecycleStatus: string;
  /** From compliance_assessments.state. Null when unassessed. Never defaulted to COMPLIANT. */
  state: string | null;
  stateBasis: ComplianceBasis;
  assessmentId: string | null;
  assessmentPeriod: string | null;
  humanConfirmed: boolean | null;
  evidence: EvidenceAssessment;
  deadline: DeadlineAssessment;
  controlIds: string[];
  findings: DataQualityFinding[];
  explanation: string[];
};

export type EvidenceAssessment = {
  state: EvidenceState;
  documentId: string | null;
  documentEffectiveDate: string | null;
  documentAuthorityStatus: string | null;
  basis: ComplianceBasis;
  /** Plain-language reason for the state. Required: an evidence verdict must be defensible. */
  reason: string;
};

export type DeadlineAssessment = {
  state: DeadlineState;
  dueDate: string | null;
  /** Negative when overdue, positive when future, 0 on the due date. Null with no due date. */
  daysRemaining: number | null;
  basis: ComplianceBasis;
  reason: string;
};

/** Control coverage for an obligation or framework. Derived from controls.frameworks. */
export type ControlCoverage = {
  subject: string;
  subjectType: "OBLIGATION" | "FRAMEWORK";
  controlIds: string[];
  controlCodes: string[];
  effectiveCount: number;
  partiallyEffectiveCount: number;
  ineffectiveOrUnknownCount: number;
  /** Null when no controls are linked — never 0% dressed up as measured coverage. */
  coverageBasis: ComplianceBasis;
  untestedControlIds: string[];
  findings: DataQualityFinding[];
  explanation: string[];
};

/**
 * Compliance risk view. Consumes the EXISTING risk register (`risks`) and existing control and
 * obligation data. It creates no second register and computes no new risk scores beyond the
 * arithmetic already implied by the stored residual values and appetite threshold.
 */
export type ObligationRiskView = {
  riskId: string;
  code: string;
  category: string;
  status: string;
  escalated: boolean;
  residualLikelihood: number;
  residualImpact: number;
  /** residual_likelihood * residual_impact, using the register's own stored numbers. */
  residualScore: number;
  /** The register's OWN appetite_threshold. This module never supplies one. */
  appetiteThreshold: number;
  /** True only because the register itself stores a threshold to compare against. */
  aboveAppetite: boolean;
  linkedControlIds: string[];
  findings: DataQualityFinding[];
  explanation: string[];
};

export type JurisdictionExposure = {
  jurisdictionCode: string;
  obligationCount: number;
  overdueCount: number;
  unassessedCount: number;
  nonCompliantCount: number;
  evidenceMissingCount: number;
  frameworks: string[];
  basis: ComplianceBasis;
};

export type EntityComplianceProfile = {
  legalEntityId: string | null;
  /** The tenant that OWNS the entity, per legal_entities. Null when the entity is unknown. */
  owningTenantId: string | null;
  /** The tenant the obligations claim. Divergence is a finding, never silently reconciled. */
  claimedTenantId: string;
  attributionConsistent: boolean;
  obligationCount: number;
  statuses: Record<string, number>;
  findings: DataQualityFinding[];
  basis: ComplianceBasis;
  explanation: string[];
};

export type ComplianceDashboard = {
  asOf: string;
  tenantId: string;
  legalEntityId: string | null;
  obligationCount: number;
  /** Counts by governed assessment state. Unassessed is counted separately, never as compliant. */
  stateCounts: Record<string, number>;
  unassessedCount: number;
  overdueCount: number;
  dueWithinWindowCount: number;
  evidenceStateCounts: Record<EvidenceState, number>;
  jurisdictions: JurisdictionExposure[];
  findings: DataQualityFinding[];
  /** Decisions or authorities whose absence limits these conclusions. */
  authorityDependencies: string[];
  basis: ComplianceBasis;
  explanation: string[];
};

export type ComplianceException = {
  code:
    | "OVERDUE_OBLIGATION"
    | "NON_COMPLIANT_ASSESSMENT"
    | "UNASSESSED_OBLIGATION"
    | "EVIDENCE_MISSING"
    | "EVIDENCE_EXPIRED"
    | "REMEDIATION_OVERDUE"
    | "AWAITING_HUMAN_REVIEW"
    | "NO_CONTROL_COVERAGE";
  obligationId: string;
  obligationCode: string;
  detail: string;
  /** Exceptions are findings for a human. They authorise nothing. */
  advisoryOnly: true;
  sources: ComplianceSource[];
};
