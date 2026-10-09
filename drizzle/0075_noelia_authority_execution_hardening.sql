-- Phase 2 security remediation: inseparable approval bindings, immutable Noelia
-- plans/content, tenant+entity AI-decision isolation and terminal-state safety.
-- This migration grants no new authority and activates no provider.

-- Global authority is an explicit assignment fact. Existing assignments remain
-- scoped until a separately governed human act marks the exact assignment.
ALTER TABLE "role_assignments" ADD COLUMN IF NOT EXISTS "global_scope" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Normalize legacy architecture metadata without creating a new authority
-- system. Exactly four rows remain SECTOR_OS: Finance, Health, Agriculture and
-- Ujenzi. Foundation is a separate root nonprofit legal-entity tenant whose
-- operations use an existing SHARED_CAPABILITY classification; Mining remains
-- only a draft regulated-activity capability. These updates are idempotent and
-- preserve all domain data. The old labels appear here solely as upgrade keys.
UPDATE "tenants"
SET name = 'BEYU Foundation', type = 'LEGAL_ENTITY', parent_tenant_id = NULL
WHERE code = 'BEYU-FOUNDATION';--> statement-breakpoint
UPDATE "os_registry"
SET id = 'OSR_FOUNDATION_OPERATIONS',
    code = 'SHARED_FOUNDATION_OPERATIONS',
    name = 'Foundation Operations',
    kind = 'SHARED_CAPABILITY',
    purpose = 'Governed nonprofit operations capability serving the separate BEYU Foundation sister organization; never a subsidiary or Sector OS.'
WHERE code = 'FOUNDATION_OS';--> statement-breakpoint
UPDATE "os_registry"
SET id = 'OSR_MINING_GOVERNANCE',
    code = 'SHARED_MINING_GOVERNANCE',
    name = 'Mining Governance (proposed)',
    kind = 'SHARED_CAPABILITY',
    authority_scope = 'MINING_GOVERNANCE',
    purpose = 'Draft regulated-activity governance capability for the existing mining legal entity; explicitly not a Sector OS.'
WHERE code = 'MINING_OS';--> statement-breakpoint
UPDATE "source_of_truth"
SET authoritative_os = 'SHARED_FOUNDATION_OPERATIONS'
WHERE authoritative_os = 'FOUNDATION_OS';--> statement-breakpoint
UPDATE "source_of_truth"
SET consumers = replace(consumers::text, '"FOUNDATION_OS"', '"SHARED_FOUNDATION_OPERATIONS"')::jsonb
WHERE consumers @> '["FOUNDATION_OS"]'::jsonb;--> statement-breakpoint

-- constitution_articles remains deployment/governance controlled. The runtime
-- receives UPDATE(id) only so the historical body-lifecycle guard can acquire
-- SELECT ... FOR SHARE; this trigger makes every actual non-owner mutation fail.
CREATE OR REPLACE FUNCTION beyu_protect_constitution_catalog()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE table_owner text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid = TG_RELID;
  IF current_user IS DISTINCT FROM table_owner THEN
    RAISE EXCEPTION 'constitution catalog is deployment/governance controlled' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_constitution_catalog ON "constitution_articles";--> statement-breakpoint
CREATE TRIGGER protect_constitution_catalog BEFORE UPDATE OR DELETE ON "constitution_articles"
FOR EACH ROW EXECUTE FUNCTION beyu_protect_constitution_catalog();--> statement-breakpoint

ALTER TABLE "knowledge_sources" ALTER COLUMN "authority_status" SET DEFAULT 'UNDER_REVIEW';--> statement-breakpoint
-- At most one live replacement branch may bind an immutable predecessor. A
-- rejected/expired proposal leaves the predecessor eligible for a fresh review.
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_sources_active_replacement_uidx"
  ON "knowledge_sources" ("supersedes_code")
  WHERE "supersedes_code" IS NOT NULL AND "authority_status" IN ('UNDER_REVIEW', 'AUTHORITATIVE');--> statement-breakpoint

ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "payload_digest" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "payload_version" integer;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "target_tenant_id" text REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "target_legal_entity_id" text REFERENCES "legal_entities"("id");--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "target_country_code" text REFERENCES "countries"("code");--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "mfa_verified" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "revoked_by" text REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "revoke_reason" text;--> statement-breakpoint

