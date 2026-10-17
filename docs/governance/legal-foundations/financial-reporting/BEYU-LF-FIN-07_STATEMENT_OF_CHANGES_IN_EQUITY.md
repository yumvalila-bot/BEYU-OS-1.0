# BEYU-LF-FIN-07 — Statement of Changes in Equity

Document ID: `BEYU-LF-FIN-07`
Title: Statement of Changes in Equity Framework — blank template and the equity-reconciliation bridge
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` — BLANK. NO SHARE ISSUE IS VERIFIED. NOT PREPARED, NOT APPROVED, NOT AUDITED, NOT FILED.**
Owner (proposed): CFO · Approving authority (proposed): the board, with the Audit and Risk Committee reviewing
Next review date: Monthly once a ledger exists
Classification: `HIGHLY_RESTRICTED`
Related: `FIN-04`, `FIN-06`, **`FIN-09` §4 and §7**, `CAP-01` (**ZERO verified shares**), `D64`, `D24`, `D72`,
`ESOP-01` §6.7
Depends on: **a verified share register, a ratified accounting policy and the accountant's answers — NONE of
which exists**

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
STATEMENT OF CHANGES IN EQUITY — [ENTITY EXACTLY AS NAMED IN D63]
For the period [START] to [END]        Currency: [ ]        Status: [DRAFT / UNAPPROVED]
Prepared by: [ ]   Reviewed by: [ ]   Approved by: [ ] on [ ]

                                Share      Share       Retained    Other         Total
                                capital    premium     earnings    reserves      equity
Balance at [start of period]      [ ]        [ ]         [ ]         [ ]          [ ]
  Profit / (loss) for the period   —          —          [ ]          —           [ ]    ← ties to FIN-04
  Other comprehensive income       —          —           —          [ ]          [ ]
  Shares issued during the period [ ]        [ ]          —           —           [ ]    ← see rule 2.1
  Share-based payment expense      —         [ ]         [ ]          [ ]         [ ]    ← see rule 2.2
  Dividends declared / paid        —          —          ( )          —           ( )    ← see rule 2.3
  Transfers between reserves       —          —          [ ]         ( )           —     ← see rule 2.4
Balance at [end of period]        [ ]        [ ]         [ ]         [ ]          [ ]    ← ties to FIN-06

THE FIGURES ARE INTENTIONALLY BLANK. NO SHARE HAS BEEN VERIFIED AS ISSUED. NOTHING MAY BE ENTERED.
```

## 2. Line-by-line rules

| # | Line | Rule |
|---|---|---|
| 2.1 | **Shares issued** | **A share is recorded here only when it was validly issued, the consideration was dealt with, and the register was updated** (`D24` §1.3 S1–S5; `D64`). **`CAP-01` holds ZERO verified shares — so this line is blank.** **A "founders' equity" entry with no issue behind it would be a fabricated capitalisation** |
| 2.2 | **Share-based payment** | The **accounting** treatment of options and equity-settled remuneration `[ACCOUNTANT TO CONFIRM]` — including the measurement approach and the vesting-period spread. **`ESOP-01` has no adopted plan and no grant, so this line is blank** |
| 2.3 | **Dividends** | Only where **lawfully declared and paid** — with the **solvency test** satisfied (`D24` §6) and the approval recorded (`D27`). **A dividend that breached the solvency test is a breach, not a line item** |
| 2.4 | **Transfers between reserves** | Permitted by the policy and documented — **never a device to make a distribution look smaller** |
| 2.5 | **The tie-in rule.** The **closing equity** must equal `FIN-06`'s total equity, **line by line** — not merely in total. Any difference is a finding (`FIN-09` §7) |
| 2.6 | **The equity bridge.** Equity moves only through: **profit/loss · other comprehensive income · transactions with owners (issues, buy-backs, dividends, share-based payment) · restatements**. **Any movement that cannot be explained by one of these is a finding** (`FIN-09` §7) |
| 2.7 | **A restatement** of a prior period is disclosed with the reason — **never a silent change** |

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

## 5. Why this statement matters more than it looks

**This is the statement that proves whether the group's claimed ownership is real.** It is where the **share
register**, the **cap table** (`CAP-01`) and the **accounting records** must agree. **Today they cannot: the
cap table is empty because no issue is verified, and there is no ledger.** **This statement is prepared when
there is a real share issue and a real ledger — not before.**

## 6. Decisions required from the user / family / governing bodies

1. **Whether any share has been issued at all** — and if not, state that plainly: **the entity (when it exists)
   will have no issued capital.**
2. The **capital structure decision** (`D22`; `CAP-01` §8).
3. The **dividend policy** (`D24` §6) — and the solvency test.
4. The **accounting treatment of any equity-settled arrangement** (with the accountant).

## 7. Accountant review note — `[ACCOUNTANT TO CONFIRM]`

1. The **framework's** requirements for this statement.
2. The **share-issue entries** and the consideration treatment (including **any issue for services**).
3. **Share-based payment** — whether the framework applies, and how it is measured and spread.
4. **Dividends** — the treatment, and the reserve requirements.
5. **Other comprehensive income** — whether any item is expected.
6. **Restatements** — the disclosure requirements.

**This statement is blank. **No share has been verified as issued**, and the group's capitalisation is
undetermined (`D21` `BLOCKED`; `CAP-01`). The equity section of every statement in this series cannot be
completed until a share issue is evidenced.**