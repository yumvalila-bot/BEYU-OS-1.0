-- 033 — Health-local replay protection for BEYU authorization assertions.
-- Additive only. No BEYU database access or cross-database foreign keys.
CREATE TABLE IF NOT EXISTS beyu_identity.authorization_assertion_replays (
  jti               text PRIMARY KEY,
  canonical_user_id text NOT NULL,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_assertion_replays_expiry
  ON beyu_identity.authorization_assertion_replays(expires_at);
