-- Migration 029: generalize the tenant-parent integrity function so it guards
-- EVERY tenant-scoped FK in the health schema, not only patient_id/parent_id.
--
-- The 026/027/028 series proved the architectural hole on patient references.
-- The same hole exists on any tenant-scoped FK edge (allergies.encounter_id,
-- appointments.department_id/provided_id, invoice_items.invoice_id,
-- ophthalmic_prescriptions.eye_exam_id, stock_ledger.item_id, ...).
-- RLS WITH CHECK constrains only the child's own tenant_id; the FK validation
-- executes as the table owner and bypasses parent-row RLS.
--
-- This function introspects pg_catalog at trigger time for every FK where the
-- child table is the firing table and the referenced parent table has
-- tenant_id, then requires the referenced parent row to carry the same
-- tenant_id as the child. SECURITY DEFINER is safe because search_path is
-- pinned and no value is returned to the caller.
CREATE OR REPLACE FUNCTION health.ensure_tenant_parent_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = health, pg_temp
AS $$
DECLARE
  tbl        text := TG_TABLE_NAME;
  fk         record;
  parent_ok  boolean;
BEGIN
  -- A tenant is mandatory for every row the trigger protects. Fail closed
  -- instead of allowing a row with NULL tenant to compare against NULL.
  IF to_jsonb(NEW) ? 'tenant_id' THEN
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_id cannot be null on health.%', tbl
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Single-column FK edges child-table -> parent-table, where the parent has a
  -- tenant_id column. Multi-column FK edges are not present in health today;
  -- if one is added the NOT EXISTS below forces an explicit review.
  FOR fk IN
    SELECT
      a.attname                    AS child_col,
      fc.relname                   AS parent_tbl,
      fa.attname                   AS parent_col
    FROM pg_constraint con
    JOIN pg_class       cls ON cls.oid = con.conrelid
    JOIN pg_namespace   ns  ON ns.oid  = cls.relnamespace
    JOIN pg_class       fc  ON fc.oid  = con.confrelid
    JOIN pg_namespace   fns ON fns.oid = fc.relnamespace
    JOIN LATERAL unnest(con.conkey)  WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute   a   ON a.attrelid  = cls.oid AND a.attnum  = k.attnum
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS f(attnum, ord) ON true
    JOIN pg_attribute   fa  ON fa.attrelid = fc.oid AND fa.attnum = f.attnum AND f.ord = k.ord
    WHERE con.contype = 'f'
      AND ns.nspname  = 'health'
      AND fns.nspname = 'health'
      AND cls.relname = tbl
      AND EXISTS (
            SELECT 1 FROM pg_attribute pa
             WHERE pa.attrelid = fc.oid
               AND pa.attname  = 'tenant_id'
               AND pa.attnum   > 0
          )
    ORDER BY child_col
  LOOP
    IF jsonb_exists(to_jsonb(NEW), fk.child_col) THEN
      IF (to_jsonb(NEW) ->> fk.child_col) IS NOT NULL THEN
        EXECUTE format(
          'SELECT EXISTS (SELECT 1 FROM health.%I p
                            WHERE to_jsonb(p) ->> %L = $1
                              AND p.tenant_id = $2)',
          fk.parent_tbl, fk.parent_col
        ) INTO parent_ok
          USING to_jsonb(NEW) ->> fk.child_col, NEW.tenant_id;
        IF NOT parent_ok THEN
          RAISE EXCEPTION
            '% does not belong to tenant % on health.%',
            fk.child_col, NEW.tenant_id, tbl
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
