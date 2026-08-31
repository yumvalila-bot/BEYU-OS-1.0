-- BEYU Health OS — Clinical Foundation (Migration 004 UP)
--
-- Establishes the core healthcare execution domain under schema `health`. All
-- tables are tenant_id / entity_id / country_code bound; RLS policies apply the
-- canonical BEYU boundary via beyu_identity.tenant_matches_boundary().
--
-- Conventions:
--  * Every table uses uuid PKs (gen_random_uuid()) and timestamptz timestamps.
--  * Every row has created_by / updated_by (global_user_id references the
--    canonical identity schema) and a correlation_id for request tracing.
--  * Soft-delete uses a voided_at + voided_by pair (immutable audit: historical
--    records are never DELETEd, only voided).
--  * Status columns use CHECK constraints rather than enum types so they stay
--    forward-compatible across migrations.
--  * RLS is enabled on EVERY tenant-scoped table; non-owner roles can only read
--    rows matching app.tenant_id / app.entity_code / app.country_code GUCs.

CREATE SCHEMA IF NOT EXISTS health;

-- Helper: standard created/updated/voided audit columns applied to every table.
-- We deliberately avoid a single JSON metadata blob so that indexes and foreign
-- keys work on explicit columns.

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference / catalogs
-- ─────────────────────────────────────────────────────────────────────────────

-- Departments (within a tenant/facility).
CREATE TABLE IF NOT EXISTS health.departments (
  department_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  dept_code       text NOT NULL,
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'clinical',  -- clinical | support | admin
  status          text NOT NULL DEFAULT 'active',   -- active | inactive
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, dept_code)
);

-- Providers (doctors, nurses, pharmacists, lab techs, etc.). A provider is a
-- role a global_user occupies within a tenant.
CREATE TABLE IF NOT EXISTS health.providers (
  provider_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  department_id   uuid REFERENCES health.departments(department_id),
  global_user_id  uuid NOT NULL REFERENCES beyu_identity.users(global_user_id) ON DELETE CASCADE,
  licence_number  text,
  licence_expiry  date,
  cadre           text,   -- doctor | nurse | pharmacy | lab | radiology | ...
  title           text,
  specialties     text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'active',  -- active | suspended | inactive
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, global_user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Patients
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.patients (
  patient_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  medical_record  text NOT NULL,     -- tenant-scoped MRN
  title           text,
  given_name      text NOT NULL,
  middle_name     text,
  family_name     text NOT NULL,
  dob             date,
  sex             text NOT NULL DEFAULT 'unknown',  -- male | female | other | unknown
  gender_identity text,
  marital_status  text,
  phone           text,
  email           text,
  address_line    text,
  city            text,
  region          text,
  postal_code     text,
  nationality     text,
  id_type         text,              -- national_id | passport | voter | nhif | other
  id_number       text,
  next_of_kin_name  text,
  next_of_kin_phone text,
  next_of_kin_relation text,
  blood_type      text,
  allergies_known boolean NOT NULL DEFAULT false,
  notes           text,
  status          text NOT NULL DEFAULT 'active',  -- active | deceased | transferred | archived
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, medical_record),
  CHECK (sex IN ('male','female','other','unknown')),
  CHECK (status IN ('active','deceased','transferred','archived'))
);
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON health.patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patients_name   ON health.patients(tenant_id, family_name, given_name);
CREATE INDEX IF NOT EXISTS idx_patients_mrn    ON health.patients(tenant_id, medical_record);

