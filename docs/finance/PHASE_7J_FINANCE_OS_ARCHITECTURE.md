# PHASE 7J — FINANCE OS ARCHITECTURE COMPLETION

**Branch:** `arena/01a01b69-beyu-os-1-0` · **Date:** 2026-08-22
**Mandate:** COMPLETE THE FINANCE OS · CONVERGE THE ARCHITECTURE · DO NOT INVENT THE LAW
**Final gate:** 🟡 **YELLOW — ARCHITECTURE CONVERGED, SUBSTRATE AND AUTHORITY ABSENT**

---

## 1. Baseline

Sandbox **re-clone #14** was detected at the start of this phase: HEAD had reset to `2c0f08d`,
`d17aea0` (7I) and `3b6723e` were gone, and `node_modules`, `/tmp/pgboot` and `.env` were
destroyed. Working-tree files survived, including `src/lib/authority/`. Per §1 the work was
recovered, independently verified and **committed immediately as `addc72b`** before any new work
began.

Verification after recovery, all reproduced rather than assumed:

| Check | Result |
|---|---|
| Migration fingerprint | `611865f1aca2f81eeb72a6c418b49732`, 11 migrations ✅ |
| Full suite | **1053/1053, 39 files, 0 skipped** ✅ |
| State snapshot | all 27 values match 7I ✅ |
| Decisions | 16/16 PENDING ✅ |
| Capabilities | 60/60 LOCKED ✅ |
| Triggers | 9, **0 disabled** ✅ |
| Health | 200 ✅ |

One baseline discrepancy was investigated rather than accepted: `tsum` initially read
`9977970000.00` against an expected `11783000.00`. The cause was my own helper summing `balance`
(mixed TZS/USD) instead of `base_currency_balance`. **No data drift** — a reminder that summing a
multi-currency column produces a meaningless number, which is itself an §27 data-quality concern.

The suite also reported 68 skipped on the first run. Diagnosed rather than waived: the five HTTP
suites skip when no server is listening. With the app started, **zero skipped**.

## 2. Architectural position

The constitutional boundary is preserved exactly as specified. Finance OS gained **no** authority
powers in this phase: it consumes `checkScopedCapability()` (7I) and never decides authority
itself. There is no second constitutional authority, and `financeGate()` cannot activate anything.

## 3. Canonical financial truth

`src/lib/finance/truth.ts` — a registry of 20 truth records answering, for every financial datum,
which table is authoritative, what epistemic class it produces, and **who may write it**.

Key rulings, all enforced by `mayWrite()` with **default deny**:

| Datum | Canonical source | Sole writer |
|---|---|---|
| Booked accounting truth | `journal_entries + journal_lines` | `finance/posting-engine` **only** |
| Account balances | *none — DERIVED, never stored* | — |
| Cash/bank positions | `treasury_positions` | — (observations) |
| Forecasts | *none — computed on demand* | — |
| Audit truth | `audit_log + enterprise_events` | `lib/audit` only |

Balances and forecasts deliberately have **no table**. A stored balance is a second truth that can
drift from its own ledger; an unpersisted forecast cannot overwrite an actual. An unregistered
table is writable by nobody, so adding a new financial store without registering it fails.

## 4. Domain architecture

76 tables mapped. Ten domains have real substrate; **AR, AP, Fixed Assets, Inventory,
Consolidation have none** and are reported NOT_AVAILABLE rather than stubbed. No duplicate
structure was created where a primitive already existed.

## 5. Accounting & ledger

`postJournal()` (7A) already implements the full kernel: double-entry balancing, immutability
triggers, period checks, tenant/entity scoping, idempotency, reversal. **Nothing was rebuilt.**
Five database triggers enforce journal immutability and balance at the row level.

The ledger holds **0 entries**. Every derived figure must therefore report DATA_NOT_AVAILABLE —
never `0.00`, which would assert a measured zero that was never observed.

## 6. Treasury

Treasury observations are OBSERVED bank truth and can never become POSTED accounting truth: the
promotion rule permits `OBSERVED → POSTED` only through genuine posting, and `mayWrite()` refuses
treasury as a ledger writer. The reverse is equally blocked.

## 7–8. FP&A, forecasting, risk & compliance

Reused unchanged (7C–7H). No second forecasting engine, no second risk engine. Their outputs are
classified through the new common epistemic model and cannot reach the ledger.

## 9. Audit & observability

Reused unchanged (7G), including the corrected trace propagation. `audit_log` and
`enterprise_events` are append-only, protected by four immutability triggers against UPDATE and
TRUNCATE.

