-- Migration 043 down — remove the portal access/release domain. Additive-only:
-- identity, consents and every clinical/financial table are untouched.
BEGIN;
DROP TABLE IF EXISTS health.portal_content_releases;
DROP TABLE IF EXISTS health.portal_access_grants;
DROP TRIGGER IF EXISTS trg_portal_access_grants_updated ON health.portal_access_grants;
COMMIT;
