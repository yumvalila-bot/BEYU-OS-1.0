/**
 * BEYU OS — Foundation OS schema (Sector OS under BEYU OS governance).
 *
 * ONE Foundation OS. The tables below are the foundation domain's own
 * operational records. Canonical ownership is preserved by *reference*:
 *
 *   Identity / auth / RBAC / ABAC / tenant isolation .. BEYU OS (identity.ts)
 *   Enterprise governance (bodies, resolutions, votes) .. BEYU OS (governance.ts)
 *   Workforce master record ................. BEYU OS HCM (people.ts employees)
 *   Financial accounting (ledger, periods) .. canonical Finance (finance.ts)
 *   Enterprise risks / controls ............. assurance.ts (sectorCode FOUNDATION)
 *   Enterprise obligations baselines ........ assurance.ts (linked, not forked)
 *   Documents / events / notifications ...... platform.ts
 *   AI runtime / AI identity ................ HIVE / Noelia (ai*.ts)
 *
 * Foundation OS owns: the foundation registry, formation, structure design &
 * simulation, foundation tax context, foundation compliance deadlines &
 * timely notifications, donors, funds, grants, programs (the pre-existing
 * `foundation_programs` table in people.ts remains canonical for programs),
 * projects, beneficiaries, procurement, assets, investments, safeguarding,
 * impact, workforce *assignments* (contextual; the worker stays in HCM),
 * meetings/conflicts evidence and the knowledge-graph edges it derives.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { classificationEnum } from "./enums";
import { countries, jurisdictions, legalEntities, tenants } from "./core";
import { parties, users } from "./identity";
import { employees, foundationPrograms } from "./people";
import { documents } from "./platform";

/* ==========================================================================
 * 1. FOUNDATION REGISTRY & TYPES
 * ========================================================================== */

