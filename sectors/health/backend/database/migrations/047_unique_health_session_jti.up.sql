-- 047 — unique Health-local access-session jti.
-- The access-token jti is the durable lookup/revocation key for each local
-- session. Null legacy jti values remain permitted; duplicate non-null values
-- block the migration rather than selecting an ambiguous session.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM beyu_identity.sessions
     WHERE jti IS NOT NULL
     GROUP BY jti
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '047 blocked: duplicate non-null session jti values require explicit reconciliation';
  END IF;
END
$migration$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_jti_unique
  ON beyu_identity.sessions(jti)
  WHERE jti IS NOT NULL;
