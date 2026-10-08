-- Migration 035 down — remove the referral domain. Additive-only.
BEGIN;
DROP TABLE IF EXISTS health.referral_documents;
DROP TABLE IF EXISTS health.referral_events;
DROP TABLE IF EXISTS health.referrals;
DROP TRIGGER IF EXISTS trg_referrals_updated ON health.referrals;
COMMIT;
