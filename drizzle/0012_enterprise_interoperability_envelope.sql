-- BEYU OS Phase 14 — one enterprise interoperability envelope
--
-- This extends the existing enterprise_events table. It does not create a
-- second event bus, event store or audit system. Existing columns remain the
-- canonical event identity; these nullable additions preserve historical rows
-- while the shared application writer requires the fields for every new event.
--
-- New event writes are hash-versioned (v2) so the complete interoperability
-- envelope is tamper-evident without invalidating historical v1 event hashes.
-- Historical data is not backfilled or rewritten by this migration.
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "event_version" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "domain" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "operation" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "destination_domain" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "legal_entity_id" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "correlation_id" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "causation_id" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "authority_context" jsonb;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "policy_version" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD COLUMN IF NOT EXISTS "hash_version" text;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD CONSTRAINT "enterprise_event_hash_version_valid"
  CHECK ("hash_version" IS NULL OR "hash_version" = '1' OR
    ("hash_version" = '2' AND "event_version" IS NOT NULL AND "domain" IS NOT NULL AND "operation" IS NOT NULL AND "correlation_id" IS NOT NULL));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_correlation_idx" ON "enterprise_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_causation_idx" ON "enterprise_events" USING btree ("causation_id");
