-- Migration 037 down — remove identity reconciliation and the additive patient
-- columns. Reversible: no pre-existing column was repurposed, only added.
-- Any patient row still marked 'merged' is restored to 'active' first so the
-- original status CHECK can be reinstated without violating data.
BEGIN;

UPDATE health.patients
   SET status = 'active',
       merged_into_patient_id = NULL
 WHERE status = 'merged';

DROP TABLE IF EXISTS health.patient_merge_proposals;
DROP TABLE IF EXISTS health.patient_identifiers;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('patient_identifiers'),('patient_merge_proposals')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_merge_integrity' AND conrelid = 'health.patients'::regclass) THEN
    ALTER TABLE health.patients DROP CONSTRAINT patients_merge_integrity;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_status_v2_check' AND conrelid = 'health.patients'::regclass) THEN
    ALTER TABLE health.patients DROP CONSTRAINT patients_status_v2_check;
  END IF;
END $$;

ALTER TABLE health.patients DROP COLUMN IF EXISTS identity_status;
ALTER TABLE health.patients DROP COLUMN IF EXISTS merged_into_patient_id;
ALTER TABLE health.patients DROP COLUMN IF EXISTS estimated_age_years;
ALTER TABLE health.patients DROP COLUMN IF EXISTS approximate_age_months;
ALTER TABLE health.patients DROP COLUMN IF EXISTS identity_confirmed_at;
ALTER TABLE health.patients DROP COLUMN IF EXISTS identity_confirmed_by;

-- Reinstate the original (narrower) status constraint shape.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_status_check' AND conrelid = 'health.patients'::regclass) THEN
    ALTER TABLE health.patients
      ADD CONSTRAINT patients_status_check
      CHECK (status IN ('active','deceased','transferred','archived'));
  END IF;
END $$;

DROP INDEX IF EXISTS health.idx_patients_identity_status;
DROP INDEX IF EXISTS health.idx_patients_merged_into;

COMMIT;
