-- Phase 3 — Professional Identity, Facilities, Compliance Controls, Consent, Retention, Public Health Registry
--
-- Extends the audit envelope with professional_license_number, facility_id,
-- location metadata; adds professional-practitioner and facilities registers;
-- adds compliance controls + evidence linkage, consent, data retention,
-- notifiable-disease/public-health events, dialysis foundations, incidents,
-- and external dependency state. All tables are RLS-protected and
-- append-only where audit-relevant. All columns are tenant_isolated.

-- (No explicit BEGIN: PGlite tests run each statement; Postgres runs DDL transactionally per migration script.)

-- =============================================================
-- 1. Facilities (Health Facility Registry)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.facilities (
  facility_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text NOT NULL,
  country_code    text NOT NULL,
  facility_code   text NOT NULL,               -- human-readable facility code (e.g. HOSP-1)
  facility_name   text NOT NULL,
  facility_type   text NOT NULL,               -- hospital | health_center | dispensary | clinic | lab | pharmacy | dialysis | optical | other
  ownership       text NOT NULL DEFAULT 'private', -- government | private | faith_based | ngo | parastatal | other
  registration_number text,                    -- MoH facility registration number
  operating_status text NOT NULL DEFAULT 'active', -- active | suspended | closed | pending_verification
  license_expiry  date,
  address         text,
  ward            text,
  department_default text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, facility_code),
  CHECK (facility_type IN ('hospital','health_center','dispensary','clinic','lab','pharmacy','dialysis','optical','other')),
  CHECK (ownership IN ('government','private','faith_based','ngo','parastatal','other')),
  CHECK (operating_status IN ('active','suspended','closed','pending_verification'))
);
ALTER TABLE health.facilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_facilities_isolation ON health.facilities;
CREATE POLICY health_facilities_isolation ON health.facilities
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 2. Professional Practitioner Registry
-- =============================================================
CREATE TABLE IF NOT EXISTS health.practitioners (
  practitioner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  global_user_id  uuid REFERENCES beyu_identity.users(global_user_id),
  full_name       text NOT NULL,
  cadre           text NOT NULL,               -- doctor | specialist | nurse | midwife | pharmacist | pharmacy_tech | lab_tech | radiographer | optometrist | ophthalmologist | paramedic | other
  license_number  text,                        -- Do NOT invent. NULL until supplied via registration workflow.
  licensing_authority text,                    -- e.g. 'MCT','TNMC','Pharmacy Council TZ'
  license_type    text,
  registration_number text,
  license_status  text NOT NULL DEFAULT 'external_verification_required',
                 -- unverified | verified_pending | verified | expired | suspended | revoked | external_verification_required
  license_issue_date date,
  license_expiry_date date,
  verification_status text NOT NULL DEFAULT 'external_verification_required',
  verification_date timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  scope_of_practice text[],                    -- code list of authorized actions (e.g. {'rx:write','rx:controlled'})
  specialties     text[],
  cpd_due_date    date,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (cadre IN ('doctor','specialist','nurse','midwife','pharmacist','pharmacy_tech','lab_tech','radiographer','optometrist','ophthalmologist','paramedic','other')),
  CHECK (license_status IN ('unverified','verified_pending','verified','expired','suspended','revoked','external_verification_required')),
  CHECK (verification_status IN ('unverified','external_verification_required','verified','failed'))
);
ALTER TABLE health.practitioners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_practitioners_isolation ON health.practitioners;
CREATE POLICY health_practitioners_isolation ON health.practitioners
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);
CREATE UNIQUE INDEX IF NOT EXISTS idx_practitioners_tenant_license ON health.practitioners (tenant_id, licensing_authority, license_number) WHERE license_number IS NOT NULL;