export const foundationTypes = pgTable(
  "foundation_types",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Jurisdiction codes where this vehicle is known to be available. Never exhaustive. */
    availableIn: jsonb("available_in").$type<string[]>().notNull().default([]),
    defaultGovernance: text("default_governance"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_types_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_types_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Canonical Foundation Registry. Lifecycle:
 * PROPOSED → FORMATION → REGISTRATION_PENDING → REGISTERED → ACTIVE
 * ⇄ RESTRICTED / SUSPENDED / DORMANT / RESTRUCTURING ⇄
 * → DISSOLVING → DISSOLVED → ARCHIVED
 */
export const foundations = pgTable(
  "foundations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    legalName: text("legal_name").notNull(),
    operatingName: text("operating_name"),
    foundationTypeId: text("foundation_type_id").references(() => foundationTypes.id),
    legalVehicle: text("legal_vehicle").notNull(),
    registrationNumber: text("registration_number"),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    regulator: text("regulator"),
    taxAuthority: text("tax_authority"),
    taxStatus: text("tax_status").notNull().default("UNDER_REVIEW"),
    fiscalYearEnd: text("fiscal_year_end"),
    baseCurrency: text("base_currency").notNull().default("USD"),
    mission: text("mission"),
    purpose: text("purpose"),
    geographicScope: text("geographic_scope"),
    beneficiaryScope: text("beneficiary_scope"),
    foundingDate: date("founding_date"),
    registrationDate: date("registration_date"),
    status: text("status").notNull().default("PROPOSED"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusChangedBy: text("status_changed_by"),
    governanceBodyId: text("governance_body_id"),
    ownerRole: text("owner_role").notNull().default("FOUNDATION_DIRECTOR"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundations_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundations_tenant_idx").on(t.tenantId),
    index("foundations_entity_idx").on(t.legalEntityId),
    index("foundations_status_idx").on(t.status),
  ],
);

/* ==========================================================================
 * 2. FORMATION ENGINE ("START A FOUNDATION")
 * ========================================================================== */

export const formationCases = pgTable(
  "formation_cases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    foundationId: text("foundation_id").references(() => foundations.id),
    /** Founder party (canonical identity). */
    founderPartyId: text("founder_party_id").references(() => parties.id),
    proposedName: text("proposed_name").notNull(),
    mission: text("mission"),
    purpose: text("purpose"),
    activities: text("activities"),
    beneficiaryScope: text("beneficiary_scope"),
    geographicScope: text("geographic_scope"),
    fundingModel: text("funding_model"),
    initialCapital: numeric("initial_capital", { precision: 18, scale: 2 }),
    endowmentTarget: numeric("endowment_target", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    governanceModel: text("governance_model"),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    proposedVehicle: text("proposed_vehicle"),
    taxObjectives: text("tax_objectives"),
    donorModel: text("donor_model"),
    grantmakingModel: text("grantmaking_model"),
    internationalActivities: boolean("international_activities").notNull().default(false),
    expectedWorkforce: integer("expected_workforce"),
    /** Machine-readable assessment produced by the formation engine. */
    assessment: jsonb("assessment").$type<Record<string, unknown>>(),
    recommendation: text("recommendation"),
    status: text("status").notNull().default("INTAKE"),
    ownerRole: text("owner_role").notNull().default("FOUNDATION_OFFICER"),
    legalReviewRequired: boolean("legal_review_required").notNull().default(true),
    taxReviewRequired: boolean("tax_review_required").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("formation_cases_tenant_code_uidx").on(t.tenantId, t.code),
    index("formation_cases_tenant_idx").on(t.tenantId),
    index("formation_cases_status_idx").on(t.status),
  ],
);

/* ==========================================================================
 * 3. STRUCTURE DESIGNER & SIMULATOR
 * ========================================================================== */

export const structureProposals = pgTable(
  "structure_proposals",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    foundationId: text("foundation_id").references(() => foundations.id),
    kind: text("kind").notNull().default("PROPOSED"), // CURRENT | PROPOSED
    title: text("title").notNull(),
    /** Nodes/edges: entities, ownership, control, funding relationships. */
    graph: jsonb("graph").$type<Record<string, unknown>>().notNull().default({}),
    rationale: text("rationale"),
    status: text("status").notNull().default("DRAFT"),
    proposedBy: text("proposed_by"),
    resolutionId: text("resolution_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("structure_proposals_tenant_code_uidx").on(t.tenantId, t.code),
    index("structure_proposals_tenant_idx").on(t.tenantId),
  ],
);

export const structureScenarios = pgTable(
  "structure_scenarios",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    baselineProposalId: text("baseline_proposal_id").references(() => structureProposals.id),
    candidateProposalId: text("candidate_proposal_id").references(() => structureProposals.id),
    question: text("question").notNull(),
    /** Deterministic before/after diff produced by the simulator. */
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    impacts: jsonb("impacts").$type<Record<string, unknown>>(),
    requiredApprovals: jsonb("required_approvals").$type<string[]>().notNull().default([]),
    implementationTasks: jsonb("implementation_tasks").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("DRAFT"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("structure_scenarios_tenant_code_uidx").on(t.tenantId, t.code),
    index("structure_scenarios_tenant_idx").on(t.tenantId),
  ],
);

/* ==========================================================================
 * 4. FOUNDATION GOVERNANCE (meetings, conflicts; bodies/resolutions canonical)
 * ========================================================================== */

export const foundationMeetings = pgTable(
  "foundation_meetings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    /** Canonical governance body (governance.governance_bodies). */
    governanceBodyId: text("governance_body_id").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    location: text("location"),
    agenda: jsonb("agenda").$type<Array<Record<string, unknown>>>().notNull().default([]),
    minutesDocumentId: text("minutes_document_id").references(() => documents.id),
    quorumRequired: integer("quorum_required"),
    quorumMet: boolean("quorum_met"),
    status: text("status").notNull().default("SCHEDULED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_meetings_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_meetings_foundation_idx").on(t.foundationId),
  ],
);

export const foundationConflicts = pgTable(
  "foundation_conflicts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    interestType: text("interest_type").notNull(), // FINANCIAL | FAMILY | FIDUCIARY | OTHER
    description: text("description").notNull(),
    relatedEntity: text("related_entity"),
    relatedGrantId: text("related_grant_id"),
    relatedProcurementId: text("related_procurement_id"),
    severity: text("severity").notNull().default("MEDIUM"),
    mitigation: text("mitigation"),
    status: text("status").notNull().default("DECLARED"),
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: text("reviewed_by"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    index("foundation_conflicts_tenant_idx").on(t.tenantId),
    index("foundation_conflicts_foundation_idx").on(t.foundationId),
  ],
);

/* ==========================================================================
 * 5. TAX INTELLIGENCE (foundation tax context; canonical Finance owns ledger)
 * ========================================================================== */

export const foundationTaxProfiles = pgTable(
  "foundation_tax_profiles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    taxStatus: text("tax_status").notNull().default("UNDER_REVIEW"),
    exemptSince: date("exempt_since"),
    registrationRef: text("registration_ref"),
    fiscalYearEnd: text("fiscal_year_end"),
    assumptions: text("assumptions"),
    lastReviewedAt: date("last_reviewed_at"),
    nextReviewAt: date("next_review_at"),
    professionalReviewRequired: boolean("professional_review_required").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_tax_profiles_foundation_uidx").on(t.foundationId),
    index("foundation_tax_profiles_tenant_idx").on(t.tenantId),
  ],
);

/** Versioned, sourced jurisdiction rules. Never invent; always verify. */
export const foundationTaxRules = pgTable(
  "foundation_tax_rules",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    authority: text("authority").notNull(),
    source: text("source").notNull(),
    ruleVersion: text("rule_version").notNull().default("1.0"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    supersededBy: text("superseded_by"),
    applicability: text("applicability").notNull(),
    ruleBody: jsonb("rule_body").$type<Record<string, unknown>>().notNull().default({}),
    verificationDate: date("verification_date"),
    status: text("status").notNull().default("UNDER_REVIEW"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_tax_rules_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_tax_rules_jurisdiction_idx").on(t.jurisdictionId),
  ],
);

export const foundationTaxAssessments = pgTable(
  "foundation_tax_assessments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    taxRuleId: text("tax_rule_id").references(() => foundationTaxRules.id),
    activity: text("activity").notNull(),
    transactionRef: text("transaction_ref"),
    taxStatus: text("tax_status").notNull().default("UNDER_REVIEW"),
    potentialBenefit: text("potential_benefit"),
    potentialLiability: text("potential_liability"),
    assumptions: text("assumptions"),
    risks: text("risks"),
    professionalReviewRequired: boolean("professional_review_required").notNull().default(true),
    reviewer: text("reviewer"),
    assessedBy: text("assessed_by"),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("foundation_tax_assessments_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_tax_assessments_foundation_idx").on(t.foundationId),
  ],
);

/* ==========================================================================
 * 6. TIMELY COMPLIANCE ENGINE
 * RULE → APPLICABILITY → OBLIGATION → DEADLINE → TASK → OWNER →
 * NOTIFICATION → REVIEW → SUBMISSION → EVIDENCE → VERIFICATION →
 * COMPLETION → AUDIT
 * ========================================================================== */

export const foundationObligations = pgTable(
  "foundation_obligations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    requirement: text("requirement").notNull(),
    authority: text("authority").notNull(),
    regulator: text("regulator"),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    /** Canonical enterprise obligation this operationalises, if any. */
    canonicalObligationId: text("canonical_obligation_id"),
    trigger: text("trigger").notNull(), // REGISTRATION | FISCAL_YEAR | TRANSACTION | GRANT | MEETING | PERIOD | ANNIVERSARY | STATUTORY | NOTICE | RULE_CHANGE
    frequency: text("frequency").notNull().default("ANNUAL"),
    /** Machine-readable deadline rule: { offsetDays, basis, businessDays, ... } */
    deadlineRule: jsonb("deadline_rule").$type<Record<string, unknown>>().notNull().default({}),
    effectiveFrom: date("effective_from").notNull(),
    ownerRole: text("owner_role").notNull(),
    approverRole: text("approver_role"),
    evidenceRequired: boolean("evidence_required").notNull().default(true),
    riskRating: text("risk_rating").notNull().default("MEDIUM"),
    status: text("status").notNull().default("ACTIVE"),
    source: text("source"),
    verificationDate: date("verification_date"),
    nextReviewAt: date("next_review_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_obligations_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_obligations_foundation_idx").on(t.foundationId),
    index("foundation_obligations_status_idx").on(t.status),
  ],
);

