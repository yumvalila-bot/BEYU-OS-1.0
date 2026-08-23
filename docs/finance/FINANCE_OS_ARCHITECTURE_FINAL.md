# FINANCE OS — COMPLETE ARCHITECTURE & ENGINEERING FINAL REPORT

**Branch:** `arena/01a01b69-beyu-os-1-0` · **Date:** 2026-08-22
**Mandate:** BUILD THE SYSTEM · DO NOT INVENT THE LAW · SUPABASE NOT USED
**Final gate:** 🟡 **YELLOW**

---

## 1. Executive summary

Three architectural rails were missing and are now built: **FX/multi-currency**, **period & close**,
and **financial reporting**. Each is the kind of module where a plausible-looking number can be
manufactured from nothing, so each is built around an explicit refusal rather than a best guess.

No new specialist. No new table. No migration. Fingerprint unchanged. Financial state unchanged.

Suite: **1148 → 1216** (+68), zero skipped. Fault injection: **20/20 detected** after three misses
were found and fixed.

## 2. Current architecture

Finance OS now spans nine modules under `src/lib/finance/` (~2,600 lines) sitting on the 7I
authority rails and the 7B specialist platform. BEYU OS remains the constitutional control plane;
Finance OS gained no authority powers.

## 3. Canonical financial truth

Unchanged and re-verified: **exactly one** POSTED source (`journal_entries + journal_lines`), sole
writer `finance/posting-engine`, enforced by `mayWrite()` with default deny. Balances and forecasts
remain deliberately unstored — a stored balance is a second truth that can drift from its own
ledger.

## 4–5. Domain architecture & data model

76 tables inventoried. The three new engines added **zero** tables: the period lifecycle is
enforced in code over the existing `financial_periods.status`, FX has no rate store because
creating one populated with numbers would be inventing FX policy, and reports are derived views.

Absent by design, reported NOT_AVAILABLE rather than stubbed: `exchange_rates`, `budgets`,
`receivables`, `payables`, `invoices`, `payments`, `expenses`, `fixed_assets`, `inventory`,
`cost_centers`, `close_tasks`, `consolidations`, `intercompany_transactions`.

## 6–9. Accounting, journal, ledger, subledgers

Unchanged (7A). Five triggers enforce journal immutability and balance at row level. **0 journal
entries** — the kernel is complete and cannot execute, which is the intended state.

## 10–12. AR / AP / Expenses

**NOT_AVAILABLE.** No substrate. Creating these requires ratified accounting policy (P1).

## 13–16. Treasury, FP&A, forecasting, budgeting

Reused unchanged (7F, 7C, 7H). No second forecasting engine.

## 17–20. Tax, risk, compliance, controls

Reused unchanged (7D, 7E). Tax remains rails-only: no rate, deduction or Tanzanian treatment
invented.

## 21–22. Reconciliation & period close

**NEW: `src/lib/finance/period.ts`.** Full lifecycle OPEN → IN_PROGRESS → SOFT_CLOSE → HARD_CLOSE →
CLOSED → FINAL, with REOPENED. Default-deny transition table; **all 49 state pairs** decided
explicitly. FINAL is terminal. Reopening and finalising require explicit governance authority.
Posting permitted only in OPEN, IN_PROGRESS, REOPENED.

The engine reports close-readiness facts but **refuses to decide which conditions are mandatory** —
that is a materiality judgement requiring ratified policy.

**0 periods exist**, so every real call returns DATA_NOT_AVAILABLE. An absent calendar is never
read as "everything is open".

## 23–24. Consolidation & intercompany

REQUIRES_AUTHORITY. The cross-tenant attribution defect (3/5 treasury positions) remains detected
and reported, never repaired.

## 25. Multi-currency — **the headline finding**

**NEW: `src/lib/finance/fx.ts`.** The seeded treasury data implies **three different TZS/USD
rates**:

| Entity | TZS | USD | Implied rate |
|---|---|---|---|
| LEN_BEYU_AGRI_LTD | 980,000,000 | 375,000 | **2613.333333** |
| LEN_BEYU_HEALTH_LTD | 2,870,000,000 | 1,098,000 | **2613.843352** |
| LEN_BEYU_TZ_HOLDING | 6,120,000,000 | 2,340,000 | **2615.384615** |

Any could be "derived" and presented as the rate. All three would be fabrications — none was
published by a rate authority, and averaging them would invent a fourth number appearing nowhere.

So `deriveRateFromBalances()` exists **only to throw**, naming all three rates in its error. The
temptation now has a name, a test and a documented refusal, rather than waiting to be discovered by
shipping it. `scanImpliedRates()` reports them as a data-quality defect with
`usableAsFxSource: false` as a literal type no caller can flip.

