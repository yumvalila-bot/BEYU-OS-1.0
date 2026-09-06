-- Migration 028 down: restore the (buggy) original function so down cascade is
-- deterministic but 026 must have been applied. CREATE OR REPLACE keeps the
-- existing triggers valid.
CREATE OR REPLACE FUNCTION health.ensure_tenant_parent_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = health, pg_temp
AS $$
DECLARE
  patient_ok boolean;
  parent_ok  boolean;
  tbl        text := TG_TABLE_NAME;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF to_jsonb(NEW) ? 'patient_id' AND NEW.patient_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM health.patients p
         WHERE p.patient_id = NEW.patient_id
           AND p.tenant_id  = NEW.tenant_id
      ) INTO patient_ok;
      IF NOT patient_ok THEN
        RAISE EXCEPTION
          'patient_id does not belong to tenant % on health.%',
          NEW.tenant_id, tbl
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF to_jsonb(NEW) ? 'parent_id' AND NEW.parent_id IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM health.%I p WHERE p.parent_id = $1 AND p.tenant_id = $2)',
        tbl
      ) INTO parent_ok USING NEW.parent_id, NEW.tenant_id;
      IF NOT parent_ok THEN
        RAISE EXCEPTION
          'parent_id does not belong to tenant % on health.%',
          NEW.tenant_id, tbl
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
