# Accounting policy discovery — evidence, gaps and decisions required

Status: **DECISION PREPARATION. No implementation.**
Phase: 5B (policy discovery), 2026-08-21.
Baseline independently re-verified: 311/311 tests, fingerprint
`8bafa4b0f09c62a918933158789df01c`, typecheck/lint/build clean, ledger empty
(0 accounts, 0 periods, 0 entries, 0 lines).

This document exists so the Group CFO can make the accounting decisions that
Phase 5/5A found to be missing. It **records evidence and frames options**. It
does not choose treatments, create accounts, or write code.

Every statement is labelled:

| Label | Meaning |
| --- | --- |
| **[FACT]** | Authoritative: stated in the constitution, a policy, a control, an ADR, or enforced by schema/code. Source given. |
| **[BEHAVIOUR]** | How the system currently behaves. Descriptive, not authoritative. |
| **[RECOMMENDATION]** | Engineering opinion. Carries no authority. |
| **[CFO DECISION]** | Requires the Group CFO (Constitution Art. 5). |
| **[BOARD DECISION]** | Requires the Group Board / Family Council. |

---

## §2 — Evidence matrix

| Question | Evidence | Source | Authority | Status |
| --- | --- | --- | --- | --- |
| **Accounting basis** | `accounting_standard` NOT NULL default `IFRS`; all 8 entities = IFRS; `ledger_accounts.ifrs_category` column; compliance register lists IFRS 10; `tax_strategies.accounting_effect` cites **IAS 12** | schema `core.ts:91`, `finance.ts:54`, seeded obligations, `tax_strategies` | Schema default + compliance register | **RESOLVED** |
| **Functional currency** | Per-entity `functional_currency` NOT NULL: USD (BEYU-FT `MU`, BEYU-HLD `AE`), TZS (6 TZ entities) | schema `core.ts:90` + data | Schema constraint | **RESOLVED** |
| **Reporting (presentation) currency** | **No column, no policy, no doc.** `treasury_positions.base_currency_balance` implies *a* base currency but never names it | exhaustive column scan | — | **UNRESOLVED** |
| **Accounting periods** | Table exists (`legal_entity_id`, `code`, `starts_on`, `ends_on`, status `OPEN\|CLOSING\|CLOSED\|LOCKED`); 0 rows; overlap + date order now enforced (migration `0005`) | `finance.ts:27`, migration `0005` | Structure only | **PARTIALLY RESOLVED** — no calendar, no closing authority, no `CLOSING` vs `LOCKED` semantics |
| **Chart of accounts** | Table exists with `code`, `account_type` (`ASSET\|LIABILITY\|EQUITY\|REVENUE\|EXPENSE`), `ifrs_category`, `parent_account_id`, `active`; **0 rows**; no CoA anywhere in docs, seed or code | `finance.ts:44`; DB count | Structure only | **UNRESOLVED** (content) |
| **Capital treatment** | `request_type` = `CAPEX\|OPEX\|INVESTMENT\|FINANCING\|RESERVE`; **no debit/credit mapping anywhere** | `finance.ts:134` | — | **UNRESOLVED** |
| **Intercompany** | Hierarchy Trust→Holding→Country→Operating is real; risk `ERM-003` (transfer pricing); tax strategy: *"Intercompany charge eliminated on consolidation"*; IFRS 10 consolidation obligation | `legal_entities`, `risks`, `tax_strategies`, obligations | Existence acknowledged | **PARTIALLY RESOLVED** — recognised as real, no accounting model |
| **Tax / VAT** | No VAT/withholding account concept in finance schema; tax lives in `tax_strategies` (assessment only, never posted); IAS 12 deferred tax named in one `accounting_effect` | schema scan | — | **UNRESOLVED** |
| **FX** | `journal_entries.fx_rate` exists (default `1`); **no rate source table, no reporting currency, no revaluation policy**; **all 4 seeded capital requests are USD against TZS entities** | `finance.ts:76`; data | Field exists only | **UNRESOLVED** |
| **Execution definition** | Governance gate stops at `GOVERNANCE_AUTHORIZED`; no `capital:execute` capability; treasury is a dated snapshot, no transaction table | Phase 4/5 code + schema | — | **UNRESOLVED** |
| **Posting authority** | `finance:ledger.post` exists, in `HIGH_RISK_PERMISSIONS`, granted **explicitly only to `GROUP_CFO`**, and **excluded from the `GROUP_CEO` wildcard** (1 of only 3); AI policy `CONST-AI-001 r3` **denies** AI posting; control `CTL-FIN-002` "Maker/checker on all journal postings" (owner GROUP_CFO, PREVENTIVE, AUTOMATED) | `constants.ts:63,96,132`, `policies`, `controls` | Constitution Art. 5 + policy + control | **RESOLVED** (who) / **PARTIALLY RESOLVED** (maker-checker mechanics) |

