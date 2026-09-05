-- Migration 028: replace the tenant-parent integrity trigger function with the
-- PL/pgSQL-safe variant (no "record has no field parent_id" on tables that lack
-- parent_id). Idempotent. CREATE OR REPLACE keeps existing triggers on 026's
-- dependent tables valid (no DROP, no "other objects depend on it" error).
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
    IF jsonb_exists(to_jsonb(NEW), 'patient_id') THEN
      IF NEW.patient_id IS NOT NULL THEN
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
    END IF;

    IF jsonb_exists(to_jsonb(NEW), 'parent_id') THEN
      IF NEW.parent_id IS NOT NULL THEN
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
  END IF;

  RETURN NEW;
END;
$$;

-- No explicit role grant: functions default to PUBLIC EXECUTE, and PGlite test
-- environments do not create the application runtime role. Privilege on this
-- function must never create a new path around RLS (SECURITY DEFINER is used
-- only to read the patient master inside the transaction's tenant context).