## 10–11. Tax & capital

Tax rails only: strategies and assessments exist as records; **no rate, deduction, exemption or
Tanzanian treatment is invented**. Capital keeps REQUEST · RECOMMENDATION · APPROVAL · ALLOCATION
· COMMITMENT · DISBURSEMENT distinct and locked.

## 12–14. Subledgers, close, consolidation, reporting

AR/AP/FA/Inventory: **NOT_AVAILABLE**. Close has only `financial_periods`. Consolidation is
**REQUIRES_AUTHORITY** — it needs a ratified elimination policy, and inventing one is forbidden.

## 15–16. Security & execution gate

`financeGate()` runs the full 13-stage pipeline, composing 7B `runSpecialist()` and 7I
`checkScopedCapability()`. **It is not a second security engine.** What it adds is the
FINANCIAL CONTROL stage that did not exist: canonical-writer enforcement, epistemic admissibility,
attribution consistency, period lock, segregation of duties. Verified: **all 60 capabilities are
denied today**, each with a specific stage and reason.

## 17–18. Cross-specialist convergence & common primitives

**The central defect this phase fixes.** Six specialists each declared a private epistemic
vocabulary:

| Specialist | Vocabulary |
|---|---|
| fpna | OBSERVED **ASSUMED** FORECAST SCENARIO |
| risk | OBSERVED DERIVED **ASSUMED** FORECAST SCENARIO … |
| compliance | OBSERVED DERIVED … REQUIRES_SPECIALIST_REVIEW |
| treasury | OBSERVED DERIVED **ASSUMED** SCENARIO … GOVERNANCE_REVIEW_REQUIRED |
| audit | OBSERVED DERIVED POTENTIAL_ANOMALY REQUIRES_HUMAN_REVIEW … |
| forecast | OBSERVED FORECAST **ASSUMPTION** SCENARIO … DATA_CONFLICT |

Three provable problems: fpna's `ASSUMED` and forecast's `ASSUMPTION` are the same state under two
names; **`POSTED` existed in none of them**, so nothing could express booked accounting truth; and
the rule "a forecast must never become a posted figure" was enforced in no common place.

`src/lib/finance/epistemics.ts` is now the one model — 13 canonical classes, a total mapping from
every legacy term, and `canPromote()` enforcing the §5 prohibitions once.

## 19. Critical defects found

1. **Divergent epistemic vocabularies** (above) — ARCHITECTURE GAP, fixed.
2. **No canonical-writer enforcement** — any module could in principle write any table. Fixed by
   the truth registry with default deny.
3. **Cross-tenant treasury attribution** — 3 of 5 positions claim `TEN_BEYU_GROUP` for entities
   owned by `TEN_BEYU_TZ`, `TEN_BEYU_HEALTH`, `TEN_BEYU_AGRI`. **Detected and reported, never
   repaired** — it is governance-owned evidence.
4. **Three masked controls** found by fault injection (§22 below).
5. **C-1 provenance gap** — 5/5 policies unprovenanced. Reported.

## 20. Remediation

Minimum-change throughout. **No migration was added** (fingerprint unchanged). No specialist was
rewritten; the legacy vocabularies remain and are mapped rather than deleted, because rewriting six
working modules for no behavioural gain would risk more than it fixes.

## 21. Hostile attacks — 30 vectors, all fail closed

Cross-tenant/entity ledger and treasury access, forged authority/policy/capability/permission,
future and revoked authority, synthetic data entering truth, forecast and scenario entering the
ledger, risk and compliance becoming financial truth, unauthorised posting, historical mutation,
period-lock and reconciliation bypass, audit deletion, attribution laundering, policy-conflict
laundering. Wildcard permissions (`*`, `finance:*`) do not match. Lowercase enum values do not
match.

## 22. Fault injection — 20 faults, 3 initially undetected

All files restored **byte-identical by md5**.

