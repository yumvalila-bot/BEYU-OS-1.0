-- BEYU OS migration 0083: governed public news and events
-- Additive, expand-only table with maker-checker publish CHECK, FORCE RLS, and
-- anonymous read restricted solely to explicitly PUBLIC + PUBLISHED items.
CREATE TABLE "public_content" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"location" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_content_kind_ck" CHECK (kind IN ('NEWS', 'EVENT')),
	CONSTRAINT "public_content_status_ck" CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED')),
	CONSTRAINT "public_content_publish_governance_ck" CHECK (status <> 'PUBLISHED' OR (classification = 'PUBLIC' AND approved_by IS NOT NULL AND approved_by <> created_by AND published_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "public_content" ADD CONSTRAINT "public_content_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "public_content_tenant_status_idx" ON "public_content" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "public_content_publication_idx" ON "public_content" USING btree ("classification","status","published_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "public_content_slug_uidx" ON "public_content" USING btree ("slug");
--> statement-breakpoint
ALTER TABLE "public_content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public_content" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "public_content_tenant_manage" ON "public_content" FOR ALL
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());
--> statement-breakpoint
CREATE POLICY "public_content_anonymous_published_read" ON "public_content" FOR SELECT
  USING ("classification" = 'PUBLIC' AND "status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "published_at" <= now());
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'public_content' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'Migration 0083 verification failed: public_content RLS is not enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'public_content'
      AND policyname = 'public_content_anonymous_published_read' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Migration 0083 verification failed: public read policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'public_content'
      AND policyname = 'public_content_tenant_manage' AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'Migration 0083 verification failed: tenant write policy is missing';
  END IF;
END $$;
