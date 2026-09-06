-- 0023 — BEYU Noelia AI platform: provider-independent model layer.
--
-- This migration is ADDITIVE. It introduces:
--   * canonical AI identity (noelia_ai_identity)
--   * provider registry (noelia_providers) — external providers optional
--   * model-registry router metadata (provider_id, family/type, capabilities,
--     modalities, context window, deployment/residency, risk, approval,
--     evaluation, security, model-card/checksum/license)
--   * evaluation registry (noelia_evaluations)
--   * AI risk register (noelia_risk_register)
--   * incident registry (noelia_incidents)
--   * kill switch (noelia_kill_switch)
--   * routing decision audit (noelia_routing_decisions)
--
-- It grants NO authority. All new AI capabilities are default-deny at the
-- application permission layer. RLS is enabled on the tenant-scoped AI
-- incident/routing/kill-switch tables using the canonical helpers from 0001;
-- global governance tables remain application-permission gated (matching the
-- existing policy/risk registry pattern).
--
-- No external AI provider is invoked or required.

-- 1. model_registry router metadata (additive columns).
ALTER TABLE "model_registry" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "model_family" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "model_type" text NOT NULL DEFAULT 'GENERAL';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "input_modalities" jsonb NOT NULL DEFAULT '["TEXT"]'::jsonb;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "output_modalities" jsonb NOT NULL DEFAULT '["TEXT"]'::jsonb;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "context_window" integer;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "deployment_type" text NOT NULL DEFAULT 'SELF_HOSTED';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "hosting_location" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "data_residency" text NOT NULL DEFAULT 'BEYU_CONTROLLED';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "risk_level" text NOT NULL DEFAULT 'LOW';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "approval_status" text NOT NULL DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "evaluation_status" text NOT NULL DEFAULT 'NOT_EVALUATED';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "security_status" text NOT NULL DEFAULT 'NOT_ASSESSED';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "model_card_version" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "created_by" text NOT NULL DEFAULT 'SYSTEM';--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "updated_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint

