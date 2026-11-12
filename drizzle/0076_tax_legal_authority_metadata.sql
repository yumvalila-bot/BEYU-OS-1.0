-- FINANCE_OS tax intelligence: enrich the existing governed knowledge registry.
-- No duplicate tax-document table is created. All columns are additive and nullable
-- or safely defaulted so existing knowledge and NOELIA retrieval remain compatible.
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "instrument_kind" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "published_on" date;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "commenced_on" date;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "effective_to" date;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "original_source_sha256" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "official_source_host" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "source_authentication_status" text NOT NULL DEFAULT 'DISCOVERED';--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "text_validated_at" timestamptz;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "text_validated_by" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "specialist_reviewed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "specialist_reviewer_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "enabling_provision" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "amends_source_codes" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "repeals_source_codes" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "provision_references" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_sources_tax_source_auth_status_ck') THEN
    ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tax_source_auth_status_ck"
      CHECK ("source_authentication_status" IN (
        'DISCOVERED', 'OFFICIAL_METADATA_VERIFIED', 'ORIGINAL_ACQUIRED',
        'CHECKSUM_VERIFIED', 'TEXT_VALIDATED', 'SPECIALIST_REVIEWED',
        'AUTHORITATIVE', 'SUPERSEDED', 'REJECTED'
      ));
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_sources_tax_original_sha256_ck') THEN
    ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tax_original_sha256_ck"
      CHECK ("original_source_sha256" IS NULL OR "original_source_sha256" ~ '^[0-9a-fA-F]{64}$');
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_sources_tax_effective_window_ck') THEN
    ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tax_effective_window_ck"
      CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
  END IF;
END $$;--> statement-breakpoint

-- A TAX_LEGAL_AUTHORITY row cannot be promoted to AUTHORITATIVE unless the
-- original source, checksum, legal dates, validated text and named specialist
-- review are all present. Existing non-tax knowledge rows are unaffected.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_sources_tax_authoritative_evidence_ck') THEN
    ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tax_authoritative_evidence_ck"
      CHECK (
        "source_type" <> 'TAX_LEGAL_AUTHORITY'
        OR "authority_status" <> 'AUTHORITATIVE'
        OR (
          "source_authentication_status" = 'AUTHORITATIVE'
          AND "source_uri" IS NOT NULL
          AND "official_source_host" IS NOT NULL
          AND "original_source_sha256" ~ '^[0-9a-fA-F]{64}$'
          AND "published_on" IS NOT NULL
          AND "commenced_on" IS NOT NULL
          AND "text_validated_at" IS NOT NULL
          AND "text_validated_by" IS NOT NULL
          AND "specialist_reviewed_at" IS NOT NULL
          AND "specialist_reviewer_id" IS NOT NULL
          AND jsonb_typeof("provision_references") = 'array'
          AND jsonb_array_length("provision_references") > 0
        )
      );
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "knowledge_sources_tax_effective_idx"
  ON "knowledge_sources" ("jurisdiction_code", "effective_from", "effective_to");
