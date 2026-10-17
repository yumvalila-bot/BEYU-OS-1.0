# BEYU-LF-D38 — Family Wealth Dashboard Data Dictionary and Reporting Schedule

Document ID: `BEYU-LF-D38`
Title: Family Wealth Dashboard Data Dictionary and Reporting Schedule
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — **no dashboard exists, no figure is sourced, no report has been
produced. Every data element below is unpopulated.**
Document owner: Family Office Principal (proposed) with the Finance OS authority
Approving authority (proposed): the Trustees and the board, each for its own data
Next review date: Annually, and on any change to the accounting authority
Classification: `HIGHLY_RESTRICTED`
Related documents: `D08`, `D24`, `D33`, `D35`, `D67`, `D68`, `D70`
Depends on: `C-1` (accounting-authority ratification); `FIR-018`; the control plane's read-only reporting
surface

> **⚠ THE FOUR DATA RULES (restating `D33` because a dashboard is where they are most often broken).**
> **1. Never blend owners.** Every figure is attributed to **one** owner. There is no "family wealth" total.
> **2. Never blend realised and contingent.** A forecast is labelled a forecast.
> **3. Reconcile or say `UNRECONCILED`.** No unsourced number appears on a dashboard.
> **4. A dashboard is a report, not a record and not an authority.** It creates no right, no entitlement and
> no decision, and **it must never be the only place a figure exists** (`FIR-018`).

---

## 1. Purpose and scope

To define, at field level, **every** data element that may appear on a family wealth dashboard, so that:
(a) each figure has a named **source of truth**; (b) each figure has a **defined meaning**; (c) each figure
has a **cadence and an owner**; and (d) **no figure can be produced without a source.**

**Scope.** Reporting on: Trust assets and distributions; company assets, liabilities and results; family
activities; Foundation funds; and the Family Office's own service metrics. **Out of scope:** anything the
control plane cannot source, and anything that would require a definition that does not exist (prime
example: "the family").

## 2. The data dictionary

**Legend — `SOT` = source of truth; `Cadence`; `Owner` (who is accountable); `Class` = sensitivity.**
**Legal-effect note for every row: the dashboard is a *report* (`DEFINED_TERMS.md` §2 step 8). It is below
every instrument and every decision.**

### 2.1 Identity and structure

| Ref | Data element | Definition | SOT | Cadence | Owner | Class |
|---|---|---|---|---|---|---|
| I-01 | Entity ID | The `D63` internal reference | `D63` | On change | Company Secretary | INTERNAL |
| I-02 | Entity legal name | Exactly as registered | `D63` | On change | Company Secretary | INTERNAL |
| I-03 | Entity tier | Tier 1–4 / Foundation / Family Office | `D63` (`D30` §2) | On change | Company Secretary | INTERNAL |
| I-04 | Sector OS mapping | Software identity, explicitly **not** a legal entity | `D63` | On change | Company Secretary | INTERNAL |
| I-05 | Entity status | `PROPOSED`/`REGISTERED`/`DORMANT`/etc. | `D63` | Monthly | Company Secretary | INTERNAL |
| I-06 | Ownership summary | Holder and class, **per entity** | `D64` | On change | Company Secretary | RESTRICTED |

### 2.2 Money (the dangerous half of the dashboard)

| Ref | Data element | Definition | SOT | Cadence | Owner | Class |
|---|---|---|---|---|---|---|
| M-01 | Cash and bank balances, **per legal account and per entity** | The bank's own balance | Accounting authority (per `C-1`) | Daily/on demand | Finance authority | RESTRICTED |
| M-02 | Reconciled? | `RECONCILED` / `UNRECONCILED` (as at date) | `D35` §5.1 | On production | Finance authority | INTERNAL |
| M-03 | Receivables / payables | With ageing | Accounting authority | Monthly | Finance authority | RESTRICTED |
| M-04 | Intercompany balances | **Per pair**, never netted into one figure | Accounting authority | Monthly | Finance authority | RESTRICTED |
| M-05 | Debt and facilities | Facility, drawn, undrawn, rate, covenant headroom | Loan documents + accounting authority | Monthly | Finance authority | RESTRICTED |
| M-06 | Contingent liabilities | Guarantees, claims, commitments, with the source | `D71` | Monthly | Company Secretary | RESTRICTED |
| M-07 | Liabilities (total, per entity) | **Never shown as a group "net position" without the per-entity detail** | Accounting authority | Monthly | Finance authority | RESTRICTED |
| M-08 | Trust distributions made (per beneficiary category) | Trust decision reference for each | `D05` §4.1 record | On event; monthly roll-up | Family Office | HIGHLY RESTRICTED |
| M-09 | Trust distributions planned | A **forecast**, labelled as such | `D33` §4 | Quarterly | Family Office | HIGHLY RESTRICTED |
| M-10 | Liquidity floor status | Within / below the floor, with the `D33` §5 basis | `D33` | Monthly | Finance authority | RESTRICTED |
| M-11 | Solvency indicator | Per entity, per the applicable test | Accounting authority + counsel | Quarterly | Finance authority | RESTRICTED |
| M-12 | Related-party transactions in the period | From `D72`, arm's-length status | `D72` | Quarterly | Company Secretary | RESTRICTED |
| M-13 | Fees and expenses of the Family Office | Per `D32` §4 — **currently nil: no fee is charged** | Accounting authority | Quarterly | Family Office | RESTRICTED |
| M-14 | Adviser fees | Per body, per `D36` | Accounting authority | Quarterly | Family Office | RESTRICTED |