-- Defaults keep the migration compatible with a still-running previous release:
-- old writers that do not know these columns continue to insert, but their
-- sentinel-bound requests can never satisfy the new exact-digest executor.
ALTER TABLE "noelia_action_requests" ADD COLUMN IF NOT EXISTS "input_digest" text NOT NULL DEFAULT 'LEGACY_INVALIDATED';--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD COLUMN IF NOT EXISTS "input_version" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD COLUMN IF NOT EXISTS "required_approver_role" text NOT NULL DEFAULT '__NO_VALID_APPROVER_ROLE__';--> statement-breakpoint
UPDATE "noelia_action_requests"
SET input_digest = 'LEGACY_INVALIDATED:' || id,
    required_approver_role = '__NO_VALID_APPROVER_ROLE__',
    status = CASE WHEN status IN ('PENDING_APPROVAL','APPROVED') THEN 'FAILED' ELSE status END,
    denial_code = CASE WHEN status IN ('PENDING_APPROVAL','APPROVED') THEN 'SECURITY_BINDING_REQUIRED' ELSE denial_code END,
    reason = CASE WHEN status IN ('PENDING_APPROVAL','APPROVED') THEN 'Legacy action invalidated: a fresh digest-bound request is required.' ELSE reason END
WHERE input_digest = 'LEGACY_INVALIDATED';--> statement-breakpoint

ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "plan_digest" text;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "plan_version" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "target_tenant_id" text REFERENCES "tenants"("id");--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "target_legal_entity_id" text REFERENCES "legal_entities"("id");--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "target_country_code" text REFERENCES "countries"("code");--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "approval_required" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "required_approver_roles" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "execution_claim_id" text;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD COLUMN IF NOT EXISTS "execution_lease_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "noelia_workflows"
SET target_tenant_id = tenant_id,
    plan_digest = 'LEGACY_INVALIDATED:' || id,
    status = CASE WHEN status IN ('PLANNED','VALIDATED','AUTHORIZED','RUNNING') THEN 'STOPPED' ELSE status END,
    failure_state = CASE WHEN status IN ('PLANNED','VALIDATED','AUTHORIZED','RUNNING') THEN '{"reason":"Legacy workflow invalidated: re-plan with immutable target/digest binding."}'::jsonb ELSE failure_state END
WHERE target_tenant_id IS NULL OR plan_digest IS NULL;--> statement-breakpoint
-- plan_digest/target_tenant_id deliberately remain nullable during this EXPAND
-- release so a concurrently running prior version is not broken. New code
-- always writes both and fails closed on a missing/sentinel binding. A later,
-- separately governed CONTRACT release may validate and narrow the columns.
ALTER TABLE "noelia_workflows" DROP CONSTRAINT IF EXISTS "noelia_workflows_status_ck";--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD CONSTRAINT "noelia_workflows_status_ck" CHECK (status IN (
  'PLANNED', 'VALIDATED', 'WAITING_FOR_HUMAN_AUTHORITY', 'AUTHORIZED', 'RUNNING',
  'COMPLETED', 'ESCALATED', 'STOPPED', 'FAILED', 'CANCELLED', 'TIMED_OUT'
));--> statement-breakpoint

ALTER TABLE "ai_decisions" ADD COLUMN IF NOT EXISTS "legal_entity_id" text REFERENCES "legal_entities"("id");--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD COLUMN IF NOT EXISTS "country_code" text REFERENCES "countries"("code");--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD COLUMN IF NOT EXISTS "classification" "beyu_classification" NOT NULL DEFAULT 'INTERNAL';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_decisions_entity_idx" ON "ai_decisions" ("legal_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_decisions_country_idx" ON "ai_decisions" ("country_code");--> statement-breakpoint

