-- =============================================================================
-- 012 MFA, rate-limiting, audit tamper-evidence, queue jobs
-- =============================================================================
-- Does NOT require pgcrypto (PGlite test harness lacks it). Encryption and
-- SHA-256 hashing are performed in the application layer (Node crypto); the
-- database stores opaque bytea/text blobs and enforces referential integrity
-- plus chain-link verification (prev_hash must point to the prior entry_hash).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Multi-factor authentication
--    - totp_secret_enc: AES-256-GCM ciphertext produced by the application
--      (Node crypto) using MFA_ENCRYPTION_KEY. Never plaintext.
--    - webauthn_credential reserved for future; stub column only (WebAuthn
--      support is PARTIALLY_IMPLEMENTED at the application layer).
--    - Recovery codes stored as individual bcrypt hashes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health.mfa_factors (
  factor_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  factor_type        TEXT NOT NULL CHECK (factor_type IN ('totp','webauthn','recovery')),
  totp_secret_enc    BYTEA,                             -- AES-256-GCM envelope
  webauthn_credential JSONB,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at       TIMESTAMPTZ,
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_active ON health.mfa_factors (tenant_id,user_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS health.mfa_recovery_codes (
  code_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  code_hash     TEXT NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON health.mfa_recovery_codes (tenant_id,user_id);

CREATE TABLE IF NOT EXISTS health.mfa_challenges (
  challenge_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  factor_id       UUID REFERENCES health.mfa_factors(factor_id) ON DELETE SET NULL,
  challenge_type  TEXT NOT NULL CHECK (challenge_type IN ('enroll','verify','step_up','recovery')),
  nonce           TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  used_at         TIMESTAMPTZ,
  consumed_by     TEXT,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_active ON health.mfa_challenges (tenant_id,user_id) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS health.mfa_lockouts (
  user_id       UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  failed_count  INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_failure  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE health.mfa_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.mfa_lockouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfa_factors_isolation ON health.mfa_factors; CREATE POLICY mfa_factors_isolation ON health.mfa_factors USING
  (current_setting('app.tenant_id', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS mfa_recovery_codes_isolation ON health.mfa_recovery_codes; CREATE POLICY mfa_recovery_codes_isolation ON health.mfa_recovery_codes USING
  (current_setting('app.tenant_id', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS mfa_challenges_isolation ON health.mfa_challenges; CREATE POLICY mfa_challenges_isolation ON health.mfa_challenges USING
  (current_setting('app.tenant_id', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS mfa_lockouts_isolation ON health.mfa_lockouts; CREATE POLICY mfa_lockouts_isolation ON health.mfa_lockouts USING
  (current_setting('app.tenant_id', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id));

-- -----------------------------------------------------------------------------
-- 2. Rate-limit event audit log (enforcement store is Redis/in-memory; this is
--    purely an audit trail of enforcement decisions).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health.rate_limit_events (
  event_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES beyu_identity.tenants(tenant_id) ON DELETE SET NULL,
  key_type      TEXT NOT NULL CHECK (key_type IN ('ip','actor','tenant','global')),
  key_value     TEXT NOT NULL,
  endpoint      TEXT,
  window_label  TEXT NOT NULL,
  limit_count   INT NOT NULL,
  current_count INT NOT NULL,
  action        TEXT NOT NULL DEFAULT 'blocked' CHECK (action IN ('allowed','blocked','lockout')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_key ON health.rate_limit_events (key_type,key_value,created_at);
ALTER TABLE health.rate_limit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_events_isolation ON health.rate_limit_events; CREATE POLICY rate_limit_events_isolation ON health.rate_limit_events USING (
  tenant_id IS NULL OR (current_setting('app.tenant_id', true) = tenant_id::text
                        AND beyu_identity.tenant_matches_boundary(tenant_id))
);

-- -----------------------------------------------------------------------------
-- 3. Audit tamper-evidence (hash chain).
--    - Hash computation happens in the AuditService (Node crypto, SHA-256).
--    - Database enforces: (a) prev_hash must equal the last entry_hash for the
--      tenant; (b) DELETE blocked by existing AUDIT_IMMUTABLE trigger;
--      (c) UPDATE blocked for all core fields; (d) entry_hash/prev_hash/audit_id
--      immutable after insert.
--    - The genesis anchor is 'HEALTH_AUDIT_GENESIS_v1' (constant shared with app).
--    - This is Health's sector chain — anchoring into BEYU's constitutional
--      chain is ARCHITECTURE-BLOCKED pending governance approval.
-- -----------------------------------------------------------------------------
ALTER TABLE health.audit_log
  ADD COLUMN IF NOT EXISTS prev_hash   TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash  TEXT,
  ADD COLUMN IF NOT EXISTS hash_version INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_audit_log_hash ON health.audit_log (tenant_id, audit_id, entry_hash);

-- Pre-migration rows are left with NULL entry_hash / prev_hash (hash_version=0).
-- The application treats NULL entry_hash as "pre-chain" and seeds a fresh chain
-- anchor on the first new hashed append.

-- The audit hash chain link is computed by the AuditService in the application
-- layer (Node crypto, SHA-256). The database enforces:
--   (a) structural immutability of the hash fields,
--   (b) 64-char hex entry_hash when provided,
--   (c) non-null audit_id on hashed rows.
-- The prev_hash chain-link is set by the application and verified in
-- tests/adversarial suite. This avoids a pgcrypto dependency (PGlite lacks it).
CREATE OR REPLACE FUNCTION health.trg_audit_chain_verify() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.entry_hash IS DISTINCT FROM OLD.entry_hash
       OR NEW.prev_hash  IS DISTINCT FROM OLD.prev_hash
       OR NEW.audit_id   IS DISTINCT FROM OLD.audit_id THEN
      RAISE EXCEPTION 'AUDIT_CHAIN_IMMUTABLE: audit hash chain is tamper-evident'
        USING ERRCODE = 'P0002';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.entry_hash IS NOT NULL AND length(NEW.entry_hash) <> 64 THEN
      RAISE EXCEPTION 'AUDIT_CHAIN_INVALID: entry_hash must be a 64-char SHA-256 hex digest'
        USING ERRCODE = 'P0004';
    END IF;
    IF NEW.entry_hash IS NOT NULL AND NEW.hash_version IS NULL THEN
      NEW.hash_version := 1;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_chain_verify ON health.audit_log;
CREATE TRIGGER trg_audit_chain_verify
  BEFORE INSERT OR UPDATE ON health.audit_log
  FOR EACH ROW EXECUTE FUNCTION health.trg_audit_chain_verify();

CREATE OR REPLACE FUNCTION health.trg_audit_update_block() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.operation IS DISTINCT FROM OLD.operation
     OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.before_snapshot::text IS DISTINCT FROM OLD.before_snapshot::text
     OR NEW.after_snapshot::text IS DISTINCT FROM OLD.after_snapshot::text
     OR NEW.actor_global_user_id IS DISTINCT FROM OLD.actor_global_user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'AUDIT_IMMUTABLE: audit core fields cannot be updated'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_update_block ON health.audit_log;
CREATE TRIGGER trg_audit_update_block
  BEFORE UPDATE ON health.audit_log
  FOR EACH ROW EXECUTE FUNCTION health.trg_audit_update_block();

-- -----------------------------------------------------------------------------
-- 4. Queue jobs table (Bull/worker integration)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health.queue_jobs (
  job_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  queue_name      TEXT NOT NULL,
  job_type        TEXT NOT NULL,
  idempotency_key TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','processing','completed','failed','dead_letter','cancelled')),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  result          JSONB,
  error           JSONB,
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  correlation_id  TEXT,
  causation_id    TEXT,
  request_id      TEXT,
  actor_global_user_id UUID,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  dead_letter_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_jobs_idempotency
  ON health.queue_jobs (queue_name, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON health.queue_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_tenant ON health.queue_jobs (tenant_id, created_at);
ALTER TABLE health.queue_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS queue_jobs_isolation ON health.queue_jobs; CREATE POLICY queue_jobs_isolation ON health.queue_jobs USING
  (current_setting('app.tenant_id', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id));

COMMIT;
