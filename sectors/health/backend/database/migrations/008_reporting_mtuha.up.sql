-- MTUHA reporting records (append-only audit of submissions).
-- This table does not store MTUHA book codes (we refuse to invent official
-- codes — see reporting.service.ts). It stores metadata about each generated
-- or submitted report for auditability.
CREATE TABLE IF NOT EXISTS health.mtuha_reports (
  report_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  book_code       text,        -- set only after operator selects a known book via mapping config
  status          text NOT NULL DEFAULT 'generated', -- generated | submitted | acknowledged | rejected
  file_ref        text,        -- opaque reference to exported artifact
  submitted_at    timestamptz,
  submitted_by    uuid REFERENCES beyu_identity.users(global_user_id),
  acknowledgement jsonb,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (period_end >= period_start),
  CHECK (status IN ('generated','submitted','acknowledged','rejected'))
);
ALTER TABLE health.mtuha_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_mtuha_isolation ON health.mtuha_reports;
CREATE POLICY health_mtuha_isolation ON health.mtuha_reports
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);
CREATE INDEX IF NOT EXISTS idx_mtuha_period ON health.mtuha_reports(tenant_id, period_start, period_end);

-- Integration registry row for MTUHA submission endpoint is not inserted at
-- migration time (tenant-scoped). IntegrationsService.set('mtuha_submission',
-- 'unavailable') will be called on bootstrap per tenant.