**Score: 3 RESOLVED · 3 PARTIALLY RESOLVED · 5 UNRESOLVED.** Unchanged from
Phase 5A after an exhaustive re-search — no new authoritative source was found.

### Authoritative statements located (verbatim)

- **[FACT]** Constitution **Art. 5**: *"Finance OS is authoritative for financial
  consequences. Financial history is immutable; corrections are made by
  controlled reversal or adjustment. Waterfall distributions execute only under
  an approved configuration."* — Authority: **Group CFO under board delegated authority.**
- **[FACT]** Constitution **Art. 4**: material decisions must be traceable to
  *"who, what, when, why, under which authority, on which data, under which
  policy, with which approvals and with which consequences"*; reserved matters
  require the competent body.
- **[FACT]** Constitution **Art. 8**: append-only hash-chained audit; no
  component may alter or delete history.
- **[FACT]** Policy **ENT-FIN-002** (owner GROUP_CFO): capital **≥ USD 250,000**
  → Investment Committee; **≥ USD 1,000,000** → Group Board reserved matter.
  Conditions are **amount-based only — not `request_type`-based**.
- **[FACT]** Policy **CONST-AI-001 r3**: AI-initiated `finance:ledger.post` is
  **DENIED** (Art. 5 & 6).
- **[FACT]** Control **CTL-FIN-002**: *"Maker/checker on all journal postings"*,
  PREVENTIVE, AUTOMATED, owner GROUP_CFO, currently marked EFFECTIVE.
- **[FACT]** Knowledge **"Enterprise distribution waterfall doctrine"**: cash
  applied in strict tier order — statutory taxes, operating costs, debt service,
  mandatory reserves, capital allocation, foundation allocation, then owner /
  beneficiary distributions; *"any deviation requires a board resolution"*.
- **[BEHAVIOUR]** Waterfall tiers seeded in that exact order (`TAX`, `OPEX`,
  `DEBT`, `RESERVE`, `CAPEX`, `FOUNDATION`, `OWNER`) with legal bases
  referencing *"Board treasury policy ENT-FIN-005"* and *"Capital allocation
  policy ENT-FIN-002"*.

> **[FACT] Note on ENT-FIN-005.** Waterfall tier `RESERVE` cites *"Board treasury
> policy ENT-FIN-005"*, but **no policy with that code exists** in the `policies`
> table (only `ENT-FIN-002` and `ENT-FIN-003`). A referenced treasury policy is
> missing — relevant to `RESERVE` treatment below.

---

## §3 — Q7: capital drawdown treatment, per request type

**[FACT]** The five types exist and are distinct values.
**[FACT]** No debit/credit treatment is defined for **any** of them.
**[BEHAVIOUR]** All 4 seeded requests are denominated **USD** while their
entities are **TZS**-functional — so FX applies to every real example.

For each type below, the economic reading is a **[RECOMMENDATION]** offered to
frame the CFO's decision. The **account classes are named as IFRS classes only** —
no account codes are proposed, because the chart of accounts does not exist.

### CAPEX — seeded example `CAP-2025-011`, USD 640,000, BEYU-AGR (irrigation and mechanisation)

| Aspect | Assessment |
| --- | --- |
| **A. Economic substance** | **[RECOMMENDATION]** Acquisition/construction of property, plant and equipment (IAS 16). |
| **B. Recognition event** | **[CFO DECISION]** Candidates: commitment, invoice, **receipt of the asset**, or payment. IAS 16 recognises on control transfer, i.e. receipt — but BEYU has no goods-receipt or invoice concept, so nothing in the system currently signals it. |
| **C. Debit class** | **[RECOMMENDATION]** Property, plant & equipment (asset). Possibly *Assets under construction* until commissioned. |
| **D. Credit class** | **[CFO DECISION]** Cash/bank if paid immediately, or trade payable if invoiced first. Determined by (B). |
| **E. Timing** | **[CFO DECISION]** Capitalisation may precede payment. Requires a liability stage the current model lacks. |
| **F. Subsequent** | **[CFO DECISION]** Depreciation method, useful life, residual value, impairment testing (IAS 16/36). None defined. |
| **G. Reversal** | **[FACT]** Reversing entry only (Art. 5; enforced by migration `0005`). |
| **H. Documentation** | **[CFO DECISION]** Not defined. Governance requires `dataBasis` on the resolution, but no invoice/asset register requirement exists. |
| **I. Governance** | **[FACT]** ENT-FIN-002 by **amount**: 640,000 → Investment Committee. |
| **J. Tax** | **[CFO DECISION]** TZ capital deductions (Third Schedule) — the seeded tax strategy already claims a capital allowance and IAS 12 deferred tax, so CAPEX has a live tax interaction. |
| **K. Entity** | **[CFO DECISION]** Operating company holds the asset; funding may come from a parent — see §4. |

