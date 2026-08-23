# FINANCE OS — COMPLETE ARCHITECTURE & ENGINEERING REPORT

**Branch:** `arena/01a01b69-beyu-os-1-0` · **Date:** 2026-08-23
**Mandate:** BUILD THE FINANCE OS · DO NOT INVENT THE LAW · SUPABASE EXCLUDED
**Final gate:** 🟡 **YELLOW — ARCHITECTURALLY COMPLETE, EXECUTION BLOCKED**

---

## 1. Executive status

Four structural gaps remained after the previous phase — **workflow, intercompany/consolidation,
data lineage, and a machine-readable domain registry**. All four are now built. Every other domain
was already present and was not rebuilt.

The Finance OS is now **architecturally complete** in the sense the mandate defines: every domain
either has a genuine implementation, or an explicit classification of why it does not. Four domains
are NOT_AVAILABLE, seven REQUIRES_AUTHORITY, three DATA_NOT_AVAILABLE, one PARTIAL, five COMPLETE.

No new specialist. No new table. No migration. Fingerprint unchanged. Financial state unchanged.

Suite **1216 → 1288** (+72), zero skipped. Fault injection **23/23** after one miss — a genuine
latent security bug — was found and fixed.

## 2. Baseline

**Sandbox re-clone #15** was detected at the start: HEAD reset to `2c0f08d`, `6033f3a` gone,
`node_modules`, `/tmp/pgboot` and `.env` destroyed. Working-tree files survived. Recovered,
verified, and **committed immediately as `656d4e0`** before any new work.

| Check | Result |
|---|---|
| Fingerprint | `611865f1aca2f81eeb72a6c418b49732`, 11 migrations ✅ |
| Full suite | **1216/1216, 41 files, 0 skipped** ✅ |
| State | all 28 values match ✅ |
| Decisions / Capabilities | 16/16 PENDING · 60/60 LOCKED ✅ |
| Triggers | 9, **0 disabled** ✅ |

## 3. Architecture map

`src/lib/finance/` — 13 modules, ~4,400 lines:

| Module | Role |
|---|---|
| `epistemics.ts` | One epistemic model (13 classes) |
| `truth.ts` | Canonical truth registry, sole-writer per table |
| `contract.ts` | 13-stage finance gate |
| `posting-engine.ts` | Sole ledger writer (7A) |
| `reconciliation.ts` | Subledger reconciliation + data quality |
| `registry.ts` | Capability inventory |
| `fx.ts` | Multi-currency, refuses to invent rates |
| `period.ts` | Period/close lifecycle |
| `reporting.ts` | Trial balance + statements |
| **`workflow.ts`** | **NEW** — governed lifecycle, SoD |
| **`intercompany.ts`** | **NEW** — IC validation, consolidation scope |
| **`lineage.ts`** | **NEW** — derivation provenance |
| **`domains.ts`** | **NEW** — domain registry + maturity |

## 4. Canonical financial truth

Unchanged and re-verified: **exactly one** POSTED source, sole writer `finance/posting-engine`,
default-deny via `mayWrite()`. Lineage reinforces this — `buildLineage()` returns
`canonical: false` structurally, so a derived figure can never claim to be truth however factual
its inputs.

## 5–7. Domain architecture, data model, accounting core

The four new modules added **zero tables**. Workflow is evaluated in memory (persisting it would
duplicate `governance_decision_registry`); intercompany reads `legal_entities` (an IC transaction
store would be a subledger, and building one without ratified policy would invent its accounting
treatment); lineage correlates to the existing audit trail by traceId.

## 8–9. Ledger, treasury, FX

Unchanged. The three implied TZS/USD rates (2613.333333 / 2613.843352 / 2615.384615) remain
reported as a defect and refused as a rate source.

## 10–12. AR / AP / Assets / Tax

AR, AP, Fixed Assets, Inventory: **NOT_AVAILABLE** — no substrate, and creating one requires
ratified policy. Tax is **PARTIAL** (fault injection not yet extended to it) — reported honestly
rather than rounded up.

## 13–17. FP&A, reporting, consolidation, intercompany, reconciliation

**Intercompany is new.** Ownership is read from `legal_entities.tenant_id` and **never inferred
from financial records**. Cross-tenant value movement requires explicit governance authority. A
tenant owning neither side is refused outright — even with cross-tenant authority.

