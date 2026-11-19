-- BEYU OS migration 0083: governed public news and events
CREATE TABLE "public_content" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "summary" text NOT NULL,
  "body" text NOT NULL,
  "image_url" text,
  "location" text,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "approved_by" text,
  "approved_at" timestamptz,
  "published_at" timestamptz,
  "is_featured" boolean DEFAULT false NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "public_content_tenant_status_idx" ON "public_content" ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "public_content_publication_idx" ON "public_content" ("classification","status","published_at");
--> statement-breakpoint
CREATE INDEX "public_content_slug_idx" ON "public_content" ("slug");
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