### OPEX — seeded example `CAP-2025-019`, USD 180,000, BEYU-FDN (Foundation programme funding)

| Aspect | Assessment |
| --- | --- |
| **A.** | **[RECOMMENDATION]** Period expense, not capitalised. **[FACT]** A Foundation *programme grant* may not be ordinary opex at all — grant accounting differs. |
| **B.** | **[CFO DECISION]** Expense when incurred (accrual) vs when paid. **[FACT]** No accrual/cash-basis statement exists anywhere; IFRS implies accrual but this is inference, not a recorded decision. |
| **C.** | **[RECOMMENDATION]** Expense (possibly a distinct *grant expense* for the Foundation). |
| **D.** | **[CFO DECISION]** Cash/bank or accrued liability. |
| **E.** | **[CFO DECISION]** Whether an accrual stage exists. |
| **F.** | None (expensed immediately) — **[RECOMMENDATION]**. |
| **G.** | **[FACT]** Reversal only. |
| **H.** | **[CFO DECISION]** Grant agreement? Not defined. |
| **I.** | **[FACT]** 180,000 < 250,000 → no committee approval required by ENT-FIN-002. |
| **J.** | **[CFO DECISION]** **[FACT]** A seeded tax strategy covers *"Deduction for donations to approved charitable institutions"* with effect *"Expense recognised in the period of donation"* — the closest thing to an authoritative OPEX/grant statement, but it governs the **donor's** deduction, not the Foundation's books. |
| **K.** | **[CFO DECISION]** Foundation is a separate root entity (no parent) — its funding is necessarily inter-entity but **not** intra-group in the ownership sense. |

### INVESTMENT — seeded example `CAP-2025-004`, USD 1,800,000, BEYU-HEA (Mwanza expansion)

**This is the most consequential and the most ambiguous.**

