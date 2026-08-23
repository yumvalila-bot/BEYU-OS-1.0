-- BEYU OS Phase 15 — version the audit hash without rewriting history.
-- NULL/1 identifies the historical v1 algorithm; new kernel writes use v2.
ALTER TABLE "audit_log" ADD COLUMN "hash_version" text;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_hash_version_valid"
  CHECK ("hash_version" IS NULL OR "hash_version" = '1' OR "hash_version" = '2');
