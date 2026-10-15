# BEYU-LF-FIN-05 — Cash Flow Statement

Document ID: `BEYU-LF-FIN-05`
Title: Cash Flow Statement Framework — blank template, three categories and the cash bridge
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` — BLANK. NO FIGURES. NOT PREPARED, NOT APPROVED, NOT AUDITED, NOT FILED.**
Owner (proposed): CFO · Approving authority (proposed): the board, with the Audit and Risk Committee reviewing
Next review date: Monthly once a ledger exists
Classification: `HIGHLY_RESTRICTED`
Related: `FIN-04`, `FIN-06`, `FIN-07`, `FIN-08`, **`FIN-09` (the bridge)**, `FIN-02` §8, `D69`
Depends on: **a ledger, bank statements and reconciliations, and the accountant's answers**

## 0. The reporting parameters — **identify these FIRST or the statement is meaningless**

| # | Parameter | Requirement | Status |
|---|---|---|---|
| 0.1 | **Reporting entity** | The **legal entity** whose statement this is, named exactly as in `D63`. **A statement may not be "the group" by implication** | **NO VERIFIED ENTITY** (`INC-01`) |
| 0.2 | **Consolidation position** | Whether the statement is **standalone** (one entity) or **consolidated** (two or more, with control established). **Consolidation requires control, and control requires ownership — which is unverified** (`CAP-01`) | **UNDETERMINED** |
| 0.3 | **Reporting period** | The exact start and end dates. **Never "the year" — the dates** | `[USER TO SUPPLY]` |
| 0.4 | **Comparative period** | The prior period, presented only if it exists and was prepared on the same basis | **NONE** |
| 0.5 | **Reporting currency** | The currency, and the **presentation** currency if different from the functional currency | `[TO BE DECIDED]` |
| 0.6 | **Accounting framework** | The framework applied (and its version). **The group's accounting policy is NOT RATIFIED (`C-1` policy-provenance; `ACCOUNTING AUTHORITY = NOT RATIFIED`)** | **NOT DETERMINED** |
| 0.7 | **Basis and conventions** | Accrual or cash; going concern; historical cost or revaluation; rounding and units | `[ACCOUNTANT TO CONFIRM]` |
| 0.8 | **Materiality** | The threshold applied, and who set it | `[ACCOUNTANT TO CONFIRM]` |
| 0.9 | **Preparer / reviewer** | **Two different people** (segregation of duties) | `[USER TO SUPPLY]` |
| 0.10 | **Approval** | Who approves, and when. **An unapproved statement is a draft** | `[ ]` |
| 0.11 | **Source records** | The ledger and sub-ledgers it is drawn from, **with the ledger identified** | **NO LEDGER** |
| 0.12 | **Status label** | `DRAFT` / `UNAPPROVED` / `MANAGEMENT PREPARED` / `AUDITED` — **and the audit label may never be used without an audit report** | **`TEMPLATE — NO DATA`** |

> **⚠ THE HARD RULE FOR EVERY STATEMENT IN THIS SERIES.**
> **There is no ledger, no verified opening balance, no ratified accounting policy and no audited figure
> anywhere in this group.** Therefore: **every figure field in these statements is BLANK.** A statement
> populated from the repository's seed data (`src/db/seed.ts`), from a fixture, from a demo scenario or from a
> model output would be a **fabricated financial statement** — one of the most harmful artefacts this pack
> could produce, because it would be relied on by a tax authority, a bank, an investor, a court or the family
> itself.
> **And: no statement in this series may be described as audited, reviewed, filed, approved or final unless
> the corresponding document exists. `MANAGEMENT PREPARED — UNAUDITED` is a legitimate description of a real
> thing; `AUDITED` without an audit report is a false statement.**

## 1. The statement (blank)

```
CASH FLOW STATEMENT — [ENTITY EXACTLY AS NAMED IN D63]
For the period [START] to [END]      Currency: [ ]      Status: [DRAFT / UNAPPROVED / MANAGEMENT PREPARED]
Method: [direct / indirect — ACCOUNTANT TO CONFIRM]     Prepared by: [ ]  Reviewed by: [ ]

                                                        Period [ ]        Comparative [ ]   Notes
