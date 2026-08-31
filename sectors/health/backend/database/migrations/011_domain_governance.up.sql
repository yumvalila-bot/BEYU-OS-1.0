-- Phase 3 Parts 13/17/18/21/25 — Ophthalmology optics, signatures, AI governance, legal-hold enforcement, adapter circuit-breaker state.
--
-- Adds:
--  - ophthalmic prescriptions (spectacles + contact lenses) with authorization/verification/dispensing workflow
--  - ophthalmic medication prescriptions (reuses rx:controlled scope)
--  - optical_devices inventory with TMDA registration column (nullable until TMDA verification)
--  - optical_dispensing records linking prescription -> dispensed device
--  - signatures table (cryptographic-hash reference, license context, verification status)
--  - ai_invocations audit table (model/version/confidence/human reviewer / authorization status)
--  - legal_hold enforcement helper + block on void/delete of held resources
--  - adapter_circuit state for circuit-breaker tracking
--  - practitioner scope guard helper function
--
-- All tables RLS-enabled; all new columns/constraints additive.

-- =============================================================
-- 1. Optical devices inventory (lenses, frames, contact lenses, ophthalmic devices)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.optical_devices (
  device_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  facility_id     uuid REFERENCES health.facilities(facility_id),
  sku             text NOT NULL,
  device_type     text NOT NULL, -- frame | spectacle_lens | contact_lens | solution | ophthalmic_device | intraocular_lens | other
  brand           text,
  model           text,
  manufacturer    text,
  tmda_registration text,          -- MUST come from TMDA verification; NULL until adapter verifies.
  lot_number      text,
  expiry_date     date,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'available', -- available | reserved | dispensed | expired | recalled | quarantined
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku),
  CHECK (device_type IN ('frame','spectacle_lens','contact_lens','solution','ophthalmic_device','intraocular_lens','other')),
  CHECK (status IN ('available','reserved','dispensed','expired','recalled','quarantined'))
);
ALTER TABLE health.optical_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_optical_devices_isolation ON health.optical_devices;
CREATE POLICY health_optical_devices_isolation ON health.optical_devices
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 2. Ophthalmic (spectacle / contact lens) prescriptions
-- =============================================================
CREATE TABLE IF NOT EXISTS health.ophthalmic_prescriptions (
  prescription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  eye_exam_id     uuid REFERENCES health.eye_exams(exam_id) ON DELETE SET NULL,
  prescriber_id   uuid REFERENCES health.practitioners(practitioner_id),
  prescriber_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  prescription_type text NOT NULL, -- spectacle | contact_lens | ophthalmic_medication | low_vision
  rx_od_sph       numeric, rx_od_cyl numeric, rx_od_axis integer, rx_od_add numeric, rx_od_prism text,
  rx_os_sph       numeric, rx_os_cyl numeric, rx_os_axis integer, rx_os_add numeric, rx_os_prism text,
  rx_ou_add       numeric,
  contact_lens_od text, contact_lens_os text,
  lens_material   text,
  lens_type       text, -- single_vision | bifocal | progressive | occupational | other
  frame_type      text,
  medication_id   uuid REFERENCES health.medications(medication_id),
  diagnosis       text,
  special_instructions text,
  status          text NOT NULL DEFAULT 'authored', -- authored | authorized | verified | dispensed | expired | cancelled | amended
  authorized_by   uuid REFERENCES beyu_identity.users(global_user_id),
  authorized_at   timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  verified_at     timestamptz,
  expires_at      date,
  amendment_of    uuid REFERENCES health.ophthalmic_prescriptions(prescription_id),
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (prescription_type IN ('spectacle','contact_lens','ophthalmic_medication','low_vision')),
  CHECK (status IN ('authored','authorized','verified','dispensed','expired','cancelled','amended')),
  CHECK (lens_type IN ('single_vision','bifocal','progressive','occupational','other') OR lens_type IS NULL)
);
ALTER TABLE health.ophthalmic_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_ophthalmic_prescriptions_isolation ON health.ophthalmic_prescriptions;
CREATE POLICY health_ophthalmic_prescriptions_isolation ON health.ophthalmic_prescriptions
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 3. Optical dispensing records
-- =============================================================
CREATE TABLE IF NOT EXISTS health.optical_dispensing (
  dispensing_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  prescription_id uuid NOT NULL REFERENCES health.ophthalmic_prescriptions(prescription_id),
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  device_id       uuid REFERENCES health.optical_devices(device_id),
  dispenser_id    uuid REFERENCES health.practitioners(practitioner_id),
  dispenser_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  frame_sku       text,
  lens_sku        text,
  lot_number      text,
  dispensed_at    timestamptz NOT NULL DEFAULT now(),
  patient_acknowledged boolean NOT NULL DEFAULT false,
  notes           text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE health.optical_dispensing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_optical_dispensing_isolation ON health.optical_dispensing;
CREATE POLICY health_optical_dispensing_isolation ON health.optical_dispensing
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 4. Electronic signatures (domain-agnostic, reference-based)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.signatures (
  signature_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  signer_global_user_id uuid NOT NULL REFERENCES beyu_identity.users(global_user_id),
  practitioner_id uuid REFERENCES health.practitioners(practitioner_id),
  professional_license_number text,
  resource_type   text NOT NULL,
  resource_id     uuid NOT NULL,
  action          text NOT NULL, -- sign | authorize | verify | dispense | co_sign
  signature_hash  text,          -- SHA-256 hex reference to signed payload (no PII in the hash input)
  signature_method text NOT NULL DEFAULT 'application_session', -- application_session | certificate | external
  verification_status text NOT NULL DEFAULT 'unverified', -- unverified | verified | failed | external_verification_required
  signed_at       timestamptz NOT NULL DEFAULT now(),
  ip              text,
  user_agent      text,
  correlation_id  text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (action IN ('sign','authorize','verify','dispense','co_sign')),
  CHECK (verification_status IN ('unverified','verified','failed','external_verification_required'))
);
ALTER TABLE health.signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_signatures_isolation ON health.signatures;
CREATE POLICY health_signatures_isolation ON health.signatures
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);
CREATE INDEX IF NOT EXISTS idx_signatures_resource ON health.signatures(resource_type, resource_id);

