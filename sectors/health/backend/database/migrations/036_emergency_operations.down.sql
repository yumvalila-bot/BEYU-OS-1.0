-- Migration 036 down — remove emergency operations. Additive-only:
-- health.encounters (kind='emergency') and health.observations are untouched.
BEGIN;
DROP TABLE IF EXISTS health.resuscitation_records;
DROP TABLE IF EXISTS health.clinical_handovers;
DROP TABLE IF EXISTS health.clinical_escalations;
DROP TABLE IF EXISTS health.triage_assessments;
DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('triage_assessments'),('clinical_escalations'),('clinical_handovers'),('resuscitation_records')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
