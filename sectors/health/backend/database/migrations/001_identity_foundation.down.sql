-- BEYU Health OS — Identity Foundation DOWN (Phase 1B/1F)
-- Drops the identity schema. WARNING: destructive. Do not run on live data casually.

DROP TABLE IF EXISTS beyu_identity.auth_events;
DROP TABLE IF EXISTS beyu_identity.sessions;
DROP TABLE IF EXISTS beyu_identity.role_permissions;
DROP TABLE IF EXISTS beyu_identity.permissions;
DROP TABLE IF EXISTS beyu_identity.roles;
DROP TABLE IF EXISTS beyu_identity.tenant_memberships;
DROP TABLE IF EXISTS beyu_identity.tenants;
DROP TABLE IF EXISTS beyu_identity.users;
DROP SCHEMA IF EXISTS beyu_identity;
