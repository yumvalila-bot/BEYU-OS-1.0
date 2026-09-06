-- Migration 026: enforce tenant referential integrity for Health parent references.
--
-- Phase 14 focused audit found the same architectural vulnerability class that
-- prompted 025 (HEALTH-OPH-CROSS-TENANT-CREATE-001) across the wider clinical
-- hierarchy: health.* child rows carry tenant_id AND reference a tenant-scoped
-- parent (patients or a self-parent row), but RLS WITH CHECK only constrains
-- the child's own tenant_id. The FK integrity check runs as the table owner and
-- bypasses parent RLS, so a NON-OWNER role acting in tenant B could insert a
-- child row referencing a tenant-A patient/parent row.
--
-- Demonstrated tables (adversarial spec cross-tenant-parent-integrity.spec.ts):
--   appointments, encounters, observations, invoices.
-- The same trigger is applied to every Health table that carries BOTH
--   `tenant_id` and (`patient_id` OR `parent_id`),
-- so the guard is complete for the demonstrated child hierarchy without
-- hand-maintaining per-table code.
--
-- The trigger is SECURITY DEFINER owned by the table owner with a pinned
-- search_path, so it validates the invariant even when the calling role lacks
-- SELECT on the parent table, and cannot be hijacked by a hostile schema.
CREATE OR REPLACE FUNCTION health.ensure_tenant_parent_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = health, pg_temp
AS $function$
DECLARE
  tbl text := TG_TABLE_NAME;
  patient_ok boolean;
  parent_ok boolean;
BEGIN
  -- patient_id: child must reference a patient in the SAME tenant.
  -- NOTE: PL/pgSQL does not guarantee boolean short-circuit, and access to a
  -- missing record field is a hard error, so every field access is nested
  -- inside an explicit field-existence check.
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

    -- parent_id: child self-parent row must live in the SAME tenant.
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
$function$;

-- Apply to every Health table that carries tenant_id AND (patient_id OR parent_id).
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'health'
      AND c.column_name IN ('tenant_id')
    INTERSECT
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'health'
      AND c.column_name IN ('patient_id','parent_id')
    -- The patient master itself is the parent source, not a child that can
    -- point at another tenant. Do not guard it against itself.
    EXCEPT
    SELECT 'patients'::text
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tenant_parent ON health.%I', rec.table_name, rec.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_tenant_parent
         BEFORE INSERT OR UPDATE ON health.%I
         FOR EACH ROW EXECUTE FUNCTION health.ensure_tenant_parent_match()',
      rec.table_name,
      rec.table_name
    );
  END LOOP;
END $$;
