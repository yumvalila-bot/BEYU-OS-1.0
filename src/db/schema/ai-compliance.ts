/**
 * BEYU Noelia AI — Phase 4 global compliance, conformity, assurance, evidence
 * and continuous governance engine.
 *
 * Architectural rules:
 *  - This layer captures governance REGISTERS and EVIDENCE. It never grants
 *    runtime authority and never converts a BLOCKED or ENVIRONMENT_LIMITED
 *    control into PASS.
 *  - CERTIFIED is only ever a recorded governance state that an external,
 *    verifiable evidence record supports. Internal code must not reach
 *    CERTIFIED through self-assertion.
 *  - Tenant-scoped rows are protected by RLS through the canonical
 *    beyu_tenant_ids()/beyu_global_scope() helpers (migration 0026). Global
 *    governance tables remain application-permission gated (`ai:compliance.*`).
 *  - No credentials, provider secrets or certificate private material are
 *    stored. Evidence rows carry hashes and references, never secrets.
 */
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";
import { modelRegistry } from "./platform";
import { noeliaAiIdentity, noeliaProviders, noeliaRiskRegister } from "./ai";

/**
 * Noelia AI requirement registry.
 *
 * A requirement names a regulatory/standard obligation and remains a
 * governance record. Applicability is assessed separately in
 * `noeliaApplicabilityAssessments`; a requirement never self-declares itself
 * applicable to a specific AI system.
 */
export const noeliaAiRequirements = pgTable(
  "noelia_ai_requirements",
  {
    id: text("id").primaryKey(),
    requirementCode: text("requirement_code").notNull(),
    frameworkId: text("framework_id").notNull(), // EU_AI_ACT | ISO_42001 | NIST_AI_RMF | ISO_23894 | ISO_27001 | ISO_22989 | ISO_23053 | ISO_27701 | OTHER
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(), // DOCUMENTATION | TECHNICAL | GOVERNANCE | DATA | RISK | EVALUATION | MONITORING | CERTIFICATION | OTHER
    jurisdictionCode: text("jurisdiction_code").references(() => countries.code),
    countryCode: text("country_code").references(() => countries.code),
    applicableToTypes: jsonb("applicable_to_types").$type<string[]>().notNull().default([]),
    ownerRole: text("owner_role").notNull(),
    priority: text("priority").notNull().default("MEDIUM"),
    status: text("status").notNull().default("ACTIVE"), // DRAFT | ACTIVE | SUPERSEDED | OBSOLETE
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    source: text("source"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_ai_requirements_code_uidx").on(t.requirementCode),
    index("noelia_ai_requirements_framework_idx").on(t.frameworkId),
    index("noelia_ai_requirements_status_idx").on(t.status),
  ],
);

/**
 * Applicability assessment (requirement ⇄ subject).
 *
 * `legallyAmbiguous` is SET by an assessor, never by the engine. When a
 * requirement's exact applicability cannot be resolved without legal advice the
 * engine keeps `result = UNDETERMINED` and the row is
 * `LEGAL_REVIEW_REQUIRED`. Nothing converts a legally ambiguous requirement to
 * APPLICABLE or NOT_APPLICABLE automatically.
 */
export const noeliaApplicabilityAssessments = pgTable(
  "noelia_applicability_assessments",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => noeliaAiRequirements.id),
    subjectType: text("subject_type").notNull(), // SYSTEM | MODEL | PROVIDER | CAPABILITY | OS | TENANT | JURISDICTION
    subjectId: text("subject_id").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    countryCode: text("country_code").references(() => countries.code),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    result: text("result").notNull().default("NOT_ASSESSED"), // APPLICABLE | PARTIALLY_APPLICABLE | NOT_APPLICABLE | UNDETERMINED | NOT_ASSESSED
    rationale: text("rationale"),
    legalBasis: text("legal_basis"),
    legallyAmbiguous: boolean("legal_ambiguous").notNull().default(false),
    legalReviewRequired: boolean("legal_review_required").notNull().default(false),
    assessedBy: text("assessed_by").notNull(),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
    validUntil: date("valid_until"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | CONFIRMED | SUPERSEDED | LEGAL_REVIEW_REQUIRED | EXPIRED
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_applicability_req_subject_uidx").on(t.requirementId, t.subjectType, t.subjectId),
    index("noelia_applicability_requirement_idx").on(t.requirementId),
    index("noelia_applicability_tenant_idx").on(t.tenantId),
  ],
);

