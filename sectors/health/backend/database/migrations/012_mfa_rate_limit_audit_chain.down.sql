-- 012 DOWN: MFA / rate-limit / audit-chain / queue_jobs
BEGIN;
DROP TRIGGER IF EXISTS trg_audit_chain ON health.audit_log;
DROP TRIGGER IF EXISTS trg_audit_update_block ON health.audit_log;
DROP FUNCTION IF EXISTS health.trg_audit_chain();
DROP FUNCTION IF EXISTS health.trg_audit_update_block();
ALTER TABLE health.audit_log DROP COLUMN IF EXISTS entry_hash,
                         DROP COLUMN IF EXISTS prev_hash,
                         DROP COLUMN IF EXISTS hash_version;
DROP TABLE IF EXISTS health.queue_jobs CASCADE;
DROP TABLE IF EXISTS health.rate_limit_events CASCADE;
DROP TABLE IF EXISTS health.mfa_lockouts CASCADE;
DROP TABLE IF EXISTS health.mfa_challenges CASCADE;
DROP TABLE IF EXISTS health.mfa_recovery_codes CASCADE;
DROP TABLE IF EXISTS health.mfa_factors CASCADE;
COMMIT;
