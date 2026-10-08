-- Migration 039 down — remove the insurance/RCM domain. Additive-only:
-- health.invoices, health.payments and health.finance_events (007) untouched,
-- so CAP_POSTING staging is unaffected by rollback.
BEGIN;
DROP TABLE IF EXISTS health.claim_remittances;
DROP TABLE IF EXISTS health.claim_items;
DROP TABLE IF EXISTS health.claims;
DROP TABLE IF EXISTS health.preauthorizations;
DROP TABLE IF EXISTS health.insurance_eligibility_checks;
DROP TABLE IF EXISTS health.insurance_profiles;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('insurance_profiles'),('preauthorizations'),('claims'),('claim_remittances')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
