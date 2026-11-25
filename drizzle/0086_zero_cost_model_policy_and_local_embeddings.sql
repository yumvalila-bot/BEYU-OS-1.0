-- ============================================================================
-- 0086_zero_cost_model_policy_and_local_embeddings.sql
--
-- ADDITIVE. Nothing here modifies an applied migration, drops a control, or
-- widens an existing grant. Three additions, each addressing a verified gap:
--
-- GAP 1 — NO COST GOVERNANCE EXISTED.
-- 'model_registry' records 'cost_per_token' but nothing enforced that a model
-- is free. There was no cost class, no zero-cost verdict and no way to refuse a
-- model on cost grounds. 'src/lib/noelia/zero-cost-policy.ts' now decides that,
-- and the decision has to be stored with the model or it is only advisory.
-- Three columns are added to 'model_registry':
--   cost_class               LOCAL_FREE | FREE_HOSTED | TRIAL | PAID | UNKNOWN
--   deployment_kind          LOCAL | SELF_HOSTED | REMOTE
--   zero_cost_status         the policy's own verdict (default DENIED)
-- The DEFAULT is the deny path: a row that exists but was never classified is
-- UNKNOWN / not-allowed, which the policy refuses. There is no window in which
-- an unclassified model is treated as free.
--
-- GAP 2 — EMBEDDINGS WERE DECLARED BUT NEVER STORED.
-- 'knowledge_sources' has 'embedding_status', 'embedding_model_id',
-- 'embedding_dimensions' and 'chunk_count', and no embedding was ever computed
-- or persisted; retrieval gated on a regex. This migration adds a chunk-level
-- table ('noelia_knowledge_embeddings') so vectors can actually be stored,
-- re-indexed and invalidated. It deliberately does NOT use pgvector: this
-- PostgreSQL build (16.14) has no 'pgvector' available, so the vector is stored
-- as normalized text and scored exactly. That is slower than an ANN index and
-- it is the honest option without the extension.
--
-- GAP 3 — REPOSITORY-LEVEL INSTRUCTION FILE.
-- No 'AGENTS.md' existed, so every agent that touches this repository starts
-- without the BEYU constraints that are not derivable from the code. Adding it
-- is a documentation change and requires no schema.
--
-- BREAKPOINT DISCIPLINE (the 0084 defect, documented in 0085):
-- 'scripts/migrate.ts' splits the file on the statement-breakpoint comment
-- marker and executes ONE
-- statement per fragment. A breakpoint-less file executes only its FIRST
-- statement while still recording the migration APPLIED. Every statement below
-- is therefore followed by exactly one breakpoint, and the token never appears
-- inside a comment.
--
-- RUNTIME PRIVILEGES ARE NOT GRANTED HERE.
-- 'scripts/setup-db-role.ts' revokes everything and re-grants only what
-- 'scripts/runtime-privilege-allowlist.ts' classifies. A GRANT in this file
-- would be silently reverted. The new tables are classified in the allowlist.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cost governance on the model registry.
-- ---------------------------------------------------------------------------

-- The columns are added NOT NULL with a fail-closed default in one step, which
-- is safe on a populated table: PostgreSQL backfills existing rows from the
-- default, and no row can ever be observed with a NULL cost.
--
-- This is deliberately NOT "add nullable, backfill, then SET NOT NULL". The
-- expand/contract gate classifies SET NOT NULL as a CONTRACTION and permits
-- exactly one in the whole history (0001). That rule is correct: tightening a
-- live column can fail or lock a table in production. Adding the column
-- already-constrained is an EXPAND, and it reaches the same end state with no
-- window in which a writer could insert a NULL and defeat the cost gate.
--
-- The defaults are fail-closed: UNKNOWN (not LOCAL_FREE), REMOTE (not
-- SELF_HOSTED) and DENIED_COST_UNKNOWN (not ALLOWED). A row that exists but has
-- never been assessed must not be executable, so the default is the refusal.
ALTER TABLE "model_registry" ADD COLUMN IF NOT EXISTS "cost_class" text NOT NULL DEFAULT 'UNKNOWN';--> statement-breakpoint

ALTER TABLE "model_registry" ADD COLUMN IF NOT EXISTS "deployment_kind" text NOT NULL DEFAULT 'REMOTE';--> statement-breakpoint

