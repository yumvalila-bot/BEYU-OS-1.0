/**
 * BEYU OS — Risk, Control, Compliance and Legal & Liability.
 * Authoritative for enterprise risk register, control library, regulatory
 * obligations, assessments and legal matters.
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
import { classificationEnum, complianceStateEnum, riskCategoryEnum, versionStatusEnum } from "./enums";
import { legalEntities, tenants } from "./core";
import { users } from "./identity";

export const risks = pgTable(
  "risks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    category: riskCategoryEnum("category").notNull(),
    description: text("description").notNull(),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    sectorCode: text("sector_code"),
    inherentLikelihood: integer("inherent_likelihood").notNull(), // 1..5
    inherentImpact: integer("inherent_impact").notNull(), // 1..5
    residualLikelihood: integer("residual_likelihood").notNull(),
    residualImpact: integer("residual_impact").notNull(),
    appetiteThreshold: integer("appetite_threshold").notNull().default(12),
    treatment: text("treatment").notNull(), // MITIGATE | ACCEPT | TRANSFER | AVOID
    ownerUserId: text("owner_user_id").references(() => users.id),
    mitigationPlan: text("mitigation_plan"),
    status: text("status").notNull().default("OPEN"), // OPEN | MONITORED | ESCALATED | CLOSED
    escalated: boolean("escalated").notNull().default(false),
    lastReviewedAt: date("last_reviewed_at"),
    nextReviewAt: date("next_review_at"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [uniqueIndex("risks_code_uidx").on(t.code), index("risks_tenant_idx").on(t.tenantId)],
);

export const controls = pgTable(
  "controls",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    controlType: text("control_type").notNull(), // PREVENTIVE | DETECTIVE | CORRECTIVE
    automation: text("automation").notNull().default("MANUAL"), // MANUAL | SEMI_AUTOMATED | AUTOMATED
    frameworks: jsonb("frameworks").$type<string[]>().notNull().default([]),
    riskId: text("risk_id").references(() => risks.id),
    ownerRole: text("owner_role").notNull(),
    testFrequency: text("test_frequency").notNull().default("QUARTERLY"),
    lastTestedAt: date("last_tested_at"),
    effectiveness: text("effectiveness").notNull().default("NOT_ASSESSED"),
    evidenceDocumentId: text("evidence_document_id"),
  },
  (t) => [uniqueIndex("controls_code_uidx").on(t.code)],
);

export const complianceObligations = pgTable(
  "compliance_obligations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    framework: text("framework").notNull(), // GDPR | ISO27001 | SOC2 | AML_KYC | IFRS | TRA | NHIF ...
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    obligationType: text("obligation_type").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    sectorCode: text("sector_code"),
    frequency: text("frequency").notNull().default("ANNUAL"),
    nextDueAt: date("next_due_at"),
    ownerRole: text("owner_role").notNull(),
    controlIds: jsonb("control_ids").$type<string[]>().notNull().default([]),
    status: versionStatusEnum("status").notNull().default("ACTIVE"),
  },
  (t) => [uniqueIndex("compliance_obligations_code_uidx").on(t.code)],
);

export const complianceAssessments = pgTable(
  "compliance_assessments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => complianceObligations.id),
    period: text("period").notNull(),
    state: complianceStateEnum("state").notNull().default("NOT_ASSESSED"),
    evidenceDocumentId: text("evidence_document_id"),
    findings: text("findings"),
    remediationPlan: text("remediation_plan"),
    remediationDueAt: date("remediation_due_at"),
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    assessedBy: text("assessed_by").notNull(),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
    humanConfirmed: boolean("human_confirmed").notNull().default(false),
  },
  (t) => [index("compliance_assessments_obligation_idx").on(t.obligationId)],
);

export const legalMatters = pgTable(
  "legal_matters",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    matterType: text("matter_type").notNull(), // CONTRACT | CLAIM | DISPUTE | LICENSE | PERMIT | LITIGATION | POA
    title: text("title").notNull(),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    counterparty: text("counterparty"),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    exposureAmount: numeric("exposure_amount", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    obligationSummary: text("obligation_summary"),
    keyDeadline: date("key_deadline"),
    counselName: text("counsel_name"),
    status: text("status").notNull().default("OPEN"),
    documentId: text("document_id"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [uniqueIndex("legal_matters_code_uidx").on(t.code)],
);

/** Fraud / anomaly intelligence signals — always evidence bearing. */
export const anomalySignals = pgTable("anomaly_signals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  detector: text("detector").notNull(),
  signalType: text("signal_type").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  severity: text("severity").notNull().default("MEDIUM"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("OPEN"),
  assignedRole: text("assigned_role"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
});

/** Business continuity & disaster recovery register. */
export const continuityPlans = pgTable("continuity_plans", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  scope: text("scope").notNull(),
  scenario: text("scenario").notNull(),
  rpoMinutes: integer("rpo_minutes").notNull(),
  rtoMinutes: integer("rto_minutes").notNull(),
  strategy: text("strategy").notNull(),
  ownerRole: text("owner_role").notNull(),
  lastTestedAt: date("last_tested_at"),
  lastTestOutcome: text("last_test_outcome"),
  nextTestDue: date("next_test_due"),
  runbookUri: text("runbook_uri"),
});
