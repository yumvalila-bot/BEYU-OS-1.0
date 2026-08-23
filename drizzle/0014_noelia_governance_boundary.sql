CREATE TABLE "noelia_action_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"requesting_human_id" text NOT NULL,
	"executing_ai" text DEFAULT 'NOELIA' NOT NULL,
	"approving_human_id" text,
	"approval_id" text,
	"tool_name" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text,
	"risk" text NOT NULL,
	"status" text NOT NULL,
	"denial_code" text,
	"reason" text NOT NULL,
	"output" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "scope_type" text DEFAULT 'GLOBAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "legal_entity_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_requests_requesting_human_id_users_id_fk" FOREIGN KEY ("requesting_human_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_requests_approving_human_id_users_id_fk" FOREIGN KEY ("approving_human_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_requests_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "noelia_action_tenant_idx" ON "noelia_action_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "noelia_action_status_idx" ON "noelia_action_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "noelia_action_approval_idx" ON "noelia_action_requests" USING btree ("approval_id");--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_sources_scope_idx" ON "knowledge_sources" USING btree ("scope_type","tenant_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_entity_idx" ON "knowledge_sources" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_country_idx" ON "knowledge_sources" USING btree ("country_code");--> statement-breakpoint

-- Fail closed on unknown or internally inconsistent memory/action scope. These
-- checks are authority boundaries, not conveniences for the TypeScript layer.
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_scope_shape_ck" CHECK (
  (scope_type = 'GLOBAL' AND tenant_id IS NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'ENTERPRISE' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'TENANT' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'ENTITY' AND tenant_id IS NOT NULL AND legal_entity_id IS NOT NULL AND country_code IS NULL) OR
  (scope_type = 'COUNTRY' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_identity_ck" CHECK (executing_ai = 'NOELIA');--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_risk_ck" CHECK (risk IN ('LOW', 'HIGH'));--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ADD CONSTRAINT "noelia_action_status_ck" CHECK (status IN ('DENIED', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'FAILED'));--> statement-breakpoint

-- RLS is defence in depth; application predicates remain mandatory. Enterprise
-- scope is represented by the explicit descendant tenant set in SET LOCAL, not
-- by treating ENTERPRISE memory as globally readable. Action evidence is owned
-- by the requesting tenant; denied requested targets are retained as opaque
-- evidence and are never themselves RLS grants or existence lookups.
ALTER TABLE "knowledge_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "knowledge_sources_scope_isolation" ON "knowledge_sources";--> statement-breakpoint
CREATE POLICY "knowledge_sources_scope_isolation" ON "knowledge_sources"
  USING (scope_type = 'GLOBAL' OR tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (scope_type = 'GLOBAL' OR tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint
ALTER TABLE "noelia_action_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_action_tenant_isolation" ON "noelia_action_requests";--> statement-breakpoint
CREATE POLICY "noelia_action_tenant_isolation" ON "noelia_action_requests"
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));