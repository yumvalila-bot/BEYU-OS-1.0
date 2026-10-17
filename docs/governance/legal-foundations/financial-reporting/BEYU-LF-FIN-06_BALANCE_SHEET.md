# BEYU-LF-FIN-06 — Balance Sheet (Statement of Financial Position)

Document ID: `BEYU-LF-FIN-06`
Title: Balance Sheet Framework — blank template, assets/liabilities/equity and the accounting equation
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` — BLANK. NO OPENING POSITION. NOT PREPARED, NOT APPROVED, NOT AUDITED, NOT FILED.**
Owner (proposed): CFO · Approving authority (proposed): the board, with the Audit and Risk Committee reviewing
Next review date: Monthly once a ledger exists
Classification: `HIGHLY_RESTRICTED`
Related: `FIN-04`, `FIN-05`, `FIN-07`, `FIN-08`, **`FIN-09` §2 (A = L + E)**, `CAP-01`, `D64`, `D69`, `D72`,
`D71`
Depends on: **an opening position, a fixed-asset register, a share register, verified balances and a ratified
accounting policy**

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
BALANCE SHEET — [ENTITY EXACTLY AS NAMED IN D63]
As at [DATE]                Currency: [ ]       Status: [DRAFT / UNAPPROVED / MANAGEMENT PREPARED]
Prepared by: [ ]   Reviewed by: [ ]   Approved by: [ ] on [ ]

                                                        As at [ ]          As at [ ]        Notes
ASSETS
NON-CURRENT ASSETS
  Property, plant and equipment (cost, accumulated depreciation)[ ]              [ ]            n1
  Intangible assets (software, capitalised development)        [ ]              [ ]            n1
  Right-of-use / leased assets (if applicable)                 [ ]              [ ]            n2
  Investments / long-term deposits                             [ ]              [ ]            n3
  Deferred tax asset                                           [ ]              [ ]            n4
CURRENT ASSETS
  Inventory                                                    [ ]              [ ]            n5
  Trade and other receivables                                  [ ]              [ ]            n6
  Grant/prepayment receivables                                 [ ]              [ ]            n7
  Cash and cash equivalents                                    [ ]              [ ]            n8
  TOTAL ASSETS                                                 [ ]              [ ]
EQUITY
  Share capital (issued and paid)                              [ ]              [ ]            n9
  Share premium / additional paid-in capital                   [ ]              [ ]            n9
  Retained earnings / (accumulated losses)                     [ ]              [ ]            n10
  Other reserves (revaluation, translation)                    [ ]              [ ]            n11
  TOTAL EQUITY                                                 [ ]              [ ]
LIABILITIES
NON-CURRENT LIABILITIES
  Loans and borrowings                                         [ ]              [ ]            n12
  Lease liabilities                                            [ ]              [ ]            n2
  Provisions (including a provision for a known claim)         [ ]              [ ]            n13
  Deferred tax liability                                       [ ]              [ ]            n4
CURRENT LIABILITIES
  Trade and other payables                                     [ ]              [ ]            n14
  Accrued expenses and staff costs payable                     [ ]              [ ]            n15
  Tax payable                                                  [ ]              [ ]            n16
  Loans and borrowings — current portion                       [ ]              [ ]            n12
  Related-party payables                                       [ ]              [ ]            n17
  TOTAL LIABILITIES                                            [ ]              [ ]
  TOTAL EQUITY AND LIABILITIES                                 [ ]              [ ]

THE FIGURES ARE INTENTIONALLY BLANK. THERE IS NO OPENING POSITION, NO FIXED-ASSET REGISTER AND NO
VERIFIED SHARE CAPITAL. NOTHING MAY BE ENTERED.

CHECK: TOTAL ASSETS = TOTAL EQUITY + TOTAL LIABILITIES.   [ ] BALANCED   [ ] NOT BALANCED — see FIN-09 §2
```

## 2. Line-by-line rules

