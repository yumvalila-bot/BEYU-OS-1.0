-- =============================================================================
-- 013 Transaction envelope + HTTP MFA/CSRF/rate-limit persistence
-- =============================================================================
BEGIN;

-- 1. Tighten health.audit_log: require actor_global_user_id and tenant_id
--    (defense-in-depth; NULL was possible in legacy paths). Apply NOT NULL
--    with safe defaults only for existing rows; new inserts must supply them.
UPDATE health.audit_log SET actor_global_user_id = '00000000-0000-4000-0000-000000000000'::uuid WHERE actor_global_user_id IS NULL;
UPDATE health.audit_log SET tenant_id = (SELECT tenant_id FROM beyu_identity.tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE health.audit_log ALTER COLUMN actor_global_user_id SET NOT NULL;
ALTER TABLE health.audit_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE health.audit_log ALTER COLUMN operation SET NOT NULL;
ALTER TABLE health.audit_log ALTER COLUMN resource_type SET NOT NULL;
ALTER TABLE health.audit_log ALTER COLUMN correlation_id DROP NOT NULL;
ALTER TABLE health.audit_log ALTER COLUMN correlation_id SET DEFAULT NULL;

-- 2. User-level security_version (for session invalidation on credential/MFA change).
ALTER TABLE beyu_identity.users ADD COLUMN IF NOT EXISTS security_version INT NOT NULL DEFAULT 1;
ALTER TABLE beyu_identity.users ADD COLUMN IF NOT EXISTS mfa_enrolled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beyu_identity.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE beyu_identity.users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0;

-- 3. Login failure audit table (separate from mfa_lockouts for password brute-force).
CREATE TABLE IF NOT EXISTS health.login_failures (
  failure_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES beyu_identity.tenants(tenant_id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_failures_email_ip ON health.login_failures (email, ip_address, created_at);
ALTER TABLE health.login_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_failures_isolation ON health.login_failures;
CREATE POLICY login_failures_isolation ON health.login_failures USING (
  tenant_id IS NULL OR (current_setting('app.tenant_id', true) = tenant_id::text
                        AND beyu_identity.tenant_matches_boundary(tenant_id))
);

-- 4. CSRF token table (double-submit tokens bound to session + actor).
CREATE TABLE IF NOT EXISTS health.csrf_tokens (
  token_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  session_id    TEXT NOT NULL,
  token_hash    TEXT NOT NULL,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  bound_ip      INET,
  used_at       TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_csrf_active ON health.csrf_tokens (tenant_id,user_id,session_id) WHERE used_at IS NULL AND revoked_at IS NULL;
ALTER TABLE health.csrf_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS csrf_tokens_isolation ON health.csrf_tokens;
CREATE POLICY csrf_tokens_isolation ON health.csrf_tokens USING (
  current_setting('app.tenant_id', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id)
);

COMMIT;