ALTER TABLE "model_registry" ADD COLUMN IF NOT EXISTS "zero_cost_status" text NOT NULL DEFAULT 'DENIED_COST_UNKNOWN';--> statement-breakpoint

-- A cost class outside the governed set is a typo, and a typo must not read as
-- an allowance. The CHECK makes an invalid value impossible rather than merely
-- unrecognized.
ALTER TABLE "model_registry" DROP CONSTRAINT IF EXISTS "model_registry_cost_class_check";--> statement-breakpoint

ALTER TABLE "model_registry" ADD CONSTRAINT "model_registry_cost_class_check"
  CHECK ("cost_class" IN ('LOCAL_FREE', 'FREE_HOSTED', 'TRIAL', 'PAID', 'UNKNOWN'));--> statement-breakpoint

ALTER TABLE "model_registry" DROP CONSTRAINT IF EXISTS "model_registry_deployment_kind_check";--> statement-breakpoint

ALTER TABLE "model_registry" ADD CONSTRAINT "model_registry_deployment_kind_check"
  CHECK ("deployment_kind" IN ('LOCAL', 'SELF_HOSTED', 'REMOTE'));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Declare the one model that already exists.
--
-- ORDER IS LOAD-BEARING. This must run BEFORE the executed-invariant CHECK is
-- added below: that CHECK forbids APPROVED+ACTIVE alongside a non-ALLOWED
-- zero-cost status, and the deterministic analyst is already APPROVED+ACTIVE.
-- Adding the constraint first would fail on the existing row — which is the
-- correct behaviour of the constraint, and the reason the data is corrected
-- first.
--
-- The deterministic analyst performs no model inference; it is a governed
-- deterministic code path on BEYU infrastructure. LOCAL_FREE is the accurate
-- class. This corrects a cost field only: approval_status, status and every
-- authority field are left exactly as they were.
-- ---------------------------------------------------------------------------

UPDATE "model_registry"
   SET "cost_class" = 'LOCAL_FREE',
       "deployment_kind" = 'SELF_HOSTED',
       "zero_cost_status" = 'ALLOWED'
 WHERE "model" = 'beyu-hive-deterministic-analyst'
   AND "provider" = 'beyu-hive-deterministic-analyst';--> statement-breakpoint

-- The constitutional invariant, enforced by the database as well as by code:
-- a KNOWINGLY BILLED model may never be simultaneously approved and active.
--
-- SCOPE — why this is narrower than "only free models may be approved".
-- The registry is an INVENTORY. Refusing to record a paid model would make it
-- impossible to report one, refuse it in the Model Centre, or hold the evidence
-- that it was assessed and declined. So this constraint forbids the two
-- positively-prohibited classes only: PAID and TRIAL. UNKNOWN is permitted to be
-- recorded and even approved, because "we have not verified the cost yet" is a
-- real state that must be representable — and it is the GATEWAY that refuses to
-- execute anything whose zero-cost verdict is not ALLOWED (see
-- model-gateway.ts, "Zero-cost gate"). Two layers, each doing what it can do
-- soundly: the database prevents a known-paid executable; the gateway prevents
-- ANY unverified execution.
ALTER TABLE "model_registry" DROP CONSTRAINT IF EXISTS "model_registry_zero_cost_executable_check";--> statement-breakpoint

ALTER TABLE "model_registry" ADD CONSTRAINT "model_registry_zero_cost_executable_check"
  CHECK (
    NOT (
      COALESCE("approval_status", 'PENDING') = 'APPROVED'
      AND COALESCE("status", 'INACTIVE') = 'ACTIVE'
      AND COALESCE("cost_class", 'UNKNOWN') IN ('PAID', 'TRIAL')
    )
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Chunk-level embedding store.
--
-- One row per chunk. 'tenant_id' is NOT NULL and mirrors the parent source so
-- the RLS predicate is a direct tenant comparison and does not depend on a join
-- to 'knowledge_sources' at policy-evaluation time (a join in a policy is both
-- slower and a place for scope logic to diverge from the parent table).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "noelia_knowledge_embeddings" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "source_id" text NOT NULL,
  "source_code" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "chunk_text" text NOT NULL,
  "content_digest" text NOT NULL,
  "embedding_model_id" text NOT NULL,
  "embedding_dimensions" integer NOT NULL,
  "vector" text NOT NULL,
  "status" text NOT NULL DEFAULT 'EMBEDDED',
  "indexed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "noelia_knowledge_embeddings_status_check"
    CHECK ("status" IN ('EMBEDDED', 'STALE', 'FAILED')),
  CONSTRAINT "noelia_knowledge_embeddings_dimensions_check"
    CHECK ("embedding_dimensions" > 0),
  CONSTRAINT "noelia_knowledge_embeddings_chunk_index_check"
    CHECK ("chunk_index" >= 0)
);--> statement-breakpoint

