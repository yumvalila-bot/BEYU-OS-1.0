-- BEYU OS — P3 Release Governance (canonical, additive, expand-only)
-- No destructive changes. No modification of historical migrations.
-- Creates release_records, release_transitions, pvg_runs, canary_deployments, blue_green_deployments, rollback_requests

-- ─────────────────────────────────────────────────────────────────────────────
-- release_records — immutable release identity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "release_records" (
  "id" text PRIMARY KEY NOT NULL,
  "release_id" text NOT NULL UNIQUE,
  "git_sha" text NOT NULL,
  "repository" text NOT NULL,
  "build_id" text NOT NULL,
  "deployment_id" text NOT NULL,
  "environment" text NOT NULL,
  "application_version" text NOT NULL,
  "runtime_version" text NOT NULL,
  "migration_fingerprint" text,
  "latest_migration" text,
  "migration_count" integer,
  "schema_fingerprint" text,
  "release_timestamp" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "release_records_release_id_idx" ON "release_records" ("release_id");
CREATE INDEX IF NOT EXISTS "release_records_git_sha_idx" ON "release_records" ("git_sha");
CREATE INDEX IF NOT EXISTS "release_records_environment_idx" ON "release_records" ("environment");
CREATE INDEX IF NOT EXISTS "release_records_created_at_idx" ON "release_records" ("created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- release_transitions — append-only ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "release_transitions" (
  "id" text PRIMARY KEY NOT NULL,
  "release_id" text NOT NULL REFERENCES "release_records"("release_id") ON DELETE CASCADE,
  "source_commit" text NOT NULL,
  "artifact_build_id" text NOT NULL,
  "environment" text NOT NULL,
  "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "actor_id" text NOT NULL,
  "actor_type" text NOT NULL,
  "previous_state" text,
  "next_state" text NOT NULL,
  "reason" text NOT NULL,
  "verification_evidence" jsonb,
  "correlation_id" text,
  "trace_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "release_transitions_actor_type_check" CHECK ("actor_type" IN ('HUMAN','SERVICE','AI','SYSTEM')),
  CONSTRAINT "release_transitions_next_state_check" CHECK ("next_state" IN ('DESIGNED','BUILT','DEPLOYED','PVG_VERIFIED','CANARY','PROMOTED','SWITCHED','RETIRED','CONTRACTED','VERIFIED','FAILED','ROLLED_BACK'))
);

CREATE INDEX IF NOT EXISTS "release_transitions_release_id_idx" ON "release_transitions" ("release_id");
CREATE INDEX IF NOT EXISTS "release_transitions_next_state_idx" ON "release_transitions" ("next_state");
CREATE INDEX IF NOT EXISTS "release_transitions_environment_idx" ON "release_transitions" ("environment");
CREATE INDEX IF NOT EXISTS "release_transitions_timestamp_idx" ON "release_transitions" ("timestamp");
CREATE INDEX IF NOT EXISTS "release_transitions_correlation_id_idx" ON "release_transitions" ("correlation_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- pvg_runs — PVG verification runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pvg_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "release_id" text NOT NULL REFERENCES "release_records"("release_id") ON DELETE CASCADE,
  "environment" text NOT NULL,
  "status" text NOT NULL,
  "commit_sha" text NOT NULL,
  "deployment_id" text,
  "build_id" text,
  "database" jsonb NOT NULL,
  "schema" jsonb NOT NULL,
  "security" jsonb NOT NULL,
  "events" jsonb NOT NULL,
  "runtime" jsonb NOT NULL,
  "checks" jsonb NOT NULL,
  "blocking_failures" jsonb NOT NULL,
  "verified_at" timestamp with time zone NOT NULL DEFAULT now(),
  "correlation_id" text,
  "trace_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pvg_runs_status_check" CHECK ("status" IN ('PASS','FAIL'))
);

CREATE INDEX IF NOT EXISTS "pvg_runs_release_id_idx" ON "pvg_runs" ("release_id");
CREATE INDEX IF NOT EXISTS "pvg_runs_status_idx" ON "pvg_runs" ("status");
CREATE INDEX IF NOT EXISTS "pvg_runs_environment_idx" ON "pvg_runs" ("environment");
CREATE INDEX IF NOT EXISTS "pvg_runs_verified_at_idx" ON "pvg_runs" ("verified_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- canary_deployments — canary governance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "canary_deployments" (
  "id" text PRIMARY KEY NOT NULL,
  "release_id" text NOT NULL REFERENCES "release_records"("release_id") ON DELETE CASCADE,
  "environment" text NOT NULL,
  "state" text NOT NULL,
  "traffic_percentage" integer NOT NULL DEFAULT 0,
  "previous_percentage" integer,
  "verification_evidence" jsonb,
  "pvg_result" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "actor_id" text NOT NULL,
  "correlation_id" text,
  CONSTRAINT "canary_deployments_state_check" CHECK ("state" IN ('CANARY_CONFIGURED','CANARY_DEPLOYED','CANARY_PVG_VERIFIED','CANARY_TRAFFIC_ACTIVE','CANARY_OBSERVATION','CANARY_PROMOTION_ELIGIBLE','CANARY_FAILED','CANARY_ROLLED_BACK')),
  CONSTRAINT "canary_deployments_traffic_check" CHECK ("traffic_percentage" IN (0,1,5,25,50,100))
);

CREATE INDEX IF NOT EXISTS "canary_deployments_release_id_idx" ON "canary_deployments" ("release_id");
CREATE INDEX IF NOT EXISTS "canary_deployments_environment_idx" ON "canary_deployments" ("environment");
CREATE INDEX IF NOT EXISTS "canary_deployments_state_idx" ON "canary_deployments" ("state");

-- ─────────────────────────────────────────────────────────────────────────────
-- blue_green_deployments — blue/green governance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "blue_green_deployments" (
  "id" text PRIMARY KEY NOT NULL,
  "environment" text NOT NULL,
  "blue_release_id" text NOT NULL,
  "green_release_id" text NOT NULL,
  "state" text NOT NULL,
  "traffic_state" jsonb NOT NULL,
  "verification_evidence" jsonb,
  "pvg_evidence" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "actor_id" text NOT NULL,
  "correlation_id" text,
  CONSTRAINT "blue_green_deployments_state_check" CHECK ("state" IN ('BLUE_ACTIVE','GREEN_DEPLOYED','GREEN_PVG_VERIFIED','GREEN_CANARY','GREEN_PROMOTION_READY','GREEN_ACTIVE','BLUE_RETIRED','BG_FAILED','BG_ROLLED_BACK'))
);

CREATE INDEX IF NOT EXISTS "blue_green_deployments_environment_idx" ON "blue_green_deployments" ("environment");
CREATE INDEX IF NOT EXISTS "blue_green_deployments_state_idx" ON "blue_green_deployments" ("state");
CREATE INDEX IF NOT EXISTS "blue_green_deployments_blue_release_id_idx" ON "blue_green_deployments" ("blue_release_id");
CREATE INDEX IF NOT EXISTS "blue_green_deployments_green_release_id_idx" ON "blue_green_deployments" ("green_release_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- rollback_requests — governed rollback
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "rollback_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "release_id" text NOT NULL,
  "target_release_id" text NOT NULL,
  "type" text NOT NULL,
  "reason" text NOT NULL,
  "actor_id" text NOT NULL,
  "actor_type" text NOT NULL,
  "compatibility_checked" boolean NOT NULL DEFAULT false,
  "authorized" boolean NOT NULL DEFAULT false,
  "evidence" jsonb,
  "correlation_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rollback_requests_type_check" CHECK ("type" IN ('APPLICATION','DATABASE','TRAFFIC')),
  CONSTRAINT "rollback_requests_actor_type_check" CHECK ("actor_type" IN ('HUMAN','SERVICE'))
);

CREATE INDEX IF NOT EXISTS "rollback_requests_release_id_idx" ON "rollback_requests" ("release_id");
CREATE INDEX IF NOT EXISTS "rollback_requests_target_release_id_idx" ON "rollback_requests" ("target_release_id");
CREATE INDEX IF NOT EXISTS "rollback_requests_type_idx" ON "rollback_requests" ("type");

-- ─────────────────────────────────────────────────────────────────────────────
-- P3 migration integrity note
-- This migration is ADDITIVE (EXPAND) per P2/P3 Expand/Contract policy.
-- No existing table is altered destructively.
-- Checksums for 0000-0045 remain unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