export const foundationDeadlines = pgTable(
  "foundation_deadlines",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => foundationObligations.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    periodLabel: text("period_label"),
    triggerDate: date("trigger_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** Ordered reminder offsets in days-before-due. Default 90/60/30/14/7/3/1/0. */
    reminderSchedule: jsonb("reminder_schedule").$type<number[]>().notNull().default([90, 60, 30, 14, 7, 3, 1, 0]),
    extensions: jsonb("extensions").$type<Array<Record<string, unknown>>>().notNull().default([]),
    overriddenDueDate: date("overridden_due_date"),
    overrideReason: text("override_reason"),
    overrideApprovedBy: text("override_approved_by"),
    /** UPCOMING | DUE_TODAY | OVERDUE | SUBMITTED | VERIFIED | COMPLETED | WAIVED */
    status: text("status").notNull().default("UPCOMING"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("foundation_deadlines_tenant_idx").on(t.tenantId),
    index("foundation_deadlines_obligation_idx").on(t.obligationId),
    index("foundation_deadlines_due_idx").on(t.dueDate),
    index("foundation_deadlines_status_idx").on(t.status),
  ],
);

export const foundationComplianceTasks = pgTable(
  "foundation_compliance_tasks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineId: text("deadline_id")
      .notNull()
      .references(() => foundationDeadlines.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    ownerRole: text("owner_role").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id),
    dependsOnTaskId: text("depends_on_task_id"),
    /** OPEN | IN_PROGRESS | BLOCKED | SUBMITTED | VERIFIED | COMPLETED | OVERDUE */
    status: text("status").notNull().default("OPEN"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_compliance_tasks_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_compliance_tasks_deadline_idx").on(t.deadlineId),
    index("foundation_compliance_tasks_status_idx").on(t.status),
  ],
);

/**
 * Delivery tracking + idempotency for compliance notifications.
 * The canonical `notifications` table carries the user-visible message;
 * this log guarantees exactly-once scheduling per (deadline, offset, channel).
 */
export const foundationNotificationLog = pgTable(
  "foundation_notification_log",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineId: text("deadline_id").references(() => foundationDeadlines.id),
    taskId: text("task_id").references(() => foundationComplianceTasks.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    /** Stable scheduling key: FNDL:<deadline>:<offsetDays>:<channel>. */
    idempotencyKey: text("idempotency_key").notNull(),
    channel: text("channel").notNull().default("IN_APP"),
    offsetDays: integer("offset_days"),
    recipientRole: text("recipient_role"),
    recipientUserId: text("recipient_user_id").references(() => users.id),
    notificationId: text("notification_id"),
    /** QUEUED | SENT | DELIVERED | ACKNOWLEDGED | FAILED | RETRIED | ESCALATED */
    status: text("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_notification_log_key_uidx").on(t.tenantId, t.idempotencyKey),
    index("foundation_notification_log_deadline_idx").on(t.deadlineId),
    index("foundation_notification_log_status_idx").on(t.status),
  ],
);

export const foundationEscalations = pgTable(
  "foundation_escalations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineId: text("deadline_id").references(() => foundationDeadlines.id),
    taskId: text("task_id").references(() => foundationComplianceTasks.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    level: integer("level").notNull(),
    fromRole: text("from_role").notNull(),
    toRole: text("to_role").notNull(),
    reason: text("reason").notNull(),
    /** OPEN | ACKNOWLEDGED | RESOLVED */
    status: text("status").notNull().default("OPEN"),
    acknowledgedBy: text("acknowledged_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("foundation_escalations_tenant_idx").on(t.tenantId),
    index("foundation_escalations_deadline_idx").on(t.deadlineId),
    index("foundation_escalations_status_idx").on(t.status),
  ],
);

export const foundationEvidence = pgTable(
  "foundation_evidence",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    obligationId: text("obligation_id").references(() => foundationObligations.id),
    deadlineId: text("deadline_id").references(() => foundationDeadlines.id),
    taskId: text("task_id").references(() => foundationComplianceTasks.id),
    /** Canonical document carrying the artefact. */
    documentId: text("document_id").references(() => documents.id),
    evidenceType: text("evidence_type").notNull(),
    title: text("title").notNull(),
    /** PENDING | SUBMITTED | VERIFIED | REJECTED | EXPIRED */
    status: text("status").notNull().default("PENDING"),
    expiresAt: date("expires_at"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("foundation_evidence_tenant_idx").on(t.tenantId),
    index("foundation_evidence_deadline_idx").on(t.deadlineId),
    index("foundation_evidence_status_idx").on(t.status),
  ],
);

/* ==========================================================================
 * 7. DONORS, FUNDS, GRANTS
 * DONOR → DONATION → FUND → RESTRICTION → PROGRAM → OUTCOME
 * ========================================================================== */

export const donors = pgTable(
  "donors",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    donorType: text("donor_type").notNull(), // INDIVIDUAL | CORPORATE | TRUST | FOUNDATION | GOVERNMENT | MULTILATERAL
    partyId: text("party_id").references(() => parties.id),
    countryCode: text("country_code").references(() => countries.code),
    contactRef: text("contact_ref"),
    /** NONE | PENDING | CLEARED | FLAGGED | BLOCKED */
    dueDiligenceStatus: text("due_diligence_status").notNull().default("PENDING"),
    dueDiligenceAt: timestamp("due_diligence_at", { withTimezone: true }),
    stewardOwnerRole: text("steward_owner_role").notNull().default("FOUNDATION_OFFICER"),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("donors_tenant_code_uidx").on(t.tenantId, t.code),
    index("donors_tenant_idx").on(t.tenantId),
  ],
);

export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    donorId: text("donor_id")
      .notNull()
      .references(() => donors.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    fundId: text("fund_id"),
    code: text("code").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    receivedAt: date("received_at").notNull(),
    channel: text("channel"),
    restrictionSummary: text("restriction_summary"),
    agreementDocumentId: text("agreement_document_id").references(() => documents.id),
    /** PLEDGED | RECEIVED | ALLOCATED | ACKNOWLEDGED | RETURNED */
    status: text("status").notNull().default("RECEIVED"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    /** Canonical journal entry once Finance posts the receipt. */
    journalEntryId: text("journal_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("donations_tenant_code_uidx").on(t.tenantId, t.code),
    index("donations_donor_idx").on(t.donorId),
    index("donations_foundation_idx").on(t.foundationId),
  ],
);

export const donationPledges = pgTable(
  "donation_pledges",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    donorId: text("donor_id")
      .notNull()
      .references(() => donors.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    pledgedAmount: numeric("pledged_amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    schedule: jsonb("schedule").$type<Array<Record<string, unknown>>>().notNull().default([]),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** DRAFT | ACTIVE | FULFILLED | DEFAULTED | CANCELLED */
    status: text("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("donation_pledges_tenant_code_uidx").on(t.tenantId, t.code),
    index("donation_pledges_donor_idx").on(t.donorId),
  ],
);

export const funds = pgTable(
  "funds",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** RESTRICTED | UNRESTRICTED | DESIGNATED | ENDOWMENT | RESERVE */
    fundType: text("fund_type").notNull(),
    purpose: text("purpose"),
    source: text("source"),
    currency: text("currency").notNull().default("USD"),
    balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
    committed: numeric("committed", { precision: 18, scale: 2 }).notNull().default("0"),
    reportingObligations: text("reporting_obligations"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("funds_tenant_code_uidx").on(t.tenantId, t.code),
    index("funds_foundation_idx").on(t.foundationId),
  ],
);

export const fundRestrictions = pgTable(
  "fund_restrictions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fundId: text("fund_id")
      .notNull()
      .references(() => funds.id),
    restrictionType: text("restriction_type").notNull(), // PURPOSE | GEOGRAPHY | TIME | MATCHING | PROHIBITION
    rule: text("rule").notNull(),
    donorId: text("donor_id").references(() => donors.id),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    status: text("status").notNull().default("ACTIVE"),
  },
  (t) => [
    index("fund_restrictions_tenant_idx").on(t.tenantId),
    index("fund_restrictions_fund_idx").on(t.fundId),
  ],
);

export const fundAllocations = pgTable(
  "fund_allocations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fundId: text("fund_id")
      .notNull()
      .references(() => funds.id),
    programId: text("program_id").references(() => foundationPrograms.id),
    grantId: text("grant_id"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    purpose: text("purpose"),
    allocatedBy: text("allocated_by"),
    approvalRef: text("approval_ref"),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
    /** PROPOSED | APPROVED | POSTED | REVERSED */
    status: text("status").notNull().default("PROPOSED"),
  },
  (t) => [
    index("fund_allocations_tenant_idx").on(t.tenantId),
    index("fund_allocations_fund_idx").on(t.fundId),
  ],
);

export const grantees = pgTable(
  "grantees",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    granteeType: text("grantee_type").notNull(), // ORGANIZATION | INDIVIDUAL | GOVERNMENT
    countryCode: text("country_code").references(() => countries.code),
    registrationRef: text("registration_ref"),
    /** NONE | PENDING | CLEARED | FLAGGED | BLOCKED */
    dueDiligenceStatus: text("due_diligence_status").notNull().default("PENDING"),
    sanctionsCheckedAt: timestamp("sanctions_checked_at", { withTimezone: true }),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("grantees_tenant_code_uidx").on(t.tenantId, t.code),
    index("grantees_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Grant lifecycle: OPPORTUNITY → APPLICATION → ELIGIBILITY → DUE_DILIGENCE →
 * ASSESSMENT → SCORING → CONFLICT_CHECK → APPROVAL → AGREEMENT →
 * DISBURSEMENT → MILESTONES → MONITORING → REPORTING → CLOSEOUT
 */
export const grants = pgTable(
  "grants",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    fundId: text("fund_id").references(() => funds.id),
    programId: text("program_id").references(() => foundationPrograms.id),
    granteeId: text("grantee_id").references(() => grantees.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    budget: jsonb("budget").$type<Record<string, unknown>>().notNull().default({}),
    restrictions: text("restrictions"),
    eligibilityResult: text("eligibility_result"),
    assessmentScore: numeric("assessment_score", { precision: 7, scale: 2 }),
    conflictCheckStatus: text("conflict_check_status").notNull().default("PENDING"),
    approvalRef: text("approval_ref"),
    agreementDocumentId: text("agreement_document_id").references(() => documents.id),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: text("status").notNull().default("OPPORTUNITY"),
    riskRating: text("risk_rating").notNull().default("MEDIUM"),
    ownerRole: text("owner_role").notNull().default("FOUNDATION_OFFICER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("grants_tenant_code_uidx").on(t.tenantId, t.code),
    index("grants_foundation_idx").on(t.foundationId),
    index("grants_status_idx").on(t.status),
  ],
);

export const grantMilestones = pgTable(
  "grant_milestones",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    deliverables: text("deliverables"),
    dueDate: date("due_date"),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    /** PENDING | IN_PROGRESS | SUBMITTED | VERIFIED | OVERDUE */
    status: text("status").notNull().default("PENDING"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("grant_milestones_grant_code_uidx").on(t.grantId, t.code),
    index("grant_milestones_tenant_idx").on(t.tenantId),
  ],
);

export const grantDisbursements = pgTable(
  "grant_disbursements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    grantId: text("grant_id")
      .notNull()
      .references(() => grants.id),
    milestoneId: text("milestone_id").references(() => grantMilestones.id),
    code: text("code").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    scheduledFor: date("scheduled_for"),
    /** SCHEDULED | APPROVED | RELEASED | RECONCILED | HELD | CANCELLED */
    status: text("status").notNull().default("SCHEDULED"),
    approvalRef: text("approval_ref"),
    journalEntryId: text("journal_entry_id"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("grant_disbursements_tenant_code_uidx").on(t.tenantId, t.code),
    index("grant_disbursements_grant_idx").on(t.grantId),
  ],
);

/* ==========================================================================
 * 8. PROJECTS, BENEFICIARIES
 * (Programs reuse canonical `foundation_programs` in people.ts.)
 * ========================================================================== */

export const foundationProjects = pgTable(
  "foundation_projects",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    programId: text("program_id")
      .notNull()
      .references(() => foundationPrograms.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    objectives: text("objectives"),
    geography: text("geography"),
    budget: numeric("budget", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: text("status").notNull().default("PLANNED"),
    ownerRole: text("owner_role").notNull().default("FOUNDATION_OFFICER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_projects_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_projects_program_idx").on(t.programId),
  ],
);

export const foundationProjectTasks = pgTable(
  "foundation_project_tasks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => foundationProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    dependsOnTaskId: text("depends_on_task_id"),
    ownerRole: text("owner_role"),
    dueDate: date("due_date"),
    status: text("status").notNull().default("TODO"),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
  },
  (t) => [
    uniqueIndex("foundation_project_tasks_project_code_uidx").on(t.projectId, t.code),
    index("foundation_project_tasks_tenant_idx").on(t.tenantId),
  ],
);

export const foundationBeneficiaries = pgTable(
  "foundation_beneficiaries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    programId: text("program_id").references(() => foundationPrograms.id),
    projectId: text("project_id").references(() => foundationProjects.id),
    code: text("code").notNull(),
    /** Minimised record: no sensitive personal data beyond service need. */
    cohort: text("cohort"),
    eligibilityStatus: text("eligibility_status").notNull().default("UNDER_REVIEW"),
    consentStatus: text("consent_status").notNull().default("PENDING"),
    consentRef: text("consent_ref"),
    safeguardingFlag: boolean("safeguarding_flag").notNull().default(false),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_beneficiaries_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_beneficiaries_program_idx").on(t.programId),
  ],
);

export const beneficiaryServices = pgTable(
  "beneficiary_services",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    beneficiaryId: text("beneficiary_id")
      .notNull()
      .references(() => foundationBeneficiaries.id),
    serviceType: text("service_type").notNull(),
    providedAt: date("provided_at").notNull(),
    outcome: text("outcome"),
    providerRef: text("provider_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    index("beneficiary_services_tenant_idx").on(t.tenantId),
    index("beneficiary_services_beneficiary_idx").on(t.beneficiaryId),
  ],
);

/* ==========================================================================
 * 9. PROCUREMENT, ASSETS, INVESTMENTS
 * ========================================================================== */

export const suppliers = pgTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    countryCode: text("country_code").references(() => countries.code),
    registrationRef: text("registration_ref"),
    dueDiligenceStatus: text("due_diligence_status").notNull().default("PENDING"),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("suppliers_tenant_code_uidx").on(t.tenantId, t.code),
    index("suppliers_tenant_idx").on(t.tenantId),
  ],
);

/** NEED → BUDGET → PROCUREMENT → DUE_DILIGENCE → QUOTES → EVALUATION →
 *  CONFLICT_CHECK → APPROVAL → CONTRACT → DELIVERY → INVOICE → PAYMENT → AUDIT */
export const procurements = pgTable(
  "procurements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    needStatement: text("need_statement"),
    budgetAmount: numeric("budget_amount", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    supplierId: text("supplier_id").references(() => suppliers.id),
    quotes: jsonb("quotes").$type<Array<Record<string, unknown>>>().notNull().default([]),
    conflictCheckStatus: text("conflict_check_status").notNull().default("PENDING"),
    contractDocumentId: text("contract_document_id").references(() => documents.id),
    status: text("status").notNull().default("NEED"),
    approvalRef: text("approval_ref"),
    ownerRole: text("owner_role").notNull().default("FOUNDATION_OFFICER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("procurements_tenant_code_uidx").on(t.tenantId, t.code),
    index("procurements_foundation_idx").on(t.foundationId),
    index("procurements_status_idx").on(t.status),
  ],
);

/** ACQUIRE → REGISTER → USE → MAINTAIN → TRANSFER → DISPOSE */
export const foundationAssets = pgTable(
  "foundation_assets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    assetType: text("asset_type").notNull(), // LAND | BUILDING | VEHICLE | EQUIPMENT | TECHNOLOGY | INVENTORY | DONATED | IP
    acquisitionDate: date("acquisition_date"),
    acquisitionValue: numeric("acquisition_value", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    donatedByDonorId: text("donated_by_donor_id").references(() => donors.id),
    location: text("location"),
    custodianRole: text("custodian_role"),
    status: text("status").notNull().default("REGISTERED"),
    disposalRef: text("disposal_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_assets_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_assets_foundation_idx").on(t.foundationId),
  ],
);

export const foundationInvestmentPolicies = pgTable(
  "foundation_investment_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    assetAllocation: jsonb("asset_allocation").$type<Record<string, unknown>>().notNull().default({}),
    liquidityRequirement: text("liquidity_requirement"),
    riskAppetite: text("risk_appetite"),
    concentrationLimits: text("concentration_limits"),
    prohibitedInstruments: text("prohibited_instruments"),
    approvalRef: text("approval_ref"),
    status: text("status").notNull().default("DRAFT"),
    effectiveFrom: date("effective_from"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_investment_policies_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_investment_policies_foundation_idx").on(t.foundationId),
  ],
);

export const foundationInvestments = pgTable(
  "foundation_investments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    policyId: text("policy_id").references(() => foundationInvestmentPolicies.id),
    fundId: text("fund_id").references(() => funds.id),
    code: text("code").notNull(),
    instrument: text("instrument").notNull(),
    counterparty: text("counterparty"),
    principalAmount: numeric("principal_amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    expectedReturnPct: numeric("expected_return_pct", { precision: 7, scale: 4 }),
    maturityDate: date("maturity_date"),
    /** PROPOSED | APPROVED | ACTIVE | MATURED | DIVESTED | IMPAIRED */
    status: text("status").notNull().default("PROPOSED"),
    approvalRef: text("approval_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foundation_investments_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_investments_foundation_idx").on(t.foundationId),
  ],
);

/* ==========================================================================
 * 10. SAFEGUARDING, IMPACT, WORKFORCE ASSIGNMENTS
 * ========================================================================== */

export const safeguardingCases = pgTable(
  "safeguarding_cases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    code: text("code").notNull(),
    caseType: text("case_type").notNull(), // SAFEGUARDING | CHILD_PROTECTION | ABUSE | EXPLOITATION | HARASSMENT | WHISTLEBLOWING
    summary: text("summary").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    reporterRef: text("reporter_ref"),
    /** REPORTED | TRIAGED | INVESTIGATING | ACTIONED | CLOSED */
    status: text("status").notNull().default("REPORTED"),
    investigatorRole: text("investigator_role"),
    correctiveAction: text("corrective_action"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
  },
  (t) => [
    uniqueIndex("safeguarding_cases_tenant_code_uidx").on(t.tenantId, t.code),
    index("safeguarding_cases_foundation_idx").on(t.foundationId),
  ],
);

/** INPUT → ACTIVITY → OUTPUT → OUTCOME → IMPACT */
export const foundationImpactMetrics = pgTable(
  "foundation_impact_metrics",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    programId: text("program_id").references(() => foundationPrograms.id),
    projectId: text("projectId").references(() => foundationProjects.id),
    grantId: text("grant_id").references(() => grants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    level: text("level").notNull(), // INPUT | ACTIVITY | OUTPUT | OUTCOME | IMPACT
    unit: text("unit").notNull(),
    baseline: numeric("baseline", { precision: 18, scale: 4 }),
    target: numeric("target", { precision: 18, scale: 4 }),
    geography: text("geography"),
    beneficiaryScope: text("beneficiary_scope"),
    status: text("status").notNull().default("ACTIVE"),
  },
  (t) => [
    uniqueIndex("foundation_impact_metrics_tenant_code_uidx").on(t.tenantId, t.code),
    index("foundation_impact_metrics_program_idx").on(t.programId),
  ],
);

export const foundationImpactMeasurements = pgTable(
  "foundation_impact_measurements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    metricId: text("metric_id")
      .notNull()
      .references(() => foundationImpactMetrics.id),
    period: text("period").notNull(),
    actual: numeric("actual", { precision: 18, scale: 4 }).notNull(),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    recordedBy: text("recorded_by"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("foundation_impact_measurements_tenant_idx").on(t.tenantId),
    index("foundation_impact_measurements_metric_idx").on(t.metricId),
  ],
);

/**
 * Contextual foundation assignments. The worker (identity, employment,
 * position, lifecycle) is owned by canonical HCM — this table only states
 * that an HCM employee serves a foundation/program/grant in a given capacity.
 */
export const foundationWorkforceAssignments = pgTable(
  "foundation_workforce_assignments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    foundationId: text("foundation_id")
      .notNull()
      .references(() => foundations.id),
    programId: text("program_id").references(() => foundationPrograms.id),
    projectId: text("projectId").references(() => foundationProjects.id),
    grantId: text("grant_id").references(() => grants.id),
    assignmentType: text("assignment_type").notNull(), // FOUNDATION | PROGRAM | PROJECT | GRANT | COMPLIANCE | SAFEGUARDING | BOARD | FIELD
    roleTitle: text("role_title").notNull(),
    responsibilityScope: text("responsibility_scope"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("foundation_workforce_assignments_tenant_idx").on(t.tenantId),
    index("foundation_workforce_assignments_employee_idx").on(t.employeeId),
    index("foundation_workforce_assignments_foundation_idx").on(t.foundationId),
  ],
);
