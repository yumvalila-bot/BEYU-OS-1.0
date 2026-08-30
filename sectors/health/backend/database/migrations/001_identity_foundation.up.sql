-- BEYU Health OS — Identity Foundation (Phase 1B/1F)
-- Generated from identity-schema.ts (single source of truth). Deterministic, idempotent.
-- Includes: users.security_version (authorization-freshness guard) and Row-Level
-- Security policies on tenant-scoped tables (defense-in-depth for non-owner roles).


CREATE SCHEMA IF NOT EXISTS beyu_identity;

-- ── GLOBAL USER (canonical, tenant-independent identity) ────────────────────
CREATE TABLE IF NOT EXISTS beyu_identity.users (
  global_user_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  display_name     text NOT NULL,
  password_hash    text NOT NULL,
  account_status   text NOT NULL DEFAULT 'active',  -- active | disabled | suspended
  auth_status      text NOT NULL DEFAULT 'none',    -- none | mfa_enrolled | mfa_verified | step_up_required
  security_version integer NOT NULL DEFAULT 0,      -- bumped on disable / role / membership / permission change
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_authenticated_at timestamptz
);

-- ── TENANT ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beyu_identity.tenants (
  tenant_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code  text NOT NULL UNIQUE,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'active',  -- active | suspended | archived
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── TENANT MEMBERSHIP ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beyu_identity.tenant_memberships (
  membership_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_user_id   uuid NOT NULL REFERENCES beyu_identity.users(global_user_id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  role             text NOT NULL,
  status           text NOT NULL DEFAULT 'active',  -- active | suspended | revoked
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (global_user_id, tenant_id)
);

-- ── ROLES / PERMISSIONS (central, not hard-coded in frontend) ──────────────
CREATE TABLE IF NOT EXISTS beyu_identity.roles (
  role_id text PRIMARY KEY,
  label   text NOT NULL,
  cadre   text
);

CREATE TABLE IF NOT EXISTS beyu_identity.permissions (
  permission_id text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS beyu_identity.role_permissions (
  role_id       text NOT NULL REFERENCES beyu_identity.roles(role_id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES beyu_identity.permissions(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ── SESSIONS / REFRESH TOKENS (hash only; rotation + revocation) ────────────
CREATE TABLE IF NOT EXISTS beyu_identity.sessions (
  session_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_user_id     uuid NOT NULL REFERENCES beyu_identity.users(global_user_id) ON DELETE CASCADE,
  tenant_id          uuid REFERENCES beyu_identity.tenants(tenant_id) ON DELETE SET NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  jti                text,
  status             text NOT NULL DEFAULT 'active', -- active | rotated | revoked | expired
  expires_at         timestamptz NOT NULL,
  rotated_from       uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON beyu_identity.sessions(global_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON beyu_identity.sessions(refresh_token_hash);

-- ── AUTH / SECURITY EVENTS (WHO/WHAT/WHEN/TENANT/RESULT/REASON) ──────────────
CREATE TABLE IF NOT EXISTS beyu_identity.auth_events (
  event_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_user_id uuid,
  tenant_id      uuid,
  event_type     text NOT NULL,
  result         text NOT NULL,           -- SUCCESS | FAILURE | DENIED
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- ip, user_agent, reason, jti, …
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON beyu_identity.auth_events(global_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_tenant ON beyu_identity.auth_events(tenant_id, created_at);

-- ── ROW-LEVEL SECURITY (database-boundary defense-in-depth) ──────────────────
-- The application enforces tenant isolation in middleware/guards BEFORE it uses
-- a privileged connection, which (as table owner) BYPASSES RLS by design — this
-- is the "authorization before privileged access" pattern. RLS below provides an
-- additional hard isolation boundary for any NON-OWNER role connecting to the
-- database: such a role can only see/modify rows whose tenant matches the
-- server-set session variable app.tenant_id. This prevents accidental
-- service-role-style bypasses at the data layer.
ALTER TABLE beyu_identity.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_isolation ON beyu_identity.tenants;
CREATE POLICY tenants_isolation ON beyu_identity.tenants
  USING (current_setting('app.tenant_id', true) = tenant_id::text);

ALTER TABLE beyu_identity.tenant_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_isolation ON beyu_identity.tenant_memberships;
CREATE POLICY memberships_isolation ON beyu_identity.tenant_memberships
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

ALTER TABLE beyu_identity.sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_isolation ON beyu_identity.sessions;
CREATE POLICY sessions_isolation ON beyu_identity.sessions
  USING (current_setting('app.tenant_id', true) = tenant_id::text);

ALTER TABLE beyu_identity.auth_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_events_isolation ON beyu_identity.auth_events;
CREATE POLICY auth_events_isolation ON beyu_identity.auth_events
  USING (current_setting('app.tenant_id', true) = tenant_id::text);

-- NOTE: users, roles, permissions and role_permissions are NOT tenant-scoped
-- (users are global identity; roles/permissions are platform reference data) so
-- they intentionally have no tenant RLS policy. Access to them is governed by
-- the application authorization layer only.

-- Seed roles/permissions:
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('trustee', 'Trustee · BEYU Family Trust', 'Constitutional') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('board', 'Board Member · Holding Co.', 'Governance') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('ceo', 'Chief Executive Officer', 'Executive') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('cmo', 'Chief Medical Officer', 'Executive') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('cno', 'Chief Nursing Officer', 'Executive') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('cfo', 'Chief Financial Officer', 'Executive') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('cto', 'Chief Technology Officer', 'Executive') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('cro', 'Chief Risk Officer', 'Executive') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('general-counsel', 'General Counsel', 'Governance') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('doctor', 'Doctor / Clinician', 'Clinical') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('nurse', 'Nurse / Ward Officer', 'Clinical') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('pharmacy', 'Pharmacist', 'Allied') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('pharmacy-chief', 'Chief Pharmacist', 'Allied') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('lab', 'Lab Technologist', 'Allied') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('radiology', 'Radiographer / Radiologist', 'Allied') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('admin', 'Hospital Administrator', 'Operations') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('hr-director', 'HR Director', 'Operations') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('finance', 'Accountant / Finance', 'Operations') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('procurement', 'Procurement Officer', 'Operations') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('ai-safety-officer', 'AI Safety Officer', 'Governance') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('auditor', 'Internal / External Auditor', 'Governance') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('patient', 'Patient (Citizen App)', 'External') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('moh-official', 'MoH Government Official', 'External') ON CONFLICT (role_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('patient:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('patient:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('patient:register') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('phi:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('phi:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('phi:export') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('rx:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('rx:dispense') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('rx:controlled') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('order:lab') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('order:imaging') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('order:procedure') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('note:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('note:sign') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('discharge:approve') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('billing:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('billing:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('claim:submit') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('payment:receive') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('hr:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('hr:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('payroll:run') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('inventory:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('inventory:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('po:approve') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('tenant:switch') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('tenant:admin') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('audit:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('audit:export') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('ai:configure') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('ai:killswitch') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('ai:override') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('rbac:read') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('rbac:write') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('contract:sign') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('contract:anchor') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('board:vote') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('trustee:veto') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('ph:surveillance') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('ph:outbreak-declare') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('breakglass:request') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.permissions (permission_id) VALUES ('breakglass:approve') ON CONFLICT (permission_id) DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'audit:export') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'ai:killswitch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'trustee:veto') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'contract:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'contract:anchor') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'breakglass:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('trustee', 'tenant:switch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'contract:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'board:vote') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'billing:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'tenant:switch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('board', 'ai:configure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'audit:export') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'rbac:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'tenant:switch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'tenant:admin') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'hr:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'hr:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'billing:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'ai:configure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'ai:override') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'breakglass:request') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'breakglass:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ceo', 'contract:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'phi:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'rx:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'rx:controlled') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'note:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'order:lab') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'order:imaging') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'order:procedure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'discharge:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'ai:override') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'ai:configure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cmo', 'breakglass:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'phi:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'note:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'rx:dispense') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cno', 'breakglass:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cfo', 'billing:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cfo', 'billing:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cfo', 'claim:submit') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cfo', 'payment:receive') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cfo', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cto', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cto', 'ai:configure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cto', 'ai:killswitch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cto', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cro', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cro', 'audit:export') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cro', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('cro', 'ai:killswitch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('general-counsel', 'contract:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('general-counsel', 'contract:anchor') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('general-counsel', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('general-counsel', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'patient:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'phi:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'rx:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'order:lab') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'order:imaging') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'order:procedure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'note:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'discharge:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'ai:override') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'breakglass:request') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('doctor', 'tenant:switch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('nurse', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('nurse', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('nurse', 'phi:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('nurse', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('nurse', 'rx:dispense') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('nurse', 'breakglass:request') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy', 'rx:dispense') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy', 'inventory:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy', 'inventory:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'rx:dispense') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'rx:controlled') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'inventory:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'inventory:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'po:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('pharmacy-chief', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('lab', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('lab', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('lab', 'phi:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('lab', 'order:lab') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('lab', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('lab', 'inventory:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('radiology', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('radiology', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('radiology', 'phi:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('radiology', 'order:imaging') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('radiology', 'note:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('radiology', 'note:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'patient:register') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'hr:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'billing:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'tenant:admin') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'inventory:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('admin', 'breakglass:request') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'hr:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'hr:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'payroll:run') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'contract:sign') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('hr-director', 'tenant:switch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('finance', 'billing:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('finance', 'billing:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('finance', 'claim:submit') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('finance', 'payment:receive') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('finance', 'inventory:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('procurement', 'inventory:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('procurement', 'inventory:write') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('procurement', 'po:approve') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ai-safety-officer', 'ai:configure') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ai-safety-officer', 'ai:override') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ai-safety-officer', 'ai:killswitch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ai-safety-officer', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ai-safety-officer', 'audit:export') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('ai-safety-officer', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('auditor', 'audit:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('auditor', 'audit:export') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('auditor', 'rbac:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('auditor', 'billing:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('auditor', 'tenant:switch') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('patient', 'patient:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('patient', 'phi:read') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('moh-official', 'ph:surveillance') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('moh-official', 'ph:outbreak-declare') ON CONFLICT DO NOTHING;
INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('moh-official', 'audit:read') ON CONFLICT DO NOTHING;
