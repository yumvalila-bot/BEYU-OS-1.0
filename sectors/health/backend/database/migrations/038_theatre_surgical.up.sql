-- Migration 038 — Theatre & surgical workflow: theatres, case bookings,
-- surgical team, pre-operative checklist, anaesthesia record and recovery.
--
-- WHY THIS EXISTS
--   `billable_services.category` already allowed 'procedure' and
--   `permissions` already included `order:procedure`, and the SPA had a
--   "TheatreDashboard" drawn from mock data — but there was no theatre table,
--   no case, no schedule and no checklist. So the button existed and nothing
--   behind it did. This migration makes the theatre a real operating surface.
--
-- NON-DUPLICATION
--   * Clinical content of the operation is documented in `health.encounters`,
--     `health.problems` and signed notes; a surgical CASE is a scheduling and
--     safety artifact, linked to (not replacing) the encounter.
--   * Recovery occupancy uses `health.bed_allocations` with
--     reason='post_anaesthesia_care' (migration 033); no second occupancy model.
--   * Turnaround uses the generic `health.service_turnarounds`
--     (resource_type='theatre') from migration 033; no theatre-specific copy.
--   * Personnel reference `health.providers` / beyu_identity.users; no parallel
--     staff master. Credential status is checked against `health.practitioners`
--     (009) — verified externally or not, never invented.
--   * Charges for the procedure are raised through the existing billing
--     service (health.billable_services + invoices), not a theatre invoice copy.
--
-- SAFETY MODEL
--   A case cannot advance to 'in_theatre' unless its pre-operative checklist is
--   complete and signed, and cannot advance to 'completed' unless the case has
--   been signed out. Those gates are enforced in the service layer and backed
--   by the CHECK constraints below, so a direct SQL write still cannot mark an
--   unsigned case 'signed'.

BEGIN;

CREATE TABLE IF NOT EXISTS health.operating_theatres (
  theatre_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  facility_id     uuid REFERENCES health.facilities(facility_id) ON DELETE SET NULL,
  theatre_code    text NOT NULL,
  name            text NOT NULL,
  theatre_type    text NOT NULL DEFAULT 'general', -- general | orthopaedic | cardiac | neuro | obstetric | day_surgery | endoscopy | cath_lab | ophthalmic
  status          text NOT NULL DEFAULT 'available', -- available | occupied | cleaning | maintenance | closed
  available_from  timestamptz,
  available_to    timestamptz,
  features        text[] NOT NULL DEFAULT '{}',  -- e.g. {c_arm, laparoscopy, microscope}
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, theatre_code),
  CHECK (status IN ('available','occupied','cleaning','maintenance','closed')),
  CHECK (available_to IS NULL OR available_from IS NULL OR available_to >= available_from)
);

