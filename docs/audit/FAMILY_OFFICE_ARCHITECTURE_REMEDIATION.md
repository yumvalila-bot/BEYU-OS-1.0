# Family Office Capital & Wealth — Architecture-Integrity Remediation

**Date:** 2026-09-09
**Branch:** `arena/01a085cf-beyu-os-1-0`
**Trigger:** Full repository suite reported 13 failures, all in architecture guard
tests, after the Family Office capital & wealth integration reached local green
(262 tests / 11 files).

The guards are authoritative. Nothing in this document weakens, skips, deletes or
disables a guard. Where a guard's own documented attribution procedure applies, that
procedure is followed; where the implementation is wrong, the implementation is
changed.

---

## 1. The 13 failures, grouped by root cause

Five distinct root causes account for all 13 failures.

### RC-A — Table-name substring collision (4 failures)

The specialist guards prove "creates no second truth" by listing tables whose names
*contain* a substring, then pinning the exact expected set. The new `family_*`
tables contain those substrings without being a second truth.

| # | Guard file | Test | Expected | Received | Implicated tables |
|---|---|---|---|---|---|
| 1 | `tests/specialist/treasury.test.ts` | defines no tables of its own | `["treasury_positions"]` | +`family_cash_flow_items` | `%cash%` |
| 2 | `tests/specialist/compliance.test.ts` | defines no tables of its own | 6 names | +`family_obligations`, +`family_obligation_covenants` | `%obligation%` |
| 3 | `tests/specialist/audit-intel.test.ts` | defines no tables of its own | 9 names | +`family_regulatory_events` | `%event%` |
| 4 | `tests/specialist/forecast.test.ts` | persists nothing, so no historical forecast can be overwritten | `["structure_scenarios"]` | +`family_scenario_models`, +`family_scenario_results` | `%scenario%` |

**Verdict: guard procedure, not guard weakening.** Each of these guards already
carries an explicit, in-repo precedent for exactly this situation — exact-name
exclusion *with an attribution comment*:

- `audit-intel`: `and table_name <> 'payment_webhook_events'` — "an ingestion ledger
  owned by the payments domain (drizzle/0028), not an audit ledger; excluded by exact
  name so this guard still fails if the audit module itself ever defines a table."
- `audit-intel`: `and table_name not like 'agriculture_%'` — "Agriculture OS event
  tables are domain tables … not audit ledgers (drizzle/0031)."
- `compliance`: attributed list including the three `foundation_*` tables — "the
  three governed Foundation OS compliance tables from 0035_foundation_os (a Sector OS
  compliance registry under BEYU OS governance — attributed here, still exact)."

The guards' *assertion* is that the specialist module defines no table of its own.
Attributing a foreign domain's table preserves that assertion exactly. The exclusion
is by exact name, so the guard still fails if the specialist module ever defines one.

### RC-B — Migration count pin (5 failures)

| # | Guard file | Test | Expected | Received |
|---|---|---|---|---|
| 5 | `tests/specialist/treasury.test.ts` | adds no migration | 36 | 37 |
| 6 | `tests/specialist/risk.test.ts` | adds no migration | 36 | 37 |
| 7 | `tests/specialist/compliance.test.ts` | adds no migration | 36 | 37 |
| 8 | `tests/specialist/audit-intel.test.ts` | adds no migration | 36 | 37 |
| 9 | `tests/specialist/forecast.test.ts` | adds no migration and no table | 36 | 37 |

**Verdict: the guards document their own remediation.** Every one of the five carries
the identical instruction:

> "The count stays an exact pin: the specialist module under test still adds no
> migration of its own, and any further migration must be attributed here before the
> pin moves."

`0037_family_office_capital_wealth` is a new migration. Per each guard's stated
procedure it must be **attributed in the comment** and the pin moved. The preceding
history shows this is the established path: the pin was moved with attribution for
0016, 0019–0029, 0033, 0034 and 0035. The assertion under test — "this specialist
module adds no migration of its own" — is unchanged.

### RC-C — Phase 3A dormancy violation (1 reported failure, **3** real violations)

| # | Guard file | Test | Implicated file |
|---|---|---|---|
| 10 | `tests/family/phase3/boundaries.test.ts` | no non-test src file imports Phase 3A infrastructure (dormant layer) | `src/lib/family/office/capital-wealth/obligations.ts` |

**Verdict: REAL implementation violation — and worse than reported.**