| # | Fault | Result |
|---|---|---|
| 1 | FORECAST may become POSTED | 7 failed ✓ |
| 2 | SYNTHETIC promotion allowed | 1 failed ✓ |
| 3 | Non-value class may carry amount | 2 failed ✓ |
| 4 | Unknown class defaults to OBSERVED | 2 failed ✓ |
| 5 | Combine returns strongest not weakest | 1 failed ✓ |
| 6 | Case normalisation reopens laundering | 1 failed ✓ |
| 7 | Any module may write the ledger | 3 failed ✓ |
| 8 | Unregistered table writable | 1 failed ✓ |
| 9 | Attribution check disabled | 3 failed ✓ |
| 10 | Missing entity treated as ok | 1 failed ✓ |
| 11 | No period means open | 2 failed ✓ |
| 12 | Self-approval allowed | 1 failed ✓ |
| 13 | Canonical-writer control removed | **NOT DETECTED** → fixed → 2 failed ✓ |
| 14 | Gate default-allow on authority | 6 failed ✓ |
| 15 | Empty ledger reports RECONCILED | 1 failed ✓ |
| 16 | Data-quality scan returns nothing | 5 failed ✓ |
| 17 | Attribution finding suppressed | 3 failed ✓ |
| 18 | Capability count inflated | 3 failed ✓ |
| 19 | EXECUTE misclassified as analytical | **NOT DETECTED** → fixed → 1 failed ✓ |
| 20 | Empty requiredDecisions = ELIGIBLE | **NOT DETECTED** → fixed → 1 failed ✓ |

### The three misses shared one root cause

Each control sat **behind another control that always denies first**. Because every capability is
LOCKED, `financeGate()` never reached the canonical-writer stage; because every capability is also
`activationStatus = 'LOCKED'`, the "no declared decisions" branch was unreachable; because most
codes carry only one verb, the execution-verb precedence never mattered.

Deleting them changed no observable behaviour — but each becomes load-bearing the moment authority
is ratified and the earlier gate starts passing. **Defence in depth is not coverage.** All three
were extracted as exported pure functions (`checkCanonicalWriter`, `classOf`, `executionStatusOf`)
and tested at their own boundary (+11 tests).

## 23. Data quality & reconciliation

`scanDataQuality()` found **5 real defects**: cross-tenant attribution (3 rows, CRITICAL), missing
provenance (5 policies, CRITICAL), fabricated-zero risk on an empty ledger, an unreconciled
subledger, and stale single-date treasury data. **Nothing was repaired** — `repaired: false` on
every finding, and governance-owned defects are labelled as such.

Treasury-to-ledger reconciliation returns **DATA_NOT_AVAILABLE**, not "reconciled". With 5 treasury
positions and 0 journal lines there is nothing to reconcile *to*; reporting agreement would be the
most dangerous false positive this system could produce.

## 24. BEFORE → AFTER

All 27 tracked values **identical**:

```
la 0 · je 0 · jl 0 · tp 5 · tsum 11783000.00 · cap 4 · funded 0 · ent 8 · ten 6
pol 5 · polactive 5 · polnoprov 5 · res 4 · usr 9 · rol 9 · rperm 160
dreg 16 · dpend 16 · creg 60 · clock 60 · oblig 8 · risks 6
aud 0 · ev 0 · mig 11 · triggers 9 · disabled 0
```

**Zero deltas.** No journal posted, no treasury movement, no capital allocated, no decision
ratified, no capability activated, no trigger disabled, no migration added.

## 25. Finance OS completeness matrix

| Domain | Architecture | Canonical Source | Service | Security | Audit | Execution Gate | Status |
|---|---|---|---|---|---|---|---|
| Accounting | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| Ledger | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| Treasury | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| FP&A | COMPLETE | PARTIAL | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| Forecasting | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| Risk | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Compliance | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Audit | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Tax | PARTIAL | PARTIAL | PARTIAL | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| Capital | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| AR | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |
| AP | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |
| Fixed Assets | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |
| Inventory | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |
| Intercompany | COMPLETE | COMPLETE | PARTIAL | COMPLETE | COMPLETE | COMPLETE | PARTIAL |
| Close | PARTIAL | PARTIAL | PARTIAL | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| Consolidation | PARTIAL | NOT_AVAILABLE | NOT_AVAILABLE | COMPLETE | COMPLETE | COMPLETE | REQUIRES_AUTHORITY |
| Reporting | PARTIAL | COMPLETE | PARTIAL | COMPLETE | COMPLETE | COMPLETE | PARTIAL |

## 26. Architectural gap register