-- Runtime Noelia state is always RLS-bound, including when a table owner is
-- accidentally used by maintenance code. Release migrations remain the only
-- owner path and must establish an explicit transaction-local scope to access
-- these rows after this point.
ALTER TABLE "knowledge_sources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enterprise_memory" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_action_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_schedules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_scheduler_offsets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_schedule_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_workflows" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_workflow_steps" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Global catalog rows remain readable across tenants, but only a principal
-- whose live structured assignment established explicit global scope may
-- create or mutate them. A presentation-only tenant context cannot authorize
-- deployment/governance catalog writes.
DROP POLICY IF EXISTS "knowledge_sources_scope_isolation" ON "knowledge_sources";--> statement-breakpoint
DROP POLICY IF EXISTS "knowledge_sources_scope_insert" ON "knowledge_sources";--> statement-breakpoint
DROP POLICY IF EXISTS "knowledge_sources_scope_update" ON "knowledge_sources";--> statement-breakpoint
DROP POLICY IF EXISTS "knowledge_sources_scope_delete" ON "knowledge_sources";--> statement-breakpoint
-- Retain the canonical policy identity while narrowing writes into explicit
-- command policies. This is an in-transaction re-declaration, not a policy gap.
CREATE POLICY "knowledge_sources_scope_isolation" ON "knowledge_sources" FOR SELECT
  USING (scope_type = 'GLOBAL' OR tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint
CREATE POLICY "knowledge_sources_scope_insert" ON "knowledge_sources" FOR INSERT
  WITH CHECK (
    (scope_type = 'GLOBAL' AND tenant_id IS NULL AND beyu_global_scope())
    OR (scope_type <> 'GLOBAL' AND tenant_id = ANY(beyu_tenant_ids()))
  );--> statement-breakpoint
CREATE POLICY "knowledge_sources_scope_update" ON "knowledge_sources" FOR UPDATE
  USING (
    (scope_type = 'GLOBAL' AND tenant_id IS NULL AND beyu_global_scope())
    OR (scope_type <> 'GLOBAL' AND tenant_id = ANY(beyu_tenant_ids()))
  )
  WITH CHECK (
    (scope_type = 'GLOBAL' AND tenant_id IS NULL AND beyu_global_scope())
    OR (scope_type <> 'GLOBAL' AND tenant_id = ANY(beyu_tenant_ids()))
  );--> statement-breakpoint
CREATE POLICY "knowledge_sources_scope_delete" ON "knowledge_sources" FOR DELETE
  USING (
    (scope_type = 'GLOBAL' AND tenant_id IS NULL AND beyu_global_scope())
    OR (scope_type <> 'GLOBAL' AND tenant_id = ANY(beyu_tenant_ids()))
  );--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_governance_country_visible(target_country text)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, public AS $$
  SELECT current_setting('beyu.governance_context', true) = 'on'
    AND (
      coalesce(current_setting('beyu.governance_country_codes', true), '') = ''
      OR target_country = ANY(string_to_array(current_setting('beyu.governance_country_codes', true), ','))
    )
$$;--> statement-breakpoint

ALTER TABLE "ai_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_decisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ai_decisions_scope_isolation" ON "ai_decisions";--> statement-breakpoint
CREATE POLICY "ai_decisions_scope_isolation" ON "ai_decisions"
  USING (
    classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ','))
    AND (
      (tenant_id IS NULL AND beyu_global_scope()) OR
      (tenant_id = ANY(beyu_tenant_ids()) AND beyu_governance_entity_visible(legal_entity_id) AND beyu_governance_country_visible(country_code))
    )
  )
  WITH CHECK (
    classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ','))
    AND (
      (tenant_id IS NULL AND beyu_global_scope()) OR
      (tenant_id = ANY(beyu_tenant_ids()) AND beyu_governance_entity_visible(legal_entity_id) AND beyu_governance_country_visible(country_code))
    )
  );--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_protect_ai_decision_original()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_decisions are immutable evidence' USING ERRCODE = '55000';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR OLD.country_code IS DISTINCT FROM NEW.country_code
     OR OLD.classification IS DISTINCT FROM NEW.classification
     OR OLD.user_id IS DISTINCT FROM NEW.user_id
     OR OLD.agent IS DISTINCT FROM NEW.agent
     OR OLD.runtime IS DISTINCT FROM NEW.runtime
     OR OLD.engine IS DISTINCT FROM NEW.engine
     OR OLD.model IS DISTINCT FROM NEW.model
     OR OLD.model_version IS DISTINCT FROM NEW.model_version
     OR OLD.prompt_version IS DISTINCT FROM NEW.prompt_version
     OR OLD.provider IS DISTINCT FROM NEW.provider
     OR OLD.model_kind IS DISTINCT FROM NEW.model_kind
     OR OLD.request_id IS DISTINCT FROM NEW.request_id
     OR OLD.routing_decision_id IS DISTINCT FROM NEW.routing_decision_id
     OR OLD.request_type IS DISTINCT FROM NEW.request_type
     OR OLD.question IS DISTINCT FROM NEW.question
     OR OLD.inputs IS DISTINCT FROM NEW.inputs
     OR OLD.retrieved_sources IS DISTINCT FROM NEW.retrieved_sources
     OR OLD.tools_used IS DISTINCT FROM NEW.tools_used
     OR OLD.output IS DISTINCT FROM NEW.output
     OR OLD.output_class IS DISTINCT FROM NEW.output_class
     OR OLD.confidence IS DISTINCT FROM NEW.confidence
     OR OLD.policy_decision IS DISTINCT FROM NEW.policy_decision
     OR OLD.denied_scopes IS DISTINCT FROM NEW.denied_scopes
     OR OLD.human_review_required IS DISTINCT FROM NEW.human_review_required
     OR OLD.latency_ms IS DISTINCT FROM NEW.latency_ms
     OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at THEN
    RAISE EXCEPTION 'original AI decision content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_ai_decision_original ON "ai_decisions";--> statement-breakpoint
