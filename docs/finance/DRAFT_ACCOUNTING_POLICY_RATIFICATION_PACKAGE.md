# `DRAFT — NOT AUTHORITY`
# `NOT AN APPROVED BEYU ACCOUNTING POLICY`
# `NO ENGINEERING AUTHORIZATION IS GRANTED BY THIS DOCUMENT`

---

**Human-review draft prepared for the Group CFO, Group Board and relevant specialists.**
Phase 5K · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0`

This document is **preparation, not authority**. It proposes accounting policy so
that the competent authorities have something concrete to accept, amend or
reject. Nothing in it has been ratified. Nothing in it authorises engineering.

Every proposed treatment is labelled **`[PROPOSED — REQUIRES RATIFICATION]`** or
**`[PROPOSED — NOT RATIFIED]`**. Where a fact is already established in the
repository it is labelled **`[ESTABLISHED FACT]`** — those are the *only*
statements in this document that carry weight, and they establish framework and
structure, never accounting judgement.

**This draft will be superseded by, not merged into, formally ratified authority.**

---

## Established facts (the only authoritative content here)

| Fact | Evidence |
| --- | --- |
| IFRS is the accounting basis | `legal_entities.accounting_standard` NOT NULL, 8/8 entities |
| Functional currency is per entity | `functional_currency` NOT NULL — 6 TZS, 2 USD |
| Corrections are by reversal, never edit | Constitution Art. 5; enforced by migration `0005` |
| Posting authority is GROUP_CFO only | `finance:ledger.post`, HIGH_RISK, excluded from GROUP_CEO wildcard |
| AI may not post journals | Policy `CONST-AI-001 r3` |
| Capital approval thresholds | `ENT-FIN-002`: ≥ USD 250k → Investment Committee; ≥ USD 1m → Group Board |
| Journals are DB-enforced balanced, ≥2 lines, non-zero, single-sided, immutable | Migration `0005` — 10/10 raw-SQL bypass probes blocked |
| Periods are entity-scoped and cannot overlap | `financial_period_no_overlap`, `financial_period_dates_ordered` |
| Ledger is empty | 0 accounts · 0 periods · 0 entries · 0 lines |

---

## P1 — Recognition basis · `[PROPOSED — REQUIRES RATIFICATION]`

| Item | Proposal |
| --- | --- |
| **Basis** | **Accrual.** Rationale: IFRS is the established framework and accrual is its default posture. **This is a proposal, not an inference of authority — IFRS establishes the framework; BEYU must still adopt the policy.** |
| **Recognition event** | Receipt of a valid supplier invoice, **or** receipt of goods/services where earlier. **[FACT]** Neither event exists in the schema today; ratification must also identify the artefact that evidences it |
| **Payable/accrual treatment** | Obligation recognised as a liability at recognition; cash untouched until settlement |
| **Reversal/correction** | **[ESTABLISHED FACT]** Reversal only — no edits, no deletes |
| **Supporting evidence** | Supplier invoice or delivery/commissioning document, linked to the journal entry. **[FACT]** No such linkage exists today |
| **Alternatives the CFO may prefer** | Cash basis (recognise at payment) · control-transfer basis (IAS 16 strict) · staged/percentage-of-completion for multi-period construction |

> **Selection-bias warning, restated.** Accrual has the side effect of removing
> the opening-cash blocker from a first pilot, because the entry is asset/payable
> and touches no cash. **That is a consequence, not a justification.** The basis
> must be chosen on accounting merit.

---

## P2 — Capital treatment by request type · `[PROPOSED — REQUIRES RATIFICATION]`

**No account numbers are proposed anywhere in this section.**

### CAPEX

| Dimension | Proposal |
| --- | --- |
| Economic substance | Acquisition of property, plant and equipment (IAS 16) |
| Recognition event | Per P1 |
| Debit class | Property, plant & equipment — or *assets under construction* until commissioned |
| Credit class | Trade/capital payable (accrual) or cash/bank (cash basis) |
| Cash vs payable | Payable under P1 |
| Capitalise vs expense | Capitalise at or above a threshold. **No threshold proposed — CFO decision** |
| Subsequent treatment | Depreciation over useful life; method, life and residual all **PENDING** |
| Reversal | Reversing entry only |
| Supporting documents | Invoice; asset register entry. **[FACT]** No asset register exists |
| Approval | **[ESTABLISHED FACT]** `ENT-FIN-002` by amount |
| Tax | TZ capital allowances; deferred tax on the book/tax gap — **specialist** |
| Entity-specific | Applies to any entity holding PP&E |

### OPEX

| Dimension | Proposal |
| --- | --- |
| Economic substance | Period expense |
| Recognition event | Per P1 |
| Debit class | Expense (by function or nature — **PENDING**) |
| Credit class | Payable or cash |
| Capitalise vs expense | Expense |
| Subsequent | None |
| Entity-specific | **[FACT]** BEYU-FDN is a root FOUNDATION with no parent; a programme grant may be **grant accounting**, not ordinary opex. Requires separate consideration |

### INVESTMENT

| Dimension | Proposal |
| --- | --- |
| Economic substance | **Genuinely ambiguous** — equity injection, intercompany loan, or the operating company's own capex funded from group cash |
| Debit class | Investment in subsidiary · intercompany receivable · or PP&E — **depends entirely on substance** |
| Credit class | Cash · intercompany payable · or share capital and premium |
| Subsequent | Cost / equity method / fair value; IFRS 10 elimination; impairment |
| Supporting documents | Share subscription **or** loan agreement — legally different instruments |
| Approval | ≥ USD 1m is a Group Board reserved matter |
| Warning | **Almost always intercompany**, which is deferred. Should not be in a first pilot |

### FINANCING

| Dimension | Proposal |
| --- | --- |
| Economic substance | Debt drawdown **or** provision of regulatory capital — **opposite balance-sheet effects** |
| Debit / credit | Borrowing: debit cash, credit loan liability. Regulatory capital: parent debits investment, subsidiary credits share capital |
| Subsequent | Interest accrual; amortised cost (IFRS 9) if debt |
| Tax | WHT on interest; thin capitalisation — **specialist** |

### RESERVE

| Dimension | Proposal |
| --- | --- |
| Economic substance | Designation of funds, not a third-party transaction |
| **Journal required?** | **Possibly none.** Three structurally different options: (i) memorandum/treasury designation with **no journal**; (ii) cash → restricted cash (asset↔asset); (iii) retained earnings → equity reserve. Only (iii) touches equity |
| Blocking dependency | **[FACT]** The waterfall RESERVE tier cites *"Board treasury policy ENT-FIN-005"*, which **does not exist** in the policy register. Board action required |

---

## P3 — Measurement · `[PROPOSED — REQUIRES RATIFICATION]`

| Item | Proposal |
| --- | --- |
| Historical cost | Default measurement basis for PP&E (IAS 16 cost model) |
| Fair value | Where IFRS requires it; scope **PENDING** |
| Transaction-date measurement | Cost at the recognition date per P1 |
| Subsequent measurement | Cost less accumulated depreciation and impairment |
| **Materiality** | **No threshold proposed.** CFO decision — drives the capitalisation cut-off |
| **Rounding** | **[FACT]** TZS has no minor unit in practice; USD has 2 dp. `journal_lines.debit/credit` are numeric. Rounding convention **PENDING** |
| VAT in measurement | **[FACT]** `capital_requests` has **no tax flag** — whether an amount is VAT-inclusive is **unknown**. Specialist + CFO |

---

## P4 — Currency and FX

### Established

**[ESTABLISHED FACT]** IFRS basis; per-entity functional currency (6 TZS, 2 USD).

### Proposed · `[PROPOSED — REQUIRES RATIFICATION]`

| Item | Proposal |
| --- | --- |
| Transaction currency | Recorded on the entry (`journal_entries.currency` exists) |
| **Reporting currency** | **[FACT]** No column, no policy. `OBL-IFRS-CONSOL` is ACTIVE, so a presentation currency is required for consolidation. **PENDING** |
| **FX source** | **No provider proposed.** Candidates a specialist may consider include a central-bank published rate or a named bank rate — **BEYU must name one** |
| Rate timestamp | Spot rate at transaction date (IAS 21) |
| Rounding | **PENDING** |
| Realised FX | On settlement, to P&L |
| Unrealised FX | On retranslation of monetary items at period end |
| Revaluation | Monetary items at each reporting date |
| Historical rates | Non-monetary items at historical rate |
| Net investment in a foreign operation | IAS 21 sends differences to **OCI** — directly relevant to BEYU-HLD (USD) → BEYU-TZH (TZS) |
| Missing/stale rate | **Proposal: refuse to post** rather than default `fx_rate` to `1` |

> **[FACT] The seeded treasury implies three mutually inconsistent USD/TZS rates
> (2,613.3333 / 2,613.8434 / 2,615.3846). These must never be used as a rate
> source** — they disagree with each other, are seed data, are quotients of
> rounded balances, and carry no effective date. **No exchange rate is proposed
> in this draft.**

---

## P5 — Chart of accounts · `[PROPOSED — REQUIRES RATIFICATION]`

**No database accounts created. No permanent account numbers invented.**

| Item | Proposal |
| --- | --- |
| **Ownership** | Group CFO owns the CoA; changes require CFO approval |
| **Scope model** | Three viable models — **(A)** tenant/group-wide, **(B)** per legal entity, **(C)** shared canonical with entity applicability. **Proposal: C** for a 3-jurisdiction IFRS-consolidating group. **Not a decision** |
| **Known constraints** | **[FACT]** `ledger_accounts.code` is **globally unique** (forecloses naive per-entity codes without a migration); **[FACT]** `ledger_accounts` has **no `legal_entity_id`** while periods and entries are entity-scoped |
| Account-code governance | Structured numeric ranges by class; scheme **PENDING** |
| Account classes | **[ESTABLISHED FACT]** enum-fixed: `ASSET \| LIABILITY \| EQUITY \| REVENUE \| EXPENSE` |
| Normal balance | Assets/expenses debit; liabilities/equity/revenue credit |
| FS classification | Via `ifrs_category`; values **PENDING** |
| Effective dating | Accounts carry `active`; no effective-date column exists |
| Versioning | Accounts are deactivated, never deleted, once used |
| Approval of changes | CFO; architecture changes also engage the Architecture Review Board (Art. 11) |

---

## P6 — Initial CoA tranche · all `[PROPOSED — NOT RATIFIED]`

Conceptual minimum for a first pilot. **No account numbers.**

| # | Class | Purpose | Normal balance | Required for pilot? |
| --- | --- | --- | --- | --- |
| 1 | **PP&E** (ASSET) | Debit side of a CAPEX recognition | Debit | **Yes** |
| 2 | **Trade/capital payable** (LIABILITY) | Credit side under accrual | Credit | **Yes, if P1 = accrual** |
| 3 | **Cash/bank** (ASSET) | Credit side under cash basis; settlement target | Debit | Only if P1 = cash basis |
| 4 | **Expense** (EXPENSE) | OPEX pilots | Debit | No — not for a CAPEX pilot |
| 5 | **Opening-balance equity** (EQUITY) | Counterpart for opening positions | Credit | Only if opening balances are required |

**Minimum for an accrual CAPEX pilot: accounts 1 and 2 — two accounts.**

---

## P7 — Financial calendar · `[PROPOSED — REQUIRES RATIFICATION]`

| Item | Proposal |
| --- | --- |
| Fiscal year | **No year-end proposed.** **[FACT]** Board-level: it drives statutory reporting across MU, AE and TZ |
| Period structure | Monthly — aligns with `OBL-TZ-VAT` monthly filing |
| Period start/end | Calendar month boundaries |
| Timezone | **Proposal:** period boundaries evaluated in a single declared timezone. **[FACT]** `starts_on`/`ends_on` are DATE columns, so no timezone is stored — the convention must be stated in policy |
| Who establishes | Group CFO |
| Board approval | Required for the fiscal-year convention |

---

## P8 — Period lifecycle · `[PROPOSED — REQUIRES RATIFICATION]`

**[FACT]** The enum already contains `OPEN | CLOSING | CLOSED | LOCKED` — note the
existing value is `CLOSING`, **not** `ACTIVE`. This draft proposes meanings for
the values that exist rather than introducing new ones.

| Status | Proposed meaning |
| --- | --- |
| `OPEN` | Normal posting permitted |
| `CLOSING` | Adjusting entries only, by CFO authority |
| `CLOSED` | No posting; reversals land in the current open period |
| `LOCKED` | Audit lock; irreversible without Board authority |

| Item | Proposal |
| --- | --- |
| Reopening authority | **Proposal: prohibited.** If ever permitted, a reserved matter |
| Backdating | Prohibited into `CLOSED`/`LOCKED`; permitted within `OPEN` |
| Posting restrictions | Every entry must reference an `OPEN` period of the same legal entity. **[FACT]** `journal_entries.period_id` is **NULLABLE** today — a control gap this policy would close |
| Overlap protection | **[ESTABLISHED FACT]** already DB-enforced |
| Who opens / closes | **[FACT]** No period-management permission exists — nobody can open a period today. A new permission would be required |

---

## P9 — Maker / checker · `[PROPOSED — REQUIRES RATIFICATION]`

**`finance:ledger.approve` has NOT been created.**

| Item | Proposal / fact |
| --- | --- |
| Maker | Prepares and submits the entry (`posted_by`) |
| Checker | Independently approves (`approved_by`). **[FACT]** The column exists and is written by **no code path** |
| Self-approval | **Proposal: prohibited.** **[FACT] Critical consequence:** GROUP_CFO is the **only** holder of `finance:ledger.post`, so a strict prohibition makes posting **impossible** until a second authorised human exists. The CFO must resolve this explicitly |
| CFO | Retains posting authority (Art. 5) |
| CEO | **[FACT]** Deliberately excluded from `finance:ledger.post`. **Any new permission would be auto-granted by the GROUP_CEO wildcard unless explicitly excluded** |
| Internal Audit | Reports to the Risk & Audit Committee (Art. 8); natural owner of control attestation |
| AI | **[FACT]** `CONST-AI-001 r3` denies AI `finance:ledger.post` **by name**. A new approve permission would **not** be covered — the policy would need extending, or AI could formally approve journals |
| `finance:ledger.post` | Today a single undifferentiated permission — **logically incompatible with maker/checker**, since one permission cannot separate duties |
| Possible `finance:ledger.approve` | **Not created.** If ratified as necessary: identify the approving authority, affected roles, CEO wildcard exclusion, and AI denial **before** implementation |

---

## P10 — Pilot transaction · `[PROPOSED — REQUIRES RATIFICATION]`

| Characteristic | Proposal |
| --- | --- |
| Legal entity | One TZS-functional entity (e.g. BEYU-AGR) |
| Currency | **TZS** — so `fx_rate = 1` is arithmetically **correct**, not a placeholder |
| Transaction type | CAPEX |
| Treatment | Single accrual recognition: PP&E / payable |
| Intercompany | None — self-funded only |
| FX | None |
| Treasury movement | None |
| Amount | Below the `ENT-FIN-002` USD 250k threshold on any plausible rate, so no threshold conversion is needed |

**[FACT] Constraints honoured:** `CAP-2025-004` is **excluded** — its resolution
`BEYU-IC-2025-021` is **TABLED** and Investment Committee approval is
insufficient above USD 1m. **[FACT]** There are **zero TZS capital requests**, so
a pilot requires a genuine new business transaction. **No capital request was
created and no existing request was mutated.**

---

## P11 — Execution boundary · `[PROPOSED — REQUIRES RATIFICATION]`

The five layers must remain distinct. **[FACT]** The governance gate already
honours this: it *"moves no money, posts no journal entry, creates no ledger
record, issues no treasury instruction and calls no external system."*

```
Governance decision      — a body resolves (Art. 4)                    [IMPLEMENTED]
        ↓
