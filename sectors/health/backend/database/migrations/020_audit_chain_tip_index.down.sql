-- 020_audit_chain_tip_index.down.sql — drop the chain-tip support index.
-- Index only; no data or structural change.
DROP INDEX IF EXISTS health.idx_audit_log_prev_hash;
