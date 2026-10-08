-- Migration 038 down — remove the theatre/surgical domain. Additive-only:
-- encounters, bed allocations and service turnarounds (033/004) are untouched.
--
-- Drop order is the reverse of the dependency graph, with one subtlety: the two
-- deferred foreign keys added ONTO health.surgical_cases (pointing at
-- preop_checklists and anaesthesia_records) must be released before either of
-- those tables can be dropped, otherwise Postgres refuses the drop. They are
-- dropped first so the rollback succeeds whichever order the child tables go in.
BEGIN;
DROP INDEX IF EXISTS health.uq_anaes_case_live;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgical_cases_preop_fk' AND conrelid = 'health.surgical_cases'::regclass) THEN
    ALTER TABLE health.surgical_cases DROP CONSTRAINT surgical_cases_preop_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgical_cases_anaes_fk' AND conrelid = 'health.surgical_cases'::regclass) THEN
    ALTER TABLE health.surgical_cases DROP CONSTRAINT surgical_cases_anaes_fk;
  END IF;
END $$;

DROP TABLE IF EXISTS health.preop_checklist_items;
DROP TABLE IF EXISTS health.surgical_team_members;
DROP TABLE IF EXISTS health.anaesthesia_records;
DROP TABLE IF EXISTS health.preop_checklists;
DROP TABLE IF EXISTS health.surgical_cases;
DROP TABLE IF EXISTS health.operating_theatres;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('operating_theatres'),('surgical_cases'),('surgical_team_members'),('preop_checklists'),('anaesthesia_records')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
