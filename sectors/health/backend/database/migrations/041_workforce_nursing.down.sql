-- Migration 041 down — remove rostering + nursing assignment domain.
-- providers/practitioners (004/009) are untouched.
BEGIN;
DROP TABLE IF EXISTS health.nursing_assignments;
DROP TABLE IF EXISTS health.staff_competencies;
DROP TABLE IF EXISTS health.roster_assignments;
DROP TABLE IF EXISTS health.roster_shifts;
DROP TABLE IF EXISTS health.shift_templates;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('shift_templates'),('roster_shifts'),('roster_assignments'),('staff_competencies'),('nursing_assignments')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
