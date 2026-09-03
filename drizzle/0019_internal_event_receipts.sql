CREATE TABLE "internal_event_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"source" text NOT NULL,
	"tenant_id" text,
	"event_type" text NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "internal_event_receipts" ADD CONSTRAINT "internal_event_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_receipts_event_idx" ON "internal_event_receipts" USING btree ("event_id");--> statement-breakpoint
-- RLS: tenant isolation mirroring the audit ledger. The receipt is written
-- inside the same transaction-local tenant context as the governed event
-- and the audit record; duplicate deliveries only UPDATE duplicate_count.
ALTER TABLE "internal_event_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "internal_event_receipts_tenant_isolation" ON "internal_event_receipts";--> statement-breakpoint
CREATE POLICY "internal_event_receipts_tenant_isolation" ON "internal_event_receipts"
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR (beyu_global_scope() AND "tenant_id" IS NULL) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());
