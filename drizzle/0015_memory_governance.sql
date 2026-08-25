-- ITERATION 11 — ENTERPRISE MEMORY GOVERNANCE
--
-- Memory must be attributable, integrity-checked and versioned before it can
-- ever be treated as evidence. This migration adds:
--   * writer identity (created_by / updated_by) — provenance at the DB level
--   * created_at / updated_at — retention and freshness ordering
--   * content_checksum — application-computed SHA-256 over the content;
--     NULL means UNVERIFIED_LEGACY (fail closed on integrity checks, never
--     silently "ok")
--   * decommissioned_at — soft decommission; memory is evidence and is never
--     physically deleted through any application path
-- and extends the canonical memory scope classes with:
--   * ORGANIZATIONAL — org-wide memory for one tenant (no enterprise flag)
--   * LONG_TERM_CONTINUITY — continuity memory; enterprise-only, never expires
-- Both new classes keep the tenant-scoped shape; the CHECK below is the
-- authority boundary for scope consistency.

ALTER TABLE "knowledge_sources" ADD COLUMN "content_checksum" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "updated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "decommissioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" DROP CONSTRAINT IF EXISTS "knowledge_sources_scope_shape_ck";--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_scope_shape_ck" CHECK (
  (scope_type = 'GLOBAL' AND tenant_id IS NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'ENTERPRISE' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'TENANT' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'ENTITY' AND tenant_id IS NOT NULL AND legal_entity_id IS NOT NULL AND country_code IS NULL) OR
  (scope_type = 'COUNTRY' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NOT NULL) OR
  (scope_type = 'ORGANIZATIONAL' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL) OR
  (scope_type = 'LONG_TERM_CONTINUITY' AND tenant_id IS NOT NULL AND legal_entity_id IS NULL AND country_code IS NULL AND expires_at IS NULL)
);--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "knowledge_sources" USING btree ("authority_status");--> statement-breakpoint
CREATE INDEX "knowledge_sources_decommissioned_idx" ON "knowledge_sources" USING btree ("decommissioned_at");