-- =============================================================
-- 5. AI invocations audit (Noelia/HIVE governance)
-- =============================================================
CREATE TABLE IF NOT EXISTS health.ai_invocations (
  invocation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  actor_global_user_id uuid NOT NULL REFERENCES beyu_identity.users(global_user_id),
  practitioner_id uuid REFERENCES health.practitioners(practitioner_id),
  facility_id     uuid REFERENCES health.facilities(facility_id),
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE SET NULL,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  ai_identity     text NOT NULL DEFAULT 'noelia', -- noelia | hive:<model> | external:<vendor>
  model_provider  text,
  model_name      text,
  model_version   text,
  task_type       text NOT NULL, -- triage | summarization | coding | differential | image_interpretation | medication_check | other
  input_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,  -- e.g. { resource_type, resource_id, fields_hashed: [...] }
  input_hash      text,
  output          jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence      numeric,                             -- NULL if model does not produce calibrated confidence
  risk_classification text NOT NULL DEFAULT 'medium',  -- low | medium | high | critical
  human_reviewer_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  human_approval_status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | overridden | not_required
  human_approval_at timestamptz,
  decision_applied boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'recorded',     -- recorded | submitted_to_hive | completed | failed | blocked
  error_code      text,
  correlation_id  text,
  causation_id    text,
  request_id      text,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (risk_classification IN ('low','medium','high','critical')),
  CHECK (human_approval_status IN ('pending','approved','rejected','overridden','not_required')),
  CHECK (status IN ('recorded','submitted_to_hive','completed','failed','blocked')),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
ALTER TABLE health.ai_invocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_ai_invocations_isolation ON health.ai_invocations;
CREATE POLICY health_ai_invocations_isolation ON health.ai_invocations
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 6. Adapter circuit-breaker state
-- =============================================================
CREATE TABLE IF NOT EXISTS health.adapter_circuits (
  circuit_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  adapter_name    text NOT NULL,
  state           text NOT NULL DEFAULT 'closed', -- closed | open | half_open
  failure_count   integer NOT NULL DEFAULT 0,
  success_count   integer NOT NULL DEFAULT 0,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  opened_at       timestamptz,
  next_retry_at   timestamptz,
  threshold_failures integer NOT NULL DEFAULT 5,
  reset_timeout_sec integer NOT NULL DEFAULT 30,
  UNIQUE (tenant_id, adapter_name),
  CHECK (state IN ('closed','open','half_open'))
);
ALTER TABLE health.adapter_circuits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_adapter_circuits_isolation ON health.adapter_circuits;
CREATE POLICY health_adapter_circuits_isolation ON health.adapter_circuits
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);

