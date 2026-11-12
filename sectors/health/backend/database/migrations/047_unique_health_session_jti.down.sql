-- 047 down — remove the Health-local session jti uniqueness guard.
DROP INDEX IF EXISTS beyu_identity.idx_sessions_jti_unique;
