-- Migration 015: security_version hardening + session binding + MFA step-up binding.
--
-- 1. Binds sessions to the user's security_version at creation time; when
--    security_version is bumped (credential change, MFA reset, privilege
--    change, forced logout, account lock), sessions whose stored sv is
--    stale are invalidated. RefreshToken rotation asserts sv matches the
--    current user.security_version.
-- 2. Adds security_version to health.mfa_challenges (was already there per
--    code inspection but ensure column exists idempotently).
-- 3. Adds a helper function health.revoke_sessions_for_user that atomically
--    bumps security_version and revokes all sessions.

-- Bind sessions to security_version.
ALTER TABLE beyu_identity.sessions
  ADD COLUMN IF NOT EXISTS security_version integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_user_sv ON beyu_identity.sessions(global_user_id, security_version);

-- Ensure health.mfa_challenges carries security_version binding.
ALTER TABLE health.mfa_challenges
  ADD COLUMN IF NOT EXISTS security_version integer NOT NULL DEFAULT 0;

-- Helper: atomically bump security_version and revoke all active sessions
-- for a user. Used on password change, MFA reset, privilege change,
-- forced logout, account recovery, admin lock, security reset.
CREATE OR REPLACE FUNCTION beyu_identity.revoke_all_sessions_bump_sv(p_user_id uuid)
RETURNS integer AS $$
DECLARE v_new_sv integer;
BEGIN
  UPDATE beyu_identity.users
     SET security_version = security_version + 1,
         updated_at = now()
   WHERE global_user_id = p_user_id
   RETURNING security_version INTO v_new_sv;

  UPDATE beyu_identity.sessions
     SET status = 'revoked',
         updated_at = now()
   WHERE global_user_id = p_user_id
     AND status = 'active';

  -- Revoke any outstanding CSRF tokens bound to those sessions.
  UPDATE health.csrf_tokens
     SET revoked_at = now()
   WHERE user_id = p_user_id AND revoked_at IS NULL;

  RETURN v_new_sv;
END;
$$ LANGUAGE plpgsql;