CREATE TRIGGER protect_ai_decision_original BEFORE UPDATE OR DELETE ON "ai_decisions"
FOR EACH ROW EXECUTE FUNCTION beyu_protect_ai_decision_original();--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_protect_knowledge_original()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  table_owner text;
  action_tool text;
  action_input jsonb;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid = TG_RELID;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'knowledge sources are immutable evidence' USING ERRCODE = '55000';
  END IF;

  -- Migration/fixture owners may bootstrap evidence. Every non-owner runtime
  -- write must be bound to one live, MFA-verified canonical action approval.
  IF current_user IS DISTINCT FROM table_owner THEN
    SELECT request.tool_name, request.input
      INTO action_tool, action_input
      FROM public.noelia_action_requests request
      JOIN public.approvals approval ON approval.id = request.approval_id
      JOIN public.users approver ON approver.id = approval.approver_user_id
      JOIN public.roles approver_role ON approver_role.code = request.required_approver_role
      JOIN public.role_assignments assignment
        ON assignment.user_id = approver.id AND assignment.role_id = approver_role.id
      JOIN public.role_permissions approver_permission
        ON approver_permission.role_id = approver_role.id
       AND approver_permission.permission_code = 'ai:decision.review'
      JOIN public.tenants assignment_tenant ON assignment_tenant.id = assignment.tenant_id
     WHERE request.id = nullif(current_setting('beyu.noelia_action_request_id', true), '')
       AND request.status = 'APPROVED'
       AND request.approving_human_id IS NOT NULL
       AND approver.status = 'ACTIVE'
       AND NOT approver.is_service_account
       AND assignment.effective_from <= current_date
       AND (assignment.effective_to IS NULL OR assignment.effective_to >= current_date)
       AND (
         (assignment.global_scope
          AND assignment_tenant.type = 'ENTERPRISE'
          AND assignment.legal_entity_id IS NULL
          AND approver_role.code IN ('GROUP_CEO','GROUP_CFO','CHIEF_GOVERNANCE_OFFICER','CHIEF_RISK_COMPLIANCE','FAMILY_OFFICE_PRINCIPAL','HCM_DIRECTOR','PLATFORM_ADMIN','AUDITOR'))
         OR
         (NOT assignment.global_scope
          AND assignment.tenant_id = request.target_tenant_id
          AND (assignment.legal_entity_id IS NULL OR assignment.legal_entity_id IS NOT DISTINCT FROM request.legal_entity_id))
       )
       AND approval.object_type = 'NOELIA_ACTION'
       AND approval.object_id = request.id
       AND approval.decision = 'APPROVED'
       AND approval.approver_user_id = request.approving_human_id
       AND approval.approver_user_id IS DISTINCT FROM request.requesting_human_id
       AND approval.mfa_verified
       AND approval.revoked_at IS NULL
       AND approval.valid_until > now()
       AND approval.payload_digest = request.input_digest
       AND approval.payload_version = request.input_version
       AND approval.target_tenant_id IS NOT DISTINCT FROM request.target_tenant_id
       AND approval.target_legal_entity_id IS NOT DISTINCT FROM request.legal_entity_id
       AND approval.target_country_code IS NOT DISTINCT FROM request.country_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'knowledge mutation requires a live canonical approved action binding' USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF NOT (
        (action_tool = 'knowledge.ingest'
          AND action_input->>'code' = NEW.code
          AND coalesce(action_input->>'version', '1.0.0') = NEW.version
          AND action_input->>'scopeType' = NEW.scope_type
          AND action_input->>'classification' = NEW.classification::text
          AND action_input->>'content' = NEW.content)
        OR
        (action_tool = 'knowledge.replace'
          AND action_input->'replacement'->>'code' = NEW.code
          AND action_input->'replacement'->>'version' = NEW.version
          AND action_input->'replacement'->>'scopeType' = NEW.scope_type
          AND action_input->'replacement'->>'classification' = NEW.classification::text
          AND action_input->'replacement'->>'content' = NEW.content)
      ) THEN
        RAISE EXCEPTION 'knowledge insertion does not match the approved immutable payload' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.authority_status IS DISTINCT FROM NEW.authority_status AND NOT (
      -- Publish the exact reviewed source.
      (action_tool = 'knowledge.publish'
        AND OLD.authority_status = 'UNDER_REVIEW'
        AND NEW.authority_status = 'AUTHORITATIVE'
        AND action_input->>'code' = OLD.code
        AND action_input->>'expectedDigest' = OLD.content_digest
        AND action_input->>'expectedVersion' = OLD.version)
      OR
      -- Atomically supersede the exact predecessor while publishing its bound
      -- replacement. The application also locks and rechecks both rows.
      (action_tool = 'knowledge.publish'
        AND OLD.authority_status = 'AUTHORITATIVE'
        AND NEW.authority_status = 'SUPERSEDED'
        AND action_input->>'expectedSupersededDigest' = OLD.content_digest
        AND action_input->>'expectedSupersededVersion' = OLD.version
        AND EXISTS (
          SELECT 1 FROM public.knowledge_sources replacement
           WHERE replacement.code = action_input->>'code'
             AND replacement.supersedes_code = OLD.code
             AND replacement.authority_status = 'UNDER_REVIEW'
        ))
    ) THEN
      RAISE EXCEPTION 'knowledge authority transition is not bound to the approved publication' USING ERRCODE = '55000';
    END IF;

    IF OLD.supersedes_code IS DISTINCT FROM NEW.supersedes_code AND NOT (
      OLD.supersedes_code IS NULL
      AND NEW.supersedes_code IS NOT NULL
      AND action_tool = 'knowledge.replace'
      AND action_input->>'supersedesCode' = NEW.supersedes_code
      AND action_input->'replacement'->>'code' = NEW.code
      AND EXISTS (
        SELECT 1 FROM public.knowledge_sources predecessor
         WHERE predecessor.code = NEW.supersedes_code
           AND predecessor.authority_status = 'AUTHORITATIVE'
           AND predecessor.content_digest = action_input->>'expectedDigest'
           AND predecessor.version = action_input->>'expectedVersion'
      )
    ) THEN
      RAISE EXCEPTION 'knowledge replacement binding does not match the approved action' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.code IS DISTINCT FROM NEW.code
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.domain IS DISTINCT FROM NEW.domain
     OR OLD.source_uri IS DISTINCT FROM NEW.source_uri
     OR OLD.owner_role IS DISTINCT FROM NEW.owner_role
     OR OLD.jurisdiction_code IS DISTINCT FROM NEW.jurisdiction_code
     OR OLD.scope_type IS DISTINCT FROM NEW.scope_type
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR OLD.country_code IS DISTINCT FROM NEW.country_code
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.provenance IS DISTINCT FROM NEW.provenance
     OR OLD.classification IS DISTINCT FROM NEW.classification
     OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
     OR OLD.review_date IS DISTINCT FROM NEW.review_date
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.content IS DISTINCT FROM NEW.content
     OR OLD.content_digest IS DISTINCT FROM NEW.content_digest
     OR OLD.source_type IS DISTINCT FROM NEW.source_type
     OR OLD.os_id IS DISTINCT FROM NEW.os_id THEN
    RAISE EXCEPTION 'original knowledge content/scope/version is immutable; create a governed replacement' USING ERRCODE = '55000';
  END IF;
  IF OLD.authority_status = 'UNDER_REVIEW' AND NEW.authority_status NOT IN ('UNDER_REVIEW','AUTHORITATIVE','REJECTED') THEN
    RAISE EXCEPTION 'invalid knowledge publication transition' USING ERRCODE = '55000';
  END IF;
  IF OLD.authority_status = 'AUTHORITATIVE' AND NEW.authority_status NOT IN ('AUTHORITATIVE','SUPERSEDED','EXPIRED') THEN
    RAISE EXCEPTION 'invalid authoritative knowledge transition' USING ERRCODE = '55000';
  END IF;
  IF OLD.authority_status IN ('SUPERSEDED','EXPIRED','REJECTED') AND NEW.authority_status IS DISTINCT FROM OLD.authority_status THEN
    RAISE EXCEPTION 'terminal knowledge authority state is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.supersedes_code IS NOT NULL AND NEW.supersedes_code IS DISTINCT FROM OLD.supersedes_code THEN
    RAISE EXCEPTION 'knowledge replacement binding is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_knowledge_original ON "knowledge_sources";--> statement-breakpoint
