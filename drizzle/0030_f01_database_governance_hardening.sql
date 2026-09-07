-- F-01 Database Governance Remediation — REVISION
--
-- PURPOSE: Protect PURE governance tables from unauthorized mutation by the
-- runtime role (beyu_runtime). Identity and organization tables (users,
-- tenants, legal_entities) require legitimate runtime write access for
-- authentication, MFA enrollment, and operational workflows.
--
-- TABLES PROTECTED (governance-only):
--   - os_registry: OS declarations and lifecycle state
--   - governance_capability_registry: Capability activation state (including CAP_POSTING)
--   - governance_decision_registry: Governance decisions and ratifications
--   - role_assignments: RBAC assignments (runtime should not grant/revoke roles)
--
-- TABLES LEFT WRITABLE (legitimate runtime operations):
--   - users: Authentication, MFA, session management
--   - tenants: Operational tenant queries (structure set at bootstrap)
--   - legal_entities: Operational entity queries
--
-- RATIONALE:
--   The runtime role is the application's ordinary request path. Pure governance
--   tables define the rules under which the application operates. Allowing
--   the runtime role to modify these tables creates a circular trust. Identity
--   and organization tables are different: the auth flow legitimately updates
--   user state (last_login_at, failed_attempts, MFA fields), and operational
--   workflows may need to update tenant/entity metadata.
--
-- FRESH-INSTALL SAFETY (revision of the original 0030):
--   The canonical CI flow applies migrations BEFORE scripts/setup-db-role.ts
--   provisions the runtime role, so on a fresh database the role does not exist
--   while this migration runs. The original unconditional `REVOKE ... FROM
--   beyu_runtime` failed with 42704 ("role does not exist") and its assertion
--   block failed when the role existed but had not yet been granted SELECT
--   (migration 0030 always runs before setup-db-role's blanket grant).
--   Like migration 0028's payment revocation, this revision drives the REVOKE
--   from pg_roles so it is a safe no-op when the role is absent; the F-01
--   revocation is re-applied and VERIFIED by scripts/setup-db-role.ts (section
--   4c), which throws if the runtime role can still write a governance table.
--   When the role already exists (an upgraded/accumulated database), the
--   revocation below still takes effect immediately.
--
-- ROLLBACK:
--   This migration is intentionally irreversible for safety. Governance tables
--   must remain protected. If rollback is required, use the admin role to
--   explicitly grant DML back to the runtime role (not recommended).
--
-- TESTING:
--   Verify with: select has_table_privilege('beyu_runtime', 'public.os_registry', 'INSERT')
--   Expected: false for governance tables, true for users/tenants/legal_entities
--   (after scripts/setup-db-role.ts has provisioned the role and granted DML).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON %s, %s, %s, %s FROM %I',
      'public.os_registry',
      'public.governance_capability_registry',
      'public.governance_decision_registry',
      'public.role_assignments',
      r.rolname
    );
    RAISE NOTICE 'F-01: revoked INSERT/UPDATE/DELETE on pure governance tables from %', r.rolname;
  END LOOP;
END
$$;--> statement-breakpoint

-- Document the remediation
COMMENT ON TABLE public.os_registry IS 'OS registry - governance protected (F-01): runtime role has SELECT only' ;
COMMENT ON TABLE public.governance_capability_registry IS 'Capability registry - governance protected (F-01): runtime role has SELECT only';
COMMENT ON TABLE public.governance_decision_registry IS 'Decision registry - governance protected (F-01): runtime role has SELECT only';
COMMENT ON TABLE public.role_assignments IS 'Role assignments - governance protected (F-01): runtime role has SELECT only';
