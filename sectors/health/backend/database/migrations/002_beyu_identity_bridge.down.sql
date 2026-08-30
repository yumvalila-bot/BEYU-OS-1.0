-- BEYU Health OS — Canonical Identity Bridge (BEYU OS integration, migration 002 DOWN)
-- Reverses 002. Destructive to bridge data: run only on disposable instances.

DROP TABLE IF EXISTS beyu_identity.beyu_identity_links;
ALTER TABLE beyu_identity.tenants DROP COLUMN IF EXISTS entity_code;
ALTER TABLE beyu_identity.tenants DROP COLUMN IF EXISTS country_code;
ALTER TABLE beyu_identity.tenants DROP COLUMN IF EXISTS beyu_tenant_id;
