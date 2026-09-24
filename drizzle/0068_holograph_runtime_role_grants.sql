-- BEYU OS — Holograph spatial capability: runtime-role table grants (additive).
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Migration 0067 created the four Holograph registries (viz_assets,
-- viz_devices, viz_render_profiles, viz_interactions) with ENABLE + FORCE
-- row-level security and the beyu_tenant_ids() isolation policy, but it
-- carried no table grants. Migration 0062 granted the constrained runtime
-- role (beyu_runtime: NOSUPERUSER NOBYPASSRLS) SELECT/INSERT/UPDATE/DELETE
-- on the ORIGINAL four visualization tables; the application request path
-- runs as that role, so the new tables were unreachable from the app and
-- the governed routes would fail closed with `permission denied` in every
-- environment that enforces real role separation (the adversarial
-- verification gate caught this at the database layer).
--
-- This migration closes the gap with the SAME grant set 0062 used, extended
-- to the four new tables. RLS remains the boundary: the grants are subject
-- to the policies created by 0067 (tenant isolation), and FORCE keeps them
-- in effect even for table owners. Nothing here widens any principal's data
-- scope: a principal still sees only what its beyu_tenant_ids() scope and
-- the service-layer classification/permission checks allow.
--
-- Holograph remains a SHARED BEYU OS CAPABILITY, never an OS. No journal,
-- treasury, ledger or posting state is touched; CAP_POSTING stays LOCKED.

--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON viz_assets, viz_devices, viz_render_profiles, viz_interactions TO %I',
      r.rolname
    );
  END LOOP;
END
$$;

--> statement-breakpoint
-- Verification. The canonical CI ordering provisions the runtime role AFTER
-- the migration run (setup-db-role.ts then grants DML on ALL tables in the
-- schema, so the four new tables are covered there). Environments that
-- provision the role BEFORE migrating (local embedded PostgreSQL) get the
-- grant from the block above — so the check is conditional, matching 0062's
-- silent-when-absent grant semantics:
--   • role EXISTS  → fail closed unless it holds exactly the four DML
--     privileges on each new table;
--   • role ABSENT  → NOTICE only: provisioning owns the grants by design.
DO $$
DECLARE
  tbl TEXT;
  privilege_count INT;
  runtime_role_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_runtime') INTO runtime_role_exists;

  IF runtime_role_exists THEN
    FOREACH tbl IN ARRAY ARRAY['viz_assets','viz_devices','viz_render_profiles','viz_interactions']
    LOOP
      SELECT count(*) INTO privilege_count FROM information_schema.table_privileges tp
        WHERE tp.table_schema = 'public'
          AND tp.table_name = tbl
          AND tp.grantee = 'beyu_runtime'
          AND tp.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');
      IF privilege_count <> 4 THEN
        RAISE EXCEPTION 'Migration 0068 verification failed: beyu_runtime must hold SELECT/INSERT/UPDATE/DELETE on %', tbl;
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'Migration 0068: beyu_runtime not yet provisioned; table grants are owned by the role-provisioning step (setup-db-role.ts).';
  END IF;
END
$$;