-- =============================================================
-- 3. Audit envelope extension: professional_license, facility_id, location/timezone/session
-- =============================================================
ALTER TABLE health.audit_log
  ADD COLUMN IF NOT EXISTS professional_license_number text,
  ADD COLUMN IF NOT EXISTS practitioner_id     uuid REFERENCES health.practitioners(practitioner_id),
  ADD COLUMN IF NOT EXISTS facility_id         uuid REFERENCES health.facilities(facility_id),
  ADD COLUMN IF NOT EXISTS ward                    text,
  ADD COLUMN IF NOT EXISTS department              text,
  ADD COLUMN IF NOT EXISTS room                    text,
  ADD COLUMN IF NOT EXISTS service_point           text,
  ADD COLUMN IF NOT EXISTS timezone                text,
  ADD COLUMN IF NOT EXISTS session_id              text,
  ADD COLUMN IF NOT EXISTS location_lat            numeric,
  ADD COLUMN IF NOT EXISTS location_lng            numeric,
  ADD COLUMN IF NOT EXISTS signature_ref           text,     -- hash/reference to electronic signature if applicable
  ADD COLUMN IF NOT EXISTS data_classification     text DEFAULT 'phi',
  ADD COLUMN IF NOT EXISTS legal_hold              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_policy_id     text;

-- =============================================================
-- 4. Compliance Control Registry (machine-readable controls)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.compliance_controls (
  control_id      text PRIMARY KEY,              -- e.g. TZ-PDPA-01, NABH-CLIN-03, ISO27799-AUD-01
  authority       text NOT NULL,                 -- e.g. 'Tanzania PDPA 2022','NABH 5th Ed','ISO 27799','MOH TZ','Pharmacy Act 2011','TMDA','NHIF','MCT','TNMC','Internal'
  jurisdiction    text NOT NULL DEFAULT 'TZ',
  category        text NOT NULL,                 -- privacy | security | clinical | pharmacy | lab | radiology | billing | workforce | facility | records | ai | finance | emergency
  requirement     text NOT NULL,
  version         text NOT NULL DEFAULT '1.0',
  effective_date  date,
  review_date     date,
  implementation_status text NOT NULL DEFAULT 'not_implemented',
                 -- not_implemented | partially_implemented | implemented | external_dependency | requires_approval | not_applicable | evidence_required
  evidence_reference text,                       -- pointer (e.g. test name or audit event)
  owner_role      text,
  risk_level      text NOT NULL DEFAULT 'medium',-- low | medium | high | critical
  applicability   text NOT NULL DEFAULT 'all',   -- expression or 'all'
  verification_method text,
  external_dependency boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (implementation_status IN ('not_implemented','partially_implemented','implemented','external_dependency','requires_approval','not_applicable','evidence_required')),
  CHECK (risk_level IN ('low','medium','high','critical'))
);
ALTER TABLE health.compliance_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_compliance_controls_isolation ON health.compliance_controls;
CREATE POLICY health_compliance_controls_isolation ON health.compliance_controls
  USING (current_setting('app.tenant_id', true) IS NOT NULL); -- controls are a global reference; tenant-level write guarded by tenant:admin at app layer

