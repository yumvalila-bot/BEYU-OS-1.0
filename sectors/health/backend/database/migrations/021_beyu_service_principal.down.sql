-- 021 down: remove the Health OS service principal rows. Audit/outbox history
-- rows that reference the actor keep their text references; only the
-- identity rows are removed. Foreign keys from health.audit_log
-- (actor_global_user_id) and health.beyu_outbox (tenant_id is nullable
-- there) are handled by deleting audit rows first — history-destroying, so
-- this down-migration must only be used on disposable environments.
BEGIN;

DELETE FROM health.audit_log
 WHERE actor_global_user_id = '00000000-0000-0000-0000-0000000009ee';

DELETE FROM beyu_identity.tenant_memberships
 WHERE tenant_id = '00000000-0000-0000-0000-0000000009ef';

DELETE FROM beyu_identity.users
 WHERE global_user_id = '00000000-0000-0000-0000-0000000009ee';

DELETE FROM beyu_identity.tenants
 WHERE tenant_id = '00000000-0000-0000-0000-0000000009ef';

COMMIT;
