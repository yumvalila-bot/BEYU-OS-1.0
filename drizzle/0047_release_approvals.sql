-- BEYU OS — P4 Release Approvals (canonical, additive, expand-only)
--
-- Adds the governed release-approval instrument required by the release control
-- plane (docs/architecture/RELEASE_APPROVALS.md):
--
--   PROMOTED / SWITCHED / CONTRACTED release transitions require an explicit,
--   attributable approval that is distinct from the actor performing the
--   transition (four-eyes separation). Approval is EVIDENCE, never a grant of
--   authorization by itself: the actor still needs RBAC (platform:config.manage),
--   the state machine still enforces DEPLOYED ≠ VERIFIED ≠ PROMOTED, and
--   PostgreSQL RLS remains the final data-isolation boundary.
--
-- Also grants the canonical runtime role the minimal DML it needs on the
-- release-governance tables created by 0046 (which granted nothing). Without
-- these grants the release APIs would have to bypass the runtime role to
-- persist governed state — which is forbidden. The grant direction is the
-- safe one: append-mostly operational evidence tables, no DDL, no governance
-- registry write access (the F-01 protection from 0030 is untouched).
--
-- No destructive change. No historical migration is modified.
-- Checksums for 0000-0046 remain unchanged.

-- ─────────────────────────────────────────────────────────────────────────────
-- release_approvals — four-eyes approval evidence for controlled transitions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "release_approvals" (
  "id" text PRIMARY KEY NOT NULL,
  "release_id" text NOT NULL REFERENCES "release_records"("release_id") ON DELETE CASCADE,
  "environment" text NOT NULL,
  -- What the approval authorizes: a deployment, a promotion/switch, or a rollback.
  "scope" text NOT NULL,
  -- APPROVED = active approval; REVOKED = withdrawn before use; REJECTED = explicit denial record.
  "decision" text NOT NULL,
  "approver_id" text NOT NULL,
  "approver_type" text NOT NULL,
  -- Mandatory human justification. The check constraint keeps it non-empty.
  "justification" text NOT NULL,
  "evidence" jsonb,
  -- Optional time bound. An expired approval no longer satisfies a transition.
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "release_approvals_scope_check" CHECK ("scope" IN ('DEPLOY','PROMOTE','ROLLBACK','CONTRACT')),
  CONSTRAINT "release_approvals_decision_check" CHECK ("decision" IN ('APPROVED','REVOKED','REJECTED')),
  CONSTRAINT "release_approvals_approver_type_check" CHECK ("approver_type" IN ('HUMAN','SERVICE','AI','SYSTEM')),
  CONSTRAINT "release_approvals_justification_nonempty" CHECK (length(btrim("justification")) > 0)
);

CREATE INDEX IF NOT EXISTS "release_approvals_release_id_idx" ON "release_approvals" ("release_id");
CREATE INDEX IF NOT EXISTS "release_approvals_scope_idx" ON "release_approvals" ("scope");
CREATE INDEX IF NOT EXISTS "release_approvals_decision_idx" ON "release_approvals" ("decision");
CREATE INDEX IF NOT EXISTS "release_approvals_environment_idx" ON "release_approvals" ("environment");
CREATE INDEX IF NOT EXISTS "release_approvals_created_at_idx" ON "release_approvals" ("created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime-role grants for the release-governance plane
-- ─────────────────────────────────────────────────────────────────────────────
-- release_records / release_transitions / pvg_runs are append-mostly evidence
-- (INSERT + SELECT; identity enrichment UPDATE on release_records). Canary,
-- blue/green, rollback and approvals are stateful instruments (UPDATE allowed).
-- DELETE is granted nowhere: release history is an append-only ledger; the
-- ON DELETE CASCADE from release_records is admin/maintenance territory.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO %I',
      'release_records, release_transitions, pvg_runs, canary_deployments, blue_green_deployments, rollback_requests, release_approvals',
      r.rolname);
    RAISE NOTICE 'granted release-governance DML to %', r.rolname;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification. The migration FAILS if the approvals table is missing or the
-- runtime role cannot insert approval evidence (fail-closed, same pattern as
-- 0044).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  table_exists boolean;
  can_insert boolean;
  r record;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'release_approvals'
  ) INTO table_exists;
  IF NOT table_exists THEN
    RAISE EXCEPTION 'release_approvals table was not created';
  END IF;

  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    SELECT has_table_privilege(r.rolname, 'release_approvals', 'INSERT') INTO can_insert;
    IF NOT can_insert THEN
      RAISE EXCEPTION 'runtime role % cannot insert release approvals — release governance would be unwritable through the canonical boundary', r.rolname;
    END IF;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- P4 migration integrity note
-- ADDITIVE (EXPAND) per P2/P3 Expand/Contract policy. Registered in
-- KNOWN_METADATA_DEBT (integrity.ts) like 0040–0046: no snapshot/journal is
-- synthesised at authoring time; the gap stays explicit and reviewable.
-- ─────────────────────────────────────────────────────────────────────────────
