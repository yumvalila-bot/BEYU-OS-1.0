-- 0025 — BEYU Noelia Phase 3: model/provider lifecycle, provenance & supply chain.
--
-- This migration is ADDITIVE and does not weaken existing controls.
--
-- Changes:
--   * model_registry gains authoritative lifecycle / provenance / verification /
--     risk status so a registered model can never be treated as active purely
--     because a row exists.
--   * noelia_providers gains a lifecycle status so external providers are
--     treated as suppliers rather than automatic activation grants.
--   * New append-only governance tables record model lifecycle events, model
--     provenance, verifiable model artifacts and provider onboarding events.
--   * The pre-existing BEYU-controlled deterministic analyst is recorded as a
--     baseline ACTIVE control-plane runtime with its governance chain. It is
--     NOT generative inference and never becomes one by this migration.
--
-- No credentials, endpoint secrets, private keys or external provider
-- authorization are introduced here.

ALTER TABLE "model_registry" ADD COLUMN "lifecycle_status" text DEFAULT 'REGISTERED' NOT NULL;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "provenance_status" text DEFAULT 'EVIDENCE_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "verification_status" text DEFAULT 'NOT_VERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "model_registry" ADD COLUMN "risk_status" text DEFAULT 'NOT_ASSESSED' NOT NULL;--> statement-breakpoint
ALTER TABLE "noelia_providers" ADD COLUMN "lifecycle_status" text DEFAULT 'REGISTERED' NOT NULL;--> statement-breakpoint

CREATE TABLE "noelia_model_lifecycle_events" (
  "id" text PRIMARY KEY NOT NULL,
  "model_id" text NOT NULL REFERENCES "model_registry"("id"),
  "model_version" text NOT NULL,
  "provider_id" text REFERENCES "noelia_providers"("id"),
  "lifecycle_state" text NOT NULL,
  "previous_state" text,
  "reason" text NOT NULL,
  "actor" text NOT NULL,
  "request_id" text,
  "trace_id" text,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
);--> statement-breakpoint
CREATE INDEX "noelia_model_lifecycle_model_idx" ON "noelia_model_lifecycle_events" ("model_id","model_version");--> statement-breakpoint
CREATE INDEX "noelia_model_lifecycle_state_idx" ON "noelia_model_lifecycle_events" ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "noelia_model_lifecycle_request_idx" ON "noelia_model_lifecycle_events" ("request_id");--> statement-breakpoint

