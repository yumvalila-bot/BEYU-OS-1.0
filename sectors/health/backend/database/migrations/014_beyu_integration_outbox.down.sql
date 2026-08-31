-- Migration 014 DOWN: remove BEYU integration layer tables and columns.
DROP TABLE IF EXISTS health.ai_invocations CASCADE;
DROP TABLE IF EXISTS health.governance_decisions CASCADE;
DROP TABLE IF EXISTS health.beyu_outbox CASCADE;
DROP TRIGGER IF EXISTS trg_beyu_outbox_touch ON health.beyu_outbox;
DROP FUNCTION IF EXISTS health.trg_beyu_outbox_touch();

ALTER TABLE health.practitioners
  DROP COLUMN IF EXISTS facility_ids,
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS employment_status,
  DROP COLUMN IF EXISTS cpd_status,
  DROP COLUMN IF EXISTS supervisor_global_user_id,
  DROP COLUMN IF EXISTS employment_start,
  DROP COLUMN IF EXISTS employment_end;
