-- Migration 006: Audit ledger (business events) + idempotency ledger.
--
-- Audit rows record every consequential business mutation. They are INSERT
-- ONLY — UPDATE/DELETE are denied for the app role. They are NOT hashed into
-- BEYU OS's constitutional chain; BEYU OS governance may periodically verify
-- them through the governed HIVE boundary, but the health sector does not
-- write into the constitutional chain.
--
-- Idempotency records key client idempotency keys to the resulting resource
-- within a 24-hour window, so safe retries (POST with the same key) return the
-- same outcome instead of double-booking/double-billing.

BEGIN;

CREATE SCHEMA IF NOT EXISTS health;

CREATE TABLE IF NOT EXISTS health.audit_log (
  audit_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code      text,
  country_code     text,
  actor_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id   text,
  causation_id     text,
  request_id       text,
  operation        text NOT NULL,          -- e.g. patient.register, appointment.book
  resource_type    text NOT NULL,
  resource_id      text,
  before_snapshot  jsonb,
  after_snapshot   jsonb,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_service   text NOT NULL DEFAULT 'health-api',
  auth_decision    text NOT NULL DEFAULT 'allowed', -- allowed | denied | breakglass
  result_status    text NOT NULL DEFAULT 'ok',      -- ok | error
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  -- audit log is append-only; no UPDATE/DELETE from the app.
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON health.audit_log(actor_global_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON health.audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON health.audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON health.audit_log(tenant_id, occurred_at DESC);

-- Idempotency ledger.
CREATE TABLE IF NOT EXISTS health.idempotency_ledger (
  ledger_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  idempotency_key  text NOT NULL,
  operation        text NOT NULL,          -- e.g. appointment.book
  resource_type    text NOT NULL,
  resource_id      text,
  response_status  smallint NOT NULL DEFAULT 200,
  response_body    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (tenant_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idem_lookup ON health.idempotency_ledger(tenant_id, operation, idempotency_key);

ALTER TABLE health.audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.idempotency_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_audit_isolation ON health.audit_log;
CREATE POLICY health_audit_isolation ON health.audit_log          USING (beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS health_idempotency_isolation ON health.idempotency_ledger;
CREATE POLICY health_idempotency_isolation ON health.idempotency_ledger USING (beyu_identity.tenant_matches_boundary(tenant_id));

COMMIT;
