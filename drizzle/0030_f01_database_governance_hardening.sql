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
-- TESTING:
--   Verify with: select has_table_privilege('beyu_runtime', 'public.os_registry', 'INSERT')
--   Expected: false for governance tables, true for users/tenants/legal_entities
--
-- ROLLBACK:
--   This migration is intentionally irreversible for safety. Governance tables
--   must remain protected. If rollback is required, use the admin role to
--   explicitly grant DML back to the runtime role (not recommended).

-- Revoke INSERT, UPDATE, DELETE on PURE governance tables from runtime role
-- The runtime role retains SELECT (read access) so it can enforce governance rules

-- OS Registry: OS declarations and lifecycle state
REVOKE INSERT, UPDATE, DELETE ON public.os_registry FROM beyu_runtime;

-- Governance Capability Registry: Capability activation (CAP_POSTING, etc.)
REVOKE INSERT, UPDATE, DELETE ON public.governance_capability_registry FROM beyu_runtime;

-- Governance Decision Registry: Ratification decisions
REVOKE INSERT, UPDATE, DELETE ON public.governance_decision_registry FROM beyu_runtime;

-- Role Assignments: RBAC grants (should go through governed workflows)
REVOKE INSERT, UPDATE, DELETE ON public.role_assignments FROM beyu_runtime;

-- Verification: Ensure runtime role still has SELECT (read access) on all protected tables
DO $$
DECLARE
  table_name text;
  has_select boolean;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY[
    'os_registry',
    'governance_capability_registry',
    'governance_decision_registry',
    'role_assignments'
  ])
  LOOP
    SELECT has_table_privilege('beyu_runtime', 'public.' || table_name, 'SELECT') INTO has_select;
    IF NOT has_select THEN
      RAISE EXCEPTION 'F-01 verification failed: beyu_runtime lost SELECT on %', table_name;
    END IF;
  END LOOP;
END $$;

-- Document the remediation
COMMENT ON TABLE public.os_registry IS 'OS registry - governance protected (F-01): runtime role has SELECT only';
COMMENT ON TABLE public.governance_capability_registry IS 'Capability registry - governance protected (F-01): runtime role has SELECT only';
COMMENT ON TABLE public.governance_decision_registry IS 'Decision registry - governance protected (F-01): runtime role has SELECT only';
COMMENT ON TABLE public.role_assignments IS 'Role assignments - governance protected (F-01): runtime role has SELECT only';