/**
 * DB-backed AI control registry.
 *
 * Mirrors and supersedes the static Phase 3 `NOELIA_CONTROLS` register with
 * write-scoped operators, review dates and evidence references. Control
 * IMPLEMENTATION is a technical claim; the static register remains the source
 * for immutable Phase 3 implementation text.
 */
export const noeliaControls = pgTable(
  "noelia_controls",
  {
    id: text("id").primaryKey(),
    controlCode: text("control_code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    controlType: text("control_type").notNull(), // PREVENTIVE | DETECTIVE | CORRECTIVE | GOVERNANCE | MONITORING
    automation: text("automation").notNull().default("MANUAL"), // MANUAL | SEMI_AUTOMATED | AUTOMATED
    frameworks: jsonb("frameworks").$type<string[]>().notNull().default([]),
    ownerRole: text("owner_role").notNull(),
    riskLevel: text("risk_level").notNull().default("LOW"),
    implementationStatus: text("implementation_status").notNull().default("NOT_IMPLEMENTED"),
    assessmentRequirement: text("assessment_requirement").notNull().default("INTERNAL"), // INTERNAL | EXTERNAL | NONE
    sourcePath: text("source_path"),
    testPath: text("test_path"),
    evidencePath: text("evidence_path"),
    active: boolean("active").notNull().default(true),
    reviewDate: date("review_date"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_controls_code_uidx").on(t.controlCode),
    index("noelia_controls_status_idx").on(t.implementationStatus),
  ],
);

/**
 * Evidence registry with tamper evidence.
 *
 * The `artifactHash` is a SHA-256 of a deterministic canonical representation
 * of the evidence's governance fingerprint. It is computed at recording time
 * and is independently verifiable. `status=VERIFIED` means an accountable human
 * confirmed the evidence; it does not mean a control is compliant. `EXPIRED`
 * never counts as evidence for an EFFECTIVE mapping.
 */
export const noeliaEvidence = pgTable(
  "noelia_evidence",
  {
    id: text("id").primaryKey(),
    evidenceCode: text("evidence_code").notNull(),
    evidenceType: text("evidence_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    subjectType: text("subject_type").notNull(), // SYSTEM | MODEL | PROVIDER | CAPABILITY | OS | TENANT | CONTROL | REQUIREMENT
    subjectId: text("subject_id").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    sourceUri: text("source_uri"),
    artifactHash: text("artifact_hash").notNull(),
    hashAlgorithm: text("hash_algorithm").notNull().default("SHA-256"),
    contentRef: text("content_ref"),
    evidenceDate: date("evidence_date"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("DRAFT"), // DRAFT | SUBMITTED | VERIFIED | REJECTED | OBSOLETE | EXPIRED
    verifier: text("verifier"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    externalAssessor: text("external_assessor"),
    externalReference: text("external_reference"),
    recordedBy: text("recorded_by").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_evidence_code_uidx").on(t.evidenceCode),
    index("noelia_evidence_subject_idx").on(t.subjectType, t.subjectId),
    index("noelia_evidence_status_idx").on(t.status),
    index("noelia_evidence_tenant_idx").on(t.tenantId),
  ],
);


/**
 * Requirement -> control mapping.
 *
 * A mapping is an assertion by the accountable owner, not a proof. It must be
 * backed by an evidence record to carry an EFFECTIVE verdict.
 */
export const noeliaRequirementControls = pgTable(
  "noelia_requirement_controls",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => noeliaAiRequirements.id),
    controlId: text("control_id")
      .notNull()
      .references(() => noeliaControls.id),
    mappingRationale: text("mapping_rationale"),
    effectiveness: text("effectiveness").notNull().default("NOT_EVIDENCED"), // NOT_ASSESSED | EFFECTIVE | PARTIALLY_EFFECTIVE | NOT_EFFECTIVE | NOT_EVIDENCED
    evidenceId: text("evidence_id").references(() => noeliaEvidence.id),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_requirement_control_uidx").on(t.requirementId, t.controlId),
    index("noelia_requirement_control_requirement_idx").on(t.requirementId),
    index("noelia_requirement_control_control_idx").on(t.controlId),
  ],
);

/**
 * AI impact assessment.
 *
 * Impact assessments are governance records; they never set a system's risk
 * level by themselves. `safetyImpact`, `fundamentalRights`,
 * `dataProtection` and `humanOversight` are explicit human inputs or
 * `NOT_ASSESSED`.
 */
export const noeliaImpactAssessments = pgTable(
  "noelia_impact_assessments",
  {
    id: text("id").primaryKey(),
    assessmentCode: text("assessment_code").notNull(),
    systemId: text("system_id").references(() => noeliaAiIdentity.id),
    requirementId: text("requirement_id").references(() => noeliaAiRequirements.id),
    tenantId: text("tenant_id").references(() => tenants.id),
    countryCode: text("country_code").references(() => countries.code),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    scope: text("scope").notNull(),
    impactType: text("impact_type").notNull(), // INDIVIDUAL | COLLECTIVE | SOCIETAL | ENVIRONMENTAL | OTHER
    impactLevel: text("impact_level").notNull().default("UNKNOWN"), // NEGLIGIBLE | MINOR | MODERATE | MAJOR | CRITICAL | UNKNOWN
    safetyImpact: text("safety_impact").notNull().default("NOT_ASSESSED"),
    fundamentalRights: text("fundamental_rights").notNull().default("NOT_ASSESSED"),
    dataProtection: text("data_protection").notNull().default("NOT_ASSESSED"),
    humanOversight: text("human_oversight").notNull().default("NOT_ASSESSED"),
    rationale: text("rationale"),
    assessedBy: text("assessed_by").notNull(),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("DRAFT"), // DRAFT | CONFIRMED | SUPERSEDED | EXPIRED
    nextReviewAt: date("next_review_at"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_impact_assessment_code_uidx").on(t.assessmentCode),
    index("noelia_impact_assessment_system_idx").on(t.systemId),
    index("noelia_impact_assessment_tenant_idx").on(t.tenantId),
  ],
);

/**
 * AI risk treatment.
 *
 * Extends the Phase 3 risk register with explicit treatments and verified
 * evidence. `status=VERIFIED` is reached only after a human verifier confirms
 * the treatment evidence; it is never assigned automatically after a due date.
 */
export const noeliaRiskTreatments = pgTable(
  "noelia_risk_treatments",
  {
    id: text("id").primaryKey(),
    riskId: text("risk_id")
      .notNull()
      .references(() => noeliaRiskRegister.id),
    treatment: text("treatment").notNull(), // MITIGATE | ACCEPT | TRANSFER | AVOID | MONITOR
    ownerRole: text("owner_role").notNull(),
    rationale: text("rationale").notNull(),
    targetResidual: text("target_residual"),
    dueDate: date("due_date"),
    status: text("status").notNull().default("PLANNED"), // PLANNED | IN_PROGRESS | IMPLEMENTED | VERIFIED | EXPIRED | REJECTED
    evidenceId: text("evidence_id").references(() => noeliaEvidence.id),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_risk_treatment_risk_idx").on(t.riskId),
    index("noelia_risk_treatment_status_idx").on(t.status),
  ],
);

/** Internal audit program. */
export const noeliaInternalAudits = pgTable(
  "noelia_internal_audits",
  {
    id: text("id").primaryKey(),
    auditCode: text("audit_code").notNull(),
    title: text("title").notNull(),
    scope: text("scope").notNull(),
    objective: text("objective").notNull(),
    frameworkId: text("framework_id"),
    auditType: text("audit_type").notNull().default("GAP_ASSESSMENT"), // GAP_ASSESSMENT | CONTROL_TEST | DATA_OR_EVIDENCE | CERTIFICATION_SUPPORT | OTHER
    auditor: text("auditor").notNull(),
    auditorRole: text("auditor_role").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    tenantId: text("tenant_id").references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    status: text("status").notNull().default("PLANNED"), // PLANNED | IN_PROGRESS | COMPLETED | CLOSED | CANCELLED
    plannedAt: date("planned_at"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_audits_code_uidx").on(t.auditCode),
    index("noelia_audits_status_idx").on(t.status),
    index("noelia_audits_tenant_idx").on(t.tenantId),
  ],
);

/** Audit findings. */
export const noeliaFindings = pgTable(
  "noelia_findings",
  {
    id: text("id").primaryKey(),
    findingCode: text("finding_code").notNull(),
    auditId: text("audit_id")
      .notNull()
      .references(() => noeliaInternalAudits.id),
    severity: text("severity").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
    title: text("title").notNull(),
    description: text("description").notNull(),
    controlId: text("control_id").references(() => noeliaControls.id),
    evidenceId: text("evidence_id").references(() => noeliaEvidence.id),
    tenantId: text("tenant_id").references(() => tenants.id),
    status: text("status").notNull().default("OPEN"), // OPEN | ACKNOWLEDGED | REMEDIATING | VERIFIED | CLOSED | ACCEPTED
    ownerRole: text("owner_role").notNull(),
    dueDate: date("due_date"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_finding_code_uidx").on(t.findingCode),
    index("noelia_finding_audit_idx").on(t.auditId),
    index("noelia_finding_status_idx").on(t.status),
    index("noelia_finding_tenant_idx").on(t.tenantId),
  ],
);

/** Corrective & preventive actions (CAPA). */
export const noeliaCorrectiveActions = pgTable(
  "noelia_corrective_actions",
  {
    id: text("id").primaryKey(),
    actionCode: text("action_code").notNull(),
    findingId: text("finding_id")
      .notNull()
      .references(() => noeliaFindings.id),
    description: text("description").notNull(),
    rootCause: text("root_cause"),
    ownerRole: text("owner_role").notNull(),
    dueDate: date("due_date"),
    status: text("status").notNull().default("PLANNED"), // PLANNED | IN_PROGRESS | COMPLETED | VERIFIED | CLOSED | OVERDUE | REJECTED
    evidenceId: text("evidence_id").references(() => noeliaEvidence.id),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    tenantId: text("tenant_id").references(() => tenants.id),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_capa_code_uidx").on(t.actionCode),
    index("noelia_capa_finding_idx").on(t.findingId),
    index("noelia_capa_status_idx").on(t.status),
    index("noelia_capa_tenant_idx").on(t.tenantId),
  ],
);

/** Exceptions to AI controls (risk acceptance with accountability). */
export const noeliaExceptions = pgTable(
  "noelia_exceptions",
  {
    id: text("id").primaryKey(),
    exceptionCode: text("exception_code").notNull(),
    requirementId: text("requirement_id").references(() => noeliaAiRequirements.id),
    controlId: text("control_id").references(() => noeliaControls.id),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    rationale: text("rationale").notNull(),
    riskAccepted: text("risk_accepted").notNull().default("NOT_ASSESSED"),
    compensatingControl: text("compensating_control"),
    expiryDate: date("expiry_date"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    status: text("status").notNull().default("REQUESTED"), // REQUESTED | APPROVED | REJECTED | EXPIRED | REVOKED
    reviewedBy: text("reviewed_by"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_exception_code_uidx").on(t.exceptionCode),
    index("noelia_exception_tenant_idx").on(t.tenantId),
    index("noelia_exception_status_idx").on(t.status),
  ],
);

/** Management review records. */
export const noeliaManagementReviews = pgTable(
  "noelia_management_reviews",
  {
    id: text("id").primaryKey(),
    reviewCode: text("review_code").notNull(),
    title: text("title").notNull(),
    frameworkId: text("framework_id"),
    meetingDate: date("meeting_date"),
    reviewedBy: text("reviewed_by").notNull(),
    scope: text("scope").notNull(),
    decisions: jsonb("decisions").$type<Record<string, unknown>>().notNull().default({}),
    actions: jsonb("actions").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("PLANNED"), // PLANNED | HAPPENED | CLOSED | CANCELLED
    tenantId: text("tenant_id").references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_management_review_code_uidx").on(t.reviewCode),
    index("noelia_management_review_tenant_idx").on(t.tenantId),
  ],
);

/** Regulatory / standards change management. */
export const noeliaRegulatoryChanges = pgTable(
  "noelia_regulatory_changes",
  {
    id: text("id").primaryKey(),
    changeCode: text("change_code").notNull(),
    frameworkId: text("framework_id").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull(),
    sourceUri: text("source_uri"),
    jurisdictionCode: text("jurisdiction_code").references(() => countries.code),
    effectiveDate: date("effective_date"),
    assessment: text("assessment"),
    impactLevel: text("impact_level").notNull().default("UNKNOWN"), // NONE | MINOR | MODERATE | MAJOR | CRITICAL | UNKNOWN
    status: text("status").notNull().default("IDENTIFIED"), // IDENTIFIED | ASSESSED | IMPLEMENTING | VERIFIED | CLOSED | SUPERSEDED
    assignedRole: text("assigned_role"),
    dueDate: date("due_date"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_regulatory_change_code_uidx").on(t.changeCode),
    index("noelia_regulatory_change_framework_idx").on(t.frameworkId),
    index("noelia_regulatory_change_status_idx").on(t.status),
  ],
);

/** Continuous monitoring indicators. */
export const noeliaMonitoringIndicators = pgTable(
  "noelia_monitoring_indicators",
  {
    id: text("id").primaryKey(),
    indicatorCode: text("indicator_code").notNull(),
    title: text("title").notNull(),
    metric: text("metric").notNull(),
    target: text("target"),
    baseline: text("baseline"),
    current: text("current"),
    unit: text("unit"),
    period: text("period"),
    status: text("status").notNull().default("NOT_TRACKING"), // NOT_TRACKING | TRACKING | BREACH | CLEARED
    source: text("source"),
    tenantId: text("tenant_id").references(() => tenants.id),
    countryCode: text("country_code").references(() => countries.code),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_monitoring_indicator_code_uidx").on(t.indicatorCode),
    index("noelia_monitoring_indicator_status_idx").on(t.status),
    index("noelia_monitoring_indicator_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Certification readiness state machine.
 *
 * `state=CERTIFIED` is reachable only via `transitionCertificationReadiness`
 * AFTER a `noeliaEvidence` row of type `EXTERNAL_CERTIFICATE` with
 * `status=VERIFIED`, a real `externalAssessor` and a future `expiresAt` is
 * attached. The engine never sets CERTIFIED on self-assertion.
 */
export const noeliaCertificationReadiness = pgTable(
  "noelia_certification_readiness",
  {
    id: text("id").primaryKey(),
    frameworkId: text("framework_id").notNull(),
    targetScope: text("target_scope").notNull(),
    systemId: text("system_id").references(() => noeliaAiIdentity.id),
    tenantId: text("tenant_id").references(() => tenants.id),
    state: text("state").notNull().default("NOT_STARTED"),
    currentEvidenceHash: text("current_evidence_hash"),
    externalEvidenceId: text("external_evidence_id").references(() => noeliaEvidence.id),
    externalAssessor: text("external_assessor"),
    transitionedBy: text("transitioned_by"),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_certification_readiness_uidx").on(t.frameworkId, t.targetScope),
    index("noelia_certification_readiness_state_idx").on(t.state),
    index("noelia_certification_readiness_tenant_idx").on(t.tenantId),
  ],
);

/** Assessor package (evidence bundle for external assessment). */
export const noeliaAssessorPackages = pgTable(
  "noelia_assessor_packages",
  {
    id: text("id").primaryKey(),
    packageCode: text("package_code").notNull(),
    frameworkId: text("framework_id").notNull(),
    scope: text("scope").notNull(),
    status: text("status").notNull().default("DRAFT"), // DRAFT | REVIEW | ISSUED | OVERDUE | REISSUED | CLOSED
    version: text("version").notNull().default("1.0"),
    contents: jsonb("contents").$type<Record<string, unknown>>().notNull().default({}),
    generatedBy: text("generated_by").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    certificationReadinessId: text("certification_readiness_id").references(() => noeliaCertificationReadiness.id),
    tenantId: text("tenant_id").references(() => tenants.id),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_assessor_package_code_uidx").on(t.packageCode),
    index("noelia_assessor_package_status_idx").on(t.status),
    index("noelia_assessor_package_tenant_idx").on(t.tenantId),
  ],
);

