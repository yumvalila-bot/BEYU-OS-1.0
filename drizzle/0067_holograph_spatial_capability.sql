-- BEYU OS — HOLOGRAPH spatial capability registries (additive).
--
-- Holograph is the canonical NAME of the existing shared spatial
-- visualization and interaction capability (src/lib/viz/*, migration 0062).
-- This migration extends that capability with the four governed registries
-- its canon requires. ONE shared capability, NOT a new OS: nothing here
-- duplicates sector truth, no sector functionality moves here, and no table
-- in this migration carries journal, treasury, ledger or posting state —
-- Finance OS remains the only journal writer; CAP_POSTING stays LOCKED.
--
-- Tables:
--   viz_assets            — governed spatial ASSET registry: provenance,
--                           source, version, integrity hash, classification,
--                           tenant/entity scope. METADATA ONLY — the registry
--                           never stores binary geometry, and format support
--                           is declared honestly (no parser exists in this
--                           repository for binary formats).
--   viz_devices           — hardware-independent DEVICE registry: class
--                           (WEB/DESKTOP/MOBILE/AR/VR/SPATIAL_DISPLAY/
--                           VOLUMETRIC_DISPLAY/FUTURE_HOLOGRAPHIC_DEVICE),
--                           honest rendering backend, governed lifecycle
--                           (REGISTERED/ACTIVE/SUSPENDED/REVOKED/
--                           NOT_IMPLEMENTED). No physical holographic
--                           hardware support exists or is claimed:
--                           FUTURE_HOLOGRAPHIC_DEVICE rows can never be
--                           ACTIVE or SUSPENDED (CHECK constraint).
--   viz_render_profiles   — named RENDER PROFILES binding a canonical renderer
--                           kind to a device class + quality tier + object
--                           ceiling. Presentation only: a profile can only
--                           REDUCE fidelity, never widen data access.
--   viz_interactions      — governed INTERACTION ledger: every spatial
--                           interaction request (presentation, navigation,
--                           workflow/approval delegation) records actor,
--                           target, outcome (ALLOWED/DENIED/DELEGATED) and
--                           reason. DENIED rows are first-class. Interactions
--                           NEVER mutate sector data and NEVER post anything.
--
-- CONSTITUTIONAL INVARIANTS (mirroring 0031/0034/0035/0043/0062):
--   * every table is tenant-owned (tenant_id FK to tenants);
--   * every table carries a classification column (beyu_classification enum);
--   * every table gets ENABLE + FORCE ROW LEVEL SECURITY with a
--     beyu_tenant_ids() policy — RLS is the final database boundary and is
--     never disabled for Holograph;
--   * the runtime role (beyu_runtime, NOSUPERUSER NOBYPASSRLS) receives only
--     the table grants it needs; migrations run on the admin role;
--   * NO journal, ledger, treasury or posting column exists anywhere here.
--
-- Verification blocks at the end fail the migration if any table lacks its
-- RLS policy or CHECK constraint.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  format_support TEXT NOT NULL DEFAULT 'NOT_IMPLEMENTED',
  source_system TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  integrity_hash TEXT NOT NULL,
  storage_ref TEXT NOT NULL,
  provenance JSONB NOT NULL,
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_assets_type_ck CHECK (asset_type IN ('GLTF','GLB','IFC','BIM','CAD','MEDICAL_3D','GEOGRAPHIC','INFRASTRUCTURE','BUILDING','EQUIPMENT','FARM','VEHICLE','ORGANIZATION','FINANCE_OBJECT','FOUNDATION_OBJECT')),
  CONSTRAINT viz_assets_status_ck CHECK (status IN ('REGISTERED','ARCHIVED')),
  CONSTRAINT viz_assets_format_ck CHECK (format_support IN ('IMPLEMENTED','NOT_IMPLEMENTED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS viz_assets_tenant_source_uidx ON viz_assets (tenant_id, source_system, source_object_id);
CREATE INDEX IF NOT EXISTS viz_assets_tenant_idx ON viz_assets (tenant_id);
CREATE INDEX IF NOT EXISTS viz_assets_type_idx ON viz_assets (asset_type);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_devices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  device_class TEXT NOT NULL,
  rendering_backend TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  provenance JSONB NOT NULL,
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_devices_class_ck CHECK (device_class IN ('WEB','DESKTOP','MOBILE','AR','VR','SPATIAL_DISPLAY','VOLUMETRIC_DISPLAY','FUTURE_HOLOGRAPHIC_DEVICE')),
  CONSTRAINT viz_devices_status_ck CHECK (status IN ('REGISTERED','ACTIVE','SUSPENDED','REVOKED','NOT_IMPLEMENTED')),
  CONSTRAINT viz_devices_future_holographic_ck CHECK (device_class <> 'FUTURE_HOLOGRAPHIC_DEVICE' OR status IN ('REGISTERED','NOT_IMPLEMENTED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS viz_devices_tenant_name_uidx ON viz_devices (tenant_id, name);
CREATE INDEX IF NOT EXISTS viz_devices_tenant_idx ON viz_devices (tenant_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_render_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  device_class TEXT,
  renderer TEXT NOT NULL,
  quality_tier TEXT NOT NULL DEFAULT 'MEDIUM',
  formats JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_objects INTEGER NOT NULL DEFAULT 300,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_render_profiles_renderer_ck CHECK (renderer IN ('HTML_TABLE','SVG_2D','CANVAS_2D','CHART','MAP','DIAGRAM','TIMELINE','SPATIAL_PROJECTION','WEBGL_3D','WEBGPU_3D','XR')),
  CONSTRAINT viz_render_profiles_tier_ck CHECK (quality_tier IN ('LOW','MEDIUM','HIGH','ULTRA')),
  CONSTRAINT viz_render_profiles_status_ck CHECK (status IN ('ACTIVE','ARCHIVED')),
  CONSTRAINT viz_render_profiles_max_objects_ck CHECK (max_objects > 0 AND max_objects <= 100000)
);
CREATE UNIQUE INDEX IF NOT EXISTS viz_render_profiles_tenant_name_uidx ON viz_render_profiles (tenant_id, name);
CREATE INDEX IF NOT EXISTS viz_render_profiles_tenant_idx ON viz_render_profiles (tenant_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_interactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  scene_id TEXT REFERENCES viz_scenes(id),
  twin_id TEXT REFERENCES viz_digital_twins(id),
  sector TEXT NOT NULL,
  object_ref TEXT,
  interaction_type TEXT NOT NULL,
  target_domain TEXT,
  target_ref TEXT,
  outcome TEXT NOT NULL,
  reason TEXT,
  device_id TEXT REFERENCES viz_devices(id),
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_interactions_type_ck CHECK (interaction_type IN ('SELECT_OBJECT','INSPECT_OBJECT','FOCUS_OBJECT','FILTER_LAYER','NAVIGATE_SCENE','QUERY_SPATIAL_DATA','VIEW_EVENT','VIEW_AUDIT_CONTEXT','OPEN_ENTITY','OPEN_DOCUMENT','REQUEST_WORKFLOW','REQUEST_APPROVAL')),
  CONSTRAINT viz_interactions_outcome_ck CHECK (outcome IN ('ALLOWED','DENIED','DELEGATED')),
  CONSTRAINT viz_interactions_sector_ck CHECK (sector IN ('BEYU','HEALTH','FINANCE','AGRICULTURE','UJENZI','FOUNDATION')),
  CONSTRAINT viz_interactions_target_ck CHECK (target_domain IS NULL OR target_domain IN ('GOVERNANCE','FINANCE_CAPITAL','FAMILY_OFFICE','DOCUMENT','LEGAL','ORGANIZATION'))
);
CREATE INDEX IF NOT EXISTS viz_interactions_tenant_idx ON viz_interactions (tenant_id);
CREATE INDEX IF NOT EXISTS viz_interactions_tenant_type_idx ON viz_interactions (tenant_id, interaction_type);
CREATE INDEX IF NOT EXISTS viz_interactions_tenant_scene_idx ON viz_interactions (tenant_id, scene_id);

--> statement-breakpoint
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['viz_assets','viz_devices','viz_render_profiles','viz_interactions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;

--> statement-breakpoint
DO $$
DECLARE
  table_name TEXT;
  rls_count INT;
  policy_count INT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['viz_assets','viz_devices','viz_render_profiles','viz_interactions']
  LOOP
    SELECT count(*) INTO rls_count FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
        AND c.relrowsecurity AND c.relforcerowsecurity;
    IF rls_count <> 1 THEN
      RAISE EXCEPTION 'Migration 0067 verification failed: table % must have ENABLE + FORCE ROW LEVEL SECURITY', table_name;
    END IF;

    SELECT count(*) INTO policy_count FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
        AND policyname = table_name || '_tenant_isolation'
        AND qual LIKE '%beyu_tenant_ids()%';
    IF policy_count <> 1 THEN
      RAISE EXCEPTION 'Migration 0067 verification failed: table % must carry the beyu_tenant_ids() isolation policy', table_name;
    END IF;

    IF table_name = 'viz_assets' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viz_assets_type_ck')
        OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viz_assets_format_ck') THEN
        RAISE EXCEPTION 'Migration 0067 verification failed: viz_assets CHECK constraints missing';
      END IF;
    END IF;
    IF table_name = 'viz_devices' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viz_devices_future_holographic_ck') THEN
        RAISE EXCEPTION 'Migration 0067 verification failed: viz_devices future-holographic guard missing';
      END IF;
    END IF;
    IF table_name = 'viz_interactions' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viz_interactions_outcome_ck')
        OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viz_interactions_target_ck') THEN
        RAISE EXCEPTION 'Migration 0067 verification failed: viz_interactions CHECK constraints missing';
      END IF;
    END IF;
  END LOOP;
END
$$;