Capital authorization    — GOVERNANCE_AUTHORIZED on the request        [IMPLEMENTED]
        ↓
Accounting recognition   — when the obligation enters the books (P1)   [NOT IMPLEMENTED]
        ↓
Ledger posting           — the journal entry itself (CFO, Art. 5)      [NOT IMPLEMENTED]
        ↓
Treasury execution       — money actually moves                        [NOT IMPLEMENTED]
```

**Proposed principle:** governance approval means *"the action is authorised"* —
**not** *"the transaction must now be executed."* No layer may impersonate
another; approval alone must never trigger money movement.

---

## §3 — Authority matrix

| P# | Proposed decision | Current status | Required authority | Evidence | Dependencies | Implementation consequence | Ratification required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Accrual; recognition at invoice/receipt | **PENDING — NOT RATIFIED** | Group CFO | None | — | Determines whether cash is touched; unblocks P2, P6 | **Yes** |
| P2 | Per-type debit/credit classes | **PENDING — NOT RATIFIED** | Group CFO | None | P1 | Defines every posting | **Yes** |
| P3 | Historical cost; materiality; rounding | **PENDING — NOT RATIFIED** | CFO + specialist (VAT) | None | P1 | Sets carrying value | **Yes** |
| P4 | Reporting currency; FX source and treatment | **PENDING — NOT RATIFIED** | CFO + specialist | Functional currency established | — | Blocks all cross-currency posting | **Yes** |
| P5 | CoA ownership, scope, code governance | **PENDING — NOT RATIFIED** | CFO + Architecture Review Board | None | — | Determines whether a migration is needed | **Yes** |
| P6 | Initial 2–5 account classes | **PENDING — NOT RATIFIED** | Group CFO | None | P1, P5 | Enables the first posting | **Yes** |
| P7 | Fiscal year; monthly periods | **PENDING — NOT RATIFIED** | CFO; **Board** for fiscal year | None | — | Enables period creation | **Yes** |
| P8 | Period lifecycle semantics | **PENDING — NOT RATIFIED** | Group CFO | Enum + overlap constraint exist | P7 | Closes the nullable-period gap | **Yes** |
| P9 | Maker/checker model | **PENDING — NOT RATIFIED** | CFO; **Board** if authority moves | `CTL-FIN-002` (declarative only) | — | Determines whether a permission is needed | **Yes** |
| P10 | TZS CAPEX pilot | **PENDING — NOT RATIFIED** | Group CFO | None | P1–P9 | The first real transaction | **Yes** |
| P11 | Five-layer execution boundary | **PENDING — NOT RATIFIED** | CFO; **Board** if new capability | Gate implemented | P1–P10 | Governs capital execution | **Yes** |

**No decision IDs, dates, signatures or approvals are fabricated.**

---

## §3b — Consequence matrix

Completes the per-decision fields not expressible in the matrix above. **Every
row remains `PENDING — NOT RATIFIED`.**

| P# | Exceptions | Migration consequence | Historical-data consequence | Reversibility |
| --- | --- | --- | --- | --- |
| **P1** Recognition basis | None proposed. Any per-entity or per-type carve-out must be ratified explicitly | None — `journal_lines` supports any account class | None — ledger is empty | **Low.** Posted entries are immutable; a later change of basis applies prospectively and creates a comparability break |
| **P2** Capital treatment | RESERVE may require **no journal at all**; the Foundation's OPEX may be grant accounting rather than ordinary opex | None for a single posting. An asset register would require one | None | **None once posted** — a wrong treatment is permanent history, correctable only by reversal |
| **P3** Measurement | Materiality threshold may exempt small items from capitalisation | None | None | **None once posted** — carrying value flows into every later depreciation entry |
| **P4** Currency / FX | A single-functional-currency transaction needs no rate (`fx_rate = 1` is arithmetically correct, not a placeholder) | **Yes, eventually** — a rate-source table and a reporting-currency concept do not exist | None now; a wrong rate would be permanent | **None once posted** |
| **P5** CoA scope | — | **Model A: none. Models B, C, D: required** (global `code` uniqueness forecloses naive per-entity codes) | None now. **Choosing A now and B/C later WOULD affect posted history** | **Low.** Once accounts carry immutable entries, re-scoping is a mapping exercise, not an edit |
| **P6** Initial tranche | Accounts 3–5 are needed only under a cash basis or if opening balances are required | None — rows only, no DDL | None | Accounts may be deactivated (`active`), never deleted once used |
| **P7** Financial calendar | Statutory year may differ from group year per jurisdiction (MU, AE, TZ) | None — table exists and is already constrained | None | Frequency is reversible **before** posting begins, not after |
| **P8** Period lifecycle | Adjusting entries during `CLOSING`, if ratified | None — statuses already exist in the enum | None | High before posting; low afterwards |
| **P9** Maker/checker | Emergency/break-glass path, if any, must be ratified explicitly — none proposed | None — `approved_by` already exists | None — zero postings exist | Permission grants are reversible; **entries approved under a weak model are not** |
| **P10** Pilot transaction | — | None | None | High — a pilot may be reversed and re-run under corrected policy |
| **P11** Execution boundary | — | Depends on whether a new capability is ratified | None | High — nothing implemented |

---

## §3c — Per-decision ratification records

**Status: `PENDING — NOT RATIFIED` for all eleven. Every field below is deliberately blank.**

§3 states who must decide, §3b states the consequences, and §7 states the minimum artifact.
This section is the **mechanically completable record** for each decision: the block an
authority fills in, and the acceptance criterion engineering must satisfy afterwards.

Rules governing this section:

* No engineer, agent or tool may populate any field below. Only the named authority may,
  and the completed decision must additionally be recorded as an APPROVED resolution in
  BEYU OS via the governed decision path — see the authority-verification note below.
* A decision is consumable by engineering **only** at `RATIFIED / EFFECTIVE` (§7), never at
  APPROVED.
* An acceptance criterion is **not** an implementation instruction. It states how the ratified
  decision will be proven, not what the decision should be.

> **Authority verification (carried from Phase 5S).** All four seeded resolutions evaluate to
> `provenance = REFERENCE_DATA`, and the capital gate refuses to act on `REFERENCE_DATA`. A
> ratification inserted as seed or direct data edit will therefore be **correctly ignored** by
> the system. Each ratification must be enacted through the governed voting/decision path so
> that it acquires a `GOVERNED` audit trail.

---

### P1 — Recognition basis

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** A posting derived from the ratified basis produces the ratified recognition event, evidenced by the named artefact, and a behavioural test asserts no cash account is touched when the basis is accrual.

### P2 — Capital treatment by request type

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** For every request type in pilot scope, the posting service derives the ratified debit and credit classes from the capital request alone; no route may supply them.

### P3 — Measurement

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** Carrying value equals the ratified measurement basis; rounding and materiality are applied by the service, and a test proves a sub-threshold item is treated as ratified.

### P4 — Currency and FX

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** A single-functional-currency posting uses fx_rate = 1; any cross-currency posting resolves its rate from the ratified named source, never from treasury balances.

### P5 — Chart of accounts scope

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** Account codes conform to the ratified numbering scheme and scope model; a test proves an out-of-scheme code is rejected.

### P6 — Initial CoA tranche

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** Exactly the ratified accounts exist, with ratified account_type and ifrs_category; no account outside the ratified list is created.

### P7 — Financial calendar

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** Periods generated match the ratified fiscal year-end and frequency, with no gaps or overlaps (already constrained by gist).

### P8 — Period lifecycle

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** Posting is permitted only into a period whose status the ratification declares postable; a test proves posting into every other status is refused.

### P9 — Maker / checker

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** The ratified maker/checker separation is enforced by the service; a test proves the maker cannot approve their own entry if self-approval is prohibited.

### P10 — Pilot transaction

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** The pilot posts balanced, is linked to its governance provenance, and the full before/after financial state is evidenced.

### P11 — Execution boundary

```
DECISION ID:            ______________________________________
EXACT DECISION TEXT:    ______________________________________
                        ______________________________________