CREATE TABLE IF NOT EXISTS health.compliance_evidence (
  evidence_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  control_id      text NOT NULL REFERENCES health.compliance_controls(control_id),
  evidence_type   text NOT NULL,                -- test | audit_log | migration | document | external_verification | approval | configuration
  reference       text NOT NULL,                -- test name / audit_id / doc path / external response id
  status          text NOT NULL DEFAULT 'collected', -- collected | reviewed | expired | rejected
  collected_by    uuid REFERENCES beyu_identity.users(global_user_id),
  collected_at    timestamptz NOT NULL DEFAULT now(),
  valid_until     date,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (evidence_type IN ('test','audit_log','migration','document','external_verification','approval','configuration')),
  CHECK (status IN ('collected','reviewed','expired','rejected'))
);
ALTER TABLE health.compliance_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_compliance_evidence_isolation ON health.compliance_evidence;
CREATE POLICY health_compliance_evidence_isolation ON health.compliance_evidence
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 5. Consent engine (non-boolean; purpose/scope/recipient)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.consents (
  consent_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  purpose         text NOT NULL,                -- e.g. 'treatment','payment','research','public_health','telehealth','data_share_nhif','fhir_export'
  scope           text[] NOT NULL DEFAULT '{}',
  data_categories text[] NOT NULL DEFAULT '{}', -- e.g. {'demographics','diagnoses','medications','lab_results'}
  recipient       text,                         -- explicit recipient (e.g. provider, insurer 'NHIF')
  legal_basis     text NOT NULL DEFAULT 'consent', -- consent | contract | legal_obligation | vital_interest | public_task | legitimate_interest
  status          text NOT NULL DEFAULT 'active', -- active | withdrawn | expired | refused
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  captured_by     uuid REFERENCES beyu_identity.users(global_user_id),
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb, -- signature, form_id, channel, IP
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('active','withdrawn','expired','refused')),
  CHECK (legal_basis IN ('consent','contract','legal_obligation','vital_interest','public_task','legitimate_interest'))
);
ALTER TABLE health.consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_consents_isolation ON health.consents;
CREATE POLICY health_consents_isolation ON health.consents
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 6. Data Retention Policies + Legal Holds
-- =============================================================
CREATE TABLE IF NOT EXISTS health.retention_policies (
  policy_id       text PRIMARY KEY,              -- e.g. 'clinical_records','audit_logs','financial_records','lab_results','consents'
  resource_type   text NOT NULL,
  retention_years integer NOT NULL,
  applies_to_country text,                      -- NULL = default
  legal_reference text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE health.retention_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_retention_policies_isolation ON health.retention_policies;
CREATE POLICY health_retention_policies_isolation ON health.retention_policies
  USING (current_setting('app.tenant_id', true) IS NOT NULL) -- global reference read; writes guarded at app layer
  WITH CHECK (current_setting('app.tenant_id', true) IS NOT NULL);

CREATE TABLE IF NOT EXISTS health.legal_holds (
  hold_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  resource_type   text NOT NULL,
  resource_id     uuid,
  reason          text NOT NULL,
  ordered_by      text NOT NULL,
  ordered_at      timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text
);
ALTER TABLE health.legal_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_legal_holds_isolation ON health.legal_holds;
CREATE POLICY health_legal_holds_isolation ON health.legal_holds
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 7. Clinical Guideline Registry (versioned references)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.clinical_guidelines (
  guideline_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL,                -- e.g. 'TZ-STG-2021'
  title           text NOT NULL,
  authority       text NOT NULL,                -- 'MOH TZ','WHO','Internal'
  version         text NOT NULL,
  effective_date  date NOT NULL,
  superseded_date date,
  source_reference text,
  clinical_domain text NOT NULL,
  approval_status text NOT NULL DEFAULT 'registered', -- registered | approved | superseded | withdrawn
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version),
  CHECK (approval_status IN ('registered','approved','superseded','withdrawn'))
);
ALTER TABLE health.clinical_guidelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_clinical_guidelines_isolation ON health.clinical_guidelines;
CREATE POLICY health_clinical_guidelines_isolation ON health.clinical_guidelines
  USING (current_setting('app.tenant_id', true) IS NOT NULL) -- global reference read; writes guarded at app layer
  WITH CHECK (current_setting('app.tenant_id', true) IS NOT NULL);

