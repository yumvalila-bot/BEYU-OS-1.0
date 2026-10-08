-- Migration 035 — Referrals: internal and external referral lifecycle,
-- tracking events, counter-referrals and the document bundle that travels with
-- a referral.
--
-- WHY THIS EXISTS
--   `health.encounters.disposition` already allows the VALUE 'referred', but a
--   disposition is a one-word outcome, not a referral: nothing to accept it,
--   nothing to track it against, no counter-referral, no packet of documents,
--   and no consent linkage. Referral tracking was requested precisely because
--   patients are lost between facilities when the sending and receiving sides
--   hold different facts.
--
-- NON-DUPLICATION
--   * Does NOT create a second encounter: `from_encounter_id` points at the
--     canonical encounter; the referral is an object attached to it.
--   * Receiving-side appointments reuse `health.appointments` (the booking
--     target is recorded on the referral, not re-implemented here).
--   * Documents reuse `health.clinical_documents` (034) through a join table.
--     No parallel document store.
--   * Consent reuseS `health.consents` (009) via consent_id: a referral that
--     crosses an organizational boundary is a disclosure purpose, which is
--     exactly what consents.purpose/recipient already model.
--   * External facilities are recorded by free-text organization + optional
--     facility_id when the facility exists in THIS tenant's registry. We do not
--     fabricate a global facility master; a cross-tenant facility reference
--     would breach isolation, so an unknown destination stays text until BEYU
--     Federation Registry resolves it (documented boundary).
--
-- State machine (enforced in the service, constrained here by CHECK):
--   draft → sent → acknowledged → accepted → booked → completed
--                 ↘ declined                    ↘ expired
--   any non-terminal → cancelled. A counter-referral is a NEW row linked by
--   counter_referral_of, so the original stays auditable.

BEGIN;

CREATE TABLE IF NOT EXISTS health.referrals (
  referral_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  referral_no     text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  from_encounter_id uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  from_provider_id  uuid REFERENCES health.providers(provider_id) ON DELETE SET NULL,
  from_department_id uuid REFERENCES health.departments(department_id) ON DELETE SET NULL,
  from_facility_id  uuid REFERENCES health.facilities(facility_id) ON DELETE SET NULL,
  is_external     boolean NOT NULL DEFAULT false,
  to_facility_id  uuid REFERENCES health.facilities(facility_id) ON DELETE SET NULL,
  to_organization_name text,          -- required when the destination is external
  to_practitioner_name text,
  to_practitioner_id   uuid REFERENCES health.practitioners(practitioner_id) ON DELETE SET NULL,
  to_department   text,
  to_specialty    text NOT NULL,
  reason          text NOT NULL,
  clinical_question text,
  urgency         text NOT NULL DEFAULT 'routine', -- routine | urgent | emergent
  status          text NOT NULL DEFAULT 'draft',
    -- draft | sent | acknowledged | accepted | declined | booked | completed
    -- | cancelled | expired
  consent_id      uuid REFERENCES health.consents(consent_id) ON DELETE SET NULL,
  consent_verified boolean NOT NULL DEFAULT false,
  sent_at         timestamptz,
  acknowledged_at timestamptz,
  accepted_at     timestamptz,
  declined_at     timestamptz,
  decline_reason  text,
  booked_appointment_id uuid REFERENCES health.appointments(appointment_id) ON DELETE SET NULL,
  seen_at         timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  outcome_summary text,
  valid_until     date,
  counter_referral_of uuid REFERENCES health.referrals(referral_id) ON DELETE SET NULL,
  -- Operational routing hint only. It is NOT GPS tracking and is never
  -- fabricated; NULL means "unknown", same convention as ambulance lat/lng.
  transmission_channel text NOT NULL DEFAULT 'internal', -- internal | letter | email | fax | fhir | portal
  transmission_state text NOT NULL DEFAULT 'not_sent', -- not_sent | pending_external | sent | failed
    -- 'pending_external' is the honest state for a fax/email/FHIR peer that
    -- this deployment has no live transport for.
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, referral_no),
  CHECK (urgency IN ('routine','urgent','emergent')),
  -- 'seen' is the attendance milestone between 'booked' and 'completed'. It is
  -- a distinct state because the two gaps mean different things operationally:
  -- booked-but-not-arrived (a no-show to chase) versus attended-and-awaiting
  -- the clinical outcome (a letter to write).
  CHECK (status IN ('draft','sent','acknowledged','accepted','declined','booked','seen','completed','cancelled','expired')),
  CHECK (transmission_channel IN ('internal','letter','email','fax','fhir','portal')),
  CHECK (transmission_state IN ('not_sent','pending_external','sent','failed')),
  -- An external referral must name the receiving organization: "external"
  -- with no destination is how patients get lost.
  CHECK ((NOT is_external) OR to_organization_name IS NOT NULL OR to_facility_id IS NOT NULL),
  CHECK (counter_referral_of IS NULL OR counter_referral_of <> referral_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_patient ON health.referrals(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_status ON health.referrals(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_open ON health.referrals(tenant_id, urgency, sent_at)
  WHERE status IN ('sent','acknowledged','accepted','booked');

-- Append-only tracking: who did what to this referral, when.
CREATE TABLE IF NOT EXISTS health.referral_events (
  referral_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  referral_id     uuid NOT NULL REFERENCES health.referrals(referral_id) ON DELETE CASCADE,
  step            text NOT NULL,
    -- created | sent | acknowledged | accepted | declined | booked | seen
    -- | completed | cancelled | expired | document_attached | chased
    -- | counter_referral_raised
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  note            text,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (step IN ('created','sent','acknowledged','accepted','declined','booked','seen','completed','cancelled','expired','document_attached','chased','counter_referral_raised'))
);
CREATE INDEX IF NOT EXISTS idx_referral_events_ref ON health.referral_events(referral_id, occurred_at);

-- Referral ↔ document bundle (many-to-many onto the canonical document table).
CREATE TABLE IF NOT EXISTS health.referral_documents (
  referral_id     uuid NOT NULL REFERENCES health.referrals(referral_id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES health.clinical_documents(document_id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  included_at     timestamptz NOT NULL DEFAULT now(),
  included_by     uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  PRIMARY KEY (referral_id, document_id)
);

DO $$
DECLARE t text;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', 'referrals', 'referrals');
  EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', 'referrals', 'referrals');
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('referrals'),('referral_events'),('referral_documents')
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
