-- BEYU Health OS — Bridge Lifecycle Status (DOWN)
-- Removes lifecycle/status columns from identity bridge.
-- Destructive: run only on disposable instances.

DROP INDEX IF EXISTS beyu_identity.idx_beyu_links_status;
ALTER TABLE beyu_identity.beyu_identity_links DROP COLUMN IF EXISTS source;
ALTER TABLE beyu_identity.beyu_identity_links DROP COLUMN IF EXISTS revoked_by;
ALTER TABLE beyu_identity.beyu_identity_links DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE beyu_identity.beyu_identity_links DROP CONSTRAINT IF EXISTS beyu_identity_links_status_check;
ALTER TABLE beyu_identity.beyu_identity_links DROP COLUMN IF EXISTS status;