The guard scans every non-test file under `src/` for `/family[\\/]phase3/` and stops
at the first hit. It reported only `obligations.ts`, which is a **doc comment**. Two
further files were never reached because the loop aborted:

| File | Kind | Severity |
|---|---|---|
| `src/lib/family/office/capital-wealth/capital-allocation.ts:30` | **real import** `import { familyError } from "../../phase3/errors"` | hard violation |
| `src/lib/family/office/capital-doctrine.ts:34` | **real import** `import { familyError } from "../../phase3/errors"` | hard violation |
| `src/lib/family/office/capital-wealth/obligations.ts:23` | doc comment naming the path | reported |

The rule exists because Phase 3A is a **dormant, unratified** layer. A
production-surface domain depending on it would activate code that has not been
ratified — precisely the drift the guard prevents. This is the most serious of the
five causes.

### RC-D — `family:` permission namespace collision (2 failures)

| # | Guard file | Test | Expected | Received |
|---|---|---|---|---|
| 11 | `tests/family/phase3/boundaries.test.ts` | is exactly the five existing permissions (no additions, no wildcards) | 5 codes | 32 codes |
| 12 | `tests/family/phase3/boundaries.test.ts` | no family permission code implies legal, financial, or AI authority | no forbidden token | `familyoffice:capital.postmortem` contains `post` |

**Verdict: REAL implementation violation.** The guard's intent is explicit and
unchanged: the `family:` namespace belongs to the Family Institution layer and is
frozen at five permissions while that layer is unratified. Adding 27 capital-domain
permissions to it asserts authority the institution layer does not hold. The capital
domain must live in its **own** namespace. (The `post` token hit is a substring false
positive for "post-mortem", but it is inside the frozen namespace and disappears with
the move.)

### RC-E — Permission catalogue parity (1 failure)

| # | Guard file | Test | Expected | Received |
|---|---|---|---|---|
| 13 | `tests/identity/identity-graph.test.ts` | the seeded role_permissions mirror matches ROLES | `drifts: []` | `ok: false` |

**Verdict: REAL implementation defect.** `assertPermissionCatalogParity()` compares
`ROLES` in `src/lib/constants.ts` against the seeded `role_permissions` table. Nine
roles and their permissions were added to `ROLES` without re-seeding, so the mirror
drifted. The fix is to re-seed — never to relax the parity check.

---

## 2. Phase 4 — duplication check

Every new Family Office component was classified. No canonical subsystem is
duplicated.

| New component | Disposition | Rationale |
|---|---|---|
| `src/lib/family/office/capital-wealth/*` (12 modules) | **KEEP** | Pure engine, new domain. Reuses `applyBasisPoints` from `waterfall-engine-v2`. |
| `src/lib/family-office-capital-service.ts` | **REFACTOR** | Error taxonomy must not depend on Phase 3A. |
| `src/db/schema/family-office-capital.ts` (23 tables) | **KEEP** | New domain data; no overlap with the 273 existing tables. Money is `numeric(18,2)`. |
| `drizzle/0037_family_office_capital_wealth.sql` | **KEEP** | Forward-only, idempotent, RLS on all 23 tables. |
| `src/app/api/v1/family-office/*` (17 routes) | **KEEP** | Namespace was empty; no canonical route conflicts. |
| `src/app/os/family/capital/page.tsx` | **KEEP** | Sub-page; `/os/family` untouched. |
| `src/lib/family/office/noelia-service.ts` + `noelia-tools.ts` | **KEEP** | Registers on the canonical registry via `registerFamilyOfficeTools`. Not a second identity or runtime. |
| 27 permissions + 9 roles | **REFACTOR** | Move out of the frozen `family:` namespace (RC-D). |

No second Family Office, Finance system, accounting engine, governance engine,
identity system, audit chain, Noelia identity or HIVE runtime was created.

## 3. Source-of-truth matrix after remediation

| Concern | Owner | Preserved? |
|---|---|---|
| Identity | canonical BEYU Identity | yes — untouched |
| Authorization | RBAC / ABAC / RLS | yes — `guarded()`, `tenantScopeIds`, RLS policies |
| Governance | Governance Execution Engine | yes — `resolutions`, committee refs |
| Audit | canonical audit chain | yes — `withAuditTransaction` |
| Accounting | Finance OS | yes — `AUTHORITATIVE_ACCOUNTING_OWNER = "FINANCE_OS"`, `authoritativeAccounting: false` |
| AI identity / runtime | Noelia / HIVE | yes — tools registered on the canonical registry |
| Posting | Finance OS only | yes — `CAP_POSTING` remains fail-closed |

