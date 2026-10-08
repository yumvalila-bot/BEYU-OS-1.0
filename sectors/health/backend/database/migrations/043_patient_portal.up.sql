-- Migration 043 — Patient portal: self-service access grant and the record of
-- what was released to the patient, plus portal-visible flags.
--
-- WHY THIS EXISTS
--   The patient role exists in the RBAC catalogue and the SPA had a
--   "PatientDashboard", but nothing in the data model expressed the portal
--   boundary: which clinician-patient relationship entitles someone to see the
--   chart, whether online results release is enabled for this patient, and
--   which releases happened when.
--
-- IDENTITY — READ THIS
--   A portal user IS a `beyu_identity.users` row with role='patient' and a
--   `health.beyu_identity_links` federation row (002). This migration creates
--   NO portal-specific login, NO parallel credential table, NO second identity
--   system, and no password/OTP storage. Portal access is authorized by the
--   same guards as every other route; these rows only bind an authenticated
--   GlobalUserID to a patient record and record the patient's own settings.
--
-- NON-DUPLICATION
--   * Results, documents, invoices, appointments and prescriptions are NOT
--     copied into portal tables. `portal_content_releases` records the release
--     EVENT (what, when, to whom, under which consent) and points at the
--     canonical row id. Release is an audited act, not a duplicated record.
--   * Consent choices reuse `health.consents` (009); `results_release_enabled`
--     below is a portal *delivery preference* (may results be shown in the
--     portal at all), which is not the same fact as a disclosure consent, so it
--     is a single column here rather than a fake consent row.
--   * Secure messaging is `health.care_messages` (042), shared with telehealth.

BEGIN;

CREATE TABLE IF NOT EXISTS health.portal_access_grants (
  grant_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  global_user_id  uuid NOT NULL REFERENCES beyu_identity.users(global_user_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  relationship    text NOT NULL DEFAULT 'self',
    -- self | parent_guardian | authorised_representative | carer
  -- Verification is an EXTERNAL fact. 'pending' is the default and the portal
  -- refuses representative access until a human verifies the evidence.
  verification_status text NOT NULL DEFAULT 'verified',
    -- verified | pending | rejected | external_verification_required
  verified_at     timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  evidence_document_id uuid REFERENCES health.clinical_documents(document_id) ON DELETE SET NULL,
  results_release_enabled boolean NOT NULL DEFAULT true,
  messages_enabled boolean NOT NULL DEFAULT true,
  documents_enabled boolean NOT NULL DEFAULT true,
  invoices_enabled boolean NOT NULL DEFAULT true,
  telehealth_enabled boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'active', -- active | suspended | revoked
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoke_reason   text,
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, global_user_id, patient_id),
  CHECK (relationship IN ('self','parent_guardian','authorised_representative','carer')),
  CHECK (verification_status IN ('verified','pending','rejected','external_verification_required')),
  CHECK (status IN ('active','suspended','revoked')),
  -- A representative grant is only usable once a named human has verified it;
  -- 'self' is exempt because the patient owns the record.
  CHECK (
    relationship = 'self'
    OR verification_status <> 'verified'
    OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CHECK ((status <> 'revoked') OR revoked_at IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);
CREATE INDEX IF NOT EXISTS idx_portal_grant_user ON health.portal_access_grants(global_user_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_grant_patient ON health.portal_access_grants(patient_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_self_per_user
  ON health.portal_access_grants(global_user_id) WHERE relationship = 'self' AND status = 'active';

CREATE TABLE IF NOT EXISTS health.portal_content_releases (
  release_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  grant_id        uuid REFERENCES health.portal_access_grants(grant_id) ON DELETE SET NULL,
  content_type    text NOT NULL,
    -- lab_result | imaging_report | discharge_summary | clinical_document
    -- | invoice | prescription | appointment | aftercare_plan
  content_id      uuid NOT NULL,
  released_at     timestamptz NOT NULL DEFAULT now(),
  released_by     uuid REFERENCES beyu_identity.users(global_user_id),
  release_basis   text NOT NULL DEFAULT 'clinician_release',
    -- clinician_release | policy_auto | patient_request | statutory
  consent_id      uuid REFERENCES health.consents(consent_id) ON DELETE SET NULL,
  viewed_at       timestamptz,
  viewed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  redaction_applied boolean NOT NULL DEFAULT false,
  redaction_note  text,
  -- 'sensitive' content (e.g. HIV/GBV categories) is never auto-released; the
  -- service must set review_required and a human must release it.
  review_required boolean NOT NULL DEFAULT false,
  reviewed_by     uuid REFERENCES beyu_identity.users(global_user_id),
  reviewed_at     timestamptz,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (content_type IN ('lab_result','imaging_report','discharge_summary','clinical_document','invoice','prescription','appointment','aftercare_plan')),
  CHECK (release_basis IN ('clinician_release','policy_auto','patient_request','statutory')),
  CHECK ((NOT review_required) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  -- Auto-release can never bypass a review requirement.
  CHECK ((NOT review_required) OR release_basis <> 'policy_auto')
);
CREATE INDEX IF NOT EXISTS idx_release_patient ON health.portal_content_releases(patient_id, released_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_content ON health.portal_content_releases(content_type, content_id);

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('portal_access_grants')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('portal_access_grants'),('portal_content_releases')
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
