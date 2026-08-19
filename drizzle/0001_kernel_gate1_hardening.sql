-- BEYU OS Kernel Gate 1 hardening migration
-- Purpose: critical remediation for C-01, C-02, C-04, C-06 and supporting H-10/H-12.

-- schema additions for existing v0.1 candidate databases
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_must_change boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes_hash jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_accepted_step integer;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_failed_attempts integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_locked_until timestamptz;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_satisfied_at timestamptz;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_expires_at timestamptz;--> statement-breakpoint
ALTER TABLE emergency_access_grants ADD COLUMN IF NOT EXISTS revoked_at timestamptz;--> statement-breakpoint
ALTER TABLE emergency_access_grants ADD COLUMN IF NOT EXISTS revoked_by text;--> statement-breakpoint
ALTER TABLE emergency_access_grants ADD COLUMN IF NOT EXISTS revoke_reason text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_chain_heads (
  chain_name text PRIMARY KEY,
  current_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
INSERT INTO audit_chain_heads(chain_name, current_hash)
VALUES ('AUDIT_LOG', null), ('ENTERPRISE_EVENTS', null)
ON CONFLICT (chain_name) DO NOTHING;--> statement-breakpoint

-- Candidate remediation note: previous v0.1 ledgers can contain forks from the audited defect.
-- Production deployments must run this migration before accepting writes. Existing corrupted candidate
-- ledgers are cleared in this sandbox baseline only; production must export and archive them first.
TRUNCATE TABLE audit_log;--> statement-breakpoint
TRUNCATE TABLE enterprise_events;--> statement-breakpoint
UPDATE audit_chain_heads SET current_hash = null, updated_at = now() WHERE chain_name in ('AUDIT_LOG','ENTERPRISE_EVENTS');--> statement-breakpoint

-- storage-level fork rejection: each non-genesis parent may be consumed exactly once
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_prev_hash_uidx ON audit_log(prev_hash) WHERE prev_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS enterprise_events_prev_hash_uidx ON enterprise_events(prev_hash) WHERE prev_hash IS NOT NULL;--> statement-breakpoint

-- append-only / immutable posted evidence
CREATE OR REPLACE FUNCTION beyu_prevent_audit_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BEYU OS audit/event ledgers are append-only';
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_immutable_update ON audit_log;--> statement-breakpoint
CREATE TRIGGER audit_log_immutable_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION beyu_prevent_audit_update_delete();--> statement-breakpoint
DROP TRIGGER IF EXISTS enterprise_events_immutable_update ON enterprise_events;--> statement-breakpoint
CREATE TRIGGER enterprise_events_immutable_update BEFORE UPDATE OR DELETE ON enterprise_events FOR EACH ROW EXECUTE FUNCTION beyu_prevent_audit_update_delete();--> statement-breakpoint

-- tenant context helpers for RLS
CREATE OR REPLACE FUNCTION beyu_tenant_ids() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('beyu.current_tenant_ids', true), ''), ','), array[]::text[])
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_global_scope() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('beyu.global_scope', true), 'off') = 'on'
$$;--> statement-breakpoint

-- Row-level security: tenant tables. FORCE means owners also obey RLS; superusers still bypass and
-- therefore must not be used as application principals in production.
ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE legal_entities FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS legal_entities_tenant_isolation ON legal_entities;--> statement-breakpoint
CREATE POLICY legal_entities_tenant_isolation ON legal_entities USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE ownership_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ownership_records FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS ownership_records_tenant_isolation ON ownership_records;--> statement-breakpoint
CREATE POLICY ownership_records_tenant_isolation ON ownership_records USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE employees FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS employees_tenant_isolation ON employees;--> statement-breakpoint
CREATE POLICY employees_tenant_isolation ON employees USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE capital_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE capital_requests FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS capital_requests_tenant_isolation ON capital_requests;--> statement-breakpoint
CREATE POLICY capital_requests_tenant_isolation ON capital_requests USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE treasury_positions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE treasury_positions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS treasury_positions_tenant_isolation ON treasury_positions;--> statement-breakpoint
CREATE POLICY treasury_positions_tenant_isolation ON treasury_positions USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE waterfall_configs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE waterfall_configs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS waterfall_configs_tenant_isolation ON waterfall_configs;--> statement-breakpoint
CREATE POLICY waterfall_configs_tenant_isolation ON waterfall_configs USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE risks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS risks_tenant_isolation ON risks;--> statement-breakpoint
CREATE POLICY risks_tenant_isolation ON risks USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE compliance_obligations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE compliance_obligations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS compliance_obligations_tenant_isolation ON compliance_obligations;--> statement-breakpoint
CREATE POLICY compliance_obligations_tenant_isolation ON compliance_obligations USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS documents_tenant_isolation ON documents;--> statement-breakpoint
CREATE POLICY documents_tenant_isolation ON documents USING (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS audit_log_tenant_isolation ON audit_log;--> statement-breakpoint
CREATE POLICY audit_log_tenant_isolation ON audit_log USING (tenant_id = ANY(beyu_tenant_ids()) OR (beyu_global_scope() AND tenant_id IS NULL) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint
ALTER TABLE enterprise_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE enterprise_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS enterprise_events_tenant_isolation ON enterprise_events;--> statement-breakpoint
CREATE POLICY enterprise_events_tenant_isolation ON enterprise_events USING (tenant_id = ANY(beyu_tenant_ids()) OR (beyu_global_scope() AND tenant_id IS NULL) OR beyu_global_scope()) WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

-- Financial invariant scaffold: line-level non-negative amounts and idempotency uniqueness.
ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_line_non_negative;--> statement-breakpoint
ALTER TABLE journal_lines ADD CONSTRAINT journal_line_non_negative CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_idempotency_uidx ON journal_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;--> statement-breakpoint

-- Ownership sanity by type: direct/indirect/economic percentages are constrained per row; aggregate
-- beneficial look-through is intentionally separate and must not be summed with direct holdings.
ALTER TABLE ownership_records DROP CONSTRAINT IF EXISTS ownership_pct_bounds;--> statement-breakpoint
ALTER TABLE ownership_records ADD CONSTRAINT ownership_pct_bounds CHECK (economic_pct >= 0 AND economic_pct <= 100 AND voting_pct >= 0 AND voting_pct <= 100);--> statement-breakpoint
