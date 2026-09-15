ALTER TABLE ujenzi_sync_envelopes ADD COLUMN IF NOT EXISTS client_sequence INTEGER;
ALTER TABLE ujenzi_sync_envelopes ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT '1';
ALTER TABLE ujenzi_sync_envelopes ADD COLUMN IF NOT EXISTS conflict_state TEXT NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS ujenzi_work_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  schedule_activity_id TEXT REFERENCES ujenzi_schedule_activities(id),
  status TEXT NOT NULL DEFAULT 'PLANNED',
  planned_qty NUMERIC(16,4),
  actual_qty NUMERIC(16,4),
  unit TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_wp_uidx ON ujenzi_work_packages (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_wp_tenant_idx ON ujenzi_work_packages (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_work_package_deps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  predecessor_id TEXT NOT NULL REFERENCES ujenzi_work_packages(id),
  successor_id TEXT NOT NULL REFERENCES ujenzi_work_packages(id),
  relation TEXT NOT NULL DEFAULT 'FS',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_wpdep_tenant_idx ON ujenzi_work_package_deps (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_submittals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_sub_uidx ON ujenzi_submittals (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_sub_tenant_idx ON ujenzi_submittals (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_itps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_itp_uidx ON ujenzi_itps (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_itp_tenant_idx ON ujenzi_itps (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_itp_results (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  itp_id TEXT NOT NULL REFERENCES ujenzi_itps(id),
  outcome TEXT NOT NULL,
  measured_value TEXT,
  professional_certification TEXT NOT NULL DEFAULT 'NOT_CERTIFIED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_itpr_tenant_idx ON ujenzi_itp_results (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_material_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  movement_kind TEXT NOT NULL,
  material_code TEXT NOT NULL,
  quantity NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL,
  work_package_id TEXT REFERENCES ujenzi_work_packages(id),
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_mmov_tenant_idx ON ujenzi_material_movements (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_sustainability_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  metric_kind TEXT NOT NULL,
  value NUMERIC(18,6) NOT NULL,
  unit TEXT NOT NULL,
  methodology TEXT NOT NULL,
  source TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_sust_tenant_idx ON ujenzi_sustainability_metrics (tenant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ujenzi_work_packages','ujenzi_work_package_deps','ujenzi_submittals','ujenzi_itps',
    'ujenzi_itp_results','ujenzi_material_movements','ujenzi_sustainability_metrics'
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
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_work_packages, ujenzi_work_package_deps, ujenzi_submittals, ujenzi_itps, ujenzi_itp_results, ujenzi_material_movements, ujenzi_sustainability_metrics TO %I',
      r.rolname
    );
  END LOOP;
END $$;
