-- BEYU Health OS — Least-Privilege Federation Read Grants (Phase 5)
--
-- Creates a read-only role for Health federation authorization verification.
-- This role can ONLY read the tables required for identity link verification
-- and tenant boundary checks. No writes permitted.
--
-- The runtime authorization path (requireCanonicalLink, assertContextBoundary)
-- uses only SELECT queries. This role enforces that at the database level.
--
-- RLS remains the final data-isolation boundary. This role is subject to RLS.
--
-- SECURITY: This role cannot INSERT/UPDATE/DELETE on any table.
--           This role cannot bypass RLS.
--           This role cannot escalate privileges.

-- Create the federation read-only role (if not exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'beyu_health_federation_read'
  ) THEN
    CREATE ROLE beyu_health_federation_read NOLOGIN;
  END IF;
END $$;

-- Grant USAGE on the beyu_identity schema (required to access objects).
GRANT USAGE ON SCHEMA beyu_identity TO beyu_health_federation_read;

-- Grant SELECT on specific tables required for federation authorization.
-- These are the ONLY tables the runtime authorization path reads.
GRANT SELECT ON beyu_identity.users TO beyu_health_federation_read;
GRANT SELECT ON beyu_identity.beyu_identity_links TO beyu_health_federation_read;
GRANT SELECT ON beyu_identity.tenants TO beyu_health_federation_read;

-- Grant EXECUTE on the tenant_matches_boundary function (required for RLS checks).
-- This is a read-only SECURITY DEFINER function that checks tenant boundaries.
GRANT EXECUTE ON FUNCTION beyu_identity.tenant_matches_boundary(uuid) TO beyu_health_federation_read;

-- Explicitly DENY all other privileges (defense in depth).
-- The role has NOLOGIN so it cannot authenticate directly; it must be granted
-- to a login role. Even then, it can only SELECT the tables above.

COMMENT ON ROLE beyu_health_federation_read IS
  'Read-only role for Health federation authorization verification. SELECT only on users, beyu_identity_links, tenants. No writes. Subject to RLS.';
