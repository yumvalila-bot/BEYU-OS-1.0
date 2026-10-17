# BEYU-LF-FIN-02 — Financial Model (Assumptions Register, Drivers, Scenarios and Runway)

Document ID: `BEYU-LF-FIN-02`
Title: Financial Model Framework — assumptions register, drivers, costs, headcount, capex, working capital,
financing, runway, scenarios, sensitivity
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` / `PRELIMINARY_FRAMEWORK`** — **the model is EMPTY. Every input is `[USER TO SUPPLY]` or
`[TO BE DECIDED]`. There is no verified historical data, no ledger and no ratified accounting policy.**
Owner (proposed): CFO · Approving authority (proposed): the board; the Audit and Risk Committee reviews the
controls
Next review date: **Monthly** once a business exists; quarterly otherwise
Classification: `HIGHLY_RESTRICTED`
Related: **`FIN-04`–`FIN-09`** (the statements and reconciliation), `FIN-01`, `FIN-03`, `CAP-01`, `D69`, `D68`,
`ESOP-01` §6, `EMP-01`, `CMP-01` §4, `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md`
Depends on: **a ratified accounting policy (`ACCOUNTING AUTHORITY = NOT RATIFIED`; the `C-1` policy-provenance
question), a ledger, verified inputs, and the accountant's answers**

> **⚠⚠ THE FOUR RULES OF THIS MODEL.**
> **1. A MODEL IS A SET OF ASSUMPTIONS, NOT A PREDICTION.** Every number is produced by an assumption. **The
> value of the model is the discipline of stating the assumptions — not the precision of the output.**
> **2. NO HARD-CODED NUMBERS.** A figure typed into a cell with no driver behind it is a **hidden assumption**
> and is prohibited. Every number must be reachable from the assumptions register (§2) through the drivers (§3).
> **3. ILLUSTRATIVE FIGURES ARE LABELLED, AND NEVER MIXED WITH ACTUALS.** Where a placeholder is used to make
> the structure visible, it is marked `ILLUSTRATIVE` **in the cell and on every page it appears on**. **Actuals
> come only from the accounting records, and there are none.**
> **4. THE MODEL DOES NOT CREATE A FACT.** A model output is not revenue, not a valuation, not traction, not a
> commitment and not evidence. **It may not be presented to an investor, a bank or a regulator as actual
> performance** (`FIN-01` §4.13).

---

## 1. Structure of the model

```
FIN-02
├── Sheet 0 — CONTROL      : version, owner, date, currency, entity, period, framework, and the
│                            "do not edit without re-approval" rule
├── Sheet 1 — ASSUMPTIONS  : EVERY input, named, sourced and classified (§2)
├── Sheet 2 — DRIVERS      : volumes, prices, conversion, headcount, usage — derived from Sheet 1
├── Sheet 3 — REVENUE      : by product/stream and customer category
├── Sheet 4 — COSTS        : direct, staff, premises, technology, marketing, professional, other
├── Sheet 5 — HEADCOUNT    : roles, timing, fully-loaded cost, payroll taxes and contributions
├── Sheet 6 — CAPEX        : equipment, intangibles (development), leases, deposits
├── Sheet 7 — WORKING CAPITAL: receivables, payables, inventory, prepayments, and the cash cycle
├── Sheet 8 — TAX          : ONLY with verified assumptions (else: the cell is BLANK and flagged)
├── Sheet 9 — FINANCING    : equity, debt, grants, the cost of capital, and the repayment schedule
├── Sheet 10 — CASH & RUNWAY: the monthly cash build, and the runway calculation with its definition
├── Sheet 11 — SCENARIOS   : base / downside / upside (each with its OWN assumption set referenced, not
│                            a multiplier applied to the base — that is a fake scenario)
└── Sheet 12 — SENSITIVITY : the drivers that matter, with the range actually tested
```

## 2. Assumptions register (**the heart of the model — every number's origin**)

| ID | Assumption | Value | Unit | Class | Source / basis | Owner | Review date |
|---|---|---|---|---|---|---|---|
| `A-001` | *[e.g. "monthly price per user"]* | `[ ]` | currency | `USER PROPOSAL` / `PUBLISHED SOURCE` / `FORECAST` / `ILLUSTRATIVE` | `[the pricing decision, or the citation]` | CFO | — |
| `A-002` | *[e.g. "addressable users in year 1"]* | `[ ]` | count | `FORECAST` | `[the reasoning, stated]` | CEO | — |
| `A-003` | *[e.g. "monthly salary per role"]* | `[ ]` | currency | `USER PROPOSAL` | `[the remuneration decision — and note that employment law is unresearched]` | CFO | — |
| `A-004` | *[e.g. "tax rate"]* | **BLANK** | % | `ACCOUNTANT QUESTION` | **`[NOT VERIFIED — must not be guessed]`** | Accountant | — |

**2.1 The classification rule (from `README` §3.2 and `FIN-01` §3.5).** Every assumption carries exactly one
label: **`VERIFIED FACT` / `USER PROPOSAL` / `DRAFTING ASSUMPTION` / `ILLUSTRATIVE EXAMPLE` / `FORECAST` /
`COUNSEL QUESTION` / `ACCOUNTANT QUESTION` / `BLOCKED ITEM` / `NOT VERIFIED`.** **An assumption with no class is
prohibited.**
**2.2 The tax rule.** **Where the tax treatment, rate, threshold or allowance has not been verified by the
accountant, the tax line is BLANK with a flag — not zero, and not a guessed rate.** (A row of zeros silently
states "no tax is payable", which is a claim.)
**2.3 The salary rule.** **No remuneration figure may be entered from a template.** It comes from the board's
remuneration decision (`D26` §4) — and the **cost of employment** must include the statutory contributions and
taxes once those are confirmed, not only the gross salary.
**2.4 The change log.** Any change to an assumption is dated and attributed. **A model that silently changes is
a model nobody can defend.**

## 3. Drivers (each derived from `Sheet 1` — no independent entry)

| # | Driver | Derivation |
|---|---|---|
| 3.1 | Volume (users, patients, customers, transactions, tonnes, projects) | `A-00n` × `A-00m` |
| 3.2 | Price / yield | `A-00n` |
| 3.3 | Conversion / retention / churn | `A-00n` — **and churn must be modelled, not assumed away** |
| 3.4 | Cost per unit / per transaction | Derived from `Sheet 4` ÷ volume |
| 3.5 | Headcount by role and month | `Sheet 5` |
| 3.6 | Capex timing | `Sheet 6` |
| 3.7 | Working-capital days (receivable/payable/inventory) | `Sheet 7` |
| 3.8 | Collection rate (the percentage of invoiced revenue actually collected — **the most commonly
overstated assumption in any model**) | `A-00n` |

## 4. Revenue

| # | Revenue stream | Basis | Evidence of the *decision* (not of the revenue) | Risk |
|---|---|---|---|---|
| 4.1 | Subscriptions | price × subscribers, **with churn** | The pricing decision | Price and churn sensitivity |
| 4.2 | Transaction/usage fees | volume × fee | The pricing decision | Volume is unproven |
| 4.3 | Services / implementation | days × day rate | The rate card decision | Not scalable; capacity-limited |
| 4.4 | Grants / programme funding | The grant decision | **A signed grant agreement — otherwise it is not revenue** | Restricted funds; **must be accounted for as restricted** |
| 4.5 | Licensing / IP | licence fee | **An executed licence (`D42`) — there are none** | `IP-TM-01`: zero verified rights |
| 4.6 | Other | — | — | — |

**4.1 The revenue-recognition rule.** **Revenue is recognised only as the accounting framework requires, and
the framework is not ratified** (`D69`; `ACCOUNTANT_QUESTIONS…`). **A model's "revenue" line is not revenue until
the accounting treatment is determined.** **Where a grant is restricted, it is not general revenue** and must
not be presented as though it were.

## 5. Costs

| # | Cost category | Components | Basis |
|---|---|---|---|
| 5.1 | **Direct costs** | Hosting, data, payment fees, clinical or field costs, materials, subcontractors | Per unit × volume |
| 5.2 | **Staff costs** | Gross pay + statutory contributions + taxes + benefits + recruitment | `Sheet 5`; **`EMP-01` Part F is empty, so the on-costs are `ACCOUNTANT QUESTION`** |
| 5.3 | **Premises** | Rent, service charge, utilities, insurance, fit-out, **and the lease obligation** | The lease decision |
| 5.4 | **Technology** | Licences, tools, security, backup, devices, support, **and audit/penetration testing** | Vendor decisions |
| 5.5 | **Marketing** | Acquisition cost × volume; brand; content; events | The marketing decision; **CAC must be derived, not asserted** |
| 5.6 | **Professional** | Legal, accounting, audit, valuation, IP (filing and agent fees), compliance | **`CMP-01`: this is the cost of the compliance position the group actually needs** |
| 5.7 | **Insurance** | D&O, professional indemnity, cyber, property, health and safety | Quotes |
| 5.8 | **Travel and field** | Per diem, transport, accommodation | Policy (`EMP-03` §P-23) |
| 5.9 | **Other** | Bank charges, FX costs, licences, permits, registrations | `CMP-01` |
| 5.10 | **Contingency** | A **stated** percentage with a reason, not a plug figure | `A-00n` |

## 6. Headcount

| # | Role | Entity (the employer) | Start month | Gross monthly | On-costs | Fully loaded | Notes |
|---|---|---|---|---|---|---|---|
| 6.1 | `[USER TO SUPPLY]` | `[the employer — EMP-01 §2]` | `[ ]` | `[ ]` | `ACCOUNTANT QUESTION` | — | **The employer matters: it determines payroll, liability and tax** |

**6.1 The honesty rule.** **The model must not contain a headcount the group has not decided and cannot fund**
— and it must not imply employment where the arrangement will be a contract. **Where a role will be a
contractor, the cost structure differs (and the classification risk is `EMP-01` §3).**
**6.2 The equity rule.** Where remuneration includes equity, the **accounting cost is a share-based payment
expense** (`ESOP-01` §6.7; `ACCOUNTANT QUESTION`) and the **dilution effect belongs in the cap table**
(`CAP-01`), not in the cost line alone.

## 7. Capex, working capital and financing

| # | Item | Rule |
|---|---|---|
| 7.1 | **Capex** — equipment, intangibles, leasehold improvements | Entered at the **month of the decision**, not the month of payment |
| 7.2 | **Capitalised development** | `[ACCOUNTANT TO CONFIRM]` whether the group's development costs may be capitalised **at all**, and the criteria — **do not assume capitalisation** |
| 7.3 | **Receivables (days)** | The **collection** assumption, tested against reality once reality exists |
| 7.4 | **Payables (days)** | What the group will actually get from suppliers |
| 7.5 | **Inventory** (for Agriculture/Ujenzi) | Including **shelf life, spoilage, shrinkage and obsolescence** |
| 7.6 | **Equity raised** | Only when **committed and documented** — a pipeline is not financing. **The model shows a fundraise as a scenario toggled off until it is real** |
| 7.7 | **Debt** | Interest, fees, covenants, repayment, and the **security given** (which must be a decision, `CMP-01` §10.5) |
| 7.8 | **Grants** | With the restriction conditions recorded, and the **reporting obligations** they create (`CMP-01` §10.2) |
| 7.9 | **Related-party funding** | **Disclosed and treated as related-party** (`D72`) — a family loan is not free money and has tax, conflict and insolvency consequences |

## 8. Cash and runway

| # | Rule |
|---|---|
| 8.1 | **The runway definition must be stated explicitly** — e.g. "months until cash reaches zero, before any further financing, on the base assumptions, with collections at the assumed rate" |
| 8.2 | **Runway is calculated monthly**, from the model, not asserted |
| 8.3 | **The model must show the month in which cash reaches zero** under each scenario, **including the downside** — a model that never runs out of cash in any scenario is not a model |
| 8.4 | **Cash ≠ profit.** The cash sheet and the income statement must reconcile through the defined bridge (`FIN-09`) |
| 8.5 | **No invented opening cash balance.** If the balance is unverified, the model states `UNVERIFIED OPENING BALANCE` and does not present a runway figure |

## 9. Scenarios and sensitivity

| # | Rule |
|---|---|
| 9.1 | **Base, downside and upside each carry their OWN assumption set** — **not** a multiplier applied to the base output. **A scenario built from the base's outputs cannot reveal a different structure of costs** |
| 9.2 | **The downside must be genuinely adverse** — no revenue, slower collections, higher churn, higher costs, a delayed launch, a lost customer. **A "downside" that still works is not a downside** |
| 9.3 | **Sensitivity: state which drivers actually move the outcome**, and the range tested. Most models are sensitive to two or three drivers only — **name them** |
| 9.4 | **No scenario may be presented as the plan.** The base is a plan only once the board adopts it as the budget (`D26`) |
| 9.5 | **The scenarios are `ILLUSTRATIVE`** until the business exists; they must be labelled so wherever they appear |

## 10. Controls

| # | Control | Rule |
|---|---|---|
| 10.1 | **One master model**, versioned, with one owner; **no parallel personal copies** |
| 10.2 | **Formula discipline**: no hard-codes inside formulas; inputs only in `Sheet 1`; no circularity; a documented calculation order |
| 10.3 | **A change log** for every assumption change |
| 10.4 | **A reconciliation check sheet**: the model's outputs must tie to the statements (`FIN-04`–`FIN-09`) **when statements exist** — and today they do not |
| 10.5 | **Segregation of duties**: the preparer and the reviewer are different people; the board adopts the budget |
| 10.6 | **The model is not an accounting record.** The **ledger** is; the model is a projection (`D69`) |
| 10.7 | **Access control** on the model file; the model is `HIGHLY_RESTRICTED` (it contains remuneration and strategy) |
| 10.8 | **No AI-generated numbers may be entered as assumptions** without a human owner accepting the assumption and citing its basis (`DEFINED_TERMS` §2) |

## 11. What this model must never contain

| # | Prohibited |
|---|---|
| 11.1 | A **tax figure** that was not confirmed by the accountant |
| 11.2 | A **salary** that was not decided by the board |
| 11.3 | **Revenue from a customer who has not signed** — and never a "pipeline" presented as revenue |
| 11.4 | **Actual** figures that are not from the accounting records |
| 11.5 | **Illustrative** figures presented without the label |
| 11.6 | **A valuation** (that belongs to `FIN-03`/`CAP-01` §7, on advice) |
| 11.7 | **A runway claim** on an unverified opening balance |
| 11.8 | **A grant or investment** shown as secured when it is not committed |
| 11.9 | **A cost line of zero** where the cost exists and is merely unknown |
| 11.10 | **A "downside" that is not adverse** |

## 12. Decisions required from the user / family / governing bodies

1. **The pricing** (per product and stream).
2. **The remuneration** decisions, including the on-costs (with the accountant).
3. **The headcount plan**, and the entity that employs each role.
4. **The capex** decisions.
5. **The financing plan** — and whether a raise is intended at all.
6. The **tax treatment** — to be obtained from the accountant (`ACCOUNTANT_QUESTIONS…`).
7. The **base budget** the board will adopt.
8. Who **owns the model** and who **reviews** it.

## 13. Accountant review note — `[ACCOUNTANT TO CONFIRM]`

1. **The accounting framework** applicable to each entity, and the reporting currency.
2. **Revenue recognition** for each stream, including grants, subscriptions and long-term services.
3. **Capitalisation** of development costs — permitted, and on what criteria.
4. **The cost of employment** — the statutory contributions and taxes that must be added to gross pay.
5. **The tax treatment** of each line (and whether any exemption applies — **and never to assume one**).
6. **The treatment of foreign currency** transactions and balances.
7. **The treatment of related-party funding** and the disclosures it requires.
8. **The consolidation position** if there is more than one entity.
9. **The opening balances** — which do not exist, because there is no ledger.

**The model is empty. Every input is a decision or a question. No figure in this document is a fact, a forecast
of the group's actual performance, or a basis for any external statement.**