CREATE TABLE "noelia_model_provenance" (
  "id" text PRIMARY KEY NOT NULL,
  "model_id" text NOT NULL REFERENCES "model_registry"("id"),
  "model_version" text NOT NULL,
  "provider_id" text REFERENCES "noelia_providers"("id"),
  "origin" text NOT NULL,
  "publisher" text NOT NULL,
  "family" text,
  "artifact_identity" text,
  "checksum" text,
  "license" text,
  "source_uri" text,
  "deployment" text NOT NULL DEFAULT 'SELF_HOSTED',
  "transformation" text NOT NULL DEFAULT 'NONE',
  "base_model_id" text,
  "base_model_version" text,
  "fine_tune" text,
  "quantization" text,
  "adapter_lineage" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verification_status" text NOT NULL DEFAULT 'NOT_VERIFIED',
  "verified_at" timestamptz,
  "verifier" text,
  "supply_chain_notes" text,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_model_provenance_model_version_uidx" ON "noelia_model_provenance" ("model_id","model_version");--> statement-breakpoint
CREATE INDEX "noelia_model_provenance_verification_idx" ON "noelia_model_provenance" ("verification_status");--> statement-breakpoint

CREATE TABLE "noelia_model_artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "model_id" text NOT NULL REFERENCES "model_registry"("id"),
  "model_version" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'WEIGHTS',
  "uri" text NOT NULL,
  "checksum" text NOT NULL,
  "size_bytes" integer,
  "license" text,
  "verified_at" timestamptz,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_model_artifacts_model_version_checksum_uidx" ON "noelia_model_artifacts" ("model_id","model_version","checksum");--> statement-breakpoint
CREATE INDEX "noelia_model_artifacts_model_idx" ON "noelia_model_artifacts" ("model_id","model_version");--> statement-breakpoint

CREATE TABLE "noelia_provider_lifecycle_events" (
  "id" text PRIMARY KEY NOT NULL,
  "provider_id" text NOT NULL REFERENCES "noelia_providers"("id"),
  "lifecycle_state" text NOT NULL,
  "previous_state" text,
  "reason" text NOT NULL,
  "actor" text NOT NULL,
  "request_id" text,
  "trace_id" text,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
);--> statement-breakpoint
CREATE INDEX "noelia_provider_lifecycle_provider_idx" ON "noelia_provider_lifecycle_events" ("provider_id");--> statement-breakpoint
CREATE INDEX "noelia_provider_lifecycle_state_idx" ON "noelia_provider_lifecycle_events" ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "noelia_provider_lifecycle_request_idx" ON "noelia_provider_lifecycle_events" ("request_id");--> statement-breakpoint

-- Baseline the existing BEYU-controlled deterministic analyst. This control-plane
-- runtime was created as BEYU-owned internal code; it is recorded with an explicit
-- BEYU origin and is never presented as external or generative.
UPDATE "model_registry"
SET "lifecycle_status" = 'ACTIVE',
    "provenance_status" = 'BEYU_CONTROLLED_INTERNAL',
    "verification_status" = 'PARTIAL',
    "risk_status" = 'LOW',
    "updated_at" = now()
WHERE "id" = 'MOD_NOELIA_DET';--> statement-breakpoint

UPDATE "noelia_providers"
SET "lifecycle_status" = 'ACTIVATED'
WHERE "id" = 'PROV_NOELIA_DET';--> statement-breakpoint

INSERT INTO "noelia_model_lifecycle_events" ("id","model_id","model_version","provider_id","lifecycle_state","previous_state","reason","actor","request_id","trace_id","created_by","payload")
VALUES
  ('MLC_BASELINE_REGISTERED','MOD_NOELIA_DET','2026.09','PROV_NOELIA_DET','REGISTERED',NULL,'Phase 2 baseline BEYU-controlled deterministic analyst registered.','SYSTEM','REQ_PHASE2_BASELINE','TRACE_PHASE2_BASELINE','NOELIA','{"baseline":true,"generativeInference":false}'::jsonb),
  ('MLC_BASELINE_EVALUATED','MOD_NOELIA_DET','2026.09','PROV_NOELIA_DET','EVALUATED','REGISTERED','Deterministic control-plane validation evaluated in the Phase 2 governed pipeline.','SYSTEM','REQ_PHASE2_BASELINE','TRACE_PHASE2_BASELINE','NOELIA','{"baseline":true,"generativeInference":false}'::jsonb),
  ('MLC_BASELINE_APPROVED','MOD_NOELIA_DET','2026.09','PROV_NOELIA_DET','APPROVED','EVALUATED','Approved as a BEYU-internal deterministic runtime; not a generative model.','SYSTEM','REQ_PHASE2_BASELINE','TRACE_PHASE2_BASELINE','NOELIA','{"baseline":true,"generativeInference":false}'::jsonb),
  ('MLC_BASELINE_ACTIVE','MOD_NOELIA_DET','2026.09','PROV_NOELIA_DET','ACTIVE','APPROVED','Activated for governed deterministic control-plane execution only.','SYSTEM','REQ_PHASE2_BASELINE','TRACE_PHASE2_BASELINE','NOELIA','{"baseline":true,"generativeInference":false}'::jsonb)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "noelia_provider_lifecycle_events" ("id","provider_id","lifecycle_state","previous_state","reason","actor","request_id","trace_id","created_by","payload")
VALUES
  ('PLC_BASELINE_REGISTERED','PROV_NOELIA_DET','REGISTERED',NULL,'Phase 2 deterministic BEYU analyst provider registered.','SYSTEM','REQ_PHASE2_BASELINE','TRACE_PHASE2_BASELINE','NOELIA','{"baseline":true}'::jsonb),
  ('PLC_BASELINE_ACTIVATED','PROV_NOELIA_DET','ACTIVATED','REGISTERED','Activated as the BEYU-owned deterministic control-plane runtime.','SYSTEM','REQ_PHASE2_BASELINE','TRACE_PHASE2_BASELINE','NOELIA','{"baseline":true,"generativeInference":false}'::jsonb)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "noelia_model_provenance" ("id","model_id","model_version","provider_id","origin","publisher","family","artifact_identity","checksum","license","source_uri","deployment","transformation","verification_status","verifier","supply_chain_notes","created_by")
VALUES
  ('MPV_BASELINE_DET','MOD_NOELIA_DET','2026.09','PROV_NOELIA_DET','BEYU_INTERNAL','BEYU OS Noelia HIVE','beyu-hive-deterministic-analyst','beyu-hive-deterministic-analyst:2026.09','BEYU_CONTROLLED_BASELINE','BEYU-INTERNAL-LICENSE','src/lib/noelia/model-provider.ts','SELF_HOSTED','NONE','PARTIAL','BEYU PLATFORM ENGINEERING','Internal controlled-plane runtime built from repository source; no external provider artifact.','NOELIA')
ON CONFLICT ("model_id","model_version") DO NOTHING;
