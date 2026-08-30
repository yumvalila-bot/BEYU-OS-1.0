/**
 * BEYU Health OS — Persistent Identity Schema (SQL DDL).
 *
 * This is the canonical source of the identity data model. The same DDL is used
 * by:
 *   1. the committed migration scripts (backend/database/migrations/…),
 *   2. `ensureSchema()` invoked by integration tests against a real Postgres
 *      engine (PGlite), and
 *   3. optional boot-time verification.
 *
 * Conceptual entities: user, tenant, tenant_membership, role, permission,
 * role_permission, session (refresh token), auth_event.
 */
export const IDENTITY_SCHEMA_SQL = `
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
`;

/** Seed roles and permissions from the canonical role/permission catalog. */
export function identitySeedSql(): string {
  // All role ids, labels and cadres.
  const roles: Array<[string, string, string]> = [
    ["trustee", "Trustee · BEYU Family Trust", "Constitutional"],
    ["board", "Board Member · Holding Co.", "Governance"],
    ["ceo", "Chief Executive Officer", "Executive"],
    ["cmo", "Chief Medical Officer", "Executive"],
    ["cno", "Chief Nursing Officer", "Executive"],
    ["cfo", "Chief Financial Officer", "Executive"],
    ["cto", "Chief Technology Officer", "Executive"],
    ["cro", "Chief Risk Officer", "Executive"],
    ["general-counsel", "General Counsel", "Governance"],
    ["doctor", "Doctor / Clinician", "Clinical"],
    ["nurse", "Nurse / Ward Officer", "Clinical"],
    ["pharmacy", "Pharmacist", "Allied"],
    ["pharmacy-chief", "Chief Pharmacist", "Allied"],
    ["lab", "Lab Technologist", "Allied"],
    ["radiology", "Radiographer / Radiologist", "Allied"],
    ["admin", "Hospital Administrator", "Operations"],
    ["hr-director", "HR Director", "Operations"],
    ["finance", "Accountant / Finance", "Operations"],
    ["procurement", "Procurement Officer", "Operations"],
    ["ai-safety-officer", "AI Safety Officer", "Governance"],
    ["auditor", "Internal / External Auditor", "Governance"],
    ["patient", "Patient (Citizen App)", "External"],
    ["moh-official", "MoH Government Official", "External"],
  ];

  const permissions: string[] = [
    "patient:read",
    "patient:write",
    "patient:register",
    "phi:read",
    "phi:write",
    "phi:export",
    "rx:write",
    "rx:dispense",
    "rx:controlled",
    "order:lab",
    "order:imaging",
    "order:procedure",
    "note:write",
    "note:sign",
    "discharge:approve",
    "billing:read",
    "billing:write",
    "claim:submit",
    "payment:receive",
    "hr:read",
    "hr:write",
    "payroll:run",
    "inventory:read",
    "inventory:write",
    "po:approve",
    "tenant:switch",
    "tenant:admin",
    "audit:read",
    "audit:export",
    "ai:configure",
    "ai:killswitch",
    "ai:override",
    "rbac:read",
    "rbac:write",
    "contract:sign",
    "contract:anchor",
    "board:vote",
    "trustee:veto",
    "ph:surveillance",
    "ph:outbreak-declare",
    "breakglass:request",
    "breakglass:approve",
  ];

  const rolePermissions: Record<string, string[]> = {
    trustee: [
      "audit:read",
      "audit:export",
      "ai:killswitch",
      "trustee:veto",
      "contract:sign",
      "contract:anchor",
      "rbac:read",
      "breakglass:approve",
      "tenant:switch",
    ],
    board: [
      "audit:read",
      "rbac:read",
      "contract:sign",
      "board:vote",
      "billing:read",
      "tenant:switch",
      "ai:configure",
    ],
    ceo: [
      "audit:read",
      "audit:export",
      "rbac:read",
      "rbac:write",
      "tenant:switch",
      "tenant:admin",
      "hr:read",
      "hr:write",
      "billing:read",
      "ai:configure",
      "ai:override",
      "breakglass:request",
      "breakglass:approve",
      "contract:sign",
    ],
    cmo: [
      "patient:read",
      "phi:read",
      "phi:write",
      "rx:write",
      "rx:controlled",
      "note:write",
      "note:sign",
      "order:lab",
      "order:imaging",
      "order:procedure",
      "discharge:approve",
      "ai:override",
      "ai:configure",
      "audit:read",
      "breakglass:approve",
    ],
    cno: [
      "patient:read",
      "phi:read",
      "phi:write",
      "note:write",
      "note:sign",
      "rx:dispense",
      "breakglass:approve",
    ],
    cfo: [
      "billing:read",
      "billing:write",
      "claim:submit",
      "payment:receive",
      "audit:read",
    ],
    cto: ["audit:read", "ai:configure", "ai:killswitch", "rbac:read"],
    cro: ["audit:read", "audit:export", "rbac:read", "ai:killswitch"],
    "general-counsel": [
      "contract:sign",
      "contract:anchor",
      "audit:read",
      "rbac:read",
    ],
    doctor: [
      "patient:read",
      "patient:write",
      "phi:read",
      "phi:write",
      "rx:write",
      "order:lab",
      "order:imaging",
      "order:procedure",
      "note:write",
      "note:sign",
      "discharge:approve",
      "ai:override",
      "breakglass:request",
      "tenant:switch",
    ],
    nurse: [
      "patient:read",
      "phi:read",
      "phi:write",
      "note:write",
      "rx:dispense",
      "breakglass:request",
    ],
    pharmacy: [
      "patient:read",
      "phi:read",
      "rx:dispense",
      "inventory:read",
      "inventory:write",
      "note:write",
    ],
    "pharmacy-chief": [
      "patient:read",
      "phi:read",
      "rx:dispense",
      "rx:controlled",
      "inventory:read",
      "inventory:write",
      "po:approve",
      "note:write",
      "audit:read",
    ],
    lab: [
      "patient:read",
      "phi:read",
      "phi:write",
      "order:lab",
      "note:write",
      "inventory:read",
    ],
    radiology: [
      "patient:read",
      "phi:read",
      "phi:write",
      "order:imaging",
      "note:write",
      "note:sign",
    ],
    admin: [
      "patient:register",
      "hr:read",
      "billing:read",
      "audit:read",
      "tenant:admin",
      "rbac:read",
      "inventory:read",
      "breakglass:request",
    ],
    "hr-director": [
      "hr:read",
      "hr:write",
      "payroll:run",
      "audit:read",
      "rbac:read",
      "contract:sign",
      "tenant:switch",
    ],
    finance: [
      "billing:read",
      "billing:write",
      "claim:submit",
      "payment:receive",
      "inventory:read",
    ],
    procurement: ["inventory:read", "inventory:write", "po:approve"],
    "ai-safety-officer": [
      "ai:configure",
      "ai:override",
      "ai:killswitch",
      "audit:read",
      "audit:export",
      "rbac:read",
    ],
    auditor: [
      "audit:read",
      "audit:export",
      "rbac:read",
      "billing:read",
      "tenant:switch",
    ],
    patient: ["patient:read", "phi:read"],
    "moh-official": ["ph:surveillance", "ph:outbreak-declare", "audit:read"],
  };

  const lines: string[] = [];
  for (const [id, label, cadre] of roles) {
    lines.push(
      `INSERT INTO beyu_identity.roles (role_id, label, cadre) VALUES ('${id}', '${label.replace(/'/g, "''")}', '${cadre}') ON CONFLICT (role_id) DO NOTHING;`,
    );
  }
  for (const p of permissions) {
    lines.push(
      `INSERT INTO beyu_identity.permissions (permission_id) VALUES ('${p}') ON CONFLICT (permission_id) DO NOTHING;`,
    );
  }
  for (const [role, perms] of Object.entries(rolePermissions)) {
    for (const p of perms) {
      lines.push(
        `INSERT INTO beyu_identity.role_permissions (role_id, permission_id) VALUES ('${role}', '${p}') ON CONFLICT DO NOTHING;`,
      );
    }
  }
  return lines.join("\n");
}

/** Bring the schema + seed into a connection (idempotent). */
export async function ensureIdentitySchema(conn: {
  exec(sql: string): Promise<void>;
}): Promise<void> {
  await conn.exec(IDENTITY_SCHEMA_SQL);
  await conn.exec(identitySeedSql());
}
