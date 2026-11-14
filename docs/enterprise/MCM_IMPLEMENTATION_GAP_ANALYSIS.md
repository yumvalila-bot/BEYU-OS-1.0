# MCM — Implementation Gap Analysis

Baseline commit: `dc8f848226ed8860ef293f817fe10394360abb1d`
Machine-readable companion: `docs/enterprise/mcm-assets.json`
Companion documents: `MCM_REPOSITORY_RECONCILIATION.md`, `MCM_EXISTING_ASSETS_INVENTORY.md`

This document states what existed before MULTI_COMPANY_MANAGEMENT, what was built,
and — with equal precision — **what is still missing and why**. Nothing below is
described as complete unless it can be demonstrated by running something.

---

## 1. How to read a status

| Status | Meaning | Evidence standard |
|---|---|---|
| **DELIVERED** | Implemented and exercised. | A named test, a named migration, and a live verification command. |
| **DELIVERED — DEGRADED** | Implemented, but one dependency is unresolved, so the feature fails closed rather than fully working. | The failure path is itself tested. |
| **NOT BUILT — DECIDED** | Deliberately not built; building it would violate a mission constraint. | The constraint is named. |
| **NOT BUILT — GAP** | Missing work, recorded so it cannot be mistaken for delivered. | The consequence of its absence is named. |

---

## 2. Findings against the pre-MCM repository

### 2.1 The corporate registry existed and was sound

`legal_entities` already carried code, legal name, entity type, country,
jurisdiction, registration number, tax identifier, incorporation date, functional
currency, accounting standard, sector, status, classification and an effective
window. `ownership_records` already carried economic/voting percentages with
instruments. Neither needed a second implementation.

**Consequence adopted:** MCM does not restate a single registry fact. Legal name,
entity type, registration number and parent are read from `legal_entities`;
`legal_entity_profiles` holds only what the registry does *not* hold (verification
evidence, reporting currency/timezone, statutory identifiers and obligations). A
profile therefore cannot disagree with the registry — it has nothing to disagree
*with*.

### 2.2 `legal_entities.parent_entity_id` had no cycle guard — closed

A circular corporate hierarchy makes consolidation, ownership roll-up and any
"who ultimately owns this" query non-terminating or silently wrong. Nothing
prevented `A → B → A`.

**Delivered:** migration 0076 installs `beyu_mcm_assert_no_entity_cycle`, a
depth-bounded trigger on `INSERT OR UPDATE OF parent_entity_id`. `wouldCreateCycle`
in `src/lib/mcm/services.ts` additionally walks the owner side before recording a
validation. Two independent layers, because either one alone can be bypassed.

### 2.3 The registry had no lifecycle — closed

`legal_entities.status` was a free-text column with no permitted transitions, no
history and no evidence requirement. A company could be moved from `ACTIVE` back
to a draft state with an ordinary `UPDATE`.

**Delivered:** `legal_entity_lifecycle_events` (append-only by trigger: UPDATE and
DELETE both raise) plus a closed state machine in `MCM_LIFECYCLE_TRANSITIONS`.
`DISSOLVED` and `ARCHIVED` additionally require the authority reference that made
the change lawful, enforced both in the service and by a CHECK constraint.
`ARCHIVED` is terminal: returning a dissolved company to `ACTIVE` would be a new
legal person, not a transition.

### 2.4 Ownership had no validation layer — closed

Percentages and instruments were stored, but nothing checked whether a set of
records *could* be true: nothing refused a 140% economic total, a beneficiaries
split with no document, or a voting right with no economic basis.

**Delivered:** `ownership_validations` records per-rule findings (R1–R7) and the
totals they were evaluated against. The critical design decision: a live total
**below** 100% returns `RETURNS_HUMAN_REVIEW`, never `VALID`, because a missing
owner is a question for a person, not a validation success. Equally, MCM **never
writes `ownership_records`** — `organization:ownership.manage` remains unheld by
every role, and validation is evidence, not mutation.

### 2.5 "Shared services" had no representation — closed

The registry modelled ownership and parentage. It had no way to express that
company A manages company B, or that a group function is delivered by one entity
to another under an agreement — so every operational relationship was either
mis-recorded as ownership or lost.

**Delivered:** `entity_relationships`, effective-dated, with an enum that has
**no `OWNERSHIP` member** and a CHECK that refuses one. Not every organizational
relationship is legal ownership, and the schema now says so structurally rather
than by convention. Overlapping live relationships of the same type over the same
pair are refused (409) rather than silently superseded.

