# BEYU-LF-FIN-09 — Reconciliation and Integrity Controls

Document ID: `BEYU-LF-FIN-09`
Title: Reconciliation Controls for the Financial Statements — the bridges, the checks and the findings discipline
Version: 1.0 (draft) · Date 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — **the controls are defined; NONE has been run, because there is no ledger
and no statement. A control that has not been run has not been satisfied.**
Owner (proposed): CFO, with the Audit and Risk Committee reviewing · Approving authority (proposed): the board
Next review date: **With every statement preparation**, and quarterly
Classification: `HIGHLY_RESTRICTED`
Related: `FIN-04`–`FIN-08`, `FIN-02`, `D69`, `D26` §3, `D66`, `D67`, `D64`, `D72`, `D71`, `D74`
Depends on: **a ledger and statements to reconcile — neither exists**

> **⚠ WHAT THIS DOCUMENT IS.**
> **It is the set of checks that decide whether a financial statement may be relied on at all.** Not the
> arithmetic — **the integrity**: does the balance sheet balance; does the cash agree to the bank; does the
> equity agree to the share register; does the profit agree to the movement in equity; do the statements agree
> to each other; does the tax agree to the tax records; and **is anything in the statements unsupported by a
> document**.
> **Running a control produces a result: PASS, FAIL or NOT_RUN.** **`NOT_RUN` is an honest result. `PASS`
> without the ledger, the reconciliation or the evidence is a false assurance — and a green dashboard that was
> never reconciled is exactly the failure this document exists to prevent** (`X-7`; `DEFINED_TERMS` §2).

---

## 1. Control inventory

| ID | Control | Purpose | Evidence of the run |
|---|---|---|---|
| `RC-01` | **Trial balance agrees to the ledger** | The statements are drawn from the book of record | The trial balance and the ledger extract, dated |
| `RC-02` | **A = L + E (the balance sheet balances)** | No unexplained difference | The check sheet, initialled |
| `RC-03` | **Cash bridge** — closing cash per the cash flow statement = per the balance sheet = per the bank reconciliations | Cash is real | The bank reconciliations for each month-end |
| `RC-04` | **Profit bridge** — the result per the income statement = the movement in retained earnings per the equity statement (adjusted only for distributions, restatements and prior-period items, each identified) | The result is not fabricated | The bridge schedule with each adjustment named |
| `RC-05` | **Equity bridge** — opening equity + profit + other comprehensive income + owner transactions = closing equity, **line by line against the balance sheet** | Ownership movements are real | The schedule; the share register |
| `RC-06` | **Share register ↔ cap table ↔ equity note** — the share capital line equals the **register of members** | The claimed capitalisation is real (**today it is zero**) | `D64`; `CAP-01`; the note |
| `RC-07` | **Tax bridge** — tax paid per the cash flow = per the tax records; tax expense per the income statement = per the computation | Tax is not a guess | The returns/assessments and the computation |
| `RC-08` | **Receivables sub-ledger ↔ general ledger ↔ ageing** | Collectability is assessed | The ageing and the provision |
| `RC-09` | **Payables sub-ledger ↔ general ledger**, including accruals | Liabilities are complete | The listing and the accrual schedule |
| `RC-10` | **Fixed-asset register ↔ general ledger ↔ depreciation charge** | Assets and depreciation are real | The register, movements, and the charge |
| `RC-11` | **Inventory count ↔ general ledger** | Inventory exists | The count sheets and the valuation |
| `RC-12` | **Loan schedule ↔ general ledger ↔ loan documents ↔ interest** | Liabilities and finance costs are real | `D67`; the schedule |
| `RC-13` | **Related-party balances ↔ `D72` register** | Related-party disclosure is complete | `D72`; the schedule |
| `RC-14` | **Bank signatories ↔ the mandate ↔ the decision register** | **Only authorised people can move money** | `D35` §3; `D73` |
| `RC-15` | **Every material line supported by a document** | **No unsupported figure** | The support index (`D74`) |
| `RC-16` | **Intercompany balances eliminate** (where consolidated) | No double counting | The elimination schedule |
| `RC-17` | **Prior-period comparatives agree to the prior statements** (or are restated with the reason disclosed) | Comparability | Prior statements; the restatement note |
| `RC-18` | **Ceiling/interception check: totals recompute** and the statements **foot and cross-foot** | Arithmetic | The check sheet |
| `RC-19` | **Preparer ≠ reviewer** for each statement | Segregation of duties | The sign-offs |
| `RC-20` | **No manual override of a control, or any override disclosed and approved** | Overrides are the classic fraud vector | The override log |
| `RC-21` | **The statement's status label matches reality** (`DRAFT`/`UNAPPROVED`/`MANAGEMENT PREPARED`/`AUDITED`) | **No false assurance** | The approval record; the audit report if claimed |
| `RC-22` | **No figure in any statement originates from a model output, a fixture or seed data** | **The prohibition** | The support index; the ledger |

## 2. `RC-02` — the accounting equation (the first check)

**Run it in full, not in total.** A balance sheet can balance in total while containing compensating errors in
its components. Checks: (a) each **class** total; (b) the **components** of each class; (c) the **cross-foot**
of the equity section; (d) the **tie to `FIN-07` line by line**.
**A difference is investigated, not adjusted.** The result and the resolution are recorded. **Where the
difference is unresolved, the statement is labelled `UNRECONCILED` on its face, with the amount and the
reason — and it is not issued to a bank, a tax authority, an investor or a regulator in that state.**

## 3. `RC-03` — the cash bridge (the second check)