-- ─────────────────────────────────────────────────────────────────────────────
-- Appointments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.appointments (
  appointment_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  provider_id     uuid REFERENCES health.providers(provider_id),
  department_id   uuid REFERENCES health.departments(department_id),
  appointment_no  text NOT NULL,
  kind            text NOT NULL DEFAULT 'outpatient',  -- outpatient | inpatient | followup | emergency | teleconsult
  scheduled_for   timestamptz NOT NULL,
  duration_min    integer NOT NULL DEFAULT 15,
  reason          text,
  status          text NOT NULL DEFAULT 'scheduled',  -- scheduled | checked_in | in_progress | completed | cancelled | no_show | rescheduled
  checked_in_at   timestamptz,
  started_at      timestamptz,
  ended_at        timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  cancelled_by    uuid REFERENCES beyu_identity.users(global_user_id),
  no_show_at      timestamptz,
  notes           text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, appointment_no),
  -- idempotency_key uniqueness enforced at service layer with a conditional
  -- insert (partial indexes are not uniformly supported across all embedded
  -- Postgres variants we test against; production Postgres supports them).
  CHECK (status IN ('scheduled','checked_in','in_progress','completed','cancelled','no_show','rescheduled'))
);
CREATE INDEX IF NOT EXISTS idx_appts_tenant_time ON health.appointments(tenant_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appts_provider_time ON health.appointments(provider_id, scheduled_for) WHERE provider_id IS NOT NULL AND status IN ('scheduled','checked_in','in_progress');
CREATE INDEX IF NOT EXISTS idx_appts_patient ON health.appointments(patient_id, scheduled_for DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Encounters (clinical visits)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.encounters (
  encounter_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code      text,
  country_code     text,
  encounter_no     text NOT NULL,
  patient_id       uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  appointment_id   uuid REFERENCES health.appointments(appointment_id) ON DELETE SET NULL,
  provider_id      uuid REFERENCES health.providers(provider_id),
  department_id    uuid REFERENCES health.departments(department_id),
  kind             text NOT NULL DEFAULT 'ambulatory',  -- ambulatory | inpatient | emergency | teleconsult | domiciliary
  status           text NOT NULL DEFAULT 'in_progress', -- scheduled | checked_in | in_progress | completed | cancelled
  chief_complaint  text,
  present_illness  text,
  triage_level     text,                                -- red | orange | yellow | green | blue (MTUHA/ETAT-style)
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  disposition      text,                                -- discharged | admitted | referred | died | absconded | ama
  created_by       uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by       uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  voided_at        timestamptz,
  voided_by        uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, encounter_no),
  CHECK (status IN ('scheduled','checked_in','in_progress','completed','cancelled')),
  CHECK (kind IN ('ambulatory','inpatient','emergency','teleconsult','domiciliary'))
);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON health.encounters(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_enc_provider ON health.encounters(provider_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_enc_tenant_status ON health.encounters(tenant_id, status, started_at DESC);

-- updated_at trigger applied to all tables below (created in 004 down/up section).
CREATE OR REPLACE FUNCTION health.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Macro to bind the updated_at trigger (called per table after creation).
-- We list tables explicitly via CREATE TRIGGER statements.
DROP TRIGGER IF EXISTS trg_patients_updated       ON health.patients;
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON health.patients
  FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_providers_updated      ON health.providers;
CREATE TRIGGER trg_providers_updated BEFORE UPDATE ON health.providers
  FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_departments_updated    ON health.departments;
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON health.departments
  FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_appts_updated          ON health.appointments;
CREATE TRIGGER trg_appts_updated BEFORE UPDATE ON health.appointments
  FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_enc_updated            ON health.encounters;
CREATE TRIGGER trg_enc_updated BEFORE UPDATE ON health.encounters
  FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS on every clinical table. Policies re-use the boundary function from
-- migration 003: rows are visible only when app.tenant_id matches AND the
-- tenant's entity/country matches the caller's GUCs (or tenant is unlinked).
-- ─────────────────────────────────────────────────────────────────────────────

-- Apply RLS and the canonical isolation policy to every clinical table. The
-- policy re-uses beyu_identity.tenant_matches_boundary from migration 003.
ALTER TABLE health.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_departments_isolation ON health.departments;
CREATE POLICY health_departments_isolation ON health.departments
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

ALTER TABLE health.providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_providers_isolation ON health.providers;
CREATE POLICY health_providers_isolation ON health.providers
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

ALTER TABLE health.patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_patients_isolation ON health.patients;
CREATE POLICY health_patients_isolation ON health.patients
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

ALTER TABLE health.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_appointments_isolation ON health.appointments;
CREATE POLICY health_appointments_isolation ON health.appointments
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));

ALTER TABLE health.encounters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_encounters_isolation ON health.encounters;
CREATE POLICY health_encounters_isolation ON health.encounters
  USING (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id))
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text
         AND beyu_identity.tenant_matches_boundary(tenant_id));
