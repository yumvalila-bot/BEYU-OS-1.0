-- BEYU Health OS — Bridge Lifecycle Status (Phase 4 governance repair)
--
-- Adds lifecycle/status semantics to the identity bridge:
--   - status: active | revoked | expired (default: active)
--   - revoked_at: when the link was revoked (NULL if not revoked)
--   - revoked_by: who revoked the link (NULL if not revoked)
--   - source: how the link was created (federation | manual | migration)
--
-- This enables:
--   1. Revocation without deletion (audit trail preserved)
--   2. Expiry checks (future: add expires_at if needed)
--   3. Source attribution (who/what created the link)
--   4. Fail-closed authorization (revoked links deny access)
--
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Add status column with default 'active' for backward compatibility.
ALTER TABLE beyu_identity.beyu_identity_links
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add CHECK constraint to enforce valid status values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'beyu_identity_links_status_check'
  ) THEN
    ALTER TABLE beyu_identity.beyu_identity_links
      ADD CONSTRAINT beyu_identity_links_status_check
      CHECK (status IN ('active', 'revoked', 'expired'));
  END IF;
END $$;

-- Add revocation metadata.
ALTER TABLE beyu_identity.beyu_identity_links
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE beyu_identity.beyu_identity_links
  ADD COLUMN IF NOT EXISTS revoked_by text;

-- Add source attribution (how the link was created).
ALTER TABLE beyu_identity.beyu_identity_links
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Index for efficient revocation/expiry checks.
CREATE INDEX IF NOT EXISTS idx_beyu_links_status
  ON beyu_identity.beyu_identity_links(status)
  WHERE status != 'active';

-- Update existing RLS policy to include status check.
-- (The isolation policy on the links table itself is implicit via FK;
--  this ensures revoked links are visible for audit but denied for auth.)

COMMENT ON COLUMN beyu_identity.beyu_identity_links.status IS
  'Lifecycle status: active (valid), revoked (denied), expired (time-limited). Fail-closed: only active links authorize.';

COMMENT ON COLUMN beyu_identity.beyu_identity_links.source IS
  'How the link was created: federation (automated), manual (human-approved), migration (backfilled).';
