-- Migration 041 — Workforce rostering and nursing assignment.
--
-- WHY THIS EXISTS
--   Every clinical workflow in HEALTH_OS assumes someone is on duty, but the
--   database could not say who. There was no shift, no roster, no assignment of
--   patients to a nurse, and no way to record that the person accepting a task
--   holds the competency for it. Capacity answers ("is there a bed?") are
--   incomplete without staffing answers ("is there a nurse for it?").
--
-- NON-DUPLICATION — this is the boundary, and it is deliberate
--   * `health.providers` (004) is the staff/practitioner directory of record and
--     `health.practitioners` (009) is the credential + scope-of-practice record.
--     NO new staff table, no duplicate licence columns, no second registry.
--   * Credential STATUS is therefore not stored here at all: roster and task
--     endpoints READ practitioners.verification_status / license_expiry_date and
--     refuse or warn accordingly. This repository does not verify with MCT/TNMC
--     and never records 'verified' on its own initiative.
--   * Skills/competencies below are the WORKFORCE-SCHEDULING view (which shift a
--     person may be rostered onto), keyed to provider_id. They are NOT a
--     licensing claim and are explicitly marked as self-declared/internal
--     evidence with a verification field that defaults to unverified.
--   * Leave/absence is out of scope: HCM owns employment. `availability` here
--     is a rostering statement made by the local manager, with a source column
--     that says where it came from.

BEGIN;

CREATE TABLE IF NOT EXISTS health.shift_templates (
  shift_template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  code            text NOT NULL,
  name            text NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  required_cadre  text[] NOT NULL DEFAULT '{}',
  max_patients_per_nurse integer CHECK (max_patients_per_nurse IS NULL OR max_patients_per_nurse > 0),
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'active', -- active | inactive
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('active','inactive'))
);

CREATE TABLE IF NOT EXISTS health.roster_shifts (
  shift_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  shift_date      date NOT NULL,
  shift_type      text NOT NULL,                -- morning | evening | night | float
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  department_id   uuid REFERENCES health.departments(department_id) ON DELETE SET NULL,
  facility_id     uuid REFERENCES health.facilities(facility_id) ON DELETE SET NULL,
  start_at        timestamptz,
  end_at          timestamptz,
  status          text NOT NULL DEFAULT 'open', -- open | staffed | in_progress | completed | cancelled
  in_charge_provider_id uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  notes           text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (shift_type IN ('morning','evening','night','float')),
  CHECK (status IN ('open','staffed','in_progress','completed','cancelled')),
  CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_roster_date ON health.roster_shifts(tenant_id, shift_date, shift_type);
CREATE INDEX IF NOT EXISTS idx_roster_ward ON health.roster_shifts(ward_id, shift_date);

CREATE TABLE IF NOT EXISTS health.roster_assignments (
  assignment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  shift_id        uuid NOT NULL REFERENCES health.roster_shifts(shift_id) ON DELETE CASCADE,
  provider_id     uuid NOT NULL REFERENCES health.providers(provider_id) ON DELETE CASCADE,
  role_on_shift   text NOT NULL DEFAULT 'staff_nurse',
    -- in_charge | staff_nurse | medical_officer | registrar | intern |
    -- technician | pharmacist | midwife | float | on_call
  status          text NOT NULL DEFAULT 'assigned', -- assigned | accepted | declined | absent | left_early | completed
  -- Credential state at the moment of assignment, COPIED FROM
  -- health.practitioners by the service and never invented here. NULL means
  -- the practitioner has no credential record yet — which the rostering
  -- endpoint surfaces as a blocker rather than a pass.
  credential_snapshot text,
  credential_checked_at timestamptz,
  required_skills text[] NOT NULL DEFAULT '{}',
  declined_reason text,
  worked_minutes  integer CHECK (worked_minutes IS NULL OR worked_minutes >= 0),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (shift_id, provider_id),
  CHECK (status IN ('assigned','accepted','declined','absent','left_early','completed')),
  CHECK (role_on_shift IN ('in_charge','staff_nurse','medical_officer','registrar','intern','technician','pharmacist','midwife','float','on_call')),
  CHECK ((status = 'declined' AND declined_reason IS NOT NULL) OR status <> 'declined')
);
CREATE INDEX IF NOT EXISTS idx_roster_assignee ON health.roster_assignments(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_roster_assign_shift ON health.roster_assignments(shift_id);

CREATE TABLE IF NOT EXISTS health.staff_competencies (
  competency_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  provider_id     uuid NOT NULL REFERENCES health.providers(provider_id) ON DELETE CASCADE,
  skill_code      text NOT NULL,
  skill_name      text NOT NULL,
  category        text NOT NULL DEFAULT 'clinical', -- clinical | resuscitation | radiation | anaesthesia | laboratory | imaging | equipment | safeguarding
  evidence_source text NOT NULL DEFAULT 'self_declared',
    -- self_declared | internal_assessment | certificate_document | external_body
  verified        boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  document_id     uuid REFERENCES health.clinical_documents(document_id) ON DELETE SET NULL,
  expires_at      date,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (provider_id, skill_code),
  CHECK (category IN ('clinical','resuscitation','radiation','anaesthesia','laboratory','imaging','equipment','safeguarding')),
  CHECK (evidence_source IN ('self_declared','internal_assessment','certificate_document','external_body')),
  -- 'verified' requires a verifier and a date: a competency is either evidenced
  -- or it is not. Self-declared can never be verified without a reviewer.
  CHECK ((NOT verified) OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (verified OR evidence_source <> 'external_body')
);
CREATE INDEX IF NOT EXISTS idx_competency_provider ON health.staff_competencies(provider_id, verified);

CREATE TABLE IF NOT EXISTS health.nursing_assignments (
  nursing_assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  ward_id         uuid NOT NULL REFERENCES health.wards(ward_id) ON DELETE CASCADE,
  bed_id          uuid REFERENCES health.beds(bed_id) ON DELETE SET NULL,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  roster_assignment_id uuid REFERENCES health.roster_assignments(assignment_id) ON DELETE SET NULL,
  nurse_provider_id uuid NOT NULL REFERENCES health.providers(provider_id) ON DELETE CASCADE,
  shift_date      date NOT NULL,
  shift_type      text NOT NULL,               -- morning | evening | night
  acuity_band     text NOT NULL DEFAULT 'stable', -- stable | high_dependency | critical | isolation
  patient_count   integer NOT NULL DEFAULT 1 CHECK (patient_count > 0 AND patient_count <= 40),
  status          text NOT NULL DEFAULT 'active', -- active | handed_over | closed
  handed_over_at  timestamptz,
  handover_id     uuid REFERENCES health.clinical_handovers(handover_id) ON DELETE SET NULL,
  notes           text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (shift_type IN ('morning','evening','night')),
  CHECK (status IN ('active','handed_over','closed')),
  CHECK (acuity_band IN ('stable','high_dependency','critical','isolation')),
  -- One active assignment per patient per shift; the same patient cannot be
  -- actively assigned to two nurses for the same shift.
  CHECK ((status <> 'handed_over') OR handover_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_nurse_assignment_active
  ON health.nursing_assignments(patient_id, shift_date, shift_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_nurse_assignment_nurse ON health.nursing_assignments(nurse_provider_id, shift_date, shift_type);

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('shift_templates'),('roster_shifts'),('roster_assignments'),('staff_competencies'),('nursing_assignments')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('shift_templates'),('roster_shifts'),('roster_assignments'),('staff_competencies'),('nursing_assignments')
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
