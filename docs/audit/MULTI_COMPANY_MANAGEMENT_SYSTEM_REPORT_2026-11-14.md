# BEYU OS 1.0 — Multi-Company Management (MCM) System Report

**Date:** 2026-11-14 (upgraded to `origin/main` `2026-11-23`)  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Evaluated Baseline:** `d2de744` (`origin/main`, PR #131 merge, 2026-11-23 — incorporating PR #122 MCM merge `cdc0aa8`, PR #121 Tax Engine, PR #126 Routing, PR #130 Codespaces, PR #129 Homepage/Publishing, and PR #131 Scanner Hardening)  
**Branch:** `arena/67bd732b-beyu-os-1-0`  
**Connected Supabase Projects Audited:**
- `siyzygezdmlxbvwttrdz` — *yumvalila-bot's Project* (`eu-west-3`, production PostgreSQL host referenced in `.env.example`)
- `ztulvqnvtxmiejnvdcit` — *BEYU HEALTH OS* (`eu-central-1`)

---

## 1. Executive Summary & Readiness Verdict

The Multi-Company Management (`MULTI_COMPANY_MANAGEMENT` / MCM) capability in `BEYU-OS-1.0` is engineered as **one governed, fail-closed capability inside BEYU OS** rather than a parallel core, separate ledger, or rival Sector OS. Following merge of `origin/main` (`d2de744`), the branch implements the full MCM data schema (`0076`–`0079`) within the canonical 84-migration repository baseline (`0000`–`0083`), strict RBAC/ABAC capability model (28 `mcm:*` permissions), PostgreSQL RLS + runtime-privilege hardening, 14 governed domain mutation services, a pure-BigInt multi-currency consolidation engine, 16 HTTP route files (23 handlers), an Executive Group Command Centre RSC (`/os/mcm`), and 10 read-only NOELIA AI tools (`MULTI_COMPANY` and `FINANCIAL` plans).

### Overall Assessment

| Dimension | Status on Upgraded `main` (`d2de744`) | Key Finding |
|---|---|---|
| **Codebase & Architecture** | **Implemented & Verified** | TypeScript (`tsc --noEmit`), BEYU-SCG (`verify:scg`), ESLint, migration integrity (`84/84`), and CI redaction/credential-literal checks pass cleanly. |
| **Offline PG16 DB & Test Proof** | **Verified (160 passed, 8 HTTP skipped)** | Clean-install migrations `0000`–`0083`, runtime/governance role separation, 486-table privilege audit (0 failures), and all 6 MCM Vitest suites (91 tests) + security/migration/IA/surface suites passed against PostgreSQL 16.14. HTTP boundary suite (`8 tests`) was skipped because no live HTTP server (`BEYU_TEST_BASE_URL`) was started. |
| **Live Supabase (`siyzygezdmlxbvwttrdz`)** | **NOT YET DEPLOYED (8 Migrations Behind)** | Live database is at migration **`0075`** (`2026-10-22`) plus 5 Supabase-applied governance patches (`2026-11-11`). Migrations `0076`–`0083` (`0076`–`0079` MCM + `0080`–`0083` Tax, Canonical Namespace, Public Content) are unapplied: **0 of the 20 MCM tables exist**, `beyu_governance` role does not exist, `tenant_domains` still carries `familyoffice.beyuos.co.tz` prior to `0082`, and bootstrap data has 0 `mcm:*` permissions, 0 `legal_entities`, and 0 `ownership_records`. |
| **Secondary Supabase (`ztulvqnvtxmiejnvdcit`)** | **Empty `public` Schema** | Contains 44 built-in system-schema tables and 0 `public` tables (`supabase_migrations.schema_migrations` absent). |
| **Remaining Functional Deferrals** | **Documented & Fail-Closed** | `fx_rates` has no governed write/intake API (`RATE_INTAKE` gap); 4 declared permissions (`mcm:integration.verify`, `mcm:procurement.manage`, `mcm:asset.manage`, `mcm:project.manage`) lack write handlers; 6 Phase 2/3 assets in `docs/enterprise/mcm-assets.json` remain `MISSING_DEFERRED`. |

---

## 2. Constitutional & Architectural Boundaries

MCM is structurally subordinate to BEYU OS's existing canonical authorities (`docs/ECOSYSTEM_STATUS.md`, `docs/enterprise/MCM_REPOSITORY_RECONCILIATION.md`, `src/lib/mcm/services.ts`, `src/lib/mcm/consolidation.ts`):

1. **No Rival Master Registries:** MCM consumes canonical `tenants`, `legal_entities`, `ownership_records`, `financial_periods`, `journal_entries`/`journal_lines`, `governance_bodies`, `resolutions`, `risks`, `compliance_obligations`, `documents`, and `employees` (HCM). MCM never duplicates or overwrites `ownership_records`, `governance_members`, or `employees`.
2. **Ledger Invariant (`CAP_POSTING` Locked):** MCM imports **zero Finance write paths**. Consolidation runs (`consolidation_runs`) and intercompany items (`intercompany_transactions`) never write `journal_entries` or `journal_lines`; `finance_reference_id` stays `null` until separately booked in Finance OS.
3. **Zero Monetary Float Arithmetic:** `src/lib/mcm/consolidation-core.ts` operates exclusively on signed `bigint` minor units (`numeric`/`bigint` DB storage) and scales rates using integer arithmetic (`bigint` numerator/denominator) rather than IEEE-754 floats.
4. **Honesty & Non-Fabrication (`McmFigure`):** Every metric surfaced by `src/lib/mcm/read-services.ts` and rendered by `src/components/mcm/figure.tsx` carries an explicit `dataState` (`ACTUAL`, `DERIVED`, `ESTIMATED`, `PENDING`, `UNVERIFIED`, `NOT_AVAILABLE`, `CONSOLIDATED_UNREVIEWED`, `CONSOLIDATED_REVIEWED`) and `sourceOfTruth`. Missing ledgers, unratified FX rates, or closed/absent periods cause explicit refusals (`McmError`) rather than silent zeros.

---

## 3. Database Schema, Migrations (`0076`–`0079`), & PostgreSQL Controls

### 3.1 Migration Sequence

`drizzle/meta/_journal.json` holds **84** migrations (`0000`–`0083`), with **58** snapshot files and **29** acknowledged legacy metadata items (`0` blocking discrepancies per `scripts/migration/integrity.ts`). MCM is introduced and hardened across migrations `0076`–`0079` (with subsequent `0080`–`0083` covering tax legal metadata, tax return drafts, canonical `beyu.co.tz` namespace alignment, and public content):

| Migration | Purpose |
|---|---|
| `0076_multi_company_management.sql` | Creates **20** MCM tables (`src/db/schema/mcm.ts`), domain `CHECK` constraints, **5** immutability/append-only triggers, `ENABLE` + `FORCE ROW LEVEL SECURITY`, tenant/entity/classification RLS policies, and initial restrictive policies. |
| `0077_mcm_rls_hardening.sql` | Adds **8** `AS RESTRICTIVE FOR DELETE USING (false)` policies, blocks mutation of already `VERIFIED` `legal_entity_profiles` (`legal_entity_profiles_verified_immutable`), locks updates on `ownership_validations`, and restricts `intercompany_transactions` updates to non-authorized states. |
| `0078_mcm_module_link_index_alignment.sql` | Aligns `mcm_module_links_uidx` with Drizzle schema definition. |
| `0079_mcm_module_link_uidx_order.sql` | Finalizes column ordering on `mcm_module_links_uidx`, bringing schema and applied SQL into full agreement (`SCHEMA DRIFT PASSED`). |

### 3.2 Complete 20-Table Inventory & PostgreSQL Hardening

All 20 MCM tables have **`ENABLE ROW LEVEL SECURITY`** and **`FORCE ROW LEVEL SECURITY`**, verified live in PostgreSQL 16.14 (`scripts/audit-runtime-privileges.ts`).

| Domain Group | Table (`0076`) | Runtime Role Posture (`beyu_runtime`) | Immutability / Key DB Controls |
|---|---|---|---|
| **Corporate & Ownership** | `legal_entity_profiles` | `SELECT, INSERT, UPDATE` (No `DELETE`) | `0077` `no_delete` + `verified_immutable` policy; currency/timezone/method/verification CHECKs |
| | `legal_entity_lifecycle_events` | `SELECT, INSERT` (No `UPDATE/DELETE`) | Trigger `legal_entity_lifecycle_events_append_only` (`BEFORE UPDATE OR DELETE`); terminal `authority_ref` CHECK |
| | `ownership_validations` | `SELECT, INSERT` (No `UPDATE/DELETE`) | `0077` `no_delete` + `no_update` restrictive policies; valid total % & rules CHECKs |
| | `entity_relationships` | `SELECT, INSERT, UPDATE, DELETE` (RLS scoped) | Self-relationship ban; `SHARED_SERVICES` requires instrument; effective window CHECK |
| | `mcm_country_profiles` | **Read-Only** (`SELECT` only) | `mcm_country_profiles_no_write` / `no_update` / `no_delete` restrictive RLS + revoked DML |
| **Intercompany & FX** | `fx_rates` | **Read-Only** (`SELECT` only) | `fx_rates_no_write` / `no_update` / `no_delete` restrictive RLS + revoked DML; `rate > 0`, pair & provenance ≥8 chars CHECKs |
| | `intercompany_agreements` | `SELECT, INSERT, UPDATE` (No `DELETE`) | `0077` `no_delete`; `ACTIVE` requires `document_id`; `from <> to`; pricing ≥8 chars CHECK |
| | `intercompany_transactions` | `SELECT, INSERT, UPDATE` (No `DELETE` when authorized) | `intercompany_transactions_dual_authorization_check` (`receivable_authorized_by_user_id <> payable_authorized_by_user_id`); `0077` update guard once authorized/reconciled; tripartite counterparty FX CHECK |
| | `intercompany_reconciliation_runs` | `SELECT, INSERT` (No `UPDATE/DELETE`) | Trigger `intercompany_reconciliation_runs_append_only` (`BEFORE UPDATE OR DELETE`); `no_delete` RLS |
| **Consolidation** | `consolidation_runs` | `SELECT, INSERT, UPDATE` (No `DELETE`) | Trigger `consolidation_runs_append_only_core` (protects core totals; allows status/review advance only); `consolidation_runs_review_check` (`reviewed_by_user_id <> prepared_by_user_id`) |
| | `consolidation_entities` | `SELECT, INSERT` (No `UPDATE/DELETE`) | Trigger `consolidation_entities_append_only` (`BEFORE UPDATE OR DELETE`); `no_delete` RLS |
| | `consolidation_adjustments` | `SELECT, INSERT` (No `UPDATE/DELETE`) | Trigger `consolidation_adjustments_append_only` (`BEFORE UPDATE OR DELETE`); `no_delete` RLS |
| **Group Registers & Links** | `mcm_statutory_filings` | `SELECT, INSERT, UPDATE` (No `DELETE`) | `0077` `no_delete`; `FILED` requires human/date; `VERIFIED_API` requires evidence CHECK |
| | `mcm_capital_allocations` | `SELECT, INSERT, UPDATE` (No `DELETE`) | `0077` `no_delete`; `APPROVED` requires `governance_body_id` + `resolution_id` CHECK |
| | `mcm_procurement_register` | `SELECT, INSERT, UPDATE, DELETE` (RLS scoped) | Entity-scoped; conflict/advance & positive amount CHECKs |
| | `mcm_asset_register` | `SELECT, INSERT, UPDATE, DELETE` (RLS scoped) | Entity-scoped; tenure, currency, amount CHECKs |
| | `mcm_project_portfolio` | `SELECT, INSERT, UPDATE, DELETE` (RLS scoped) | Entity-scoped; health, status, amounts, window CHECKs |
| | `mcm_module_links` | `SELECT, INSERT, UPDATE` (No `DELETE`) | `0077` `no_delete`; unique index `mcm_module_links_uidx` (`0078`/`0079`) |
| **Cross-OS Contracts** | `mcm_integration_contracts` | **Read-Only** (`SELECT` only) | Declared in `RUNTIME_READ_ONLY_TABLES`; contract direction/transport/owner/retries CHECKs |
| | `mcm_integration_events` | `SELECT, INSERT` (No `UPDATE/DELETE`) | `0077` `no_delete`; outcome/counts CHECKs |

**Privilege Segregation Summary (`scripts/runtime-privilege-allowlist.ts`, `scripts/setup-db-role.ts`, `scripts/setup-governance-db-role.ts`):**
- `beyu_runtime` is strictly `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, owns **0** public objects, and cannot invoke `SECURITY DEFINER` RLS bypasses (`[]` functions).
- **3** MCM tables are in `RUNTIME_READ_ONLY_TABLES` (`fx_rates`, `mcm_country_profiles`, `mcm_integration_contracts`).
- **13** MCM tables are in `RUNTIME_NO_DELETE_TABLES` (11 `legal_entity_profiles`, `legal_entity_lifecycle_events`, `ownership_validations`, `intercompany_agreements`, `intercompany_reconciliation_runs`, `consolidation_runs`, `consolidation_entities`, `consolidation_adjustments`, `mcm_module_links`, `mcm_statutory_filings`, `mcm_capital_allocations`, `mcm_integration_events` — note `intercompany_transactions` carries row-level conditional `no_delete` via RLS once authorized).
- `beyu_governance` (`scripts/setup-governance-db-role.ts`) isolates governed request-path writes from `BEYU_ADMIN_DATABASE_URL` (`postgres`).

---

## 4. Authorization Model: RBAC, ABAC, MFA Step-Up, & Segregation of Duties

`src/lib/constants.ts` defines **28** `mcm:*` permissions (`lines 270–297`), gated by `guarded()` on HTTP routes and re-enforced via `requireMcmCapability()` + `assertEntityInScope()` in domain services (`src/lib/mcm/services.ts`, `src/lib/mcm/model.ts`).

### 4.1 MFA-Gated High-Risk & Delegable Tiers

- **`HIGH_RISK_PERMISSIONS` (4 MCM permissions requiring MFA step-up):**
  - `mcm:intercompany.authorize` — authorize one side of an intercompany claim
  - `mcm:consolidation.review` — sign off four-eyes consolidation review
  - `mcm:capital.approve` — approve group capital allocation against a governance resolution
  - `mcm:company.lifecycle` — execute corporate lifecycle transitions (including terminal `DISSOLVED`/`ARCHIVED`)
- **`ADMIN_DELEGATABLE_PERMISSIONS` (3 MCM permissions allowing bounded delegation):**
  - `mcm:company.manage`, `mcm:filing.manage`, `mcm:country.manage`
  - Five structural/four-eyes controls (`company.lifecycle`, `relationship.manage`, `intercompany.authorize`, `consolidation.review`, `capital.approve`) are **explicitly non-delegable** (`src/lib/constants.ts:651–658`).

### 4.2 Role Distribution (`src/lib/constants.ts`)

| Role | `mcm:*` Grants | Key Boundaries / Exclusions |
|---|---|---|
| `GROUP_CEO` | **24** | Holds company/lifecycle/relationship/country/filing/register/consolidation-prepare/capital-propose powers. **Deliberately excluded** from `mcm:consolidation.review`, `mcm:intercompany.authorize`, `mcm:capital.approve`, and `mcm:integration.verify`. |
| `GROUP_CFO` | **21** | Group financial oversight: `consolidation.prepare` + `consolidation.review`, `intercompany.manage`/`authorize`/`reconcile`, `capital.propose`/`approve`. Excluded from `company.lifecycle`, `relationship.manage`, `country.manage`, and register mutations. |
| `CHIEF_GOVERNANCE_OFFICER` | **17** | Corporate secretarial integrity: `company.lifecycle`, `relationship.manage`, `country.manage`, `filing.manage`, `ownership.validate`. **Zero** consolidation, intercompany write, or capital execution rights. |
| `AUDITOR` | **11** | Strictly read-only across all MCM views plus `mcm:ownership.validate` (analysis-only validation evidence). Zero manage/approve powers. |
| `SECTOR_OPERATOR` | **5** | Read-only (`company.read`, `relationship.read`, `procurement.read`, `asset.read`, `project.read`) narrowed by entity/tenant ABAC. |
| `HCM_DIRECTOR` | **2** | `mcm:company.read`, `mcm:project.read` (for workforce rollup alignment). |
| `PLATFORM_ADMIN`, `TENANT_MEMBER`, & all Family/Foundation/Risk roles | **0** | Platform administrators hold zero operational MCM authority; Family Office and Foundation remain constitutionally separated unless explicitly granted scoped memberships. |

---

## 5. Domain Services, Consolidation Engine, & Intercompany Controls

### 5.1 Governed Domain Services (`src/lib/mcm/services.ts` & `src/lib/mcm/read-services.ts`)

All 14 mutation services wrap every state change + `audit_log` entry + `enterprise_events` record (`MCM_VERSION = "mcm/1.0.0"`) inside a single atomic `withAuditTransaction`:

- **Corporate Registry & Lifecycle:** `upsertCompanyProfile`, `verifyCompanyProfile`, `transitionEntityLifecycle` (enforces state transition matrix and requires `authorityRef` for `DISSOLVED`/`ARCHIVED`).
- **Relationships & Ownership Validation:** `recordRelationship` (prevents self-relationships, overlapping effective windows, parentage conflict vs `legal_entities.parent_entity_id`, and un-instrumented `SHARED_SERVICES`), `endRelationship`, `validateOwnershipRecord` (evaluates effective totals, document backing, and circularity via `wouldCreateCycle` bounded at 64 hops fail-closed).
- **Intercompany & Period Lock (`src/lib/finance/intercompany.ts`):** `raiseIntercompanyTransaction` and `authorizeIntercompanySide` check `intercompanyPeriodFacts` / `assertPeriodsOpen` / `assertAgreementEffectiveForPeriod` / `assertIntercompanyPeriodOpen` so closed/missing/locked Finance periods refuse both transaction raising and late counterparty authorization. Same-principal dual signature is blocked in both TypeScript (`SEGREGATION_OF_DUTIES` HTTP 403) and PostgreSQL (`intercompany_transactions_dual_authorization_check`). `reconcileIntercompanyPeriod` writes append-only reconciliation runs highlighting discrepancies in BigInt minor units without auto-posting or zeroing differences.
- **Filings, Capital, Links, & Country Config:** `recordStatutoryFiling`, `proposeCapitalAllocation`, `decideCapitalAllocation`, `linkModuleRecord`, `recordCountryProfile`.
- **Scoped Read Projections (`src/lib/mcm/read-services.ts`):** `visibleEntities` (enforces tenant + legal entity + country + clearance filtering), `buildHierarchy`, `entityFinancialSnapshots`, `consolidationOverview`, `intercompanyOverview`, `ownershipOverview`, `governanceOverview`, `countryViews`, `riskComplianceOverview`, `moduleRollup`, `integrationHealth`.

### 5.2 Pure-BigInt Consolidation Engine (`src/lib/mcm/consolidation-core.ts` & `src/lib/mcm/consolidation.ts`)

1. **Pure Arithmetic Core (`consolidation-core.ts`):**
   - `sumJournalTotals`, `rescaleMinor`, `effectiveOwnershipFraction` (chain multiplication in exact rational/BigInt form), `translateAccountBalance` (monetary vs equity/retained translation with CTA / translation reserve), `buildConsolidationElimination` (requires `BOTH_SIDES_AUTHORIZED`/`RECONCILED` status), and `prepareConsolidation`.
   - Refuses `NON_INTEGER_MINOR_UNIT`, fractional minor precision (`>2dp`), missing trial balances (`NO_TRIAL_BALANCE` exclusion rather than zero-fill), and unbalanced inputs.
2. **DB Adapter & Fail-Closed FX (`src/lib/mcm/consolidation.ts`, `src/lib/finance/fx.ts`):**
   - `resolveRate` enforces explicit provenance (`fx_rates.provenance` ≥ 8 chars), rejects conflicting duplicate active rates (`FX_RATE_CONFLICT`), rejects missing pairs (`MISSING_FX_RATE`), and rejects unratified/implied conversions.
   - `prepareConsolidationRun` spans multiple tenants for a group parent (`holding.tenantId`), enforces `mcm:consolidation.prepare`, refuses empty consolidation scopes (`NO_CONSOLIDATED_ENTITIES`, `NO_PERIODS_FOR_PERIOD_CODE`), writes run + entity + elimination rows atomically inside `withAuditTransaction`.
   - `reviewConsolidationRun` enforces `mcm:consolidation.review` (MFA high-risk) and refuses self-review in both application code and DB `CHECK (reviewed_by_user_id <> prepared_by_user_id)`.

---

## 6. HTTP API Surface & Executive UI

### 6.1 Governed HTTP Endpoints (`/api/v1/mcm/*`) — 16 Route Files, 23 Handlers

Every handler uses `guarded()` with explicit permission enforcement, per-route rate limits, `.strict()` Zod schemas (`src/app/api/v1/mcm/_shared.ts`), and `mcmRefusal()` mapping `McmError` status codes (`403`/`404`/`409`/`422`) instead of generic 500s. Notably, `consolidationPrepareSchema.strict()` explicitly rejects any caller-supplied FX rate fields (`fxRate`, `rateSet`, etc.) with `422 VALIDATION_FAILED`.

| Route | Method | Permission | Rate Limit | Service / Purpose |
|---|---|---|---|---|
| `/api/v1/mcm/overview` | `GET` | `mcm:company.read` | 120/min | Group summary, country views, risk/compliance, module rollups |
| `/api/v1/mcm/hierarchy` | `GET` | `mcm:company.read` | 120/min | Scoped corporate hierarchy tree |
| `/api/v1/mcm/companies` | `POST` | `mcm:company.manage` | 30/min | `upsertCompanyProfile` |
| | `PUT` | `mcm:company.manage` | 10/min | `verifyCompanyProfile` |
| `/api/v1/mcm/lifecycle` | `POST` | `mcm:company.lifecycle` | 15/min | `transitionEntityLifecycle` (MFA) |
| `/api/v1/mcm/relationships` | `POST` | `mcm:relationship.manage` | 30/min | `recordRelationship` |
| | `PATCH` | `mcm:relationship.manage` | 30/min | `endRelationship` |
| `/api/v1/mcm/ownership` | `POST` | `mcm:ownership.validate` | 30/min | `validateOwnershipRecord` |
| `/api/v1/mcm/countries` | `POST` | `mcm:country.manage` | 6/min | `recordCountryProfile` *(fail-closed at DB under `beyu_runtime`)* |
| `/api/v1/mcm/filings` | `POST` | `mcm:filing.manage` | 60/min | `recordStatutoryFiling` |
| `/api/v1/mcm/intercompany` | `POST` | `mcm:intercompany.manage` | 60/min | `raiseIntercompanyTransaction` |
| | `PATCH` | `mcm:intercompany.authorize` | 60/min | `authorizeIntercompanySide` (MFA, dual-side SoD) |
| | `PUT` | `mcm:intercompany.reconcile` | 6/min | `reconcileIntercompanyPeriod` |
| `/api/v1/mcm/consolidation` | `GET` | `mcm:consolidation.read` | 60/min | `consolidationOverview` + `intercompanyOverview` |
| | `POST` | `mcm:consolidation.prepare` | 6/min | `prepareConsolidationRun` (`.strict()` rejects caller FX) |
| | `PATCH` | `mcm:consolidation.review` | 30/min | `reviewConsolidationRun` (MFA, 4-eyes) |
| `/api/v1/mcm/financials` | `GET` | `mcm:consolidation.read` | 60/min | `entityFinancialSnapshots` |
| `/api/v1/mcm/capital` | `POST` | `mcm:capital.propose` | 20/min | `proposeCapitalAllocation` |
| | `PATCH` | `mcm:capital.approve` | 20/min | `decideCapitalAllocation` (MFA) |
| `/api/v1/mcm/governance` | `GET` | `mcm:company.read` | 60/min | `governanceOverview` + `ownershipOverview` |
| `/api/v1/mcm/modules` | `GET` | `mcm:company.read` | 60/min | Entity-scoped module links & registers |
| `/api/v1/mcm/links` | `POST` | `mcm:company.manage` | 60/min | `linkModuleRecord` |
| `/api/v1/mcm/integrations` | `GET` | `mcm:integration.read` | 60/min | `integrationHealth` |

> **Runtime Fail-Closed Design Note (`POST /api/v1/mcm/countries`):** Because `mcm_country_profiles` is in `RUNTIME_READ_ONLY_TABLES` (`mcm_country_profiles_no_write`), calling `POST /api/v1/mcm/countries` via `beyu_runtime` is intentionally refused at the PostgreSQL RLS layer; country law updates are designed for privileged operator procedures (`adminDb`).

### 6.2 Executive UI (`/os/mcm`)

Registered under the **Executive** domain in `src/app/os/capabilities.ts`, `src/app/os/mcm/page.tsx` (614-line Next.js Server Component) renders seven governed operational views filtered by the authenticated session's capabilities and entity scope: (1) Group portfolio & provenance header, (2) Corporate Hierarchy & Ownership chains, (3) Jurisdictions & Statutory Filings, (4) Intercompany & Consolidation Runs, (5) Governance, Risk & Compliance rollups, (6) Capital, Procurement, Asset & Project Registers, and (7) Cross-OS Integration Health. Monetary and count values use `<Figure />`, `<DataStateBadge />`, and `<BoundaryNote />` (`src/components/mcm/figure.tsx`) so unverified or unreviewed states remain visibly distinguishable.

---

## 7. NOELIA Governed AI Integration

`src/lib/noelia/mcm-tools.ts` defines **10 read-only tools** (`sideEffects: "NONE"`), each re-checking the principal's RBAC permission and narrowing rows strictly via `visibleEntities` before returning:

| NOELIA Engine Plan (`src/lib/noelia/runtime.ts`) | Tool Name | Required Permission |
|---|---|---|
| **`MULTI_COMPANY` (7 default tools)** | `mcm.portfolio.hierarchy` | `mcm:company.read` |
| | `mcm.ownership.structure` | `mcm:company.read` |
| | `mcm.jurisdiction.coverage` | `mcm:country.read` |
| | `mcm.governance.overview` | `mcm:company.read` |
| | `mcm.risk_and_compliance.overview` | `mcm:company.read` |
| | `mcm.module_rollup` | `mcm:company.read` |
| | `mcm.integration.health` | `mcm:integration.read` |
| **`FINANCIAL` (3 group-finance tools)** | `mcm.company.financial_snapshot` | `mcm:company.read` |
| | `mcm.intercompany.position` | `mcm:intercompany.read` |
| | `mcm.consolidation.status` | `mcm:consolidation.read` |

Key runtime guardrails (`src/lib/noelia/runtime.ts`):
- **Deterministic Routing & Treasury Deflection:** `routeEngine()` matches group/subsidiary/intercompany/consolidation intent to `MULTI_COMPANY`, while **explicitly deflecting** queries containing `cash`, `treasury`, or `liquidity` to `FINANCIAL` so treasury inquiries never bypass Finance OS tools.
- **Fact-Only Boundary:** `MULTI_COMPANY` assigns `outputClass = "FACT"`, appends an explicit boundary statement confirming NOELIA cannot create entities, transition lifecycles, validate ownership, file returns, reconcile balances, or run consolidations, and logs every query in `noelia_routing_decisions` and `ai_decisions`.

---

## 8. Live Supabase Audit vs. Repository `HEAD` (`d2de744`)

Live SQL inspection via the connected Supabase MCP integration was executed against both projects and compared against the upgraded `origin/main` (`d2de744`, `0000`–`0083`) baseline.

### 8.1 Environment Reconciliation Table

| Dimension | Repository `HEAD` (`d2de744`) + Clean PG16 | Live Supabase `siyzygezdmlxbvwttrdz` (`eu-west-3`) | Live Supabase `ztulvqnvtxmiejnvdcit` (`eu-central-1`) |
|---|---|---|---|
| **Migration Ledger (`beyu_migrations`)** | **84** applied (`0000`–`0083_public_content`) | **76** applied (`0000`–`0075_noelia_authority_execution_hardening`, latest `2026-10-22 08:23:43 UTC`) | Table absent (0 `public` tables) |
| **Supabase Native Migrations (`supabase_migrations.schema_migrations`)** | N/A (repo tracks `beyu_migrations`) | **5** patches applied `2026-11-11` (`restore_canonical_rls_exemptions`, `revoke_api_access_to_unprotected_tables`, `sensitive_trust_noelia_rls_abac`, `protect_audit_chain_head_from_runtime_delete`, `pin_public_function_search_paths`) | Relation absent (`42P01`) |
| **Public Tables & RLS** | **486** runtime-audited tables (**409** RLS-enabled); all 20 MCM tables have `ENABLE` + `FORCE RLS` | **464** public tables (**387** RLS enabled, **270** `FORCE RLS`); **0** of the 20 MCM tables exist (`42P01` on `fx_rates`, `intercompany_agreements`, etc.) | **0** public tables (44 built-in schema rows) |
| **Schema Fingerprint (`db-release.ts`)** | `32bbe088e559581cc00d6690320052d8` (after `0083`; `aa4891f7ab4ac498821f67899c39b169` at `0079`) | Divergent (at `0075` + `2026-11-11` RLS/privilege patches; behind by `0076`–`0083`) | N/A |
| **Database Roles & Privileges** | `beyu_runtime` (`NOSUPERUSER`, `NOBYPASSRLS`, `audit-runtime-privileges` 0 failures) + `beyu_governance` (`NOBYPASSRLS`) | `beyu_runtime` exists (`NOSUPERUSER`, `NOBYPASSRLS`); **`beyu_governance` absent**; `beyu_runtime` still holds `DELETE,UPDATE` table grants on `audit_log` and `enterprise_events` (mitigated today by `BEFORE DELETE OR UPDATE` & `BEFORE TRUNCATE` triggers) | System defaults only |
| **Bootstrap / Seed Data** | `seed.ts`: 7 tenants, 5 countries, 9 `legal_entities`, 7 `ownership_records`, 28 `mcm:*` permissions (`ROLES` populated), `beyu.co.tz` apex (`0082`) | `admin_bootstrap_state = SEALED`, `tenants = 1` (`TEN_BEYU_GROUP`), `countries = 5`, `users = 2`, `roles = 2` (`PLATFORM_ADMIN`, `TENANT_MEMBER`), `role_assignments = 1`, `permissions = 13` (**0 `mcm:*`**), `os_registry = SHARED_COMMUNICATIONS`, `tenant_domains = familyoffice.beyuos.co.tz`, `legal_entities = 0`, `ownership_records = 0`, `financial_periods = 0`, `journal_entries = 0`, `audit_log = 188`, `enterprise_events = 79`, `ai_decisions = 18`, `noelia_routing_decisions = 18` | Empty |

### 8.2 Key Live-DB Findings

1. **Deployment Lag (`0076`–`0083` Pending):** `siyzygezdmlxbvwttrdz` has not yet run `.github/workflows/db-release.yml` (`mode=deploy`) for commits after `2026-10-22` (`0075`). None of the 20 MCM schema tables (`0076`–`0079`), tax metadata/draft tables (`0080`–`0081`), `beyu.co.tz` canonical namespace update (`0082`), or `public_content` table (`0083`) are live in production.
2. **Governance Role Not Yet Provisioned on Live:** `beyu_governance` (required by `src/db/governance.ts` and `.github/workflows/db-release.yml` production secret guards) does not exist in `pg_roles` on `siyzygezdmlxbvwttrdz` yet.
3. **Runtime Table-Level Grants on `audit_log` / `enterprise_events`:** On live `siyzygezdmlxbvwttrdz`, `beyu_runtime` still holds `DELETE,UPDATE` table privileges on `audit_log` and `enterprise_events` (though `audit_log_immutable_update`/`truncate` and `enterprise_events_immutable_update`/`truncate` triggers block mutation at row/statement execution time). Running `scripts/setup-db-role.ts` during `db-release.yml` `deploy` aligns table grants cleanly with `scripts/runtime-privilege-allowlist.ts`.
4. **Canonical Master Data Unseeded in Sealed Live Bootstrap:** Because `siyzygezdmlxbvwttrdz` was sealed with only `TEN_BEYU_GROUP`, `PLATFORM_ADMIN`, `TENANT_MEMBER`, and 13 core identity/organization permissions, operational MCM entities (`legal_entities`, `ownership_records`, `mcm:*` permissions, `GROUP_CEO`/`GROUP_CFO`/`CHIEF_GOVERNANCE_OFFICER` roles, `mcm_country_profiles`, and `fx_rates`) must be provisioned before live consolidation or intercompany flows can operate.
5. **Audit Check on `ztulvqnvtxmiejnvdcit`:** Confirm whether "BEYU HEALTH OS" (`ztulvqnvtxmiejnvdcit`) is an unused placeholder project or reserved for dedicated Health OS tenant isolation; today it holds zero BEYU schema objects.

---

## 9. Verification Evidence (Upgraded `origin/main` `d2de744`)

All local checks below were executed cleanly against the merged `d2de744` baseline (`NODE_OPTIONS="--max-old-space-size=4096"` for TypeScript, plus an ephemeral local PostgreSQL 16.14 cluster cleaned up immediately after verification):

| Check / Suite | Command / Target | Outcome | Scope / Notes |
|---|---|---|---|
| **TypeScript Typecheck** | `NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/tsc --noEmit` | **PASS (0 errors)** | Note: default Node heap OOMs without `--max-old-space-size=4096`. |
| **Governance Static Gate** | `npm run verify:scg` | **PASS (4/4 checks)** | `V-3`, `V-4`, `V-6`, `V-7`: 0 blocking, 0 advisory. |
| **ESLint (MCM Surface)** | `npx eslint src/lib/mcm/ src/app/api/v1/mcm/ src/app/os/mcm/ src/components/mcm/ src/lib/noelia/mcm-tools.ts src/db/schema/mcm.ts tests/mcm/ tests/api/mcm-consolidation-http.test.ts` | **PASS** | Zero warnings/errors (`ESLINT_MCM_OK`). |
| **Migration Integrity** | `npx tsx scripts/migration/integrity.ts` | **PASS** | 84 SQL files, 84 journal entries, 58 snapshots, 29 acknowledged historical debt, **0 blocking**. |
| **CI Credential / Redaction Scanners** | `node --test tests/ci/secret-scan-redaction.test.mjs` & `node scripts/ci/scan-credential-literals.mjs` | **PASS (36/36; 1579 files)** | Redaction suite 36/36 passed; 0 uppercase credential literals across 1,579 tracked source files (`scan-history-literals.mjs` still flags pre-existing PR #131 baseline commits in `origin/main`). |
| **Clean-Install Migrate (PG 16.14)** | `npm run migrate` (`0000` → `0083`) | **PASS** | Fingerprints `c84d30ea5960b20432d794c27856e2dc` → `69a692baaa9b9d407f17772de0323b2c`. |
| **Role Provisioning & Audit** | `setup-db-role.ts`, `db:setup-governance-role`, `audit-runtime-privileges.ts` | **PASS** | **486 tables**, **0 failures**; verified `beyu_runtime` and `beyu_governance` (`NOBYPASSRLS`, non-owner). |
| **DB Release Preflight** | `db-release.ts preflight` (`0083_public_content`) | **PASS** | Applied 84/84, 409 RLS tables, fingerprint `32bbe088e559581cc00d6690320052d8`, ledger `67db386999f5b7b2bafb5b9b936e447ef83958242ded2e5b79b32dd2030ffd85`. *(Note: `schema-drift.ts` passed at `cdc0aa8`/`0079`; `0080`/`0081`/`0083` snapshots are present and `0082` is data-only).* |
| **Canonical Bootstrap Seed** | `npm run seed` | **PASS** | Idempotent seed completed (`2026-11-23`). |
| **MCM Core (Pure BigInt)** | `tests/mcm/consolidation-core.test.ts` | **PASS (30/30)** | Math, scaling, FX, CTA, NCI, eliminations, fail-closed checks. |
| **MCM Domain Model** | `tests/mcm/model.test.ts` | **PASS (18/18)** | Lifecycle transitions, ownership checks, `McmFigure` states. |
| **MCM Consolidation Adapter** | `tests/mcm/consolidation.test.ts` | **PASS (14/14)** | Multi-tenant scope, exclusions, Zod FX smuggling block, 4-eyes DB review. |
| **MCM Intercompany & Period Lock** | `tests/mcm/intercompany-period-lock.test.ts` | **PASS (6/6)** | Open/closed Finance periods, dual-authorization SoD. |
| **MCM RLS Isolation (`beyu_runtime`)** | `tests/mcm/rls-isolation.test.ts` | **PASS (10/10)** | Direct SQL with `beyu_runtime` proving tenant isolation, `no_delete`, `fx_rates`/`mcm_country_profiles` write refusal. |
| **MCM NOELIA Tools** | `tests/mcm/noelia-tools.test.ts` | **PASS (13/13)** | Tool permission filtering, `MULTI_COMPANY` routing, treasury deflection, audit rows. |
| **Security Privilege Audit** | `tests/security/runtime-privilege-audit.test.ts` | **PASS (6/6)** | `beyu_runtime` attributes & `SECURITY DEFINER` function audit (`[]`). |
| **Migration / IA / Surface Suites** | `migration-integrity.test.ts` (36), `control-plane-ia.test.ts` (22), `agent-surface-guard.test.ts` (5) | **PASS (63/63)** | Executed on upgraded `d2de744` baseline. |
| **MCM HTTP Boundary Suite** | `tests/api/mcm-consolidation-http.test.ts` | **SKIPPED (0/8 run)** | Conditionally skipped (`describe.skipIf(!available)`) because no live Next.js server was bound at `BEYU_TEST_BASE_URL`. |

---

## 10. Open Gaps, Deferred Capabilities, & Actionable Recommendations

### 10.1 Verified Code & Domain Gaps

1. **Missing Governed `fx_rates` Intake (`RATE_INTAKE`):** `fx_rates` is intentionally `RUNTIME_READ_ONLY_TABLES`, yet there is no governed admin API/CLI/workflow to ingest audited FX rates (`rate_type`, `provenance`, `rate_date`). Consequently, any cross-currency `prepareConsolidationRun` fails closed with `MISSING_FX_RATE` until rates are seeded/inserted via `BEYU_ADMIN_DATABASE_URL`.
2. **Four Unwired `mcm:*` Write Permissions:** `mcm:integration.verify`, `mcm:procurement.manage`, `mcm:asset.manage`, and `mcm:project.manage` are defined in `src/lib/constants.ts` (and the latter three are assigned to `GROUP_CEO`), while their tables exist in `0076` and read endpoints work, **no mutation services or API routes** currently consume these four permissions.
3. **Empty Master Extension Tables Post-Seed (`src/db/seed.ts`):** `seed.ts` seeds `countries`, `jurisdictions`, `tenants`, `legal_entities` (9), `ownership_records` (7), and `PERMISSIONS`/`ROLES`, but leaves `mcm_country_profiles` and `legal_entity_profiles` empty (`REUSED_UNVERIFIED` / manual onboarding required).
4. **Deferred Phase 2/3 Assets (`docs/enterprise/mcm-assets.json` — 6 of 39 assets marked `MISSING_DEFERRED`):**
   - `statutory_filing_adapters` (external regulator API adapters; filing register currently supports `MANUAL` / `DOCUMENT_BASED` and pre-registered `VERIFIED_API` citations)
   - `document_pack_export` (board/auditor consolidated reporting pack generator)
   - `group_budget_cycle` (group budgeting vs actuals cycle)
   - `transfer_pricing_policy` (automated transfer-pricing policy workflows beyond agreement review status)
   - `entity_onboarding_wizard` (guided multi-step corporate entity onboarding UX)
   - `cross_os_health_sync_worker` (background event/health worker updating `mcm_integration_events`)
5. **Unverified Live HTTP Boundary in This Audit:** `tests/api/mcm-consolidation-http.test.ts` (`401`/`403`/`422`/`409`/`404`) requires an active server (`BEYU_TEST_BASE_URL`) and was skipped during offline test execution.

### 10.2 Recommended Next Actions

1. **Deploy Pending Schema & Roles to `siyzygezdmlxbvwttrdz`:**
   - Ensure GitHub Production secrets (`BEYU_ADMIN_DATABASE_URL`, `BEYU_RUNTIME_DB_PASSWORD`, `BEYU_GOVERNANCE_DB_PASSWORD`) and Vercel env vars (`DATABASE_URL`, `BEYU_GOVERNANCE_DATABASE_URL`) are configured with pinned Supabase CA verification (`sslmode=verify-full`).
   - Run `.github/workflows/db-release.yml` with `mode=deploy` targeting expected fingerprint `32bbe088e559581cc00d6690320052d8` (for `0083`) to apply `0076`–`0083`, create `beyu_governance`, reconcile `beyu_runtime` table revocations (removing lingering `DELETE/UPDATE` table grants on `audit_log` and `enterprise_events`), and pass the Production Verification Gate (`pvg`).
2. **Sync Permissions, Roles, & Initial Entity Registry on Production:**
   - Run a governed idempotent permission/role reconciliation on `siyzygezdmlxbvwttrdz` so the 28 `mcm:*` permissions and MCM role definitions (`GROUP_CEO`, `GROUP_CFO`, `CHIEF_GOVERNANCE_OFFICER`, `AUDITOR`, `SECTOR_OPERATOR`, `HCM_DIRECTOR`) exist alongside the sealed administrator account.
   - Enroll/verify the real corporate legal entities, ownership instruments, and initial `mcm_country_profiles` via governed operator workflows.
3. **Implement Governed `fx_rates` Intake:** Add a dual-controlled or checksummed admin/governance FX intake script/workflow (`BEYU_GOVERNANCE_DATABASE_URL` or `BEYU_ADMIN_DATABASE_URL`) before enabling multi-currency group consolidation in production.
4. **Execute Live HTTP Smoke Verification:** Run `tests/api/mcm-consolidation-http.test.ts` against a staging or local build bound to a seeded database to close the remaining transport-layer test gap.
5. **Clarify `ztulvqnvtxmiejnvdcit` Ownership:** Confirm whether the empty *BEYU HEALTH OS* Supabase project should be decommissioned or reserved for dedicated Health OS tenant isolation.
