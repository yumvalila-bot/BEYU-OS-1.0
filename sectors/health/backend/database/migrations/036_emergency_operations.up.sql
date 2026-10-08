-- Migration 036 — Emergency operations: structured triage assessments,
-- clinical escalation, shift/procedure handover and resuscitation records.
--
-- WHY THIS EXISTS
--   Ambulance dispatch and `encounters.triage_level` (a single text column)
--   existed; the emergency DEPARTMENT did not. There was no triage assessment
--   with a scale and score, no reassessment clock, no queue/board ordering,
--   no escalation path, no structured handover and no resuscitation record —
--   i.e. nothing that lets a charge nurse see "who is waiting, how sick, and
--   for how long".
--
-- NON-DUPLICATION
--   * The emergency encounter stays `health.encounters` with kind='emergency'.
--     NO parallel "emergency_case" table: an emergency episode IS an encounter.
--   * Vital signs stay in `health.observations` (category 'vital_signs'); the
--     triage assessment references the encounter and does not copy vitals into
--     new columns. Only triage-specific decisions live here.
--   * `encounters.triage_level` is kept as the fast read projection; the
--     assessment row is the record of HOW that level was decided (scale, score,
--     time, assessor). A trigger-free, service-maintained projection.
--   * The ED board/queue is a QUERY over encounters + the latest assessment,
--     deliberately NOT a queue table: a second source of truth for "who is
--     waiting" would drift from the encounter list within one shift.
--   * Escalation and handover are GENERIC clinical tables (one row per event,
--     any encounter) because emergency, ward nursing and theatre recovery all
--     need the identical construct. Three near-copies would be duplication.
--
-- Wait-time safety: `reassess_at` is a nullable deadline, never a fabricated
-- estimate. Elapsed waiting time is computed from occurred_at server-side.

BEGIN;