### 2.6 Financial periods were not checked for intercompany — **CLOSED**

`raiseIntercompanyTransaction` documented a period-lock precondition it did not
perform: a transaction for a `CLOSED` period was accepted. The control now exists
(`assertIntercompanyPeriodOpen` / `intercompanyPeriodFacts` in
`src/lib/mcm/services.ts`) and is read from **Finance OS's** `financial_periods`,
never from an MCM-owned copy of the calendar:

* `CLOSED` or `LOCKED` for **either** leg refuses the write (409
  `PERIOD_NOT_OPEN`, naming which leg). An intercompany record changes both
  companies' position, so a lock on one side cannot be worked around by naming the
  other.
* The lock gates **raising** and **side authorisation** — a period that closed
  after a transaction was raised cannot be brought into the group by a late
  signature. Authority is still checked first, so a principal who may not sign is
  refused for the reason that binds them.
* **Reconciliation is deliberately not gated.** Reconciling is how a period becomes
  ready to close; blocking it would deadlock the close.
* `CLOSING` is not `CLOSED`, and **the absence of a period row is not a lock**.
  Treating "no row" as locked would let MCM decide Finance's register by default;
  the consequence is stated here instead of being papered over with a fabricated
  lock.
* A refusal writes **nothing**: no partial transaction, no state drift. The test
  counts rows before and after each refusal rather than trusting the throw.

The same function also closes a second overclaim: the agreement's effective window
is now actually checked against the period, using the dates on Finance's
`financial_periods` row where one exists, and falling back to "effective as of
today" where none does — because `period_code` has no repository-wide format, and
inventing a parser for it would make MCM the author of someone else's calendar.

One documented precondition remains **unimplemented and is no longer claimed**:
"the transaction type is permitted for that agreement type". `intercompany_transactions_type_check`
constrains the type to a fixed set, but no agreement-type ↔ transaction-type matrix
exists anywhere in the repository. Pairing them is a transfer-pricing decision
Finance has not made; MCM does not invent it.
**Status:** period lock and effective-window check DELIVERED,
`tests/mcm/intercompany-period-lock.test.ts` (6 tests, fixtures idempotent because
`intercompany_reconciliation_runs` is append-only even to the admin role — which
is the immutability control proving itself). Agreement↔type matrix NOT BUILT —
DECIDED, needs a Finance policy decision, not code.

### 2.7 Consolidation had records and controls but no engine — **CLOSED, with four named limits**

`consolidation_runs`, `consolidation_entities` and `consolidation_adjustments`
exist with their controls: reviewer ≠ preparer by CHECK, a `REVIEWED` run cannot
be revised back to `DRAFT`, an applied adjustment is frozen, a `UNAVAILABLE`
entity needs a reason.

The computation now exists: `prepareConsolidationRun` translates each member's
Finance OS trial balance into the reporting currency, splits the non-controlling
interest by the registry's effective-dated percentages, and proposes the elimination
of intercompany balances **only** where both sides have authorised them. It writes
the run, one row per candidate entity (included or excluded, each with its reason),
and the proposals as `applied = false` — a preparer approves them elsewhere, and
nothing here touches `journal_entries` or `journal_lines` (CAP_POSTING LOCKED).

Design decisions a reviewer should look for, because each is a refusal to be clever:

* **Arithmetic and access are separate modules.** `src/lib/mcm/consolidation-core.ts`
  owns every calculation and every refusal rule and imports nothing that touches a
  database; `src/lib/mcm/consolidation.ts` reads state and writes governed records.
  The reason is not tidiness: ledger rows cannot be committed in a test at all (see
  below), so arithmetic is only testable if it needs no ledger. Proving 29 behaviours
  through an adapter against permanently empty tables would have meant proving nothing.
* **No trial balance ⇒ EXCLUDED, never nil.** A member with no journal lines for the
  period is reported `UNAVAILABLE` with the reason "no journal entries for period …"
  and stays out of the totals. Consolidating an absent ledger as zero is the exact
  failure this capability exists to prevent; a `null` total and `dataState = PENDING`
  are what an unfinished consolidation looks like, and the surfaces already render that.
