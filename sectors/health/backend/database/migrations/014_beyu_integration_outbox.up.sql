-- Migration 014: BEYU cross-domain outbox + governance decisions + AI invocations
--
-- Adds:
--   health.beyu_outbox             idempotent outbound event queue for
--                                  Governance/HCM/Finance/Tax/Noelia/HIVE
--   health.governance_decisions    recorded governance decisions (audit)
--   health.ai_invocations          recorded AI invocations + human approval
--
-- All tables are RLS-protected, tenant-isolated, and audit-fail-closed.

-- outbox for cross-domain event delivery (reconciliation-safe)
CREATE TABLE IF NOT EXISTS health.beyu_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     TEXT NOT NULL,
  provider            TEXT NOT NULL,
  action              TEXT NOT NULL,
  actor_global_user_id UUID,
  tenant_id           UUID,
  entity_code         TEXT,
  country_code        TEXT,
  request_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload    JSONB,
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','delivered','failed','blocked')),
  correlation_id      TEXT,
  last_error          TEXT,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_beyu_outbox_idem ON health.beyu_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_beyu_outbox_pending ON health.beyu_outbox (provider, status, created_at)
  WHERE status IN ('pending','failed');

ALTER TABLE health.beyu_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beyu_outbox_isolation ON health.beyu_outbox;
CREATE POLICY beyu_outbox_isolation ON health.beyu_outbox
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION health.trg_beyu_outbox_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_beyu_outbox_touch ON health.beyu_outbox;
CREATE TRIGGER trg_beyu_outbox_touch BEFORE UPDATE ON health.beyu_outbox
  FOR EACH ROW EXECUTE FUNCTION health.trg_beyu_outbox_touch();

-- governance decision audit table
CREATE TABLE IF NOT EXISTS health.governance_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID,
  entity_code         TEXT,
  country_code        TEXT,
  actor_global_user_id UUID,
  action              TEXT NOT NULL,
  resource_type       TEXT,
  resource_id         TEXT,
  risk_level          TEXT NOT NULL,
  decision            TEXT NOT NULL,
  decision_id         TEXT,
  policy_version      TEXT,
  reason_code         TEXT,
  approval_required   BOOLEAN NOT NULL DEFAULT false,
  approver_role       TEXT,
  expires_at          TIMESTAMPTZ,
  correlation_id      TEXT,
  causation_id        TEXT,
  request_id          TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gov_decisions_actor ON health.governance_decisions (actor_global_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_decisions_tenant ON health.governance_decisions (tenant_id, created_at DESC);

ALTER TABLE health.governance_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gov_decisions_isolation ON health.governance_decisions;
CREATE POLICY gov_decisions_isolation ON health.governance_decisions
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- AI invocation audit table (Noelia/HIVE)
CREATE TABLE IF NOT EXISTS health.ai_invocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID,
  entity_code         TEXT,
  country_code        TEXT,
  actor_global_user_id UUID,
  practitioner_id     UUID,
  facility_id         UUID,
  capability          TEXT NOT NULL,
  risk_level          TEXT NOT NULL,
  input_ref           TEXT,
  output_ref          TEXT,
  output_class        TEXT,
  model_provider_id   TEXT,
  model_version       TEXT,
  approval_status     TEXT NOT NULL DEFAULT 'not_required'
                        CHECK (approval_status IN ('pending','approved','rejected','not_required')),
  reviewer_global_user_id UUID,
  blocked             BOOLEAN NOT NULL DEFAULT false,
  failure_reason      TEXT,
  correlation_id      TEXT,
  causation_id        TEXT,
  request_id          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_invocations_actor ON health.ai_invocations (actor_global_user_id, created_at DESC);
ALTER TABLE health.ai_invocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_invocations_isolation ON health.ai_invocations;
CREATE POLICY ai_invocations_isolation ON health.ai_invocations
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Practitioners table: add HCM integration columns idempotently.
ALTER TABLE health.practitioners
  ADD COLUMN IF NOT EXISTS facility_ids UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS cpd_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS supervisor_global_user_id UUID,
  ADD COLUMN IF NOT EXISTS employment_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS employment_end TIMESTAMPTZ;
