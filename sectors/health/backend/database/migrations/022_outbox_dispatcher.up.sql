-- Migration 022: governed outbox dispatcher state (Phase 8 event delivery)
--
-- Extends health.beyu_outbox (migration 014) from a write-ahead accounting
-- table into the substrate of the governed event dispatcher:
--
--   attempt_count   attempts made so far (claim increments BEFORE delivery)
--   next_attempt_at lease while delivering; backoff deadline while failed;
--                   NULL when the row is not scheduled
--   last_attempt_at timestamp of the most recent claim
--   attempt_log     append-only attempt history [{attempt, at, phase, …}]
--
--   status 'dead_letter'  terminal state after max attempts (or a permanent
--                         4xx validation rejection). Only an AUTHORIZED
--                         operator replay may requeue it.
--
-- The dispatcher must enumerate tenants with due rows WITHOUT being able to
-- read cross-tenant data: health.beyu_outbox_due_tenants() is a narrow,
-- read-only SECURITY DEFINER function returning tenant ids (and NULL for
-- service-initiated rows) only. All actual row access still flows through
-- the outbox RLS policy under the owning tenant's context.

ALTER TABLE health.beyu_outbox
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE health.beyu_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE health.beyu_outbox
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE health.beyu_outbox
  ADD COLUMN IF NOT EXISTS attempt_log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Status vocabulary now includes the terminal dead-letter state.
ALTER TABLE health.beyu_outbox DROP CONSTRAINT IF EXISTS beyu_outbox_status_check;
ALTER TABLE health.beyu_outbox
  ADD CONSTRAINT beyu_outbox_status_check
  CHECK (status IN ('pending','delivered','failed','blocked','dead_letter'));

-- Dispatcher claim index: due rows by status and schedule.
DROP INDEX IF EXISTS health.idx_beyu_outbox_dispatch;
CREATE INDEX idx_beyu_outbox_dispatch ON health.beyu_outbox (status, next_attempt_at, created_at)
  WHERE status IN ('pending','failed','blocked');

-- Narrow tenant enumeration for the dispatcher (SECURITY DEFINER, read-only,
-- search_path pinned). Returns the tenant ids that currently have due outbox
-- rows, plus a NULL row for service-initiated (tenant-less) events.
CREATE OR REPLACE FUNCTION health.beyu_outbox_due_tenants()
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = health, pg_temp
AS $$
  SELECT DISTINCT o.tenant_id
  FROM health.beyu_outbox o
  WHERE o.status IN ('pending','failed','blocked')
    AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= now())
$$;

REVOKE ALL ON FUNCTION health.beyu_outbox_due_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health.beyu_outbox_due_tenants() TO PUBLIC;
