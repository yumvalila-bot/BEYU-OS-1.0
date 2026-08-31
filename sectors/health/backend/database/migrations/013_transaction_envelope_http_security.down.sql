-- 013 DOWN
BEGIN;
DROP TABLE IF EXISTS health.csrf_tokens CASCADE;
DROP TABLE IF EXISTS health.login_failures CASCADE;
ALTER TABLE beyu_identity.users DROP COLUMN IF EXISTS security_version;
ALTER TABLE beyu_identity.users DROP COLUMN IF EXISTS mfa_enrolled;
ALTER TABLE beyu_identity.users DROP COLUMN IF EXISTS locked_until;
ALTER TABLE beyu_identity.users DROP COLUMN IF EXISTS failed_login_count;
-- Keep audit NOT NULL tightening (safe to leave; no destructive rollback needed).
COMMIT;
