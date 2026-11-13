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

### 2.6 Financial periods were not checked for intercompany — **GAP**

`raiseIntercompanyTransaction` documents a period-lock precondition, but the
implementation does not yet query `financial_periods`. The database enforces
agreement currency, agreement party set, positive minor-unit amounts and
idempotency, but a transaction for a `CLOSED` period would currently be accepted.

**Consequence:** intercompany records could reference a locked period.
**Status:** NOT BUILT — GAP. Named here rather than hidden, because the service's
own docstring would otherwise overstate what it enforces.

### 2.7 Consolidation had records and controls but no engine — **GAP (largest)**

`consolidation_runs`, `consolidation_entities` and `consolidation_adjustments`
exist with their controls: reviewer ≠ preparer by CHECK, a `REVIEWED` run cannot
be revised back to `DRAFT`, an applied adjustment is frozen, a `UNAVAILABLE`
entity needs a reason.

What does **not** exist is the computation: translation of each entity's Finance OS
balances into the reporting currency, elimination of intercompany balances, and
the minority-interest split. No totals are populated from any source.

**Consequence:** `consolidation_runs` totals stay `null` and every MCM surface
renders them as `UNAVAILABLE` with a reason. This is the correct fail-closed
behaviour and it is why no consolidated group figure appears anywhere in the
product.
**Status:** NOT BUILT — GAP. Deliberately not faked: a fabricated consolidated
total is the most dangerous possible output of this capability.

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

### 2.11 NOELIA had no MCM tool — **GAP (safe direction)**

No NOELIA tool is registered for MCM. NOELIA therefore cannot read or act on MCM
data at all.

**Consequence:** the mission's advisory requirement is unmet, but the failure
direction is the safe one — an assistant with no MCM access cannot approve a
governance decision, appoint a director, modify ownership or post financially
through MCM, because it cannot reach MCM.
**Status:** NOT BUILT — GAP, deliberately fail-closed. A read-only advisory tool
with mandatory human approval remains to be added.

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
| Consolidated reviewer independence | CHECK `consolidation_runs_review_check`, asserted in the RLS suite |
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

The **computation and interaction layers are not complete**: the consolidation
engine, sector-os data contracts in use, NOELIA advisory access, in-product
mutation forms, and the financial-period lock for intercompany. Each is recorded
above with its consequence, and each fails closed rather than fabricating a figure
or a permission.

Six deferred items are all cases where the missing thing is a *decision* (which
authority to name, which approval surface to build) or a *computation* whose
absence is visible as `UNAVAILABLE`. None of them is a case where a placeholder was
substituted for a fact.
