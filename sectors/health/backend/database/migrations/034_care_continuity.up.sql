-- Migration 034 — Care continuity: care plans, clinical tasks, discharge
-- summaries, follow-ups and clinical document metadata.
--
-- WHY THIS EXISTS
--   The chart could hold problems, observations, medications and allergies, but
--   nothing that says what the team intends to DO (care plan), who owes it
--   (task), what the episode concluded (discharge summary), when to see the
--   patient again (follow-up), or how a scanned/externally-produced document
--   attaches to the record. Those four are the difference between a data
--   store and a chart of record.
--
-- NON-DUPLICATION (checked against migrations 001-033 before writing)
--   * Diagnoses live in `health.problems`, vitals/observations in
--     `health.observations`, drugs in `health.medications`, allergies in
--     `health.allergies`. None of those are re-created here.
--   * Clinical notes are NOT re-created. `health.observations` (category
--     'note') and signed encounter content stay the note surface; this
--     migration adds no parallel note table.
--   * Signing reuses `health.signatures` (009) — a generic (resource_type,
--     resource_id) signature ledger. Discharge summaries and care plans are
--     signed by writing a signatures row, not by inventing a second
--     "signed_by/signature_hash" pattern per table. The denormalised
--     status/signed_at columns below are a projection for read performance;
--     the signature row remains the evidentiary record.
--   * Document BINARIES are not stored in the database. `clinical_documents`
--     holds metadata + a content hash and an opaque storage reference, with
--     the object store/PACS as an EXTERNAL integration boundary. This
--     repository does not implement a file store, and no fake URL is baked in.
--   * Amendments use a `parent_document_id` chain, matching how
--     `health.imaging_reports.parent_id` and `health.lab_order_items.parent_id`
--     already handle "never silently overwrite a verified result".
--
-- Idempotent DDL throughout (IF NOT EXISTS / DROP POLICY IF EXISTS).

BEGIN;