SELECTED OPTION:        ______________________________________
APPROVING AUTHORITY:    ______________________________________
AUTHORITY BASIS:        ______________________________________
APPROVAL STATUS:        [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVAL DATE:          ______________________________________
EFFECTIVE DATE:         ______________________________________
SCOPE (entities):       ______________________________________
SCOPE (currencies):     ______________________________________
CONDITIONS:             ______________________________________
EXCEPTIONS:             ______________________________________
SUPERSEDES:             ______________________________________
EVIDENCE / REFERENCE:   ______________________________________
SPECIALIST SIGN-OFF:    ______________________________________  (where §7 requires)
BOARD SIGN-OFF:         ______________________________________  (where §7 requires)
```

**Implementation acceptance criterion.** Governance authorization alone cannot execute; execution requires the ratified execution authority, and a test proves an authorized-but-not-execution-eligible request is refused.

---

## §7 — FORMAL RATIFICATION REQUIREMENTS

Status vocabulary, in ascending order of force:

| Status | Meaning | May engineering consume it? |
| --- | --- | --- |
| **DRAFT** | May be discussed | **No** |
| **RECOMMENDATION** | May be evaluated | **No** |
| **APPROVED** | Authority has formally approved the decision | **No** — not until effective |
| **RATIFIED / EFFECTIVE** | Organizationally effective | **Yes — and only this** |
| **SUPERSEDED** | Replaced by a later decision | No — consume the successor |

> **Engineering must consume ONLY `RATIFIED / EFFECTIVE` decisions.**
> This entire document is **DRAFT**. Nothing in it is consumable.

What must exist before engineering may consume each decision:

| P# | Minimum ratification artifact | Approving authority | Blocks until ratified |
| --- | --- | --- | --- |
| **P1** | Written policy naming the basis **and** the recognition event, with the artefact that evidences it | Group CFO | Posting service; P2; P6 |
| **P2** | Debit class and credit class per request type in scope for the pilot | Group CFO | All posting |
| **P3** | Measurement basis, materiality threshold, rounding convention, VAT-inclusive/exclusive determination | Group CFO + tax specialist (VAT) | Capitalised amount |
| **P4** | Reporting currency **and** named FX rate source with rate-date convention | Group CFO + specialist (IAS 21) | All cross-currency posting. **Not required for a single-functional-currency pilot** |
| **P5** | CoA scope model + numbering scheme + owner | Group CFO **and** Architecture Review Board (Art. 11) | CoA creation; determines migration need |
| **P6** | Explicit account list: code, name, `account_type`, `ifrs_category`, entity scope | Group CFO | First posting |
| **P7** | Fiscal year-end + period frequency + period-open authority | Group CFO; **Group Board** for the fiscal-year convention | Period creation |
| **P8** | Semantics for `OPEN`/`CLOSING`/`CLOSED`/`LOCKED`, reopening rule, and whether `period_id` is mandatory | Group CFO | Posting restrictions |
| **P9** | Maker/checker model; whether the CFO may self-approve; if a new permission is required, its CEO-wildcard exclusion and `CONST-AI-001` extension | Group CFO; **Group Board** if authority moves outside the CFO | Posting service; any new capability |
| **P10** | Identification of a real, governed business transaction | Group CFO, under `ENT-FIN-002` | The pilot |
| **P11** | Statement of what governance authorization does and does not authorise; any `capital:execute` capability | Group CFO; **Group Board** for a new constitutional power | Capital execution |

**Conditional specialist artifacts**, required only where the ratified pilot
actually creates the consequence: VAT recoverability · withholding tax ·
capital allowances · deferred tax · FX rate source · opening-balance evidence
(external auditor).

**Provenance required on every ratification artifact** (13 fields): decision ID ·
approving body · authority basis · approval status · approval date · effective
date · exact decision text · scope · conditions · applicable entities ·
applicable currencies · supersession · supporting evidence.

### Document lifecycle

```
DRAFT → REVIEW → FORMAL APPROVAL → RATIFIED → EFFECTIVE → IMPLEMENTED → SUPERSEDED
  ▲
  └── this document is here
```

**[FACT]** No new database status, policy state or accounting-period state was
created to represent this lifecycle. It is tracked in documentation only. The
existing governance mechanism (`resolutions`, `policies`) already carries formal
approval where an organizational record is required.

---

## §4 — Ratification page

> This document becomes authoritative **only** after the required authority
> formally approves the relevant decision and the approval is recorded with
> sufficient provenance (decision ID, approving body, authority basis, approval
> status, approval date, effective date, exact decision, scope, conditions,
> applicable entities and currencies, supersession, supporting evidence).
> **Signing one section does not ratify the others.**

### GROUP CFO

```
Decisions ratified (list P-numbers):  ______________________________________

Name:              ______________________________________
Signature:         ______________________________________
Decision ID:       ______________________________________
Approval date:     ______________________________________
Effective date:    ______________________________________
```

### GROUP BOARD

```
Decisions ratified (fiscal year / new capability / ENT-FIN-005 / CAP-2025-004):
                   ______________________________________

Chair or authorized representative:  ______________________________________
Signature:         ______________________________________
Resolution ID:     ______________________________________
Approval date:     ______________________________________
Effective date:    ______________________________________
```

### SPECIALIST REVIEW

```
Specialist:        ______________________________________
Area (VAT / WHT / capital allowances / deferred tax / FX / opening balances):
                   ______________________________________
Opinion:           ______________________________________
Signature:         ______________________________________
Date:              ______________________________________
```

### INTERNAL AUDIT / CONTROL OWNER

```
Name:              ______________________________________
Control:           CTL-FIN-002
Disposition:       ______________________________________
Signature:         ______________________________________
Date:              ______________________________________
```

---

## §11 — How the real ratification will be introduced

When a signed or formally approved decision becomes available, the next phase must:

1. **Verify provenance** — all 13 fields above.
2. **Verify authority** — is this body competent for *this* decision?
3. **Verify approval status** — APPROVED only; never DRAFT or TABLED.
4. **Verify effective date** — present where required.
5. **Map each decision to P1–P11**, marking RATIFIED / PARTIALLY RATIFIED / PENDING / REJECTED / SUPERSEDED.
6. **Identify missing decisions** in the minimum implementation package.
7. **Build a decision → code traceability matrix**: decision → policy → domain rule → DB invariant → service rule → test → audit evidence.
8. **Implement only authorised scope**, smallest tranche first.
9. **Test** — full suite, finance regression, integrity probes, governance regression, atomicity, idempotency, concurrency, reversal, period enforcement, audit chain.
10. **Prove no unauthorised financial side effects.**

**The ratification document may supersede this draft. This draft must never be
treated as authority.**

---

## Scope statement

**[FACT]** This draft created no chart of accounts, no financial period, no
journal entry, no posting service, no capital execution, no permission, no
opening balance, no capital request, no FX rate and no migration.
`CTL-FIN-002` was not modified. `CAP-2025-004` and its resolution were not
altered. Ledger: **0 accounts, 0 periods, 0 entries, 0 lines.**

Prior artifacts: `PHASE_5_AUTHORITY_GATE.md`,
`ACCOUNTING_POLICY_RATIFICATION_REGISTER.md`,
`CFO_ACCOUNTING_POLICY_DECISION_PACKAGE.md`,
`CFO_ACCOUNTING_POLICY_DECISION_REGISTER.md`,
`CFO_DECISION_WORKSHEET_PHASE_5D.md`,
`CFO_ACCOUNTING_POLICY_DECISIONS.md`,
`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md`.
