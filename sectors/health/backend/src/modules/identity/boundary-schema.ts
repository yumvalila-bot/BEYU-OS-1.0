/**
 * BEYU Health OS — Canonical Isolation Boundary Schema (SQL DDL).
 *
 * BEYU OS integration (identity + isolation upgrade). This is the canonical
 * source of the additive boundary DDL. The same SQL is applied by:
 *   1. the committed migration scripts
 *      (backend/database/migrations/002_beyu_identity_bridge.
 *       003_health_isolation_boundaries.*),
 *   2. `ensureBridgeSchema()` / `ensureBoundarySchema()` invoked by the
 *      bridge/integration tests against a real Postgres engine (real server
 *      or PGlite).
 *
 * WHAT THIS ADDS (additive only — no imported object is altered in place)
 *
 *   A. beyu_identity.beyu_identity_links
 *      1:1 bridge between the sector domain identity (global_user_id) and the
 *      ONE canonical BEYU GlobalUserID (users.id / parties.id). The sector
 *      user id is never merged into or destroyed in favour of the canonical
 *      id; it is linked.
 *
 *   B. beyu_identity.tenants: beyu_tenant_id (UNIQUE) + country_code +
 *      entity_code — the canonical tenant linkage and isolation attributes.
 *
 *   C. beyu_identity.tenant_matches_boundary(t uuid) SECURITY DEFINER helper
 *      and the upgraded RLS policies: for tenants LINKED to a canonical BEYU
 *      tenant, the context (app.tenant_id / app.country_code /
 *      app.entity_code) must match the tenant's canonical country and entity,
 *      or the rows are invisible (fail-closed). Unlinked legacy tenants keep
 *      the existing tenant-only boundary — nothing is weakened.
 *
 * GUC NAMESPACING
 *   BEYU OS uses beyu.current_tenant_ids / beyu.global_scope; this sector uses
 *   app.tenant_id / app.country_code / app.entity_code. The namespaces are
 *   disjoint, so both policy sets coexist safely in one database.
 */

/** Migration 002 — canonical identity bridge (up). */
export const BEYU_IDENTITY_BRIDGE_SQL = `
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
`;

/** Migration 003 — country/entity isolation boundaries for linked tenants (up). */
export const HEALTH_ISOLATION_BOUNDARIES_SQL = `
CREATE OR REPLACE FUNCTION beyu_identity.tenant_matches_boundary(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM beyu_identity.tenants t
     WHERE t.tenant_id = p_tenant
       AND (
             t.beyu_tenant_id IS NULL
          OR (t.country_code = current_setting('app.country_code', true)
              AND t.entity_code = current_setting('app.entity_code', true))
       )
  );
$$;

ALTER TABLE beyu_identity.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_isolation ON beyu_identity.tenants;
CREATE POLICY tenants_isolation ON beyu_identity.tenants
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

DROP POLICY IF EXISTS memberships_isolation ON beyu_identity.tenant_memberships;
CREATE POLICY memberships_isolation ON beyu_identity.tenant_memberships
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

DROP POLICY IF EXISTS sessions_isolation ON beyu_identity.sessions;
CREATE POLICY sessions_isolation ON beyu_identity.sessions
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

DROP POLICY IF EXISTS auth_events_isolation ON beyu_identity.auth_events;
CREATE POLICY auth_events_isolation ON beyu_identity.auth_events
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));
`;

/** Bring the bridge schema into a connection (idempotent). */
export async function ensureBridgeSchema(conn: {
  exec(sql: string): Promise<void>;
}): Promise<void> {
  await conn.exec(BEYU_IDENTITY_BRIDGE_SQL);
}

/** Bring the isolation-boundary upgrade into a connection (idempotent). */
export async function ensureBoundarySchema(conn: {
  exec(sql: string): Promise<void>;
}): Promise<void> {
  await conn.exec(HEALTH_ISOLATION_BOUNDARIES_SQL);
}