-- ── care plans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.care_plans (
  plan_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  title           text NOT NULL,
  category        text NOT NULL DEFAULT 'general',
    -- general | wound_care | pain | infection | chronic_disease | maternal
    -- | neonatal | nutrition | mobility | discharge_planning | palliative
  problem_summary text,
  goal            text,
  target_date     date,
  review_due_at   timestamptz,
  status          text NOT NULL DEFAULT 'active',
    -- draft | active | paused | completed | cancelled
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  signed_at       timestamptz,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('draft','active','paused','completed','cancelled')),
  CHECK (category IN ('general','wound_care','pain','infection','chronic_disease','maternal','neonatal','nutrition','mobility','discharge_planning','palliative')),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_care_plan_patient ON health.care_plans(patient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_plan_review ON health.care_plans(tenant_id, review_due_at)
  WHERE status = 'active';

-- ── clinical tasks (nursing + allied + physician to-dos) ─────────────────────
-- One task table serves clinical AND nursing task lists; `task_type` carries
-- the discipline. A second "nursing_tasks" table would be the same rows with a
-- different name.
CREATE TABLE IF NOT EXISTS health.care_plan_tasks (
  task_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  plan_id         uuid REFERENCES health.care_plans(plan_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  task_type       text NOT NULL DEFAULT 'clinical',
    -- clinical | nursing | medication | monitoring | education | wound_care
    -- | observation | transport | referral | followup | equipment
  title           text NOT NULL,
  instruction     text,
  priority        text NOT NULL DEFAULT 'routine', -- routine | urgent | stat
  recurrence      text NOT NULL DEFAULT 'none',    -- none | hourly | qds | tid | bd | od | weekly
  interval_minutes integer CHECK (interval_minutes IS NULL OR interval_minutes > 0),
  due_at          timestamptz,
  status          text NOT NULL DEFAULT 'open',
    -- open | in_progress | done | skipped | cancelled | overdue
  assigned_to     uuid REFERENCES beyu_identity.users(global_user_id),
  assigned_role   text,                       -- nurse | doctor | pharmacist | lab | ...
  completed_at    timestamptz,
  completed_by    uuid REFERENCES beyu_identity.users(global_user_id),
  outcome_note    text,
  skip_reason     text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('open','in_progress','done','skipped','cancelled','overdue')),
  CHECK (priority IN ('routine','urgent','stat')),
  CHECK (recurrence IN ('none','hourly','qds','tid','bd','od','weekly')),
  -- A completed or skipped task must say who and why/when: no silent closure.
  CHECK (
    (status = 'done' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    OR (status <> 'done')
  ),
  CHECK (
    (status = 'skipped' AND skip_reason IS NOT NULL)
    OR (status <> 'skipped')
  )
);
CREATE INDEX IF NOT EXISTS idx_task_due ON health.care_plan_tasks(tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON health.care_plan_tasks(assigned_to, status, due_at);
CREATE INDEX IF NOT EXISTS idx_task_patient ON health.care_plan_tasks(patient_id, created_at DESC);

-- ── discharge summaries ──────────────────────────────────────────────────────
-- One summary per encounter (UNIQUE below). Condition at discharge and the
-- follow-up plan are recorded here; the medication list of record stays in
-- health.medications and is rendered into the document, not copied.
CREATE TABLE IF NOT EXISTS health.discharge_summaries (
  summary_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  encounter_id    uuid NOT NULL REFERENCES health.encounters(encounter_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  diagnosis_summary text NOT NULL,
  procedures_done text,
  course_in_hospital text,
  condition_at_discharge text,
  dischargemeds_note text,
  follow_up_plan  text,
  disposition     text NOT NULL DEFAULT 'discharged',
    -- discharged | transferred | referred | died | ama (against advice)
  admitted_at     timestamptz,
  discharged_at   timestamptz,
  length_of_stay_days integer CHECK (length_of_stay_days IS NULL OR length_of_stay_days >= 0),
  status          text NOT NULL DEFAULT 'draft', -- draft | signed | amended
  signed_at       timestamptz,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  parent_summary_id uuid REFERENCES health.discharge_summaries(summary_id) ON DELETE SET NULL,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('draft','signed','amended')),
  CHECK (disposition IN ('discharged','transferred','referred','died','ama')),
  -- A signed summary must name its signer: the status alone proves nothing.
  CHECK ((status <> 'signed' OR signed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_discharge_patient ON health.discharge_summaries(patient_id, created_at DESC);

-- ── follow-ups ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.followups (
  followup_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'clinic', -- clinic | discharge | referral | telehealth | screening | campaign
  channel         text NOT NULL DEFAULT 'in_person', -- in_person | phone | telehealth | message
  reason          text,
  due_date        date NOT NULL,
  window_days     integer NOT NULL DEFAULT 14 CHECK (window_days BETWEEN 0 AND 3650),
  status          text NOT NULL DEFAULT 'scheduled',
    -- scheduled | contacted | completed | cancelled | no_shown | lost_to_follow_up
  contacted_at    timestamptz,
  completed_at    timestamptz,
  appointment_id  uuid REFERENCES health.appointments(appointment_id) ON DELETE SET NULL,
  note            text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('scheduled','contacted','completed','cancelled','no_shown','lost_to_follow_up')),
  CHECK (source IN ('clinic','discharge','referral','telehealth','screening','campaign')),
  CHECK (channel IN ('in_person','phone','telehealth','message')),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);
-- Exactly one *live* summary per encounter. A superseded (voided) amendment
-- stays in the table: the summary of record for an encounter must remain
-- retrievable after it has been amended, which a table-level UNIQUE would have
-- made impossible without editing clinical content in place.
CREATE UNIQUE INDEX IF NOT EXISTS uq_discharge_encounter_open
    ON health.discharge_summaries(tenant_id, encounter_id)
 WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_followup_due ON health.followups(tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_followup_patient ON health.followups(patient_id, due_date DESC);

-- ── clinical document metadata (bytes live outside the database) ──────────────
CREATE TABLE IF NOT EXISTS health.clinical_documents (
  document_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  title           text NOT NULL,
  doc_type        text NOT NULL DEFAULT 'other',
    -- referral_letter | discharge_summary | radiology_report | lab_report
    -- consent | insurance | government_id | clinical_note | imaging_study
    -- | theatre_record | death_certificate | birth_notification | other
  mime_type       text,
  size_bytes      bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  content_sha256  text,                        -- integrity of the stored object
  storage_backend text NOT NULL DEFAULT 'external_object_store',
  storage_ref     text,                        -- opaque; never a signed URL
  source_system   text,                        -- provenance (e.g. 'pacs','scan_station','manual_upload')
  classification  text NOT NULL DEFAULT 'phi', -- public | internal | confidential | phi | restricted
  status          text NOT NULL DEFAULT 'filed', -- draft | filed | signed | voided
  signed_at       timestamptz,
  parent_document_id uuid REFERENCES health.clinical_documents(document_id) ON DELETE SET NULL,
  available       boolean NOT NULL DEFAULT true, -- false = metadata only, object not retrievable here
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('draft','filed','signed','voided')),
  CHECK (classification IN ('public','internal','confidential','phi','restricted')),
  CHECK (doc_type IN ('referral_letter','discharge_summary','radiology_report','lab_report','consent','insurance','government_id','clinical_note','imaging_study','theatre_record','death_certificate','birth_notification','other')),
  CHECK (content_sha256 IS NULL OR char_length(content_sha256) = 64)
);
CREATE INDEX IF NOT EXISTS idx_doc_patient ON health.clinical_documents(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_encounter ON health.clinical_documents(encounter_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('care_plans'),('care_plan_tasks'),('discharge_summaries'),('followups'),('clinical_documents')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('care_plans'),('care_plan_tasks'),('discharge_summaries'),('followups'),('clinical_documents')
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
