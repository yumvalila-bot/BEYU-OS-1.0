# BEYU OS — FAMILY OFFICE INTEGRATION MAP (Phase 0 forensic audit)

**Date:** 2026-09-09 · **Branch:** `arena/01a085cf-beyu-os-1-0` · **Base commit:** `bc629f9e`
**Program:** Integrate *BEYU FAMILY OFFICE — Capital Allocation, Wealth Management & Generational Wealth* into the **existing** Family Office. This is an **integration** program, not a build.

---

## 0. Method and evidence discipline

Every row below was produced by inspecting the repository at `bc629f9e` and by
**executing** the existing suites against a live PostgreSQL 16 — not by reading
file names. Baseline commands run before any code was changed:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **clean** (exit 0) |
| Family suite | `npx vitest run tests/family` | **19 files / 455 tests passed** |
| Full suite (no DB) | `npx vitest run` | 73 files failed / 550 tests failed — **all** failures are `DATABASE_URL is required` (no database in the sandbox), i.e. environmental, not behavioural |
| Full suite (live PG 16, migrated + seeded) | `npx vitest run` | **139 files passed, 15 skipped (154); 2629 tests passed, 153 skipped** |
| Migrations | `npm run migrate` | 36 migrations `0000`–`0035` applied; fingerprint `2d759ce6…` → `c07b19e7…` |
| Role convergence | `npx tsx scripts/setup-db-role.ts` | `rolsuper:false rolbypassrls:false` |
| Seed | `npm run seed` | `BEYU OS bootstrap complete (2026-09-09)` |

The 15 skipped files are the HTTP suites; they self-skip unless `BEYU_TEST_BASE_URL`
points at a running server (`.github/workflows/ci.yml:438`).

---

## 1. What the existing Family Office actually is

The repository contains **two distinct, both-canonical Family Office layers** that
are frequently confused. The integration must extend **both** correctly.

### Layer A — Materialized, DB-backed Family Office (LIVE)

| Item | Evidence |
|---|---|
| Tables | `family_members`, `beneficiaries`, `family_vault_items` — `src/db/schema/people.ts` (migrated in `0000_kernel_v1_baseline.sql`) |
| Route (UI) | `src/app/os/family/page.tsx` (189 lines) — server component, `requireAccess("family:member.read")`, `withTenantDatabaseContext`, `tenantScopeIds` |
| API | **none** — `grep -rl family src/app/api` returns zero matches |
| Navigation | `src/app/os/layout.tsx:59` — `{ href: "/os/family", label: "Family Office", permission: "family:member.read" }`, group *Family & Foundation* |
| Permissions | `family:member.read`, `family:member.manage`, `family:beneficiary.read`, `family:beneficiary.manage`, `family:vault.read` — `src/lib/constants.ts:160-164` |
| Roles | granted at `src/lib/constants.ts:344-348` and `543-547` |
| Global scope | `FAMILY_OFFICE_PRINCIPAL` is in `GLOBAL_GOVERNANCE_ROLES` — `src/lib/tenant-scope.ts` |
| Branding | `src/components/family-trust-logo.tsx` — BEYU Family Trust identity inside BEYU OS chrome |

**Status: KEEP and EXTEND.** This is the canonical Family Office surface users see.

### Layer B — Policy-configurable Family Office engine (LIBRARY, deliberately un-exposed)

`src/lib/family/**` — **11,121 lines**, 38 modules, 455 tests.

| Area | Modules |
|---|---|
| Institution layer | `model.ts` (667), `lineage.ts` (733), `constitution.ts` (581), `institution.ts` (607), `eligibility.ts` (410), `alignment.ts` (511), `decision-gate.ts` (402), `policy-decisions.ts` (483) |
| Capital / loan engines | `capital.ts` (624), `loan.ts` (567) |
| Office rails | `office/*.ts` — 24 modules (policy, ratification, authority, delegation, workflow, events, persistence, identity, documents, governance, constitution, beneficiary, trust, capital, loan, wealth, business, lifestyle, philanthropy, education, validation) |
| Phase 3 contracts | `phase3/*.ts` — contracts, errors, events, authorization-slots, fail-closed |

