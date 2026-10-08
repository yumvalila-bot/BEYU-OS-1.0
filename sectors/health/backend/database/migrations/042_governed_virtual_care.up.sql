-- Migration 042 — Governed virtual care: pre-consultation intake, virtual
-- waiting room, participant authorization, session/connectivity events and
-- documented outcomes.
--
-- WHY THIS EXISTS
--   `health.telehealth_sessions` (007) recorded a session id, a status and two
--   opaque URLs. Everything a clinic actually needs around a video consult was
--   absent: no intake, no waiting room, no record of WHO joined the room, no
--   connectivity/lifecycle trace, no outcome document. In particular there was
--   no participant table, which is the security-relevant gap — a virtual room
--   with no record of who is allowed inside it cannot be audited afterwards.
--
-- VIDEO BOUNDARY — READ CAREFULLY
--   HEALTH_OS does NOT implement a media server and this migration adds no
--   WebRTC/ signalling/ recording capability. The existing convention from 007
--   is preserved: `provider_url`/`patient_url` are opaque values produced by an
--   external video adapter, and the adapter registry stays fail-closed until a
--   real provider is configured. Consequently:
--     * `health.telehealth_session_events` records only facts this system can
--       know (state transitions reported by a client, plus server-side
--       observations), never fabricated bitrate or telemetry.
--     * A connectivity metric is explicitly labelled reported_by_client, so a
--       later reader cannot mistake a self-reported figure for network truth.
--
-- NON-DUPLICATION
--   * The session row in 007 remains the anchor; nothing here creates a second
--     session identity, a second appointment model or a second auth system.
--     Participants are AUTHENTICATED BEYU users (GlobalUserID) or the session's
--     patient; an unauthenticated link is not a supported concept.
--   * The clinical note of the consult stays in the linked encounter
--     (kind='teleconsult'); `telehealth_outcomes` holds only the
--     virtual-care-specific disposition and safety-plan fields.
--   * Messaging is ONE canonical table (`health.care_messages`) shared by
--     telehealth and the patient portal. Two messaging systems over the same
--     patient would be exactly the kind of duplication to avoid.
--   * Follow-up scheduling reuses `health.followups` (034); referral raising
--     reuses `health.referrals` (035); charges reuse billing (007).

BEGIN;

CREATE TABLE IF NOT EXISTS health.telehealth_intakes (
  intake_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  session_id      uuid NOT NULL REFERENCES health.telehealth_sessions(session_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  completed_at    timestamptz,
  chief_complaint text,
  symptoms        text,
  duration_of_symptoms text,
  current_medications_confirmed boolean,
  allergies_confirmed boolean,
  vitals_self_reported boolean NOT NULL DEFAULT false,
    -- true = patient-entered figures, which is NOT the same clinical fact as a
    -- measured observation; measured vitals belong in health.observations.
  pulse_ox_reading boolean,
  home_location   text,                       -- where the patient physically is
  alone_with_patient boolean,                 -- adult present for consent/safety
  interpreter_required boolean NOT NULL DEFAULT false,
  interpreter_language text,
  caregiver_present boolean,
  reason_for_virtual text,
  suitability_agreed boolean NOT NULL DEFAULT false,
    -- clinician's judgement that a virtual consult is clinically appropriate;
    -- false means the service must offer an in-person alternative.
  risk_flags text[] NOT NULL DEFAULT '{}',
  submitted_by    uuid REFERENCES beyu_identity.users(global_user_id),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, session_id),
  CHECK (char_length(coalesce(chief_complaint,'')) <= 4000)
);

