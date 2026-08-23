# Capital execution — IMPLEMENTATION BLOCKED

Status: **BLOCKED — stop conditions §31.5, §31.6 and §31.4 reached.**
Raised by: Phase 5 (governed capital execution / funding), 2026-08-21.
Baseline: Phase-4 working tree, migration fingerprint `28ceb656ed7c4ab1211558f9ea107d20`,
293/293 tests passing.

Phase 5 asked for the first real governed capital **execution** transaction, and
instructed that implementation stop rather than improvise if the financial
foundations could not support it. They cannot. This document records the
evidence, the risk, the options and the decision required.

**No code was written.** Nothing was weakened, faked or partially wired.

---

## FINDING

BEYU OS has a **complete governance layer** and a **schema-only finance layer**.
Executing capital would require inventing the entire accounting substrate —
chart of accounts, financial periods, posting rules and a cash-movement model —
none of which the repository or the constitution defines.

The repository's own authoritative audit already says so
(`docs/audit/DEEP_ARCHITECTURE_AUDIT.md`, capability 17):

> **Finance / Ledger — STRUCTURAL_PLACEHOLDER. Schema only. Zero readers, zero
> writers. No CoA, no posting, no periods.**

and lists `ledger_accounts`, `journal_entries` and `journal_lines` as
**"DEAD — zero references"**, with "Journal posting API | MISSING".

---

## EVIDENCE

All figures are live queries against the seeded database at the Phase-4 baseline.

### §31.5 — The accounting model cannot guarantee balanced posting

| Fact | Value | Consequence |
| --- | --- | --- |
| `ledger_accounts` rows | **0** | No chart of accounts. There is no debit account and no credit account to post to. |
| `financial_periods` rows | **0** | No period is OPEN, so the "period must be open" invariant cannot be evaluated. |
| DB check constraints on journal tables | 1 (not a balance rule) | `debit = credit` is **not** enforced by the database. |
| Posting service in `src/` | **none** | `grep` for `insert(journalEntries)` / `insert(journalLines)` returns nothing. |
| `journal_entries` / `journal_lines` rows | **0** | The ledger has never been written to. |