CREATE TRIGGER protect_knowledge_original BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_sources"
FOR EACH ROW EXECUTE FUNCTION beyu_protect_knowledge_original();--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_protect_noelia_action_intent()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.requesting_human_id IS DISTINCT FROM NEW.requesting_human_id
     OR OLD.executing_ai IS DISTINCT FROM NEW.executing_ai
     OR OLD.tool_name IS DISTINCT FROM NEW.tool_name
     OR OLD.input IS DISTINCT FROM NEW.input
     OR OLD.input_digest IS DISTINCT FROM NEW.input_digest
     OR OLD.input_version IS DISTINCT FROM NEW.input_version
     OR OLD.required_approver_role IS DISTINCT FROM NEW.required_approver_role
     OR OLD.target_tenant_id IS DISTINCT FROM NEW.target_tenant_id
     OR OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR OLD.country_code IS DISTINCT FROM NEW.country_code THEN
    RAISE EXCEPTION 'Noelia action intent and target are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status IN ('COMPLETED','FAILED','DENIED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal Noelia action state is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_noelia_action_intent ON "noelia_action_requests";--> statement-breakpoint
CREATE TRIGGER protect_noelia_action_intent BEFORE UPDATE ON "noelia_action_requests"
FOR EACH ROW EXECUTE FUNCTION beyu_protect_noelia_action_intent();--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_protect_noelia_workflow_plan()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.plan IS DISTINCT FROM NEW.plan
     OR OLD.plan_digest IS DISTINCT FROM NEW.plan_digest
     OR OLD.plan_version IS DISTINCT FROM NEW.plan_version
     OR OLD.target_tenant_id IS DISTINCT FROM NEW.target_tenant_id
     OR OLD.target_legal_entity_id IS DISTINCT FROM NEW.target_legal_entity_id
     OR OLD.target_country_code IS DISTINCT FROM NEW.target_country_code
     OR OLD.requested_by IS DISTINCT FROM NEW.requested_by THEN
    RAISE EXCEPTION 'Noelia workflow plan, target and maker are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status IN ('COMPLETED','STOPPED','ESCALATED','FAILED','CANCELLED','TIMED_OUT')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal Noelia workflow state is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_noelia_workflow_plan ON "noelia_workflows";--> statement-breakpoint