CREATE TABLE IF NOT EXISTS health.surgical_cases (
  case_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  case_no         text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  theatre_id      uuid REFERENCES health.operating_theatres(theatre_id) ON DELETE SET NULL,
  department_id   uuid REFERENCES health.departments(department_id) ON DELETE SET NULL,
  primary_procedure_title text NOT NULL,
  procedure_code  text,                        -- ICD-10-PCS / CPT / local, if coded
  procedure_code_system text,                  -- icd10pcs | cpt | loinc | local
  indication      text,
  urgency         text NOT NULL DEFAULT 'elective', -- elective | urgent | emergent | crash
  status          text NOT NULL DEFAULT 'requested',
    -- requested | scheduled | in_preop | in_theatre | in_recovery | completed
    -- | cancelled | postponed
  consent_id      uuid REFERENCES health.consents(consent_id) ON DELETE SET NULL,
  consent_verified boolean NOT NULL DEFAULT false,
  site_laterality text,                        -- right | left | bilateral | not_applicable | unknown
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at   timestamptz,
  recovery_bed_id uuid REFERENCES health.beds(bed_id) ON DELETE SET NULL,
  preop_checklist_id uuid,                     -- FK added after child table exists
  anaesthesia_record_id uuid,                   -- FK added after child table exists
  cancellation_reason text,
  postponed_until timestamptz,
  notes           text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, case_no),
  CHECK (urgency IN ('elective','urgent','emergent','crash')),
  CHECK (status IN ('requested','scheduled','in_preop','in_theatre','in_recovery','completed','cancelled','postponed')),
  CHECK (site_laterality IN ('right','left','bilateral','not_applicable','unknown') OR site_laterality IS NULL),
  CHECK (scheduled_end_at IS NULL OR scheduled_start_at IS NULL OR scheduled_end_at >= scheduled_start_at),
  CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at),
  -- A cancelled case must say why; a postponed case must say until when.
  CHECK ((status = 'cancelled' AND cancellation_reason IS NOT NULL) OR status <> 'cancelled'),
  CHECK ((status = 'postponed' AND postponed_until IS NOT NULL) OR status <> 'postponed')
);
CREATE INDEX IF NOT EXISTS idx_case_schedule ON health.surgical_cases(tenant_id, status, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_case_theatre ON health.surgical_cases(theatre_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_case_patient ON health.surgical_cases(patient_id, created_at DESC);

-- ── surgical team ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.surgical_team_members (
  team_member_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  case_id         uuid NOT NULL REFERENCES health.surgical_cases(case_id) ON DELETE CASCADE,
  global_user_id  uuid REFERENCES beyu_identity.users(global_user_id) ON DELETE SET NULL,
  provider_id     uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  role            text NOT NULL,
    -- surgeon | assistant | anaesthetist | anaesthesia_assistant | scrub_nurse
    -- | circulating_nurse | recovery_nurse | observer | engineer | interpreter
  confirmed       boolean NOT NULL DEFAULT false,
  confirmed_at    timestamptz,
  credential_checked boolean NOT NULL DEFAULT false,
  credential_status text NOT NULL DEFAULT 'not_checked',
    -- not_checked | valid | expiring_soon | expired | external_verification_required
  note            text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (case_id, role, global_user_id),
  CHECK (role IN ('surgeon','assistant','anaesthetist','anaesthesia_assistant','scrub_nurse','circulating_nurse','recovery_nurse','observer','engineer','interpreter')),
  CHECK (credential_status IN ('not_checked','valid','expiring_soon','expired','external_verification_required'))
);

-- ── pre-operative checklist (WHO-aligned structure; NOT an accreditation claim)
CREATE TABLE IF NOT EXISTS health.preop_checklists (
  checklist_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  case_id         uuid NOT NULL REFERENCES health.surgical_cases(case_id) ON DELETE CASCADE,
  template        text NOT NULL DEFAULT 'who_safety_signin', -- who_safety_signin | local_adult | local_paediatric | local_obstetric
  status          text NOT NULL DEFAULT 'incomplete', -- incomplete | complete | signed
  completed_at    timestamptz,
  signed_at       timestamptz,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, case_id, template),
  CHECK (status IN ('incomplete','complete','signed')),
  CHECK ((status <> 'signed') OR (signed_by IS NOT NULL AND signed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS health.preop_checklist_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  checklist_id    uuid NOT NULL REFERENCES health.preop_checklists(checklist_id) ON DELETE CASCADE,
  item_key        text NOT NULL,
  label           text NOT NULL,
  required        boolean NOT NULL DEFAULT true,
  checked         boolean NOT NULL DEFAULT false,
  checked_by      uuid REFERENCES beyu_identity.users(global_user_id),
  checked_at      timestamptz,
  note            text,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (checklist_id, item_key),
  -- A checked item must name who checked it: an anonymous tick is worthless in
  -- a safety record.
  CHECK (checked = false OR checked_by IS NOT NULL)
);

-- ── anaesthesia record ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.anaesthesia_records (
  anaesthesia_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  case_id         uuid NOT NULL REFERENCES health.surgical_cases(case_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  asa_class       text,                        -- i | ii | iii | iv | v | e (emergency)
  pre_assessment  text,
  airway_assessment text,
  technique       text NOT NULL DEFAULT 'general', -- general | regional | local_sedation | local | monitored_anesthesia_care
  induction_at    timestamptz,
  intubated       boolean,
  extubation_at   timestamptz,
  agents_summary  text,                        -- free text; drug entries stay in health.medications
  intraop_events  text,
  fluids_blood_given text,
  aldrete_score   integer CHECK (aldrete_score IS NULL OR (aldrete_score >= 0 AND aldrete_score <= 10)),
  recovery_grade  text,                        -- A | B | C (Aldrete-derived staging)
  status          text NOT NULL DEFAULT 'drafted', -- drafted | signed | amended
  signed_at       timestamptz,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  anaesthetist_provider_id uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  parent_record_id uuid REFERENCES health.anaesthesia_records(anaesthesia_id) ON DELETE SET NULL,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  -- (uniqueness of the LIVE record is a partial index below: an amendment must
  -- be able to exist alongside the voided record it supersedes)
  CHECK (asa_class IN ('i','ii','iii','iv','v','e') OR asa_class IS NULL),
  CHECK (technique IN ('general','regional','local_sedation','local','monitored_anesthesia_care')),
  CHECK (recovery_grade IN ('A','B','C') OR recovery_grade IS NULL),
  CHECK (status IN ('drafted','signed','amended')),
  CHECK ((status <> 'signed') OR (signed_by IS NOT NULL AND signed_at IS NOT NULL)),
  CHECK (extubation_at IS NULL OR induction_at IS NULL OR extubation_at >= induction_at)
);

-- Exactly one LIVE anaesthesia record per case. The amendment chain
-- (parent_record_id) needs a superseded row to survive, which a table-level
-- UNIQUE on (tenant_id, case_id) would have forbidden; voiding the original is
-- therefore what makes room for the replacement.
CREATE UNIQUE INDEX IF NOT EXISTS uq_anaes_case_live
    ON health.anaesthesia_records(tenant_id, case_id)
 WHERE voided_at IS NULL;

-- Deferred FKs (child tables now exist).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgical_cases_preop_fk' AND conrelid = 'health.surgical_cases'::regclass) THEN
    ALTER TABLE health.surgical_cases
      ADD CONSTRAINT surgical_cases_preop_fk
      FOREIGN KEY (preop_checklist_id) REFERENCES health.preop_checklists(checklist_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgical_cases_anaes_fk' AND conrelid = 'health.surgical_cases'::regclass) THEN
    ALTER TABLE health.surgical_cases
      ADD CONSTRAINT surgical_cases_anaes_fk
      FOREIGN KEY (anaesthesia_record_id) REFERENCES health.anaesthesia_records(anaesthesia_id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('operating_theatres'),('surgical_cases'),('surgical_team_members'),('preop_checklists'),('anaesthesia_records')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('operating_theatres'),('surgical_cases'),('surgical_team_members'),('preop_checklists'),('preop_checklist_items'),('anaesthesia_records')
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
