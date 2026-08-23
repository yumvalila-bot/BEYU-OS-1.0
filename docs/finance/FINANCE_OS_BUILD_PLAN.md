# BEYU Finance OS — Production Build Plan & Phase 7A Delta

**Status:** `[NOT AUTHORITY]` — engineering artifact. Grants nothing, decides no accounting policy.
**Phase:** 7A delivered · 7B–7H specified, not built
**Accounting authority:** `NOT RATIFIED` — all 14 capabilities remain `LOCKED`

---

## 1. Architecture delta (what changed in Phase 7A)

The Phase 6C activation gate existed but **nothing consumed it** — it was a control with no
subject. That was the single highest-value gap, so Phase 7A built the first real execution layer
behind it and wired it to the gate.

```
INTELLIGENCE            GOVERNANCE                     EXECUTION
(forecast, tax,   ->    decision registry        ->    posting engine
 audit, analytics)      capability registry            (src/lib/finance/)
 no ledger writes       authority verification         requireCapability() gate
                        activation gate                canonical ledger writer
```

| Layer | Module | Status |
|---|---|---|
| Governance | `src/lib/decision-authority.ts` | Phase 6C, now **enforced** |
| Execution | `src/lib/finance/posting-engine.ts` | **new** — implemented, tested, LOCKED |

## 2. What Phase 7A actually delivers

`postJournal()` is the single canonical writer of `journal_entries` / `journal_lines`. Its
enforcement order, every step mandatory:

1. **AUTHORITY** — `requireCapability("CAP_POSTING")` → P1, P5, P6, P7, P9 must all verify as
   ACTIVATED against a genuinely APPROVED resolution with GOVERNED provenance.
2. **IDENTITY** — RBAC `finance:ledger.post` (GROUP_CFO only).
3. **TENANT** — principal tenant must match; failure is non-enumerating (`NOT_FOUND`).
4. **ENTITY** — must exist, belong to the tenant, and be within the principal's entity scope.
5. **ACCOUNTING INVARIANTS** — policy-independent only (below).
6. **ACCOUNTS** — must exist, same tenant, active. Re-read inside the transaction.
7. **PERIOD** — if supplied, must match the entity and not be structurally closed.
8. **ATOMICITY** — entry + lines + audit + event in ONE transaction, with
   `set constraints all immediate` so the deferred balance trigger fires before commit.

### Policy-independent invariants only

Enforced because they are true of double-entry bookkeeping under **any** ratified policy:
debits equal credits · no negative amounts · no double-sided line · no zero line · valid ISO
currency · entry scoped to one tenant and entity · accounts exist and are active · a structurally
closed period rejects postings · integer minor units so fractional amounts never drift.

**Deliberately absent** (these are P1–P11, unratified): recognition basis, measurement,
materiality, capitalisation, which account to debit or credit, FX rate source, tax treatment,
fiscal calendar, chart of accounts, opening balances, maker/checker separation.

## 3. Verification

| Control | Negative | Positive | Fault injection |
|---|---|---|---|
| Authority gate | locked → `CapabilityLockedError`, blockedBy lists P1/P5/P6/P7/P9 | activated → posts, ledger changes 0→1 | remove gate → **5 tests fail** |
| Tenant isolation | cross-tenant → `NOT_FOUND` | in-tenant posts | remove check → **1 test fails** |
| Balance invariant | unbalanced → `RULE_VIOLATION` | balanced posts | remove check → **2 tests fail** (app + DB trigger) |
| RBAC | AUDITOR → `DENIED` | CFO posts | covered by existing suites |
| Entity scope | out-of-scope → `NOT_FOUND` | in-scope posts | — |
| Idempotency | duplicate key → `CONFLICT`, no double-post | first post succeeds | — |

**The positive control matters most.** Every negative test would pass against an engine that threw
unconditionally. The positive test grants genuine authority, posts a real balanced entry, and
asserts the entry, both lines, the audit record and the event all exist — then removes them.

