-- ---------------------------------------------------------------------------
-- 0019_rls_gap_closure.sql
--
-- Hardening: close the residual Row Level Security gap on tenant-scoped tables.
--
-- Migration 0001 (kernel gate 1) enabled RLS on a subset of high-value tables
-- and the Noelia migrations (0014–0018) added RLS for the intelligence stack,
-- but 31 tenant-scoped tables (including core governance tables such as
-- resolutions, role_assignments, tasks, strategic_objectives and the Finance
-- journal/ledger tables) were left without RLS. Because the runtime
-- role (`beyu_runtime`) is NOT a superuser and has BYPASSRLS unset, RLS is
-- enforced by PostgreSQL itself — but only for tables where RLS is enabled.
-- Without RLS, any SQL that omits a tenant WHERE clause (or where the clause
-- is accidentally removed during refactoring) can read and write across
-- tenant boundaries. That defeats defense-in-depth.
--
-- This migration enables RLS + FORCE RLS on every table that carries a
-- `tenant_id` column and attaches a tenant-isolation policy using the
-- existing `beyu_tenant_ids()` / `beyu_global_scope()` helpers (same shape as
-- 0001). The policies are permissive for the `beyu_global_scope() = on`
-- bootstrap/system path used by migrations, seeds and global-governance
-- principals whose resolved scope includes the enterprise subtree — this is
-- identical to the existing 0001 semantics and does not change the
-- application's access model. It only adds the database-level enforcement
-- that was missing.
--
-- NOTE on idempotency_records: the idempotency table is intentionally tenant
-- scoped (it already carries tenant_id) but historically rows have been
-- written without an explicit GUC. The application path now always runs under
-- a `withTenantDatabaseContext` transaction, so new rows will be visible to
-- the principal that created them; existing seed rows with a tenant_id will
-- be visible to that tenant's scope.
-- ---------------------------------------------------------------------------

-- Helper: enable RLS, force it, and install the standard tenant-isolation
-- policy for one table. We drop/recreate so this migration is idempotent.
--> statement-breakpoint
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'ai_decisions',
    'anomaly_signals',
    'beneficiaries',
    'compliance_assessments',
    'consents',
    'controls',
    'delegations',
    'emergency_access_grants',
    'entity_appointments',
    'family_members',
    'family_vault_items',
    'foundation_programs',
    'governance_bodies',
    'idempotency_records',
    'integrations',
    'journal_entries',
    'ledger_accounts',
    'legal_matters',
    'notifications',
    'org_units',
    'positions',
    'resolutions',
    'role_assignments',
    'sector_metrics',
    'sessions',
    'strategic_objectives',
    'tasks',
    'tax_strategy_assessments',
    'waterfall_runs',
    'workflow_instances',
    'workforce_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- drop first (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;--> statement-breakpoint

-- The `policies` table is a special case: existing rows have tenant_id NULL
-- because policies are constitutional / OS-wide reference data. RLS with the
-- standard predicate would hide all of them. We enable RLS but allow read
-- access globally (any scope sees all policies, consistent with how the
-- authorization layer resolves policies as OS canon), while restricting
-- writes to the global-scope/system path (bootstrap / migration / platform
-- admin). This matches the existing application behavior — policies are read
-- by every request and only ever mutated through governance procedures.
--> statement-breakpoint
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE policies FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS policies_tenant_isolation ON policies;--> statement-breakpoint
CREATE POLICY policies_tenant_isolation_select ON policies FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY policies_tenant_isolation_write ON policies FOR INSERT WITH CHECK (beyu_global_scope());--> statement-breakpoint
CREATE POLICY policies_tenant_isolation_update ON policies FOR UPDATE USING (beyu_global_scope()) WITH CHECK (beyu_global_scope());--> statement-breakpoint
CREATE POLICY policies_tenant_isolation_delete ON policies FOR DELETE USING (beyu_global_scope());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Grant execute on the RLS helper functions to public (runtime role). The
-- functions already exist (created in 0001) but in some fresh-provisioning
-- paths they have been observed to be owned by postgres without PUBLIC
-- execute. Explicitly granting removes any ambient dependency on the
-- bootstrap role's search path.
-- ---------------------------------------------------------------------------
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION beyu_tenant_ids() TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION beyu_global_scope() TO PUBLIC;--> statement-breakpoint
