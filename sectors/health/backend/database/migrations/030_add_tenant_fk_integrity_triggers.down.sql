-- Migration 030 down: drop the tenant FK integrity triggers added/refreshed by
-- 030. This returns the trigger set to the 026 patient/parent-only coverage
-- (after 029 down), so down/up cascades are deterministic.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT cls.relname AS tbl
    FROM pg_constraint con
    JOIN pg_class      cls  ON cls.oid  = con.conrelid
    JOIN pg_class      fc   ON fc.oid   = con.confrelid
    JOIN pg_namespace  ns   ON ns.oid   = cls.relnamespace
    JOIN pg_namespace  fns  ON fns.oid  = fc.relnamespace
    WHERE con.contype = 'f'
      AND ns.nspname  = 'health'
      AND fns.nspname = 'health'
      AND EXISTS (
        SELECT 1 FROM pg_attribute pa
         WHERE pa.attrelid = fc.oid
           AND pa.attname  = 'tenant_id'
           AND pa.attnum   > 0
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tenant_parent ON health.%I', rec.tbl, rec.tbl);
  END LOOP;
END $$;
