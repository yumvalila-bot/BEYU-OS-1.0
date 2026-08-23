-- Phase 5Q — hostile audit remediation (policy-independent defects only).
--
-- DEFECT 1 (Constitution Art. 8, verbatim: "All material actions are recorded in an
-- append-only, hash-chained audit ledger. No component may alter or delete audit history.")
-- The existing append-only controls installed in 0001 are FOR EACH ROW triggers on
-- UPDATE OR DELETE. Row-level triggers do not fire for TRUNCATE, so TRUNCATE silently
-- erased the entire audit and event ledger. This closes the bypass with statement-level
-- TRUNCATE triggers, reusing the existing guard function's error contract.
--
-- DEFECT 2 (internal consistency). financial_periods already enforces start<=end via
-- financial_period_dates_ordered, but policies accepted effective_to < effective_from,
-- producing a permanently-unusable "active" policy window. Verified 0 existing rows
-- violate this constraint, so it is additive and non-destructive.
--
-- Deliberately NOT included: any requirement that a policy be linked to an APPROVED
-- resolution, and any policy status-transition state machine. Both remain
-- [GOVERNANCE DECISION REQUIRED] — see docs/governance/POLICY_LIFECYCLE_FINDINGS.md.

CREATE OR REPLACE FUNCTION beyu_prevent_audit_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BEYU OS audit/event ledgers are append-only: TRUNCATE is not allowed on %', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_immutable_truncate ON audit_log;--> statement-breakpoint
CREATE TRIGGER audit_log_immutable_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION beyu_prevent_audit_truncate();--> statement-breakpoint
DROP TRIGGER IF EXISTS enterprise_events_immutable_truncate ON enterprise_events;--> statement-breakpoint
CREATE TRIGGER enterprise_events_immutable_truncate BEFORE TRUNCATE ON enterprise_events FOR EACH STATEMENT EXECUTE FUNCTION beyu_prevent_audit_truncate();--> statement-breakpoint

ALTER TABLE policies DROP CONSTRAINT IF EXISTS policy_effective_window_ordered;--> statement-breakpoint
ALTER TABLE policies ADD CONSTRAINT policy_effective_window_ordered CHECK (effective_to IS NULL OR effective_to >= effective_from);