* **No rate ⇒ no figure.** FX rates are read from `fx_rates`, the governed store, and
  nowhere else. `fx_rates` has no write path (P4 unratified) and zero rows, so a
  cross-currency member is reported as a gap rather than translated by a rate the
  engine made up. `deriveRateFromBalances()` returns `never` and is not called; no
  code path defaults a rate to 1. A caller cannot supply one either: the prepare
  schema is `.strict()`, so `fxRate`, `rate`, `rates`, `rateSet`, `fxRates` and a
  free-text `source` are all rejected with 422 — asserted directly in the suite.
* **Sub-minor precision is refused, not rounded.** The ledger is `numeric(18,2)` in
  **major** units while the consolidation columns are `numeric(38,0)` in **minor**
  units, so the scale factor comes from `CURRENCY_EXPONENTS` per currency — a blanket
  ×100 would be a 100× error on TZS and JPY. A half-tigwe cannot be represented, so
  the member is excluded with a stated reason; silently rounding a real ledger is a
  decision about someone else's numbers.
* **The run records the attempt even when nothing could be consolidated.** Totals are
  then written `null`, never `"0"`.

**Consequence of the limits below:** no `REVIEWED` run exists in this environment,
because no run can be completed without a ledger and a rate authority. Every MCM
surface therefore renders `UNAVAILABLE` for group figures, which is the truth.

**Four limitations the code states itself** — `CONSOLIDATION_LIMITATIONS`, returned in
every preparation response and recorded verbatim in the audit entry, and deliberately
*not* reported as gaps a preparer could close:

| Code | Statement |
|---|---|
| `INVESTMENT_ELIMINATION` | The parent's investment in the subsidiary is not eliminated against the subsidiary's equity. `consolidation_adjustments` can carry such an entry with a source reference and an approver, but nothing in MCM derives its amount, so the run's equity total double-counts the investment. The cost is named rather than hidden, because a reader who does not know the gap reads the equity total as complete. |
| `UNREALISED_PROFIT` | No intra-group trading profit or loss is eliminated — not inventory, not fixed assets, not management-fee accruals. Intercompany balances are eliminated; margins inside those balances are not. |
| `POSTING` | This capability writes no journal entry. Adjustment rows are proposals with `applied = false`; approving one does not post it, because CAP_POSTING is LOCKED and Finance OS owns the ledger. |
| `RATE_INTAKE` | No governed FX rate can be recorded: `fx_rates` is a read-only reference table with no write path in this capability. Until that authority exists, every run whose members' currencies differ from the reporting currency will report `FX_RATE` gaps rather than translated figures. This limitation is the reason the gaps exist and is stated so that it is not mistaken for a data-entry failure. |

**Status:** engine DELIVERED — `tests/mcm/consolidation-core.test.ts` (30 tests, pure
arithmetic, no DB) and `tests/mcm/consolidation.test.ts` (14 tests: adapter, governed
write, four-eyes review, audit and event rows against real Postgres). Nothing is
"rolled back" in the second file and nothing needs to be: its fixtures are token-keyed
`legal_entity_profiles`, `financial_periods` and one synthetic reviewer, removed before
and after, and it writes **no ledger row at all**, which is why the finance suites' global
`count(*) = 0` assertions stay green. The transport boundary is asserted over HTTP in
`tests/api/mcm-consolidation-http.test.ts` (8 tests against the built server); it makes
one preparing POST per case rather than a loop, because `mcm:consolidation.prepare` is
limited to 6 per minute and hammering it would test the limiter instead of the contract.
A member's ledger is read only when the preparer ALSO holds `finance:ledger.read`, and
one test proves that by stripping the permission from a real seeded principal.
The four limits above are NOT BUILT — the first two by scope, `POSTING` by a locked
capability, `RATE_INTAKE` by an unratified authority.

### 2.8 Reference configuration was writable by the runtime role — closed

`countries` and `jurisdictions` are read-only to `beyu_runtime`. The new MCM
reference tables (`fx_rates`, `mcm_country_profiles`, `mcm_integration_contracts`)
were designed the same way from the start: SELECT-only grants plus restrictive RLS
policies that refuse INSERT/UPDATE/DELETE outright.

**Consequence:** a country's legal configuration, an FX rate and an integration's
verification state cannot be changed by the application at all. They are operator
acts.

### 2.9 DELETE was permitted on ten MCM tables — closed by forward migration 0077