### 2.3 Assets (a register is not a valuation)

| Ref | Data element | Definition | SOT | Cadence | Owner | Class |
|---|---|---|---|---|---|---|
| A-01 | Asset inventory row | The `D67` entry (custodian, location, documents) | `D67` | On change | Company Secretary | RESTRICTED |
| A-02 | Asset **registered owner** | **Mandatory on every asset row** | `D67` | On change | Company Secretary | RESTRICTED |
| A-03 | Asset valuation | With the **basis** (cost / market / independent / management estimate) and the date | The valuation report; **a dashboard never invents a value** | At the valuation date | Finance authority | RESTRICTED |
| A-04 | Valuation basis and currency | Mandatory label | Same | Same | Finance authority | INTERNAL |
| A-05 | Encumbrance status | Charge, pledge, restriction, or none | The instrument | Quarterly | Company Secretary | RESTRICTED |
| A-06 | IP assets | Count of **verified** entries only (`D40` §2.2 and §3) | `D44` | Quarterly | Company Secretary | RESTRICTED |
| A-07 | Insurance cover vs insured value | Gaps flagged | `D71` | Annually | Company Secretary | RESTRICTED |

**A-01/A-03 rule: "owned" and "worth" are two different fields. A row must never combine them into one
number.**

### 2.4 Performance and forecast

| Ref | Data element | Definition | Cadence | Owner |
|---|---|---|---|---|
| P-01 | Revenue / cost / result per entity | Per the accounting authority | Monthly | Finance authority |
| P-02 | Budget vs actual, with variance | Label: actual / budget / variance | Monthly | Finance authority |
| P-03 | Forecast | **Explicitly labelled a forecast**, with its assumptions and its confidence | Quarterly | Finance authority |
| P-04 | Downside case | The `D33` §4.4 case — mandatory in the annual report | Annually | Finance authority |
| P-05 | Investment return | **Gross and net of fees, per portfolio, per owner** | Quarterly | Family Office |

### 2.5 Family Office service metrics

| Ref | Data element | Definition | Cadence | Owner |
|---|---|---|---|---|
| S-01 | Reports delivered on time | Per `D32` §3 (SLAs currently **not set** → this metric is not yet measurable) | Monthly | Family Office |
| S-02 | Open items and overdue obligations | From `D68` | Monthly | Family Office |
| S-03 | Reconciliation exceptions | Count and ageing | Monthly | Family Office |
| S-04 | Escalations raised and closed | From `D32` §3.3 | Monthly | Family Office |
| S-05 | Control-test results | Per `D35` §5.2–5.3 | Quarterly | Family Office |

### 2.6 Prohibited data elements (the dashboard must not contain these)

| # | Prohibited | Why |
|---|---|---|
| 1 | **A single "family wealth" total** | It blends owners and implies a shared pot (`D33` §3.3) |
| 2 | **A per-person entitlement figure** | It implies a right that may not exist (`D05` §5.2) |
| 3 | **Options shown as issued shares** | Misleading (`D24` §7.3) |
| 4 | **A projected distribution presented as certain** | Blends the contingent with the real |
| 5 | **An estimated value presented without basis or date** | Unsourced |
| 6 | **Any figure sourced from a simulation, seed or fixture** | `GATE-0` §6–§7 |
| 7 | **A net intra-group position shown without the gross pairs** | Hides the entity-level reality |
| 8 | **An unratified policy presented as binding** | `C-1` |
| 9 | **Personal data beyond what the recipient needs** | `D70` |
| 10 | **Any figure with no `SOT`** | Rule 3 |

## 3. The reporting schedule

