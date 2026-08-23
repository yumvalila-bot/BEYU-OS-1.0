-- BEYU OS — Phase 5N: JOURNAL SCOPE INTEGRITY
--
-- Scope note. Accounting authority remains UNRATIFIED (see
-- docs/finance/PHASE_5_AUTHORITY_GATE.md). This migration therefore encodes NO
-- accounting policy: no chart of accounts, no recognition rule, no debit/credit
-- treatment, no period policy, no FX, no tax, no maker/checker.
--
-- It closes two DEFECTS found by hostile red-teaming at HEAD 8ef7e8a, where raw
-- SQL was able to commit a journal entry whose scope was internally
-- inconsistent:
--
--   [I] entry.tenant_id could differ from the tenant of the accounts its lines
--       referenced — a cross-tenant journal;
--   [J] entry.legal_entity_id could differ from the legal entity of the
--       financial period it was posted into — a cross-entity journal.
--
-- Both were BLOCKED at no layer: migration 0005 governs balance, sign and
-- immutability, and the foreign keys only prove each id exists in isolation.
-- Nothing tied the scopes together.
--
-- AUTHORITY FOR THIS CHANGE IS ALREADY RATIFIED, and is not an accounting
-- decision:
--   Constitution Art. 9 (Tenant Isolation) — "Every request resolves identity,
--   tenant, entity, role, permission and data scope. Cross-tenant access
--   requires explicit, recorded authorisation."
--   Constitution Art. 5 (Financial Authority and Integrity) — financial history
--   is immutable, so a mis-scoped entry could never be corrected by edit.
--
-- DELIBERATELY NOT FIXED HERE: journal_entries.period_id is NULLABLE, so an
-- entry may still be posted with no period at all. Whether a period is
-- mandatory is policy decision P7 and belongs to the Group CFO. Making it
-- NOT NULL now would pre-empt a pending ratification. It remains recorded as a
-- known gap.
--
-- Enforcement is DEFERRABLE INITIALLY DEFERRED, matching 0005: scope can only
-- be judged once the entry and its lines exist, and deferral makes the check
-- hold against multi-statement raw SQL right up to COMMIT.

-- ---------------------------------------------------------------------------
-- 1. An entry's tenant must match the tenant of every account it touches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beyu_assert_journal_line_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_entry_tenant text;
  v_account_tenant text;
BEGIN
  SELECT tenant_id INTO v_entry_tenant FROM journal_entries WHERE id = NEW.entry_id;
  SELECT tenant_id INTO v_account_tenant FROM ledger_accounts WHERE id = NEW.account_id;

  -- A missing parent is already handled by the foreign keys; stay silent here
  -- so this trigger reports only genuine scope violations.
  IF v_entry_tenant IS NULL OR v_account_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_entry_tenant <> v_account_tenant THEN
    RAISE EXCEPTION
      'journal line % crosses a tenant boundary: entry % belongs to tenant %, account % belongs to tenant %',
      NEW.id, NEW.entry_id, v_entry_tenant, NEW.account_id, v_account_tenant
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS beyu_journal_line_scope ON journal_lines;
CREATE CONSTRAINT TRIGGER beyu_journal_line_scope
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION beyu_assert_journal_line_scope();

-- ---------------------------------------------------------------------------
-- 2. An entry's legal entity must match the legal entity of its period.
--    (Financial periods are already entity-scoped and non-overlapping via 0005.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beyu_assert_journal_entry_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_period_entity text;
BEGIN
  -- period_id is nullable by design; policy decision P7 is unratified.
  IF NEW.period_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT legal_entity_id INTO v_period_entity FROM financial_periods WHERE id = NEW.period_id;
  IF v_period_entity IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_period_entity <> NEW.legal_entity_id THEN
    RAISE EXCEPTION
      'journal entry % crosses a legal-entity boundary: entry belongs to entity %, period % belongs to entity %',
      NEW.id, NEW.legal_entity_id, NEW.period_id, v_period_entity
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS beyu_journal_entry_scope ON journal_entries;
CREATE CONSTRAINT TRIGGER beyu_journal_entry_scope
  AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION beyu_assert_journal_entry_scope();

COMMENT ON FUNCTION beyu_assert_journal_line_scope() IS
  'Constitution Art. 9: a journal line may not reference an account belonging to another tenant.';
COMMENT ON FUNCTION beyu_assert_journal_entry_scope() IS
  'Constitution Art. 9: a journal entry may not be posted into a period belonging to another legal entity.';
