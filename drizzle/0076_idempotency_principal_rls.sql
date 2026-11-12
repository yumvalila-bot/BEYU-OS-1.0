-- 0076 — Principal-bound idempotency ledger isolation.
--
-- The ledger is a control-plane replay boundary, not a globally readable
-- governance table. It is always scoped to exactly one tenant AND one actor;
-- global governance scope must never bypass this policy.
--
-- Migration safety: legacy rows with NULL principal dimensions cannot be
-- assigned safely from the scope string without making assumptions about ID
-- formats. Abort before changing data and require an explicit reviewed
-- reconciliation/backfill. No rows are silently deleted or attributed.

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.idempotency_records
    WHERE tenant_id IS NULL OR actor_user_id IS NULL
  ) THEN
    RAISE EXCEPTION
      '0076 blocked: idempotency_records contains rows without tenant_id or actor_user_id; reconcile legacy rows explicitly before retrying';
  END IF;
END
$migration$;
--> statement-breakpoint

-- A validated CHECK enforces the principal dimensions without using
-- SET NOT NULL (a contraction gate). It is additive and can be validated
-- independently after the explicit legacy-row preflight above.
ALTER TABLE public.idempotency_records
  ADD CONSTRAINT idempotency_records_principal_required
  CHECK (tenant_id IS NOT NULL AND actor_user_id IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.idempotency_records
  VALIDATE CONSTRAINT idempotency_records_principal_required;
--> statement-breakpoint

ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.idempotency_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS idempotency_records_principal_isolation
  ON public.idempotency_records;
--> statement-breakpoint

CREATE POLICY idempotency_records_principal_isolation
  ON public.idempotency_records
  FOR ALL
  USING (
    tenant_id = ANY (beyu_tenant_ids())
    AND actor_user_id = NULLIF(current_setting('beyu.actor_user_id', true), '')
    AND COALESCE(current_setting('beyu.global_scope', true), 'off') <> 'on'
  )
  WITH CHECK (
    tenant_id = ANY (beyu_tenant_ids())
    AND actor_user_id = NULLIF(current_setting('beyu.actor_user_id', true), '')
    AND COALESCE(current_setting('beyu.global_scope', true), 'off') <> 'on'
  );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idempotency_records_principal_idx
  ON public.idempotency_records (tenant_id, actor_user_id, expires_at);

--> statement-breakpoint

-- Runtime DML grants are reconciled by scripts/setup-db-role.ts from the
-- reviewed runtime privilege allowlist after migrations. The RLS policy below
-- is independent of role provisioning and never grants global-scope bypass.