## 4. Remediation plan

1. **RC-C** — remove the two Phase 3A imports; give the capital domain its own error
   taxonomy; reword the doc comment.
2. **RC-D** — move all 27 permissions and 9 roles from `family:*` to a distinct
   namespace; update routes, UI, Noelia tools and tests.
3. **RC-E** — re-seed so `role_permissions` mirrors `ROLES`.
4. **RC-A** — attribute the four colliding table names by exact name, following the
   in-repo precedent, assertions unchanged.
5. **RC-B** — attribute the new migration in each of the five pins and move the pin.
6. Re-run: affected guards → Family Office suite → typecheck → full suite → build.

---

## 5. Remediation outcome

Every root cause was fixed in the implementation, or via the guard's own documented
attribution procedure. **No guard was weakened, deleted, skipped or disabled.**

| Cause | Fix applied | Guard result |
|---|---|---|
| RC-A (4) | Attributed the 5 colliding `family_*` tables by exact name, following each guard's existing precedent. Assertions unchanged. | 4/4 pass |
| RC-B (5) | Attributed the new migration in each of the five pins and moved the pin as each guard's comment directs. | 5/5 pass |
| RC-C (1 reported / 3 real) | Removed both real Phase 3A imports; added `capital-wealth/errors.ts` with the domain's own taxonomy; reworded the doc comment. | pass |
| RC-D (2) | Moved all 27 permissions from the frozen `family:*` namespace to `familyoffice:*`. The five canonical permissions are untouched. | 3/3 pass |
| RC-E (1) | Re-seeded so the `role_permissions` mirror matches `ROLES`. | pass |

### Verification evidence

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | clean |
| Lint (`eslint .`) | 0 errors (1 pre-existing `<img>` warning in an untouched file) |
| Production build (`next build`) | success — all 17 API routes and both pages compiled |
| `npm run verify` | PASS on all 7 steps (typecheck, lint, build, migrate fingerprint, full suite, determinism re-run, finance regression) |
| Full suite, no server | 150 files / 2891 tests passed, 0 failed |
| Full suite with production server | **165 files / 3044 tests passed, 0 failed** (the 153 that self-skip without a live server now ran) |
| Migration idempotency | fingerprint `b8f51b1ae7387ced6f538c38d7d70b70` unchanged on re-run |
| Secret scan | clean — 1530 tracked files |
| RLS / money typing | 23/23 tables RLS-enabled with a `tenant_isolation` policy; 0 float columns; 49 numeric money columns |
| Runtime role | `beyu_runtime`: `rolsuper=false`, `rolbypassrls=false` |

### New test added during remediation

`tests/security/family-office-rls-isolation.test.ts` (18 tests) — adversarial
cross-tenant proof for the new tables, using the non-superuser runtime role:

- tenant A cannot READ tenant B's rows, and the row is proven to exist (so the
  denial is real, not an empty table);
- tenant A cannot INSERT a row owned by tenant B (`WITH CHECK` enforcement);
- the same-tenant path still works, proving isolation rather than a blanket lock;
- structural backstops: all 23 tables RLS-enabled with a policy, and no
  floating-point money column anywhere in the `family_*` namespace.

### Migration renumbering on integration with `main`

`main` advanced while this branch was open: PR #46 landed
`drizzle/0036_government_integration_fabric.sql`, claiming the same number this
branch had used. Two migrations cannot share a number, so this branch's migration
was renumbered **0036 → 0037** and its snapshot re-chained
(`prevId` now the government snapshot's `id`). Nothing else about it changed — it
is still forward-only, additive and idempotent.

Both migrations are now attributed in the five specialist pins, which read **38**.
That is the guards' documented procedure applied twice, not a relaxation: each pin
still asserts that the specialist module under test adds no migration of its own.

### Known pre-existing condition (not introduced by this work)

`family_members` and `family_vault_items` have no RLS and no policy. Both are
created by `drizzle/0000_kernel_v1_baseline.sql` and are absent from the base
commit's RLS grants as well — verified against commit `bc629f9`. They are excluded
by exact name in the new structural test with that attribution recorded. Remediating
them requires its own forward migration and is out of scope for this integration.
