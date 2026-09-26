-- BEYU Health OS — Least-Privilege Federation Read Grants (DOWN)
-- Removes the federation read-only role and its grants.

REVOKE EXECUTE ON FUNCTION beyu_identity.tenant_matches_boundary(uuid) FROM beyu_health_federation_read;
REVOKE SELECT ON beyu_identity.tenants FROM beyu_health_federation_read;
REVOKE SELECT ON beyu_identity.beyu_identity_links FROM beyu_health_federation_read;
REVOKE SELECT ON beyu_identity.users FROM beyu_health_federation_read;
REVOKE USAGE ON SCHEMA beyu_identity FROM beyu_health_federation_read;

DROP ROLE IF EXISTS beyu_health_federation_read;