-- ── triage assessments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.triage_assessments (
  assessment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  encounter_id    uuid NOT NULL REFERENCES health.encounters(encounter_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  triage_at       timestamptz NOT NULL DEFAULT now(),
  triage_scale    text NOT NULL DEFAULT 'mtuha_etat', -- mtuha_etat | manchester | canadian_ctas | starts | handysa
  acuity_level    text NOT NULL,               -- red | orange | yellow | green | blue
  acuity_score    integer CHECK (acuity_score IS NULL OR (acuity_score >= 1 AND acuity_score <= 5)),
  presenting_complaint text NOT NULL,
  mechanism       text,                        -- trauma | medical | obstetric | paediatric | poisoning | other
  consciousness   text,                        -- alert | voice | pain | unresponsive (AVPU)
  airway_patent   boolean,
  breathing_adequate boolean,
  circulation_adequate boolean,
  exposure_done   boolean,
  time_critical   boolean NOT NULL DEFAULT false, -- needs intervention within minutes
  reassess_at     timestamptz,                 -- NULL = no scheduled reassessment
  outcome_action  text,                        -- resus | major_zone | minor_zone | fast_track | waiting | immediate_theatre | admitted | discharged | transferred | death
  location        text,
  notes           text,
  parent_assessment_id uuid REFERENCES health.triage_assessments(assessment_id) ON DELETE SET NULL,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (acuity_level IN ('red','orange','yellow','green','blue')),
  CHECK (triage_scale IN ('mtuha_etat','manchester','canadian_ctas','starts','handysa')),
  CHECK (consciousness IN ('alert','voice','pain','unresponsive')),
  CHECK (mechanism IN ('trauma','medical','obstetric','paediatric','poisoning','other')),
  -- The MTUHA/ETAT colour scale is ordinal; the numeric score must agree with
  -- the colour so a red patient cannot be filed as a 5 by accident.
  CHECK (
    acuity_score IS NULL
    OR (acuity_level = 'red'    AND acuity_score = 1)
    OR (acuity_level = 'orange' AND acuity_score = 2)
    OR (acuity_level = 'yellow' AND acuity_score = 3)
    OR (acuity_level = 'green'  AND acuity_score = 4)
    OR (acuity_level = 'blue'   AND acuity_score = 5)
  )
);
CREATE INDEX IF NOT EXISTS idx_triage_encounter ON health.triage_assessments(encounter_id, triage_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_tenant_time ON health.triage_assessments(tenant_id, triage_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_reassess ON health.triage_assessments(tenant_id, reassess_at)
  WHERE reassess_at IS NOT NULL;

-- ── clinical escalation (ED + ward + theatre recovery) ───────────────────────
CREATE TABLE IF NOT EXISTS health.clinical_escalations (
  escalation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  bed_id          uuid REFERENCES health.beds(bed_id) ON DELETE SET NULL,
  reason          text NOT NULL,
  trigger_type    text NOT NULL DEFAULT 'clinical_concern',
    -- clinical_concern | deteriorating_score | critical_result | capacity
    -- | safety | delay_breach | family_request | other
  severity        text NOT NULL DEFAULT 'urgent', -- advisory | urgent | emergency
  status          text NOT NULL DEFAULT 'open',   -- open | acknowledged | actioned | resolved | cancelled
  raised_by       uuid REFERENCES beyu_identity.users(global_user_id),
  raised_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES beyu_identity.users(global_user_id),
  acknowledged_at timestamptz,
  resolved_by     uuid REFERENCES beyu_identity.users(global_user_id),
  resolved_at     timestamptz,
  response_note   text,
  escalation_target text,               -- e.g. 'medical officer on call', 'ICU registrar'
  breach_minutes  integer CHECK (breach_minutes IS NULL OR breach_minutes >= 0),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('open','acknowledged','actioned','resolved','cancelled')),
  CHECK (severity IN ('advisory','urgent','emergency')),
  CHECK (trigger_type IN ('clinical_concern','deteriorating_score','critical_result','capacity','safety','delay_breach','family_request','other')),
  -- An acknowledged escalation must name the human who acknowledged it.
  CHECK ((status = 'open' AND acknowledged_at IS NULL) OR status <> 'open'),
  CHECK ((acknowledged_at IS NULL OR acknowledged_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_escalation_open ON health.clinical_escalations(tenant_id, severity, raised_at)
  WHERE status IN ('open','acknowledged','actioned');
CREATE INDEX IF NOT EXISTS idx_escalation_encounter ON health.clinical_escalations(encounter_id, raised_at DESC);

-- ── clinical handover (SBAR; ED→ward, ward→ward, theatre→recovery) ────────────
CREATE TABLE IF NOT EXISTS health.clinical_handovers (
  handover_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  context         text NOT NULL DEFAULT 'ward_shift',
    -- emergency_to_ward | ward_shift | theatre_to_recovery | recovery_to_ward
    -- | ward_to_referral | telehealth_to_inperson | ambulance_to_ed
  situation       text NOT NULL,
  background      text,
  assessment      text,
  recommendation  text,
  risks           text,
  pending_actions text,                     -- what the receiver owes next
  status          text NOT NULL DEFAULT 'pending', -- pending | accepted | declined | superseded
  from_actor      uuid REFERENCES beyu_identity.users(global_user_id),
  to_actor        uuid REFERENCES beyu_identity.users(global_user_id),
  to_role         text,                      -- receiver role when no named person yet
  handed_over_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  declined_at     timestamptz,
  decline_reason  text,
  superseded_by   uuid REFERENCES health.clinical_handovers(handover_id) ON DELETE SET NULL,
  bed_id          uuid REFERENCES health.beds(bed_id) ON DELETE SET NULL,
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('pending','accepted','declined','superseded')),
  CHECK (context IN ('emergency_to_ward','ward_shift','theatre_to_recovery','recovery_to_ward','ward_to_referral','telehealth_to_inperson','ambulance_to_ed')),
  CHECK (accepted_at IS NULL OR (status = 'accepted' AND to_actor IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_handover_pending ON health.clinical_handovers(tenant_id, status, handed_over_at DESC);
CREATE INDEX IF NOT EXISTS idx_handover_patient ON health.clinical_handovers(patient_id, handed_over_at DESC);

-- ── resuscitation record (episode of active resuscitation) ───────────────────
CREATE TABLE IF NOT EXISTS health.resuscitation_records (
  record_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  encounter_id    uuid NOT NULL REFERENCES health.encounters(encounter_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  arrest_rhythm   text,               -- vf | vt_asystole | pEA | asystole | bradycardia | other | not_arrest
  shocks_delivered integer NOT NULL DEFAULT 0 CHECK (shocks_delivered >= 0),
  epinephrine_doses integer NOT NULL DEFAULT 0 CHECK (epinephrine_doses >= 0),
  advanced_airway text,
  reversible_causes text,             -- 4H/4T review, free text
  outcome         text,               -- rosc | death | transferred | ongoing | unknown
  team_lead       uuid REFERENCES beyu_identity.users(global_user_id),
  team_ids        uuid[] NOT NULL DEFAULT '{}',
  timeline_note   text,               -- timed entries as text; drug entries stay in medications
  status          text NOT NULL DEFAULT 'in_progress', -- in_progress | closed | signed
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
  CHECK (status IN ('in_progress','closed','signed')),
  CHECK (outcome IN ('rosc','death','transferred','ongoing','unknown')),
  CHECK (arrest_rhythm IN ('vf','vt_asystole','pea','asystole','bradycardia','other','not_arrest') OR arrest_rhythm IS NULL),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK ((status = 'signed' AND signed_by IS NOT NULL AND signed_at IS NOT NULL) OR status <> 'signed')
);
CREATE INDEX IF NOT EXISTS idx_resus_encounter ON health.resuscitation_records(encounter_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_resus_active ON health.resuscitation_records(tenant_id, status)
  WHERE status = 'in_progress';

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('triage_assessments'),('clinical_escalations'),('clinical_handovers'),('resuscitation_records')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('triage_assessments'),('clinical_escalations'),('clinical_handovers'),('resuscitation_records')
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