| Gap | Domain | Severity | Evidence | Fix | Authority Required | Status |
|---|---|---|---|---|---|---|
| Divergent epistemic vocabularies | ALL | CRITICAL | 6 private enums; `ASSUMED`≠`ASSUMPTION`; no `POSTED` | Canonical model + mapping | No | **FIXED** (ARCHITECTURE GAP) |
| No canonical-writer enforcement | ALL | CRITICAL | No registry existed | Truth registry, default deny | No | **FIXED** (ARCHITECTURE GAP) |
| Three masked controls | PLATFORM | HIGH | FI-13/19/20 undetected | Extracted + boundary-tested | No | **FIXED** (CODE GAP) |
| Cross-tenant treasury attribution | TREASURY | CRITICAL | 3/5 positions | Detected, reported | **Yes** | OPEN (GOVERNANCE GAP) |
| C-1 policy provenance | GOVERNANCE | CRITICAL | 5/5 policies null | Detected, reported | **Yes** | OPEN (GOVERNANCE GAP) |
| Empty ledger | ACCOUNTING | HIGH | 0 journal entries | Reports DATA_NOT_AVAILABLE | **Yes** (P1) | OPEN (DATA GAP) |
| No AR/AP/FA/Inventory | SUBLEDGERS | MEDIUM | No tables | Reported NOT_AVAILABLE | **Yes** | OPEN (ARCHITECTURE GAP) |
| No consolidation policy | CONSOLIDATION | HIGH | No elimination rules | REQUIRES_AUTHORITY | **Yes** | OPEN (POLICY GAP) |
| No accounting periods | CLOSE | HIGH | 0 rows | Fails closed | **Yes** (P1) | OPEN (DATA GAP) |
| Multi-currency summation | TREASURY | MEDIUM | `sum(balance)` mixes TZS+USD | Use `base_currency_balance` | No | NOTED (DATA GAP) |

## 27. Readiness score

| Layer | Status | | Layer | Status |
|---|---|---|---|---|
| Canonical financial truth | READY | | Intercompany | PARTIAL |
| Accounting kernel | READY | | Close | PARTIAL |
| Ledger | REQUIRES_AUTHORITY | | Consolidation | REQUIRES_AUTHORITY |
| Treasury | PARTIAL | | Reporting | PARTIAL |
| FP&A | PARTIAL | | Authority | REQUIRES_AUTHORITY |
| Forecasting | READY | | Policy provenance | BLOCKED |
| Risk | READY | | Execution gate | READY |
| Compliance | READY | | Security | READY |
| Audit | READY | | Auditability | READY |
| Tax | REQUIRES_AUTHORITY | | Traceability | READY |
| Capital management | REQUIRES_AUTHORITY | | Reconciliation | PARTIAL |
| AR / AP | NOT_AVAILABLE | | Data quality | PARTIAL |
| Fixed assets / Inventory | NOT_AVAILABLE | | Cross-specialist composition | READY |

## 28. Validation

| Check | Result |
|---|---|
| Typecheck / Lint / Build | ✅ clean |
| Full suite | ✅ **1148/1148, 40 files, 0 skipped** (166s) |
| Finance OS suite | ✅ 95/95 |
| Deterministic second run | ✅ 95/95 identical |
| Fault injection | ✅ **20/20 detected**, all files md5-restored |
| Clean-install parity | ✅ `beyu_clean_7j` → 27/27 identical; 190/190 tests; dropped |
| Migration parity | ✅ `611865f1…`, 11 migrations, **no new migration** |
| Capability seed parity | ✅ 60/60 LOCKED, count not inflated |
| BEFORE == AFTER | ✅ zero deltas |

Suite grew 1053 → 1148 (+95). No regressions.

## 29. Remaining blockers

1. **No ratified authority** — every execution path is correctly locked. Not a software defect.
2. **No accounting substrate** — 0 journal entries, 0 accounts, 0 periods. The kernel cannot be
   exercised against real data until P1 is ratified.
3. **C-1 provenance** — 5/5 policies unprovenanced.
4. **Cross-tenant attribution** — 3 treasury positions; governance-owned.
5. AR/AP/FA/Inventory have no substrate; consolidation has no ratified policy.
6. Legacy stubs `forecasting.ts` / `audit-intelligence.ts` remain unreconciled.
7. **CI configuration present · CI execution unverified.**

## 30. Next production build

Wire `financeGate()` into `runSpecialist()` as the capability step so every specialist inherits
the financial controls rather than each re-deriving them; migrate the six specialist vocabularies
to `normalizeEpistemicClass()` at their boundaries; then reconcile the legacy stubs.

## 31. Final gate — 🟡 YELLOW

**The architecture is converged and proven. The substrate and the law are still missing.**

GREEN is unavailable, and claiming it would be false: the ledger is empty, no authority is
ratified, five policies are unprovenanced, and four subledgers do not exist. What is now true is
that there is **one** epistemic model, **one** canonical truth registry with default-deny writers,
**one** execution gate composing the existing authority rails, and a data-quality scanner that
finds the real defects instead of reporting a clean bill of health.

No financial state moved. Nothing was ratified. Nothing was activated.
