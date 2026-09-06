-- 0026 — BEYU Noelia AI global compliance, conformity, assurance, evidence
-- and continuous governance engine.
--
-- ADDITIVE ONLY. This migration introduces governance registers. It grants NO
-- runtime authority and does NOT weaken any Phase 1–3 fail-closed rule.
--
--   * noelia_ai_requirements — requirement registry
--   * noelia_applicability_assessments — requirement ⇄ subject applicability
--   * noelia_controls — DB-backed control registry
--   * noelia_requirement_controls — requirement ⇄ control mapping
--   * noelia_evidence — tamper-evident evidence registry
--   * noelia_impact_assessments — AI impact assessment
--   * noelia_risk_treatments — AI risk treatment
--   * noelia_internal_audits — internal audit program
--   * noelia_findings — audit findings
--   * noelia_corrective_actions — CAPA
--   * noelia_exceptions — control exceptions/risk acceptance
--   * noelia_management_reviews — management review
--   * noelia_regulatory_changes — regulatory change management
--   * noelia_monitoring_indicators — continuous monitoring
--   * noelia_certification_readiness — certification readiness state machine
--   * noelia_assessor_packages — assessor evidence package
--
-- RLS is enabled on all tenant-scoped tables via the canonical context helpers.
-- Global governance tables remain application-permission gated
-- (ai:compliance.read / .write / .audit / .certification / .metrics).
--
-- No credentials, provider secrets or certificate private material are stored.

