CREATE TABLE "service_principals" (
	"issuer" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Seed: every allowlisted issuer starts explicitly ACTIVE. Revoking an issuer
-- (decommissioned sector, compromised principal) is a one-row administrative
-- UPDATE documented in the runbook; the effect is immediate on every internal
-- endpoint (guardedInternal checks this registry after signature validation).
-- Rotation of the shared secret remains the response for secret compromise.
INSERT INTO "service_principals" ("issuer", "status", "reason") VALUES
  ('HEALTH_OS', 'ACTIVE', 'seed: allowlisted issuer'),
  ('AGRICULTURE_OS', 'ACTIVE', 'seed: allowlisted issuer'),
  ('FINANCE_OS', 'ACTIVE', 'seed: allowlisted issuer'),
  ('FOUNDATION_OS', 'ACTIVE', 'seed: allowlisted issuer'),
  ('BEYU_OS', 'ACTIVE', 'seed: allowlisted issuer')
ON CONFLICT ("issuer") DO NOTHING;