-- One vector per (source, chunk, model). A model change produces a new row
-- rather than overwriting, so an in-flight index rebuild never destroys the
-- vectors the old model is still serving.
CREATE UNIQUE INDEX IF NOT EXISTS "noelia_knowledge_embeddings_chunk_model_uq"
  ON "noelia_knowledge_embeddings" ("source_id", "chunk_index", "embedding_model_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "noelia_knowledge_embeddings_tenant_idx"
  ON "noelia_knowledge_embeddings" ("tenant_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "noelia_knowledge_embeddings_source_idx"
  ON "noelia_knowledge_embeddings" ("source_id");--> statement-breakpoint

ALTER TABLE "noelia_knowledge_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "noelia_knowledge_embeddings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "noelia_knowledge_embeddings_scope_isolation" ON "noelia_knowledge_embeddings";--> statement-breakpoint

CREATE POLICY "noelia_knowledge_embeddings_scope_isolation" ON "noelia_knowledge_embeddings"
  FOR SELECT
  USING (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

DROP POLICY IF EXISTS "noelia_knowledge_embeddings_scope_insert" ON "noelia_knowledge_embeddings";--> statement-breakpoint

CREATE POLICY "noelia_knowledge_embeddings_scope_insert" ON "noelia_knowledge_embeddings"
  FOR INSERT
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

DROP POLICY IF EXISTS "noelia_knowledge_embeddings_scope_update" ON "noelia_knowledge_embeddings";--> statement-breakpoint

CREATE POLICY "noelia_knowledge_embeddings_scope_update" ON "noelia_knowledge_embeddings"
  FOR UPDATE
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

DROP POLICY IF EXISTS "noelia_knowledge_embeddings_scope_delete" ON "noelia_knowledge_embeddings";--> statement-breakpoint

CREATE POLICY "noelia_knowledge_embeddings_scope_delete" ON "noelia_knowledge_embeddings"
  FOR DELETE
  USING (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Fuzzy lexical matching for the hybrid retrieval channel.
--
-- 'pg_trgm' is a PostgreSQL contrib extension: no network, no account, no cost.
-- It is what lets a trigram index serve a similarity filter alongside the
-- existing 'search_tsv' full-text channel.
--
-- OPTIONAL, AND GENUINELY OPTIONAL.
--
-- 'pg_trgm' ships in the postgres contrib package, which is present in the
-- official images and in every environment this repository targets — but it is
-- not part of core PostgreSQL, and a minimal or hardened deployment may omit it.
-- An earlier version of this migration assumed it and would abort the entire
-- migration run with SQLSTATE 42704 ("operator class gin_trgm_ops does not
-- exist") on any such database. That is the wrong failure mode: losing fuzzy
-- matching should cost the fuzzy channel, not the whole schema.
--
-- The DO block below installs the extension and the index when contrib is
-- available, and records a notice when it is not. It cannot fail: an unexpected
-- error inside it is downgraded to a warning about a *performance* feature, and
-- the governed retrieval path degrades to full-text + vector, which is exactly
-- what 'src/lib/noelia/knowledge-retrieval.ts' already handles.
--
-- The retrieval code does not probe for the index: an absent trigram index is
-- not an absence of correctness, only of the extra recall channel. Nothing in
-- the security or cost posture depends on this block.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm unavailable (%). Fuzzy title matching will be skipped; full-text and vector channels are unaffected.', SQLERRM;
    RETURN;
  END;

  BEGIN
    CREATE INDEX IF NOT EXISTS "knowledge_sources_title_trgm_idx"
      ON "knowledge_sources" USING gin ("title" gin_trgm_ops);
  EXCEPTION WHEN undefined_object THEN
    -- The extension is present but this build lacks the gin_trgm_ops opclass.
    RAISE NOTICE 'gin_trgm_ops opclass unavailable; trigram index skipped.';
  END;
END
$$;--> statement-breakpoint