0076's restrictive hardening block covered only the unambiguously immutable
evidence tables. Reviewing the resulting `pg_policies` state (rather than trusting
the migration's intent) found DELETE still permitted on eight of them, plus two
that allowed a silent un-verification.

**Delivered:** migration 0077 adds restrictive no-delete to
`legal_entity_profiles`, `entity_relationships`, `mcm_statutory_filings`,
`intercompany_agreements`, `consolidation_entities`, `consolidation_adjustments`,
`mcm_capital_allocations`, `mcm_module_links`; freezes a `VERIFIED` profile
against reverting its evidence pointer to null; and forbids UPDATE on
`ownership_validations`. 0076 was **not** edited — it is checksummed in
`BEYU_MIGRATIONS`, and rewriting an applied migration would corrupt that record on
every existing environment.

The three **operating** registers (`mcm_procurement_register`,
`mcm_asset_register`, `mcm_project_portfolio`) keep DELETE on purpose. They hold
forward-looking records, not evidence; a mis-keyed draft captured before anything
references it must be withdrawable, or the only remedy left is a falsified row.

### 2.10 No Tanzania jurisdiction configuration existed — **DECIDED + GAP**

The mission requires Tanzania support including BRELA, TRA, NSSF and WCF, and
explicitly forbids invented APIs. No verified machine interface to any of these
four authorities exists in this repository.

**Delivered:** the controlled manual/document-based workflow they require —
`mcm_statutory_filings` with `filing_mode` of `MANUAL` or `DOCUMENT_BASED`, the
authority's own reference, the filing date, the evidence document and the
authenticated submitter. A `VERIFIED_API` filing additionally requires the
authority's acknowledgement reference, so the mode cannot be used to dress up a
claim.

**Not delivered:** a seeded Tanzania country-profile row naming BRELA/TRA/NSSF/WCF.
Seeding those names without a verified interface would present an integration that
does not exist. The configuration path (`POST /api/v1/mcm/countries`, operator
privileged) is implemented and tested; the data is a governance decision, not an
engineering one.
**Status:** workflow DELIVERED; jurisdiction data NOT BUILT — DECIDED.

### 2.11 NOELIA had no MCM tool — **GAP CLOSED for reads; actions still have no tool path**

Ten governed read-only tools are now registered in the ONE canonical Noelia
surface (`src/lib/noelia/mcm-tools.ts`): `mcm.portfolio.hierarchy`,
`mcm.company.financial_snapshot`, `mcm.intercompany.position`,
`mcm.consolidation.status`, `mcm.risk_and_compliance.overview`,
`mcm.ownership.structure`, `mcm.jurisdiction.coverage`, `mcm.module_rollup`,
`mcm.governance.overview`, `mcm.integration.health`.

They are adapters, not a second read path. Every one of them delegates to
`src/lib/mcm/read-services.ts`, so `visibleEntities()` stays the only place the
entity boundary is decided, and no tool re-derives tenant, entity, clearance or
classification. Each carries the full governed contract — `sideEffects: NONE`,
idempotent, a timeout and retry policy, `NOELIA_TOOL_INVOKED` audit, and a
permission that already existed in the catalog. Nothing was widened to make the
tools work: the frozen inventory in `tests/noelia/agent-surface-guard.test.ts`
was extended deliberately and by review, which is that test's stated purpose.

Two properties are asserted in `tests/mcm/noelia-tools.test.ts` rather than
claimed here:

* **Honest data states.** A figure the caller may not see is returned as a
  RESTRICTED boundary naming the missing capability; a figure with no row is
  UNAVAILABLE with the period it looked at. Neither is ever rendered as zero, and
  an absent consolidation run is reported as "consolidation has not been
  performed", never as a consolidated group. `mcm.governance.overview` and
  `mcm.ownership.structure` check the section capability themselves because
  those two services answer with an empty set for *both* "nothing recorded" and
  "you may not see it" — the tool refuses to collapse that distinction.
* **No leak across entity scope.** A principal scoped to one company sees exactly
  one company in the hierarchy, and no MCM tool may mention any other entity's
  code, id or legal name anywhere in its payload.

**Still deliberately absent:** there is no tool path for any MCM *action*.
Company creation, lifecycle transitions, ownership validation, statutory filing,
intercompany authorization and reconciliation, consolidation preparation and
review, and capital proposal and approval remain on their own routes with their
own approval chains. Reads need no approval; those do. Where a read shows a human
must act, the answer sets `humanReviewRequired` and says why — it does not
offer to do it.
**Status:** read advisory access DELIVERED; action tools NOT BUILT — DECIDED.

### 2.12 Sector OS data was not surfaced through contracts — **GAP**

`mcm_integration_contracts` declares owner, direction, exposed fields,
classification ceiling and failure policy (default `FAIL_CLOSED_UNAVAILABLE`), and
the runtime role cannot insert or update a contract — verification is a human,
privileged act.

What is not built is the *call*: `/os/mcm` does not surface HEALTH_OS, FINANCE_OS,
AGRICULTURE_OS or UJENZI_OS figures through those contracts. Sector numbers are
absent from MCM rather than duplicated from a shortcut read.
**Status:** contract infrastructure DELIVERED; sector data surfacing NOT BUILT — GAP.

### 2.13 MCM mutations have no in-product forms — **GAP**

Every mutation exists as an authorized API route with a full test-visible
contract. The command centre is read-only.

**Why:** the high-risk acts (capital approval, intercompany authorisation,
lifecycle termination) require a four-eyes approval surface. Shipping a one-click
form for them would make a control that is real in the service layer look cosmetic
in the UI — the worst of both outcomes.
**Status:** NOT BUILT — GAP.

---

## 3. What is delivered, and how it is proven

| Capability | Evidence |
|---|---|
| 20 MCM tables, tenant-scoped RLS, FORCE RLS | `drizzle/0076_multi_company_management.sql`; fingerprints `ead39a5a…` → `e74dcd55c12f12943a070cd0e8652205` |
| Restrictive DELETE hardening + verified-profile immutability | `drizzle/0077_mcm_rls_hardening.sql`, applied; 10 restrictive policies confirmed in `pg_policies` |
| Runtime-role isolation (read, insert-forgery, update, delete, append-only) | `tests/mcm/rls-isolation.test.ts` — 10/10 passing **as `beyu_runtime`**, non-superuser, non-bypassrls |
| Runtime privilege classification | `npx tsx scripts/audit-runtime-privileges.ts` → `"failures": []` |
| Figure provenance discipline; no fabricated zeros | `tests/mcm/model.test.ts` |
| Ownership rules R1–R7 incl. human-review and circular refusal | `tests/mcm/model.test.ts` |
| Closed lifecycle state machine | `tests/mcm/model.test.ts` |
| Dual-authorisation four-eyes, DB-enforced | CHECK `intercompany_transactions_dual_authorization_check`, asserted in the RLS suite |
| Consolidated reviewer independence | CHECK `consolidation_runs_review_check`, asserted in the RLS suite and prepared/reviewed for real in `tests/mcm/consolidation.test.ts` |
| Consolidation arithmetic: translation, NCI, elimination eligibility, refusal rules | `tests/mcm/consolidation-core.test.ts` — 29 tests |
| Governed consolidation write (run + entities + proposals + audit + event, one transaction) | `tests/mcm/consolidation.test.ts` |
| Caller cannot supply an FX rate | strict prepare schema, asserted in both `tests/mcm/consolidation.test.ts` and `tests/api/mcm-consolidation-http.test.ts` |
| Governed mutations with audit + event in one transaction | `src/lib/mcm/services.ts` |
| Type integrity | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` clean |
| Navigation integration without a new OS | `src/app/os/capabilities.ts`; `tests/frontend/control-plane-ia.test.ts` 22/22 |

---

## 4. Summary

The **foundation is complete and enforced at the database**: registry completion,
lifecycle with evidence, own/instrument-level ownership *validation*, effective-dated
relationship modelling, country-aware filing workflows, intercompany with
dual authorisation and reconciliation, consolidation records with independent
review, capital decisions requiring resolutions, entity-aware module links, a
governed read surface, and runtime-role-proven isolation.

The consolidation **computation is now delivered** (§2.7): it translates, allocates
non-controlling interests and proposes eliminations, and it refuses — rather than
inventing — every input it was not given. What remains incomplete in the computation
and interaction layers: the investment and unrealised-profit eliminations, sector-os
data contracts in use, in-product mutation forms, and any NOELIA *action* tool
(NOELIA read access is delivered in §2.11; the actions are refused by design). The
financial-period lock for intercompany is now enforced (§2.6). Each is recorded above
with its consequence, and each fails closed rather than fabricating a figure or a
permission.

Six deferred items are all cases where the missing thing is a *decision* (which
authority to name, which approval surface to build) or a *computation* whose
absence is visible as `UNAVAILABLE`. None of them is a case where a placeholder was
substituted for a fact.
