-- 0022 — Chart of Accounts tenant-scoped code uniqueness.
--
-- Resolves the architectural inconsistency between global code uniqueness and
-- multi-tenant chart-of-accounts consumption. Different tenants (e.g. holding
-- company, sector subsidiaries) legitimately share standardized account codes
-- (e.g. 1000 Cash, 2000 AP, 4000 Revenue) under their respective tenant scopes.
--
-- Global unique index "ledger_accounts_code_uidx" is replaced with
-- tenant-scoped unique index "ledger_accounts_tenant_code_uidx" ON ("tenant_id", "code").
-- An index on "tenant_id" is also added for efficient RLS and tenant queries.
--
-- CAP_POSTING remains LOCKED. No accounting policy (P6/P1) is invented or ratified.

DROP INDEX IF EXISTS "ledger_accounts_code_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_tenant_code_uidx" ON "ledger_accounts" USING btree ("tenant_id", "code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_accounts_tenant_idx" ON "ledger_accounts" USING btree ("tenant_id");