Its documented, deliberate posture (`docs/audit/FAMILY_OFFICE_COMPLETENESS_AUDIT.md`):

> "Production Family Office APIs / UI — **deliberately NOT built**. The layer is
> library-level rails; exposing endpoints would require unratified policy."

And on persistence (`src/lib/family/office/persistence.ts`):

> `OFFICE_PERSISTENCE_STATE = "NOT_MATERIALIZED"`; the 3 neutral mechanism tables in
> `src/db/schema/family-office.ts` are **not exported from the schema barrel**, so no
> migration exists; 8 domain tables are declared designs with `materialized: false`,
> each gated on named FIRs.

**Status: KEEP and EXTEND.** Nothing here is replaced, and no FIR gate is bypassed.

### Layer C — Adjacent canonical infrastructure the Family Office must reuse

| Capability | Canonical owner | Evidence |
|---|---|---|
| Capital requests | Finance OS | `capital_requests` — `src/db/schema/finance.ts:125` (amount, currency, expectedIrr, expectedNpv, paybackMonths, riskScore, status, resolutionId) |
| Capital governance | Control plane | `src/lib/capital-governance-service.ts` — `CAPITAL_STATUS`, `GOVERNANCE_AUTHORIZED ≠ APPROVED ≠ FUNDED` |
| Treasury positions | Finance OS | `treasury_positions` — `src/db/schema/finance.ts:107`; analysis in `src/lib/specialist/treasury/*` (model/engines/service) |
| Risk | Assurance | `src/lib/specialist/risk/*` — `RISK_TYPE`, `RISK_BASIS`, `RISK_SEVERITY` (`REQUIRES_POLICY` is the default, never a guessed severity) |
| FP&A / forecast / tax | Finance specialists | `src/lib/specialist/fpna`, `forecast`, `tax-intelligence.ts` |
| Epistemics (canonical) | Finance OS | `src/lib/finance/epistemics.ts` — the ONE model (`POSTED, OBSERVED, DERIVED, FORECAST, ASSUMPTION, SCENARIO, …`); explicitly supersedes six private specialist vocabularies |
| Noelia | Platform | `src/lib/noelia.ts` + `src/lib/noelia/*` (37 modules), 17 API routes under `src/app/api/v1/ai/noelia/*`, `NOELIA_EPISTEMIC_STATUS` in `constants.ts` |
| Governance / approvals | Control plane | `governance_bodies`, `resolutions`, `resolution_votes`, `approvals`, `workflows`, `governance_decision_registry` — `src/db/schema/governance.ts` |
| Audit | Kernel | `src/lib/audit.ts` — hash-chained, `Tx` abstraction, `actorType: HUMAN|SERVICE|AI` |
| API boundary | Kernel | `src/lib/api.ts` — `guarded()`, `withIdempotency()`, `apiOk/apiError` |
| Tenant/entity/country isolation | Kernel | `src/lib/tenant-scope.ts`, RLS via `beyu_tenant_ids()` (defined in `drizzle/0001_kernel_gate1_hardening.sql`) |
| Money convention | Whole repo | **integer minor units** + **basis points**; `src/lib/family/loan.ts:buildRepaymentSchedule` and `src/lib/waterfall.ts` both state this explicitly. ES2017 target ⇒ no BigInt literals |

---

## 2. Capability classification — KEEP / EXTEND / REFACTOR / DEPRECATE / MISSING

Legend: **KEEP** = working, untouched · **EXTEND** = existing capability gains new
behaviour · **REFACTOR** = existing code restructured without behaviour loss ·
**DEPRECATE** = removed/marked obsolete · **MISSING** = capability does not exist.

