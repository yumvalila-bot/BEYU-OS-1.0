-- 0027 — BEYU Noelia AI Phase 5: production runtime fabric, RAG metadata,
-- observability, continuous evaluation, red-team results and RAG retrieval audit.
--
-- ADDITIVE ONLY. This migration adds no runtime authority, no provider, no
-- model and no inference capability. Generative inference remains
-- BLOCKED/ENVIRONMENT_LIMITED until a real endpoint + credential ref is mounted
-- and an accountable human activates the registry row.
--
-- RLS is enabled on all tenant-scoped Phase 5 tables via the canonical context
-- helpers. No prompts, model outputs, retrieved document content, API keys or
-- passwords are persisted in these tables.

-- 1. Knowledge-fabric metadata on the canonical knowledge source table.
ALTER TABLE "knowledge_sources" ADD COLUMN "content_digest" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "source_type" text NOT NULL DEFAULT 'GOVERNED_DOCUMENT';--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "os_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "embedding_status" text NOT NULL DEFAULT 'NOT_EMBEDDED';--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "embedding_model_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "embedding_dimensions" integer;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "chunk_count" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "last_indexed_at" timestamp with time zone;--> statement-breakpoint

-- 2. AI request telemetry (non-sensitive metadata only).
CREATE TABLE "noelia_ai_telemetry" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "trace_id" text NOT NULL,
  "span_id" text,
  "tenant_id" text REFERENCES "tenants"("id"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "os_id" text,
  "user_id" text NOT NULL,
  "task" text NOT NULL,
  "capability" text NOT NULL,
  "model_id" text REFERENCES "model_registry"("id"),
  "model_version" text,
  "provider_id" text REFERENCES "noelia_providers"("id"),
  "status" text NOT NULL,
  "latency_ms" integer,
  "time_to_first_token_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "total_tokens" integer,
  "estimated_cost_micro_usd" numeric(20,4),
  "safety_blocked" integer NOT NULL DEFAULT 0,
  "safety_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "policy_decision" text,
  "human_approval" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "noelia_ai_telemetry_request_idx" ON "noelia_ai_telemetry" ("request_id");--> statement-breakpoint
CREATE INDEX "noelia_ai_telemetry_trace_idx" ON "noelia_ai_telemetry" ("trace_id");--> statement-breakpoint
CREATE INDEX "noelia_ai_telemetry_tenant_idx" ON "noelia_ai_telemetry" ("tenant_id");--> statement-breakpoint
CREATE INDEX "noelia_ai_telemetry_status_idx" ON "noelia_ai_telemetry" ("status");--> statement-breakpoint

-- 3. Distributed tracing spans.
CREATE TABLE "noelia_ai_spans" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "trace_id" text NOT NULL,
  "parent_span_id" text,
  "span_id" text NOT NULL,
  "operation" text NOT NULL,
  "service" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "status" text NOT NULL DEFAULT 'OK',
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ended_at" timestamp with time zone,
  "duration_ms" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "noelia_ai_spans_trace_idx" ON "noelia_ai_spans" ("trace_id");--> statement-breakpoint
CREATE INDEX "noelia_ai_spans_span_idx" ON "noelia_ai_spans" ("span_id");--> statement-breakpoint
CREATE INDEX "noelia_ai_spans_tenant_idx" ON "noelia_ai_spans" ("tenant_id");--> statement-breakpoint

-- 4. Continuous evaluation runs.
CREATE TABLE "noelia_ai_evaluation_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "run_code" text NOT NULL,
  "task" text NOT NULL,
  "model_id" text REFERENCES "model_registry"("id"),
  "model_version" text,
  "provider_id" text REFERENCES "noelia_providers"("id"),
  "dataset" text NOT NULL,
  "test_suite" text NOT NULL,
  "metric" text NOT NULL,
  "score" text NOT NULL,
  "threshold" text,
  "status" text NOT NULL DEFAULT 'RECORDED',
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "evaluator" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_eval_run_code_uidx" ON "noelia_ai_evaluation_runs" ("run_code");--> statement-breakpoint
CREATE INDEX "noelia_eval_run_model_idx" ON "noelia_ai_evaluation_runs" ("model_id","model_version");--> statement-breakpoint
CREATE INDEX "noelia_eval_run_status_idx" ON "noelia_ai_evaluation_runs" ("status");--> statement-breakpoint
CREATE INDEX "noelia_eval_run_tenant_idx" ON "noelia_ai_evaluation_runs" ("tenant_id");--> statement-breakpoint

-- 5. Red-team/adversarial case results.
CREATE TABLE "noelia_ai_red_team_results" (
  "id" text PRIMARY KEY NOT NULL,
  "result_code" text NOT NULL,
  "case_id" text NOT NULL,
  "category" text NOT NULL,
  "attack_type" text NOT NULL,
  "scenario" text NOT NULL,
  "target" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'MEDIUM',
  "outcome" text NOT NULL DEFAULT 'NOT_APPLICABLE',
  "evidence_ref" text,
  "tested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tested_by" text NOT NULL,
  "owner_role" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "notes" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "noelia_red_team_result_code_uidx" ON "noelia_ai_red_team_results" ("result_code");--> statement-breakpoint
CREATE INDEX "noelia_red_team_case_idx" ON "noelia_ai_red_team_results" ("case_id");--> statement-breakpoint
CREATE INDEX "noelia_red_team_outcome_idx" ON "noelia_ai_red_team_results" ("outcome");--> statement-breakpoint
CREATE INDEX "noelia_red_team_tenant_idx" ON "noelia_ai_red_team_results" ("tenant_id");--> statement-breakpoint

-- 6. RAG retrieval audit (authorization decisions and hash references only).
CREATE TABLE "noelia_rag_retrieval_events" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "trace_id" text NOT NULL,
  "knowledge_id" text,
  "source_code" text NOT NULL,
  "tenant_id" text REFERENCES "tenants"("id"),
  "legal_entity_id" text REFERENCES "legal_entities"("id"),
  "country_code" text REFERENCES "countries"("code"),
  "os_id" text,
  "authorization_decision" text NOT NULL,
  "excerpt_hash" text,
  "retrieval_rank" integer,
  "retrieval_timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "noelia_rag_event_request_idx" ON "noelia_rag_retrieval_events" ("request_id");--> statement-breakpoint
CREATE INDEX "noelia_rag_event_source_idx" ON "noelia_rag_retrieval_events" ("source_code");--> statement-breakpoint
CREATE INDEX "noelia_rag_event_tenant_idx" ON "noelia_rag_retrieval_events" ("tenant_id");--> statement-breakpoint

-- 7. RLS — tenant-scoped Phase 5 tables use the canonical context helpers.
ALTER TABLE "noelia_ai_telemetry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_ai_telemetry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_ai_telemetry_tenant_isolation" ON "noelia_ai_telemetry";--> statement-breakpoint
CREATE POLICY "noelia_ai_telemetry_tenant_isolation" ON "noelia_ai_telemetry"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_ai_spans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_ai_spans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_ai_spans_tenant_isolation" ON "noelia_ai_spans";--> statement-breakpoint
CREATE POLICY "noelia_ai_spans_tenant_isolation" ON "noelia_ai_spans"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_ai_evaluation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_ai_evaluation_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_eval_run_tenant_isolation" ON "noelia_ai_evaluation_runs";--> statement-breakpoint
CREATE POLICY "noelia_eval_run_tenant_isolation" ON "noelia_ai_evaluation_runs"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_ai_red_team_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_ai_red_team_results" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_red_team_tenant_isolation" ON "noelia_ai_red_team_results";--> statement-breakpoint
CREATE POLICY "noelia_red_team_tenant_isolation" ON "noelia_ai_red_team_results"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "noelia_rag_retrieval_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "noelia_rag_retrieval_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "noelia_rag_event_tenant_isolation" ON "noelia_rag_retrieval_events";--> statement-breakpoint
CREATE POLICY "noelia_rag_event_tenant_isolation" ON "noelia_rag_retrieval_events"
  USING ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());
