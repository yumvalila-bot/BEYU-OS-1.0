-- BEYU OS — Phase 5A (partial): LEDGER INTEGRITY INVARIANTS
--
-- Scope note. Phase 5A asked for the full accounting substrate (chart of
-- accounts, financial periods, posting service). That work is BLOCKED: five of
-- the eleven §2 accounting-policy questions have no authoritative answer in the
-- repository (see docs/governance/ACCOUNTING_SUBSTRATE_DECISIONS.md).
--
-- This migration implements ONLY the part that requires NO accounting policy:
-- the structural integrity of the double-entry journal. These are universal
-- properties of double-entry bookkeeping and of the repository's OWN stated
-- rule ("Immutable double-entry journal. Corrections are reversals, never
-- edits." — src/db/schema/finance.ts), not accounting policy choices.
--
-- Two defects were demonstrated against the live database before this
-- migration:
--   1. an unbalanced journal (debit 100.00 vs credit 7.00) was accepted;
--   2. a posted journal entry was UPDATEd, despite the declared immutability.
--
-- No chart of accounts is created. No period is created. No posting service is
-- introduced. Nothing is posted. This migration only makes the ledger
-- structurally incapable of holding corrupt data once posting does arrive.

-- ---------------------------------------------------------------------------
-- 1. DOUBLE ENTRY: sum(debit) = sum(credit) for every journal entry.
-- ---------------------------------------------------------------------------
-- Enforced by a CONSTRAINT TRIGGER deferred to COMMIT. A row-level CHECK cannot
-- express this: balance is a property of the whole entry, and lines are
-- inserted one row at a time, so any non-deferred check would reject the first
-- line of a legitimately balanced pair. Deferring to COMMIT lets a transaction
-- build a complete entry and validates the finished state — which also means
-- the invariant holds for direct SQL, not only for application code.

CREATE OR REPLACE FUNCTION beyu_assert_journal_balanced() RETURNS trigger AS $$
DECLARE
  target_entry text;
  total_debit numeric(18,2);
  total_credit numeric(18,2);
  line_count integer;
BEGIN
  target_entry := COALESCE(NEW.entry_id, OLD.entry_id);

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
    INTO total_debit, total_credit, line_count
    FROM journal_lines
   WHERE entry_id = target_entry;

  -- An entry with no lines at all is permitted only transiently; if the entry
  -- itself is gone (a fully rolled-back or deleted draft) there is nothing to
  -- validate.
  IF line_count = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = target_entry) THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'journal entry % has no lines; a double-entry journal requires at least two', target_entry
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every journal must have at least two sides.
  IF line_count < 2 THEN
    RAISE EXCEPTION 'journal entry % has % line(s); a double-entry journal requires at least two', target_entry, line_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'journal entry % is unbalanced: debit % <> credit %', target_entry, total_debit, total_credit
      USING ERRCODE = 'check_violation';
  END IF;

  -- A journal of zeros is not a transaction.
  IF total_debit = 0 THEN
    RAISE EXCEPTION 'journal entry % has zero value', target_entry
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS beyu_journal_balanced ON journal_lines;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER beyu_journal_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION beyu_assert_journal_balanced();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. LINE VALIDITY: exactly one side, strictly positive.
-- ---------------------------------------------------------------------------
-- The existing journal_line_non_negative check (migration 0001) forbids
-- negatives and forbids both sides being positive simultaneously, but still
-- permits a line with debit = 0 AND credit = 0. A zero line carries no
-- accounting meaning and silently pads an entry, so it is now rejected.

ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_line_single_sided;--> statement-breakpoint
ALTER TABLE journal_lines ADD CONSTRAINT journal_line_single_sided
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. IMMUTABILITY: a posted journal cannot be edited or deleted.
-- ---------------------------------------------------------------------------
-- "Immutable double-entry journal. Corrections are reversals, never edits."
-- That was a comment, not a guarantee: a posted entry could be UPDATEd. The
-- ledger is intended to become the canonical financial truth, so immutability
-- must be enforced by the database rather than by convention.
--
-- journal_entries.reversal_of_id already exists, so the correction path the
-- schema intends (a reversing entry) remains fully available.

CREATE OR REPLACE FUNCTION beyu_reject_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'journal entry % is immutable; correct it with a reversing entry, never an edit', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RAISE EXCEPTION 'journal entry % is immutable and cannot be deleted; post a reversing entry', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS beyu_journal_entry_immutable ON journal_entries;--> statement-breakpoint

CREATE TRIGGER beyu_journal_entry_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION beyu_reject_journal_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION beyu_reject_journal_line_mutation() RETURNS trigger AS $$
BEGIN
  -- Lines belonging to an entry that still exists are immutable. A line may
  -- only disappear together with a never-committed entry, which the entry-level
  -- trigger already prevents once the entry is durable.
  IF EXISTS (SELECT 1 FROM journal_entries WHERE id = OLD.entry_id) THEN
    RAISE EXCEPTION 'journal line % is immutable; correct entry % with a reversing entry', OLD.id, OLD.entry_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS beyu_journal_line_immutable ON journal_lines;--> statement-breakpoint

CREATE TRIGGER beyu_journal_line_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION beyu_reject_journal_line_mutation();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. PERIOD INTEGRITY: no overlapping periods for one entity.
-- ---------------------------------------------------------------------------
-- financial_periods already has a unique (legal_entity_id, code) index, which
-- does not prevent two differently-named periods covering the same dates. A
-- posting could then fall into two periods at once, making "the period is
-- closed" ambiguous. Overlap prevention is a structural property, independent
-- of any decision about period length, calendar or closing authority.

ALTER TABLE financial_periods DROP CONSTRAINT IF EXISTS financial_period_dates_ordered;--> statement-breakpoint
ALTER TABLE financial_periods ADD CONSTRAINT financial_period_dates_ordered
  CHECK (ends_on >= starts_on);--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE financial_periods DROP CONSTRAINT IF EXISTS financial_period_no_overlap;--> statement-breakpoint
ALTER TABLE financial_periods ADD CONSTRAINT financial_period_no_overlap
  EXCLUDE USING gist (
    legal_entity_id WITH =,
    daterange(starts_on, ends_on, '[]') WITH &&
  );