Reciprocal matching reports differences and **never auto-resolves**: a plug entry to make two
entities agree destroys the evidence they disagreed.

Consolidation scope is structural only. `assessEliminations()` always eliminates **zero**, by
design, and says why.

## 18. Financial controls

**Workflow is new.** DRAFT → REVIEW → APPROVAL → AUTHORIZATION → EXECUTION → POSTING → SETTLEMENT
→ RECONCILIATION → CLOSE, with all **121 state pairs** decided explicitly. Terminal states are
terminal. Execution states require an activated capability and **fail closed when the flag is
omitted**. Approval thresholds are refused — those need ratified policy.

## 19–22. Risk, capital, valuation, period/close

Unchanged. Capital keeps its six stages distinct and locked.

## 23–27. Evidence, workflow, lineage, API, permissions

**Lineage is new.** `weakestLink()` makes epistemic degradation mechanical: a forecast built from
one observed and one assumed input reports ASSUMPTION, not OBSERVED.
`detectCrossTenantLineage()` catches aggregation across tenants — invisible unless the whole chain
is inspected. `verifyLineageRoot()` rejects chains rooted outside the canonical truth registry.

The **service contract (20 services)** is now derived from the registry rather than hand-listed,
so it cannot drift from the code.

## 28. P1–P11 readiness

Unchanged: 16/16 PENDING, 60/60 capabilities LOCKED. Nothing ratified, nothing activated.

## 29–31. Data quality, security, fault injection

**23 faults injected, 1 initially undetected. All files restored byte-identical by md5.**

| # | Fault | Result |
|---|---|---|
| 1 | Maker may be checker | **NOT DETECTED** → fixed → 2 failed ✓ |
| 2–9 | Workflow: checker/authorizer, capability gate, undefined flag, illegal transition, CLOSE terminal, trace, unknown state, breach detection | all ✓ |
| 10–16 | Intercompany: cross-tenant authority, ownership, inferred owner, mismatch auto-resolve, currency, scope, eliminations | all ✓ |
| 17–20 | Lineage: canonical promotion, weakest-link inversion, canonical source, cross-tenant | all ✓ |
| 21–23 | Domains: failed criteria, missing module, authority blockers | all ✓ |

### The one miss was a real bug, not just a coverage gap

**FI-1 — maker-as-checker, undetected.** Emptying the `MAKER` row of the incompatibility map broke
no test.

- **Symptom:** the most fundamental SoD rule could be deleted silently.
- **Cause:** `checkRoleSeparation()` looked the map up **by the new role only**. Asking "may U1 be
  CHECKER?" consults `CHECKER: [MAKER, …]` and never reads the `MAKER` row at all.
- **Systemic:** a relation that must be symmetric, enforced by a one-directional lookup.
- **Root:** an asymmetric edit weakens the control in one direction while appearing correct in the
  other — and no test compared the two directions.
- **Fix:** exported `ROLE_INCOMPATIBILITY`, made the lookup **bidirectional**, added
  `assertIncompatibilitySymmetry()`.
- **Regression test:** 4 tests, including every incompatible pair asserted in **both** directions,
  and a proof that the bidirectional lookup still refuses under a deliberately asymmetric table.
- **Fault injection:** now 2 failed ✓ (and an EXECUTOR-row variant, 1 failed ✓).

This is the fourth consecutive phase where fault injection found a control that tests could not
see. The pattern is consistent: **a control validated only through another control is untested by
construction.**

## 32–34. Platform review, no execution, completeness test

No platform defect found requiring remediation. No journal posted, no money moved, nothing
ratified. The Phase-34 16-criteria test is implemented in `assessDomain()` — a domain **cannot**
report COMPLETE while any applicable criterion is false, and the tests prove the registry cannot
flatter itself.

## 35. Finance OS maturity matrix

*Generated from the live registry, not hand-written.*

