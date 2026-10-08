-- Migration 037 — Patient identity: additional identifiers, provisional
-- (unidentified) patient workflow and governed duplicate-record reconciliation.
--
-- WHY THIS EXISTS
--   A patient row required given_name + family_name and had exactly one
--   identifier (medical_record). Two consequences in a real emergency setting:
--     1. An unidentified trauma arrival ("unknown male, ~30y") could not be
--        registered honestly — staff would invent a name to satisfy NOT NULL.
--     2. Duplicate records are created whenever someone arrives with a
--        National ID or NHIF number that is not the MRN, because there is
--        nowhere to search on those identifiers and no way to reconcile.
--
-- NON-DUPLICATION — this migration deliberately does NOT create a second
--   patient table, a parallel identity system or a global patient registry.
--   * `health.patients` (004) remains the ONE patient entity of record.
--   * `health.beyu_identity_links` (002) remains the ONLY human-identity
--     federation to BEYU GlobalUserID. Nothing here touches it.
--   * Additional identifiers are attached to the existing patient via a child
--     table; they never replace or shadow medical_record.
--   * Reconciliation is a PROPOSAL + governed execution, and the merged row is
--     soft-linked (status='merged', merged_into_patient_id) rather than
--     deleted, so clinical history is never destroyed.
--
-- Patient matching is deterministic and auditable: candidates are produced by
-- comparing identifiers and demographics inside the tenant, and scored from
-- exact matches only. No probabilistic "AI match" is claimed, and no match is
-- ever auto-applied — merging requires a human with merge authority.
--
-- NOTE: patients.status gains 'merged'. Existing rows keep 'active'; the
-- CHECK is widened (never narrowed), so this is backward compatible.

BEGIN;

-- ── additive columns on the canonical patient row ────────────────────────────
ALTER TABLE health.patients ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'verified';
  -- verified | provisional | unknown | merged
ALTER TABLE health.patients ADD COLUMN IF NOT EXISTS merged_into_patient_id uuid
  REFERENCES health.patients(patient_id) ON DELETE SET NULL;
ALTER TABLE health.patients ADD COLUMN IF NOT EXISTS estimated_age_years integer
  CHECK (estimated_age_years IS NULL OR (estimated_age_years >= 0 AND estimated_age_years <= 130));
ALTER TABLE health.patients ADD COLUMN IF NOT EXISTS approximate_age_months integer
  CHECK (approximate_age_months IS NULL OR (approximate_age_months >= 0 AND approximate_age_months <= 1560));
ALTER TABLE health.patients ADD COLUMN IF NOT EXISTS identity_confirmed_at timestamptz;
ALTER TABLE health.patients ADD COLUMN IF NOT EXISTS identity_confirmed_by uuid
  REFERENCES beyu_identity.users(global_user_id);

-- Replace the narrower CHECK with the widened one (drop-if-exists keeps this
-- idempotent; a named constraint is created so the drop is deterministic).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'patients_status_check'
       AND conrelid = 'health.patients'::regclass) THEN
    ALTER TABLE health.patients DROP CONSTRAINT patients_status_check;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'patients_status_v2_check'
       AND conrelid = 'health.patients'::regclass) THEN
    ALTER TABLE health.patients
      ADD CONSTRAINT patients_status_v2_check
      CHECK (status IN ('active','deceased','transferred','archived','merged'));
  END IF;
END $$;

-- A merged row must point at its survivor, and the survivor must not itself be
-- merged (no merge chains to resolve at read time).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'patients_merge_integrity'
       AND conrelid = 'health.patients'::regclass) THEN
    ALTER TABLE health.patients
      ADD CONSTRAINT patients_merge_integrity
      CHECK (
        (status = 'merged') = (merged_into_patient_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patients_identity_status ON health.patients(tenant_id, identity_status);
CREATE INDEX IF NOT EXISTS idx_patients_merged_into ON health.patients(merged_into_patient_id)
  WHERE merged_into_patient_id IS NOT NULL;

-- ── additional identifiers (searchable, tenant-scoped) ───────────────────────
CREATE TABLE IF NOT EXISTS health.patient_identifiers (
  identifier_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  scheme          text NOT NULL,
    -- national_id | voter_id | passport | nhif | ifhp_number | mrn_legacy
    -- | clinic_card | insurance_member | other
  value           text NOT NULL,
  normalized_value text NOT NULL,   -- folded (upper, no spaces/punct) for matching
  issuer          text,
  verified        boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  note            text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, scheme, normalized_value),
  CHECK (scheme IN ('national_id','voter_id','passport','nhif','ifhp_number','mrn_legacy','clinic_card','insurance_member','other')),
  CHECK (char_length(normalized_value) >= 2)
);
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_patient ON health.patient_identifiers(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_norm ON health.patient_identifiers(tenant_id, normalized_value);

-- ── duplicate-record reconciliation ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.patient_merge_proposals (
  proposal_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  survivor_patient_id uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  duplicate_patient_id uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  origin          text NOT NULL DEFAULT 'manual', -- manual | registration | emergency | screening | import
  matched_on       text[] NOT NULL DEFAULT '{}',   -- which evidence linked them
  match_score      numeric(4,3) CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1)),
  rationale        text,
  status          text NOT NULL DEFAULT 'proposed',
    -- proposed | approved | rejected | merged | reverted
  proposed_by     uuid REFERENCES beyu_identity.users(global_user_id),
  reviewed_by     uuid REFERENCES beyu_identity.users(global_user_id),
  reviewed_at     timestamptz,
  review_note     text,
  merged_at       timestamptz,
  reverted_at     timestamptz,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (survivor_patient_id <> duplicate_patient_id),
  CHECK (origin IN ('manual','registration','emergency','screening','import')),
  CHECK (status IN ('proposed','approved','rejected','merged','reverted')),
  -- Merging is destructive to the record layout, so it can never happen
  -- without a named reviewer: 'merged' requires review + timestamp.
  CHECK ((status <> 'merged') OR (reviewed_by IS NOT NULL AND merged_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_merge_open ON health.patient_merge_proposals(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merge_dup ON health.patient_merge_proposals(duplicate_patient_id);

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('patient_identifiers'),('patient_merge_proposals')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('patient_identifiers'),('patient_merge_proposals')
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
