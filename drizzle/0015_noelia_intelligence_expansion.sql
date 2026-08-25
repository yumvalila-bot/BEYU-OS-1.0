CREATE TABLE "enterprise_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text,
	"memory_class" text NOT NULL,
	"content" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"scope_type" text DEFAULT 'TENANT' NOT NULL,
	"legal_entity_id" text,
	"country_code" text,
	"provenance" text NOT NULL,
	"confidence" numeric(5, 4),
	"retention_code" text DEFAULT 'STANDARD' NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"expires_at" date,
	"supersedes_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "model_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"capability_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"jurisdiction_restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"retry_policy" jsonb,
	"circuit_breaker" jsonb,
	"cost_per_token" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noelia_schedule_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"decision_id" text,
	"error_code" text,
	"error_detail" text,
	"trace_id" text NOT NULL,
	"executed_by" text DEFAULT 'NOELIA_SCHEDULER' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "noelia_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"cadence" text NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text,
	"horizon" text DEFAULT 'HORIZON_2_NEAR_TERM' NOT NULL,
	"briefing_focus" text DEFAULT 'STANDARD' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"owner_role" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noelia_workflow_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"tool_name" text NOT NULL,
	"capability" text NOT NULL,
	"policy_decision" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"output_classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"status" text NOT NULL,
	"denial_code" text,
	"output" jsonb,
	"observations" jsonb,
	"trace_id" text NOT NULL,
	"audit_ref" text,
	"duration_ms" integer,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "noelia_workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"goal" text NOT NULL,
	"status" text NOT NULL,
	"plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_steps" integer DEFAULT 8 NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"timeout_ms" integer DEFAULT 60000 NOT NULL,
	"budget" jsonb,
	"retry_policy" jsonb,
	"failure_state" jsonb,
	"cancellation_requested" boolean DEFAULT false NOT NULL,
	"requested_by" text NOT NULL,
	"executing_ai" text DEFAULT 'NOELIA' NOT NULL,
	"approving_human_id" text,
	"approval_id" text,
	"trace_id" text NOT NULL,
	"correlation_id" text,
	"causation_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "supersedes_code" text;--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_schedule_runs" ADD CONSTRAINT "noelia_schedule_runs_schedule_id_noelia_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."noelia_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_schedules" ADD CONSTRAINT "noelia_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_schedules" ADD CONSTRAINT "noelia_schedules_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_schedules" ADD CONSTRAINT "noelia_schedules_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_workflow_steps" ADD CONSTRAINT "noelia_workflow_steps_workflow_id_noelia_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."noelia_workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD CONSTRAINT "noelia_workflows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD CONSTRAINT "noelia_workflows_approving_human_id_users_id_fk" FOREIGN KEY ("approving_human_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD CONSTRAINT "noelia_workflows_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_memory_tenant_idx" ON "enterprise_memory" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "enterprise_memory_class_idx" ON "enterprise_memory" USING btree ("memory_class");--> statement-breakpoint
CREATE INDEX "enterprise_memory_scope_idx" ON "enterprise_memory" USING btree ("scope_type","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_registry_provider_model_version_uidx" ON "model_registry" USING btree ("provider","model","version");--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_schedule_runs_once_uidx" ON "noelia_schedule_runs" USING btree ("schedule_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "noelia_schedule_runs_status_idx" ON "noelia_schedule_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_schedules_code_uidx" ON "noelia_schedules" USING btree ("code");--> statement-breakpoint
CREATE INDEX "noelia_schedules_next_run_idx" ON "noelia_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "noelia_workflow_steps_workflow_idx" ON "noelia_workflow_steps" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_workflow_steps_index_uidx" ON "noelia_workflow_steps" USING btree ("workflow_id","step_index");--> statement-breakpoint
CREATE INDEX "noelia_workflows_tenant_idx" ON "noelia_workflows" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "noelia_workflows_status_idx" ON "noelia_workflows" USING btree ("status");--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_supersedes_id_enterprise_memory_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."enterprise_memory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Fail closed on unknown or internally inconsistent memory/schedule/workflow
-- scope and lifecycle values. These checks are authority boundaries, not
-- conveniences for the TypeScript layer.
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_scope_shape_ck" CHECK (
  (scope_type = 'GLOBAL' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'ENTERPRISE' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'TENANT' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'ENTITY' AND tenant_id IS NOT NULL AND legal_entity_id IS NOT NULL AND country_code IS NULL) OR
  (scope_type = 'COUNTRY' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_status_ck" CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'EXPIRED', 'DELETED'));--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_memory_class_ck" CHECK (memory_class IN (
  'SESSION', 'WORKING', 'TASK', 'USER', 'ORGANIZATIONAL', 'TENANT', 'SECTOR',
  'GOVERNANCE', 'STRATEGIC', 'INSTITUTIONAL', 'LONG_TERM_CONTINUITY'
));--> statement-breakpoint
ALTER TABLE "model_registry" ADD CONSTRAINT "model_registry_status_ck" CHECK (status IN ('ACTIVE', 'SUSPENDED', 'RETIRED'));--> statement-breakpoint
ALTER TABLE "noelia_schedules" ADD CONSTRAINT "noelia_schedules_cadence_ck" CHECK (cadence IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'HORIZON'));--> statement-breakpoint
ALTER TABLE "noelia_schedules" ADD CONSTRAINT "noelia_schedules_status_ck" CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "noelia_schedule_runs" ADD CONSTRAINT "noelia_schedule_runs_status_ck" CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "noelia_workflows" ADD CONSTRAINT "noelia_workflows_status_ck" CHECK (status IN (
  'PLANNED', 'VALIDATED', 'AUTHORIZED', 'RUNNING', 'COMPLETED', 'ESCALATED',
  'STOPPED', 'FAILED', 'CANCELLED', 'TIMED_OUT'
));--> statement-breakpoint
ALTER TABLE "noelia_workflow_steps" ADD CONSTRAINT "noelia_workflow_steps_status_ck" CHECK (status IN (
  'PENDING', 'ALLOWED', 'DENIED', 'COMPLETED', 'FAILED', 'SKIPPED'
));--> statement-breakpoint

-- RLS is defence in depth; application predicates remain mandatory. Memory is
-- tenant-owned; schedules and workflows are tenant-owned. The model registry
-- is global configuration data (approved models), not tenant data.
ALTER TABLE "enterprise_memory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "enterprise_memory_tenant_isolation" ON "enterprise_memory";--> statement-breakpoint
CREATE POLICY "enterprise_memory_tenant_isolation" ON "enterprise_memory"
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint
ALTER TABLE "noelia_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_schedules_tenant_isolation" ON "noelia_schedules";--> statement-breakpoint
CREATE POLICY "noelia_schedules_tenant_isolation" ON "noelia_schedules"
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint
ALTER TABLE "noelia_schedule_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_schedule_runs_tenant_isolation" ON "noelia_schedule_runs";--> statement-breakpoint
CREATE POLICY "noelia_schedule_runs_tenant_isolation" ON "noelia_schedule_runs"
  USING (schedule_id IN (SELECT id FROM noelia_schedules WHERE tenant_id = ANY(beyu_tenant_ids())))
  WITH CHECK (schedule_id IN (SELECT id FROM noelia_schedules WHERE tenant_id = ANY(beyu_tenant_ids())));--> statement-breakpoint
ALTER TABLE "noelia_workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_workflows_tenant_isolation" ON "noelia_workflows";--> statement-breakpoint
CREATE POLICY "noelia_workflows_tenant_isolation" ON "noelia_workflows"
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint
ALTER TABLE "noelia_workflow_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_workflow_steps_tenant_isolation" ON "noelia_workflow_steps";--> statement-breakpoint
CREATE POLICY "noelia_workflow_steps_tenant_isolation" ON "noelia_workflow_steps"
  USING (workflow_id IN (SELECT id FROM noelia_workflows WHERE tenant_id = ANY(beyu_tenant_ids())))
  WITH CHECK (workflow_id IN (SELECT id FROM noelia_workflows WHERE tenant_id = ANY(beyu_tenant_ids())));
