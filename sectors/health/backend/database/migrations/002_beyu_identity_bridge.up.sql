-- BEYU Health OS — Canonical Identity Bridge (BEYU OS integration, migration 002 UP)
-- Generated from backend/src/modules/identity/boundary-schema.ts (single source
-- of truth: BEYU_IDENTITY_BRIDGE_SQL). Deterministic, idempotent, additive.
--
-- Links the sector domain identity (global_user_id) to the ONE canonical BEYU
-- GlobalUserID (public.users.id / public.parties.id) and records the canonical
-- tenant isolation attributes on sector tenants. No imported object is altered
-- in place; everything here is additive.

CREATE TABLE IF NOT EXISTS beyu_identity.beyu_identity_links (
  global_user_id uuid PRIMARY KEY REFERENCES beyu_identity.users(global_user_id) ON DELETE CASCADE,
  beyu_user_id   text NOT NULL,
  beyu_party_id  text,
  linked_by      text NOT NULL,
  linked_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beyu_user_id)
);
CREATE INDEX IF NOT EXISTS idx_beyu_links_party ON beyu_identity.beyu_identity_links(beyu_party_id);

ALTER TABLE beyu_identity.tenants ADD COLUMN IF NOT EXISTS beyu_tenant_id text UNIQUE;
ALTER TABLE beyu_identity.tenants ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE beyu_identity.tenants ADD COLUMN IF NOT EXISTS entity_code text;
CREATE INDEX IF NOT EXISTS idx_tenants_beyu ON beyu_identity.tenants(beyu_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_country ON beyu_identity.tenants(country_code);
