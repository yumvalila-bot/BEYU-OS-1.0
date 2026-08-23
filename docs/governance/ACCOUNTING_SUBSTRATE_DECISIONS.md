# Accounting substrate — decisions required before posting can exist

Status: **BLOCKED on accounting policy.** 5 of the 11 §2 questions have no
authoritative answer in the repository; 2 more are only partly answered.
Raised by: Phase 5A (canonical financial accounting substrate), 2026-08-21.
Baseline: commit `40ee6e1`, 293/293 tests, fingerprint
`28ceb656ed7c4ab1211558f9ea107d20`.

Phase 5A asked for a chart of accounts, financial periods and a canonical
posting service, and instructed that implementation stop rather than invent
accounting policy. The chart of accounts and the posting service are **blocked**.

What *was* implemented is the part that requires **no accounting policy at all**:
the structural integrity of the journal (migration `0005`, §"Implemented"
below). Two real integrity defects were demonstrated and fixed.

---

## 1. The eleven §2 questions, answered from evidence

| # | Question | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Who owns the chart of accounts? | **Partial** | `os_registry` FINANCE_OS `ownerRole = GROUP_CFO`, `dataAuthority` includes `LEDGER`; Constitution Art. 5 authority = "Group CFO". The *owner* is clear; the *content* is undefined. |
| 2 | Who approves accounting policy? | **Resolved** | Every FINANCE-domain policy (`ENT-FIN-002`, `ENT-FIN-003`) has `owner_role = GROUP_CFO`. |
| 3 | Accounting basis? | **Resolved** | `legal_entities.accounting_standard` NOT NULL default `IFRS`; all 8 seeded entities are IFRS; `ledger_accounts.ifrs_category` exists. |
| 4 | Currencies? | **Resolved** | `legal_entities.functional_currency`: USD (BEYU-FT, BEYU-HLD), TZS (6 others). `journal_entries` carries `currency` + `fx_rate`. |
| 5 | What constitutes a financial period? | **Partial** | Schema exists (`legal_entity_id`, `code`, `starts_on`, `ends_on`, status `OPEN\|CLOSING\|CLOSED\|LOCKED`). No policy defines period length, the calendar, or who opens a period. |
| 6 | What happens when a period closes? | **Partial** | `docs/compliance` mentions "period locking"; four statuses exist. No rule for who closes, what `CLOSING` vs `LOCKED` mean, or whether reopening is permitted. |
| 7 | **Capital drawdown accounting treatment?** | **UNRESOLVED** | Zero definition anywhere. `capital_requests.request_type` is `CAPEX \| OPEX \| INVESTMENT \| FINANCING \| RESERVE` — five materially different treatments, none specified. |
| 8 | **Intercompany supported?** | **UNRESOLVED** | Entities span 3 countries and 2 currencies in parent–child chains; risk `ERM-003` covers transfer pricing; the seed mentions "Intercompany charge eliminated on consolidation". No intercompany accounting model exists. |
| 9 | **Tax/VAT accounts at this layer?** | **UNRESOLVED** | No VAT or withholding account concept in the finance schema. Tax lives in `tax_strategies` (assessment only, never posted). |
| 10 | **FX accounting required?** | **UNRESOLVED** | `journal_entries.fx_rate` exists and entities mix USD/TZS, so FX necessarily arises. No translation or revaluation policy is defined. |
| 11 | **What does capital execution create?** | **UNRESOLVED** | No definition of cash movement vs payable vs receivable vs investment vs equity vs intercompany balance. |

---

## 2. Why engineering cannot safely infer the unresolved items

**Question 7 is the blocking one.** A capital drawdown of USD 1,800,000 could
legitimately be posted as any of:

| Treatment | Debit | Credit | When it is correct |
| --- | --- | --- | --- |
| Cash drawdown | Bank / cash | Capital commitment payable | Money actually leaves a funder |
| Investment in subsidiary | Investment in subsidiary | Bank | Holding funds an operating entity |
| Intercompany loan | Intercompany receivable | Bank | Funding is repayable |
| Equity contribution | Investment | Share capital / premium | Funding is permanent capital |
| Expense | Expense account | Bank / payable | The spend is not capitalised |

These produce **different balance sheets, different tax outcomes and different
consolidation eliminations**. Choosing between them is accounting policy under
CFO authority (Art. 5), not an engineering detail. `request_type` hints at a
distinction but does not define the double-entry treatment for any of the five
values, and the chart of accounts that the entries would reference does not
exist (`ledger_accounts` = 0 rows).

Questions 8–10 compound it: with entities in TZ, AE and MU on two functional
currencies, almost any realistic capital posting is simultaneously an
intercompany transaction *and* an FX transaction. Inventing a treatment would
silently establish group accounting policy and would be very hard to unwind,
because posted journals are immutable by design.

---

## 3. Affected components

| Component | Status |
| --- | --- |
| Chart of accounts (`ledger_accounts`) | **Blocked** — needs Q1 content + Q7 |
| Financial periods (`financial_periods`) | **Partially blocked** — structure enforced, lifecycle needs Q5/Q6 |
| Posting service | **Blocked** — needs Q7 at minimum |
| Journal integrity | **Implemented** (migration `0005`) — no policy needed |
| Capital execution | **Blocked** — depends on all of the above (see `CAPITAL_EXECUTION_BLOCKED.md`) |
| Treasury movement | **Blocked** — no transaction substrate exists at all |