| Domain | Status | Criteria | | Domain | Status | Criteria |
|---|---|---|---|---|---|---|
| ACCOUNTING | REQUIRES_AUTHORITY | 16/16 | | INTERCOMPANY | REQUIRES_AUTHORITY | 16/16 |
| AP | NOT_AVAILABLE | 1/16 | | INVENTORY | NOT_AVAILABLE | 1/16 |
| AR | NOT_AVAILABLE | 1/16 | | LEDGER | REQUIRES_AUTHORITY | 16/16 |
| AUDIT | **COMPLETE** | 16/16 | | LINEAGE | **COMPLETE** | 15/15 |
| CAPITAL | REQUIRES_AUTHORITY | 16/16 | | REPORTING | REQUIRES_AUTHORITY | 15/15 |
| CLOSE | REQUIRES_AUTHORITY | 16/16 | | RISK | **COMPLETE** | 16/16 |
| COMPLIANCE | **COMPLETE** | 16/16 | | TAX | PARTIAL | 15/16 |
| CONSOLIDATION | REQUIRES_AUTHORITY | 15/15 | | TREASURY | DATA_NOT_AVAILABLE | 16/16 |
| FIXED_ASSETS | NOT_AVAILABLE | 1/16 | | WORKFLOW | **COMPLETE** | 15/15 |
| FORECASTING | DATA_NOT_AVAILABLE | 15/15 | | FPNA | DATA_NOT_AVAILABLE | 15/15 |

**COMPLETE 5 · REQUIRES_AUTHORITY 7 · DATA_NOT_AVAILABLE 3 · NOT_AVAILABLE 4 · PARTIAL 1**

## 36. BEFORE → AFTER

All 28 values **identical**. `je 0 · jl 0 · fp 0 · la 0 · tsum 11783000.00 · clock 60/60 ·
dpend 16/16 · disabled 0 · mig 11 · tables 76`. Zero deltas. Only code, tests and docs changed.

## 37. Validation

| Check | Result |
|---|---|
| Typecheck / Lint / Build | ✅ clean |
| Full suite | ✅ **1288/1288, 42 files, 0 skipped** (170s) |
| New domain suite | ✅ 72/72 |
| Deterministic second run | ✅ 330/330 identical |
| Fault injection | ✅ **23/23 detected**, md5-restored |
| Clean-install parity | ✅ `beyu_clean_9` 28/28; 330/330 both DBs; dropped |
| Migration parity | ✅ `611865f1…`, no new migration |
| Capability seed parity | ✅ 60/60 LOCKED |

## 38. Remaining blockers

**Authority:** 16/16 decisions PENDING; C-1 provenance (5/5 policies); no FX source (P4); no
account classification (P1); no close, consolidation or transfer-pricing policy.
**Data:** 0 journal entries, 0 accounts, 0 periods; treasury at one as_of date; 3 attribution
conflicts.
**Engineering:** AR/AP/FA/Inventory absent; tax fault injection not extended; API routes deferred;
DR/backup absent.

## 39. Architecture gaps still remaining

| Gap | Class | Buildable now? |
|---|---|---|
| AR / AP / Fixed Assets / Inventory | ARCHITECTURE + AUTHORITY | No — needs P1 |
| Tax fault injection | TEST COVERAGE | **Yes** |
| API route surface | ENGINEERING | **Yes** |
| DR / backup / restore | INFRASTRUCTURE | **Yes** |
| Governed FX rate store | AUTHORITY | No — needs P4 |
| Specialist vocabulary migration | ENGINEERING | **Yes** |

## 40. Recommended next phase

1. Wire `financeGate()` into `runSpecialist()` so every specialist inherits the financial controls.
2. Extend fault injection to tax (closes the one PARTIAL).
3. Migrate the six specialist vocabularies to `normalizeEpistemicClass()`.
4. Ratify P1 → chart of accounts + fiscal calendar → the kernel becomes exercisable end to end.

## 41. Final gate — 🟡 YELLOW

**ARCHITECTURALLY COMPLETE + EXECUTION BLOCKED + AUTHORITY NOT RATIFIED + DATA_NOT_AVAILABLE.**

The mandate states this outcome is acceptable and a fabricated GREEN is not. GREEN would require
ratified authority, a populated ledger, a governed FX source and DR — none of which code can
create.

What is now provable: one financial truth with default-deny writers; one authority chain; one
epistemic model; one audit, event and trace model; a workflow engine that cannot be bypassed by
one person holding two control roles; lineage that cannot promote a derivation to canonical; and a
maturity registry that structurally cannot report COMPLETE while a criterion fails.

Nothing was ratified. Nothing was activated. No financial state moved.