| # | Capability (brief §) | Existing state | Verdict |
|---|---|---|---|
| 1 | Family Office routes (§35) | `/os/family` page only; **no API routes** | **EXTEND** (page) + **MISSING** (API) |
| 2 | Family Office frontend (§36) | one page, 4 metrics, 4 panels | **EXTEND** |
| 3 | Family Office API (§35) | none | **MISSING** |
| 4 | Family Office DB tables (§33) | `family_members`, `beneficiaries`, `family_vault_items` + 3 inert neutral designs + 8 unmaterialized designs | **KEEP** + **EXTEND** (new forward migration) |
| 5 | Drizzle schemas (§33) | `src/db/schema/people.ts`, inert `family-office.ts` | **KEEP** + **EXTEND** |
| 6 | Migrations (§34) | `0000`–`0035`, all forward-only, `beyu_migrations` checksum registry | **KEEP** (never rewrite) |
| 7 | Capital models (§9) | `family/capital.ts` pools/segregation/allocation-steps/IPS; `capital_requests` | **EXTEND** |
| 8 | Asset models (§6) | `ASSET_SEGREGATION_CLASSES` only; no asset/valuation records | **MISSING** |
| 9 | Investment models (§10) | none (only Finance-ref pointers in `office/wealth.ts`) | **MISSING** |
| 10 | Debt models (§8, §14) | `family/loan.ts` — lifecycle, 17 disciplines, repayment schedule, eligibility, portfolio summary | **EXTEND** |
| 11 | Real-estate models (§12, §13) | none | **MISSING** |
| 12 | Treasury models (§15) | `treasury_positions` + `specialist/treasury/*`; explicitly reports `NO_MATURITY_DATA` | **EXTEND** |
| 13 | Cash-flow models (§16) | `specialist/fpna`, `specialist/forecast` — entity-level, not family-consolidated | **EXTEND** + **MISSING** (family consolidation) |
| 14 | Portfolio models (§10) | none | **MISSING** |
| 15 | Risk models (§19) | `specialist/risk/*` — 10 `RISK_TYPE`s, severity `REQUIRES_POLICY` default | **EXTEND** (reconcile, never overwrite) |
| 16 | Governance workflows (§43) | `governance.ts`, `resolutions`, `approvals`, `workflows`, `office/workflow.ts` 10-step lifecycle | **EXTEND** |
| 17 | Approval workflows (§43) | `office/workflow.ts` (human-only approval, idempotent execution) | **EXTEND** |
| 18 | Family/trust structures (§26) | `office/trust.ts`, `office/constitution.ts`, `office/beneficiary.ts`, `legal_entities` | **KEEP** + **EXTEND** |
| 19 | Beneficiary structures (§26) | `beneficiaries` table + `office/beneficiary.ts` | **KEEP** + **EXTEND** |
| 20 | Reporting (§17) | Finance OS reporting; no family balance sheet | **MISSING** |
| 21 | Dashboards (§36) | `/os/family` metrics only | **EXTEND** |
| 22 | Noelia integration (§23) | full platform, 37 modules, 17 routes; **no Family Office target** | **EXTEND** |
| 23 | HIVE AI integration (§23) | `noelia/hive-runtime.ts` `HiveRuntimeBoundary` | **KEEP** |
| 24 | RBAC (§38) | 119 permission codes, role→permission map | **EXTEND** |
| 25 | ABAC (§38) | `classificationRank`, clearance checks in `can()` | **KEEP** + **EXTEND** |
| 26 | RLS (§39) | `beyu_tenant_ids()` policies + verification blocks in migrations | **KEEP** + **EXTEND** |
| 27 | Tenant/entity/country isolation (§39) | `tenant-scope.ts`, `OfficeScope`/`scopeIsContained` | **KEEP** |
| 28 | Audit (§41) | hash-chained `audit.ts`, `actorType` | **EXTEND** |
| 29 | Finance OS integration (§32) | FIR-018 boundary machine-enforced both ways | **KEEP** (invariant preserved) |
| 30 | Health / Agriculture OS (§31) | `sectors/health`, `src/lib/agriculture`, `/api/v1/agriculture/capital-cases` | **KEEP** + **EXTEND** (cross-sector refs) |
| 31 | Capital-posting controls (§42) | `CAP_POSTING_*` certification + `capital-governance-service.ts` | **KEEP** (never bypass) |
| 32 | Document management (§50) | `office/documents.ts` checksum-bound, `assertDocumentIsNotAuthority` | **EXTEND** |
| 33 | Notifications (§36) | `notifications` table (layout bell) | **KEEP** |
| 34 | Mobile (§37) | `mobile/flutter` — **no Family Office screen** (only agriculture/health) | **MISSING** |
| 35 | CI/CD (§46) | `.github/workflows/ci.yml` + `db-release.yml` | **KEEP** |
| 36 | Production deployment (§46) | `scripts/certify-production.mts` | **KEEP** |
| 37 | Tests (§45) | 154 files / 2782 tests | **EXTEND** |
| 38 | Capital doctrine CAP-001..015 (§5) | none | **MISSING** |
| 39 | Asset ladder / four green houses (§6) | none | **MISSING** |
| 40 | Be-the-bank internal capital (§7) | none | **MISSING** |
| 41 | Who-owes-whom obligation register (§8) | none | **MISSING** |
| 42 | Decision journal (§11) | none | **MISSING** |
| 43 | Scenario analysis (§14, §28) | `runTreasuryScenario` only (treasury-scoped) | **EXTEND** + **MISSING** (capital simulator) |
| 44 | Regulatory / tax intelligence (§21, §22) | `specialist/tax-intelligence.ts` (Finance OS) | **EXTEND** |
| 45 | Generational wealth (§26) | `beneficiaries`, `office/beneficiary.ts` | **EXTEND** |
| 46 | Family education (§27) | `office/education.ts` (funding/eligibility only, no curriculum) | **EXTEND** |
| 47 | Capital recycling (§29) | none | **MISSING** |
| 48 | Business systemization maturity (§30) | `office/business.ts` (references only) | **EXTEND** |
| 49 | Investment committee (§43) | `GOVERNANCE_COMMITTEES` in `model.ts`; no committee decision record | **EXTEND** |
| 50 | Segregation of duties (§40) | `office/authority.ts` delegation chains; no requester≠approver≠executor≠reconciler rule | **MISSING** |
| 51 | Financial red line GREEN…BLACK (§42) | `RISK_SEVERITY` = `REQUIRES_POLICY,LOW,MEDIUM,HIGH,CRITICAL` | **MISSING** (5-band red line) |
| 52 | Liquidity engine (§20) | `analyzeLiquidity` (treasury-scoped, `REQUIRES_POLICY`) | **EXTEND** |
| 53 | Productive capital metrics (§18) | none | **MISSING** |
| 54 | Noelia authority boundary (§24) | FIR-017 enforced at 6 points in the family layer | **EXTEND** (Family Office-specific CAN/CANNOT) |

