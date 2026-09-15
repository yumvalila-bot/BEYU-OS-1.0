ALTER TABLE ujenzi_professionals ADD COLUMN IF NOT EXISTS evidence_uri TEXT;
ALTER TABLE ujenzi_professionals ADD COLUMN IF NOT EXISTS verified_by_user_id TEXT;

CREATE TABLE IF NOT EXISTS ujenzi_gis_features (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  dataset_id TEXT NOT NULL REFERENCES ujenzi_gis_datasets(id),
  feature_index INTEGER NOT NULL,
  geometry_type TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_gis_feat_tenant_idx ON ujenzi_gis_features (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_gis_feat_ds_idx ON ujenzi_gis_features (dataset_id);

CREATE TABLE IF NOT EXISTS ujenzi_quality_ncrs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  twin_object_kind TEXT,
  twin_object_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_ncr_uidx ON ujenzi_quality_ncrs (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_ncr_tenant_idx ON ujenzi_quality_ncrs (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_work_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  asset_id TEXT REFERENCES ujenzi_assets(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  work_kind TEXT NOT NULL DEFAULT 'CORRECTIVE',
  status TEXT NOT NULL DEFAULT 'OPEN',
  journals_posted BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_wo_uidx ON ujenzi_work_orders (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_wo_tenant_idx ON ujenzi_work_orders (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_reality_captures (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  capture_kind TEXT NOT NULL,
  checksum TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  computer_vision TEXT NOT NULL DEFAULT 'NOT_IMPLEMENTED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_rc_uidx ON ujenzi_reality_captures (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_rc_tenant_idx ON ujenzi_reality_captures (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_knowledge_edges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  knowledge_id TEXT NOT NULL REFERENCES ujenzi_knowledge(id),
  related_kind TEXT NOT NULL,
  related_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_kedge_tenant_idx ON ujenzi_knowledge_edges (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_rfqs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  award_status TEXT NOT NULL DEFAULT 'NOT_AWARDED',
  journals_posted BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_rfq_uidx ON ujenzi_rfqs (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_rfq_tenant_idx ON ujenzi_rfqs (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_quotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  rfq_id TEXT NOT NULL REFERENCES ujenzi_rfqs(id),
  supplier_name TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_quote_tenant_idx ON ujenzi_quotations (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_design_alternatives (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  weighted_score NUMERIC(12,4),
  approval_state TEXT NOT NULL DEFAULT 'UNAPPROVED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_dalt_uidx ON ujenzi_design_alternatives (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_dalt_tenant_idx ON ujenzi_design_alternatives (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_compliance_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  requirement_id TEXT NOT NULL REFERENCES ujenzi_compliance_requirements(id),
  result TEXT NOT NULL DEFAULT 'USER_ASSESSED',
  official_status TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_ceval_tenant_idx ON ujenzi_compliance_evaluations (tenant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ujenzi_gis_features','ujenzi_quality_ncrs','ujenzi_work_orders','ujenzi_reality_captures',
    'ujenzi_knowledge_edges','ujenzi_rfqs','ujenzi_quotations','ujenzi_design_alternatives','ujenzi_compliance_evaluations'
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
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_gis_features, ujenzi_quality_ncrs, ujenzi_work_orders, ujenzi_reality_captures, ujenzi_knowledge_edges, ujenzi_rfqs, ujenzi_quotations, ujenzi_design_alternatives, ujenzi_compliance_evaluations TO %I',
      r.rolname
    );
  END LOOP;
END $$;