-- 2. Canonical AI identity.
CREATE TABLE "noelia_ai_identity" (
  "id" text PRIMARY KEY NOT NULL,
  "canonical_name" text NOT NULL,
  "identity_type" text NOT NULL DEFAULT 'ENTERPRISE_AI',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "version" text NOT NULL,
  "owner_organization" text NOT NULL,
  "description" text,
  "risk_level" text NOT NULL DEFAULT 'LOW',
  "governing_role" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_ai_identity_canonical_name_uidx" ON "noelia_ai_identity" ("canonical_name");--> statement-breakpoint

-- 3. Provider registry (external optional; BEYU-owned/self-hosted first-class).
CREATE TABLE "noelia_providers" (
  "id" text PRIMARY KEY NOT NULL,
  "provider_name" text NOT NULL,
  "provider_type" text NOT NULL,
  "ownership" text NOT NULL DEFAULT 'BEYU',
  "endpoint" text,
  "region" text,
  "data_residency" text NOT NULL DEFAULT 'BEYU_CONTROLLED',
  "authentication_method" text NOT NULL DEFAULT 'NONE',
  "security_status" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "compliance_status" text NOT NULL DEFAULT 'NOT_ASSESSED',
  "active" boolean NOT NULL DEFAULT false,
  "description" text,
  "assessment" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_providers_name_uidx" ON "noelia_providers" ("provider_name");--> statement-breakpoint

-- 4. Model evaluation registry.
CREATE TABLE "noelia_evaluations" (
  "id" text PRIMARY KEY NOT NULL,
  "model_id" text NOT NULL REFERENCES "model_registry"("id"),
  "model_version" text NOT NULL,
  "dataset" text NOT NULL,
  "test_suite" text NOT NULL,
  "metric" text NOT NULL,
  "score" text NOT NULL,
  "threshold" text,
  "evaluated_at" date NOT NULL,
  "evaluator" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RECORDED',
  "evidence_ref" text,
  "note" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "noelia_evaluations_model_idx" ON "noelia_evaluations" ("model_id","model_version");--> statement-breakpoint
CREATE INDEX "noelia_evaluations_status_idx" ON "noelia_evaluations" ("status");--> statement-breakpoint

-- 5. AI risk register.
CREATE TABLE "noelia_risk_register" (
  "id" text PRIMARY KEY NOT NULL,
  "risk_code" text NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "inherent_likelihood" text NOT NULL DEFAULT 'UNKNOWN',
  "inherent_impact" text NOT NULL DEFAULT 'UNKNOWN',
  "residual_likelihood" text NOT NULL DEFAULT 'UNKNOWN',
  "residual_impact" text NOT NULL DEFAULT 'UNKNOWN',
  "status" text NOT NULL DEFAULT 'OPEN',
  "owner_role" text,
  "mitigation" text,
  "control_mapping" text,
  "nist_rmf_mapping" text,
  "testimonial" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_risk_register_code_uidx" ON "noelia_risk_register" ("risk_code");--> statement-breakpoint

-- 6. AI incident registry.
CREATE TABLE "noelia_incidents" (
  "id" text PRIMARY KEY NOT NULL,
  "incident_code" text NOT NULL,
  "classification" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'LOW',
  "status" text NOT NULL DEFAULT 'OPEN',
  "tenant_id" text REFERENCES "tenants"("id"),
  "model_id" text REFERENCES "model_registry"("id"),
  "provider_id" text REFERENCES "noelia_providers"("id"),
  "tool_name" text,
  "trace_id" text NOT NULL,
  "description" text NOT NULL,
  "detected_at" timestamp with time zone NOT NULL DEFAULT now(),
  "contained_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "resolution" text
);--> statement-breakpoint
CREATE INDEX "noelia_incidents_tenant_idx" ON "noelia_incidents" ("tenant_id");--> statement-breakpoint
CREATE INDEX "noelia_incidents_status_idx" ON "noelia_incidents" ("status");--> statement-breakpoint
CREATE INDEX "noelia_incidents_trace_idx" ON "noelia_incidents" ("trace_id");--> statement-breakpoint

-- 7. Kill switch (stops capability, never deletes evidence).
CREATE TABLE "noelia_kill_switch" (
  "id" text PRIMARY KEY NOT NULL,
  "target_type" text NOT NULL,
  "target_ref" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "reason" text NOT NULL,
  "activated_by" text NOT NULL,
  "activated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "deactivated_at" timestamp with time zone,
  "deactivated_by" text,
  "tenant_id" text REFERENCES "tenants"("id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_kill_switch_target_uidx" ON "noelia_kill_switch" ("target_type","target_ref");--> statement-breakpoint
CREATE INDEX "noelia_kill_switch_enabled_idx" ON "noelia_kill_switch" ("enabled");--> statement-breakpoint

-- 8. Routing decision audit (non-sensitive metadata only).
CREATE TABLE "noelia_routing_decisions" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "os_id" text,
  "task" text NOT NULL,
  "capability" text NOT NULL,
  "classification" "beyu_classification" NOT NULL,
  "risk_level" text NOT NULL DEFAULT 'LOW',
  "selected_model_id" text REFERENCES "model_registry"("id"),
  "selected_provider_id" text REFERENCES "noelia_providers"("id"),
  "decision" text NOT NULL,
  "denial_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "policy_version" text,
  "created_by" text NOT NULL DEFAULT 'NOELIA',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "noelia_routing_tenant_idx" ON "noelia_routing_decisions" ("tenant_id");--> statement-breakpoint
CREATE INDEX "noelia_routing_request_idx" ON "noelia_routing_decisions" ("request_id");--> statement-breakpoint
CREATE INDEX "noelia_routing_model_idx" ON "noelia_routing_decisions" ("selected_model_id");--> statement-breakpoint

-- 9. RLS — tenant-scoped AI tables use the canonical context GUCs.
--    noelia_incidents / noelia_routing_decisions are tenant-scoped.
--    noelia_kill_switch may be global or tenant-scoped; NULL allows a global
--    switch that an enterprise operator creates while remaining invisible to
--    an ordinary tenant via RLS.
ALTER TABLE "noelia_incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_incidents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_incidents_tenant_isolation" ON "noelia_incidents";--> statement-breakpoint
CREATE POLICY "noelia_incidents_tenant_isolation" ON "noelia_incidents"
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_routing_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_routing_decisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_routing_decisions_tenant_isolation" ON "noelia_routing_decisions";--> statement-breakpoint
CREATE POLICY "noelia_routing_decisions_tenant_isolation" ON "noelia_routing_decisions"
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_kill_switch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_kill_switch" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_kill_switch_tenant_isolation" ON "noelia_kill_switch";--> statement-breakpoint
CREATE POLICY "noelia_kill_switch_tenant_isolation" ON "noelia_kill_switch"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());

-- 10. Governance default registrations (recorded, not authority).
--     Noelia AI identity is deterministic and always present.
INSERT INTO "noelia_ai_identity" (id, canonical_name, identity_type, status, version, owner_organization, description, risk_level, governing_role, created_by)
  VALUES ('AII_NOELIA', 'NOELIA', 'ENTERPRISE_AI', 'ACTIVE', '2026.09', 'BEYU FAMILY TRUST',
          'BEYU-owned governed AI identity. No independent business/legal authority.',
          'LOW', 'AI_GOVERNANCE_OFFICER', 'SYSTEM')
  ON CONFLICT ("canonical_name") DO NOTHING;--> statement-breakpoint
INSERT INTO "noelia_providers" (id, provider_name, provider_type, ownership, endpoint, region, data_residency, authentication_method, security_status, compliance_status, active, description, assessment, created_by)
  VALUES ('PROV_NOELIA_DET', 'beyu-hive-deterministic-analyst', 'BEYU_OWNED', 'BEYU', NULL, NULL, 'BEYU_CONTROLLED', 'NONE', 'INTERNALLY_ASSESSED', 'NOT_EXTERNALLY_ASSESSED', true,
          'Deterministic governed analyst executed inside the BEYU HIVE boundary.', '{}', 'SYSTEM')
  ON CONFLICT ("provider_name") DO NOTHING;--> statement-breakpoint
INSERT INTO "model_registry" (id, provider, model, version, status, max_classification, jurisdiction_restrictions, capability_metadata, approved_by, provider_id, model_family, model_type, capabilities, input_modalities, output_modalities, context_window, deployment_type, hosting_location, data_residency, risk_level, approval_status, evaluation_status, security_status, model_card_version, license, source, created_by)
  VALUES ('MOD_NOELIA_DET', 'beyu-hive-deterministic-analyst', 'beyu-hive-deterministic-analyst', '2026.09', 'ACTIVE', 'RESTRICTED', '[]', '{"deterministic":true}', 'SYSTEM', 'PROV_NOELIA_DET', 'BEYU_HIVE', 'DETERMINISTIC_ANALYST', '["governed-analysis"]', '["TEXT"]', '["TEXT"]', 0, 'SELF_HOSTED', 'BEYU_CONTROLLED', 'BEYU_CONTROLLED', 'LOW', 'APPROVED', 'APPROVED', 'INTERNALLY_ASSESSED', 'MC-2026.09', 'AGPL-3.0', 'BEYU-OS-1.0', 'SYSTEM')
  ON CONFLICT (provider, model, version) DO NOTHING;--> statement-breakpoint

-- Baseline risk register entries (governance record; not a completion claim).
INSERT INTO "noelia_risk_register" (id, risk_code, title, category, description, inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, status, owner_role, mitigation, control_mapping, nist_rmf_mapping, testimonial)
  VALUES
    ('RSK_AI_HALLUCINATION', 'AI-RSK-001', 'Hallucination / unsupported claim', 'QUALITY', 'Model output asserts unsupported facts.', 'MEDIUM', 'HIGH', 'MEDIUM', 'MEDIUM', 'OPEN', 'AI_OWNER', 'Epistemic status classification, source citations, confidence bounds, evaluation gates.', 'AI-C-010', 'MEASURE/MANAGE', 'Evidence: noelia_evaluations + epistemics.ts'),
    ('RSK_AI_TENANT_LEAK', 'AI-RSK-002', 'Cross-tenant leakage', 'ISOLATION', 'Request, memory, RAG, tool or audit crosses a tenant boundary.', 'LOW', 'CRITICAL', 'LOW', 'LOW', 'OPEN', 'AI_SECURITY_OFFICER', 'RLS on tenant-scoped AI tables; HIVE scope enforcement; cross-tenant adversarial tests.', 'AI-C-004', 'MAP/GOVERN', 'Evidence: tenant isolation + adversarial matrix'),
    ('RSK_AI_PROMPT_INJECTION', 'AI-RSK-003', 'Prompt / retrieval injection', 'SECURITY', 'Untrusted content overrides policy or instruction hierarchy.', 'HIGH', 'HIGH', 'MEDIUM', 'MEDIUM', 'OPEN', 'AI_SECURITY_OFFICER', 'Instruction hierarchy, deterministic redaction, injection detection, tool result treated as data.', 'AI-C-007', 'GOVERN/MANAGE', 'Evidence: prompt-security tests'),
    ('RSK_AI_UNAUTHORIZED_ACTION', 'AI-RSK-004', 'Unauthorized autonomous action', 'AUTHORIZATION', 'AI output becomes executable authority without human approval.', 'LOW', 'CRITICAL', 'LOW', 'LOW', 'OPEN', 'AI_GOVERNANCE_OFFICER', 'Effective-authority intersection; tool registry fail-closed; human approval for high-risk.', 'AI-C-003', 'GOVERN', 'Evidence: ai-authz + tool registry tests'),
    ('RSK_AI_PROVIDER_OUTAGE', 'AI-RSK-005', 'Provider/model outage', 'AVAILABILITY', 'Model runtime becomes unavailable.', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'LOW', 'OPEN', 'MODEL_OWNER', 'Health check, approved fallback, fail closed on no compliant fallback.', 'AI-C-011', 'MANAGE', 'Evidence: router + provider-independent tests'),
    ('RSK_AI_DATA_RESIDENCY', 'AI-RSK-006', 'Data residency violation', 'PRIVACY', 'Restricted data routed to an incompatible jurisdiction/provider.', 'LOW', 'HIGH', 'LOW', 'LOW', 'OPEN', 'AI_PRIVACY_OFFICER', 'Router residency/classification checks; BEYU_CONTROLLED default; fail closed.', 'AI-C-009', 'MAP/GOVERN', 'Evidence: model-router tests');
