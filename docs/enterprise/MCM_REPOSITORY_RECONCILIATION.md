# MCM — Repository Reconciliation

**Capability:** `MULTI_COMPANY_MANAGEMENT` (MCM)
**Repository:** `yumvalila-bot/BEYU-OS-1.0`
**Base commit inspected:** `dc8f848226ed8860ef293f817fe10394360abb1d` (`main`, merge of PR #115)
**Implementation branch:** `arena/2aef83f7-beyu-os-1-0`
**Date of inspection:** 2026-11-13

This document records what already existed before MCM was implemented, what was
reused unchanged, what was extended, and what was found to be duplicate,
conflicting, incomplete or obsolete. It is evidence, not a plan: every claim
below was verified against the checked-out tree and a live migrated PostgreSQL 16
instance carrying all 76 migrations (`0000`–`0075`).

---

## 1. Method

1. `git log`, `git branch -a`, working-tree state — one branch, clean tree, `main` at
   `dc8f848`.
2. `gh pr list --state all --limit 60` — every open, closed and merged PR, with head
   branch, base branch and update time.
3. Full read of the schema barrel `src/db/schema.ts` (48 schema modules, 16,770
   lines), the canonical permission catalogue `src/lib/constants.ts` (2,031 lines),
   the zero-trust kernel `src/lib/authz.ts`, the tenant-scope/RLS abstraction
   `src/lib/tenant-scope.ts`, the governed API boundary `src/lib/api.ts`, the
   audit/event ledgers `src/lib/audit.ts`, and the presentation catalogues
   `src/lib/operating-system-catalog.ts`, `src/lib/operating-systems.ts`,
   `src/app/os/capabilities.ts`.
4. Full read of all 76 SQL migrations in `drizzle/`, plus `scripts/migrate.ts`,
   `scripts/setup-db-role.ts` and `scripts/runtime-privilege-allowlist.ts`.
5. Enumerated the live database: 400+ tables, their RLS posture, and the actual
   `beyu_tenant_ids()` / `beyu_global_scope()` predicate functions.
6. Mapped all 378 API route files under `src/app/api` and all 90 renderable
   destinations under `src/app/os`.
7. Ran the complete pre-existing suite as a baseline: **5,919 tests — 5,496 passed,
   38 assertion failures, 354 pending, plus suite-level errors**. The failure set is
   recorded verbatim in `MCM_IMPLEMENTATION_GAP_ANALYSIS.md` §9 and is
   **pre-existing on the base commit**; it was reproduced before a single line of
   MCM code was written.

---

## 2. Canonical assets found and REUSED UNCHANGED

| Asset | Location | Role in MCM |
|---|---|---|
| `tenants` | `schema/core.ts` | Tenant boundary; self-referencing `parent_tenant_id`; `isolation_tier`, `classification` |
| `legal_entities` | `schema/core.ts` | **The** corporate registry. Effective-dated, tenant-owned, classification-carrying, hierarchical via `parent_entity_id` |
| `ownership_records` | `schema/core.ts` | Effective-dated economic/voting/beneficial/control ownership with `provenance` and `supporting_document_id` |
| `entity_appointments` | `schema/core.ts` | Officer/director/trustee/secretary appointments with `authority_limit` and `resolution_ref` |
| `org_units` | `schema/core.ts` | Divisions, departments, branches, teams — deliberately not legal entities |
| `countries`, `jurisdictions` | `schema/core.ts` | Country and jurisdiction registries |
| `entityTypeEnum` | `schema/enums.ts` | Exactly the entity vocabulary MCM needs, already closed |
| `ownershipTypeEnum` | `schema/enums.ts` | `DIRECT / INDIRECT / BENEFICIAL / CONTROL_ONLY` |
| `lifecycleStatusEnum` | `schema/enums.ts` | Status vocabulary for registries |
| `parties`, `users`, `sessions`, `roles`, `role_assignments` | `schema/identity.ts` | One GlobalUserID; one session model |
| `journal_entries`, `journal_lines`, `financial_periods`, `ledger_accounts`, `treasury_positions`, `capital_requests` | `schema/finance.ts` | The ONE ledger. MCM never writes it |
| `employees`, `employment_events`, `positions` | `schema/people.ts` | The ONE employee master used by MCM workforce rollups |
| `governance_bodies`, `governance_members`, `resolutions`, `resolution_votes`, `approvals` | `schema/governance.ts` | Board/committee authority — MCM reads, never duplicates |
| `governance_meetings` + agenda/attendance/conflicts/motions/actions | `schema/governance-meetings.ts` | Board meetings, agendas, minutes linkage, conflicts of interest |
| `governance_charters`, `governance_appointments`, `governance_membership_changes`, body establishments/activations/changes | `schema/governance-*.ts` | Appointment and resignation workflows with evidence + resolution lineage |
| `risks`, `controls`, `compliance_obligations`, `compliance_assessments`, `legal_matters`, `anomaly_signals`, `continuity_plans` | `schema/assurance.ts` | The ONE risk/compliance register |
| `contract_records` and the 11-table contracting domain | `schema/contracts.ts` | The ONE contract register |
| `documents`, `integrations`, `feature_flags`, `service_principals`, `audit_log`, `enterprise_events`, `internal_event_receipts` | `schema/platform.ts` | Evidence, integration registry, immutable audit |
| `foundations`, `procurements`, `foundation_assets` | `schema/foundation.ts` | Foundation isolation; the Foundation-scoped procurement model |
| `admin_authority_delegations`, `admin_bootstrap_state` | `schema/admin-governance.ts` | Delegated authority instruments |
| `beyu_tenant_ids()`, `beyu_global_scope()` | migrations `0000`, `0001` | The RLS predicate primitives |
| `can()`, `matchingAuthorityGrants()`, `Principal` | `lib/authz.ts` | The ONE authorization primitive (RBAC + ABAC tuple matching) |
| `withTenantDatabaseContext()`, `tenantScopeIds()`, `hasGlobalGovernanceScope()` | `lib/tenant-scope.ts` | Transaction-local RLS context |
| `guarded()`, `apiOk()`, `apiError()` | `lib/api.ts` | The ONE API boundary (auth → authz → validate → rate limit → audit) |
| `recordAuditTx()`, `publishEventTx()`, `withAuditTransaction()` | `lib/audit.ts` | Hash-chained audit + event append |
| `registerLegalEntity()`, `recordOwnership()`, `registerBusiness()` | `lib/admin/registry-service.ts` | Existing governed registration orchestration |
| `CAPABILITY_IA` | `app/os/capabilities.ts` | The ONE navigation/presentation catalogue |

---

## 3. Useful work found in open PRs

The mission required inspecting every open PR for reusable MCM-relevant work. Six
PRs are open against `main` at the base commit:

| PR | Branch | Relevance to MCM | Decision |
|---|---|---|---|
| #120 | `security/finance-health-boundary-remediation` | Hardens Finance RLS + Health identity boundary | **Not merged into this branch.** It touches the same RLS primitives MCM's new tables sit next to; merging it inside this branch would create conflicting parallel security work. MCM's own policies are written to be *compatible* with it (both use `beyu_tenant_ids()`; neither weakens the other). Recorded as a review-order dependency. |
| #118 | `feat/executive-command-centre-ia` | Reorganises `CAPABILITY_IA` navigation | **Conflict identified.** MCM adds one Executive-group item (`/os/mcm`). #118 rewrites the same group. MCM's change is additive and lands in the smallest possible diff (one entry) so the conflict is a one-line rebase; the existing pinned-order test was updated by exactly one entry. |
| #117 | `finance-os/tra-intelligence-upgrade` | TRA tax intelligence | **Reused conceptually, not merged.** MCM country configuration references the canonical TRA obligation register rather than creating a second tax model. |
| #116 | `feat/beyu-connect-social-integrations` | Communications contract docs only | No overlap. |
| #114 | `arena/29e84284-…` public homepage | Presentation only | No overlap. |
| #112, #111, #110, #109, #103, #68, #67, #61 | older branches | Sector-specific or superseded | Inspected; none carries corporate-registry, ownership, intercompany or consolidation code that is absent from `main`. Confirmed by grepping each branch's tree for `legal_entities`/`ownership_records`/`intercompany`. |

**Conclusion:** no unmerged MCM-relevant implementation exists. Nothing useful was
discarded, and nothing was duplicated.

---

## 4. Duplicate / conflicting / obsolete implementations identified

1. **Two procurement registries, both real, neither a duplicate of the other.**
   `procurements` (Foundation-scoped, `foundation_id` NOT NULL) and
   `ujenzi_purchase_orders` (construction-scoped). There is **no entity-scoped,
   group-level procurement register**. MCM therefore adds a group procurement
   register that *references* both rather than replacing either.
2. **`organization-ownership` and `organization` and `ownership` are three separate
   routes** over the same registries (`/os/organization-ownership` is a hub linking
   to `/os/organization` and `/os/ownership`). Not obsolete — they are focused
   views — but there was **no group-level executive surface**, which is why MCM
   adds `/os/mcm` as the consolidated command centre rather than extending a
   focused view.
3. **`capital_requests` (Finance OS) vs Family Office capital cases.** Two capital
   pipelines at different altitudes, deliberately separate (documented in
   `family-office-capital.ts`). MCM's capital allocation proposals are a *third*,
   group-level pipeline and must therefore reference `capital_requests` by id —
   never restate an amount as authoritative.
4. **`employees.tenant_id` vs employing-entity tenant.** Migration `0018` already
   reconciled RLS for this. MCM reuses the same entity-aware predicate; it does not
   introduce a second employee-access rule.
5. **`entityTypeEnum` has no `SPV`.** The mission requires Special Purpose
   Vehicles. `ASSOCIATE` and `JOINT_VENTURE` exist but are not SVPs. Decision:
   **extend the existing enum** with `SPECIAL_PURPOSE_VEHICLE` and
   `BUSINESS_UNIT` rather than create a parallel type column. Enum extension is
   additive (`ALTER TYPE … ADD VALUE` semantics via the migration author, applied in
   one transaction by `migrate.ts`).
6. **No lifecycle state for "draft/pending-verification/dormant/dissolved".**
   `lifecycleStatusEnum` covers `CREATED…ARCHIVED` but cannot express
   `DORMANT` or `DISSOLVED`. Decision: **do not widen `beyu_lifecycle_status`**
   (widening changes meaning on ~40 unrelated tables). MCM adds an
   entity-registry-specific `legal_entity_lifecycle_state` column plus its own
   closed enum, defaulted from the existing `status` so nothing moves silently.
7. **Consolidation and intercompany do not exist at all.** Finance OS has no
   consolidation table, no elimination journal, no intercompany transaction
   register, and no FX-rate table. `journal_entries.fx_rate` exists per entry, but
   there is no governed rate source. This is a genuine gap, filled in MCM-C/E/F.
8. **No software register / no group project portfolio.** `agriculture_projects`,
   `ujenzi_projects`, `foundation_projects` are sector-local. MCM adds a group
   portfolio that references them.
9. **No per-country statutory configuration store.** Regulators exist
   (`government_agencies`, `federation_authorities`) and obligations exist
   (`compliance_obligations` with `jurisdiction_code`), but there is no table
   binding *entity → country → statutory filing profile → authority → filing
   cadence*. MCM adds it as configuration only, with no invented API endpoints.

---

## 5. Source-of-truth boundaries (declared, and enforced by MCM)

| Capability | Authoritative store | MCM's relationship |
|---|---|---|
| Identity, parties, users, sessions | `parties`, `users`, `sessions` | Read-only reference |
| Legal entity master | `legal_entities` | Extends with MCM profile satellite; never a second registry |
| Ownership | `ownership_records` | Extends with validation + effective-dated history view; never writes a parallel table |
| Employment master | `employees` (HCM) | Read-only rollups; MCM assigns no employee |
| General ledger | `journal_entries` / `journal_lines` (Finance OS) | Read-only. **CAP_POSTING stays LOCKED**; MCM posts nothing |
| Financial periods | `financial_periods` | Read-only enforcement of period state |
| Board/committee authority | `governance_bodies`, `governance_members`, `resolutions` | Read; MCM appointment *workflow* writes through the existing governed appointment tables |
| Risk register | `risks` / `controls` | Read; MCM risk linkage only |
| Compliance obligations | `compliance_obligations` | Read; MCM binds entity→obligation |
| Contracts | `contract_records` | Read; MCM counterparty linkage |
| Documents | `documents` | Reference by id only |
| Audit/events | `audit_log`, `enterprise_events` | Append via the one canonical writer |
| Sector operational truth | Health / Finance / Agriculture / Ujenzi stores | Read via declared data contracts; no direct cross-OS table reach |
| Foundation | Foundation tenant + `foundations` | Hard-isolated; MCM sees only the consolidated existence, never confidential Foundation rows |
| AI | One NOELIA/HIVE runtime (`src/lib/noelia/*`) | MCM registers advisory tools in the one registry |

---

## 6. What MCM therefore had to build (and only this)

New database structures (migration `0076`), each justified by an absence verified
in §4:

- `legal_entity_profiles` — registration office, statutory identifiers, reporting
  currency/timezone, MCM lifecycle state, verification state.
- `legal_entity_lifecycle_events` — append-only lifecycle ledger.
- `entity_relationships` — non-ownership relationships (parent, management,
  governance, branch, operational affiliation) with effective dates.
- `ownership_validations` — instrument-backed validation results per ownership row.
- `mcm_country_profiles` + `mcm_statutory_filings` — per-country configuration and
  filing register (manual/document-based where no verified API exists).
- `intercompany_agreements`, `intercompany_transactions` (with dual-side
  authorisation + reconciliation), `intercompany_reconciliation_runs`.
- `fx_rates` — governed, effective-dated rate source with provenance.
- `consolidation_runs`, `consolidation_entities`, `consolidation_adjustments`
  (eliminations) — analysis only, no ledger write.
- `mcm_capital_allocations` — group capital allocation proposals referencing
  Finance OS `capital_requests`.
- `mcm_procurement_register` — entity-scoped group procurement.
- `mcm_asset_register` — entity-scoped property/asset register.
- `mcm_project_portfolio` — group project/portfolio register.
- `mcm_integration_contracts` — declared cross-OS service contracts and health.
- `mcm_module_links` — a small linkage table so each enterprise module (legal, risk,
  compliance, audit) has entity-aware pointers without copying its truth.

New code:

- `src/lib/mcm/*` — services (registry, ownership validation, hierarchy validation,
  intercompany, consolidation, country configuration, integration contracts).
- `src/lib/noelia/mcm-tools.ts` — the ten read-only MCM Noelia tools. They live
  with every other tool family, not under `src/lib/mcm/*`, because the registry is
  a single canonical surface and one AI runtime; MCM supplies no second one.
- `src/app/os/mcm/*` — the command centre and its drill-downs.
- `src/app/api/v1/mcm/*` — governed API routes.
- `tests/mcm/*` — unit, integration, security and financial tests.

---

## 7. Explicit non-changes

- No new repository, fork, OS, ledger, identity system or NOELIA runtime.
- `vercel.json` untouched (no such file exists; deployment is Vercel-native via
  `next.config.ts`).
- No production environment variable, DNS or domain change.
- No migration edited after being written; `0076` is append-only and follows the
  `--> statement-breakpoint` convention the runner requires.
- No historical ownership, director or financial row altered.
