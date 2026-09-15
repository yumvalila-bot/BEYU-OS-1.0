-- Survey observations, GIS dataset registry, defects, RFIs, schedule.
-- Still ONE Ujenzi Sector OS. No GIS OS / Survey OS.

CREATE TABLE IF NOT EXISTS ujenzi_survey_observations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  site_id TEXT NOT NULL REFERENCES ujenzi_land_sites(id),
  method TEXT NOT NULL,
  crs TEXT NOT NULL,
  easting_or_lon NUMERIC(18,8),
  northing_or_lat NUMERIC(18,8),
  elevation_m NUMERIC(12,4),
  accuracy_m NUMERIC(10,4),
  source TEXT NOT NULL DEFAULT 'USER_ENTERED',
  observed_on TEXT,
  data_status TEXT NOT NULL DEFAULT 'RECORDED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_survey_obs_tenant_idx ON ujenzi_survey_observations (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_gis_datasets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  crs TEXT NOT NULL,
  feature_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  license TEXT,
  ingest_status TEXT NOT NULL DEFAULT 'REGISTERED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_gis_uidx ON ujenzi_gis_datasets (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_gis_tenant_idx ON ujenzi_gis_datasets (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_defects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  inspection_id TEXT REFERENCES ujenzi_inspections(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MINOR',
  status TEXT NOT NULL DEFAULT 'OPEN',
  location_note TEXT,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_defects_uidx ON ujenzi_defects (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_defects_tenant_idx ON ujenzi_defects (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_rfis (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_rfis_uidx ON ujenzi_rfis (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_rfis_tenant_idx ON ujenzi_rfis (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_schedule_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  wbs TEXT,
  duration_days INTEGER,
  predecessor_code TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_sched_uidx ON ujenzi_schedule_activities (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_sched_tenant_idx ON ujenzi_schedule_activities (tenant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ujenzi_survey_observations','ujenzi_gis_datasets','ujenzi_defects','ujenzi_rfis','ujenzi_schedule_activities'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''beyu.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''beyu.tenant_id'', true))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_survey_observations, ujenzi_gis_datasets, ujenzi_defects, ujenzi_rfis, ujenzi_schedule_activities TO %I',
      r.rolname
    );
  END LOOP;
END $$;
