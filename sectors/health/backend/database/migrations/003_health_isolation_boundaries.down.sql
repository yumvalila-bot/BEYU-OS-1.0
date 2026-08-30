-- Country/Entity Isolation Boundaries (BEYU OS integration, migration 003 DOWN)
-- Restores the original (imported) tenant-only policies and removes the
-- boundary helper. Run only on disposable instances or pre-linkage data.
--
-- Ordering (final merge-readiness audit fix, 2026-08-30): the upgraded
-- policies reference tenant_matches_boundary(), so the policies MUST be
-- replaced first; DROP FUNCTION runs last. Empirically verified on a real
-- PostgreSQL 18: full 001→002→003 up, then 003→002 down, restores the exact
-- 001 state with the BEYU public schema byte-identical throughout.

DROP POLICY IF EXISTS tenants_isolation ON beyu_identity.tenants;
CREATE POLICY tenants_isolation ON beyu_identity.tenants
  USING (current_setting('app.tenant_id', true) = tenant_id::text);

DROP POLICY IF EXISTS memberships_isolation ON beyu_identity.tenant_memberships;
CREATE POLICY memberships_isolation ON beyu_identity.tenant_memberships
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

DROP POLICY IF EXISTS sessions_isolation ON beyu_identity.sessions;
CREATE POLICY sessions_isolation ON beyu_identity.sessions
  USING (current_setting('app.tenant_id', true) = tenant_id::text);

DROP POLICY IF EXISTS auth_events_isolation ON beyu_identity.auth_events;
CREATE POLICY auth_events_isolation ON beyu_identity.auth_events
  USING (current_setting('app.tenant_id', true) = tenant_id::text);

DROP FUNCTION IF EXISTS beyu_identity.tenant_matches_boundary(uuid);