---

## 4. What WAS implemented — journal integrity (migration `0005`)

These are universal properties of double-entry bookkeeping and of the
repository's own declared rule ("Immutable double-entry journal. Corrections are
reversals, never edits." — `src/db/schema/finance.ts`). They required no policy
decision, and they close two demonstrated defects.

**Defects found by probing the live database at the baseline:**

1. An **unbalanced journal was accepted** — debit `100.00` against credit
   `7.00` persisted successfully.
2. A **posted journal entry was mutated** — `UPDATE ... SET description =
   'MUTATED'` succeeded despite the declared immutability.

**Now enforced by PostgreSQL, not by application code:**

| Invariant | Mechanism |
| --- | --- |
| `sum(debit) = sum(credit)` per entry | `CONSTRAINT TRIGGER beyu_journal_balanced`, `DEFERRABLE INITIALLY DEFERRED` so a multi-line entry is validated at COMMIT |
| At least two lines per entry | same trigger |
| No zero-value entry | same trigger |
| Exactly one side per line, strictly positive | `CHECK journal_line_single_sided` (extends the existing `journal_line_non_negative`, which still permitted a `0/0` line) |
| Posted entries immutable (no UPDATE/DELETE) | `TRIGGER beyu_journal_entry_immutable` |
| Posted lines immutable (no amount/account tampering) | `TRIGGER beyu_journal_line_immutable` |
| Reversal path preserved | untouched — `journal_entries.reversal_of_id` still works, proven by test |
| No overlapping periods per entity | `EXCLUDE USING gist` on `(legal_entity_id, daterange(starts_on, ends_on, '[]'))` |
| Period dates ordered | `CHECK financial_period_dates_ordered` |

A deferred constraint trigger was necessary because balance is a property of the
whole entry: a row-level `CHECK` would reject the first line of a legitimately
balanced pair. Deferring to COMMIT also means the invariant holds against **raw
SQL**, not merely against application code — which matters, because no posting
service exists yet, so the database is the only line of defence.

18 behavioural tests (`tests/finance/ledger-integrity.test.ts`) drive raw SQL
against a real PostgreSQL instance and pin every invariant, including the two
original defects. The ledger is left pristine (0 entries, 0 lines) afterwards —
no financial truth was fabricated.

---

## 5. Options

### Option A — CFO authors the accounting policy pack (recommended)
A short, authoritative document under Group CFO ownership defining:

1. the **chart of accounts** (codes, names, types, IFRS categories, per-entity
   or shared);
2. the **capital treatment matrix** — the debit/credit pair for each of
   `CAPEX | OPEX | INVESTMENT | FINANCING | RESERVE`;
3. the **financial calendar** — period length, who opens, who closes, whether
   reopening is permitted, and the meaning of `CLOSING` vs `LOCKED`;
4. **intercompany** policy — whether cross-entity funding creates a receivable,
   an investment or equity, and how it is eliminated;
5. **FX** policy — transaction rate source, and whether revaluation is in scope;
6. whether **tax/VAT** accounts belong at this layer.

Items 1–3 alone unblock capital execution for the single-entity case.

**Cost:** a policy document, then a mechanical implementation phase.
**Risk:** low. **Correctness:** high.

### Option B — Implement the substrate with a placeholder CoA
Rejected. A placeholder chart of accounts becomes the de-facto policy the moment
anything posts to it, and journals are immutable, so the error is permanent.

### Option C — Ship posting with client-supplied accounts
Rejected outright: it would let API callers define accounting treatment, which
is precisely the authority §9 and §22 protect.

---

## 6. Recommended decision

**Option A**, scoped to the minimum that unblocks the next phase:

> The Group CFO ratifies (a) a chart of accounts and (b) the debit/credit
> treatment for a capital drawdown, at least for `INVESTMENT` and `CAPEX`, for a
> single entity in its functional currency. Intercompany, FX and tax accounting
> can follow as a second tranche.

Once that exists, the remaining implementation is mechanical and already
specified by Phase 5A §3–§7: seed the CoA as system-defined canonical accounts,
add the period lifecycle service, and build one posting service reusing
`withAuditTransaction`, `publishEventTx`, the DB-backed idempotency layer and
`finance:ledger.post` — with the integrity invariants from migration `0005`
already guaranteeing that nothing corrupt can be stored.

Also still open (Phase 4): four governance bodies have no eligible decision
authority — `DECISION_AUTHORITY_MODEL.md` §4.

---

## 7. Authorization note (§9)

`finance:ledger.post` already exists, is listed in `HIGH_RISK_PERMISSIONS`, is
granted **explicitly only to `GROUP_CFO`**, and is one of just **three**
permissions deliberately excluded from the `GROUP_CEO` wildcard (alongside
`platform:config.manage` and `identity:emergency.activate`).

That is a deliberate segregation of duties — the CEO may authorise anything but
may not post to the ledger — and it is consistent with the seeded control
`CTL-FIN-002` "Maker/checker on all journal postings" (owner `GROUP_CFO`).

**It was not weakened, and no role was granted new financial authority.** When
the posting service is built it should reuse `finance:ledger.post` unchanged.
Whether maker/checker requires a *second* human on each posting (as
`CTL-FIN-002` implies) is a further decision for the CFO.