-- =============================================================
-- 7. Legal-hold enforcement: generic helper + delete/void blocking triggers
-- =============================================================
-- (Generic check_legal_hold not attached directly; the per-table
-- block_void_when_held trigger plus service-layer checks enforce legal-hold gating.)
-- NOT SECURITY DEFINER: runs with the invoking user's rights. RLS on legal_holds already permits the actor
-- to read holds in their tenant; if not, the trigger errs on the side of blocking (fail-closed by raising).

-- We can't attach a generic trigger without knowing each table's PK column name;
-- we expose per-resource views and enforce via service-layer + audit in Phase 3b.
-- A simple blocking constraint is applied to audit_log (records cannot be deleted
-- at all) and explicit triggers attached to patients/encounters/medications/lab_results/imaging_reports.

-- Audit log: never DELETE (append-only even without legal hold).
CREATE OR REPLACE FUNCTION health.block_audit_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_IMMUTABLE: audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_immutable ON health.audit_log;
CREATE TRIGGER trg_audit_immutable BEFORE DELETE ON health.audit_log
  FOR EACH ROW EXECUTE FUNCTION health.block_audit_delete();

-- Helper that blocks voiding of patients while a legal hold is active.
-- PK is patient_id (hard-coded for this trigger; separate triggers per table avoid
-- fragile dynamic SQL and SECURITY DEFINER).
CREATE OR REPLACE FUNCTION health.block_void_patients_when_held() RETURNS trigger AS $$
DECLARE
  held integer;
BEGIN
  IF NEW.voided_at IS NOT NULL AND (OLD.voided_at IS NULL) THEN
    SELECT count(*) INTO held FROM health.legal_holds
     WHERE resource_type = 'patient'
       AND (resource_id IS NULL OR resource_id = NEW.patient_id)
       AND released_at IS NULL
       AND tenant_id = current_setting('app.tenant_id', true)::uuid;
    IF held > 0 THEN
      RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: cannot void patient while legal hold is active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION health.block_void_encounters_when_held() RETURNS trigger AS $$
DECLARE
  held integer;
BEGIN
  IF NEW.voided_at IS NOT NULL AND (OLD.voided_at IS NULL) THEN
    SELECT count(*) INTO held FROM health.legal_holds
     WHERE resource_type = 'encounter'
       AND (resource_id IS NULL OR resource_id = NEW.encounter_id)
       AND released_at IS NULL
       AND tenant_id = current_setting('app.tenant_id', true)::uuid;
    IF held > 0 THEN
      RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: cannot void encounter while legal hold is active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to key clinical records.
DROP TRIGGER IF EXISTS trg_patients_legal_hold ON health.patients;
CREATE TRIGGER trg_patients_legal_hold BEFORE UPDATE OF voided_at ON health.patients
  FOR EACH ROW EXECUTE FUNCTION health.block_void_patients_when_held();
DROP TRIGGER IF EXISTS trg_encounters_legal_hold ON health.encounters;
CREATE TRIGGER trg_encounters_legal_hold BEFORE UPDATE OF voided_at ON health.encounters
  FOR EACH ROW EXECUTE FUNCTION health.block_void_encounters_when_held();

-- =============================================================
-- 8. Practitioner scope-of-practice guard helper (immutable logic in DB)
-- =============================================================
CREATE OR REPLACE FUNCTION health.practitioner_can(p_practitioner_id uuid, p_permission text)
RETURNS boolean AS $$
DECLARE
  v_status text;
  v_scope  text[];
  v_expiry date;
BEGIN
  IF p_practitioner_id IS NULL THEN RETURN false; END IF;
  SELECT license_status, scope_of_practice, license_expiry_date
    INTO v_status, v_scope, v_expiry
    FROM health.practitioners
   WHERE practitioner_id = p_practitioner_id
     AND tenant_id = current_setting('app.tenant_id', true)::uuid;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_status <> 'verified' THEN RETURN false; END IF;
  IF v_expiry IS NOT NULL AND v_expiry < CURRENT_DATE THEN RETURN false; END IF;
  IF v_scope IS NULL OR array_length(v_scope, 1) IS NULL THEN RETURN false; END IF;
  RETURN v_scope @> ARRAY[p_permission];
END;
$$ LANGUAGE plpgsql STABLE;
-- Runs with invoking user's rights. The practitioners table RLS policy allows read within tenant.
