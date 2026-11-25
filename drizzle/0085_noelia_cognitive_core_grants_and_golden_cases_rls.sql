-- ============================================================================
-- 0085_noelia_cognitive_core_grants_and_golden_cases_rls.sql
--
-- CORRECTIVE, ADDITIVE migration. Two genuine defects in 0084 are repaired here.
-- No prior migration file is modified, and nothing here weakens a security
-- control — every statement either adds a privilege that should already have
-- existed, or adds row-level security that was missing.
--
-- DEFECT 1 — PRIVILEGES AND RLS NEVER APPLIED.
-- 0084 granted `beyu_runtime` privileges on its seven new tables and declared
-- RLS policies for them, but the canonical migrator (scripts/migrate.ts) splits
-- a migration file on a statement-breakpoint comment marker and executes each
-- fragment as ONE statement.
-- 0084 contained no such markers, so only its first statement ever executed:
-- the CREATE TABLE for `noelia_kg_edges`. Its RLS policies, its CHECK
-- constraints and every GRANT were silently skipped.
--
-- Effect observed in a real environment: `beyu_runtime` held no privilege on
-- `noelia_decision_records` (15 rows existed but were unreadable),
-- `noelia_council_sessions`, `noelia_council_findings`, `noelia_simulations`,
-- `noelia_golden_cases` or `noelia_learning_records`. The Command Centre and the
-- Council endpoint would therefore have failed at the database boundary. The
-- tables themselves were subsequently created, so the DDL here is limited to
-- what is safe to re-assert.
--
-- DEFECT 2 — `noelia_golden_cases` HAD NO ROW-LEVEL SECURITY.
-- The table holds evaluation benchmark questions and "must not do" assertions.
-- World-readable, it discloses (a) the institution's evaluation strategy and
-- (b) the exact adversarial probes used to test it — and a probe known in
-- advance can be trained around. It is intentionally GLOBAL rather than
-- tenant-scoped: a golden case is a benchmark definition, not institutional
-- data, so adding a tenant column would fragment a shared benchmark and imply
-- per-tenant truth where there is none. The control is therefore:
--   • RLS enabled AND forced, so table ownership cannot bypass it,
--   • a row is visible only when the request carries a resolved tenant context
--     via the canonical `beyu_tenant_ids()` helper — an unscoped connection
--     sees nothing,
--   • writes require that same resolved context.
-- This is strictly stronger than the previous state.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Re-assert RLS on `noelia_golden_cases` (idempotent).
-- ---------------------------------------------------------------------------
alter table noelia_golden_cases enable row level security;
--> statement-breakpoint
alter table noelia_golden_cases force row level security;
--> statement-breakpoint

drop policy if exists noelia_golden_cases_read on noelia_golden_cases;
--> statement-breakpoint
create policy noelia_golden_cases_read on noelia_golden_cases
  for select
  using (cardinality(beyu_tenant_ids()) > 0);
--> statement-breakpoint

drop policy if exists noelia_golden_cases_write on noelia_golden_cases;
--> statement-breakpoint
create policy noelia_golden_cases_write on noelia_golden_cases
  for all
  using (cardinality(beyu_tenant_ids()) > 0)
  with check (cardinality(beyu_tenant_ids()) > 0);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Runtime privileges are granted through the CANONICAL allowlist, not here.
