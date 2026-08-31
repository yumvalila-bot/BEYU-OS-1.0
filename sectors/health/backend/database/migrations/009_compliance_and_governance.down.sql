-- Rollback Phase 3 additions (destructive; disposable environments only).
-- (No explicit BEGIN: PGlite tests run each statement; Postgres runs DDL transactionally per migration script.)

-- Remove inbound FK columns first (order matters).
ALTER TABLE health.lab_order_items
  DROP COLUMN IF EXISTS specimen_received_at,
  DROP COLUMN IF EXISTS analyzer_id,
  DROP COLUMN IF EXISTS chain_of_custody;
ALTER TABLE health.imaging_orders
  DROP COLUMN IF EXISTS equipment_id,
  DROP COLUMN IF EXISTS radiation_dose,
  DROP COLUMN IF EXISTS accession_number,
  DROP COLUMN IF EXISTS dicom_study_uid;
ALTER TABLE health.integration_status
  DROP COLUMN IF EXISTS config_state,
  DROP COLUMN IF EXISTS last_response_code,
  DROP COLUMN IF EXISTS last_error_detail,
  DROP COLUMN IF EXISTS missing_fields,
  DROP COLUMN IF EXISTS last_probe_at;
ALTER TABLE health.audit_log
  DROP COLUMN IF EXISTS professional_license_number,
  DROP COLUMN IF EXISTS practitioner_id,
  DROP COLUMN IF EXISTS facility_id,
  DROP COLUMN IF EXISTS ward,
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS room,
  DROP COLUMN IF EXISTS service_point,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS session_id,
  DROP COLUMN IF EXISTS location_lat,
  DROP COLUMN IF EXISTS location_lng,
  DROP COLUMN IF EXISTS signature_ref,
  DROP COLUMN IF EXISTS data_classification,
  DROP COLUMN IF EXISTS legal_hold,
  DROP COLUMN IF EXISTS retention_policy_id;

-- Drop tables.
DROP POLICY IF EXISTS health_public_health_events_isolation ON health.public_health_events;
DROP TABLE IF EXISTS health.public_health_events;
DROP POLICY IF EXISTS health_dialysis_sessions_isolation ON health.dialysis_sessions;
DROP TABLE IF EXISTS health.dialysis_sessions;
DROP POLICY IF EXISTS health_dialysis_machines_isolation ON health.dialysis_machines;
DROP TABLE IF EXISTS health.dialysis_machines;
DROP POLICY IF EXISTS health_incidents_isolation ON health.incidents;
DROP TABLE IF EXISTS health.incidents;
DROP POLICY IF EXISTS health_clinical_guidelines_isolation ON health.clinical_guidelines;
DROP TABLE IF EXISTS health.clinical_guidelines;
DROP POLICY IF EXISTS health_legal_holds_isolation ON health.legal_holds;
DROP TABLE IF EXISTS health.legal_holds;
DROP POLICY IF EXISTS health_retention_policies_isolation ON health.retention_policies;
DROP TABLE IF EXISTS health.retention_policies;
DROP POLICY IF EXISTS health_consents_isolation ON health.consents;
DROP TABLE IF EXISTS health.consents;
DROP POLICY IF EXISTS health_compliance_evidence_isolation ON health.compliance_evidence;
DROP TABLE IF EXISTS health.compliance_evidence;
DROP POLICY IF EXISTS health_compliance_controls_isolation ON health.compliance_controls;
DROP TABLE IF EXISTS health.compliance_controls;
DROP POLICY IF EXISTS health_lab_analyzers_isolation ON health.lab_analyzers;
DROP TABLE IF EXISTS health.lab_analyzers;
DROP POLICY IF EXISTS health_imaging_equipment_isolation ON health.imaging_equipment;
DROP TABLE IF EXISTS health.imaging_equipment;
DROP POLICY IF EXISTS health_practitioners_isolation ON health.practitioners;
DROP TABLE IF EXISTS health.practitioners;
DROP POLICY IF EXISTS health_facilities_isolation ON health.facilities;
DROP TABLE IF EXISTS health.facilities;