CREATE TRIGGER protect_noelia_workflow_plan BEFORE UPDATE ON "noelia_workflows"
FOR EACH ROW EXECUTE FUNCTION beyu_protect_noelia_workflow_plan();--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_protect_decided_approval()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.decision <> 'PENDING' AND (
       OLD.object_type IS DISTINCT FROM NEW.object_type
    OR OLD.object_id IS DISTINCT FROM NEW.object_id
    OR OLD.approver_role IS DISTINCT FROM NEW.approver_role
    OR OLD.approver_user_id IS DISTINCT FROM NEW.approver_user_id
    OR OLD.decision IS DISTINCT FROM NEW.decision
    OR OLD.payload_digest IS DISTINCT FROM NEW.payload_digest
    OR OLD.payload_version IS DISTINCT FROM NEW.payload_version
    OR OLD.target_tenant_id IS DISTINCT FROM NEW.target_tenant_id
    OR OLD.target_legal_entity_id IS DISTINCT FROM NEW.target_legal_entity_id
    OR OLD.target_country_code IS DISTINCT FROM NEW.target_country_code
    OR OLD.mfa_verified IS DISTINCT FROM NEW.mfa_verified
    OR OLD.valid_until IS DISTINCT FROM NEW.valid_until
    OR OLD.quorum IS DISTINCT FROM NEW.quorum
  ) THEN
    RAISE EXCEPTION 'decided approval binding is immutable; revoke instead of editing' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_decided_approval ON "approvals";--> statement-breakpoint
CREATE TRIGGER protect_decided_approval BEFORE UPDATE ON "approvals"
FOR EACH ROW EXECUTE FUNCTION beyu_protect_decided_approval();
