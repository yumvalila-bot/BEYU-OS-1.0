-- Ujenzi Digital Twin graph + CRS metadata + professional/standard catalogues.
-- Still ONE Sector OS. No Twin OS / BIM OS / GIS OS.

ALTER TABLE ujenzi_land_sites ADD COLUMN IF NOT EXISTS crs TEXT NOT NULL DEFAULT 'EPSG:4326';
ALTER TABLE ujenzi_land_sites ADD COLUMN IF NOT EXISTS geometry_source TEXT NOT NULL DEFAULT 'USER_ENTERED';
ALTER TABLE ujenzi_land_sites ADD COLUMN IF NOT EXISTS geometry_accuracy_m NUMERIC(10,3);

CREATE TABLE IF NOT EXISTS ujenzi_buildings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  site_id TEXT REFERENCES ujenzi_land_sites(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  occupancy TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_buildings_uidx ON ujenzi_buildings (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_buildings_tenant_idx ON ujenzi_buildings (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_levels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  building_id TEXT NOT NULL REFERENCES ujenzi_buildings(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  elevation_m NUMERIC(10,3),
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_levels_uidx ON ujenzi_levels (building_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_levels_tenant_idx ON ujenzi_levels (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_spaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  level_id TEXT NOT NULL REFERENCES ujenzi_levels(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  use_type TEXT,
  area_m2 NUMERIC(14,2),
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_spaces_uidx ON ujenzi_spaces (level_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_spaces_tenant_idx ON ujenzi_spaces (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_elements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  space_id TEXT REFERENCES ujenzi_spaces(id),
  building_id TEXT REFERENCES ujenzi_buildings(id),
  code TEXT NOT NULL,
  element_kind TEXT NOT NULL,
  ifc_type TEXT,
  material_code TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_elements_uidx ON ujenzi_elements (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_elements_tenant_idx ON ujenzi_elements (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_systems (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  system_kind TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_systems_uidx ON ujenzi_systems (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_systems_tenant_idx ON ujenzi_systems (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  element_id TEXT REFERENCES ujenzi_elements(id),
  system_id TEXT REFERENCES ujenzi_systems(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'DESIGNED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_assets_uidx ON ujenzi_assets (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_assets_tenant_idx ON ujenzi_assets (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_model_objects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  bim_model_id TEXT NOT NULL REFERENCES ujenzi_bim_models(id),
  element_id TEXT REFERENCES ujenzi_elements(id),
  external_object_id TEXT NOT NULL,
  discipline TEXT,
  provenance TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_model_objects_uidx ON ujenzi_model_objects (bim_model_id, external_object_id);
CREATE INDEX IF NOT EXISTS ujenzi_model_objects_tenant_idx ON ujenzi_model_objects (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_twin_edges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_twin_edges_tenant_idx ON ujenzi_twin_edges (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_twin_edges_project_idx ON ujenzi_twin_edges (project_id);

CREATE TABLE IF NOT EXISTS ujenzi_professionals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  global_user_id TEXT,
  display_name TEXT NOT NULL,
  discipline TEXT NOT NULL,
  registration_number TEXT,
  jurisdiction TEXT NOT NULL DEFAULT 'TZ',
  verification_status TEXT NOT NULL DEFAULT 'USER_ENTERED',
  expires_on TEXT,
  classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_professionals_tenant_idx ON ujenzi_professionals (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_engineering_standards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'TZ',
  edition TEXT,
  effective_from TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECORDED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_eng_std_uidx ON ujenzi_engineering_standards (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_eng_std_tenant_idx ON ujenzi_engineering_standards (tenant_id);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ujenzi_buildings','ujenzi_levels','ujenzi_spaces','ujenzi_elements','ujenzi_systems',
    'ujenzi_assets','ujenzi_model_objects','ujenzi_twin_edges','ujenzi_professionals','ujenzi_engineering_standards'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''beyu.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''beyu.tenant_id'', true))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_buildings, ujenzi_levels, ujenzi_spaces, ujenzi_elements, ujenzi_systems, ujenzi_assets, ujenzi_model_objects, ujenzi_twin_edges, ujenzi_professionals, ujenzi_engineering_standards TO %I',
      r.rolname
    );
  END LOOP;
END
$$;
