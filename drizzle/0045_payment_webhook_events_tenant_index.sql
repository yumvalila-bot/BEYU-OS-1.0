-- 0045 — Create the payment webhook tenant index that was declared but never built.
--
-- WHY
-- ───
-- `src/db/schema/payments.ts` declares three indexes on `payment_webhook_events`:
--
--     uniqueIndex("payment_webhook_events_inbox_uidx")
--     index("payment_webhook_events_state_idx")
--     index("payment_webhook_events_tenant_idx")     <-- this one
--
-- Migration 0028 created only the first two. The third has therefore never
-- existed in any database: it is absent from every deployment, while the
-- application schema has asserted it since 0028. `drizzle/meta/0028_snapshot.json`
-- does list it, so the SQL and its own snapshot have disagreed from the day it
-- was committed.
--
-- P2's truth-based drift gate (scripts/migration/schema-drift.ts) compares the
-- schema the migrations actually produce against the schema src/db/schema
-- declares, and reports this as the single blocking divergence. The correct
-- response is to make reality match the declaration, not to weaken the gate or
-- delete the declaration: tenant-scoped webhook lookup is exactly the access
-- pattern RLS enforces, and it should not be a sequential scan.
--
-- SAFETY — this is a pure EXPAND
-- ───────────────────────────────
--   • additive only: one CREATE INDEX, no DROP, no ALTER, no TRUNCATE;
--   • idempotent: IF NOT EXISTS, so a re-run is a no-op;
--   • backward compatible: a currently deployed release reads and writes
--     payment_webhook_events exactly as before. Adding an index never changes
--     query RESULTS, only their cost, so the current release and the next
--     release are both compatible with the post-migration schema.
--   • no data transformation, no constraint tightening, no column change.
--
-- OPERATOR NOTE — lock window
-- ───────────────────────────
-- This uses a plain CREATE INDEX rather than CREATE INDEX CONCURRENTLY because
-- `scripts/migrate.ts` applies each migration inside a transaction, and
-- CONCURRENTLY cannot run inside one. A plain CREATE INDEX takes a SHARE lock
-- that blocks WRITES to payment_webhook_events (reads continue) until it
-- completes. The table is webhook ingestion state, not a ledger, so the window
-- is short and bounded; if it ever grows large enough to matter, build the index
-- concurrently in a separate out-of-band maintenance step BEFORE this migration
-- runs and this statement becomes a no-op.
--
-- CAP_POSTING remains LOCKED. No accounting policy is invented or ratified.
-- No RLS policy, role or grant is created, altered or removed.

CREATE INDEX IF NOT EXISTS "payment_webhook_events_tenant_idx" ON "payment_webhook_events" USING btree ("tenant_id");--> statement-breakpoint

-- Fail closed: if the index is not present after this statement, the migration
-- did not do what it claims and must not be recorded as applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'payment_webhook_events'
      AND indexname  = 'payment_webhook_events_tenant_idx'
  ) THEN
    RAISE EXCEPTION 'Migration 0045 verification failed: payment_webhook_events_tenant_idx was not created';
  END IF;
  RAISE NOTICE 'Migration 0045 verification passed: payment_webhook_events_tenant_idx present.';
END
$$;
