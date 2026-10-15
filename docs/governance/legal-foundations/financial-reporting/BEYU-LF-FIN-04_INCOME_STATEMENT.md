# BEYU-LF-FIN-04 — Income Statement (Statement of Profit or Loss)

Document ID: `BEYU-LF-FIN-04`
Title: Income Statement Framework — blank template with the reporting parameters and data-request checklist
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` — BLANK. NO FIGURES. NO LEDGER. NOT PREPARED, NOT APPROVED, NOT AUDITED, NOT FILED.**
Owner (proposed): CFO · Approving authority (proposed): the board, with the Audit and Risk Committee reviewing
Next review date: Monthly once a ledger exists
Classification: `HIGHLY_RESTRICTED`
Related: `FIN-02` (the model — **a projection, not this**), `FIN-05`, `FIN-06`, `FIN-07`, `FIN-08`, `FIN-09`,
`D69`, `D68`, `D72`, `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md`
Depends on: **a ledger, an opening position, a ratified accounting policy and the accountant's answers**

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

## 1. The statement (blank — every figure field is empty by design)

```
INCOME STATEMENT — [ENTITY EXACTLY AS NAMED IN D63]
For the period [START] to [END]        Currency: [ ]        Status: [DRAFT / UNAPPROVED / MANAGEMENT PREPARED]
Prepared by: [ ]   Reviewed by: [ ]   Approved by: [ ] on [ ]

                                                        Period [ ]        Comparative [ ]   Notes
REVENUE
  Revenue — [stream 1]                                       [ ]               [ ]           FIN-08 n1
  Revenue — [stream 2]                                       [ ]               [ ]           FIN-08 n2
  Other income (itemised — grants, if any)                   [ ]               [ ]           FIN-08 n3
                                                   -----------------  ----------------
  TOTAL REVENUE                                              [ ]               [ ]
COST OF SALES
  Direct materials / product costs                           ( )               ( )           n4
  Direct labour                                              ( )               ( )           n4
  Hosting, data and platform                                 ( )               ( )           n4
  Payment and transaction fees                               ( )               ( )           n4
  Subcontractors                                             ( )               ( )           n4
                                                   -----------------  ----------------
  TOTAL COST OF SALES                                        ( )               ( )
  GROSS PROFIT                                               [ ]               [ ]
OPERATING EXPENSES
  Staff costs (gross + statutory contributions + taxes)      ( )               ( )           n5
  Premises and utilities                                     ( )               ( )           n6
  Technology, licences and security                          ( )               ( )           n6
  Marketing and acquisition                                  ( )               ( )           n6
  Professional fees (legal, accounting, audit, IP, compliance)( )              ( )           n6
  Insurance                                                  ( )               ( )           n6
  Travel and field costs                                     ( )               ( )           n6
  Depreciation and amortisation                              ( )               ( )           n7
  Impairment                                                 ( )               ( )           n7
  Foreign-exchange (gain)/loss                               ( )/[ ]           ( )/[ ]       n8
  Other operating expenses (itemised)                        ( )               ( )           n6
                                                   -----------------  ----------------
  TOTAL OPERATING EXPENSES                                   ( )               ( )
  OPERATING PROFIT / (LOSS)                                  [ ]               [ ]
FINANCE COSTS
  Interest expense                                           ( )               ( )           n9
  Interest income                                            [ ]               [ ]            n9
  Other finance costs                                        ( )               ( )            n9
  PROFIT / (LOSS) BEFORE TAX                                 [ ]               [ ]
TAX
  Current tax                                                ( )               ( )           n10
  Deferred tax                                               ( )               ( )           n10
  PROFIT / (LOSS) FOR THE PERIOD                             [ ]               [ ]
OTHER COMPREHENSIVE INCOME (if applicable)                   [ ]               [ ]            n11
  TOTAL COMPREHENSIVE INCOME / (LOSS)                        [ ]               [ ]

THE FIGURES ARE INTENTIONALLY BLANK. THERE IS NO LEDGER. NOTHING MAY BE ENTERED HERE WITHOUT THE
ACCOUNTANT'S CONFIRMATION OF THE FRAMEWORK AND THE DATA-REQUEST CHECKLIST BELOW.
```

## 2. Line-by-line rules

| # | Line | Rule |
|---|---|---|
| 2.1 | **Revenue** | Recognised **only as the accounting framework requires**, which is **not ratified** (`D69`). **Grants must be presented separately where they are restricted** (`FIN-02` §4.1). **No revenue may be recognised from an unsigned customer, a "pipeline" or a scenario** |
| 2.2 | **Other income** | Itemised. **No netting.** A gain may not be hidden inside an expense line |
| 2.3 | **Cost of sales vs operating expenses** | The **classification must be consistent** with the policy; a cost moved from one line to the other changes gross profit without changing reality |
| 2.4 | **Staff costs** | **Gross pay + statutory contributions + payroll taxes + benefits**, and the **employment-law content is unresearched** — so the on-costs are `ACCOUNTANT QUESTION`, not an estimate |
| 2.5 | **Depreciation/amortisation** | Only from a fixed-asset register with a **ratified policy** on rates and methods |
| 2.6 | **Foreign exchange** | Only with a confirmed policy on the rate (closing/average) and the presentation of gains and losses |
| 2.7 | **Tax** | **BLANK, with a flag, until the accountant confirms.** A zero tax line asserts "no tax is payable" — a claim |
| 2.8 | **Comparatives** | Only if the prior period was prepared on the **same basis**, with the basis stated. **A comparative on a different basis must be restated or omitted with an explanation** |
| 2.9 | **No "adjusted"/"EBITDA"/"underlying" figure** may be presented **as the profit** or in a way that implies an approved measure. A non-statutory measure, if shown, must be **labelled, defined and reconciled** to a statutory line (`FIN-09` §6) |
| 2.10 | **Nothing may be described as "audited"** without the audit report held in `D74` |

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

## 5. Decisions required from the user / family / governing bodies

1. **The entity** for which a statement is prepared — and whether the group prepares one per entity or one
   consolidated statement (**the latter requires control, which is unverified**).
2. The **period**, the **currency** and the **framework** (with the accountant).
3. **Who prepares** and **who reviews** (different people).
4. Whether an **audit or review** is required by law, by a lender, by a regulator or by a grant (**and never to
   claim one that has not happened**).
5. The **budget vs actual** reporting pack once a ledger exists (`D26`).

## 6. Accountant review note — `[ACCOUNTANT TO CONFIRM]`

1. **The framework**, its version and the applicable presentation. **The group's policy is not ratified
   (`C-1`).**
2. **Revenue recognition** for each stream (subscriptions, services, grants, usage fees).
3. **Cost classifications**, and the gross-profit presentation.
4. **Depreciation and amortisation** rates and methods; whether development costs may be capitalised at all.
5. **The tax computation** — and **nothing may be assumed about rates, thresholds or exemptions**.
6. **Deferred tax** (if the framework requires it).
7. **Foreign-currency** policy.
8. **Consolidation** — whether and how, and the control threshold.
9. **The comparatives** and the opening position.
10. Whether the statement requires **filing** with any authority, and by when.

**This statement is blank. There is no ledger, no verified opening balance and no ratified accounting policy.
No figure may be entered without the accountant's confirmation and the data-request checklist.**