**Nothing is DEPRECATED.** No working capability was found whose removal the
evidence supports.

---

## 3. The one architectural tension, resolved explicitly

`src/lib/family/phase3/contracts.ts:103` defines `FINANCIAL_STATE_FORBIDDEN_KEYS`
(`balance`, `journalRef`, `treasuryRef`, `commitment`, `receivable`, `payable`, …)
and `LOAN_TERMS_FORBIDDEN_KEYS` (`interestRate`, `collateral`, `creditLimit`, …),
enforced by `assertNoFinancialState` as **FIR-018: a family table can never be a
shadow ledger**.

The brief simultaneously requires the Family Office to carry principal, interest,
collateral, covenants, valuations and cash flows.

**Resolution adopted (and enforced by test, not by assertion):**

1. FIR-018 governs the **Family Institution layer** — lineage, beneficiary, trust,
   constitution and office domain records. Those records keep the boundary exactly
   as-is. `assertNoFinancialState` is **not weakened, not narrowed, not bypassed**.
2. The new **Family Office capital domain** is a distinct, explicitly-declared layer
   that models *capital terms and analysis*, never accounting state. Every monetary
   field in it carries an **epistemic class** from the canonical
   `src/lib/finance/epistemics.ts` superset, and the layer asserts
   `AUTHORITATIVE_ACCOUNTING = "FINANCE_OS"`: the Family Office can compute, model,
   stress and recommend, and **cannot** produce a posted balance, a journal line, a
   period or a reconciliation.
