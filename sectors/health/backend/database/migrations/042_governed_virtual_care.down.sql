-- Migration 042 down — remove governed virtual-care extensions.
-- health.telehealth_sessions (007) is untouched.
BEGIN;
DROP TABLE IF EXISTS health.care_messages;
DROP TABLE IF EXISTS health.care_message_threads;
DROP TABLE IF EXISTS health.telehealth_outcomes;
DROP TABLE IF EXISTS health.telehealth_session_events;
DROP TABLE IF EXISTS health.telehealth_participants;
DROP TABLE IF EXISTS health.telehealth_queue_entries;
DROP TABLE IF EXISTS health.telehealth_intakes;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('telehealth_intakes'),('telehealth_queue_entries'),('telehealth_participants'),('telehealth_outcomes'),('care_message_threads')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
