-- 0029 — a posted payment cannot be unposted by clearing the pointer.
--
-- Found by the payment controls suite (tests/payments/payment-controls-db.test.ts):
-- the 0028 lineage trigger validates a POSTED *claim* (it must name a real
-- journal entry in the same tenant, posted by the payments bridge), but nothing
-- refused the opposite move — an UPDATE that drops accounting_status back to
-- NOT_PREPARED and nulls journal_entry_id. That leaves the journal entry in the
-- ledger while the payment side denies the money ever moved: exactly the silent
-- drift between two subsystems this program exists to remove. Reversal is an
-- accounting act that produces its own entry; it is not a pointer being cleared.
--
-- Hand-written migration (no drizzle snapshot), the same shape as
-- 0021_financial_ledger_rls.sql: no table or column changes, so the schema-drift
-- gate is unaffected and regenerating migrations cannot duplicate this file.

CREATE OR REPLACE FUNCTION "beyu_assert_payment_posting_rewind"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."accounting_status" = 'POSTED'
     AND (NEW."journal_entry_id" IS DISTINCT FROM OLD."journal_entry_id"
          OR NEW."accounting_status" IS DISTINCT FROM OLD."accounting_status") THEN
    -- A genuine reversal is allowed through: still linked, linked to a different
    -- entry, and moving to the state the domain declares as the only successor
    -- of POSTED (src/lib/payments/domain.ts, ACCOUNTING axis: POSTED -> REVERSED).
    IF NEW."accounting_status" = 'REVERSED'
       AND NEW."journal_entry_id" IS NOT NULL
       AND NEW."journal_entry_id" <> OLD."journal_entry_id" THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'payment transaction % is POSTED against journal entry %; unposting by UPDATE is refused. Record a reversing entry through the payments accounting bridge instead.',
      OLD."id", OLD."journal_entry_id"
      USING ERRCODE = '45000';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "payment_transactions_posting_rewind" ON "payment_transactions";
--> statement-breakpoint

CREATE TRIGGER "payment_transactions_posting_rewind" BEFORE UPDATE ON "payment_transactions"
FOR EACH ROW EXECUTE FUNCTION "beyu_assert_payment_posting_rewind"();
--> statement-breakpoint

COMMENT ON FUNCTION "beyu_assert_payment_posting_rewind"() IS
  'Payments bridge integrity: a POSTED payment keeps its journal link. Only the bridge may change accounting_status, and only forward to REVERSED with a new entry.';
--> statement-breakpoint
