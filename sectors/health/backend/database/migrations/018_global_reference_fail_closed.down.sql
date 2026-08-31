-- 018_global_reference_fail_closed.down.sql — revert to migration 009 shape.
DROP POLICY IF EXISTS health_compliance_controls_isolation ON health.compliance_controls;
CREATE POLICY health_compliance_controls_isolation ON health.compliance_controls
  USING (current_setting('app.tenant_id', true) IS NOT NULL);

DROP POLICY IF EXISTS health_retention_policies_isolation ON health.retention_policies;
CREATE POLICY health_retention_policies_isolation ON health.retention_policies
  USING (current_setting('app.tenant_id', true) IS NOT NULL)
  WITH CHECK (current_setting('app.tenant_id', true) IS NOT NULL);

DROP POLICY IF EXISTS health_clinical_guidelines_isolation ON health.clinical_guidelines;
CREATE POLICY health_clinical_guidelines_isolation ON health.clinical_guidelines
  USING (current_setting('app.tenant_id', true) IS NOT NULL)
  WITH CHECK (current_setting('app.tenant_id', true) IS NOT NULL);