**Two fixture bugs were found and fixed by these controls, not by inspection:** the authority
fixture omitted P5 (P7 depends on it — the gate's transitive dependency check was correct), and
the entity-scope fixture fell back to the target entity, which would have made that test vacuous.

## 4. Production module map (7B–7H) — specified, NOT built

Each module below is blocked on ratification, and each already has a `LOCKED` capability row.
Building them now would require inventing the policy they implement.

| Phase | Module | Capability | Blocked on |
|---|---|---|---|
| 7A | Chart of accounts | `CAP_CHART_OF_ACCOUNTS` | P6 |
| 7A | Fiscal periods | `CAP_FISCAL_PERIOD` | P5 |
| 7A | Period linkage | `CAP_PERIOD_LINKAGE` | P5, P7 |
| 7A | **Posting engine** | `CAP_POSTING` | **built — P1/P6/P7/P9** |
| 7A | Opening balances | `CAP_OPENING_BALANCES` | P1, P6, P8 |
| 7A | Reversals | `CAP_REVERSAL` | P1, P9 |
| 7B | AP / AR / billing / collections | via `CAP_POSTING` | P1, P2 |
| 7B | Cash, banking, reconciliation | `CAP_TREASURY_SETTLEMENT` | P1, P9, P10 |
| 7C | Forecasting intelligence | none — read-only | **none** |
| 7D | Tax intelligence | `CAP_VAT` | P3 |
| 7E | Audit intelligence | none — read-only | **none** |
| 7F | Treasury settlement | `CAP_TREASURY_SETTLEMENT` | P1, P9, P10 |
| 7G | Capital execution | `CAP_CAPITAL_ACCOUNTING` | P1, P2, P6, P7, P9, P10 |
| 7H | Consolidation / intercompany | `CAP_INTERCOMPANY` | P1, P6, P11 |

**7C forecasting and 7E audit intelligence are the next legitimately buildable modules** — both are
read-only, write no ledger entries, and depend on no unratified accounting policy. They were
scoped in this phase but not implemented; see §6.

## 5. Noelia / HIVE integration boundary

Noelia may analyse, calculate, simulate, forecast, detect, recommend, explain and assemble
evidence. It may **not** post. Verified: `aiInitiated` is hardcoded server-side at every call site,
`CONST-AI-001` denies `finance:ledger.post` for AI principals under every role combination, and
the posting engine additionally requires `CAP_POSTING`, which is locked. Three independent
barriers.

## 6. Honest scope statement

Phase 7 as briefed spans twenty domains, each requiring a domain model, rules engine, evidence
model, versioning, effective dating, authority binding, risk model, explainability, audit trail,
simulation, workflow, human review, API, tests and observability — with a twenty-point hostile
audit per capability.

**Phase 7A delivers one of those domains to that standard.** The remainder are specified above
with their capability bindings and blocking decisions, and are not built.

This was a deliberate choice. Twenty shallow modules would have been twenty untested surfaces
carrying implied accounting policy, which is precisely what the governance rule forbids. One
fully-verified execution layer — with negative controls, positive controls and fault injection —
is worth more than nineteen stubs, and it establishes the pattern every later module follows:

> **authority gate first, policy-independent invariants only, positive control mandatory.**

## 7. Migration and rollback

Phase 7A required **no migration**. The journal schema (0000), ledger integrity triggers (0005),
scope triggers (0006) and the decision registry (0010) already provided everything needed.
Fingerprint is unchanged at `611865f1aca2f81eeb72a6c418b49732`.

Rollback is deleting one source file and one test file; no schema or data change to reverse.

## 8. Unresolved policy decisions

Unchanged: C-1…C-5 and P1–P11 (P4 partial). See `HUMAN_RATIFICATION_QUEUE.md`. The critical path
remains **C-1 policy provenance**, which needs the Board or CGO.