A. OPERATING ACTIVITIES
   Cash receipts from customers                              [ ]               [ ]
   Cash paid to suppliers and employees                     ( )               ( )
   Cash generated from operations                            [ ]               [ ]
   Interest paid                                            ( )               ( )            n1
   Tax paid                                                 ( )               ( )            n2
   Net cash from / (used in) operating activities            [ ]               [ ]
B. INVESTING ACTIVITIES
   Purchase of property and equipment                       ( )               ( )
   Purchase of intangibles (incl. capitalised development)  ( )               ( )            n3
   Proceeds from disposals                                   [ ]               [ ]
   Interest received                                         [ ]               [ ]
   Net cash from / (used in) investing activities            [ ]               [ ]
C. FINANCING ACTIVITIES
   Proceeds from share issues                                [ ]               [ ]            n4
   Proceeds from loans                                       [ ]               [ ]            n4
   Repayment of loans                                       ( )               ( )            n4
   Lease payments                                           ( )               ( )            n5
   Dividends paid                                           ( )               ( )            n6
   Net cash from / (used in) financing activities            [ ]               [ ]
NET INCREASE / (DECREASE) IN CASH                           [ ]               [ ]
Cash and cash equivalents at the beginning of the period    [ ]               [ ]            n7
Effect of exchange-rate changes on cash                     [ ]/[ ]           [ ]/[ ]
CASH AND CASH EQUIVALENTS AT THE END OF THE PERIOD          [ ]               [ ]