-- =============================================================
-- 8. Incidents / Patient Safety (quality & risk)
-- =============================================================
CREATE SEQUENCE IF NOT EXISTS health.incidents_no_seq;
CREATE TABLE IF NOT EXISTS health.incidents (
  incident_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  incident_no     text NOT NULL,
  category        text NOT NULL,                -- patient_safety | medication | infection_control | fall | needle_stick | data_breach | near_miss | security | equipment | other
  severity        text NOT NULL DEFAULT 'low',  -- low | moderate | severe | sentinel
  status          text NOT NULL DEFAULT 'reported', -- reported | triaged | investigating | resolved | closed
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE SET NULL,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  description     text NOT NULL,
  location        text,
  facility_id     uuid REFERENCES health.facilities(facility_id),
  reported_by     uuid REFERENCES beyu_identity.users(global_user_id),
  reported_at     timestamptz NOT NULL DEFAULT now(),
  rca_summary     text,
  capa            jsonb,                        -- corrective/preventive actions
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (category IN ('patient_safety','medication','infection_control','fall','needle_stick','data_breach','near_miss','security','equipment','other')),
  CHECK (severity IN ('low','moderate','severe','sentinel')),
  CHECK (status IN ('reported','triaged','investigating','resolved','closed'))
);
ALTER TABLE health.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_incidents_isolation ON health.incidents;
CREATE POLICY health_incidents_isolation ON health.incidents
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 9. Dialysis domain (session-centric, fail-closed)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.dialysis_machines (
  machine_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  facility_id     uuid REFERENCES health.facilities(facility_id),
  asset_tag       text NOT NULL,
  model           text,
  serial_number   text,
  last_maintenance timestamptz,
  next_maintenance timestamptz,
  water_quality_last_test timestamptz,
  status          text NOT NULL DEFAULT 'available', -- available | in_use | maintenance | out_of_service
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, asset_tag),
  CHECK (status IN ('available','in_use','maintenance','out_of_service'))
);
ALTER TABLE health.dialysis_machines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_dialysis_machines_isolation ON health.dialysis_machines;
CREATE POLICY health_dialysis_machines_isolation ON health.dialysis_machines
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

CREATE TABLE IF NOT EXISTS health.dialysis_sessions (
  session_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  machine_id      uuid REFERENCES health.dialysis_machines(machine_id),
  facility_id     uuid REFERENCES health.facilities(facility_id),
  provider_id     uuid REFERENCES health.practitioners(practitioner_id),
  session_type    text NOT NULL DEFAULT 'hemodialysis', -- hemodialysis | peritoneal | crrt
  start_time      timestamptz,
  end_time        timestamptz,
  duration_min    integer,
  pre_weight_kg   numeric,
  post_weight_kg  numeric,
  ultrafiltration_l numeric,
  access_type     text,
  anticoagulant   text,
  dialyzer        text,
  adverse_events  jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes           text,
  status          text NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | completed | interrupted | cancelled
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (session_type IN ('hemodialysis','peritoneal','crrt')),
  CHECK (status IN ('scheduled','in_progress','completed','interrupted','cancelled'))
);
ALTER TABLE health.dialysis_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_dialysis_sessions_isolation ON health.dialysis_sessions;
CREATE POLICY health_dialysis_sessions_isolation ON health.dialysis_sessions
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 10. Notifiable / Public Health Events
-- =============================================================
CREATE TABLE IF NOT EXISTS health.public_health_events (
  event_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  event_type      text NOT NULL,                -- notifiable_disease | outbreak | adverse_reaction | immunization | maternal_death | perinatal_death | aefi
  disease_code    text,                        -- ICD-10 or national code placeholder (not invented)
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE SET NULL,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  onset_date      date,
  status          text NOT NULL DEFAULT 'draft', -- draft | validated | submitted | acknowledged | rejected | blocked
  submitted_at    timestamptz,
  submission_ref  text,                        -- adapter idempotency key / external reference
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  reported_by     uuid REFERENCES beyu_identity.users(global_user_id),
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (event_type IN ('notifiable_disease','outbreak','adverse_reaction','immunization','maternal_death','perinatal_death','aefi')),
  CHECK (status IN ('draft','validated','submitted','acknowledged','rejected','blocked'))
);
ALTER TABLE health.public_health_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_public_health_events_isolation ON health.public_health_events;
CREATE POLICY health_public_health_events_isolation ON health.public_health_events
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 11. External dependency state registry (per-tenant granular)
-- =============================================================
ALTER TABLE health.integration_status
  ADD COLUMN IF NOT EXISTS config_state text NOT NULL DEFAULT 'not_configured', -- not_configured | configured | validated | connected | verified | degraded | blocked
  ADD COLUMN IF NOT EXISTS last_response_code integer,
  ADD COLUMN IF NOT EXISTS last_error_detail text,
  ADD COLUMN IF NOT EXISTS missing_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_probe_at timestamptz;
