CREATE TABLE "noelia_scheduler_offsets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"consumer" text NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "noelia_scheduler_offsets" ADD CONSTRAINT "noelia_scheduler_offsets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_scheduler_offsets_consumer_uidx" ON "noelia_scheduler_offsets" USING btree ("tenant_id","consumer");--> statement-breakpoint

-- The watermark is tenant-owned; the same consumer runs once per tenant.
ALTER TABLE "noelia_scheduler_offsets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_scheduler_offsets_tenant_isolation" ON "noelia_scheduler_offsets";--> statement-breakpoint
CREATE POLICY "noelia_scheduler_offsets_tenant_isolation" ON "noelia_scheduler_offsets"
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));