Conversion returns REQUIRES_AUTHORITY absent a governed rate. REFERENCE_DATA is refused — published
is not ratified. Two conflicting governed rates yield RATE_CONFLICT, never a winner.

## 26. Financial reporting

**NEW: `src/lib/finance/reporting.ts`.** Trial balance computes from journal lines (policy-
independent arithmetic). Balance sheet, P&L, cash flow and equity return their **structure** with
every line REQUIRES_AUTHORITY: mapping accounts to captions needs a ratified classification policy,
and inferring "code starts with 1 = asset" is exactly how a wrong balance sheet gets built.

An empty ledger yields **null totals, never 0.00**. `composeActualVsProjection()` forcibly
downgrades any projection line claiming POSTED or OBSERVED to FORECAST, and can never be
authoritative. `assertReportIntegrity()` is a machine-checkable guarantee that no report presents a
projection as truth.

## 27–33. Authority, security, isolation, audit, AI, cross-specialist

All reused unchanged. One authority model, one security model, one audit model, one trace model.
AI/Noelia remains analytical — it cannot post, approve or allocate.

## 34–37. Events, data quality, performance, recovery

Existing event infrastructure reused. Data-quality scanner extended in effect by
`scanImpliedRates()`. No premature optimisation; no eventual consistency introduced into canonical
truth.

## 38–40. Test architecture, fault injection, hostile audit

**20 faults injected, 3 initially undetected, all files restored byte-identical by md5.**

| # | Fault | Result |
|---|---|---|
| 1 | Implied rate becomes usable FX source | 1 failed ✓ |
| 2 | REFERENCE_DATA accepted as governed | 2 failed ✓ |
| 3 | Incomplete provenance accepted | 1 failed ✓ |
| 4 | Rate conflict picks first winner | 1 failed ✓ |
| 5 | Missing rate defaults to 1 | 8 failed ✓ |
| 6 | Derive-from-balances permitted | 1 failed ✓ |
| 7 | Mixed-currency sum computed anyway | **NOT DETECTED** → fixed → 1 failed ✓ |
| 8 | Currency code validation removed | 1 failed ✓ |
| 9 | Illegal transitions permitted | 1 failed ✓ |
| 10 | FINAL no longer terminal | **NOT DETECTED** → fixed → 1 failed ✓ |
| 11 | Reopen without authority | 2 failed ✓ |
| 12 | Posting allowed in CLOSED | 3 failed ✓ |
| 13 | Unknown state treated as known | 2 failed ✓ |
| 14 | Duplicate close allowed | 1 failed ✓ |
| 15 | Overlapping periods pick first | **NOT DETECTED** → fixed → 1 failed ✓ |
| 16 | Empty ledger reports zero totals | 4 failed ✓ |
| 17 | Statements guess classification | 3 failed ✓ |
| 18 | Projection keeps POSTED class | 2 failed ✓ |
| 19 | Actual-vs-projection marked authoritative | 1 failed ✓ |
| 20 | Integrity check always valid | 4 failed ✓ |

## 41. Defects discovered

**D-1 · FI-10 · FINAL not terminal, undetected**
SYMPTOM: changing `FINAL: []` to `FINAL: ["OPEN","REOPENED"]` broke no test.
CAUSE: the early `from === "FINAL"` guard returns before the table is consulted.
SYSTEMIC: defence in depth shadowing the data it protects.
ROOT: the transition **table** had no direct assertion — only the guard did.
FIX: exported `LEGAL_TRANSITIONS`, asserted the table itself.
REGRESSION TEST: 3 tests on table shape. FAULT INJECTION: now 1 failed ✓

**D-2 · FI-15 · Overlapping periods, undetected**
SYMPTOM: deleting the multi-match branch broke no test.
CAUSE: `financial_periods` is empty; the DB path can only return zero rows today.
SYSTEMIC: logic reachable only through data that does not yet exist.
ROOT: overlap resolution was embedded in a DB function, untestable without a calendar.
FIX: extracted pure `resolvePeriodForDate(candidates, date)`.
REGRESSION TEST: 4 tests incl. two overlapping periods. FAULT INJECTION: now 1 failed ✓

**D-3 · FI-7 · Mixed-currency precheck, undetected**
SYMPTOM: deleting the guard in `sumMultiCurrency()` broke no test.
CAUSE: the downstream per-amount conversion also returns null, so the aggregate still refused.
SYSTEMIC: a control validated only by a downstream accident.
ROOT: the precheck's intent — never assemble a partial total — had no assertion.
FIX: extracted `assertAllConvertible()`.
REGRESSION TEST: 3 tests naming each unconvertible currency. FAULT INJECTION: now 1 failed ✓

