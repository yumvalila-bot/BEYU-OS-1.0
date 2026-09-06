-- Migration 030: attach the tenant FK integrity trigger to EVERY health child
-- table that has at least one FK into a tenant-scoped parent.
--
-- 026 only attached to tables that directly carried patient_id or parent_id.
-- The generic function introduced in 029 protects all tenant-scoped FK edges,
-- but the trigger was still missing on non-patient child tables such as
-- invoice_items (invoice_id), payment_allocations (invoice_id), audit_log
-- (facility_id), mfa_challenges (factor_id), and stock_ledger (item_id).
-- This migration is idempotent under the migration runner and on fresh installs.
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
    ORDER BY 1
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tenant_parent ON health.%I', rec.tbl, rec.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_tenant_parent
         BEFORE INSERT OR UPDATE ON health.%I
         FOR EACH ROW EXECUTE FUNCTION health.ensure_tenant_parent_match()',
      rec.tbl, rec.tbl
    );
  END LOOP;
END $$;