**Three figures must agree:** the cash flow statement's closing cash; the balance sheet's cash line; the bank
statements after reconciling items. **The reconciling items are itemised** (uncleared cheques, deposits in
transit, bank charges, unrecorded items, errors) — and **each is investigated, not carried forward
indefinitely.**
**A "suspense" balance that persists is a finding**, and a persistent suspense balance is a symptom of a
record-keeping failure — **never of a "timing difference" that never resolves.**
**Cash held outside the entity's accounts** (a personal account, an unrecorded till, an undocumented transfer)
**is a finding** and, where it is used to avoid recording, engages the **shadow-ledger prohibition**
(`FIR-018`; `D35`) — regardless of intent.

## 4. `RC-04` — the profit bridge (the third check)

**The result per the income statement must equal the movement in retained earnings** per the statement of
changes in equity, allowing only for: (a) distributions; (b) prior-period adjustments/restatements; (c)
transfers to reserves; (d) other comprehensive income. **Each exception is named and evidenced.**
**An unexplained difference means one of two statements is wrong** — and **the correct response is to find out
which, not to adjust the equity statement.**

## 5. `RC-05` and `RC-06` — the equity and share-register checks (the checks this group most needs)

| # | Check | Why it is critical here |
|---|---|---|
| 5.1 | **Share capital per the balance sheet = the register of members** (`D64`) | **There is no verified share issue (`CAP-01`). The correct entry is BLANK, and the note must say that no issue is evidenced** |
| 5.2 | **Share premium = the consideration received over nominal value**, evidenced | Requires the consideration evidence (`D24`) |
| 5.3 | **The cap table rebuilds from the register** (`CAP-01` §5) | A snapshot that cannot be rebuilt is not relied on |
| 5.4 | **The equity statement's movements each tie to a decision** (a board/shareholder resolution, a dividend declaration) | `D73` — **an equity movement with no decision is a finding** |
| 5.5 | **Any share-based payment expense ties to a plan and a grant instrument** | **No plan exists (`ESOP-01`)** |
| 5.6 | **Any share held by a trust is evidenced by the trust instrument and the register entry** | `D02`, `D64`, `D65` — **and the beneficial-ownership filing** (`CMP-01` §6) |

## 6. Non-statutory measures (the bridge rule)

**Where the board reports a measure that is not in the framework (a "cash burn", an "operating result", a
"contribution", an "EBITDA-like" figure):**
(a) it is **defined in writing**; (b) it is **reconciled to the nearest statutory line**, with the reconciliation
shown wherever the measure appears; (c) it is **not presented more prominently than the statutory figure**; and
(d) it is **never used to obscure a loss**, to exclude a real cost, or to describe a projection as a result.
**A non-statutory measure with no reconciliation is a finding.**

## 7. The findings discipline

| # | Rule |
|---|---|
| 7.1 | **Every control produces a result** — `PASS` / `FAIL` / `NOT_RUN` — with the date, the preparer and the evidence |
| 7.2 | **A `FAIL` is recorded in the findings log** and escalated to the Audit and Risk Committee; **it is not quietly fixed** |
| 7.3 | **A `NOT_RUN` is disclosed** in the reporting pack — **a control that was not run is not a control that passed** |
| 7.4 | **Every finding has an owner, a corrective action and a date**; a finding is closed by evidence, **not by assertion** |
| 7.5 | **Recurring findings escalate** — a repeated failure is a control-design problem, not a person problem |
| 7.6 | **Materiality is set by the accountant**; below it, an error is still **recorded** (aggregated errors can be material together) |
| 7.7 | **No override.** Any manual override of a control is logged, approved by a person other than the operator, and disclosed to the Committee (`RC-20`) |
| 7.8 | **A finding of a **fabricated or unsupported figure** is a critical finding**: the statement is withdrawn or corrected, the source of the figure is documented, and the matter is reported to the Committee. **This includes any figure that came from a fixture, a seed dataset, a scenario or an AI output** |

## 8. What this document must never be used to claim

| # | Prohibited |
|---|---|
| 8.1 | **"The controls passed"** where any control is `NOT_RUN` |
| 8.2 | **"The accounts are correct"** — a reconciliation control tests selected ties, not accuracy or compliance |
| 8.3 | **"Audited", "reviewed", "verified by an auditor"** — no engagement exists |
| 8.4 | **"Tax compliant"** — `RC-07` tests ties to tax records that do not exist |
| 8.5 | **"No fraud"** — no control detects all fraud; the controls here **reduce a specific risk** (unsupported figures, unrecorded cash, unreconciled equity) |
| 8.6 | **A green dashboard as evidence** that anything here happened |

## 9. Decisions required from the user / family / governing bodies

1. **The book of record** — the ledger, and who operates it (`D69`; the policy is unratified).
2. The **banking structure** and the rule that **all funds pass through entity accounts** (`D35`).
3. The **reconciliation calendar** and who prepares and reviews each control.
4. The **materiality** level (with the accountant).
5. The **override authority** and its limits.
6. Who receives the **findings log**, and how it reaches the Audit and Risk Committee.
7. Whether an **internal audit or an external accountant** performs an independent check — **and never to
   describe it as an audit unless it is one**.

## 10. Accountant review note — `[ACCOUNTANT TO CONFIRM]`

1. The **applicable controls** for the framework, and any the framework requires that are missing here.
2. **Materiality**, and the treatment of aggregated immaterial errors.
3. The **reconciliation** requirements for tax, payroll and statutory filings.
4. The **opening-position** approach where records do not exist — **which is the group's actual position**.
5. Whether a **review or an audit** is required by law, by a funder or by a lender.
6. The **format** of the findings log and who should receive it.

**No control in this document has been run. There is no ledger, no statement and no reconciliation. `NOT_RUN`
is the accurate result for every control in this list.**