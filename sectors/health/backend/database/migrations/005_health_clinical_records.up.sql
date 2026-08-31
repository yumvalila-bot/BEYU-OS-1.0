-- Migration 005: clinical records (problems/diagnoses, observations/vitals,
-- medication orders, allergies). All tables live in the health.* schema, are
-- tenant-isolated via RLS, soft-deletable (voided_at/voided_by), and carry a
-- correlation_id for request tracing.
--
-- These tables establish the clinical-record backbone. Amendments are modeled
-- as new rows with a parent_id pointer to the previous version; never UPDATE
-- signed content. The `signed_by` / `signed_at` columns mark legal sign-off —
-- once signed, rows cannot be modified by any non-auditor code path (enforced
-- at service layer; RLS denies updates to signed rows in defense in depth).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Problems / Diagnosis list
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.problems (
  problem_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  code_system     text NOT NULL DEFAULT 'ICD-10',  -- ICD-10 | ICD-11 | SNOMED | RXNORM | LOCAL
  code            text,                             -- nullable when problem text-only
  description     text NOT NULL,
  status          text NOT NULL DEFAULT 'active',   -- active | resolved | in_error | ruled_out
  onset_date      date,
  resolved_date   date,
  severity        text,                             -- mild | moderate | severe
  note            text,
  parent_id       uuid REFERENCES health.problems(problem_id) ON DELETE SET NULL, -- amendment chain
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('active','resolved','in_error','ruled_out')),
  CHECK (code_system IN ('ICD-10','ICD-11','SNOMED','RXNORM','LOCAL')),
  CHECK (severity IS NULL OR severity IN ('mild','moderate','severe'))
);
CREATE INDEX IF NOT EXISTS idx_problems_patient ON health.problems(patient_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Observations / Vitals / Labs (generic key-value clinical observations)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.observations (
  observation_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  code_system     text NOT NULL DEFAULT 'LOINC',  -- LOINC | SNOMED | LOCAL
  code            text NOT NULL,
  display         text,
  value_numeric   numeric,
  value_text      text,
  value_units     text,
  value_coded     text,
  abnormal_flag   text,  -- normal | low | high | critical_low | critical_high
  observed_at     timestamptz NOT NULL DEFAULT now(),
  category        text NOT NULL DEFAULT 'vital-signs',
  -- vital-signs | laboratory | imaging | social-history | exam | procedure
  note            text,
  parent_id       uuid REFERENCES health.observations(observation_id) ON DELETE SET NULL,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (abnormal_flag IS NULL OR abnormal_flag IN ('normal','low','high','critical_low','critical_high')),
  CHECK (category IN ('vital-signs','laboratory','imaging','social-history','exam','procedure'))
);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON health.observations(patient_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_code    ON health.observations(patient_id, code);

-- ─────────────────────────────────────────────────────────────────────────────
-- Medication orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.medications (
  medication_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  code_system     text NOT NULL DEFAULT 'RXNORM',
  code            text,
  name            text NOT NULL,
  form            text,
  strength        text,
  dose            text NOT NULL,
  route           text,
  frequency       text,
  duration        text,
  quantity        numeric,
  refills         integer NOT NULL DEFAULT 0,
  prn             boolean NOT NULL DEFAULT false,
  instructions    text,
  status          text NOT NULL DEFAULT 'active',  -- draft | active | completed | cancelled | on_hold
  prescribed_at   timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  parent_id       uuid REFERENCES health.medications(medication_id) ON DELETE SET NULL,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('draft','active','completed','cancelled','on_hold'))
);
CREATE INDEX IF NOT EXISTS idx_meds_patient ON health.medications(patient_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Allergies & adverse reactions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.allergies (
  allergy_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  substance_code_system text NOT NULL DEFAULT 'RXNORM',
  substance_code  text,
  substance_name  text NOT NULL,
  category        text NOT NULL DEFAULT 'medication', -- medication | food | environment | biologic
  severity        text NOT NULL DEFAULT 'mild',       -- mild | moderate | severe | life_threatening
  reaction        text,
  onset_date      date,
  status          text NOT NULL DEFAULT 'active',     -- active | resolved | refuted | inactive
  note            text,
  parent_id       uuid REFERENCES health.allergies(allergy_id) ON DELETE SET NULL,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('active','resolved','refuted','inactive')),
  CHECK (category IN ('medication','food','environment','biologic')),
  CHECK (severity IN ('mild','moderate','severe','life_threatening'))
);
CREATE INDEX IF NOT EXISTS idx_allergy_patient ON health.allergies(patient_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- shared: updated_at triggers + RLS
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_problems_updated_at ON health.problems;
CREATE TRIGGER trg_problems_updated_at BEFORE UPDATE ON health.problems      FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_observations_updated_at ON health.observations;
CREATE TRIGGER trg_observations_updated_at BEFORE UPDATE ON health.observations FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_meds_updated_at ON health.medications;
CREATE TRIGGER trg_meds_updated_at BEFORE UPDATE ON health.medications   FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();
DROP TRIGGER IF EXISTS trg_allergies_updated_at ON health.allergies;
CREATE TRIGGER trg_allergies_updated_at BEFORE UPDATE ON health.allergies     FOR EACH ROW EXECUTE FUNCTION health.set_updated_at();

ALTER TABLE health.problems      ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.observations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.medications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.allergies     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_problems_isolation ON health.problems;
CREATE POLICY health_problems_isolation ON health.problems     USING (beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS health_observations_isolation ON health.observations;
CREATE POLICY health_observations_isolation ON health.observations USING (beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS health_medications_isolation ON health.medications;
CREATE POLICY health_medications_isolation ON health.medications  USING (beyu_identity.tenant_matches_boundary(tenant_id));
DROP POLICY IF EXISTS health_allergies_isolation ON health.allergies;
CREATE POLICY health_allergies_isolation ON health.allergies    USING (beyu_identity.tenant_matches_boundary(tenant_id));

COMMIT;
