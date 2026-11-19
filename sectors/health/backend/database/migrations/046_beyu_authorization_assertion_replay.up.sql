-- One Health-owned replay ledger for short-lived BEYU assertions.
-- This table does not grant a session or authorize an operation. The verifier
-- must validate the issuer, signature, audience, times and request binding
-- before inserting. INSERT must commit independently before downstream work.
-- No historical migration, BEYU identity registry or tenant registry is changed.

CREATE TABLE IF NOT EXISTS beyu_identity.health_request_replay (
  issuer text NOT NULL,
  jti text NOT NULL,
  retain_until timestamptz NOT NULL,
  PRIMARY KEY (issuer, jti)
);

CREATE INDEX IF NOT EXISTS health_assertion_replays_retain_until_idx
  ON beyu_identity.health_request_replay (retain_until);

REVOKE ALL ON TABLE beyu_identity.health_request_replay FROM PUBLIC;

-- No runtime grant is made here: deployment must provision the independently
-- reviewed Health runtime role with INSERT on (issuer, jti, retain_until) and
-- SELECT on (issuer, jti), and USAGE on this schema. No DELETE or UPDATE.
-- Cleanup must be performed by a separate governed maintenance principal.
