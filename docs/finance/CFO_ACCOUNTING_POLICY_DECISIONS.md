# CFO accounting policy decision gate

**Status: DECISION REGISTER. No implementation.**
Phase 5C · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0`

This register converts the Phase 5B discovery
(`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md`) into a formal, auditable set
of decisions required from named authorities. It **records and frames**; it does
not choose. No accounting policy is created, implied or defaulted here.

Constitution **Art. 5** places this authority with the **Group CFO under board
delegated authority**. Reserved matters escalate under **Art. 4**.

## Classification labels

| Label | Meaning |
| --- | --- |
| **[FACT]** | Verified in schema, code, data or DB behaviour this phase. |
| **[BEHAVIOUR]** | How the system currently behaves. Descriptive, not authoritative. |
| **[EXISTING AUTHORITY]** | Already ratified: constitution, active policy, or registered control. |
| **[RECOMMENDATION]** | Engineering opinion. **Carries no authority.** |
| **[CFO DECISION]** | Requires the Group CFO. |
| **[BOARD DECISION]** | Requires Group Board / Family Council. |
| **[UNKNOWN]** | Cannot be determined from the repository. |

**No item in this document may be treated as policy on the strength of a
[RECOMMENDATION] label.**

---

## §3 — Master decision register

| ID | Decision | Current Evidence | Status | Required Authority | Blocking Scope |
| --- | --- | --- | --- | --- | --- |
| **D-01** | Accounting basis (IFRS) | **[FACT]** `legal_entities.accounting_standard` NOT NULL, 8/8 = `IFRS`; `ledger_accounts.ifrs_category`; obligation `OBL-IFRS-CONSOL` ACTIVE | **RESOLVED** | — (already ratified) | None |
| **D-02** | Functional currency per entity | **[FACT]** `functional_currency` NOT NULL; USD (BEYU-FT/MU, BEYU-HLD/AE), TZS (6 TZ entities) | **RESOLVED** | — | None |
| **D-03** | Posting authority holder | **[FACT]** `finance:ledger.post` is HIGH_RISK, granted only to `GROUP_CFO`, and one of exactly 3 permissions excluded from the GROUP_CEO wildcard (`constants.ts:132`); **[EXISTING AUTHORITY]** `CONST-AI-001 r3` DENIES AI posting | **RESOLVED** | — | None |
| **D-04** | Correction doctrine | **[EXISTING AUTHORITY]** Art. 5 "corrections are made by controlled reversal or adjustment"; **[FACT]** enforced at DB level by migration `0005` (verified this phase) | **RESOLVED** | — | None |
| **D-05** | Accrual vs cash basis | **[FACT]** Never stated anywhere. IFRS *implies* accrual, but inference is not policy | **CFO DECISION REQUIRED** | Group CFO | Recognition timing for every request type |
| **D-06** | Chart of accounts content | **[FACT]** `ledger_accounts` exists with structure; **0 rows**; no CoA in docs, seed or code | **CFO DECISION REQUIRED** | Group CFO | All posting |
| **D-07** | CAPEX treatment | **[FACT]** No debit/credit mapping | **CFO DECISION REQUIRED** | Group CFO | CAPEX posting |
| **D-08** | OPEX treatment | **[FACT]** No mapping; Foundation grant may not be ordinary opex | **CFO DECISION REQUIRED** | Group CFO | OPEX posting |
| **D-09** | INVESTMENT treatment | **[FACT]** No mapping; equity injection vs intercompany loan materially different | **CFO DECISION REQUIRED** | Group CFO (Board if reserved) | INVESTMENT posting |
| **D-10** | FINANCING treatment | **[FACT]** No mapping; borrowing vs regulatory capital have opposite balance-sheet effects | **CFO DECISION REQUIRED** | Group CFO | FINANCING posting |
| **D-11** | RESERVE treatment | **[FACT]** No mapping; waterfall RESERVE tier cites **`ENT-FIN-005`**, confirmed **absent** from the policy register (count = 0) | **BLOCKED** | Group Board (treasury policy) | RESERVE posting |
| **D-12** | Financial calendar & close authority | **[FACT]** `financial_periods` exists with `OPEN\|CLOSING\|CLOSED\|LOCKED`; 0 rows; no calendar, no closer, no reopen rule | **CFO DECISION REQUIRED** | Group CFO | All posting |
| **D-13** | Maker/checker mechanics | **[FACT]** `CTL-FIN-002` PREVENTIVE/AUTOMATED/EFFECTIVE, owner GROUP_CFO, `last_tested_at` 2025-11-30, `evidence_document_id` **null**; **[FACT]** `journal_entries.approved_by` is written by **no code path** (verified by search) | **CFO DECISION REQUIRED** | Group CFO | Posting service design |
| **D-14** | Meaning of `finance:ledger.post` | **[FACT]** Single permission; no maker/checker split exists | **CFO DECISION REQUIRED** | Group CFO | Segregation of duties |
| **D-15** | FX rate source & policy | **[FACT]** `fx_rate` defaults to `1`; **no rate table, no reporting currency, no revaluation policy**; **[FACT]** 4/4 seeded capital requests are USD against TZS entities | **BLOCKED** | Group CFO | Any cross-currency posting |
| **D-16** | Reporting (presentation) currency | **[FACT]** No column, no policy; `treasury_positions.base_currency_balance` implies one without naming it; `OBL-IFRS-CONSOL` ACTIVE | **CFO DECISION REQUIRED** | Group CFO | Consolidation |
| **D-17** | Intercompany model | **[FACT]** 5-level hierarchy real; risk `ERM-003` transfer pricing ESCALATED; no intercompany account concept | **DEFERRED** (deferrable if cross-entity posting is refused) | Group CFO | Cross-entity posting |
| **D-18** | VAT / withholding / deferred tax accounts | **[FACT]** `OBL-TZ-VAT` and `OBL-TZ-PAYE` are **filing** obligations only; no tax account concept in finance schema; IAS 12 named once in a `tax_strategies.accounting_effect` annotation | **CFO DECISION REQUIRED** (specialist input) | Group CFO + Tax Governance Committee | Tax-bearing postings |
| **D-19** | What capital execution creates | **[FACT]** Governance gate stops at `GOVERNANCE_AUTHORIZED`; no `capital:execute` capability; treasury is a dated snapshot with no transaction table | **CFO DECISION REQUIRED** (Board if new capability) | Group CFO / Group Board | Capital execution |
| **D-20** | Missing policy `ENT-FIN-005` | **[FACT]** Referenced by waterfall RESERVE tier legal basis; absent from `policies` | **BOARD DECISION REQUIRED** | Group Board | Reserve/treasury policy |
| **D-21** | `CAP-2025-004` ratification | **[FACT]** USD 1.8m ≥ 1m threshold; its own consequences text requires Group Board ratification; **[FACT]** not ratified | **BOARD DECISION REQUIRED** | Group Board | That request only |

**Totals: 4 RESOLVED · 0 PARTIAL · 12 CFO DECISION REQUIRED · 3 BOARD DECISION REQUIRED · 1 DEFERRED · 2 BLOCKED.**

Nothing is marked RESOLVED merely because a reasonable treatment exists.

---

## §4 — Q7: capital draw-down accounting, by request type

For each type, 18 dimensions. **No account numbers are assigned — no authoritative
CoA exists (D-06).** Account *classes* only.

### CAPEX — `CAP-2025-011`, USD 640,000, BEYU-AGR (TZS-functional)

| # | Dimension | Determination |
| --- | --- | --- |
| 1 | Economic substance | **[RECOMMENDATION]** Acquisition of PP&E (IAS 16) |
| 2 | Triggering event | **CFO DECISION REQUIRED** |
| 3 | Recognition point | **CFO DECISION REQUIRED** — commitment / invoice / receipt of asset / payment. IAS 16 implies control transfer, but no goods-receipt or invoice concept exists |
| 4 | Debit class | **CFO DECISION REQUIRED** — PP&E, or assets under construction until commissioned |
| 5 | Credit class | **CFO DECISION REQUIRED** — cash/bank or trade payable |
| 6 | Cash/bank impact | **CFO DECISION REQUIRED** — depends on 3 |
| 7 | Accrual/payable possibility | **CFO DECISION REQUIRED** — no liability stage exists in the model |
| 8 | Capitalisation vs expense | **[RECOMMENDATION]** capitalise; **CFO DECISION REQUIRED** for the capitalisation threshold |
| 9 | Subsequent treatment | **CFO DECISION REQUIRED** — depreciation method, useful life, residual, impairment (IAS 16/36) |
| 10 | Reversal/correction | **[EXISTING AUTHORITY]** reversal only (Art. 5, enforced by `0005`) |
| 11 | Supporting documents | **CFO DECISION REQUIRED** — no invoice/asset-register requirement exists |
| 12 | Approval requirements | **[EXISTING AUTHORITY]** ENT-FIN-002: 640,000 ≥ 250,000 → Investment Committee |
| 13 | Tax/VAT | **CFO DECISION REQUIRED** — TZ capital allowances; a seeded strategy already claims deferred tax under IAS 12 |
| 14 | FX | **CFO DECISION REQUIRED** — **USD request, TZS entity: FX unavoidable** (D-15 BLOCKED) |
| 15 | Entity-specific differences | **CFO DECISION REQUIRED** |
| 16 | Journal entry required? | **[RECOMMENDATION]** yes |
| 17 | Memorandum sufficient? | **[RECOMMENDATION]** no |
| 18 | Requires another policy? | **[RECOMMENDATION]** yes — capitalisation threshold + depreciation policy |

### OPEX — `CAP-2025-019`, USD 180,000, BEYU-FDN (TZS-functional)

| # | Dimension | Determination |
| --- | --- | --- |
| 1 | Economic substance | **[RECOMMENDATION]** period expense; **[FACT]** a Foundation *programme grant* may be grant accounting, not ordinary opex |
| 2 | Triggering event | **CFO DECISION REQUIRED** |
| 3 | Recognition point | **CFO DECISION REQUIRED** — depends on D-05 (accrual vs cash) |
| 4 | Debit class | **CFO DECISION REQUIRED** — expense, or a distinct grant expense |
| 5 | Credit class | **CFO DECISION REQUIRED** — cash/bank or accrued liability |
| 6 | Cash/bank impact | **CFO DECISION REQUIRED** |
| 7 | Accrual/payable possibility | **CFO DECISION REQUIRED** |
| 8 | Capitalisation vs expense | **[RECOMMENDATION]** expense |
| 9 | Subsequent treatment | **[RECOMMENDATION]** none |
| 10 | Reversal/correction | **[EXISTING AUTHORITY]** reversal only |
| 11 | Supporting documents | **CFO DECISION REQUIRED** — grant agreement? |
| 12 | Approval requirements | **[FACT]** 180,000 < 250,000 → no committee approval under ENT-FIN-002 |
| 13 | Tax/VAT | **CFO DECISION REQUIRED** — the donations strategy states *"Expense recognised in the period of donation"*, but that governs the **donor's** deduction, not the Foundation's books |
| 14 | FX | **CFO DECISION REQUIRED** — USD vs TZS |
| 15 | Entity-specific | **[FACT]** BEYU-FDN is a **root entity with no parent** — not intra-group in the ownership sense |
| 16 | Journal required? | **[RECOMMENDATION]** yes |
| 17 | Memorandum sufficient? | **[RECOMMENDATION]** no |
| 18 | Another policy? | **CFO DECISION REQUIRED** — grant/donation policy |

### INVESTMENT — `CAP-2025-004`, USD 1,800,000, BEYU-HEA (TZS-functional)

**Most consequential, most ambiguous.**

| # | Dimension | Determination |
| --- | --- | --- |
| 1 | Economic substance | **CFO DECISION REQUIRED** — equity injection, intercompany loan, or the opco's own capex funded from group cash. Resolution text ("Allocate USD 1,800,000 to the Health OS Mwanza expansion programme") does not disambiguate |
| 2–3 | Trigger / recognition | **CFO DECISION REQUIRED** |
| 4 | Debit class | **CFO DECISION REQUIRED** — investment in subsidiary / intercompany receivable / PP&E |
| 5 | Credit class | **CFO DECISION REQUIRED** — cash, intercompany payable, or share capital + premium |
| 6–7 | Cash / accrual | **CFO DECISION REQUIRED** |
| 8 | Capitalise vs expense | **[RECOMMENDATION]** capitalise (balance-sheet item) |
| 9 | Subsequent | **CFO DECISION REQUIRED** — cost / equity method / fair value; IFRS 10 elimination; impairment |
| 10 | Reversal | **[EXISTING AUTHORITY]** reversal only |
| 11 | Documents | **CFO DECISION REQUIRED** — share subscription vs loan agreement (legally different) |
| 12 | Approval | **BOARD DECISION REQUIRED** — **[FACT]** ≥ USD 1m reserved matter; the seeded IC resolution itself states Board ratification is required and **it has not occurred** (D-21) |
| 13 | Tax | **CFO DECISION REQUIRED** + specialist — thin capitalisation, WHT on interest, transfer pricing (`ERM-003`) |
| 14 | FX | **CFO DECISION REQUIRED** — USD vs TZS |
| 15 | Entity-specific | **CFO DECISION REQUIRED** — always two entities (§5) |
| 16–17 | Journal / memorandum | **[RECOMMENDATION]** journal required, in both entities |
| 18 | Another policy? | **[RECOMMENDATION]** yes — intercompany funding policy |

### FINANCING — `CAP-2025-015`, USD 300,000, BEYU-FIN (TZS-functional)

| # | Dimension | Determination |
| --- | --- | --- |
| 1 | Economic substance | **CFO DECISION REQUIRED** — debt drawdown vs regulatory capital. **[FACT]** the seeded case is *payments-licence capital adequacy*, closer to equity than borrowing |
| 2–3 | Trigger / recognition | **CFO DECISION REQUIRED** |
| 4 | Debit class | **CFO DECISION REQUIRED** — cash (if borrowing) or investment (if capital injection) |
| 5 | Credit class | **CFO DECISION REQUIRED** — loan liability or share capital. **Opposite balance-sheet effects** |
| 6–7 | Cash / accrual | **CFO DECISION REQUIRED** |
| 8 | Capitalise vs expense | **[RECOMMENDATION]** neither — balance-sheet only |
| 9 | Subsequent | **CFO DECISION REQUIRED** — interest accrual, amortised cost (IFRS 9) if debt |
| 10 | Reversal | **[EXISTING AUTHORITY]** reversal only |
| 11 | Documents | **CFO DECISION REQUIRED** — facility agreement vs share subscription |
| 12 | Approval | **[EXISTING AUTHORITY]** 300,000 ≥ 250,000 → Investment Committee |
| 13 | Tax | **CFO DECISION REQUIRED** + specialist — WHT on interest, thin capitalisation |
| 14 | FX | **CFO DECISION REQUIRED** |
| 15 | Entity-specific | **CFO DECISION REQUIRED** — regulated entity, capital adequacy floor |
| 16–17 | Journal / memorandum | **[RECOMMENDATION]** journal required |
| 18 | Another policy? | **[RECOMMENDATION]** yes — debt/regulatory capital policy |

### RESERVE — no seeded example — **BLOCKED**

| # | Dimension | Determination |
| --- | --- | --- |
| 1 | Economic substance | **CFO DECISION REQUIRED** — designation of funds, not a third-party transaction |
| 2–3 | Trigger / recognition | **CFO DECISION REQUIRED** — board designation vs cash segregation |
| 4–5 | Debit / credit class | **CFO DECISION REQUIRED** — three structurally different options: (i) **no journal**, memorandum only; (ii) cash → restricted cash (asset↔asset); (iii) retained earnings → equity reserve. Only (iii) touches equity |
| 6–7 | Cash / accrual | **CFO DECISION REQUIRED** |
| 8 | Capitalise vs expense | **[RECOMMENDATION]** neither |
| 9 | Subsequent | **CFO DECISION REQUIRED** — release conditions |
| 10 | Reversal | **[EXISTING AUTHORITY]** reversal only, *if* a journal exists |
| 11 | Documents | **CFO DECISION REQUIRED** |
| 12 | Approval | **BOARD DECISION REQUIRED** — reserve floors are treasury policy |
| 13 | Tax | **[RECOMMENDATION]** normally none |
| 14 | FX | **CFO DECISION REQUIRED** |
| 15 | Entity-specific | **CFO DECISION REQUIRED** |
| 16 | Journal required? | **CFO DECISION REQUIRED** — genuinely may be **no** |
| 17 | Memorandum sufficient? | **CFO DECISION REQUIRED** — plausibly yes |
| 18 | Another policy? | **BOARD DECISION REQUIRED** — **`ENT-FIN-005` is cited by the waterfall RESERVE tier but does not exist** (D-20) |

> **[RECOMMENDATION]** Confirming that RESERVE requires **no journal entry** would
> be a legitimate, useful decision — it eliminates an entire posting class.

---

## §5 — Q8: intercompany

| # | Item | Determination |
| --- | --- | --- |
| 1 | Definition of intercompany | **CFO DECISION REQUIRED** — **[FACT]** no definition exists. Candidate: any transaction where source and destination entity differ and share a common ancestor |
| 2 | Originating entity | **CFO DECISION REQUIRED** — **[FACT]** `capital_requests.legal_entity_id` records the **beneficiary**, not the funder; the funding entity is **[UNKNOWN]** |
| 3 | Counterparty entity | **CFO DECISION REQUIRED** — no counterparty field exists |
| 4 | Due-to / due-from | **CFO DECISION REQUIRED** — no intercompany account concept |
| 5 | Reciprocal entries | **CFO DECISION REQUIRED** — mirrored legs or independent posting |
| 6 | Atomicity | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** if both legs are required they must be one DB transaction (kernel already supports this) |
| 7 | Settlement | **CFO DECISION REQUIRED** — **[FACT]** no treasury transaction table exists |
| 8 | Elimination | **CFO DECISION REQUIRED** — **[EXISTING AUTHORITY]** `OBL-IFRS-CONSOL` ACTIVE; a tax strategy states *"Intercompany charge eliminated on consolidation"* |
| 9 | FX | **CFO DECISION REQUIRED** — **[FACT]** BEYU-HLD (USD) → BEYU-TZH (TZS) crosses currency **and** jurisdiction (AE→TZ) |
| 10 | Approval | **[EXISTING AUTHORITY]** ENT-FIN-002 by amount only — **[FACT]** no intercompany-specific rule |
| 11 | Must both entities post? | **CFO DECISION REQUIRED** |
| 12 | Prohibit cross-entity initially? | See option below |

**Implementation-safe option (evaluated, not adopted):**

> A Phase-1 posting service rejects any posting where source and destination
> entity differ, until intercompany policy is ratified.

**[RECOMMENDATION] only.** Classification: **not a decision, not implemented.**

- *In favour:* removes D-17 and much of D-15 from the critical path; smaller and
  safer first increment; requires no new policy; nothing is silently invented;
  reversible — lifting the restriction later needs no data migration.
- *Against:* **[FACT]** the one governance-linked request (`CAP-2025-004`) is
  plausibly intercompany, so the restriction may exclude the most realistic case;
  and if the CFO decides funding is always a parent injection, **every** capital
  posting is cross-entity and the pilot would post nothing.
- **Not implemented in this phase.** Adoption is **CFO DECISION REQUIRED**.

---

## §6 — Q9: tax / VAT

Separating the three layers, which the repository currently conflates:

| Layer | State |
| --- | --- |
| **Tax compliance (filing)** | **[EXISTING AUTHORITY]** `OBL-TZ-VAT` (monthly VAT return) and `OBL-TZ-PAYE` (PAYE remittance) ACTIVE; **[EXISTING AUTHORITY]** `DOM-TAX-001` requires statutory basis, contemporaneous documentation and a filed position paper, with Tax Governance Committee approval for uncertain positions |
| **Tax treatment (assessment)** | **[BEHAVIOUR]** `tax_strategies` + `tax_strategy_assessments` assess eligibility; **[FACT]** never posted to the ledger |
| **Accounting recognition** | **[FACT]** absent. No tax account concept in the finance schema |

| Item | Determination |
| --- | --- |
| VAT | **CFO DECISION REQUIRED** — input/output VAT accounts, recoverability, and tax-point rules |
| Withholding tax | **CFO DECISION REQUIRED** + **SPECIALIST / BOARD DECISION REQUIRED** — cross-border AE→TZ WHT is a legal interpretation |
| Income tax | **CFO DECISION REQUIRED** — **[FACT]** waterfall tier 1 `TAX` cites *Income Tax Act Cap 332 (TZ) — 30% corporate*, but that is a **distribution model**, not a recognition policy |
| Deductible vs non-deductible | **CFO DECISION REQUIRED** |
| Capital allowances | **CFO DECISION REQUIRED** — a seeded strategy already claims one |
| Tax receivables / payables | **CFO DECISION REQUIRED** — no accounts exist |
| Deferred tax | **CFO DECISION REQUIRED** + specialist — **[FACT]** IAS 12 named once, in a `tax_strategies.accounting_effect` annotation. That is a tax-strategy note, **not ratified policy** |
| Tax provisions | **CFO DECISION REQUIRED** |
| Tax-inclusive vs exclusive amounts | **CFO DECISION REQUIRED** — **[FACT]** `capital_requests.amount` has **no** tax-treatment flag; whether USD 640,000 is VAT-inclusive is **[UNKNOWN]** |

**No tax accounts are invented here.**

---

## §7 — Q10: FX — **mandatory blocking section**

**[FACT] established this phase:** 4 of 4 capital requests are USD; their
entities are TZS-functional; `journal_entries.fx_rate` defaults to `1`; there is
no rate table, no reporting currency, and no revaluation policy. A default of
`1` would produce a **materially misstated** entry in every real case.

| # | Item | Determination |
| --- | --- | --- |
| 1 | Transaction-date FX rate | **CFO DECISION REQUIRED** |
| 2 | Rate source | **CFO DECISION REQUIRED** — **[FACT]** no authoritative source exists. Bank of Tanzania, a bank rate and a market feed are all plausible; **none is chosen here** |
| 3 | Rate timestamp | **CFO DECISION REQUIRED** — transaction date, value date or posting date |
| 4 | Functional currency | **RESOLVED** (D-02) |
| 5 | Transaction currency | **[FACT]** `journal_entries.currency` exists |
| 6 | Reporting currency | **CFO DECISION REQUIRED** (D-16) |
| 7 | Initial recognition | **CFO DECISION REQUIRED** — IAS 21 spot rate at transaction date |
| 8 | Settlement differences | **CFO DECISION REQUIRED** — realised FX gain/loss account |
| 9 | Monetary item revaluation | **CFO DECISION REQUIRED** |
| 10 | Period-end remeasurement | **CFO DECISION REQUIRED** — depends on D-12 |
| 11 | FX gain/loss treatment | **CFO DECISION REQUIRED** — P&L vs OCI (IAS 21 distinguishes; net investment in a foreign operation goes to OCI — directly relevant to BEYU-HLD→BEYU-TZH) |
| 12 | Intercompany FX | **CFO DECISION REQUIRED** — which entity bears the difference |
| 13 | Missing/stale rates | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** refuse to post rather than default to `1` |
| 14 | Manual override authority | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** if permitted, must be audited and never client-supplied |
| 15 | Audit evidence for rate | **CFO DECISION REQUIRED** — **[EXISTING AUTHORITY]** Art. 4 requires "on which data"; a posted rate needs a recorded source |

**Status: BLOCKED (D-15).** No FX handling implemented; no rate source chosen.

---

## §8 — Q11: what does capital execution actually create?

**[FACT]** These ten concepts are currently undifferentiated in the domain model.

| | Concept | Exists today? |
| --- | --- | --- |
| A | Governance authorization | **[FACT]** YES — `getGovernanceDecisionAuthorization()`, capital status `GOVERNANCE_AUTHORIZED` |
| B | Capital execution authorization | **[FACT]** NO — no `capital:execute` capability |
| C | Financial commitment | **[FACT]** NO — no commitment/encumbrance concept |
| D | Accounting recognition | **[FACT]** NO — no posting service |
| E | Cash movement | **[FACT]** NO — no treasury transaction table |
| F | Treasury instruction | **[FACT]** NO — `treasury_positions` is a dated snapshot |
| G | Journal posting | **[FACT]** NO — structure only, 0 entries |
| H | Capital status transition | **[FACT]** YES — implemented and governed |
| I | Audit event | **[FACT]** YES — `recordAuditTx()` / `publishEventTx()` |
| J | External payment instruction | **[FACT]** NO — no payment provider integration |

**Which occur at which lifecycle stage: CFO DECISION REQUIRED for every mapping.**

| Stage | Occurs? |
| --- | --- |
| DECISION | **[FACT]** A, H, I occur today |
| EXECUTION | **CFO DECISION REQUIRED** — B, C, H, I candidates |
| POSTING | **CFO DECISION REQUIRED** — D, G, I candidates |
| FUNDING | **CFO DECISION REQUIRED** — E, F candidates |
| SETTLEMENT | **CFO DECISION REQUIRED** — E, J candidates |

### The core constitutional question

Does `GOVERNANCE APPROVED` mean:

- **Interpretation 1** — *"The requested action is authorized"* (a permission; a
  separate execution decision follows), **or**
- **Interpretation 2** — *"The financial transaction must now be executed"* (an
  instruction; execution is mechanical fulfilment)?

**CFO DECISION REQUIRED — not chosen here.**

**[BEHAVIOUR]** The system currently behaves as **Interpretation 1**: the
governance gate stops at `GOVERNANCE_AUTHORIZED` and performs no financial
action. **[FACT]** This is an artefact of execution being unimplemented, **not**
evidence of a ratified position, and must not be cited as one.

**[EXISTING AUTHORITY]** Art. 5 ("Finance OS is authoritative for financial
consequences") and the exclusion of `finance:ledger.post` from the CEO wildcard
both suggest governance authority and financial execution authority are
deliberately **distinct** — but that is an inference about design intent, not a
ratified answer. If a new `capital:execute` capability is required, creating a
new constitutional power is **BOARD DECISION REQUIRED**.

---

## §9 — Chart of accounts readiness gate

**No CoA is built. No account codes are assigned.** Minimum authoritative
information required before a CoA can be *designed*:

| Element | Classification |
| --- | --- |
| Account hierarchy (depth, numbering) | **[REQUIRED FOR FIRST POSTING]** — `parent_account_id` exists but no scheme |
| Account classes | **[FACT] RESOLVED** — enum `ASSET\|LIABILITY\|EQUITY\|REVENUE\|EXPENSE` |
| IFRS category mapping | **[REQUIRED FOR CONSOLIDATION]** — column exists, values undefined |
| Cash/bank accounts | **[REQUIRED FOR FIRST POSTING]** |
| Receivables | **[REQUIRED LATER]** |
| Payables | **[POLICY-DEPENDENT]** — needed only if an accrual stage exists (D-05) |
| Tax accounts | **[POLICY-DEPENDENT]** (D-18) |
| FX gain/loss accounts | **[POLICY-DEPENDENT]** (D-15) |
| Intercompany accounts | **[POLICY-DEPENDENT]** (D-17) |
| Capital-project / PP&E accounts | **[REQUIRED FOR FIRST POSTING]** if CAPEX is the pilot |
| Investment accounts | **[REQUIRED LATER]** (D-09) |
| Financing accounts | **[REQUIRED LATER]** (D-10) |
| Reserve accounts | **[POLICY-DEPENDENT]** (D-11 BLOCKED) |
| Retained earnings | **[REQUIRED FOR CONSOLIDATION]** |
| Opening balances | **[REQUIRED FOR FIRST POSTING]** — **[FACT]** the ledger is empty; a cash credit needs an opening balance, itself a posting. **Bootstrap problem: CFO DECISION REQUIRED** |
| Entity dimension | **[REQUIRED FOR FIRST POSTING]** — **[FACT]** `ledger_accounts` has `tenant_id` but **no `legal_entity_id`**; whether accounts are shared group-wide or per entity is **CFO DECISION REQUIRED** |
| Currency dimension | **[REQUIRED FOR FIRST POSTING]** — **[FACT]** currency is on the entry, not the account |
| Reporting dimensions | **[REQUIRED LATER]** — `cost_centre` exists on lines |
| Consolidation dimensions | **[REQUIRED FOR CONSOLIDATION]** |

> **[FACT] Structural finding:** `ledger_accounts` is scoped by **tenant**, not by
> **legal entity**, while `financial_periods` and `journal_entries` are scoped by
> legal entity. Whether one CoA serves all entities in a tenant is a genuine
> design decision that the schema does not settle. **CFO DECISION REQUIRED.**

---

## §10 — Financial period policy gate

**No periods implemented.**

| # | Item | Determination |
| --- | --- | --- |
| 1 | Fiscal-year convention | **CFO DECISION REQUIRED** — **[FACT]** unknown; TZ statutory year and the group year may differ |
| 2 | Period frequency | **CFO DECISION REQUIRED** — monthly implied by `OBL-TZ-VAT` monthly filing, but not stated |
| 3 | Opening authority | **CFO DECISION REQUIRED** — **[FACT]** no period-management permission exists in the 47-permission catalogue |
| 4 | Closing authority | **CFO DECISION REQUIRED** |
| 5 | Reopening authority | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** consider prohibiting outright |
| 6 | Locking semantics | **CFO DECISION REQUIRED** — **[FACT]** `CLOSING` vs `CLOSED` vs `LOCKED` are undefined |
| 7 | Posting into closed periods | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** prohibit |
| 8 | Backdated entries | **CFO DECISION REQUIRED** |
| 9 | Adjusting entries | **CFO DECISION REQUIRED** |
| 10 | Year-end close | **CFO DECISION REQUIRED** — retained-earnings roll-forward |
| 11 | Audit lock | **CFO DECISION REQUIRED** — likely the purpose of `LOCKED` |
| 12 | Correction after close | **[EXISTING AUTHORITY]** reversal only (Art. 5) — **CFO DECISION REQUIRED** for *which period* the reversal lands in |

**[FACT]** Migration `0005` already guarantees non-overlapping, correctly ordered
periods, so no period *integrity* work remains — only *policy*.

Requiring Board approval: **[RECOMMENDATION]** fiscal-year convention and any
reopening-after-audit rule.

---

## §11 — Maker / checker (`CTL-FIN-002`)

**[FACT] The control is declarative only.** Evidence gathered this phase:
`control_type` PREVENTIVE, `automation` **AUTOMATED**, `effectiveness`
**EFFECTIVE**, `owner_role` GROUP_CFO, `last_tested_at` 2025-11-30,
`evidence_document_id` **null**; `journal_entries.approved_by` exists in the
schema and is written by **no code path**; zero postings exist.

> **The control asserts an AUTOMATED, EFFECTIVE preventive control over a
> mechanism that does not exist.** Its recorded effectiveness is
> **unsubstantiated** and should not be relied on in assurance reporting.

| # | Mechanic | Determination |
| --- | --- | --- |
| 1 | Maker identity | **[FACT]** `posted_by` exists |
| 2 | Checker identity | **[FACT]** `approved_by` exists, never written |
| 3 | Separation of duties | **CFO DECISION REQUIRED** |
| 4 | May maker approve own entry? | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** no; **[FACT]** only one seeded identity holds `finance:ledger.post` (GROUP_CFO), so a strict rule makes posting **impossible** without a second grant. **This is a live blocker** |
| 5 | Approval state | **CFO DECISION REQUIRED** — **[FACT]** no draft/pending status on `journal_entries` |
| 6 | Rejection state | **CFO DECISION REQUIRED** — **[FACT]** none; a rejected draft must not become an immutable entry |
| 7 | Amendment/reversal | **[EXISTING AUTHORITY]** reversal only |
| 8 | Emergency override | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** none; **[FACT]** `identity:emergency.activate` exists but is excluded from the CEO wildcard |
| 9 | Audit evidence | **[FACT]** kernel already provides it |
| 10 | Authorization capability | **CFO DECISION REQUIRED** (D-14) |
| 11 | Concurrency | **[FACT]** advisory-lock pattern already exists |
| 12 | Idempotency | **[FACT]** DB-backed `withIdempotency()` + `journal_entries.idempotency_key` already exist |

### Does `finance:ledger.post` mean A, B, C or D?

**CFO DECISION REQUIRED.** **[FACT]** Today it is a single undifferentiated
permission, so it can only mean **D (all of the above)** — which is **logically
incompatible with maker/checker**, since one permission cannot separate duties.

**[RECOMMENDATION]** Either CTL-FIN-002 is amended to reflect that maker/checker
is not yet operational, or a second capability is defined. Creating a new
capability is **CFO DECISION REQUIRED**, and **BOARD DECISION REQUIRED** if it
alters constitutional authority.

---

## §12 — Ledger integrity controls: verification result

Migration `0005` **not modified** (no defect found). Ten direct SQL bypass
probes were run inside rolled-back transactions, with `SET CONSTRAINTS ALL
IMMEDIATE` to force the deferred balance trigger to fire:

| Probe | Result |
| --- | --- |
| Unbalanced journal (100 vs 7) | ✅ blocked — *"unbalanced: debit 100.00 <> credit 7.00"* |
| Single line only | ✅ blocked — *"has 1 line(s); a double-entry journal requires at least two"* |
| Zero-value lines (0/0) | ✅ blocked — `journal_line_single_sided` |
| Both sides positive on one line | ✅ blocked — `journal_line_non_negative` |
| Negative amount | ✅ blocked — `journal_line_non_negative` |
| UPDATE a posted entry | ✅ blocked — *"immutable; correct it with a reversing entry, never an edit"* |
| DELETE a posted entry | ✅ blocked — *"immutable and cannot be deleted; post a reversing entry"* |
| UPDATE a journal line | ✅ blocked — *"journal line … is immutable"* |
| Overlapping periods | ✅ blocked — `financial_period_no_overlap` |
| Period end before start | ✅ blocked — `financial_period_dates_ordered` |

**10/10 enforced at DB level. Ledger after probes: 0 accounts, 0 periods,
0 entries, 0 lines.**

These are **infrastructure invariants** and remain correct and independent of
every accounting-policy decision above.

> **Methodology note:** an initial probe run produced ten false "blocked"
> results caused by a missing `tenant_id` in the fixture — the probes never
> reached the 0005 controls. A second run failed two probes because the balance
> trigger is `DEFERRABLE INITIALLY DEFERRED` and the transaction rolled back
> before COMMIT. Both were **probe defects, not system defects**, and are
> recorded here so the evidence is not overstated.

---

## §13 — Smallest safe pilot (recommendation only)

**Nothing executed.** Criteria: single entity, single currency, single type, no
intercompany, no FX, minimal tax, governed, auditable, reversal-only,
`0005`-compatible.

**[RECOMMENDATION] Candidate: a CAPEX posting for a TZS-functional entity, in
TZS**, against a request whose amount is below the ENT-FIN-002 threshold.

Rationale: Phase 5B found CAPEX the most policy-definable treatment; PP&E vs
cash is the least contested debit/credit pair; a single entity avoids D-17; TZS
avoids D-15.

**[FACT] But no such transaction exists today.** All four seeded requests are
USD against TZS entities, so **every existing request violates the "no FX"
criterion**. The pilot therefore requires either (a) a new TZS-denominated
request, or (b) an FX decision (D-15) first.

Still required even for this minimal pilot: **D-05** (accrual), **D-06** (CoA
tranche), **D-07** (CAPEX debit/credit), **D-12** (a period), **D-13/D-14**
(maker/checker), plus the **opening-balance bootstrap** (§9) — a cash credit
requires cash to exist, which itself requires a posting.

**This is a recommendation, NOT a decision.** Adoption is **CFO DECISION REQUIRED**.

---

## §14 — Stop conditions triggered

| # | Condition | Triggered | Basis |
| --- | --- | --- | --- |
| 1 | Cannot reproduce baseline | **No** | Reproduced exactly |
| 2 | Fingerprint differs | **No** | `8bafa4b0f09c62a918933158789df01c` |
| 3 | Integrity controls fail | **No** | 10/10 enforced |
| 4 | Constitution conflicts with model | **No** | Art. 5 consistent |
| 5 | Policy must be invented | **YES** | D-05..D-11: no authoritative treatment for any request type |
| 6 | Debit/credit not authoritative | **YES** | No mapping exists for any of the 5 types |
| 7 | Tax treatment uncertain | **YES** | D-18; specialist input needed for WHT/deferred tax |
| 8 | FX absent where required | **YES** | D-15; 4/4 requests need FX; `fx_rate` defaults to `1` |
| 9 | CoA must be guessed | **YES** | D-06; 0 accounts, no scheme, entity-vs-tenant scoping unsettled |
| 10 | Execution semantics undefined | **YES** | D-19; §8 mapping unresolved |
| 11 | Maker/checker ambiguous | **YES** | D-13/D-14; control asserts AUTOMATED/EFFECTIVE over a non-existent mechanism |
| 12 | Cross-entity policy undefined | **YES** | D-17 |

**8 of 12 stop conditions are active. Implementation remains correctly blocked.**
No implementation code was written, consistent with §15.

---

## What becomes unblocked, per decision

| Decision | Unblocks |
| --- | --- |
| **D-05** accrual basis | Recognition timing for all types (one sentence, high leverage) |
| **D-06** CoA tranche + entity/tenant scoping | Any posting at all |
| **D-07** CAPEX treatment | The §13 pilot |
| **D-12** calendar + close authority | Period creation; the pilot |
| **D-13/D-14** maker/checker | Posting-service design; resolves the CTL-FIN-002 assurance gap |
| **D-15** FX | All four existing capital requests |
| **D-17** intercompany | Cross-entity funding; the realistic BEYU topology |
| **D-18** tax | Tax-bearing postings; VAT-inclusive amount interpretation |
| **D-19** execution semantics | Capital execution service and its authority model |
| **D-11 + D-20** reserve / `ENT-FIN-005` | RESERVE requests; waterfall reserve tier integrity |
| **D-21** `CAP-2025-004` ratification | That request only |

**Minimum set for the smallest safe pilot: D-05, D-06, D-07, D-12, D-13/D-14 —
plus the opening-balance bootstrap and either a TZS request or D-15.**

With those, a posting service is mechanical on the existing kernel
(`withAuditTransaction`, `publishEventTx`, `recordAuditTx`, DB-backed
idempotency, advisory locks, `finance:ledger.post`), with migration `0005`
guaranteeing nothing unbalanced, zero-value, single-sided or mutable can be
stored.

---

## Scope statement

**[FACT]** This phase changed **documentation only**. No schema, migration, enum,
ledger table, capital table, permission, role, governance capability, posting
service, capital execution service, financial period, chart of accounts,
treasury or journal data was created or modified. Ledger verified after all
probes: **0 accounts, 0 periods, 0 journal entries, 0 journal lines.**

Related: `docs/governance/ACCOUNTING_POLICY_DISCOVERY.md`,
`ACCOUNTING_SUBSTRATE_DECISIONS.md`, `CAPITAL_EXECUTION_BLOCKED.md`,
`DECISION_AUTHORITY_MODEL.md` §4.
