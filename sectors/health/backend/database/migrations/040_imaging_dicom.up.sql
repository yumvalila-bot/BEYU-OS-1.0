-- Migration 040 — Imaging: DICOM study/series metadata, acquisition state,
-- report addenda and critical-result notification.
--
-- WHY THIS EXISTS
--   `health.imaging_orders` (007) carried an order and even a
--   `dicom_study_uid` string, and `health.imaging_reports` carried findings
--   with an amendment chain. What was missing is everything that makes imaging
--   an operating surface rather than an order form: no study/series metadata to
--   associate acquired images with a patient, no modality worklist, no
--   acquisition status, no addendum to a signed report, and no critical-result
--   notification with a named recipient who acknowledged it. A critical finding
--   that nobody acknowledged is the single most dangerous gap in that list.
--
-- PACS / DICOMweb BOUNDARY — READ CAREFULLY
--   This migration stores DICOM IDENTIFIERS and metadata. It does NOT implement
--   a PACS, a DICOMweb service, an image store or a viewer, and nothing here
--   pretends to serve pixels. `pacs_external_reference` is an opaque pointer
--   supplied BY an external system, and `retrieval_state` records honestly
--   whether images can be fetched here (they cannot, without an external
--   PACS/DICOMweb endpoint configured in `health.integration_status`).
--   Building a bespoke PACS to be able to write "DICOM supported" would be the
--   wrong trade; identifiers + workflow + an honest boundary is the right one.
--
-- NON-DUPLICATION
--   * Study-level workflow stays anchored on `health.imaging_orders` (the order
--     of record). A study row is the ACQUISITION that fulfilled an order; it is
--     not a second order table and never duplicates clinical indication,
--     urgency or ordering provider.
--   * Reports remain `health.imaging_reports`; addenda are child rows so the
--     signed report is never overwritten (same pattern as lab amendments).
--   * Patient identity remains `health.patients`; the DICOM patient association
--     is validated against it, and an unmatched study is parked as
--     `patient_match_status='unmatched'` rather than guessed.
--   * Notifications reuse `health.critical_findings` only for imaging; a
--     generic notification table already exists for delivery, and this table
--     records the clinical acknowledgement, which is a different fact.

BEGIN;