To post a capital funding entry the server must decide *which* accounts to debit
and credit. With an empty chart of accounts that mapping would have to be
invented — a business rule, not an engineering detail, and precisely what §2
forbids ("do not invent financial statuses without inspecting existing
architecture"; §31.10 "the only way to complete the feature is to invent business
rules").

### §31.6 — Treasury has no execution primitive

`treasury_positions` is a **balance snapshot**, not a transaction ledger:

```
account_label                  currency  balance          as_of
Agriculture working capital    TZS       980000000.00     2025-12-31
Group operating USD            USD       4820000.00       2025-12-31
Health operations              TZS       2870000000.00    2025-12-31
TZ holding operating           TZS       6120000000.00    2025-12-31
Trust reserve                  USD       3150000.00       2025-12-31
```

Tables matching `%transaction%`, `%movement%`, `%payment%`, `%bank%`: **NONE**.

There is no cash-movement model, no bank instruction, no settlement record and
no double-entry link between a treasury position and the ledger. "Moving money"
could only be simulated by decrementing a snapshot `balance` column — which §16
explicitly forbids ("do not directly increment/decrement balances… DO NOT
fabricate a fake money-transfer engine").

Note also that `as_of` is `2025-12-31`: these balances are a dated snapshot, so
mutating them would corrupt a point-in-time record rather than represent a
transaction.

### §31.4 — The constitution does not define execution authority

Constitution Article 5 (*Financial Authority and Integrity*):

> "Finance OS is authoritative for financial consequences. Financial history is
> immutable; corrections are made by controlled reversal or adjustment.
> Waterfall distributions execute only under an approved configuration."
> **Authority: Group CFO under board delegated authority.**

This names an actor (the Group CFO) but no mechanism: it does not say what
constitutes execution, what a funding instruction is, when cash is considered
moved, or what the accounting treatment of a capital drawdown should be.

The permission catalogue contains **no** `capital:execute`, `capital:fund`,
`treasury:transfer` or equivalent. It contains `finance:ledger.post`, which is:

- listed in `HIGH_RISK_PERMISSIONS`;
- held **explicitly** by `GROUP_CFO` only; and
- one of just **three** permissions deliberately excluded from the `GROUP_CEO`
  wildcard (with `platform:config.manage` and `identity:emergency.activate`).

That exclusion is a deliberate separation of duties: **the CEO may authorise
anything but may not post to the ledger.** Creating an execution capability, or
routing posting authority around `finance:ledger.post`, would create new
constitutional power — §31.4.

---

## RISK IF IMPLEMENTED ANYWAY

| Risk | Severity |
| --- | --- |
| An invented chart of accounts would become the de-facto accounting policy, silently and without CFO or board authority. | **Critical** |
| Journal entries are immutable by design (Art. 5). Wrong postings could only be corrected by reversal, permanently polluting financial history. | **Critical** |
| Decrementing `treasury_positions.balance` would fabricate the appearance of cash movement with no settlement, no bank instruction and no reconciliation — a false record of financial reality. | **Critical** |
| With no `financial_periods`, entries would post into no period, defeating close, lock and audit controls. | High |
| A demonstration that "capital execution works" would be false completeness: it would prove only that the code path runs, not that money is correctly accounted for. | High |

The governance layer's whole purpose is to prevent unauthorised enterprise
action. Inventing financial authority in order to demonstrate the governance
layer would invert that purpose.

---

## WHAT IS ALREADY PROVEN (unchanged by this finding)

The governed chain up to — and deliberately stopping at — the execution boundary
is real, transactional and verified:

```
PROPOSAL → TABLE → VOTE → VOTED → DECISION → APPROVED
        → GOVERNANCE AUTHORIZATION SIGNAL (read-only)
        → CAPITAL GOVERNANCE GATE (GOVERNANCE_AUTHORIZED)
        → [ EXECUTION — BLOCKED, THIS DOCUMENT ]
```

Baseline re-verified independently during this phase: **293/293 tests pass**,
typecheck, lint and build clean, migration fingerprint
`28ceb656ed7c4ab1211558f9ea107d20`.

A §24 bypass audit found **no** alternative financial mutation path:

| Probe | Result |
| --- | --- |
| Direct journal insertion in `src/` | none |
| Direct treasury balance mutation | none |
| Direct capital status mutation | only `capital-governance-service.ts:310`, inside the governed transaction |
| Next.js server actions (`"use server"`) | none |
| Seed-created `FUNDED` capital state | none created by the pipeline; seeded rows are reference data |

So the boundary genuinely holds: nothing in the system can move money today,
which is the correct state given the above.

---

## OPTIONS

### Option A — Establish the accounting substrate first (recommended)
A separate, properly scoped Finance OS phase that delivers, under CFO authority:

1. a **chart of accounts** (`ledger_accounts`) authored or ratified by the Group CFO;
2. **financial periods** with open/close lifecycle;
3. a canonical **posting service** enforcing balanced double entry, open period,
   valid accounts, tenant/entity scope and currency consistency, with
   `debit = credit` enforced in the database, not only in code;
4. an explicit **capital funding accounting treatment** (which accounts a capital
   drawdown debits and credits).

Only then is "capital execution" a mechanical composition of existing primitives.

**Cost:** a full phase. **Risk:** low. **Correctness:** high.

### Option B — Execution authorization without financial posting
Add an *execution authorization* step (a second human authority, distinct from
governance) that records intent to fund and stops short of accounting. Honest,
but it adds another authorization state without moving the financial problem
forward, and risks a lifecycle where "executed" does not mean executed.

**Cost:** small. **Risk:** medium (semantic confusion). **Value:** low.

### Option C — Implement execution now with an invented CoA and balance decrements
Rejected. Fabricates financial truth, violates §2, §15, §16 and §31, and would
produce exactly the false completeness §25 requires this report to expose.

---

## RECOMMENDED DECISION

**Option A.** Treat the Finance/Ledger substrate as its own phase with the Group
CFO as the deciding authority, then implement capital execution on top of it.

Two questions must be answered by a human before that phase can begin:

1. **Chart of accounts** — who authors and ratifies it, and what accounting
   treatment applies to a capital drawdown (which accounts are debited and
   credited)?
2. **Execution authority** — does `finance:ledger.post` (CFO-only, high-risk,
   excluded from the CEO wildcard) also constitute capital execution authority,
   or is a distinct capability required? The constitution names the CFO as the
   financial authority but does not define the mechanism.

Related, still open from Phase 4: four governance bodies have no eligible
decision authority (`docs/governance/DECISION_AUTHORITY_MODEL.md` §4).

---

## STATUS

**IMPLEMENTATION BLOCKED — no code written, baseline preserved and re-verified.**

This is the designed behaviour of the phase brief: BEYU OS refuses to act rather
than invent authority it does not have. The same principle the governance engine
enforces for resolutions now applies to the system's own construction.
