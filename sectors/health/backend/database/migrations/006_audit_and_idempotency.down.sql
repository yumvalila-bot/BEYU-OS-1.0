BEGIN;
DROP POLICY IF EXISTS health_audit_isolation       ON health.audit_log;
DROP POLICY IF EXISTS health_idempotency_isolation ON health.idempotency_ledger;
DROP TABLE IF EXISTS health.idempotency_ledger;
DROP TABLE IF EXISTS health.audit_log;
COMMIT;
