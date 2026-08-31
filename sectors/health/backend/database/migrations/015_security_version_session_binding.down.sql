DROP FUNCTION IF EXISTS beyu_identity.revoke_all_sessions_bump_sv(uuid);
ALTER TABLE health.mfa_challenges DROP COLUMN IF EXISTS security_version;
DROP INDEX IF EXISTS beyu_identity.idx_sessions_user_sv;
ALTER TABLE beyu_identity.sessions DROP COLUMN IF EXISTS security_version;
