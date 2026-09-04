-- Migration 022 DOWN: remove dispatcher state (forward-fix policy applies in
-- production; down migrations exist for development and drills).
DROP FUNCTION IF EXISTS health.beyu_outbox_due_tenants();
DROP INDEX IF EXISTS health.idx_beyu_outbox_dispatch;
ALTER TABLE health.beyu_outbox DROP CONSTRAINT IF EXISTS beyu_outbox_status_check;
ALTER TABLE health.beyu_outbox
  ADD CONSTRAINT beyu_outbox_status_check
  CHECK (status IN ('pending','delivered','failed','blocked'));
ALTER TABLE health.beyu_outbox DROP COLUMN IF EXISTS attempt_log;
ALTER TABLE health.beyu_outbox DROP COLUMN IF EXISTS last_attempt_at;
ALTER TABLE health.beyu_outbox DROP COLUMN IF EXISTS next_attempt_at;
ALTER TABLE health.beyu_outbox DROP COLUMN IF EXISTS attempt_count;
