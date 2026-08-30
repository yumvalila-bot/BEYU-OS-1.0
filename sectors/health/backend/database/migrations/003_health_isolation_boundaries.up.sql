-- BEYU Health OS — Country/Entity Isolation Boundaries (BEYU OS integration, migration 003 UP)
-- Generated from backend/src/modules/identity/boundary-schema.ts (single source
-- of truth: HEALTH_ISOLATION_BOUNDARIES_SQL). Deterministic, idempotent.
--
-- Upgrades the sector RLS boundary to the canonical BEYU isolation model for
-- tenants LINKED to a canonical BEYU tenant: the context GUCs
-- (app.tenant_id / app.country_code / app.entity_code) must match the tenant's
-- canonical country and entity, or the rows are invisible (fail-closed).
-- Unlinked legacy tenants keep the existing tenant-only boundary — nothing is
-- weakened; linked tenants get a STRICTER boundary.
--
-- tenant_matches_boundary is SECURITY DEFINER and owned by the schema owner
-- (the migration/admin role in production), so the policy subquery reads the
-- tenant attributes without recursive RLS filtering and leaks no data beyond
-- a boolean evaluated against the caller's own session GUCs.

CREATE OR REPLACE FUNCTION beyu_identity.tenant_matches_boundary(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM beyu_identity.tenants t
     WHERE t.tenant_id = p_tenant
       AND (
             t.beyu_tenant_id IS NULL
          OR (t.country_code = current_setting('app.country_code', true)
              AND t.entity_code = current_setting('app.entity_code', true))
       )
  );
$$;

ALTER TABLE beyu_identity.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_isolation ON beyu_identity.tenants;
CREATE POLICY tenants_isolation ON beyu_identity.tenants
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

DROP POLICY IF EXISTS memberships_isolation ON beyu_identity.tenant_memberships;
CREATE POLICY memberships_isolation ON beyu_identity.tenant_memberships
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

DROP POLICY IF EXISTS sessions_isolation ON beyu_identity.sessions;
CREATE POLICY sessions_isolation ON beyu_identity.sessions
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

DROP POLICY IF EXISTS auth_events_isolation ON beyu_identity.auth_events;
CREATE POLICY auth_events_isolation ON beyu_identity.auth_events
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));
