-- Migration 026 down: remove the tenant parent-referential-integrity guard.
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
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tenant_parent ON health.%I', rec.table_name, rec.table_name);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS health.ensure_tenant_parent_match();
