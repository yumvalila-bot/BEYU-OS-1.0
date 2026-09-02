-- 020_audit_chain_tip_index.up.sql
--
-- Support the audit chain-tip lookup.
--
-- AuditService derives prev_hash as "the entry_hash of this tenant's rows that
-- no other row of the same tenant references as its prev_hash":
--
--     SELECT a.entry_hash FROM health.audit_log a
--      WHERE a.tenant_id = $1 AND a.entry_hash IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM health.audit_log b
--                         WHERE b.tenant_id = a.tenant_id
--                           AND b.prev_hash = a.entry_hash)
--
-- Ordering cannot be used instead: audit_id is gen_random_uuid() and therefore
-- carries no chronological information, and created_at is the transaction start
-- timestamp, which concurrent writers can share. Set membership is exact, but
-- the anti-join needs prev_hash to be indexed or it degrades to a scan of the
-- tenant's whole audit history on every append.
--
-- The existing idx_audit_log_hash (tenant_id, audit_id, entry_hash) covers the
-- outer side but not the inner predicate, so a dedicated index is added. This
-- is an index only: no table, column, constraint, policy or trigger changes,
-- and the migration is safe to re-run.

CREATE INDEX IF NOT EXISTS idx_audit_log_prev_hash
  ON health.audit_log (tenant_id, prev_hash);