| Ref | Report | Recipient | Cadence | Content | Source |
|---|---|---|---|---|---|
| R-01 | Cash and position summary | Trustees / board (each for its own) | Monthly | M-01, M-02, M-10 | Accounting authority |
| R-02 | Entity and structure status | Trustees / board | Quarterly | I-01–I-06, A-01, A-02 | `D63`, `D67` |
| R-03 | Obligations and filings status | Trustees / board | Monthly | `D68` overdue and next-30-day items | `D68` |
| R-04 | Liabilities, guarantees and contingencies | Board | Quarterly | M-05–M-07 | Accounting authority, `D71` |
| R-05 | Related-party report | Board + Audit and Risk Committee | Quarterly | M-12, with arm's-length status | `D72` |
| R-06 | Trust distribution record and forecast | **Trustees only** | On event / quarterly | M-08, M-09 | Trust records |
| R-07 | Investment performance | Trustees / board | Quarterly | P-05 | Custodian/valuer |
| R-08 | Budget vs actual and forecast | Board | Monthly / quarterly | P-02, P-03 | Accounting authority |
| R-09 | Foundation funds and grants | Foundation governing body | Quarterly | Grants, restricted funds, cost allocation | `D52`, `D53` |
| R-10 | Annual report to the family | The family (as defined — **`FIR-003` pending**) | Annually | The full picture, including the downside case | All |
| R-11 | Auditor's package | Auditors | Annually | As scoped | Accounting authority |
| R-12 | Service metrics | Mandating bodies | Monthly/quarterly | S-01–S-05 | Family Office |

**3.1 The reporting gate.** No report may be produced if: its source is unreconciled and unlabelled; it would
blend owners; or it would disclose personal data beyond the recipient's need. **The Family Office must
decline to produce such a report and escalate** (`D31` §4.1).

## 4. Presentation rules

| # | Rule |
|---|---|
| 1 | Every figure carries: **owner + currency + as-at date + source + basis** |
| 2 | Every card/panel shows the **reconciliation status** |
| 3 | Forecasts are visually and textually distinct from actuals |
| 4 | A figure that cannot be sourced is shown as **"not available"** — never estimated silently |
| 5 | Currency conversions show the **rate and the date** and are never blended into one total across owners |
| 6 | Prior-period figures are retained; **a correction is a new row, not a rewrite** (`D33` §7.1) |
| 7 | Every dashboard has a "what this does not tell you" panel — **written by a human** |
| 8 | Access is least-privilege per recipient; **a Trust-only view is not the company view** |

## 5. Controls and the control plane

| # | Control |
|---|---|
| C-01 | Dashboards are **read-only** presentations of source systems |
| C-02 | **No dashboard becomes a system of record**; a figure whose only home is the dashboard is a `FIR-018` breach |
| C-03 | The dashboard may not write to any ledger, register or policy record |
| C-04 | Every panel's data lineage is documented (element → source → query/report) |
| C-05 | Access reviews at least annually; revoked on role change |
| C-06 | **AI** may generate drafts, summaries and exception flags. AI may **not** be the source of a figure, may **not** approve a report, and may **not** produce the "what this does not tell you" panel |
| C-07 | Any figure a family member disputes is traced to source **and the trace recorded** |
| C-08 | The dashboard's availability rules follow the control plane's (`legal_effect_status` UI conventions unchanged; no dashboard may imply a legal effect) |

## 6. Decisions required from the user / family / governing bodies

1. **Who receives which report** (particularly R-06, Trust-only).
2. Whether individual family members see the whole picture or only their own area.
3. The **valuation policy** (who values what, how often, on what basis) (`D33` §3 and §6).
4. The **currency presentation**.
5. Whether the dashboard is in the control plane, a spreadsheet, or a reporting tool — and **where the
   source remains** (never the dashboard).
6. The **cadence** the family actually wants, and the cost of producing it.

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether any report **creates a disclosure obligation** (to a beneficiary, a regulator, a bank or a tax
   authority), and its timing (`Q-T-02(f)`, `Q-TAX-03`).
2. Whether a **beneficiary** is entitled to information about the Trust, and what may be withheld
   (`Q-T-04`).
3. The **data-protection** position for the dashboard, its recipients and any cross-border access
   (`Q-DP-04`).
4. Whether producing a consolidated **family** view carries any legal or tax consequence.
5. Whether the **Foundation's** reporting duties permit the proposed presentation (`Q-G-02`).

**No dashboard exists. No figure has been sourced. No report has been produced. Nothing on any hypothetical
dashboard is a fact.**
