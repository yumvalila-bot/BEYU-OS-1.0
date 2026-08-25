ALTER TABLE "approvals" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "quorum" integer;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "delegated_from" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "fallback_model_id" text;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "effective_from" date;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "retired_at" timestamp with time zone;
-- RLS hardening: approvals holds approval evidence; tenant isolation is
-- enforced with the same beyu_tenant_ids() pattern as every other tenant table.
-- model_registry is a GLOBAL governed catalogue (no tenant column) and is not
-- tenant-scoped; reads are permission-gated at the application layer.
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "approvals_tenant_isolation" ON "approvals" FOR ALL USING ("tenant_id" = ANY (beyu_tenant_ids()));--> statement-breakpoint

-- Memory class catalogue extended with ENTERPRISE (mandate §X). The check
-- constraint is replaced, not dropped: the allowed set remains closed.
ALTER TABLE "enterprise_memory" DROP CONSTRAINT "enterprise_memory_memory_class_ck";--> statement-breakpoint
ALTER TABLE "enterprise_memory" ADD CONSTRAINT "enterprise_memory_memory_class_ck" CHECK (memory_class IN (
  'SESSION', 'WORKING', 'TASK', 'USER', 'ORGANIZATIONAL', 'ENTERPRISE', 'TENANT', 'SECTOR',
  'GOVERNANCE', 'STRATEGIC', 'INSTITUTIONAL', 'LONG_TERM_CONTINUITY'
));--> statement-breakpoint