THE FIGURES ARE INTENTIONALLY BLANK. NO BANK STATEMENT HAS BEEN RECONCILED. NOTHING MAY BE ENTERED.
```

## 2. Line-by-line rules

| # | Line | Rule |
|---|---|---|
| 2.1 | **Method** | The **direct or indirect** method must be stated, and **applied consistently**. An indirect statement must reconcile **from profit** (`FIN-09` §4) |
| 2.2 | **Interest paid** | Where the framework permits the choice, the classification must be stated and applied consistently |
| 2.3 | **Tax paid** | **Blank** until the tax position is confirmed — **tax paid ≠ tax expense** (`FIN-09` §5) |
| 2.4 | **Capitalised development** | **Only if the policy permits capitalisation** — which is not confirmed (`FIN-02` §7.2) |
| 2.5 | **Share issues** | Proceeds only where an issue **actually occurred** with the consideration received — **`CAP-01` holds zero verified shares** |
| 2.6 | **Lease payments** | The treatment depends on the framework's lease rules `[ACCOUNTANT TO CONFIRM]` — **do not split principal and interest without the rule** |
| 2.7 | **Dividends** | Only where a dividend was **lawfully declared and paid** (`D24` §6 solvency test; `D27`) |
| 2.8 | **Opening cash** | Must tie to the **prior period's closing cash** and to the **bank reconciliation**. `UNVERIFIED OPENING CASH` is the correct entry where it cannot be tied |
| 2.9 | **A cash flow statement may not be presented without a bank reconciliation** for each month-end in the period. **This is the statement's foundation** |

## Data-request checklist (what must exist before any figure may be entered)

| # | Item | Source | Held? | If not held |
|---|---|---|---|---|
| D1 | **Bank statements** for every account, for every month in the period | The bank | ☐ | **No cash figure may be prepared** |
| D2 | **Bank reconciliations** for each month-end | Preparer | ☐ | Cash is unverified |
| D3 | **Sales invoices issued** and the **receipts** against them | Billing | ☐ | Revenue is unverified |
| D4 | **Purchase invoices/expenses** and the **payments** | Suppliers / bank | ☐ | Costs are incomplete |
| D5 | **Payroll records** — gross, deductions, statutory contributions, net, and the payments | Payroll | ☐ | Staff cost is unverified; **and the employment-law content of payroll is unresearched** |
| D6 | **Contracts** supporting revenue, costs, leases and loans | `D67` | ☐ | Obligations may be missing |
| D7 | **Loan and financing documents**, with interest and repayment terms | `D67` | ☐ | Liabilities are unverified |
| D8 | **Fixed-asset register** with additions, disposals and depreciation | `D66`-type register | ☐ | Assets and depreciation are unverified |
| D9 | **Inventory counts** and valuation | Operations | ☐ | Inventory is unverified |
| D10 | **Tax returns and assessments** filed, with acknowledgements | Tax portal / adviser | ☐ | **Tax is not verified — and nothing may be assumed** |
| D11 | **Share register and share issues** with the consideration evidence | `D64` | ☐ | Equity is unverified (`CAP-01`) |
| D12 | **Related-party transactions** with their approvals | `D72` | ☐ | Disclosures are incomplete |
| D13 | **Opening balances** for the period — **including the first period in which the entity existed** | Prior records / the accountant | ☐ | **Without an opening position, no balance sheet can be prepared** |
| D14 | **Prior-period statements** if a comparative is presented | Prior preparer | ☐ | No comparative may be shown |
| D15 | **The accounting policy** ratified and applied | `D69` / `docs/finance` | ☐ | **The framework question is unanswered (`C-1`)** |

**D16 The rule.** **A statement may not be prepared from a partial data set and presented as complete.** Where
records are missing, the statement either is not prepared, or is prepared **with the missing records disclosed
as a limitation on its face** — **never silently.**

## Sample presentation (**`ILLUSTRATIVE` ONLY — NOT THE GROUP'S FIGURES**)

**Where a blank structure is hard to read, a sample may be shown — but only in a form that cannot be mistaken
for actual data: every figure is a letter-shape placeholder (`X`, `(X)`), the page carries the banner
`ILLUSTRATIVE FORMAT ONLY — NOT THE GROUP'S FIGURES — NOT DERIVED FROM ANY LEDGER`, and the sample is kept in a
**separate file** from any real statement. A sample with plausible-looking numbers (e.g. round millions, a
tidy 20% margin) is prohibited: **plausible numbers are exactly what gets copied into real documents.**

## 5. The cash bridge (the rule that makes this statement useful)

**The closing cash per this statement must equal:**
**(a)** the closing cash per the **balance sheet** (`FIN-06`); **and**
**(b)** the closing cash per the **bank statements**, after all reconciling items.

**Any difference is a finding** (`FIN-09` §3), investigated and recorded — **never plugged into a "suspense"
line and never absorbed into another line.** Where the difference cannot be resolved, the statement is labelled
`UNRECONCILED` **on its face**, with the amount and the reason.

## 6. Decisions required from the user / family / governing bodies

1. **The banking structure** — which entity holds which account, and who can operate it (`D35` §3).
2. Whether **all funds pass through the entities' accounts** — **and if not, the off-book practice is itself a
   finding** (the shadow-ledger prohibition, `FIR-018`; `D35`).
3. The **petty-cash and expense** arrangements, and their limits.
4. The **foreign-currency** accounts and the exchange-control position `[COUNSEL TO CONFIRM]`.
5. Who **reconciles** and who **reviews**.

## 7. Accountant review note — `[ACCOUNTANT TO CONFIRM]`

1. The **method** and the consistency requirement.
2. The **classification** of interest, dividends, leases and taxes.
3. The framework's **lease** treatment.
4. The **cash-equivalent definition** (which instruments qualify).
5. Whether the statement requires **filing**, and by when.
6. The **opening cash** and the prior-period tie-in.

**This statement is blank. There is no reconciled bank balance anywhere in the group's records. No figure may be
entered without the accountant's confirmation and the data-request checklist.**