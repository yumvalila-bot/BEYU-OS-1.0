-- 019_audit_log_tenant_boundary.down.sql — revert to the migration 006 shape.
--
-- WARNING: this restores a policy that does not consult app.tenant_id, so
-- health.audit_log is once again readable across tenants by any role holding
-- SELECT on it. It exists only to keep the migration pair reversible, as the
-- runner requires; do not apply it to an environment holding real audit data.

DROP POLICY IF EXISTS health_audit_isolation ON health.audit_log;
CREATE POLICY health_audit_isolation ON health.audit_log
  USING (beyu_identity.tenant_matches_boundary(tenant_id));