3. Every real-money link is a **reference** to the authoritative owner
   (`capitalRequestRef`, `financeJournalRef`, `treasuryPositionRef`,
   `legalEntityId`), so the Family Office never becomes the system of record.
4. `tests/family/office/capital-wealth/boundary.test.ts` asserts both directions:
   the institution layer still refuses financial state (regression), and the new
   capital layer refuses to masquerade as accounting authority.

This is the reconciliation the brief demands at §19 ("do not overwrite existing
risk taxonomy without reconciliation") and §32 ("do not duplicate accounting
authority"), applied to the finance boundary.

---

## 4. Integration deltas

### 4.1 Database delta (§33, §34)

Reuse: `family_members`, `beneficiaries`, `family_vault_items`, `legal_entities`,
`capital_requests`, `treasury_positions`, `resolutions`, `approvals`,
`governance_bodies`, `journal_entries`, `audit_log`, `notifications`.

New tables — **forward migration `0037_family_office_capital_wealth.sql` only**;
no applied migration is edited; names follow existing `snake_case` conventions;
all money is `numeric(18,2)` / `numeric(9,6)`, never float:

`family_capital_doctrine_adopted`, `family_asset_ladder_positions`,
`family_investments`, `family_investment_theses`, `family_investment_valuations`,
`family_decision_journal_entries`, `family_post_investment_reviews`,
`family_obligations`, `family_obligation_covenants`, `family_real_estate_assets`,
`family_real_estate_financing_models`, `family_cash_flow_items`,
`family_balance_sheet_snapshots`, `family_liquidity_snapshots`,
`family_scenario_models`, `family_scenario_results`, `family_capital_allocations`,
`family_committee_decisions`, `family_regulatory_events`, `family_education_lessons`,
`family_generational_plans`, `family_business_maturity_assessments`.

Each gets `ENABLE ROW LEVEL SECURITY` + a `tenant_id = ANY (beyu_tenant_ids())`
policy + the migration's own verification `DO $$ … RAISE EXCEPTION` block, matching
`0035_foundation_os.sql` exactly.

### 4.2 API delta (§35)

New namespace `/api/v1/family-office/*` — verified non-conflicting
(`src/app/api/v1/` contains no `family-office` directory). Every route uses the
existing `guarded()` wrapper, `withIdempotency()` for mutations, Zod validation,
`apiOk`/`apiError` envelopes and `recordAudit`.

### 4.3 Frontend delta (§36)

`/os/family` keeps its URL, guard, header and Family Trust logo. New sub-routes are
added under `/os/family/*` and the existing nav item is extended, not replaced.
Existing components reused: `Metric`, `Panel`, `Badge`, `EmptyState`, `Denied`,
`stateTone` from `src/components/brand.tsx`.

### 4.4 Mobile delta (§37)

`mobile/flutter` has **no** Family Office screen (verified by grep). Adding a full
Flutter module is out of scope for this program; recorded as an open P2 gap with
the API contract it will consume already fixed by §4.2.

### 4.5 Governance / security / Noelia / testing deltas

See the implementation notes in `docs/architecture/phase-4-family-office-capital-wealth.md`.

---

## 5. Verdict on Phase 0

The existing Family Office is **intact, tested and canonical**. Layer A is live and
thin; Layer B is a complete, fail-closed, policy-gated engine with no production
surface; Layer C provides every primitive the new capability needs (capital
requests, treasury, risk, governance, audit, RLS, Noelia, epistemics). The program
proceeds as an **extension of Layer A + B, consuming Layer C**, with no duplicate
database, no second governance engine, no second identity system, no second
finance/accounting system and no second Noelia.
