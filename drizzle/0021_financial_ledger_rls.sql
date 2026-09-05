-- 0021 — Financial ledger Row Level Security (defense in depth).
--
-- The financial truth tables (journal_entries, journal_lines, ledger_accounts,
-- financial_periods) carried the canonical append-only/balance/scope TRIGGERS
-- but no RLS, so tenant isolation for the ledger was enforced only by the
-- application layer. This migration adds database-enforced tenant + entity
-- isolation using the EXISTING canonical context machinery (the GUCs
-- beyu.current_tenant_ids / beyu.global_scope and the helpers
-- beyu_tenant_ids() / beyu_global_scope() from 0001). No second
-- authorization model is introduced.
--
-- Principles:
--   * ONE policy per table per command. Multiple policies would OR together,
--     so tenant AND entity conditions live in a single policy each.
--   * journal_lines is scoped through BOTH parents (entry and account) and
--     additionally requires entry tenant == account tenant, so a line can
--     never be attached across a tenant boundary through either reference.
--   * financial_periods has no tenant_id column; it is scoped through the
--     canonical legal entity (which is tenant-bound and RLS-protected).
--   * FORCE ROW LEVEL SECURITY binds table owners too (matching the 0001
--     hardening pattern); the runtime role remains a non-owner,
--     NOSUPERUSER/NOBYPASSRLS grantee and is always bound.
--   * Superusers still bypass RLS (PostgreSQL semantics): migrations, the
--     governed bootstrap seed and the DR drill run as the admin/migration
--     role by design. That is the documented service/admin path.
--   * CAP_POSTING remains LOCKED: this migration does not grant, activate or
--     unlock any posting authority. It only adds isolation to the ledger
--     that already exists.

-- 1. ledger_accounts — canonical tenant policy (same shape as 0001 tables).
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ledger_accounts_tenant_isolation" ON "ledger_accounts";--> statement-breakpoint
CREATE POLICY "ledger_accounts_tenant_isolation" ON "ledger_accounts"
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

-- 2. financial_periods — scoped through the canonical legal entity.
ALTER TABLE "financial_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financial_periods" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "financial_periods_entity_isolation" ON "financial_periods";--> statement-breakpoint
CREATE POLICY "financial_periods_entity_isolation" ON "financial_periods"
  USING (
    EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "financial_periods"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "financial_periods"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

-- 3. journal_entries — tenant AND entity must both be inside canonical scope.
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "journal_entries_tenant_entity_isolation" ON "journal_entries";--> statement-breakpoint
CREATE POLICY "journal_entries_tenant_entity_isolation" ON "journal_entries"
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "journal_entries"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "journal_entries"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

-- 4. journal_lines — both parents inside scope AND on the same tenant.
ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "journal_lines_entry_account_isolation" ON "journal_lines";--> statement-breakpoint
CREATE POLICY "journal_lines_entry_account_isolation" ON "journal_lines"
  USING (
    EXISTS (
      SELECT 1 FROM "journal_entries" je
      WHERE je."id" = "journal_lines"."entry_id"
        AND (je."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
    AND EXISTS (
      SELECT 1 FROM "ledger_accounts" la
      WHERE la."id" = "journal_lines"."account_id"
        AND (la."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
    AND (
      SELECT je."tenant_id" FROM "journal_entries" je WHERE je."id" = "journal_lines"."entry_id"
    ) = (
      SELECT la."tenant_id" FROM "ledger_accounts" la WHERE la."id" = "journal_lines"."account_id"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "journal_entries" je
      WHERE je."id" = "journal_lines"."entry_id"
        AND (je."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
    AND EXISTS (
      SELECT 1 FROM "ledger_accounts" la
      WHERE la."id" = "journal_lines"."account_id"
        AND (la."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
    AND (
      SELECT je."tenant_id" FROM "journal_entries" je WHERE je."id" = "journal_lines"."entry_id"
    ) = (
      SELECT la."tenant_id" FROM "ledger_accounts" la WHERE la."id" = "journal_lines"."account_id"
    )
  );--> statement-breakpoint

-- 5. Harden the deferred entry-scope trigger to fail closed now that
--    financial_periods is RLS-protected. Previously, a period_id that the
--    caller could not see made the trigger return silently (NULL); with RLS in
--    place that silent skip would let a cross-entity entry commit whenever the
--    period was merely invisible to the writer. The period-mandatory question
--    itself remains policy decision P7 (period_id stays NULLABLE), unchanged.
CREATE OR REPLACE FUNCTION "beyu_assert_journal_entry_scope"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_period_entity text;
BEGIN
  -- period_id is nullable by design; policy decision P7 is unratified.
  IF NEW.period_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT legal_entity_id INTO v_period_entity FROM financial_periods WHERE id = NEW.period_id;

  -- Fail closed: a referenced period that is outside the caller's scope (or
  -- missing) must block the entry rather than silently skip validation.
  IF v_period_entity IS NULL THEN
    RAISE EXCEPTION
      'journal entry % references period % which is outside the caller scope or does not exist',
      NEW.id, NEW.period_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF v_period_entity <> NEW.legal_entity_id THEN
    RAISE EXCEPTION
      'journal entry % crosses a legal-entity boundary: entry belongs to entity %, period % belongs to entity %',
      NEW.id, NEW.legal_entity_id, NEW.period_id, v_period_entity
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$function$;