-- Virtual waiting room. One OPEN row per session (partial unique index below)
-- so "who is waiting now" has exactly one answer.
CREATE TABLE IF NOT EXISTS health.telehealth_queue_entries (
  queue_entry_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  session_id      uuid NOT NULL REFERENCES health.telehealth_sessions(session_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  provider_id     uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  called_at       timestamptz,
  entered_at      timestamptz,
  left_at         timestamptz,
  status          text NOT NULL DEFAULT 'waiting', -- waiting | called | in_session | no_show | left | rescheduled
  position_note   text,                        -- informational only; ordering is computed
  wait_minutes_est integer CHECK (wait_minutes_est IS NULL OR wait_minutes_est >= 0),
  disconnect_reason text,
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('waiting','called','in_session','no_show','left','rescheduled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tele_queue_open
  ON health.telehealth_queue_entries(session_id)
  WHERE status IN ('waiting','called','in_session') AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tele_queue_board ON health.telehealth_queue_entries(tenant_id, status, joined_at);

-- Participants of a virtual room, with WHY they may be there.
CREATE TABLE IF NOT EXISTS health.telehealth_participants (
  participant_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  session_id      uuid NOT NULL REFERENCES health.telehealth_sessions(session_id) ON DELETE CASCADE,
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  global_user_id  uuid REFERENCES beyu_identity.users(global_user_id) ON DELETE SET NULL,
  provider_id     uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  participant_role text NOT NULL,
    -- patient | clinician | interpreter | nurse_observer | care_partner
    -- | supervisor | technical_support
  authorization_basis text NOT NULL,
    -- direct_care | delegated_consent | patient_consent | break_glass |
    -- operational_support
  consent_id      uuid REFERENCES health.consents(consent_id) ON DELETE SET NULL,
  delegation_id   uuid,
  can_view_phi    boolean NOT NULL DEFAULT true,
  can_speak       boolean NOT NULL DEFAULT false,
  admitted_at     timestamptz,
  admitted_by     uuid REFERENCES beyu_identity.users(global_user_id),
  left_at         timestamptz,
  status          text NOT NULL DEFAULT 'invited', -- invited | admitted | declined | left | removed
  -- Reauthorization evidence for deep links: the guard records the outcome of
  -- the server-side recheck performed at admit time. 'not_rechecked' is
  -- refused by the service for any PHI-visible participant.
  auth_recheck_state text NOT NULL DEFAULT 'not_rechecked',
  auth_recheck_at timestamptz,
  recheck_result  text,
  note            text,
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (session_id, participant_role, global_user_id),
  CHECK (participant_role IN ('patient','clinician','interpreter','nurse_observer','care_partner','supervisor','technical_support')),
  CHECK (authorization_basis IN ('direct_care','delegated_consent','patient_consent','break_glass','operational_support')),
  CHECK (status IN ('invited','declined','admitted','left','removed')),
  CHECK (auth_recheck_state IN ('not_rechecked','passed','failed','expired')),
  -- Anyone who can see PHI must have been admitted by a named actor after a
  -- passed recheck. This is the database-level backstop for the "a URL is not
  -- an authorization" rule.
  CHECK (
    (NOT can_view_phi)
    OR (admitted_at IS NOT NULL AND admitted_by IS NOT NULL AND auth_recheck_state = 'passed')
  ),
  CHECK ((auth_recheck_state <> 'passed') OR auth_recheck_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tele_participants_session ON health.telehealth_participants(session_id, status);
CREATE INDEX IF NOT EXISTS idx_tele_participants_user ON health.telehealth_participants(global_user_id, status);

-- Session lifecycle + connectivity (append-only).
CREATE TABLE IF NOT EXISTS health.telehealth_session_events (
  session_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  session_id      uuid NOT NULL REFERENCES health.telehealth_sessions(session_id) ON DELETE CASCADE,
  event_type      text NOT NULL,
    -- session_created | join_link_issued | admitted | started | reconnecting
    -- | reconnected | dropped | ended | aborted | recording_requested_denied
    -- | quality_report | consent_revoked_mid_session | escalated_in_person
    -- | no_show
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  reported_by_client boolean NOT NULL DEFAULT false,
  quality         text,                        -- good | degraded | poor | unusable
  reconnect_attempts integer CHECK (reconnect_attempts IS NULL OR reconnect_attempts >= 0),
  detail          text,                        -- never contains clinical free text
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('session_created','join_link_issued','admitted','started','reconnecting','reconnected','dropped','ended','aborted','recording_requested_denied','quality_report','consent_revoked_mid_session','escalated_in_person','no_show')),
  CHECK (quality IN ('good','degraded','poor','unusable') OR quality IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_tele_events_session ON health.telehealth_session_events(session_id, occurred_at);

-- Virtual-care outcome: what happened, and what it triggered.
CREATE TABLE IF NOT EXISTS health.telehealth_outcomes (
  outcome_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  session_id      uuid NOT NULL REFERENCES health.telehealth_sessions(session_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  disposition     text NOT NULL DEFAULT 'managed_virtual',
    -- managed_virtual | prescription_issued | lab_ordered | imaging_ordered
    -- | referred_in_person | admitted | escalated_emergency | no_show
    -- | referred_specialist | cancelled_by_patient
  clinical_summary text,
  safety_plan     text,
  escalation_needed boolean NOT NULL DEFAULT false,
  escalation_note text,
  prescription_count integer NOT NULL DEFAULT 0 CHECK (prescription_count >= 0),
  lab_order_raised boolean NOT NULL DEFAULT false,
  imaging_order_raised boolean NOT NULL DEFAULT false,
  followup_id     uuid REFERENCES health.followups(followup_id) ON DELETE SET NULL,
  referral_id     uuid REFERENCES health.referrals(referral_id) ON DELETE SET NULL,
  fit_to_drive_or_work_note text,
  billed          boolean NOT NULL DEFAULT false,
  invoice_id      uuid REFERENCES health.invoices(invoice_id) ON DELETE SET NULL,
  document_id     uuid REFERENCES health.clinical_documents(document_id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'drafted', -- drafted | signed
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
  UNIQUE (tenant_id, session_id),
  CHECK (disposition IN ('managed_virtual','prescription_issued','lab_ordered','imaging_ordered','referred_in_person','admitted','escalated_emergency','no_show','referred_specialist','cancelled_by_patient')),
  CHECK (status IN ('drafted','signed')),
  CHECK ((status <> 'signed') OR (signed_by IS NOT NULL AND signed_at IS NOT NULL)),
  CHECK ((NOT escalation_needed) OR escalation_note IS NOT NULL)
);

-- ONE secure-messaging surface for virtual care AND the patient portal.
CREATE TABLE IF NOT EXISTS health.care_message_threads (
  thread_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  context_type    text NOT NULL DEFAULT 'portal', -- portal | telehealth | encounter | referral
  context_id      uuid,
  subject         text NOT NULL,
  status          text NOT NULL DEFAULT 'open', -- open | closed
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  last_message_at timestamptz,
  unread_clinical integer NOT NULL DEFAULT 0 CHECK (unread_clinical >= 0),
  unread_patient  integer NOT NULL DEFAULT 0 CHECK (unread_patient >= 0),
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('open','closed')),
  CHECK (context_type IN ('portal','telehealth','encounter','referral')),
  CHECK ((status = 'open') = (closed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_msg_thread_patient ON health.care_message_threads(patient_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS health.care_messages (
  message_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  thread_id       uuid NOT NULL REFERENCES health.care_message_threads(thread_id) ON DELETE CASCADE,
  sender_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  sender_is_patient boolean NOT NULL DEFAULT false,
  body            text NOT NULL,
  body_sha256     text,
  classification text NOT NULL DEFAULT 'phi',  -- internal | confidential | phi
  -- Attachments are metadata only, same boundary as clinical_documents.
  attachment_document_id uuid REFERENCES health.clinical_documents(document_id) ON DELETE SET NULL,
  visibility      text NOT NULL DEFAULT 'all_participants', -- all_participants | clinical_team_only
  redacted        boolean NOT NULL DEFAULT false,
  redacted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  correlation_id  text,
  CHECK (classification IN ('internal','confidential','phi')),
  CHECK (visibility IN ('all_participants','clinical_team_only')),
  CHECK (body_sha256 IS NULL OR char_length(body_sha256) = 64),
  CHECK (length(trim(body)) > 0),
  CHECK ((NOT redacted) OR redacted_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_care_messages_thread ON health.care_messages(thread_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('telehealth_intakes'),('telehealth_queue_entries'),('telehealth_participants'),('telehealth_outcomes'),('care_message_threads')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('telehealth_intakes'),('telehealth_queue_entries'),('telehealth_participants'),('telehealth_session_events'),('telehealth_outcomes'),('care_message_threads'),('care_messages')
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