| # | Line | Rule |
|---|---|---|
| 2.1 | **Cost and accumulated depreciation** | From a **fixed-asset register**, with a ratified depreciation policy. **Never a rounded guess** |
| 2.2 | **Leases** | The treatment depends on the framework `[ACCOUNTANT TO CONFIRM]` — including whether a right-of-use asset is recognised |
| 2.3 | **Investments** | At cost or fair value per the policy; **an investment in a group entity is not a marketable asset and its valuation is a question** |
| 2.4 | **Deferred tax** | **Blank** unless the framework requires it and the tax position is confirmed |
| 2.5 | **Inventory** | At the policy's valuation, with the count evidence; **for Agriculture/Ujenzi, include spoilage, shrinkage and work-in-progress** |
| 2.6 | **Receivables** | **Net of a provision for doubtful debts**, with the **ageing** behind the number. **A receivable that will never be collected is not an asset** |
| 2.7 | **Grant/prepayment receivables** | Only where the grant is **contracted** and the conditions met — with the accounting treatment confirmed |
| 2.8 | **Cash** | Tied to the **bank reconciliations** (`FIN-05` §2.9). **Cash in a personal or unrecorded account is a finding, not an asset** |
| 2.9 | **Share capital** | The **issued** capital per the **register of members** (`D64`). **`CAP-01` holds ZERO verified shares** — so this line is **blank, not zero**. **Zero would be a claim** |
| 2.10 | **Retained earnings** | **Ties to `FIN-07`** (the statement of changes in equity) and to `FIN-04`'s result through the defined bridge (`FIN-09` §4) |
| 2.11 | **Loans** | With the **loan documents**, the interest treatment, the covenants and the security given (`D67`, `CMP-01` §10.5) |
| 2.12 | **Provisions** | Recognised **only** where the framework's criteria are met, on the basis of a **documented assessment** (e.g. a known claim, `D71`). **A provision without a basis is an invention; a known claim with no provision is a finding** |
| 2.13 | **Payables** | Including **accrued** amounts (unpaid invoices, staff costs, statutory amounts). **An accrued liability that is omitted understates costs** |
| 2.14 | **Tax payable** | **Blank** until confirmed |
| 2.15 | **Related-party balances** | **Presented separately** (not netted, not buried in trade balances), with the disclosure in `FIN-08` and the approval in `D72` |
| 2.16 | **Going concern** | The assessment **must be documented** — whether the entity can continue for the foreseeable period. **`[ACCOUNTANT TO CONFIRM]` the period and the criteria. Where there is no entity and no funding, the assessment is the first thing an accountant will ask about** |
| 2.17 | **Contingent liabilities** | Disclosed in `FIN-08`, not on the face (unless the framework requires recognition) |

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

## 5. The equation (the first control)

**TOTAL ASSETS = TOTAL EQUITY + TOTAL LIABILITIES.** A statement that does not balance **is not presented** —
it is investigated (`FIN-09` §2). **It is never balanced by adjusting a line, by a "balancing figure", by a
suspense account or by a rounding change.** Any such adjustment is a finding.

## 6. Decisions required from the user / family / governing bodies

1. **Which entity** — and the **consolidation** position (**which requires control, which is unverified**).
2. The **accounting framework** and the **currency**.
3. The **opening position** — the first, most difficult question. **Without it, there is no balance sheet.**
4. The **valuation policies** for the non-cash assets.
5. The **provision and going-concern assessments**.
6. Whether **any asset is held personally** by a family member but used by the business — **and if so, that is a
   related-party and control finding, not an asset** (`D72`).

## 7. Accountant review note — `[ACCOUNTANT TO CONFIRM]`

1. **The framework**, the presentation and the **opening balances**.
2. Whether any **development cost may be capitalised**.
3. The **lease** treatment.
4. **Depreciation and amortisation** policies.
5. The **receivables provision** methodology.
6. The **inventory** valuation.
7. The **deferred tax** requirement.
8. The **provision** criteria and the **going-concern** assessment.
9. **Consolidation** — whether, and how control is established (**and it is not, today**).
10. Whether the statement requires **filing**, and by when.

**This statement is blank. There is no opening position, no ledger, no fixed-asset register and no verified
share capital. The equity section cannot be completed because no share has been verified as issued.**