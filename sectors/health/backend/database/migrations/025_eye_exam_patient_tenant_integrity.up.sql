-- Migration 025: enforce tenant referential integrity for health.eye_exams.
--
-- Phase 6 adversarial finding (HEALTH-OPH-CROSS-TENANT-CREATE-001):
-- A NON-OWNER role acting in tenant B could INSERT a row into health.eye_exams
-- whose patient_id belongs to tenant A. RLS WITH CHECK constrains only
-- eye_exams.tenant_id, and the patient FK integrity check runs as the table
-- owner (RLS-bypassed), so no statement-level guard blocked the cross-tenant
-- foreign key.
--
-- This migration adds a BEFORE INSERT/UPDATE trigger that rejects any
-- eye_exam whose patient_id does not belong to the same tenant as the row.
-- The trigger is SECURITY DEFINER owned by the table owner with a pinned
-- search_path, so it validates the invariant even when the calling role lacks
-- SELECT on health.patients, and it cannot be hijacked by a hostile schema.
CREATE OR REPLACE FUNCTION health.ensure_eye_exam_patient_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = health, pg_temp
AS $function$
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM health.patients p
     WHERE p.patient_id = NEW.patient_id
       AND p.tenant_id  = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION
      'eye_exam patient_id does not belong to tenant %',
      NEW.tenant_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_eye_exams_patient_tenant ON health.eye_exams;
CREATE TRIGGER trg_eye_exams_patient_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, patient_id ON health.eye_exams
  FOR EACH ROW EXECUTE FUNCTION health.ensure_eye_exam_patient_tenant();