CREATE TABLE IF NOT EXISTS health.imaging_studies (
  study_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  imaging_order_id uuid REFERENCES health.imaging_orders(imaging_order_id) ON DELETE SET NULL,
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE SET NULL,
  patient_match_status text NOT NULL DEFAULT 'unmatched',
    -- matched | unmatched | ambiguous | rejected
  accession_number text NOT NULL,
  study_instance_uid text NOT NULL,          -- DICOM StudyInstanceUID (1.2.840… style)
  study_date      timestamptz,
  study_description text,
  modality        text NOT NULL,              -- CT | MR | CR | DX | US | NM | XE | MG …
  body_part       text,
  laterality      text,
  institution_name text,
  station_name    text,
  referring_provider_id uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  performed_by    uuid REFERENCES beyu_identity.users(global_user_id),
  acquisition_status text NOT NULL DEFAULT 'scheduled',
    -- scheduled | in_progress | completed | cancelled | failed
  reported_status text NOT NULL DEFAULT 'pending',
    -- pending | drafted | verified | amended_with_pending
  -- DICOM integrity, as observed. Never computed from thin air.
  validation_state text NOT NULL DEFAULT 'not_validated',
    -- not_validated | passed | failed | skipped
  validation_errors text[],
  transfer_syntax_uid text,
  num_instances   integer CHECK (num_instances IS NULL OR num_instances >= 0),
  num_series      integer CHECK (num_series IS NULL OR num_series >= 0),
  pixel_data_present boolean NOT NULL DEFAULT false,
  -- Pixels are NOT stored in this database. The only honest values here are
  -- 'not_available_here' (no PACS wired) and 'external_reference' (an outside
  -- system holds them).
  image_availability text NOT NULL DEFAULT 'not_available_here',
  pacs_external_reference text,
  scheduled_at    timestamptz,
  acquired_at     timestamptz,
  completed_at    timestamptz,
  preparation_notes text,
  radiation_dose_mgy numeric CHECK (radiation_dose_mgy IS NULL OR radiation_dose_mgy >= 0),
  dose_length_product numeric CHECK (dose_length_product IS NULL OR dose_length_product >= 0),
  contrast_agent  text,
  contrast_volume_ml numeric CHECK (contrast_volume_ml IS NULL OR contrast_volume_ml >= 0),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, study_instance_uid),
  UNIQUE (tenant_id, accession_number),
  CHECK (patient_match_status IN ('matched','unmatched','ambiguous','rejected')),
  CHECK (acquisition_status IN ('scheduled','in_progress','completed','cancelled','failed')),
  CHECK (reported_status IN ('pending','drafted','verified','amended_with_pending')),
  CHECK (validation_state IN ('not_validated','passed','failed','skipped')),
  CHECK (image_availability IN ('not_available_here','external_reference')),
  -- A study cannot be called 'matched' without a patient, and cannot be called
  -- 'completed' without images having been acquired.
  CHECK ((patient_match_status <> 'matched') OR patient_id IS NOT NULL),
  CHECK ((acquisition_status <> 'completed') OR acquired_at IS NOT NULL),
  -- Pixel data is never claimed by this database.
  CHECK (pixel_data_present = false)
);
CREATE INDEX IF NOT EXISTS idx_study_patient ON health.imaging_studies(patient_id, study_date DESC);
CREATE INDEX IF NOT EXISTS idx_study_accession ON health.imaging_studies(tenant_id, accession_number);
CREATE INDEX IF NOT EXISTS idx_study_unreported ON health.imaging_studies(tenant_id, reported_status, acquired_at DESC)
  WHERE reported_status <> 'verified';
CREATE INDEX IF NOT EXISTS idx_study_uid ON health.imaging_studies(study_instance_uid);

CREATE TABLE IF NOT EXISTS health.imaging_series (
  series_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  study_id        uuid NOT NULL REFERENCES health.imaging_studies(study_id) ON DELETE CASCADE,
  series_instance_uid text NOT NULL,
  series_number   integer,
  modality        text,
  series_description text,
  body_part       text,
  laterality      text,
  num_instances   integer CHECK (num_instances IS NULL OR num_instances >= 0),
  instance_uid_range text,          -- first/last SOP instance UIDs, as text
  orientation     text,
  slice_thickness numeric CHECK (slice_thickness IS NULL OR slice_thickness >= 0),
  window_center   numeric,
  window_width    numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, series_instance_uid)
);
CREATE INDEX IF NOT EXISTS idx_series_study ON health.imaging_series(study_id, series_number);

