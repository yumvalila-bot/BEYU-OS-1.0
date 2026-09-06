-- 0024 — BEYU Noelia Phase 2: governed runtime model execution attribution.
--
-- This migration is ADDITIVE.
--
-- Changes:
--   * ai_decisions records the routed model, provider, model kind, request id
--     and routing decision id so actual execution attribution is auditable.
--   * The deterministic BEYU analyst is explicitly classified as a
--     DETERMINISTIC_ANALYST runtime (never a foundation/generative model) and
--     remains eligible across the internal BEYU-controlled boundary so the
--     routed control-plane execution does not silently deny governed users.
--     This is capability metadata, not an authority grant.
--
-- No external provider is created or invoked.

ALTER TABLE "ai_decisions" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD COLUMN "model_kind" text;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD COLUMN "routing_decision_id" text;--> statement-breakpoint
CREATE INDEX "ai_decisions_routing_idx" ON "ai_decisions" ("routing_decision_id");--> statement-breakpoint
CREATE INDEX "ai_decisions_request_idx" ON "ai_decisions" ("request_id");

-- The deterministic controlled-plane analyst is internal, BEYU-owned and never
-- leaves the boundary. HIGHLY_RESTRICTED here means it may be selected for a
-- governed query even when the requesting human's clearance is the highest
-- internal tier; it does NOT mean the analyst can generate or authorise
-- HIGHLY_RESTRICTED outcomes.
UPDATE "model_registry"
SET "max_classification" = 'HIGHLY_RESTRICTED',
    "risk_level" = 'LOW',
    "status" = 'ACTIVE',
    "approval_status" = 'APPROVED',
    "evaluation_status" = 'APPROVED',
    "deployment_type" = 'SELF_HOSTED',
    "data_residency" = 'BEYU_CONTROLLED',
    "model_type" = 'DETERMINISTIC_ANALYST',
    "updated_at" = now()
WHERE "id" = 'MOD_NOELIA_DET';
