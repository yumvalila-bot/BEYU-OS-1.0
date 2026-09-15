-- BEYU Ujenzi OS — ONE construction-sector operating system.
-- Capabilities live inside this sector OS. Not inner OSs.
-- Finance OS remains journal authority. CAP_POSTING untouched.

CREATE TABLE IF NOT EXISTS ujenzi_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'BUILDING',
  country_code TEXT NOT NULL REFERENCES countries(code),
  jurisdiction_code TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  lifecycle_stage TEXT NOT NULL DEFAULT 'BRIEF',
  currency TEXT NOT NULL DEFAULT 'TZS',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_projects_tenant_code_uidx ON ujenzi_projects (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_projects_tenant_idx ON ujenzi_projects (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_projects_entity_idx ON ujenzi_projects (legal_entity_id);
CREATE INDEX IF NOT EXISTS ujenzi_projects_status_idx ON ujenzi_projects (status);

CREATE TABLE IF NOT EXISTS ujenzi_briefs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  objectives TEXT,
  functional_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget_envelope NUMERIC(18,2),
  quality_level TEXT,
  sustainability_objectives TEXT,
  constraints TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_briefs_project_code_uidx ON ujenzi_briefs (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_briefs_tenant_idx ON ujenzi_briefs (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT 'A',
  uri TEXT,
  checksum TEXT,
  provenance TEXT,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_documents_tenant_idx ON ujenzi_documents (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_design_revisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  discipline TEXT NOT NULL DEFAULT 'ARCHITECTURE',
  revision_code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_DEVELOPMENT',
  as_built BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_design_rev_uidx ON ujenzi_design_revisions (project_id, discipline, revision_code);
CREATE INDEX IF NOT EXISTS ujenzi_design_rev_tenant_idx ON ujenzi_design_revisions (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_engineering_calculations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  design_revision_id TEXT REFERENCES ujenzi_design_revisions(id),
  code TEXT NOT NULL,
  discipline TEXT NOT NULL,
  method TEXT NOT NULL,
  formula_or_model TEXT NOT NULL,
  standard_code TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  units JSONB NOT NULL DEFAULT '{}'::jsonb,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  limit_check TEXT,
  pass_fail TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  epistemic_status TEXT NOT NULL DEFAULT 'CALCULATED',
  professional_certification TEXT NOT NULL DEFAULT 'NOT_CERTIFIED',
  engineer_user_id TEXT,
  reviewer_user_id TEXT,
  approval_state TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_eng_calc_uidx ON ujenzi_engineering_calculations (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_eng_calc_tenant_idx ON ujenzi_engineering_calculations (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_land_sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'TZ',
  parcel_ref TEXT,
  ownership_claim_status TEXT NOT NULL DEFAULT 'USER_SUBMITTED',
  area_m2 NUMERIC(16,2),
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  flood_exposure TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_land_sites_uidx ON ujenzi_land_sites (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_land_sites_tenant_idx ON ujenzi_land_sites (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_soil_tests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  site_id TEXT NOT NULL REFERENCES ujenzi_land_sites(id),
  lab_name TEXT,
  sampled_on TEXT,
  test_kind TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  assumed_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_status TEXT NOT NULL DEFAULT 'DATA_REQUIRED',
  epistemic_status TEXT NOT NULL DEFAULT 'NOT_AVAILABLE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_soil_tests_tenant_idx ON ujenzi_soil_tests (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_bim_models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'IFC',
  version TEXT NOT NULL DEFAULT '1',
  federation_status TEXT NOT NULL DEFAULT 'UNFEDERATED',
  uri TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_bim_uidx ON ujenzi_bim_models (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_bim_tenant_idx ON ujenzi_bim_models (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_boq_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  item_code TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity NUMERIC(16,4) NOT NULL,
  rate NUMERIC(16,4),
  amount NUMERIC(18,2),
  work_package TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_boq_uidx ON ujenzi_boq_items (project_id, item_code, revision);
CREATE INDEX IF NOT EXISTS ujenzi_boq_tenant_idx ON ujenzi_boq_items (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_cost_trackers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  approved_budget NUMERIC(18,2),
  commitments NUMERIC(18,2) NOT NULL DEFAULT 0,
  actuals NUMERIC(18,2) NOT NULL DEFAULT 0,
  forecast_final_cost NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  finance_handoff TEXT NOT NULL DEFAULT 'TRACKER_ONLY',
  journals_posted BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_cost_project_uidx ON ujenzi_cost_trackers (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_cost_tenant_idx ON ujenzi_cost_trackers (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  contract_kind TEXT NOT NULL,
  counterparty_name TEXT NOT NULL,
  value NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_contracts_uidx ON ujenzi_contracts (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_contracts_tenant_idx ON ujenzi_contracts (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_variations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  contract_id TEXT REFERENCES ujenzi_contracts(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  cost_impact NUMERIC(18,2),
  schedule_impact_days INTEGER,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_variations_uidx ON ujenzi_variations (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_variations_tenant_idx ON ujenzi_variations (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(18,2),
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_claims_uidx ON ujenzi_claims (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_claims_tenant_idx ON ujenzi_claims (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'TZ',
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_suppliers_uidx ON ujenzi_suppliers (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_suppliers_tenant_idx ON ujenzi_suppliers (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_procurement_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLAN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_proc_uidx ON ujenzi_procurement_packages (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_proc_tenant_idx ON ujenzi_procurement_packages (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_contractors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  classification_grade TEXT,
  country_code TEXT NOT NULL DEFAULT 'TZ',
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_contractors_uidx ON ujenzi_contractors (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_contractors_tenant_idx ON ujenzi_contractors (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_workers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  global_user_id TEXT,
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  trade TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'SELF_DECLARED',
  availability TEXT NOT NULL DEFAULT 'UNKNOWN',
  contractor_id TEXT REFERENCES ujenzi_contractors(id),
  hcm_employee_id TEXT,
  classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_workers_uidx ON ujenzi_workers (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_workers_tenant_idx ON ujenzi_workers (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_materials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  specification TEXT,
  unit TEXT NOT NULL DEFAULT 'KG',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_materials_uidx ON ujenzi_materials (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_materials_tenant_idx ON ujenzi_materials (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_material_lots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  material_id TEXT NOT NULL REFERENCES ujenzi_materials(id),
  lot_code TEXT NOT NULL,
  supplier_id TEXT REFERENCES ujenzi_suppliers(id),
  qty_received NUMERIC(16,4) NOT NULL DEFAULT 0,
  qty_issued NUMERIC(16,4) NOT NULL DEFAULT 0,
  certificate_ref TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_material_lots_uidx ON ujenzi_material_lots (material_id, lot_code);
CREATE INDEX IF NOT EXISTS ujenzi_material_lots_tenant_idx ON ujenzi_material_lots (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_equipment (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_equipment_uidx ON ujenzi_equipment (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_equipment_tenant_idx ON ujenzi_equipment (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_site_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  report_date TEXT NOT NULL,
  body TEXT NOT NULL,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  offline_envelope_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_site_reports_tenant_idx ON ujenzi_site_reports (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_hse_incidents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_hse_uidx ON ujenzi_hse_incidents (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_hse_tenant_idx ON ujenzi_hse_incidents (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_inspections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  inspected_on TEXT NOT NULL,
  inspection_kind TEXT NOT NULL DEFAULT 'QAQC',
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_inspections_tenant_idx ON ujenzi_inspections (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_progress_certificates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  period TEXT NOT NULL,
  certified_amount NUMERIC(18,2),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  finance_handoff TEXT NOT NULL DEFAULT 'SUBMITTED_PENDING_FINANCE',
  journals_posted BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_progress_uidx ON ujenzi_progress_certificates (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_progress_tenant_idx ON ujenzi_progress_certificates (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_interior_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONCEPT',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_interior_uidx ON ujenzi_interior_packages (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_interior_tenant_idx ON ujenzi_interior_packages (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_ffe_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  interior_package_id TEXT REFERENCES ujenzi_interior_packages(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  item_code TEXT NOT NULL,
  specification TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'SPECIFIED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_ffe_tenant_idx ON ujenzi_ffe_items (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_compliance_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  authority TEXT NOT NULL,
  source TEXT NOT NULL,
  regulation TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  effective_from TEXT,
  applicability TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_comp_req_uidx ON ujenzi_compliance_requirements (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_comp_req_tenant_idx ON ujenzi_compliance_requirements (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_government_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  authority TEXT NOT NULL,
  application_kind TEXT NOT NULL,
  reference TEXT,
  connection_status TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  official_status TEXT NOT NULL DEFAULT 'USER_ENTERED',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_gov_app_tenant_idx ON ujenzi_government_applications (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_vision2050_scorecards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  pillar TEXT NOT NULL,
  metric_code TEXT NOT NULL,
  baseline TEXT,
  target TEXT,
  actual TEXT,
  evidence TEXT,
  verification TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
  endorsement_claim TEXT NOT NULL DEFAULT 'NONE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_v2050_tenant_idx ON ujenzi_vision2050_scorecards (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_handover_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_handover_uidx ON ujenzi_handover_packages (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_handover_tenant_idx ON ujenzi_handover_packages (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_knowledge (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES ujenzi_projects(id),
  knowledge_level TEXT NOT NULL DEFAULT 'PROJECT',
  title TEXT NOT NULL,
  evidence TEXT,
  confidence NUMERIC(5,4),
  validation TEXT NOT NULL DEFAULT 'UNVALIDATED',
  authority_granted BOOLEAN NOT NULL DEFAULT false,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_knowledge_tenant_idx ON ujenzi_knowledge (tenant_id);

CREATE TABLE IF NOT EXISTS ujenzi_sync_envelopes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  envelope_id TEXT NOT NULL,
  device_id TEXT,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  client_occurred_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACCEPTED',
  actor_user_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_sync_uidx ON ujenzi_sync_envelopes (tenant_id, envelope_id);
CREATE INDEX IF NOT EXISTS ujenzi_sync_tenant_idx ON ujenzi_sync_envelopes (tenant_id);

-- RLS tenant isolation (FORCE)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ujenzi_projects','ujenzi_briefs','ujenzi_documents','ujenzi_design_revisions','ujenzi_engineering_calculations',
    'ujenzi_land_sites','ujenzi_soil_tests','ujenzi_bim_models','ujenzi_boq_items','ujenzi_cost_trackers',
    'ujenzi_contracts','ujenzi_variations','ujenzi_claims','ujenzi_suppliers','ujenzi_procurement_packages',
    'ujenzi_contractors','ujenzi_workers','ujenzi_materials','ujenzi_material_lots','ujenzi_equipment',
    'ujenzi_site_reports','ujenzi_hse_incidents','ujenzi_inspections','ujenzi_progress_certificates',
    'ujenzi_interior_packages','ujenzi_ffe_items','ujenzi_compliance_requirements','ujenzi_government_applications',
    'ujenzi_vision2050_scorecards','ujenzi_handover_packages','ujenzi_knowledge','ujenzi_sync_envelopes'
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
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_projects, ujenzi_briefs, ujenzi_documents, ujenzi_design_revisions, ujenzi_engineering_calculations, ujenzi_land_sites, ujenzi_soil_tests, ujenzi_bim_models, ujenzi_boq_items, ujenzi_cost_trackers, ujenzi_contracts, ujenzi_variations, ujenzi_claims, ujenzi_suppliers, ujenzi_procurement_packages, ujenzi_contractors, ujenzi_workers, ujenzi_materials, ujenzi_material_lots, ujenzi_equipment, ujenzi_site_reports, ujenzi_hse_incidents, ujenzi_inspections, ujenzi_progress_certificates, ujenzi_interior_packages, ujenzi_ffe_items, ujenzi_compliance_requirements, ujenzi_government_applications, ujenzi_vision2050_scorecards, ujenzi_handover_packages, ujenzi_knowledge, ujenzi_sync_envelopes TO %I',
      r.rolname
    );
  END LOOP;
END
$$;
