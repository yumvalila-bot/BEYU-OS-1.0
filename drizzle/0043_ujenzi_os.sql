-- UJENZI OS — construction Sector OS under BEYU OS (additive).
--
-- Creates the construction operational domain: projects, sites, phases,
-- milestones, governed BOQ versions and items, cost records with the
-- ESTIMATE/BUDGET/COMMITTED/ACTUAL/FORECAST distinction, procurement
-- (requisitions, purchase orders), materials (catalog, movements), equipment
-- (register, allocations), site diaries, quality (inspection requests, NCRs),
-- HSE (incidents, hazards, toolbox talks), variations, claims, payment
-- certificates and handover punch lists.
--
-- CONSTITUTIONAL INVARIANTS (mirroring 0031/0034/0035):
--   * every table is tenant-owned (tenant_id FK to tenants);
--   * every table carries a classification column (default INTERNAL);
--   * every table gets ENABLE + FORCE ROW LEVEL SECURITY with a
--     beyu_tenant_ids() policy — RLS is the final database boundary;
--   * the runtime role (beyu_runtime, NOSUPERUSER NOBYPASSRLS) receives only
--     the table grants it needs; migrations themselves run on the admin role;
--   * no Ujenzi table may hold journals, treasury or capital execution —
--     Finance OS remains the only journal writer (CAP_POSTING LOCKED).
--
-- Verification blocks at the end fail the migration if any table lacks its
-- RLS policy or CHECK constraint.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES countries(code),
  client TEXT,
  contract_ref TEXT,
  contract_value NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'PLANNED',
  region TEXT,
  location TEXT,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  start_date TEXT,
  planned_end_date TEXT,
  actual_end_date TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_projects_tenant_code_uidx ON ujenzi_projects (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_projects_tenant_idx ON ujenzi_projects (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_projects_entity_idx ON ujenzi_projects (legal_entity_id);
CREATE INDEX IF NOT EXISTS ujenzi_projects_status_idx ON ujenzi_projects (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_project_sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  region TEXT,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_project_sites_project_code_uidx ON ujenzi_project_sites (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_project_sites_tenant_idx ON ujenzi_project_sites (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_project_sites_project_idx ON ujenzi_project_sites (project_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_project_phases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  progress_pct NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'PLANNED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_project_phases_project_code_uidx ON ujenzi_project_phases (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_project_phases_tenant_idx ON ujenzi_project_phases (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_project_phases_project_idx ON ujenzi_project_phases (project_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_milestones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  phase_id TEXT REFERENCES ujenzi_project_phases(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  due_date TEXT,
  achieved_date TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_milestones_project_code_uidx ON ujenzi_milestones (project_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_milestones_tenant_idx ON ujenzi_milestones (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_milestones_project_idx ON ujenzi_milestones (project_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_boqs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'TZS',
  total_value NUMERIC(18,2),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_boqs_project_version_uidx ON ujenzi_boqs (project_id, version);
CREATE INDEX IF NOT EXISTS ujenzi_boqs_tenant_idx ON ujenzi_boqs (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_boqs_project_idx ON ujenzi_boqs (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_boqs_status_idx ON ujenzi_boqs (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_boq_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  boq_id TEXT NOT NULL REFERENCES ujenzi_boqs(id),
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  section TEXT,
  unit TEXT NOT NULL,
  quantity NUMERIC(16,3) NOT NULL,
  rate NUMERIC(18,4) NOT NULL,
  cost_code TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_boq_items_boq_code_uidx ON ujenzi_boq_items (boq_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_boq_items_tenant_idx ON ujenzi_boq_items (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_boq_items_boq_idx ON ujenzi_boq_items (boq_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_cost_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  kind TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  cost_code TEXT,
  description TEXT,
  source_type TEXT,
  source_id TEXT,
  event_date TEXT,
  recorded_by TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_cost_records_tenant_idx ON ujenzi_cost_records (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_cost_records_project_idx ON ujenzi_cost_records (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_cost_records_kind_idx ON ujenzi_cost_records (kind);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_requisitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  required_by TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  requested_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_requisitions_tenant_code_uidx ON ujenzi_requisitions (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_requisitions_tenant_idx ON ujenzi_requisitions (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_requisitions_project_idx ON ujenzi_requisitions (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_requisitions_status_idx ON ujenzi_requisitions (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  requisition_id TEXT REFERENCES ujenzi_requisitions(id),
  code TEXT NOT NULL,
  supplier_name TEXT,
  description TEXT,
  amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  order_date TEXT,
  expected_delivery TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_purchase_orders_tenant_code_uidx ON ujenzi_purchase_orders (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_purchase_orders_tenant_idx ON ujenzi_purchase_orders (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_purchase_orders_project_idx ON ujenzi_purchase_orders (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_purchase_orders_status_idx ON ujenzi_purchase_orders (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_material_catalog (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'UNIT',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_material_catalog_tenant_code_uidx ON ujenzi_material_catalog (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_material_catalog_tenant_idx ON ujenzi_material_catalog (tenant_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_material_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  site_id TEXT REFERENCES ujenzi_project_sites(id),
  material_id TEXT NOT NULL REFERENCES ujenzi_material_catalog(id),
  movement_type TEXT NOT NULL,
  quantity NUMERIC(16,3) NOT NULL,
  unit TEXT NOT NULL,
  unit_cost NUMERIC(18,4),
  reference TEXT,
  moved_by TEXT,
  moved_on TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_material_movements_tenant_idx ON ujenzi_material_movements (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_material_movements_project_idx ON ujenzi_material_movements (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_material_movements_material_idx ON ujenzi_material_movements (material_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_equipment (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment_type TEXT,
  ownership TEXT NOT NULL DEFAULT 'OWNED',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_equipment_tenant_code_uidx ON ujenzi_equipment (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_equipment_tenant_idx ON ujenzi_equipment (tenant_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_equipment_allocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  equipment_id TEXT NOT NULL REFERENCES ujenzi_equipment(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  allocated_from TEXT,
  allocated_to TEXT,
  notes TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_equipment_allocations_tenant_idx ON ujenzi_equipment_allocations (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_equipment_allocations_equipment_idx ON ujenzi_equipment_allocations (equipment_id);
CREATE INDEX IF NOT EXISTS ujenzi_equipment_allocations_project_idx ON ujenzi_equipment_allocations (project_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_site_diaries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  site_id TEXT REFERENCES ujenzi_project_sites(id),
  diary_date TEXT NOT NULL,
  weather TEXT,
  labour_count INTEGER,
  labour_hours NUMERIC(12,2),
  work_done TEXT,
  hindrances TEXT,
  recorded_by TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_site_diaries_tenant_idx ON ujenzi_site_diaries (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_site_diaries_project_idx ON ujenzi_site_diaries (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_site_diaries_project_date_idx ON ujenzi_site_diaries (project_id, diary_date);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_inspection_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  inspection_type TEXT NOT NULL,
  requested_for TEXT,
  requested_by TEXT,
  inspector TEXT,
  result TEXT NOT NULL DEFAULT 'PENDING',
  findings TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_inspection_requests_tenant_code_uidx ON ujenzi_inspection_requests (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_inspection_requests_tenant_idx ON ujenzi_inspection_requests (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_inspection_requests_project_idx ON ujenzi_inspection_requests (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_inspection_requests_result_idx ON ujenzi_inspection_requests (result);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_ncrs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  raised_by TEXT,
  raised_on TEXT,
  corrective_action TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_ncrs_tenant_code_uidx ON ujenzi_ncrs (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_ncrs_tenant_idx ON ujenzi_ncrs (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_ncrs_project_idx ON ujenzi_ncrs (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_ncrs_status_idx ON ujenzi_ncrs (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_hse_incidents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  site_id TEXT REFERENCES ujenzi_project_sites(id),
  incident_type TEXT NOT NULL DEFAULT 'INCIDENT',
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  occurred_at TEXT,
  description TEXT NOT NULL,
  reported_by TEXT,
  status TEXT NOT NULL DEFAULT 'REPORTED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_hse_incidents_tenant_idx ON ujenzi_hse_incidents (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_hse_incidents_project_idx ON ujenzi_hse_incidents (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_hse_incidents_status_idx ON ujenzi_hse_incidents (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_hazard_register (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  hazard TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
  mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  identified_by TEXT,
  identified_on TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_hazard_register_tenant_idx ON ujenzi_hazard_register (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_hazard_register_project_idx ON ujenzi_hazard_register (project_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_toolbox_talks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  talk_date TEXT NOT NULL,
  topic TEXT NOT NULL,
  attendees INTEGER,
  delivered_by TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ujenzi_toolbox_talks_tenant_idx ON ujenzi_toolbox_talks (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_toolbox_talks_project_idx ON ujenzi_toolbox_talks (project_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_variations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  description TEXT,
  cost_impact NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  schedule_impact_days INTEGER,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  submitted_by TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_variations_tenant_code_uidx ON ujenzi_variations (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_variations_tenant_idx ON ujenzi_variations (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_variations_project_idx ON ujenzi_variations (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_variations_status_idx ON ujenzi_variations (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  claimant TEXT,
  respondent TEXT,
  amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  notice_date TEXT,
  description TEXT,
  evidence_ref TEXT,
  status TEXT NOT NULL DEFAULT 'NOTIFIED',
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_claims_tenant_code_uidx ON ujenzi_claims (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_claims_tenant_idx ON ujenzi_claims (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_claims_project_idx ON ujenzi_claims (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_claims_status_idx ON ujenzi_claims (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_payment_certificates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  certificate_no INTEGER NOT NULL,
  period_from TEXT,
  period_to TEXT,
  gross_value NUMERIC(18,2) NOT NULL,
  retention NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_value NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  certified_by TEXT,
  certified_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_payment_certificates_tenant_code_uidx ON ujenzi_payment_certificates (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_payment_certificates_project_no_uidx ON ujenzi_payment_certificates (project_id, certificate_no);
CREATE INDEX IF NOT EXISTS ujenzi_payment_certificates_tenant_idx ON ujenzi_payment_certificates (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_payment_certificates_project_idx ON ujenzi_payment_certificates (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_payment_certificates_status_idx ON ujenzi_payment_certificates (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ujenzi_punch_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES ujenzi_projects(id),
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  raised_by TEXT,
  raised_on TEXT,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_punch_items_tenant_code_uidx ON ujenzi_punch_items (tenant_id, code);
CREATE INDEX IF NOT EXISTS ujenzi_punch_items_tenant_idx ON ujenzi_punch_items (tenant_id);
CREATE INDEX IF NOT EXISTS ujenzi_punch_items_project_idx ON ujenzi_punch_items (project_id);
CREATE INDEX IF NOT EXISTS ujenzi_punch_items_status_idx ON ujenzi_punch_items (status);

--> statement-breakpoint
--> statement-breakpoint
-- Discriminating CHECK constraints (idempotent: added only when absent).
DO $$
DECLARE
  chk record;
BEGIN
  FOR chk IN SELECT * FROM (VALUES
    ('ujenzi_projects','ujenzi_projects_status_ck','status IN (''PLANNED'',''ACTIVE'',''COMPLETED'',''HANDED_OVER'',''ARCHIVED'')'),
    ('ujenzi_boqs','ujenzi_boqs_status_ck','status IN (''DRAFT'',''SUBMITTED'',''APPROVED'',''SUPERSEDED'')'),
    ('ujenzi_boqs','ujenzi_boqs_version_ck','version >= 1'),
    ('ujenzi_cost_records','ujenzi_cost_records_kind_ck','kind IN (''ESTIMATE'',''BUDGET'',''COMMITTED'',''ACTUAL'',''FORECAST'')'),
    ('ujenzi_requisitions','ujenzi_requisitions_status_ck','status IN (''DRAFT'',''SUBMITTED'',''APPROVED'',''REJECTED'',''CONVERTED'')'),
    ('ujenzi_purchase_orders','ujenzi_purchase_orders_status_ck','status IN (''DRAFT'',''APPROVED'',''ISSUED'',''RECEIVED'',''CANCELLED'')'),
    ('ujenzi_material_movements','ujenzi_material_movements_type_ck','movement_type IN (''RECEIPT'',''ISSUE'',''RETURN'',''WASTAGE'')'),
    ('ujenzi_equipment','ujenzi_equipment_ownership_ck','ownership IN (''OWNED'',''LEASED'',''HIRED'')'),
    ('ujenzi_inspection_requests','ujenzi_inspection_requests_result_ck','result IN (''PENDING'',''PASSED'',''FAILED'',''REJECTED'')'),
    ('ujenzi_ncrs','ujenzi_ncrs_status_ck','status IN (''OPEN'',''ACTION_TAKEN'',''VERIFIED'',''CLOSED'')'),
    ('ujenzi_ncrs','ujenzi_ncrs_severity_ck','severity IN (''LOW'',''MEDIUM'',''HIGH'',''CRITICAL'')'),
    ('ujenzi_hse_incidents','ujenzi_hse_incidents_type_ck','incident_type IN (''INCIDENT'',''NEAR_MISS'')'),
    ('ujenzi_hse_incidents','ujenzi_hse_incidents_severity_ck','severity IN (''LOW'',''MEDIUM'',''HIGH'',''CRITICAL'')'),
    ('ujenzi_hazard_register','ujenzi_hazard_register_risk_ck','risk_level IN (''LOW'',''MEDIUM'',''HIGH'',''CRITICAL'')'),
    ('ujenzi_variations','ujenzi_variations_status_ck','status IN (''SUBMITTED'',''UNDER_REVIEW'',''APPROVED'',''REJECTED'',''IMPLEMENTED'')'),
    ('ujenzi_claims','ujenzi_claims_status_ck','status IN (''NOTIFIED'',''UNDER_REVIEW'',''DECIDED'',''SETTLED'',''WITHDRAWN'')'),
    ('ujenzi_payment_certificates','ujenzi_payment_certificates_status_ck','status IN (''DRAFT'',''CERTIFIED'',''SUPERSEDED'')'),
    ('ujenzi_punch_items','ujenzi_punch_items_status_ck','status IN (''OPEN'',''IN_PROGRESS'',''CLOSED'',''VERIFIED'')')
  ) AS checks(table_name, constraint_name, expr)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint pc
      JOIN pg_class t ON t.oid = pc.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = chk.table_name AND pc.conname = chk.constraint_name AND pc.contype = 'c'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)', chk.table_name, chk.constraint_name, chk.expr);
    END IF;
  END LOOP;
END
$$;


DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ujenzi_projects','ujenzi_project_sites','ujenzi_project_phases','ujenzi_milestones',
    'ujenzi_boqs','ujenzi_boq_items','ujenzi_cost_records',
    'ujenzi_requisitions','ujenzi_purchase_orders',
    'ujenzi_material_catalog','ujenzi_material_movements',
    'ujenzi_equipment','ujenzi_equipment_allocations',
    'ujenzi_site_diaries','ujenzi_inspection_requests','ujenzi_ncrs',
    'ujenzi_hse_incidents','ujenzi_hazard_register','ujenzi_toolbox_talks',
    'ujenzi_variations','ujenzi_claims','ujenzi_payment_certificates','ujenzi_punch_items'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))',
      t || '_tenant_isolation', t);
  END LOOP;
END
$$;

--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ujenzi_projects, ujenzi_project_sites, ujenzi_project_phases, ujenzi_milestones, ujenzi_boqs, ujenzi_boq_items, ujenzi_cost_records, ujenzi_requisitions, ujenzi_purchase_orders, ujenzi_material_catalog, ujenzi_material_movements, ujenzi_equipment, ujenzi_equipment_allocations, ujenzi_site_diaries, ujenzi_inspection_requests, ujenzi_ncrs, ujenzi_hse_incidents, ujenzi_hazard_register, ujenzi_toolbox_talks, ujenzi_variations, ujenzi_claims, ujenzi_payment_certificates, ujenzi_punch_items TO %I', r.rolname);
  END LOOP;
END
$$;

--> statement-breakpoint

-- Verification 1: every Ujenzi table exists, has RLS enabled and FORCEd, and
-- carries a beyu_tenant_ids() isolation policy.
DO $$
DECLARE
  table_name text;
  rls_enabled boolean;
  rls_forced boolean;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY[
    'ujenzi_projects','ujenzi_project_sites','ujenzi_project_phases','ujenzi_milestones',
    'ujenzi_boqs','ujenzi_boq_items','ujenzi_cost_records',
    'ujenzi_requisitions','ujenzi_purchase_orders',
    'ujenzi_material_catalog','ujenzi_material_movements',
    'ujenzi_equipment','ujenzi_equipment_allocations',
    'ujenzi_site_diaries','ujenzi_inspection_requests','ujenzi_ncrs',
    'ujenzi_hse_incidents','ujenzi_hazard_register','ujenzi_toolbox_talks',
    'ujenzi_variations','ujenzi_claims','ujenzi_payment_certificates','ujenzi_punch_items'])
  LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity INTO rls_enabled, rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = table_name AND c.relkind = 'r';
    IF rls_enabled IS NULL THEN
      RAISE EXCEPTION 'Migration 0043 verification failed: table % does not exist', table_name;
    END IF;
    IF NOT rls_enabled OR NOT rls_forced THEN
      RAISE EXCEPTION 'Migration 0043 verification failed: table % must have ENABLE + FORCE ROW LEVEL SECURITY', table_name;
    END IF;
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = table_name AND qual LIKE '%beyu_tenant_ids()%';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0043 verification failed: % missing beyu_tenant_ids() policy', table_name;
    END IF;
  END LOOP;
END $$;

--> statement-breakpoint

-- Verification 2: the discriminating CHECK constraints exist.
DO $$
DECLARE
  expected_count int;
  actual_count int;
BEGIN
  SELECT count(*) INTO expected_count FROM unnest(ARRAY[
    'ujenzi_projects_status_ck','ujenzi_boqs_status_ck','ujenzi_boqs_version_ck',
    'ujenzi_cost_records_kind_ck','ujenzi_requisitions_status_ck','ujenzi_purchase_orders_status_ck',
    'ujenzi_material_movements_type_ck','ujenzi_equipment_ownership_ck',
    'ujenzi_inspection_requests_result_ck','ujenzi_ncrs_status_ck','ujenzi_ncrs_severity_ck',
    'ujenzi_hse_incidents_type_ck','ujenzi_hse_incidents_severity_ck','ujenzi_hazard_register_risk_ck',
    'ujenzi_variations_status_ck','ujenzi_claims_status_ck','ujenzi_payment_certificates_status_ck',
    'ujenzi_punch_items_status_ck']) AS c(constraint_name);
  SELECT count(*) INTO actual_count
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.conname LIKE 'ujenzi_%' AND c.contype = 'c'
    AND c.conname = ANY (ARRAY['ujenzi_projects_status_ck','ujenzi_boqs_status_ck','ujenzi_boqs_version_ck',
    'ujenzi_cost_records_kind_ck','ujenzi_requisitions_status_ck','ujenzi_purchase_orders_status_ck',
    'ujenzi_material_movements_type_ck','ujenzi_equipment_ownership_ck',
    'ujenzi_inspection_requests_result_ck','ujenzi_ncrs_status_ck','ujenzi_ncrs_severity_ck',
    'ujenzi_hse_incidents_type_ck','ujenzi_hse_incidents_severity_ck','ujenzi_hazard_register_risk_ck',
    'ujenzi_variations_status_ck','ujenzi_claims_status_ck','ujenzi_payment_certificates_status_ck',
    'ujenzi_punch_items_status_ck']);
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Migration 0043 verification failed: expected % ujenzi CHECK constraints, found %', expected_count, actual_count;
  END IF;
END $$;
