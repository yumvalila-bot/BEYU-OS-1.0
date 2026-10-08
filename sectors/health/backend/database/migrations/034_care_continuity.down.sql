-- Migration 034 down — remove the care-continuity domain.
-- Additive-only: no pre-existing table is altered or dropped.
BEGIN;
DROP INDEX IF EXISTS health.uq_discharge_encounter_open;

DROP TABLE IF EXISTS health.clinical_documents;
DROP TABLE IF EXISTS health.followups;
DROP TABLE IF EXISTS health.discharge_summaries;
DROP TABLE IF EXISTS health.care_plan_tasks;
DROP TABLE IF EXISTS health.care_plans;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('care_plans'),('care_plan_tasks'),('discharge_summaries'),('followups'),('clinical_documents')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;

COMMIT;