--
-- An earlier draft of this migration contained seven `grant ... to beyu_runtime`
-- statements. That was the wrong mechanism, and the full test suite proved it:
-- `scripts/setup-db-role.ts` reconciles the runtime role by REVOKING every
-- privilege on every public table and re-granting only what
-- `scripts/runtime-privilege-allowlist.ts` permits. Any GRANT written here would
-- have been reverted on the next reconciliation — producing exactly the
-- intermittent "permission denied for table noelia_decision_records" that only
-- appeared when the whole suite ran together.
--
-- The seven tables are therefore classified in the allowlist itself, which is
-- the single source of truth for runtime privilege:
--   • all seven                        → RUNTIME_TABLE_ALLOWLIST (SELECT)
--   • kg_edges, decision_records,
--     council_sessions, council_findings,
--     learning_records                 → RUNTIME_NO_DELETE_TABLES (INSERT/UPDATE,
--                                          never DELETE: superseded, not destroyed)
--   • simulations                      → RUNTIME_INSERT_ONLY_TABLES
--   • golden_cases                     → RUNTIME_READ_ONLY_TABLES
--
-- `npm run setup:db-role` then applies it, and
-- tests/noelia/cognitive-migration-contract.test.ts asserts the resulting
-- privileges as the real beyu_runtime role.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Re-assert the RLS policies that 0084 never applied.
--
-- Written as drop-then-create so the migration is re-runnable, and expressed
-- against the same canonical tenant helper the rest of the platform uses. The
-- goal is parity with what 0084 documented, not a new isolation model.
-- ---------------------------------------------------------------------------
alter table noelia_kg_edges enable row level security;
--> statement-breakpoint
alter table noelia_kg_edges force row level security;
--> statement-breakpoint
drop policy if exists noelia_kg_edges_tenant_read on noelia_kg_edges;
--> statement-breakpoint
create policy noelia_kg_edges_tenant_read on noelia_kg_edges
  for select using (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint
drop policy if exists noelia_kg_edges_tenant_write on noelia_kg_edges;
--> statement-breakpoint
create policy noelia_kg_edges_tenant_write on noelia_kg_edges
  for all using (tenant_id = any (beyu_tenant_ids()))
  with check (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint

alter table noelia_decision_records enable row level security;
--> statement-breakpoint
alter table noelia_decision_records force row level security;
--> statement-breakpoint
drop policy if exists noelia_decision_records_tenant_read on noelia_decision_records;
--> statement-breakpoint
create policy noelia_decision_records_tenant_read on noelia_decision_records
  for select using (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint
drop policy if exists noelia_decision_records_tenant_write on noelia_decision_records;
--> statement-breakpoint
create policy noelia_decision_records_tenant_write on noelia_decision_records
  for all using (tenant_id = any (beyu_tenant_ids()))
  with check (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint

alter table noelia_council_sessions enable row level security;
--> statement-breakpoint
alter table noelia_council_sessions force row level security;
--> statement-breakpoint
drop policy if exists noelia_council_sessions_tenant_read on noelia_council_sessions;
--> statement-breakpoint
create policy noelia_council_sessions_tenant_read on noelia_council_sessions
  for select using (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint
drop policy if exists noelia_council_sessions_tenant_write on noelia_council_sessions;
--> statement-breakpoint
create policy noelia_council_sessions_tenant_write on noelia_council_sessions
  for all using (tenant_id = any (beyu_tenant_ids()))
  with check (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint

alter table noelia_council_findings enable row level security;
--> statement-breakpoint
alter table noelia_council_findings force row level security;
--> statement-breakpoint
drop policy if exists noelia_council_findings_read on noelia_council_findings;
--> statement-breakpoint
create policy noelia_council_findings_read on noelia_council_findings
  for select using (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint
drop policy if exists noelia_council_findings_write on noelia_council_findings;
--> statement-breakpoint
create policy noelia_council_findings_write on noelia_council_findings
  for all using (tenant_id = any (beyu_tenant_ids()))
  with check (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint

alter table noelia_simulations enable row level security;
--> statement-breakpoint
alter table noelia_simulations force row level security;
--> statement-breakpoint
drop policy if exists noelia_simulations_tenant_read on noelia_simulations;
--> statement-breakpoint
create policy noelia_simulations_tenant_read on noelia_simulations
  for select using (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint
drop policy if exists noelia_simulations_tenant_write on noelia_simulations;
--> statement-breakpoint
create policy noelia_simulations_tenant_write on noelia_simulations
  for all using (tenant_id = any (beyu_tenant_ids()))
  with check (tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint

alter table noelia_learning_records enable row level security;
--> statement-breakpoint
alter table noelia_learning_records force row level security;
--> statement-breakpoint
drop policy if exists noelia_learning_records_read on noelia_learning_records;
--> statement-breakpoint
create policy noelia_learning_records_read on noelia_learning_records
  for select using (tenant_id is null or tenant_id = any (beyu_tenant_ids()));
--> statement-breakpoint
drop policy if exists noelia_learning_records_write on noelia_learning_records;
--> statement-breakpoint
create policy noelia_learning_records_write on noelia_learning_records
  for all using (tenant_id is null or tenant_id = any (beyu_tenant_ids()))
  with check (tenant_id is null or tenant_id = any (beyu_tenant_ids()));
