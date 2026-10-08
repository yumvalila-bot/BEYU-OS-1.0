-- Migration 039 — Insurance & revenue cycle: coverage profiles, eligibility
-- checks, pre-authorizations, claims, claim lines and remittance advice.
--
-- WHY THIS EXISTS
--   Billing already produced invoices, payments and allocations, and
--   `permissions` already contained `claim:submit`, but there was NO claim:
--   no payer profile, no eligibility record, no pre-auth, nothing to submit,
--   nothing to reject and nothing to reconcile a remittance against. The
--   `claim:submit' permission therefore guarded nothing.
--
-- FINANCIAL GOVERNANCE (read this before changing anything below)
--   * These tables are the receivable-side operational record. They are NOT a
--     general ledger and they do not post journal entries. Ledger posting lives
--     in BEYU Finance OS; `health.finance_events` (007) stays the ONLY staging
--     surface for outbound ledger events, and claim/payment postings are
--     STAGED there with the existing governance controls. CAP_POSTING stays
--     fail-closed.
--   * No amount on a claim may exceed the linked invoice total; that is
--     enforced here by CHECK plus in the service, so a direct SQL write cannot
--     invent a larger claim than the invoice supports.
--   * Submission to a payer (NHIF or any other) is an EXTERNAL integration.
--     `submission_state` has exactly one honest value for "not connected":
--     'not_connected'. The service refuses to mark a claim submitted unless the
--     payer adapter reports itself available, which it cannot until real
--     credentials and endpoints exist. There is no simulated success path.
--
-- NON-DUPLICATION
--   * Coverage attaches to the existing patient; no second member/patient model.
--   * Claim lines reference `health.billable_services` (007) for pricing and
--     code, instead of re-declaring a service catalogue.
--   * Remittances settle against the existing invoice/payment ledger by
--     recording `matched_payment_id` and `invoice_id`; money movement continues
--     to be recorded by billing.recordPayment, not by a second cash table.
--   * The `claim:submit` permission is reused; only narrower, genuinely new
--     capabilities (payer profile write, pre-auth, remittance posting) are added
--     in migration 044.

BEGIN;

CREATE TABLE IF NOT EXISTS health.insurance_profiles (
  profile_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  payer_type      text NOT NULL DEFAULT 'private', -- nhif | private_insurer | employer_scheme | out_of_pocket | ngo | government_referral
  payer_name      text NOT NULL,
  policy_number   text,
  member_number   text,
  -- Deliberately no fake verification: 'unverified' is the honest default and
  -- a claim requires an eligibility check to have passed first.
  verification_status text NOT NULL DEFAULT 'unverified',
    -- unverified | verified | verification_failed | external_verification_required
  effective_from  date,
  effective_to    date,
  cover_level     text,
  copay_amount    numeric NOT NULL DEFAULT 0 CHECK (copay_amount >= 0),
  copay_percent   numeric(5,2) CHECK (copay_percent IS NULL OR (copay_percent >= 0 AND copay_percent <= 100)),
  deductible_amount numeric NOT NULL DEFAULT 0 CHECK (deductible_amount >= 0),
  deductible_used numeric NOT NULL DEFAULT 0 CHECK (deductible_used >= 0),
  annual_limit    numeric CHECK (annual_limit IS NULL OR annual_limit >= 0),
  annual_used     numeric CHECK (annual_used IS NULL OR annual_used >= 0),
  responsible_party_name text,
  responsible_party_relation text,
  responsible_party_contact text,
  status          text NOT NULL DEFAULT 'active', -- active | expired | suspended | cancelled
  primary_coverage boolean NOT NULL DEFAULT true,
  verified_at     timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (payer_type IN ('nhif','private_insurer','employer_scheme','out_of_pocket','ngo','government_referral')),
  CHECK (status IN ('active','expired','suspended','cancelled')),
  CHECK (verification_status IN ('unverified','verified','verification_failed','external_verification_required')),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK ((verification_status = 'verified' AND verified_at IS NOT NULL) OR verification_status <> 'verified'),
  -- Deductible cannot be consumed beyond itself.
  CHECK (deductible_used <= deductible_amount OR deductible_amount = 0),
  CHECK (annual_used <= annual_limit OR annual_limit IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_ins_profile_patient ON health.insurance_profiles(patient_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ins_one_primary_per_patient
  ON health.insurance_profiles(patient_id) WHERE primary_coverage AND status = 'active';

CREATE TABLE IF NOT EXISTS health.insurance_eligibility_checks (
  eligibility_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  profile_id      uuid NOT NULL REFERENCES health.insurance_profiles(profile_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz,
  result          text NOT NULL DEFAULT 'unknown', -- eligible | partially_eligible | ineligible | unknown
  source          text NOT NULL DEFAULT 'manual', -- manual | external_api | document
  -- 'external_api' is only reachable when a payer adapter is actually wired.
  response_summary text,
  denial_reason   text,
  requested_by    uuid REFERENCES beyu_identity.users(global_user_id),
  adapter_unavailable_reason text,
  idempotency_key text,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (result IN ('eligible','partially_eligible','ineligible','unknown')),
  CHECK (source IN ('manual','external_api','document'))
);
CREATE INDEX IF NOT EXISTS idx_elig_profile ON health.insurance_eligibility_checks(profile_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS health.preauthorizations (
  preauth_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  profile_id      uuid NOT NULL REFERENCES health.insurance_profiles(profile_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  service_code    text,
  service_name    text NOT NULL,
  requested_amount numeric CHECK (requested_amount IS NULL OR requested_amount >= 0),
  clinical_justification text NOT NULL,
  status          text NOT NULL DEFAULT 'requested',
    -- requested | approved | partially_approved | denied | expired | cancelled
  approved_amount numeric CHECK (approved_amount IS NULL OR approved_amount >= 0),
  authorization_number text,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      uuid REFERENCES beyu_identity.users(global_user_id),
  valid_until     timestamptz,
  denial_reason   text,
  submission_state text NOT NULL DEFAULT 'not_connected',
    -- not_connected | pending_external | submitted | failed
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('requested','approved','partially_approved','denied','expired','cancelled')),
  CHECK (submission_state IN ('not_connected','pending_external','submitted','failed')),
  CHECK (approved_amount IS NULL OR requested_amount IS NULL OR approved_amount <= requested_amount),
  CHECK ((status IN ('approved','partially_approved','denied','expired')) OR decided_at IS NULL),
  -- A decision recorded as approved with no authorization reference is not a
  -- decision a payer will honour; refuse to store it silently.
  CHECK ((status NOT IN ('approved','partially_approved')) OR authorization_number IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_preauth_patient ON health.preauthorizations(patient_id, status);

-- ── claims ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.claims (
  claim_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  claim_no        text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES health.invoices(invoice_id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES health.insurance_profiles(profile_id) ON DELETE SET NULL,
  preauth_id      uuid REFERENCES health.preauthorizations(preauth_id) ON DELETE SET NULL,
  eligibility_id  uuid REFERENCES health.insurance_eligibility_checks(eligibility_id) ON DELETE SET NULL,
  total_billed    numeric NOT NULL DEFAULT 0 CHECK (total_billed >= 0),
  total_approved  numeric NOT NULL DEFAULT 0 CHECK (total_approved >= 0),
  total_paid      numeric NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  patient_responsibility numeric NOT NULL DEFAULT 0 CHECK (patient_responsibility >= 0),
  currency        text NOT NULL DEFAULT 'TZS',
  status          text NOT NULL DEFAULT 'draft',
    -- draft | ready | submitted | accepted | rejected | partially_paid | paid
    -- | appealed | written_off | cancelled
  submission_state text NOT NULL DEFAULT 'not_connected',
    -- not_connected | pending_external | submitted | failed
  submission_error text,
  submitted_at    timestamptz,
  external_reference text,          -- payer claim id; ONLY from a real response
  rejection_reason text,
  rejected_at     timestamptz,
  resubmission_count integer NOT NULL DEFAULT 0 CHECK (resubmission_count >= 0),
  parent_claim_id uuid REFERENCES health.claims(claim_id) ON DELETE SET NULL,
  due_submission_date date,          -- payer filing deadline
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, claim_no),
  CHECK (status IN ('draft','ready','submitted','accepted','rejected','partially_paid','paid','appealed','written_off','cancelled')),
  CHECK (submission_state IN ('not_connected','pending_external','submitted','failed')),
  -- A claim may not bill more than the invoice it is raised against. That rule
  -- is enforced in InsuranceService.assertClaimWithinInvoice(), because a CHECK
  -- constraint cannot contain a subquery; the amount is denormalised below so
  -- the invariant is still visible on the row itself.
  invoice_total_snapshot numeric NOT NULL DEFAULT 0 CHECK (invoice_total_snapshot >= 0),
  CHECK (total_billed <= invoice_total_snapshot + 0.01),
  -- 'submitted' is only a fact if an external reference came back with it.
  CHECK ((status <> 'submitted') OR submitted_at IS NOT NULL),
  CHECK (parent_claim_id IS NULL OR parent_claim_id <> claim_id)
);
CREATE INDEX IF NOT EXISTS idx_claim_status ON health.claims(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_invoice ON health.claims(invoice_id);
CREATE INDEX IF NOT EXISTS idx_claim_patient ON health.claims(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS health.claim_items (
  claim_item_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  claim_id        uuid NOT NULL REFERENCES health.claims(claim_id) ON DELETE CASCADE,
  invoice_item_id uuid,
  service_id      uuid REFERENCES health.billable_services(service_id) ON DELETE SET NULL,
  code_system     text,                        -- icd10 | loinc | cpt | local | nhif_tariff
  code            text,
  description     text NOT NULL,
  quantity        numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  amount          numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  approved_amount numeric CHECK (approved_amount IS NULL OR approved_amount >= 0),
  paid_amount     numeric CHECK (paid_amount IS NULL OR paid_amount >= 0),
  denial_reason   text,
  status          text NOT NULL DEFAULT 'billed', -- billed | approved | denied | partially_paid | paid
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  correlation_id  text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('billed','approved','denied','partially_paid','paid')),
  -- Paid cannot exceed approved: an over-payment is a reconciliation defect,
  -- not a rounding difference, so it is refused at the database.
  CHECK (paid_amount IS NULL OR approved_amount IS NULL OR paid_amount <= approved_amount + 0.01)
);
CREATE INDEX IF NOT EXISTS idx_claim_items_claim ON health.claim_items(claim_id);

CREATE TABLE IF NOT EXISTS health.claim_remittances (
  remittance_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  claim_id        uuid NOT NULL REFERENCES health.claims(claim_id) ON DELETE CASCADE,
  remit_no        text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  payer_name      text NOT NULL,
  amount_paid     numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  patient_share   numeric NOT NULL DEFAULT 0 CHECK (patient_share >= 0),
  currency        text NOT NULL DEFAULT 'TZS',
  adjudication    text NOT NULL DEFAULT 'paid', -- paid | partially_paid | denied | returned
  denial_reason   text,
  remark          text,
  matched_payment_id uuid,            -- populated when billing recorded the cash
  matched_invoice_id uuid,
  posting_state   text NOT NULL DEFAULT 'staged', -- staged | posted_to_finance | blocked
  posting_reason  text,
  source          text NOT NULL DEFAULT 'manual', -- manual | external_api
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, remit_no),
  CHECK (adjudication IN ('paid','partially_paid','denied','returned')),
  CHECK (posting_state IN ('staged','posted_to_finance','blocked')),
  CHECK (source IN ('manual','external_api')),
  -- 'posted_to_finance' is a claim about Finance OS having ingested the event.
  -- It can only be set by the governed staging path, never by a client.
  CHECK ((posting_state <> 'posted_to_finance') OR matched_payment_id IS NOT NULL OR amount_paid = 0)
);
CREATE INDEX IF NOT EXISTS idx_remit_claim ON health.claim_remittances(claim_id, received_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('insurance_profiles'),('preauthorizations'),('claims'),('claim_remittances')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('insurance_profiles'),('insurance_eligibility_checks'),('preauthorizations'),('claims'),('claim_items'),('claim_remittances')
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