-- Addendum to a signed report — never an overwrite.
CREATE TABLE IF NOT EXISTS health.imaging_report_addenda (
  addendum_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  report_id       uuid NOT NULL REFERENCES health.imaging_reports(report_id) ON DELETE CASCADE,
  content         text NOT NULL,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'draft', -- draft | signed
  authored_by     uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('draft','signed')),
  CHECK ((status <> 'signed') OR (signed_by IS NOT NULL AND signed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_addendum_report ON health.imaging_report_addenda(report_id, created_at);

-- Critical results: any modality, acknowledged by a named human.
CREATE TABLE IF NOT EXISTS health.critical_findings (
  critical_finding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  source_domain   text NOT NULL DEFAULT 'imaging', -- imaging | laboratory | emergency | pharmacy
  source_resource_type text NOT NULL,           -- imaging_report | lab_order_item | triage_assessment | medication
  source_resource_id uuid NOT NULL,
  study_id        uuid REFERENCES health.imaging_studies(study_id) ON DELETE SET NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  finding         text NOT NULL,
  severity        text NOT NULL DEFAULT 'critical', -- critical | life_threatening | urgent_followup
  identified_at   timestamptz NOT NULL DEFAULT now(),
  identified_by   uuid REFERENCES beyu_identity.users(global_user_id),
  -- Notification attempts are recorded, and 'notified' is only reachable when
  -- a delivery path actually exists. With no notification provider configured
  -- the row stays 'acknowledgement_required_manually'.
  notification_state text NOT NULL DEFAULT 'not_sent',
    -- not_sent | acknowledgement_required_manually | queued | delivered | failed | unavailable
  notified_at     timestamptz,
  notified_channel text,                       -- in_person | phone | sms | email | in_app
  notified_actor  text,                        -- free text: who they believe it is
  acknowledged_by uuid REFERENCES beyu_identity.users(global_user_id),
  acknowledged_at timestamptz,
  ack_method      text,                        -- read_back | verbal | electronic
  response_note   text,
  escalation_required boolean NOT NULL DEFAULT false,
  escalation_at   timestamptz,
  closed_at       timestamptz,
  status          text NOT NULL DEFAULT 'open', -- open | notified | acknowledged | escalated | closed
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (severity IN ('critical','life_threatening','urgent_followup')),
  CHECK (status IN ('open','notified','acknowledged','escalated','closed')),
  CHECK (notification_state IN ('not_sent','acknowledgement_required_manually','queued','delivered','failed','unavailable')),
  CHECK (source_domain IN ('imaging','laboratory','emergency','pharmacy')),
  CHECK (ack_method IN ('read_back','verbal','electronic') OR ack_method IS NULL),
  -- Only a read-back (or explicit electronic) acknowledgement closes the loop.
  CHECK ((status <> 'acknowledged') OR (acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)),
  CHECK ((status <> 'closed') OR acknowledged_at IS NOT NULL),
  CHECK (acknowledged_at IS NULL OR acknowledged_at >= identified_at)
);
CREATE INDEX IF NOT EXISTS idx_critical_open ON health.critical_findings(tenant_id, status, identified_at DESC)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS idx_critical_source ON health.critical_findings(source_resource_type, source_resource_id);

-- Modality worklist: what a scanner/operator should do next. Rows are created
-- by scheduling (from imaging_orders) and consumed by acquisition; they carry
-- no clinical content of their own.
CREATE TABLE IF NOT EXISTS health.modality_worklist_items (
  worklist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  imaging_order_id uuid NOT NULL REFERENCES health.imaging_orders(imaging_order_id) ON DELETE CASCADE,
  study_id        uuid REFERENCES health.imaging_studies(study_id) ON DELETE SET NULL,
  modality        text NOT NULL,
  station_name    text,
  room            text,
  scheduled_at    timestamptz,
  priority        text NOT NULL DEFAULT 'routine', -- routine | urgent | stat
  status          text NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | performed | cancelled | missed
  patient_prepped boolean NOT NULL DEFAULT false,
  prep_notes      text,
  claimed_by      uuid REFERENCES beyu_identity.users(global_user_id),
  claimed_at      timestamptz,
  performed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (priority IN ('routine','urgent','stat')),
  CHECK (status IN ('scheduled','in_progress','performed','cancelled','missed')),
  -- A worklist item is claimed by exactly one operator at a time; the claim
  -- timestamp and the claimant are written together or not at all.
  CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_worklist_queue ON health.modality_worklist_items(tenant_id, modality, status, scheduled_at);

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('imaging_studies'),('imaging_series'),('imaging_report_addenda'),('critical_findings'),('modality_worklist_items')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('imaging_studies'),('imaging_series'),('imaging_report_addenda'),('critical_findings'),('modality_worklist_items')
  LOOP
    EXECUTE format('ALTER TABLE health.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS health_%I_isolation ON health.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY health_%I_isolation ON health.%I
         USING (current_setting(''app.tenant_id'', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id))
         WITH CHECK (current_setting(''app.tenant_id'', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id))',
      tbl, tbl);
  END LOOP;
END $$;

COMMIT;