-- 1. Requirement registry.
CREATE TABLE "noelia_ai_requirements" (
  "id" text PRIMARY KEY NOT NULL,
  "requirement_code" text NOT NULL,
  "framework_id" text NOT NULL,
  "reference" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "category" text NOT NULL,
  "jurisdiction_code" text REFERENCES "countries"("code"),
  "country_code" text REFERENCES "countries"("code"),
  "applicable_to_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "owner_role" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'MEDIUM',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "effective_from" date,
  "effective_to" date,
  "source" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_ai_requirements_code_uidx" ON "noelia_ai_requirements" ("requirement_code");--> statement-breakpoint
CREATE INDEX "noelia_ai_requirements_framework_idx" ON "noelia_ai_requirements" ("framework_id");--> statement-breakpoint
CREATE INDEX "noelia_ai_requirements_status_idx" ON "noelia_ai_requirements" ("status");--> statement-breakpoint

-- 2. Applicability assessments.
CREATE TABLE "noelia_applicability_assessments" (
  "id" text PRIMARY KEY NOT NULL,
  "requirement_id" text NOT NULL REFERENCES "noelia_ai_requirements"("id"),
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "result" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "rationale" text,
  "legal_basis" text,
  "legal_ambiguous" boolean NOT NULL DEFAULT false,
  "legal_review_required" boolean NOT NULL DEFAULT false,
  "assessed_by" text NOT NULL,
  "assessed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "valid_until" date,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_applicability_req_subject_uidx" ON "noelia_applicability_assessments" ("requirement_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "noelia_applicability_requirement_idx" ON "noelia_applicability_assessments" ("requirement_id");--> statement-breakpoint
CREATE INDEX "noelia_applicability_tenant_idx" ON "noelia_applicability_assessments" ("tenant_id");--> statement-breakpoint

-- 3. Control registry.
CREATE TABLE "noelia_controls" (
  "id" text PRIMARY KEY NOT NULL,
  "control_code" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "control_type" text NOT NULL,
  "automation" text NOT NULL DEFAULT 'MANUAL',
  "frameworks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "owner_role" text NOT NULL,
  "risk_level" text NOT NULL DEFAULT 'LOW',
  "implementation_status" text NOT NULL DEFAULT 'NOT_IMPLEMENTED',
  "assessment_requirement" text NOT NULL DEFAULT 'INTERNAL',
  "source_path" text,
  "test_path" text,
  "evidence_path" text,
  "active" boolean NOT NULL DEFAULT true,
  "review_date" date,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_controls_code_uidx" ON "noelia_controls" ("control_code");--> statement-breakpoint
CREATE INDEX "noelia_controls_status_idx" ON "noelia_controls" ("implementation_status");--> statement-breakpoint

-- 4. Evidence registry (declared before requirement-control mapping so SQL FK works).
CREATE TABLE "noelia_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "evidence_code" text NOT NULL,
  "evidence_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "source_uri" text,
  "artifact_hash" text NOT NULL,
  "hash_algorithm" text NOT NULL DEFAULT 'SHA-256',
  "content_ref" text,
  "evidence_date" date,
  "expires_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "verifier" text,
  "verified_at" timestamp with time zone,
  "external_assessor" text,
  "external_reference" text,
  "recorded_by" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_evidence_code_uidx" ON "noelia_evidence" ("evidence_code");--> statement-breakpoint
CREATE INDEX "noelia_evidence_subject_idx" ON "noelia_evidence" ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "noelia_evidence_status_idx" ON "noelia_evidence" ("status");--> statement-breakpoint
CREATE INDEX "noelia_evidence_tenant_idx" ON "noelia_evidence" ("tenant_id");--> statement-breakpoint

-- 5. Requirement -> control mapping.
CREATE TABLE "noelia_requirement_controls" (
  "id" text PRIMARY KEY NOT NULL,
  "requirement_id" text NOT NULL REFERENCES "noelia_ai_requirements"("id"),
  "control_id" text NOT NULL REFERENCES "noelia_controls"("id"),
  "mapping_rationale" text,
  "effectiveness" text NOT NULL DEFAULT 'NOT_EVIDENCED',
  "evidence_id" text REFERENCES "noelia_evidence"("id"),
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_requirement_control_uidx" ON "noelia_requirement_controls" ("requirement_id","control_id");--> statement-breakpoint
CREATE INDEX "noelia_requirement_control_requirement_idx" ON "noelia_requirement_controls" ("requirement_id");--> statement-breakpoint
CREATE INDEX "noelia_requirement_control_control_idx" ON "noelia_requirement_controls" ("control_id");--> statement-breakpoint

-- 6. AI impact assessment.
CREATE TABLE "noelia_impact_assessments" (
  "id" text PRIMARY KEY NOT NULL,
  "assessment_code" text NOT NULL,
  "system_id" text REFERENCES "noelia_ai_identity"("id"),
  "requirement_id" text REFERENCES "noelia_ai_requirements"("id"),
  "tenant_id" text REFERENCES "tenants"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "scope" text NOT NULL,
  "impact_type" text NOT NULL,
  "impact_level" text NOT NULL DEFAULT 'UNKNOWN',
  "safety_impact" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "fundamental_rights" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "data_protection" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "human_oversight" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "rationale" text,
  "assessed_by" text NOT NULL,
  "assessed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'DRAFT',
  "next_review_at" date,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_impact_assessment_code_uidx" ON "noelia_impact_assessments" ("assessment_code");--> statement-breakpoint
CREATE INDEX "noelia_impact_assessment_system_idx" ON "noelia_impact_assessments" ("system_id");--> statement-breakpoint
CREATE INDEX "noelia_impact_assessment_tenant_idx" ON "noelia_impact_assessments" ("tenant_id");--> statement-breakpoint

-- 7. Risk treatment.
CREATE TABLE "noelia_risk_treatments" (
  "id" text PRIMARY KEY NOT NULL,
  "risk_id" text NOT NULL REFERENCES "noelia_risk_register"("id"),
  "treatment" text NOT NULL,
  "owner_role" text NOT NULL,
  "rationale" text NOT NULL,
  "target_residual" text,
  "due_date" date,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "evidence_id" text REFERENCES "noelia_evidence"("id"),
  "verified_by" text,
  "verified_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "noelia_risk_treatment_risk_idx" ON "noelia_risk_treatments" ("risk_id");--> statement-breakpoint
CREATE INDEX "noelia_risk_treatment_status_idx" ON "noelia_risk_treatments" ("status");--> statement-breakpoint

-- 8. Internal audit.
CREATE TABLE "noelia_internal_audits" (
  "id" text PRIMARY KEY NOT NULL,
  "audit_code" text NOT NULL,
  "title" text NOT NULL,
  "scope" text NOT NULL,
  "objective" text NOT NULL,
  "framework_id" text,
  "audit_type" text NOT NULL DEFAULT 'GAP_ASSESSMENT',
  "auditor" text NOT NULL,
  "auditor_role" text NOT NULL,
  "period_start" date,
  "period_end" date,
  "tenant_id" text REFERENCES "tenants"("id"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "status" text NOT NULL DEFAULT 'PLANNED',
  "planned_at" date,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_audits_code_uidx" ON "noelia_internal_audits" ("audit_code");--> statement-breakpoint
CREATE INDEX "noelia_audits_status_idx" ON "noelia_internal_audits" ("status");--> statement-breakpoint
CREATE INDEX "noelia_audits_tenant_idx" ON "noelia_internal_audits" ("tenant_id");--> statement-breakpoint

-- 9. Findings.
CREATE TABLE "noelia_findings" (
  "id" text PRIMARY KEY NOT NULL,
  "finding_code" text NOT NULL,
  "audit_id" text NOT NULL REFERENCES "noelia_internal_audits"("id"),
  "severity" text NOT NULL DEFAULT 'MEDIUM',
  "title" text NOT NULL,
  "description" text NOT NULL,
  "control_id" text REFERENCES "noelia_controls"("id"),
  "evidence_id" text REFERENCES "noelia_evidence"("id"),
  "tenant_id" text REFERENCES "tenants"("id"),
  "status" text NOT NULL DEFAULT 'OPEN',
  "owner_role" text NOT NULL,
  "due_date" date,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_finding_code_uidx" ON "noelia_findings" ("finding_code");--> statement-breakpoint
CREATE INDEX "noelia_finding_audit_idx" ON "noelia_findings" ("audit_id");--> statement-breakpoint
CREATE INDEX "noelia_finding_status_idx" ON "noelia_findings" ("status");--> statement-breakpoint
CREATE INDEX "noelia_finding_tenant_idx" ON "noelia_findings" ("tenant_id");--> statement-breakpoint

-- 10. Corrective actions.
CREATE TABLE "noelia_corrective_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "action_code" text NOT NULL,
  "finding_id" text NOT NULL REFERENCES "noelia_findings"("id"),
  "description" text NOT NULL,
  "root_cause" text,
  "owner_role" text NOT NULL,
  "due_date" date,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "evidence_id" text REFERENCES "noelia_evidence"("id"),
  "verified_by" text,
  "verified_at" timestamp with time zone,
  "tenant_id" text REFERENCES "tenants"("id"),
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_capa_code_uidx" ON "noelia_corrective_actions" ("action_code");--> statement-breakpoint
CREATE INDEX "noelia_capa_finding_idx" ON "noelia_corrective_actions" ("finding_id");--> statement-breakpoint
CREATE INDEX "noelia_capa_status_idx" ON "noelia_corrective_actions" ("status");--> statement-breakpoint
CREATE INDEX "noelia_capa_tenant_idx" ON "noelia_corrective_actions" ("tenant_id");--> statement-breakpoint

-- 11. Exceptions.
CREATE TABLE "noelia_exceptions" (
  "id" text PRIMARY KEY NOT NULL,
  "exception_code" text NOT NULL,
  "requirement_id" text REFERENCES "noelia_ai_requirements"("id"),
  "control_id" text REFERENCES "noelia_controls"("id"),
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "rationale" text NOT NULL,
  "risk_accepted" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "compensating_control" text,
  "expiry_date" date,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'REQUESTED',
  "reviewed_by" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_exception_code_uidx" ON "noelia_exceptions" ("exception_code");--> statement-breakpoint
CREATE INDEX "noelia_exception_tenant_idx" ON "noelia_exceptions" ("tenant_id");--> statement-breakpoint
CREATE INDEX "noelia_exception_status_idx" ON "noelia_exceptions" ("status");--> statement-breakpoint

-- 12. Management review.
CREATE TABLE "noelia_management_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "review_code" text NOT NULL,
  "title" text NOT NULL,
  "framework_id" text,
  "meeting_date" date,
  "reviewed_by" text NOT NULL,
  "scope" text NOT NULL,
  "decisions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "tenant_id" text REFERENCES "tenants"("id"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_management_review_code_uidx" ON "noelia_management_reviews" ("review_code");--> statement-breakpoint
CREATE INDEX "noelia_management_review_tenant_idx" ON "noelia_management_reviews" ("tenant_id");--> statement-breakpoint

-- 13. Regulatory change management.
CREATE TABLE "noelia_regulatory_changes" (
  "id" text PRIMARY KEY NOT NULL,
  "change_code" text NOT NULL,
  "framework_id" text NOT NULL,
  "title" text NOT NULL,
  "source" text NOT NULL,
  "source_uri" text,
  "jurisdiction_code" text REFERENCES "countries"("code"),
  "effective_date" date,
  "assessment" text,
  "impact_level" text NOT NULL DEFAULT 'UNKNOWN',
  "status" text NOT NULL DEFAULT 'IDENTIFIED',
  "assigned_role" text,
  "due_date" date,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_regulatory_change_code_uidx" ON "noelia_regulatory_changes" ("change_code");--> statement-breakpoint
CREATE INDEX "noelia_regulatory_change_framework_idx" ON "noelia_regulatory_changes" ("framework_id");--> statement-breakpoint
CREATE INDEX "noelia_regulatory_change_status_idx" ON "noelia_regulatory_changes" ("status");--> statement-breakpoint

-- 14. Continuous monitoring indicators.
CREATE TABLE "noelia_monitoring_indicators" (
  "id" text PRIMARY KEY NOT NULL,
  "indicator_code" text NOT NULL,
  "title" text NOT NULL,
  "metric" text NOT NULL,
  "target" text,
  "baseline" text,
  "current" text,
  "unit" text,
  "period" text,
  "status" text NOT NULL DEFAULT 'NOT_TRACKING',
  "source" text,
  "tenant_id" text REFERENCES "tenants"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_monitoring_indicator_code_uidx" ON "noelia_monitoring_indicators" ("indicator_code");--> statement-breakpoint
CREATE INDEX "noelia_monitoring_indicator_status_idx" ON "noelia_monitoring_indicators" ("status");--> statement-breakpoint
CREATE INDEX "noelia_monitoring_indicator_tenant_idx" ON "noelia_monitoring_indicators" ("tenant_id");--> statement-breakpoint

-- 15. Certification readiness state machine.
CREATE TABLE "noelia_certification_readiness" (
  "id" text PRIMARY KEY NOT NULL,
  "framework_id" text NOT NULL,
  "target_scope" text NOT NULL,
  "system_id" text REFERENCES "noelia_ai_identity"("id"),
  "tenant_id" text REFERENCES "tenants"("id"),
  "state" text NOT NULL DEFAULT 'NOT_STARTED',
  "current_evidence_hash" text,
  "external_evidence_id" text REFERENCES "noelia_evidence"("id"),
  "external_assessor" text,
  "transitioned_by" text,
  "transitioned_at" timestamp with time zone,
  "notes" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_certification_readiness_uidx" ON "noelia_certification_readiness" ("framework_id","target_scope");--> statement-breakpoint
CREATE INDEX "noelia_certification_readiness_state_idx" ON "noelia_certification_readiness" ("state");--> statement-breakpoint
CREATE INDEX "noelia_certification_readiness_tenant_idx" ON "noelia_certification_readiness" ("tenant_id");--> statement-breakpoint

-- 16. Assessor package.
CREATE TABLE "noelia_assessor_packages" (
  "id" text PRIMARY KEY NOT NULL,
  "package_code" text NOT NULL,
  "framework_id" text NOT NULL,
  "scope" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "version" text NOT NULL DEFAULT '1.0',
  "contents" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "generated_by" text NOT NULL,
  "issued_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "certification_readiness_id" text REFERENCES "noelia_certification_readiness"("id"),
  "tenant_id" text REFERENCES "tenants"("id"),
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_assessor_package_code_uidx" ON "noelia_assessor_packages" ("package_code");--> statement-breakpoint
CREATE INDEX "noelia_assessor_package_status_idx" ON "noelia_assessor_packages" ("status");--> statement-breakpoint
CREATE INDEX "noelia_assessor_package_tenant_idx" ON "noelia_assessor_packages" ("tenant_id");--> statement-breakpoint

-- 17. RLS — tenant-scoped AI compliance tables.
ALTER TABLE "noelia_applicability_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_applicability_assessments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_applicability_tenant_isolation" ON "noelia_applicability_assessments";--> statement-breakpoint
CREATE POLICY "noelia_applicability_tenant_isolation" ON "noelia_applicability_assessments"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_evidence_tenant_isolation" ON "noelia_evidence";--> statement-breakpoint
CREATE POLICY "noelia_evidence_tenant_isolation" ON "noelia_evidence"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_impact_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_impact_assessments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_impact_assessment_tenant_isolation" ON "noelia_impact_assessments";--> statement-breakpoint
CREATE POLICY "noelia_impact_assessment_tenant_isolation" ON "noelia_impact_assessments"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_internal_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_internal_audits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_audits_tenant_isolation" ON "noelia_internal_audits";--> statement-breakpoint
CREATE POLICY "noelia_audits_tenant_isolation" ON "noelia_internal_audits"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_findings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_findings_tenant_isolation" ON "noelia_findings";--> statement-breakpoint
CREATE POLICY "noelia_findings_tenant_isolation" ON "noelia_findings"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_corrective_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_corrective_actions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_capa_tenant_isolation" ON "noelia_corrective_actions";--> statement-breakpoint
CREATE POLICY "noelia_capa_tenant_isolation" ON "noelia_corrective_actions"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_exceptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_exceptions_tenant_isolation" ON "noelia_exceptions";--> statement-breakpoint
CREATE POLICY "noelia_exceptions_tenant_isolation" ON "noelia_exceptions"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_management_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_management_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_management_review_tenant_isolation" ON "noelia_management_reviews";--> statement-breakpoint
CREATE POLICY "noelia_management_review_tenant_isolation" ON "noelia_management_reviews"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_monitoring_indicators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_monitoring_indicators" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_monitoring_indicator_tenant_isolation" ON "noelia_monitoring_indicators";--> statement-breakpoint
CREATE POLICY "noelia_monitoring_indicator_tenant_isolation" ON "noelia_monitoring_indicators"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_certification_readiness" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_certification_readiness" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_certification_readiness_tenant_isolation" ON "noelia_certification_readiness";--> statement-breakpoint
CREATE POLICY "noelia_certification_readiness_tenant_isolation" ON "noelia_certification_readiness"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_assessor_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_assessor_packages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_assessor_package_tenant_isolation" ON "noelia_assessor_packages";--> statement-breakpoint
CREATE POLICY "noelia_assessor_package_tenant_isolation" ON "noelia_assessor_packages"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

-- 18. Baseline control registry (mirrors the Phase 3 static register).
INSERT INTO "noelia_controls"
  (id, control_code, title, description, control_type, automation, frameworks, owner_role, risk_level, implementation_status, assessment_requirement, source_path, test_path, evidence_path, active, review_date, created_by)
VALUES
  ('CTL_NOELIA_001', 'NOELIA-AI-CTRL-001', 'Provider-independent AI model abstraction', 'Noelia must not depend on one provider or model kind.', 'GOVERNANCE', 'SEMI_AUTOMATED', '["ISO_42001","ISO_22989","ISO_23053","NIST_AI_RMF"]', 'AI PLATFORM ENGINEERING', 'LOW', 'IMPLEMENTED', 'INTERNAL', 'src/lib/noelia/model-provider.ts', 'tests/noelia/provider-contract.test.ts', 'Provider-neutral contracts used by gateway; deterministic analyst is DETERMINISTIC_ANALYST.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_002', 'NOELIA-AI-CTRL-002', 'No fabricated credentials or endpoints', 'Generative adapter is inert and fail-closed when no real runtime is mounted.', 'PREVENTIVE', 'AUTOMATED', '["EU_AI_ACT","ISO_42001","ISO_27001","NIST_AI_RMF"]', 'AI SECURITY', 'HIGH', 'IMPLEMENTED', 'INTERNAL', 'src/lib/noelia/model-provider.ts', 'tests/noelia/provider-contract.test.ts', 'Unconfigured adapter returns NOT_CONFIGURED / FAIL_CLOSED, never PASS.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_003', 'NOELIA-AI-CTRL-003', 'Real generative inference honest status', 'Never present an adapter as real inference.', 'GOVERNANCE', 'AUTOMATED', '["EU_AI_ACT","ISO_42001","NIST_AI_RMF"]', 'AI PLATFORM ENGINEERING', 'MEDIUM', 'BLOCKED', 'EXTERNAL', 'src/lib/noelia/model-provider.ts', 'tests/noelia/provider-contract.test.ts, tests/noelia/runtime-governed-model.test.ts', 'REAL_GENERATIVE_INFERENCE = BLOCKED_BY_ENVIRONMENT.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_004', 'NOELIA-AI-CTRL-004', 'Model lifecycle is append-only and governed', 'No REGISTERED -> ACTIVE jump without a recorded chain.', 'GOVERNANCE', 'SEMI_AUTOMATED', '["EU_AI_ACT","ISO_42001","ISO_23894","NIST_AI_RMF"]', 'AI GOVERNANCE', 'MEDIUM', 'IMPLEMENTED', 'INTERNAL', 'src/lib/noelia/model-lifecycle.ts', 'tests/noelia/model-lifecycle.test.ts', 'Illegal transitions rejected; ACTIVE only after APPROVE/CANARY/ACTIVE + registry approval.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_005', 'NOELIA-AI-CTRL-005', 'Provider lifecycle treated as supplier onboarding', 'External providers are never automatically approved.', 'GOVERNANCE', 'SEMI_AUTOMATED', '["EU_AI_ACT","ISO_42001","ISO_23894","NIST_AI_RMF"]', 'AI GOVERNANCE', 'MEDIUM', 'IMPLEMENTED', 'INTERNAL', 'src/lib/noelia/model-lifecycle.ts', 'tests/noelia/model-lifecycle.test.ts', 'Illegal ACTIVATED transition rejected.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_006', 'NOELIA-AI-CTRL-006', 'Model provenance and supply chain evidence', 'Origin, publisher, checksum, license and transformation must be explicit.', 'DETECTIVE', 'SEMI_AUTOMATED', '["EU_AI_ACT","ISO_42001","NIST_AI_RMF"]', 'AI GOVERNANCE', 'MEDIUM', 'IMPLEMENTED', 'EXTERNAL', 'src/lib/noelia/model-lifecycle.ts', 'tests/noelia/model-lifecycle.test.ts', 'BEYU ownership is never claimed without explicit origin/publisher.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_007', 'NOELIA-AI-CTRL-007', 'Prompt governance blocks injection and boundary changes', 'Model cannot alter authorization, policy, tenant, entity, country or OS.', 'PREVENTIVE', 'AUTOMATED', '["EU_AI_ACT","ISO_42001","ISO_27001","NIST_AI_RMF"]', 'AI SECURITY', 'HIGH', 'IMPLEMENTED', 'EXTERNAL', 'src/lib/noelia/governance.ts', 'tests/noelia/governance.test.ts, tests/noelia/adversarial-ai-security.test.ts', 'Prompt-injection attempt fails closed before model execution.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_008', 'NOELIA-AI-CTRL-008', 'Output governance treats model output as untrusted', 'Model output cannot self-authorize and tool calls are requests only.', 'PREVENTIVE', 'AUTOMATED', '["EU_AI_ACT","ISO_42001","NIST_AI_RMF"]', 'AI SECURITY', 'HIGH', 'IMPLEMENTED', 'EXTERNAL', 'src/lib/noelia/governance.ts', 'tests/noelia/governance.test.ts', 'Output with authorized=true is rejected; tool call becomes requested-not-authorized.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_009', 'NOELIA-AI-CTRL-009', 'High-risk action human oversight', 'HIGH/CRITICAL actions require human or dual-control approval.', 'PREVENTIVE', 'SEMI_AUTOMATED', '["EU_AI_ACT","ISO_42001","NIST_AI_RMF"]', 'AI GOVERNANCE', 'HIGH', 'IMPLEMENTED', 'EXTERNAL', 'src/lib/noelia/governance.ts', 'tests/noelia/governance.test.ts', 'DUAL_CONTROL for payments/identity/security; engine-proposed approval rejected.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_010', 'NOELIA-AI-CTRL-010', 'Tenant isolation verified through runtime role', 'Cross-tenant AI routing/incident records must not be visible to another tenant.', 'DETECTIVE', 'AUTOMATED', '["ISO_27001","NIST_AI_RMF","EU_AI_ACT"]', 'DATABASE SECURITY', 'CRITICAL', 'VERIFIED', 'EXTERNAL', 'drizzle/0023_noelia_ai_platform.sql, src/db/schema/ai.ts', 'tests/noelia/ai-platform.test.ts, tests/noelia/adversarial-ai-security.test.ts', 'Runtime-role query with tenant scope cannot see another tenant''s routing/incident rows.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_011', 'NOELIA-AI-CTRL-011', 'Cross-OS AI authorization boundary', 'Possession of an OS/enterprise role must not imply AI analytics access.', 'PREVENTIVE', 'AUTOMATED', '["ISO_27001","NIST_AI_RMF","EU_AI_ACT"]', 'AI SECURITY', 'CRITICAL', 'VERIFIED', 'EXTERNAL', 'src/lib/noelia/runtime.ts', 'tests/noelia/adversarial-ai-security.test.ts', 'Family Office principal without ai:analytics.read is denied.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_012', 'NOELIA-AI-CTRL-012', 'Model routing is deterministic and fail-closed', 'Best authorized model only after policy, residency, security, evaluation.', 'PREVENTIVE', 'AUTOMATED', '["ISO_42001","NIST_AI_RMF","EU_AI_ACT"]', 'AI PLATFORM ENGINEERING', 'HIGH', 'IMPLEMENTED', 'INTERNAL', 'src/lib/noelia/ai-platform.ts, src/lib/noelia/model-gateway.ts', 'tests/noelia/ai-platform.test.ts, tests/noelia/runtime-governed-model.test.ts', 'Kill switch, inactive provider, unapproved model and restricted->external all fail closed.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_013', 'NOELIA-AI-CTRL-013', 'Replay protection for routing/request idempotency', 'A replayed requestId must not duplicate routing decisions or actions.', 'DETECTIVE', 'AUTOMATED', '["ISO_27001","NIST_AI_RMF"]', 'AI PLATFORM ENGINEERING', 'MEDIUM', 'IMPLEMENTED', 'INTERNAL', 'src/lib/noelia/ai-platform.ts, src/lib/noelia/model-gateway.ts', 'tests/noelia/ai-platform.test.ts', 'Second route with same requestId returns the same routing id; only one row.', true, '2026-12-31', 'SYSTEM'),
  ('CTL_NOELIA_014', 'NOELIA-AI-CTRL-014', 'AI decision attribution and audit trail', 'Every AI decision attributes model, version, provider, routing and request ids.', 'DETECTIVE', 'AUTOMATED', '["EU_AI_ACT","ISO_42001","NIST_AI_RMF"]', 'AI GOVERNANCE', 'MEDIUM', 'IMPLEMENTED', 'INTERNAL', 'src/db/schema/platform.ts, src/lib/noelia/platform-services.ts, src/lib/noelia/runtime.ts', 'tests/noelia/runtime-governed-model.test.ts', 'Route -> deterministic execution -> evidence -> audit pipeline records attribution.', true, '2026-12-31', 'SYSTEM')
ON CONFLICT ("control_code") DO NOTHING;--> statement-breakpoint

-- 19. Baseline requirement registry (real EU AI Act / ISO / NIST obligations;
--    no applicability assertion is made here).
INSERT INTO "noelia_ai_requirements"
  (id, requirement_code, framework_id, reference, title, description, category, applicable_to_types, owner_role, priority, status, source, created_by)
VALUES
  ('ARQ_EU_AI_INVENTORY', 'EU-AI-ACT-001', 'EU_AI_ACT', 'Art. 12, Annex IV', 'AI system inventory and intended purpose', 'Maintain a register of AI systems with intended purpose, version, provider and operator information.', 'DOCUMENTATION', '["SYSTEM","MODEL","PROVIDER"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_RISK_CLASS', 'EU-AI-ACT-002', 'EU_AI_ACT', 'Art. 6-7', 'Risk classification and prohibited practices', 'Classify AI systems by risk category and identify prohibited practices before deployment.', 'RISK', '["SYSTEM","CAPABILITY"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_IMPACT', 'EU-AI-ACT-003', 'EU_AI_ACT', 'Art. 27', 'Fundamental rights impact assessment', 'Assess impact on fundamental rights for relevant AI systems before deployment.', 'RISK', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_TECH_DOC', 'EU-AI-ACT-004', 'EU_AI_ACT', 'Art. 11, Annex IV', 'Technical documentation', 'Maintain technical documentation sufficient to demonstrate conformity.', 'DOCUMENTATION', '["SYSTEM","MODEL"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_TRANSPARENCY', 'EU-AI-ACT-005', 'EU_AI_ACT', 'Art. 13, 50', 'Transparency and information to users', 'Ensure users are informed that they are interacting with an AI system where required.', 'DOCUMENTATION', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_HUMAN_OVERSIGHT', 'EU-AI-ACT-006', 'EU_AI_ACT', 'Art. 14', 'Human oversight', 'Deploy human oversight measures appropriate to the AI system risk.', 'GOVERNANCE', '["SYSTEM","CAPABILITY"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_DATA_GOV', 'EU-AI-ACT-007', 'EU_AI_ACT', 'Art. 10', 'Data and data governance', 'Apply data governance and quality practices to training/validation data.', 'DATA', '["MODEL","PROVIDER"]', 'AI GOVERNANCE', 'MEDIUM', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_MONITORING', 'EU-AI-ACT-008', 'EU_AI_ACT', 'Art. 26, 72', 'Post-market monitoring and incident reporting', 'Monitor deployed AI systems and report serious incidents where required.', 'MONITORING', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_ACCURACY', 'EU-AI-ACT-009', 'EU_AI_ACT', 'Art. 15', 'Accuracy, robustness and cybersecurity', 'Ensure appropriate accuracy, robustness and cybersecurity levels.', 'TECHNICAL', '["MODEL","SYSTEM"]', 'AI SECURITY', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_EU_AI_CONFORMITY', 'EU-AI-ACT-010', 'EU_AI_ACT', 'Art. 43', 'Conformity assessment', 'Perform conformity assessment according to the applicable procedure.', 'CERTIFICATION', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'Regulation (EU) 2024/1689', 'SYSTEM'),
  ('ARQ_ISO_42001_SCOPE', 'ISO-42001-001', 'ISO_42001', 'Clause 4', 'AIMS scope', 'Establish the scope of the AI management system (AIMS).', 'GOVERNANCE', '["SYSTEM","CAPABILITY"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_ISO_42001_RISK', 'ISO-42001-002', 'ISO_42001', 'Clause 6', 'AIMS risk assessment', 'Assess AI-related risks and opportunities within scope.', 'RISK', '["SYSTEM","MODEL"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_ISO_42001_INVENTORY', 'ISO-42001-003', 'ISO_42001', 'Clause 7.2', 'AI system inventory', 'Maintain an inventory of AI systems and their purpose/context.', 'DOCUMENTATION', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_ISO_42001_IMPACT', 'ISO-42001-004', 'ISO_42001', 'Clause 6.2', 'AI impact assessment', 'Assess impacts on individuals, groups and society.', 'RISK', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_ISO_42001_EVIDENCE', 'ISO-42001-005', 'ISO_42001', 'Clause 9', 'AIMS evidence and evaluation', 'Maintain evidence of performance and evaluation of the AIMS.', 'EVIDENCE', '["SYSTEM","CONTROL"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_ISO_42001_AUDIT', 'ISO-42001-006', 'ISO_42001', 'Clause 9.2', 'Internal audit', 'Conduct internal audits of the AIMS at planned intervals.', 'GOVERNANCE', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_ISO_42001_MGMT_REVIEW', 'ISO-42001-007', 'ISO_42001', 'Clause 9.3', 'Management review', 'Review the AIMS at planned intervals by top management.', 'GOVERNANCE', '["SYSTEM"]', 'AI GOVERNANCE', 'HIGH', 'ACTIVE', 'ISO/IEC 42001:2023', 'SYSTEM'),
  ('ARQ_NIST_GOVERN', 'NIST-AI-RMF-001', 'NIST_AI_RMF', 'GOVERN', 'GOVERN', 'Establish organizational governance for AI risk management.', 'GOVERNANCE', '["SYSTEM","CAPABILITY"]', 'AI SECURITY', 'HIGH', 'ACTIVE', 'NIST AI RMF 1.0', 'SYSTEM'),
  ('ARQ_NIST_MAP', 'NIST-AI-RMF-002', 'NIST_AI_RMF', 'MAP', 'MAP', 'Identify, assess and understand AI system risks.', 'RISK', '["SYSTEM","MODEL"]', 'AI SECURITY', 'HIGH', 'ACTIVE', 'NIST AI RMF 1.0', 'SYSTEM'),
  ('ARQ_NIST_MEASURE', 'NIST-AI-RMF-003', 'NIST_AI_RMF', 'MEASURE', 'MEASURE', 'Measure and monitor the AI risk management activities.', 'MONITORING', '["SYSTEM","MODEL"]', 'AI SECURITY', 'HIGH', 'ACTIVE', 'NIST AI RMF 1.0', 'SYSTEM'),
  ('ARQ_NIST_MANAGE', 'NIST-AI-RMF-004', 'NIST_AI_RMF', 'MANAGE', 'MANAGE', 'Manage and treat AI risks in accordance to risk appetite.', 'GOVERNANCE', '["SYSTEM","MODEL"]', 'AI SECURITY', 'HIGH', 'ACTIVE', 'NIST AI RMF 1.0', 'SYSTEM')
ON CONFLICT ("requirement_code") DO NOTHING;--> statement-breakpoint

-- 20. Baseline requirement -> control mapping (governance mapping only; no
--     effectiveness verdict is asserted without evidence).
INSERT INTO "noelia_requirement_controls" (id, requirement_id, control_id, mapping_rationale, effectiveness, created_by)
VALUES
  ('RCM_EU_AI_001_CTRL001', 'ARQ_EU_AI_INVENTORY', 'CTL_NOELIA_001', 'Provider-independent inventory supports the AI system register.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_EU_AI_001_CTRL014', 'ARQ_EU_AI_INVENTORY', 'CTL_NOELIA_014', 'Attribution records support system inventory accuracy.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_EU_AI_002_CTRL012', 'ARQ_EU_AI_RISK_CLASS', 'CTL_NOELIA_012', 'Routing risk-level enforcement supports risk classification.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_EU_AI_003_CTRL006', 'ARQ_EU_AI_IMPACT', 'CTL_NOELIA_006', 'Supply-chain evidence supports impact assessment scope.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_EU_AI_006_CTRL009', 'ARQ_EU_AI_HUMAN_OVERSIGHT', 'CTL_NOELIA_009', 'Human approval gate supports human oversight.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_EU_AI_008_CTRL014', 'ARQ_EU_AI_MONITORING', 'CTL_NOELIA_014', 'Audit attribution supports post-market monitoring.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_EU_AI_009_CTRL002', 'ARQ_EU_AI_ACCURACY', 'CTL_NOELIA_002', 'Fail-closed adapter prevents unsupported generative claims.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_ISO_42001_003_CTRL001', 'ARQ_ISO_42001_INVENTORY', 'CTL_NOELIA_001', 'Model/provider inventory supports AIMS inventory.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_ISO_42001_006_CTRL004', 'ARQ_ISO_42001_AUDIT', 'CTL_NOELIA_004', 'Append-only lifecycle supports internal audit traceability.', 'NOT_EVIDENCED', 'SYSTEM'),
  ('RCM_NIST_GOVERN_CTRL011', 'ARQ_NIST_GOVERN', 'CTL_NOELIA_011', 'Cross-OS authorization boundary supports governance of AI use.', 'NOT_EVIDENCED', 'SYSTEM')
ON CONFLICT ("requirement_id","control_id") DO NOTHING;--> statement-breakpoint

-- 21. Baseline certification readiness (honest, non-certified state).
INSERT INTO "noelia_certification_readiness"
  (id, framework_id, target_scope, system_id, state, created_by)
VALUES
  ('ACR_EU_AI_ACT_NOELIA', 'EU_AI_ACT', 'Noelia AI global platform', 'AII_NOELIA', 'NOT_STARTED', 'SYSTEM'),
  ('ACR_ISO_42001_NOELIA', 'ISO_42001', 'Noelia AI management system', 'AII_NOELIA', 'NOT_STARTED', 'SYSTEM'),
  ('ACR_NIST_AI_RMF_NOELIA', 'NIST_AI_RMF', 'Noelia AI risk management alignment', 'AII_NOELIA', 'NOT_STARTED', 'SYSTEM')
ON CONFLICT ("framework_id","target_scope") DO NOTHING;