All three share one pattern, now seen in three consecutive phases: **a control behind a control
that always denies first is untested by construction**, and becomes load-bearing the moment the
outer gate starts passing.

## 42. Architecture completeness matrix

| Domain | Architecture | Data Model | Services | Security | Governance | Tests | Status |
|---|---|---|---|---|---|---|---|
| Core Accounting | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| GL / Journal / Ledger | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| Subledger | PARTIAL | NOT_AVAILABLE | PARTIAL | COMPLETE | COMPLETE | PARTIAL | NOT_AVAILABLE |
| AR / AP / Expenses | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | — | — | — | NOT_AVAILABLE |
| Treasury | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| FP&A / Forecasting | COMPLETE | PARTIAL | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| Budgeting | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | — | — | — | NOT_AVAILABLE |
| Tax | PARTIAL | PARTIAL | PARTIAL | COMPLETE | COMPLETE | PARTIAL | REQUIRES_AUTHORITY |
| Risk / Compliance | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Controls | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| Reconciliation | COMPLETE | PARTIAL | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| **Period Close** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **DATA_NOT_AVAILABLE** |
| Consolidation | PARTIAL | NOT_AVAILABLE | NOT_AVAILABLE | COMPLETE | COMPLETE | PARTIAL | REQUIRES_AUTHORITY |
| Intercompany | COMPLETE | COMPLETE | PARTIAL | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| **Multi-Currency** | **COMPLETE** | **PARTIAL** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **REQUIRES_AUTHORITY** |
| **Financial Reporting** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **COMPLETE** | **REQUIRES_AUTHORITY** |
| Audit / Authority / Policy | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Data Quality | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| AI / Noelia | PARTIAL | PARTIAL | PARTIAL | COMPLETE | COMPLETE | PARTIAL | PARTIAL |
| API / Events / Observability | PARTIAL | COMPLETE | PARTIAL | COMPLETE | COMPLETE | PARTIAL | PARTIAL |
| Security | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| DR / Backup / Performance | NOT_AVAILABLE | — | — | — | — | — | NOT_AVAILABLE |

## 43. Production readiness

| Dimension | Status |
|---|---|
| Security · Governance · Audit · Testing · AI safety | **READY** |
| Authority · Accounting | **REQUIRES_AUTHORITY** |
| Data | **BLOCKED** (empty ledger, no calendar, no FX source) |
| Operations · Integration · Observability | **PARTIAL** |
| Recovery · Scalability | **NOT_AVAILABLE** |

## 44. BEFORE → AFTER

All 28 tracked values **identical**. `je 0 · jl 0 · fp 0 · tsum 11783000.00 · clock 60/60 ·
dpend 16/16 · disabled 0 · mig 11 · tables 76`. Zero unexplained deltas. The only changes are
code, tests and documentation.

## 45–48. Remaining blockers

**Authority:** no ratified decision (16/16 PENDING); C-1 provenance (5/5 policies); no FX rate
source (P4); no account classification policy (P1); no close or consolidation policy.
**Data:** 0 journal entries, 0 accounts, 0 periods; treasury at a single as_of date.
**Engineering:** AR/AP/FA/Inventory/Budgets absent; API routes deferred; DR/backup absent.
**Integration:** Supabase not connected in code (excluded from this phase); CI unverified.

## 49. Next steps

1. Wire `financeGate()` into `runSpecialist()` so every specialist inherits the financial controls.
2. Migrate the six specialist vocabularies to `normalizeEpistemicClass()` at their boundaries.
3. Ratify P1 → create chart of accounts + fiscal calendar → the kernel becomes exercisable.
4. Ratify P4 → governed FX source → multi-currency reporting becomes possible.

## 50. FINAL GATE — 🟡 YELLOW

**Architecture substantially built; authority, data and production controls genuinely remain.**

GREEN is unavailable and claiming it would be false: the ledger is empty, no period exists, no FX
rate is governed, no decision is ratified, and DR/backup is absent.

RED is not warranted either: no security or integrity defect is unresolved, one financial truth is
enforced with default-deny writers, 20/20 faults are detected, and 1216 tests pass with zero
skipped.

What is now true: the Finance OS **refuses to fabricate**. It will not derive an FX rate from
balances, will not render an empty ledger as zeros, will not let a forecast claim to be posted,
will not treat an absent calendar as an open one, and will not pick a winner among conflicting
sources. Each refusal is enforced by a test that fails when the control is removed.

Nothing was ratified. Nothing was activated. No financial state moved.
