-- ============================================================================
-- 0069 — Foundation OS: close the foundation_programs Row Level Security gap
-- ============================================================================
--
-- WHAT THIS MIGRATION DOES
--   `foundation_programs` is the canonical Foundation OS program substrate.
--   It is read and written by the Foundation OS request path
--   (src/lib/foundation/service-operations.ts, reports.ts, knowledge-graph.ts)
--   and is the system of record declared for the FOUNDATION_PROGRAM
--   interoperability domain (src/lib/interoperability/domains.ts).
--
--   Until this migration it was the ONLY Foundation OS substrate with no Row
--   Level Security at all: the other 39 Foundation tables created by 0035 each
--   carry `ENABLE ROW LEVEL SECURITY` plus a `<table>_tenant_isolation` policy.
--   `foundation_programs` was created by the 0000 kernel baseline, before the
--   RLS hardening wave, and 0035's RLS block enumerated only the tables it
--   created — so the pre-existing program table was never covered.
--
-- WHY IT MATTERS (measured, not inferred)
--   Against a freshly migrated database, connecting as the NON-SUPERUSER,
--   NOBYPASSRLS runtime role (`beyu_runtime`) and setting a FOREIGN tenant
--   context returned every Foundation program row:
--
--     ctx="TEN_BEYU_FOUNDATION"  foundation_programs rows=3   foundations rows=1
--     ctx="TEN_BEYU_TZ"          foundation_programs rows=3   foundations rows=0
--     ctx="TEN_FOREIGN_XYZ"      foundation_programs rows=3   foundations rows=0
--     ctx=""                     foundation_programs rows=3   foundations rows=0
--
--   `foundations` correctly returned 0 rows for the foreign and empty contexts;
--   `foundation_programs` returned all rows for every context, including none.
--
--   The application layer filters on tenant_id today
--   (`where(inArray(foundationPrograms.tenantId, scope))`), so this is not a
--   live cross-tenant read through the API. It is the loss of the defence in
--   depth that every other Foundation table has: RLS exists precisely so that a
--   single missing WHERE clause in a future Foundation query cannot become a
--   cross-tenant disclosure. That guarantee was absent here.
--
-- SCOPE AND SAFETY
--   * EXPAND-ONLY. One policy, one index, one grant assertion. No column is
--     dropped, narrowed or rewritten; no data is touched.
--   * The policy is byte-for-byte the canonical Foundation OS predicate used by
--     migration 0035 for all 39 sibling tables:
--         USING (tenant_id = ANY (beyu_tenant_ids()))
--     WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--     This module introduces no new authorization model — it inherits the
--     existing `beyu_tenant_ids()` primitive, so a change to that primitive
--     changes this table and its 39 siblings at once.
--   * FORCE ROW LEVEL SECURITY is deliberately NOT applied. Neither is it
--     applied to any of the 39 Foundation tables from 0035, and the bootstrap
--     seed (src/db/seed.ts) writes Foundation program rows through the admin
--     connection without a tenant GUC. Forcing RLS on the owner would break
--     `npm run seed`. This migration keeps Foundation OS internally consistent.
--   * The runtime-role GRANT is asserted, not assumed: a fresh install applies
--     migrations BEFORE `scripts/setup-db-role.ts` runs, exactly as CI does.
--     The grant is conditional on the role existing, matching 0035 and 0068, so
--     this migration is safe on a database where the role is not yet created.
--   * The supporting tenant index is additive. Every sibling Foundation table
--     carries a `*_tenant_idx`; `foundation_programs` had only its primary key,
--     while both the RLS predicate and every service query filter on tenant_id.
-- ============================================================================

ALTER TABLE foundation_programs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS foundation_programs_tenant_isolation ON foundation_programs;
--> statement-breakpoint
CREATE POLICY foundation_programs_tenant_isolation ON foundation_programs
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint

-- The RLS predicate and every Foundation program query filter on tenant_id, so
-- the table needs the same tenant index its 39 siblings already carry.
CREATE INDEX IF NOT EXISTS foundation_programs_tenant_idx ON foundation_programs (tenant_id);
--> statement-breakpoint

-- Assert the runtime role can still use the table on a fresh install, where
-- migrations run before scripts/setup-db-role.ts provisions the role's grants.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'foundation_programs', r.rolname);
    RAISE NOTICE 'granted foundation_programs DML to %', r.rolname;
  END LOOP;
END
$$;
--> statement-breakpoint

-- Verification. This migration fails closed: if the policy is absent, or if it
-- was created without the canonical predicate, the migration aborts rather than
-- leaving Foundation OS with a table that merely looks protected.
DO $$
DECLARE
  rls_count int;
  policy_count int;
BEGIN
  SELECT count(*) INTO rls_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'foundation_programs'
    AND c.relrowsecurity;
  IF rls_count <> 1 THEN
    RAISE EXCEPTION 'Migration 0069 verification failed: foundation_programs does not have ROW LEVEL SECURITY enabled';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'foundation_programs'
    AND policyname = 'foundation_programs_tenant_isolation'
    AND qual LIKE '%beyu_tenant_ids()%'
    AND with_check LIKE '%beyu_tenant_ids()%';
  IF policy_count <> 1 THEN
    RAISE EXCEPTION 'Migration 0069 verification failed: foundation_programs must carry the canonical beyu_tenant_ids() isolation policy (USING and WITH CHECK)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'foundation_programs'
      AND indexname = 'foundation_programs_tenant_idx'
  ) THEN
    RAISE EXCEPTION 'Migration 0069 verification failed: foundation_programs_tenant_idx was not created';
  END IF;
END
$$;
