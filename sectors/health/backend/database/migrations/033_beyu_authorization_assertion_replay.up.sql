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

-- The Health runtime role performs replay cleanup and atomic jti consumption.
-- It is a non-owner NOSUPERUSER/NOBYPASSRLS role; no BEYU DB grants are involved.
GRANT SELECT, INSERT, DELETE
  ON TABLE beyu_identity.authorization_assertion_replays
  TO beyu_health_runtime;
