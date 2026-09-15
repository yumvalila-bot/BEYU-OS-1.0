ALTER TABLE ujenzi_boq_items ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE ujenzi_boq_items ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE ujenzi_boq_items ADD COLUMN IF NOT EXISTS journals_posted BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ujenzi_bim_artifacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  discipline TEXT NOT NULL DEFAULT 'ARCHITECTURE',
  format TEXT NOT NULL,
  checksum TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  header_hint TEXT,
  ingest_status TEXT NOT NULL DEFAULT 'REGISTERED',
  geometry_parsed BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_bim_art_checksum_uidx ON ujenzi_bim_artifacts (tenant_id, checksum);
CREATE INDEX IF NOT EXISTS ujenzi_bim_art_tenant_idx ON ujenzi_bim_artifacts (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_hazards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  residual_risk TEXT NOT NULL DEFAULT 'UNASSESSED',
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_hazards_uidx ON ujenzi_hazards (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_hazards_tenant_idx ON ujenzi_hazards (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_near_misses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECORDED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_near_miss_uidx ON ujenzi_near_misses (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_near_miss_tenant_idx ON ujenzi_near_misses (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_permits_to_work (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  permit_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_ptw_uidx ON ujenzi_permits_to_work (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_ptw_tenant_idx ON ujenzi_permits_to_work (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_commissioning_tests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  system_name TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'PENDING',
  workflow_state TEXT NOT NULL DEFAULT 'PREPARED',
  professional_certification TEXT NOT NULL DEFAULT 'NOT_CERTIFIED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_comm_uidx ON ujenzi_commissioning_tests (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_comm_tenant_idx ON ujenzi_commissioning_tests (tenant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ujenzi_bim_artifacts','ujenzi_hazards','ujenzi_near_misses','ujenzi_permits_to_work','ujenzi_commissioning_tests'
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
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_bim_artifacts, ujenzi_hazards, ujenzi_near_misses, ujenzi_permits_to_work, ujenzi_commissioning_tests TO %I',
      r.rolname
    );
  END LOOP;
END $$;