ALTER TABLE health.integration_status DROP CONSTRAINT IF EXISTS integration_config_state_check;
ALTER TABLE health.integration_status ADD CONSTRAINT integration_config_state_check
  CHECK (config_state IN ('not_configured','configured','validated','connected','verified','degraded','blocked'));

-- =============================================================
-- 12. Radiology: equipment registry + exposure record (radiation protection)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.imaging_equipment (
  equipment_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  facility_id     uuid REFERENCES health.facilities(facility_id),
  asset_tag       text NOT NULL,
  modality        text NOT NULL,
  model           text,
  serial_number   text,
  calibration_due date,
  last_qc         timestamptz,
  status          text NOT NULL DEFAULT 'available',
  UNIQUE (tenant_id, asset_tag),
  CHECK (modality IN ('xray','ct','mri','ultrasound','doppler','mammo','fluoroscopy','nuclear','other')),
  CHECK (status IN ('available','in_use','maintenance','out_of_service'))
);
ALTER TABLE health.imaging_equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_imaging_equipment_isolation ON health.imaging_equipment;
CREATE POLICY health_imaging_equipment_isolation ON health.imaging_equipment
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

ALTER TABLE health.imaging_orders
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES health.imaging_equipment(equipment_id),
  ADD COLUMN IF NOT EXISTS radiation_dose numeric,
  ADD COLUMN IF NOT EXISTS accession_number text,
  ADD COLUMN IF NOT EXISTS dicom_study_uid text;

-- =============================================================
-- 13. Laboratory: analyzers + QC registry
-- =============================================================
CREATE TABLE IF NOT EXISTS health.lab_analyzers (
  analyzer_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  facility_id     uuid REFERENCES health.facilities(facility_id),
  asset_tag       text NOT NULL,
  test_codes      text[] NOT NULL DEFAULT '{}',
  last_calibration timestamptz,
  last_qc         timestamptz,
  next_maintenance timestamptz,
  status          text NOT NULL DEFAULT 'available',
  UNIQUE (tenant_id, asset_tag),
  CHECK (status IN ('available','in_use','maintenance','out_of_service'))
);
ALTER TABLE health.lab_analyzers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_lab_analyzers_isolation ON health.lab_analyzers;
CREATE POLICY health_lab_analyzers_isolation ON health.lab_analyzers
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

ALTER TABLE health.lab_order_items
  ADD COLUMN IF NOT EXISTS specimen_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS analyzer_id uuid REFERENCES health.lab_analyzers(analyzer_id),
  ADD COLUMN IF NOT EXISTS chain_of_custody jsonb NOT NULL DEFAULT '{}'::jsonb;

-- =============================================================
-- 14. Seed initial retention policies (sane defaults, operator can amend)
-- =============================================================
INSERT INTO health.retention_policies (policy_id, resource_type, retention_years, legal_reference, notes) VALUES
  ('clinical_records', 'encounter',   10, 'Tanzania Public Health Act 2009 / Medical Council guidelines', 'Adult clinical records default; paediatric records extend to age 18 + N years.'),
  ('audit_logs',       'audit_log',    7, 'Internal security policy aligned with ISO 27799', 'Audit retention; legal hold extends.'),
  ('financial_records','invoice',      7, 'Tanzania tax law', 'Financial documents per tax authority.'),
  ('lab_results',      'lab_result',  10, 'Health laboratory regulatory practice', 'Lab records retention.'),
  ('prescriptions',    'medication',   5, 'Pharmacy Act 2011', 'Prescription register retention.'),
  ('imaging',          'imaging',     10, 'Radiation protection / medical records', 'Imaging study + report retention.'),
  ('consents',         'consent',      5, 'PDPA 2022', 'Consent records retained per privacy regulation.'),
  ('incidents',        'incident',    10, 'Patient safety policy', 'Incident and risk management records.'),
  ('public_health',    'public_health_event', 20, 'Public Health Act 2009', 'Notifiable disease surveillance records.')
ON CONFLICT (policy_id) DO NOTHING;
