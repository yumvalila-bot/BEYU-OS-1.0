# BEYU OS — Finance OS Policy-Engineering Dependency Matrix

**Document Version:** 1.0.0  
**Date:** 2026-09-05  
**Author:** Principal BEYU OS Finance OS Engineering & Security Agent  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Branch:** `arena/01a07108-beyu-os-1-0`  

---

## 1. Overview & Architectural Principles

In accordance with BEYU OS architectural invariants:
1. **Engineering does NOT invent accounting policy, approvals, provenance, or effective dates.**
2. **Every governance dependency must have complete technical machinery built, tested, and ready to consume authoritative decisions.**
3. **Double-entry posting (`CAP_POSTING`) remains strictly LOCKED (FAIL-CLOSED) until required governance decisions are ratified by authorized human authorities.**

---

## 2. Policy-Engineering Dependency Matrix (P1 through P11)

| Policy ID | Policy Decision Name | Required Governance Authority | What the Policy Decides | Implemented Technical Machinery | How Machinery Consumes Decision | Verified with Test / Mock Inputs? | Policy Status | Blocks `CAP_POSTING`? |
|---|---|---|---|---|---|---|---|---|
| **P1** | Accounting Basis & Standards | CFO / Audit & Risk Committee | Selection of accounting basis (IFRS vs. US GAAP vs. Cash Basis), revenue recognition cutoff, and fiscal year definition. | `src/lib/finance/reports.ts`, `revenue-recognition.ts`, `truth.ts` | Configures basis parameter in statement generators and revenue amortization engines. | **YES** (Skeletons and calculation algorithms unit tested) | `PENDING GOVERNANCE` | **YES** |
| **P2** | Functional & Reporting Currency | Board of Directors / CFO | Establishes primary base functional currency (e.g., TZS, USD, EUR) per operating legal entity. | `src/lib/finance/fx-engine.ts`, `src/db/schema/finance.ts` (`currency` fields). | Injected into ledger account definitions, currency conversion matrix, and base entity profiles. | **YES** (Multi-currency math and FX triangulation verified) | `PENDING GOVERNANCE` | NO (Base currency fallback configured) |
| **P3** | Accounting Period Cadence & Close Policy | CFO / Financial Controller | Monthly / quarterly calendar cutoff dates, soft-close vs. hard-close grace periods, adjustment journal protocols. | `src/lib/finance/period-manager.ts`, `financial_period_no_overlap` constraint. | Validates transaction dates against open period boundaries and enforces state progression. | **YES** (State machine transition tests pass) | `PENDING GOVERNANCE` | NO (Period engine operates independently) |
| **P4** | Capitalization Threshold & Depreciation Methods | CFO / Board of Directors | Fixed asset capitalization minimums (e.g., $1,000 / TZS 2,500,000) and depreciation schedules (Straight-line, MACRS, DDB) per asset class. | `src/lib/finance/depreciation.ts`, `capital-assets.ts`. | Schedule calculation functions accept method, useful life, and salvage percentage parameters. | **YES** (Depreciation calculation suite passes) | `PENDING GOVERNANCE` | NO |
| **P5** | Materiality Thresholds & Rounding | CFO / Chief Risk Officer | Error tolerance for reconciliation discrepancies, penny rounding allocation rules, and disclosure materiality bounds. | `src/lib/finance/reconciliation.ts`, `core.ts` (`validateJournalBalance`). | Enforces strict zero-tolerance ($0.00) balance invariants on GL, with configurable variance alerting on treasury reconciliation. | **YES** (Zero silent drift verified) | `PENDING GOVERNANCE` | NO |
| **P6** | Chart of Accounts (CoA) Master Hierarchy | CFO / Accounting Board | Authoritative account codes, classification rules (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE), and multi-tenant code structures. | `drizzle/0022_chart_of_accounts_tenant_uniqueness.sql`, `src/db/schema/finance.ts`, `templates.ts`. | Tenant-scoped account tables load ratified CoA codes; journal posting validates account existence. | **YES** (Multi-tenant uniqueness index verified) | `PENDING GOVERNANCE` | **YES** |
| **P7** | Foreign Exchange Rate Sources & Revaluation Frequency | Treasury Committee / CFO | Designated authoritative FX rate providers (e.g., Bank of Tanzania, ECB, Bloomberg) and unrealized gain/loss booking frequency. | `src/lib/finance/fx-engine.ts`. | FX engine calls registered rate provider adapter; revaluation engine posts to designated unrealized FX accounts. | **YES** (Rate conversion and mock rate feed tested) | `PENDING GOVERNANCE` | **YES** |
| **P8** | Expense Approval & Travel Policy Thresholds | Executive Committee / CFO | Spend limits per employee grade, required receipt attachment rules, and dual-authorization thresholds. | `src/lib/finance/expense-manager.ts`. | Evaluates expense report lines against approval matrix rules prior to submission. | **YES** (Approval routing logic verified) | `PENDING GOVERNANCE` | NO |
| **P9** | Intercompany Transfer Pricing & Settlement Terms | Board of Directors / Tax Committee | Arm's length transfer pricing formulas, settlement payment windows, and intercompany markup rates. | `src/lib/finance/intercompany.ts`. | Intercompany engine generates mirrored balancing entries (`DUE_TO` / `DUE_FROM`) across participating entity tenants. | **YES** (Mirrored journal balancing verified) | **YES** |
| **P10** | Statutory Tax Rates & Jurisdiction Mappings | Head of Tax / CFO | VAT, GST, Withholding Tax rates, and statutory return filing schedules per operational jurisdiction. | `src/lib/finance/tax-engine.ts`. | Tax calculation engine applies jurisdiction-specific rate schedules and populates statutory return lines. | **YES** (Multi-tier tax calculation tests pass) | `PENDING GOVERNANCE` | NO |
| **P11** | Payroll Statutory Deductions & Withholding Models | HR Director / CFO / Legal Counsel | Pension, social security, health insurance, and PAYE tax bracket formulas per employment jurisdiction. | `src/lib/finance/payroll-bridge.ts`. | Payroll bridge maps gross pay to net pay liabilities and employer contribution expense lines. | **YES** (Allocation skeleton and balance checks pass) | `PENDING GOVERNANCE` | NO |

---

## 3. Governance Dependency Critical Path for Unlocking `CAP_POSTING`

To transition `CAP_POSTING` from `LOCKED (FAIL-CLOSED)` to `ACTIVE`, the following critical path of human governance decisions must be formally ratified:

```
+-------------------------------------------------------------------------+
|                  CRITICAL PATH TO UNLOCK CAP_POSTING                   |
+-------------------------------------------------------------------------+
|                                                                         |
|  [P1: Accounting Basis & Standards (CFO / Audit Committee)]            |
|                                |                                        |
|  [P6: Chart of Accounts Hierarchy (CFO / Accounting Board)]             |
|                                |                                        |
|  [P7: FX Rate Authority & Source (Treasury Committee / CFO)]           |
|                                |                                        |
|  [P9: Intercompany Settlement Terms (Board / Tax Committee)]           |
|                                |                                        |
|                                v                                        |
|               [CFO Formal Sign-Off Resolution]                          |
|                                |                                        |
|                                v                                        |
|             Flip CAP_POSTING: 'LOCKED' -> 'ACTIVE'                      |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## 4. Verification Evidence

All 11 technical policy-consumption engines have been verified with synthetic and unit test inputs. The engine code is strictly decoupled from the specific policy values, ensuring that once authorized human decisions are ratified, configuration parameters can be injected without requiring code refactoring or schema migrations.