| Aspect | Assessment |
| --- | --- |
| **A.** | **[CFO DECISION]** Genuinely ambiguous. The resolution text says *"Allocate USD 1,800,000 to the Health OS Mwanza expansion programme"* — that could be an equity injection into BEYU-HEA, an intercompany loan, or the operating company's own capex programme funded from group cash. |
| **B.** | **[CFO DECISION]** On transfer of funds, or on commitment. |
| **C.** | **[CFO DECISION]** Depends entirely on (A): *Investment in subsidiary* (parent's books) / *Intercompany receivable* (loan) / PP&E (if really capex). |
| **D.** | **[CFO DECISION]** Cash, intercompany payable, or share capital + premium. |
| **E.** | **[CFO DECISION]** — |
| **F.** | **[CFO DECISION]** Investment measurement (cost / equity method / fair value), IFRS 10 consolidation elimination, impairment. |
| **G.** | **[FACT]** Reversal only. |
| **H.** | **[CFO DECISION]** Share subscription or loan agreement — legally different instruments. |
| **I.** | **[FACT]** 1,800,000 ≥ 1,000,000 → **Group Board reserved matter**. **[BEHAVIOUR]** The seeded resolution is Investment Committee (`BEYU-IC-2025-021`) and its own text says *"Requires Group Board ratification as a reserved matter above USD 1,000,000"* — i.e. it is explicitly **not yet fully approved**. |
| **J.** | **[CFO DECISION]** Thin capitalisation, withholding tax on interest, transfer pricing (risk `ERM-003`). |
| **K.** | **[CFO DECISION]** Two entities are always involved — see §4. |

> **[FACT] The one governance-linked capital request in the system is a
> 1.8m INVESTMENT whose own consequences text says it needs Board ratification
> it has not received.** It must not be used as the pilot for execution.

### FINANCING — seeded example `CAP-2025-015`, USD 300,000, BEYU-FIN (payments licence capital adequacy top-up)

| Aspect | Assessment |
| --- | --- |
| **A.** | **[CFO DECISION]** Raising funds (debt drawdown) or providing regulatory capital. The seeded example is **regulatory capital adequacy**, which is closer to an equity injection than to borrowing. |
| **B./C./D.** | **[CFO DECISION]** If borrowing: debit cash, credit loan liability. If regulatory capital: parent debits investment, subsidiary credits share capital. Opposite balance-sheet effects. |
| **E./F.** | **[CFO DECISION]** Interest accrual, amortised cost (IFRS 9) if debt. |
| **G.** | **[FACT]** Reversal only. |
| **H.** | **[CFO DECISION]** Facility agreement vs share subscription. |
| **I.** | **[FACT]** 300,000 ≥ 250,000 → Investment Committee. |
| **J.** | **[CFO DECISION]** Withholding tax on interest; thin capitalisation. |
| **K.** | **[CFO DECISION]** — |

### RESERVE — no seeded example

| Aspect | Assessment |
| --- | --- |
| **A.** | **[CFO DECISION]** Designation of funds, not a transaction with a third party. **[FACT]** The waterfall has a mandatory `RESERVE` tier (90-day floor, `THRESHOLD_TOPUP`) citing *"Board treasury policy ENT-FIN-005"* — **which does not exist in the policy register**. |
| **B.** | **[CFO DECISION]** On board designation, or on cash segregation. |
| **C./D.** | **[CFO DECISION]** Three structurally different options: (i) **no journal at all** — a memorandum/treasury designation; (ii) reclassify cash → restricted cash (asset↔asset); (iii) appropriate retained earnings → a reserve within equity. Only (iii) touches equity. |
| **E./F.** | **[CFO DECISION]** Release conditions. |
| **G.** | **[FACT]** Reversal only, if a journal exists at all. |
| **H./I.** | **[CFO DECISION]** / **[BOARD DECISION]** — a reserve floor is treasury policy. |
| **J.** | **[CFO DECISION]** Usually none. |
| **K.** | **[CFO DECISION]** — |

> **[RECOMMENDATION]** `RESERVE` may require **no journal entry**. Confirming
> that would be a legitimate and useful CFO decision — it removes a whole class
> of postings.

**Conclusion for §3: [FACT] no request type has an authoritative treatment.**
CAPEX and OPEX are the least ambiguous; INVESTMENT and FINANCING each have at
least two defensible treatments with materially different balance sheets;
RESERVE may not be a journal at all.

---

## §4 — Q8: intercompany

**[FACT] The hierarchy is real and confirmed by `entity_type`:**

```
BEYU Family Trust      (TRUST,            MU, USD, no parent)
        └── BEYU Holdings Ltd            (HOLDING,          AE, USD)
              └── BEYU Tanzania Holding  (COUNTRY_HOLDING,  TZ, TZS)
                    ├── BEYU Health Ltd      (OPERATING_COMPANY, TZ, TZS)
                    ├── BEYU Agriculture Ltd (OPERATING_COMPANY, TZ, TZS)
                    ├── BEYU FinTech Ltd     (OPERATING_COMPANY, TZ, TZS)
                    └── BEYU Mining Ltd      (SUBSIDIARY,        TZ, TZS)

BEYU Foundation        (FOUNDATION,       TZ, TZS, NO PARENT — outside the chain)
```

**[FACT]** Governance bodies sit at ancestor entities while capital sits at
operating entities (Investment Committee governs `LEN_BEYU_HOLDINGS`, authorises
capital for `LEN_BEYU_HEALTH_LTD`) — the ancestry rule implemented in Phase 4.
**Therefore virtually every capital transaction is inherently intercompany.**

**[FACT]** Crossing `BEYU-HLD` (USD) → `BEYU-TZH` (TZS) also crosses a currency
**and** a jurisdiction (AE → TZ).

**[FACT]** Existing acknowledgements: risk `ERM-003` (transfer pricing
challenge, ESCALATED); tax strategy *"Intra-group services charge under the
arm's length principle"* → *"Intercompany charge eliminated on consolidation"*;
IFRS 10 consolidation obligation `OBL-IFRS-CONSOL`; a TZ transfer-pricing local
file document.

**[FACT] What does not exist:** any intercompany account concept, any pairing or
mirroring mechanism, any elimination logic, any rule that a funding transaction
creates a receivable rather than an investment.

**Decisions required:**

1. **[CFO DECISION]** Does parent→subsidiary funding create an **equity
   investment** or an **intercompany loan**? (Drives thin capitalisation,
   withholding tax and transfer pricing.)
2. **[CFO DECISION]** Must both legs be posted atomically in one transaction, or
   may each entity post independently and reconcile?
3. **[CFO DECISION]** Are intercompany balances required to reconcile to zero on
   consolidation, and is that a control?
4. **[CFO DECISION]** Which entity bears the FX difference when the leg
   currencies differ?
5. **[BOARD DECISION]** Does the Foundation — a **root entity with no parent** —
   receive grants rather than intercompany funding? Its `CAP-2025-019` OPEX
   request cannot be an intra-group transaction in the ownership sense.

> **[RECOMMENDATION]** Restrict the first posting implementation to
> **single-entity, single-currency** transactions and refuse intercompany at the
> service boundary until decisions 1–5 exist. That is a smaller, safer first
> increment and requires no new policy.

---

## Additional unresolved items surfaced by this discovery

- **[FACT] FX is unavoidable, not optional.** All four seeded capital requests
  are USD against TZS-functional entities. `journal_entries.fx_rate` defaults to
  `1`, which would be **materially wrong** for every one of them. There is no
  rate source table, no rate date convention and no revaluation policy.
  → **[CFO DECISION]** rate source, rate date, and treatment of FX differences.
- **[FACT] No reporting/presentation currency exists.** IFRS 10 consolidation is
  a registered obligation, but the group's presentation currency is nowhere
  recorded. `treasury_positions.base_currency_balance` implies one without
  naming it. → **[CFO DECISION]**.
- **[FACT] Accrual basis is implied by IFRS but never stated.** Recognition
  timing for every type depends on it. → **[CFO DECISION]** (low effort, high value).
- **[FACT] Maker/checker is claimed but not implemented.** Control `CTL-FIN-002`
  asserts *"Maker/checker on all journal postings"*, AUTOMATED, EFFECTIVE —
  while zero postings exist and no posting service exists. The control is
  currently **unsubstantiated**. → **[CFO DECISION]** whether posting requires a
  second human, and whether the maker may be the same person who authorised the
  capital request.
- **[FACT] Referenced policy `ENT-FIN-005` is missing** from the policy register
  though the waterfall RESERVE tier cites it.
- **[FACT] No `capital:execute` capability exists**, and `finance:ledger.post`
  is CFO-only and excluded from the CEO wildcard. Whether posting authority
  equals execution authority remains **[CFO DECISION]**, and creating a new
  capability would be **[BOARD DECISION]** (new constitutional power).

---

## Minimum decision set to unblock the next increment

**[RECOMMENDATION]** The following is the smallest authoritative set that would
let Phase 5A resume without any invention. Everything else can follow later.

1. **Chart of accounts** — a first tranche sufficient for one treatment: codes,
   names, `account_type`, `ifrs_category`, and whether accounts are shared
   group-wide or per entity. **[CFO DECISION]**
2. **One treatment, fully specified** — **[RECOMMENDATION]** start with
   **CAPEX**, single entity, entity functional currency: recognition event,
   debit class, credit class, and whether a liability stage exists.
   **[CFO DECISION]**
3. **Financial calendar** — period length, who opens, who closes, whether
   reopening is permitted, and the meaning of `CLOSING` vs `LOCKED`.
   **[CFO DECISION]**
4. **Accrual basis confirmation** — one sentence. **[CFO DECISION]**
5. **Maker/checker mechanics** — does `CTL-FIN-002` require a second human on
   each posting? **[CFO DECISION]**

With 1–5, a posting service can be built mechanically on the existing kernel
(`withAuditTransaction`, `publishEventTx`, DB-backed idempotency,
`finance:ledger.post`), with migration `0005` already guaranteeing that nothing
unbalanced, zero-value, single-sided or mutable can ever be stored.

Deferrable: intercompany (§4), FX, tax/VAT accounts, reporting currency,
INVESTMENT/FINANCING/RESERVE treatments, capital execution semantics.

---

## What was NOT done in this phase

**[FACT]** No implementation code, no chart of accounts, no ledger accounts, no
financial periods, no posting service, no capital-execution route, no treasury
logic, no new permission, and no schema change. The ledger remains empty
(0 accounts, 0 periods, 0 entries, 0 lines) and no accounting treatment was
invented. Existing security, authorization, tenant isolation, audit,
idempotency, maker/checker declarations and the migration-`0005` ledger
integrity controls are unchanged and verified.

Related open items: `CAPITAL_EXECUTION_BLOCKED.md`,
`ACCOUNTING_SUBSTRATE_DECISIONS.md`, and `DECISION_AUTHORITY_MODEL.md` §4 (four
governance bodies still have no eligible decision authority).
