# MCM — Existing Assets Inventory

Machine-readable companion: `docs/enterprise/mcm-assets.json`
Baseline commit: `dc8f848226ed8860ef293f817fe10394360abb1d`

Every row below was verified directly against the schema module named in the
`Source` column and against the live migrated database.

## A. Organizational and corporate registry

| Table | Source | Key columns | RLS | MCM use |
|---|---|---|---|---|
| `tenants` | `schema/core.ts` | `id, code, type, parent_tenant_id, country_code, isolation_tier, status, classification` | tenant policy (`0001`) | Tenant boundary for every MCM row |
| `legal_entities` | `schema/core.ts` | `id, tenant_id, code, legal_name, trading_name, entity_type, parent_entity_id, country_code, jurisdiction_id, registration_number, tax_identifier, incorporation_date, functional_currency, accounting_standard, sector_code, status, classification, effective_from/to` | `legal_entities_tenant_isolation` | **The** corporate registry |
| `ownership_records` | `schema/core.ts` | `owned_entity_id, owner_entity_id, owner_party_id, ownership_type, instrument, economic_pct, voting_pct, control_rights, effective_from/to, provenance, supporting_document_id, recorded_by` | `ownership_records_tenant_isolation` | Ownership truth |
| `entity_appointments` | `schema/core.ts` | `legal_entity_id, party_id, role, appointed_on, resigned_on, authority_limit, resolution_ref` | tenant policy | Director/officer register |
| `org_units` | `schema/core.ts` | `tenant_id, legal_entity_id, code, name, unit_type, parent_unit_id, cost_centre, status` | tenant policy | Departments/branches |
| `countries` | `schema/core.ts` | `code, name, region, currency_code, timezone, locale, active` | reference | Country master |
| `jurisdictions` | `schema/core.ts` | `id, country_code, level, code, name, regulator, legal_system, effective_from/to` | reference | Jurisdiction master |

## B. Identity and authorization

| Table / module | Key facts |
|---|---|
| `parties`, `users` | One GlobalUserID; `users_party_uidx` enforces one user per party |
| `sessions` | TTL, `mfa_satisfied`, `revoked_at`, device trust, risk score |
| `roles`, `role_assignments` | Scoped by tenant + `legal_entity_id` + `global_scope` + effective window |
| `delegations`, `admin_authority_delegations` | Bounded, time-limited, revocable delegated authority |
| `emergency_access_grants` | Break-glass; deliberately unheld today (fail-closed) |
| `src/lib/authz.ts` | `can()` requires **one inseparable authority tuple** to match tenant+entity+country. Unioning dimensions from different grants is explicitly forbidden |
| `src/lib/tenant-scope.ts` | `withTenantDatabaseContext()` sets `beyu.current_tenant_ids`, `beyu.global_scope`, `beyu.governance_*` transaction-locally |

## C. Finance OS (authoritative; MCM reads only)

`financial_periods` (status `OPEN|CLOSING|CLOSED|LOCKED`, unique per entity+code) ·
`ledger_accounts` · `journal_entries` (unique `reference`, `fx_rate`, `reversal_of_id`,
`idempotency_key`) · `journal_lines` (debit/credit, cost centre) · `treasury_positions` ·
`capital_requests` (CAPEX/OPEX/INVESTMENT/FINANCING/RESERVE) · `waterfall_*` ·
`tax_strategies`/`tax_strategy_assessments` · payments and settlement tables.

RLS: `0021_financial_ledger_rls.sql`. Integrity: `0005`, `0006`, `0029`. There is **no**
consolidation, elimination, FX-rate or intercompany table.

## D. HCM (authoritative employee master)

`positions` · `employees` (`employee_no` unique, `party_id` unique, `legal_entity_id`,
`country_code`, `status`, classification default `RESTRICTED`) · `employment_events` ·
`workforce_requests`. RLS `0018` makes the policy **entity-aware**: an employee is
visible when its tenant *or its employing legal entity's tenant* is in scope.

## E. Governance

`constitution_articles` · `policies` · `governance_bodies` (BOARD/COMMITTEE/
FAMILY_COUNCIL/TRUSTEES/SHAREHOLDERS/EXECUTIVE, quorum + majority rule + reserved
matters) · `governance_members` · `resolutions` (DRAFT→TABLED→VOTED→terminal) ·
`resolution_votes` · `approvals` · `workflow*` · `governance_meetings` (+ agenda,
attendance, conflicts, motions, actions) · `governance_charters` ·
`governance_appointments` · body establishments/activations/changes/membership
changes · calendar, escalations, evaluations, legal holds.

RLS `0048`–`0061`: entity-visibility function `beyu_governance_entity_visible`,
classification windowing, and restrictive policies that make bodies/members
read-only to the runtime role and forbid deleting decisions.

## F. Assurance

`risks` (inherent/residual 1–5 scoring, appetite threshold, entity/sector linkage) ·
`controls` · `compliance_obligations` (`framework`, `reference`, `jurisdiction_code`,
`legal_entity_id`, `frequency`, `next_due_at`, `owner_role`) ·
`compliance_assessments` (state, evidence, remediation, `ai_assisted`,
`human_confirmed`) · `legal_matters` · `anomaly_signals` · `continuity_plans`.

## G. Contracting, blockchain, documents

`contract_records` (+ parties, lifecycle events, authority checks, obligations, SLA,
execution links, signatures, disputes, legal document lifecycle) · `blockchain_*` ·
`documents` (`checksum`, `storage_uri`, `authority_status` default `UNDER_REVIEW`,
`retention_code`, `legal_hold`) · `knowledge_sources`.

## H. Platform

`integrations` (code, provider, category `BANK|TAX_AUTHORITY|REGULATOR|HEALTH|IDP|
AI_PROVIDER|PAYROLL`, `secret_ref` reference-only, `status`, `sla_uptime_pct`) ·
`service_principals` · `audit_log` + `audit_chain_heads` (hash-chained, append-only,
`beyu_prevent_audit_update_delete`) · `enterprise_events` (CloudEvents-shaped) ·
`internal_event_receipts` · `feature_flags` · `data_assets` · `metric_definitions`.

## I. Frontend / presentation

`CAPABILITY_IA` groups in order: `executive`, `shared`, `sister-organization`,
`sector`, `administration`, `system`, then secondary workspaces. Exactly four Sector
OS entries. Presentation only — every destination re-runs authorization server-side.

Existing MCM-adjacent destinations: `/os/organization`, `/os/ownership`,
`/os/organization-ownership`, `/os/registry`, `/os/registries`, `/os/registration`,
`/os/governance`, `/os/assurance`, `/os/risk`, `/os/compliance`, `/os/legal`,
`/os/contracts`, `/os/capital`, `/os/finance`, `/os/hcm`, `/os/documents`,
`/os/audit`, `/os/audit-events`, `/os/federation`, `/os/government-integrations`.

## J. Testing and CI

51 test directories, 359 test files, 5,919 tests at baseline. CI
(`.github/workflows/ci.yml`) runs a committed-secret scan, a PostgreSQL 16 service
container, migrations, the RLS/runtime-role suite and the full vitest gate.
`tests/setup-env.ts` points the suite's `db` at a privileged TEST role;
`tests/security/*-rls-isolation.test.ts` connect explicitly as the **non-owner**
`beyu_runtime` role to prove isolation.
