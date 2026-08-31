-- 018_global_reference_fail_closed.up.sql
--
-- Harden the three "global reference" RLS policies introduced in migration 009
-- (compliance_controls, retention_policies, clinical_guidelines).
--
-- The 009 policies used `USING (current_setting('app.tenant_id', true) IS NOT NULL)`.
-- Postgres treats an unset-but-present custom GUC as the empty string '', and
-- `'' IS NOT NULL` is TRUE, so a request with NO tenant context (empty GUC) could
-- read these shared catalogs — a fail-OPEN behaviour inconsistent with the
-- "no-GUC returns zero rows" isolation invariant.
--
-- This migration re-creates the policies to treat an empty GUC as "no context",
-- preserving the intended cross-tenant *read* of these shared reference catalogs
-- (any authenticated tenant may read them) while failing closed for empty context.

DROP POLICY IF EXISTS health_compliance_controls_isolation ON health.compliance_controls;
CREATE POLICY health_compliance_controls_isolation ON health.compliance_controls
  USING (NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS health_retention_policies_isolation ON health.retention_policies;
CREATE POLICY health_retention_policies_isolation ON health.retention_policies
  USING (NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL)
  WITH CHECK (NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS health_clinical_guidelines_isolation ON health.clinical_guidelines;
CREATE POLICY health_clinical_guidelines_isolation ON health.clinical_guidelines
  USING (NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL)
  WITH CHECK (NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL);
