# CFO accounting policy decision register

**Status: FORMAL DECISION REGISTER. No implementation. No decision made.**
Phase 5E · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0` · Baseline commit `ed2ae3c`

This register consolidates every unresolved accounting-policy decision from
Phases 5B–5D into an auditable, decision-ready package. Each entry carries the
evidence, the authority required, the options with consequences, and a
`[FINAL DECISION]` field that remains **`[PENDING]`** until the competent
authority rules.

**No `[FINAL DECISION]` field in this document is populated**, because the
repository contains no authoritative evidence that any of these decisions has
been made.

Authority: Constitution **Art. 5** — *"Finance OS is authoritative for financial
consequences… Group CFO under board delegated authority."*

---

## §2 — Evidence hierarchy

Every claim in this register is tagged with its level. **Levels 8–9 are never
policy**, regardless of how well reasoned.

| Level | Source | Present in this repository? |
| --- | --- | --- |
| **L1** | Constitution | **Yes** — 11 articles. Art. 5 (financial authority, immutability, reversal), Art. 4 (material decisions), Art. 8 (audit), Art. 11 (change control → Architecture Review Board) |
| **L2** | Formally adopted enterprise policies | **Yes** — 5 ACTIVE: `CONST-AI-001`, `DOM-TAX-001`, `ENT-FIN-002`, `ENT-FIN-003`, `ENT-SEC-004`. **None defines an accounting treatment** |
| **L3** | Formally adopted controls | **Yes** — `CTL-FIN-002` only (finance). See §4 D-13/14: **discrepancy raised** |
| **L4** | ADRs / architecture decisions | **Yes** — 4 ACCEPTED. ADR3 places tax intelligence in Finance OS; **none addresses the ledger, CoA or posting** |
| **L5** | Legal/regulatory obligations | **Yes** — 8 ACTIVE, incl. `OBL-IFRS-CONSOL`, `OBL-TZ-VAT`, `OBL-TZ-PAYE`. **Filing obligations, not recognition policy** |
| **L6** | Schema-enforced behaviour | **Yes** — IFRS NOT NULL, functional currency NOT NULL, migration `0005` invariants, global uniqueness of `ledger_accounts.code`, `journal_entries.legal_entity_id` NOT NULL |
| **L7** | Seeded / reference data | **Yes** — 4 capital requests, 5 treasury positions, 7 waterfall tiers, 5 tax strategies. **Illustrative; never authoritative** |
| **L8** | Recommendations | This document and Phases 5B–5D. **Not policy** |
| **L9** | Assumptions | Explicitly excluded from all determinations |

> **Governing rule applied throughout:** an L5 compliance obligation proves BEYU
> must *file* a return; it does not state how a transaction is *recognised*. An
> L7 seed value proves a number exists; it does not ratify a treatment.

---

## §3 — Decision register

### D-05 — Accrual treatment

| Field | Content |
| --- | --- |
| **Question** | When a capital request creates an economic obligation before cash settlement, does BEYU recognise on payment, on obligation, or on acquisition? |
| **System evidence** | **[L6]** No invoice, purchase-order, goods-receipt or payment-terms concept exists in any table. **[L6]** `journal_entries` has no capital-request FK. **[L7]** All 4 requests carry only an amount and a status |
| **Existing authoritative rule** | **[L6]** IFRS is the basis (`accounting_standard` NOT NULL, 8/8) — IFRS implies accrual, but **no ratified statement exists**. **[L1]** Art. 5 governs corrections, not recognition timing |
| **Authority required** | **Group CFO** |
| **Options** | **A** immediate cash · **B** accrual/payable then settlement · **C** recognise on acquisition (control transfer) · **D** other (e.g. staged/percentage-of-completion) |
| **Advantages / disadvantages** | **A**: simplest; but weak under IAS 16 and requires cash to exist first. **B**: IFRS-consistent; separates recognition from settlement; needs a payable account and an obligation-triggering artefact. **C**: most technically correct for IAS 16; requires a goods-receipt concept that does not exist. **D**: only if multi-period construction capex exists — **[UNKNOWN]** |
| **Accounting consequences** | Determines whether the first posting touches cash at all, and whether a liability class is required |
| **Tax consequences** | VAT tax point is normally the invoice, not payment — favours B; capital allowances typically begin at use — favours C |
| **Governance consequences** | Under B/C, governance approval, recognition and settlement are three separate events with three authorities |
| **Security / SoD consequences** | Under B, recognition and settlement can be separately controlled — **stronger** SoD than A |
| **Implementation consequences** | **B removes the opening-balance blocker from the pilot** (see §8) — but this must not be the reason to select it |
| **Migration required?** | **No** — `journal_lines` supports any account class |
| **Affects historical data?** | No — ledger is empty |
| **Reversible?** | **Partially.** Once entries are posted they are immutable (`0005`); a later change of basis applies prospectively and creates a comparability break |
| **[RECOMMENDATION]** | **Option B or C** are IFRS-consistent; **A is weak**. Between B and C, B is more implementable because C needs an asset-receipt event that does not exist. **Explicitly: B must not be chosen merely because it simplifies implementation — it requires CFO approval on accounting merit** |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO (Art. 5) |
| **Evidence required** | A written accounting policy statement naming the recognition event |
| **Blocking** | **YES** |

### D-06 — Chart of accounts scope

| Field | Content |
| --- | --- |
| **Question** | Is the canonical CoA tenant-wide, per legal entity, or a group master with entity mappings? |
| **System evidence** | **[L6]** `ledger_accounts` has `tenant_id` NOT NULL and **no `legal_entity_id`**. **[L6]** `ledger_accounts.code` is **globally unique**. **[L6]** `financial_periods` and `journal_entries` are legal-entity scoped. **[L6]** 0 accounts exist |
| **Existing authoritative rule** | **[L5]** `OBL-IFRS-CONSOL` requires consolidated statements. **[L1]** Art. 11 places architectural change under the Architecture Review Board |
| **Authority required** | **Group CFO** + **Architecture Review Board** (Art. 11) |
| **Options** | **A** tenant-wide shared · **B** per legal entity · **C** group master + entity mappings · **D** account + entity-as-dimension |
| **Advantages / disadvantages** | **A**: no migration, matches schema as built; weak entity isolation; one "Cash" account shared across USD and TZS entities. **B**: strongest isolation; **[L6] blocked by global code uniqueness** unless codes are prefixed or the constraint is changed — a migration. **C**: strongest consolidation; needs a mapping table — a migration; heaviest for a pilot. **D**: flexible; largest departure from the existing model |
| **Accounting consequences** | Determines whether one account can carry balances in two functional currencies |
| **Tax consequences** | Statutory/local charts differ by jurisdiction (TZ, AE, MU) — favours B or C long term |
| **Governance consequences** | Determines who owns account creation, and at what level |
| **Security / SoD consequences** | **[L6]** Tenant scoping is already enforced; entity-level account isolation is **not** and would be new |
| **Implementation consequences** | A is the only zero-migration option |
| **Migration required?** | **A: No · B: Yes · C: Yes · D: Yes** |
| **Affects historical data?** | No — ledger empty. **Choosing A now and B/C later WOULD affect posted history** |
| **Reversible?** | **Low.** Once accounts carry immutable entries, re-scoping requires a mapping exercise, not an edit |
| **[RECOMMENDATION]** | **Option C** is architecturally safest for a 5-level, 3-jurisdiction, IFRS-consolidating group. **Option A is safest *without modifying the schema*** and is the cheapest pilot — at the cost of near-certain rework. The CFO must weigh pilot speed against migration-later risk. **No account codes proposed** |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO + Architecture Review Board |
| **Evidence required** | CoA scope policy + numbering scheme |
| **Blocking** | **YES** |

### D-07 — CAPEX accounting treatment

| Field | Content |
| --- | --- |
| **Question** | What is the authoritative debit/credit treatment for a single-entity CAPEX transaction? |
| **System evidence** | **[L7]** `request_type='CAPEX'` exists on `CAP-2025-011` (USD 640,000, BEYU-AGR). **[L6]** No asset register, no depreciation table, no threshold field anywhere |
| **Existing authoritative rule** | **[L2]** `ENT-FIN-002` governs *approval* by amount, not treatment. **[L1]** Art. 5 governs corrections |
| **Authority required** | **Group CFO** |
| **Options** | Determined by D-05; the debit class (PP&E vs assets-under-construction) is separately open |
| **Missing policy items — all `[PENDING]`** | 1 CAPEX definition · 2 capitalisation threshold · 3 asset class · 4 initial measurement · 5 directly attributable costs · 6 prepayment · 7 accrual · 8 payable · 9 cash settlement · 10 capitalisation point · 11 depreciation start · 12 useful life authority · 13 residual value · 14 impairment · 15 disposal · 17 supporting documents · 19 tax · 20 VAT |
| **Resolved items** | **16 reversal/correction** — **[L1]** Art. 5 + **[L6]** migration `0005`. **18 governance approval** — **[L2]** `ENT-FIN-002` |
| **Accounting consequences** | Items 2, 4, 5 and 20 change the **capitalised amount**; items 11–14 change subsequent P&L |
| **Tax consequences** | Capital allowances vs book depreciation create the IAS 12 deferred-tax difference |
| **Governance consequences** | None beyond `ENT-FIN-002` |
| **Security / SoD consequences** | None specific |
| **Implementation consequences** | **Minimum for ONE posting:** recognition event (D-05), debit class, credit class, measurement basis, and 2–4 accounts. Items 11–15 are deferrable **only if** the CFO accepts the asset sits un-depreciated — itself a decision and a reportable period-end gap |
| **Migration required?** | **No** for a single posting. **Yes** if an asset register is required |
| **Affects historical data?** | No |
| **Reversible?** | No — entries are immutable; a wrong treatment becomes permanent history correctable only by reversal |
| **[RECOMMENDATION]** | **No threshold, amount or code proposed.** All 18 open items require the CFO |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO |
| **Evidence required** | A CAPEX accounting policy |
| **Blocking** | **YES** |

### D-12 — Financial calendar / periods

| Field | Content |
| --- | --- |
| **Question** | What is BEYU's financial calendar, and who opens, closes, locks and reopens periods? |
| **System evidence** | **[L6]** `financial_periods(id, legal_entity_id, code, starts_on, ends_on, status, closed_by, closed_at)`; **0 rows**; statuses `OPEN\|CLOSING\|CLOSED\|LOCKED` with **no defined semantics**. **[L6]** `journal_entries.period_id` is **NULLABLE**. **[L6]** No period-management permission exists in the 47-permission catalogue |
| **Existing authoritative rule** | **[L6]** Migration `0005` already enforces non-overlap and date ordering. **[L5]** `OBL-TZ-VAT` requires monthly filing — a cadence, not a calendar |
| **Authority required** | **Group CFO**; **[RECOMMENDATION]** fiscal-year convention is **Board**-level as it drives statutory reporting |
| **Sub-determinations** | **Frequency** `[PENDING]` · **Period-open authority** `[PENDING]` — **[L6]** currently nobody can · **Period-close authority** `[PENDING]` (`closed_by` unused) · **Periods belong to legal entities** — **[L6] RESOLVED, schema-enforced** · **May periods overlap** — **[L6] RESOLVED: no**, `financial_period_no_overlap` · **Posting to closed periods** `[PENDING]` **[RECOMMENDATION]** prohibit · **Backdating** `[PENDING]` · **Late invoices** `[PENDING]` · **Prior-period corrections** `[PENDING]` · **Reversal doctrine** — **[L1] RESOLVED** as to mechanism; the period the reversal lands in is `[PENDING]` |
| **Accounting consequences** | Determines cut-off and comparability |
| **Tax consequences** | Period boundaries should reconcile to TZ filing periods |
| **Governance consequences** | Closing authority is a financial control point |
| **Security / SoD consequences** | **A new period-management permission would be required** — a permission change needing explicit authority. **[L1]** Art. 3 least privilege applies |
| **Implementation consequences** | **Minimum before first journal:** frequency + boundaries, who may open, and whether `period_id` is mandatory |
| **Migration required?** | **No** — table exists and is already constrained |
| **Affects historical data?** | No |
| **Reversible?** | Frequency is reversible before posting; not after |
| **[RECOMMENDATION]** | Monthly, aligned to TZ filing; **no reopening after close**; `period_id` mandatory. **Not selected** |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO; Board for fiscal-year convention |
| **Evidence required** | Financial calendar policy |
| **Blocking** | **YES** |

### D-13 / D-14 — Maker / checker

| Field | Content |
| --- | --- |
| **Question** | What is the maker/checker model, and may the Group CFO act as both? |
| **System evidence** | **[L6]** `finance:ledger.post` is a **single** HIGH_RISK permission, held **only** by `GROUP_CFO`, and one of exactly 3 excluded from the GROUP_CEO wildcard. **[L6]** `journal_entries.approved_by` exists and is **written by no code path**. **[L6]** No `finance:ledger.approve` permission exists. **[L6]** No draft/pending/rejected status on `journal_entries` |
| **Existing authoritative rule** | **[L3]** `CTL-FIN-002` "Maker/checker on all journal postings", PREVENTIVE / **AUTOMATED** / **EFFECTIVE**, owner GROUP_CFO, `evidence_document_id` **null**. **[L2]** `CONST-AI-001 r3` denies AI `finance:ledger.post` **by name**. **[L1]** Art. 3 least privilege; Art. 5 CFO authority |
| **Authority required** | **Group CFO**; **Board** if posting/approval authority moves to another role |
| **Options** | **A** separate maker/checker permissions · **B** same permission, enforced different users · **C** role-based maker/checker · **D** CFO maker + independent checker · **E** other |
| **Analysis** | **CFO self-approval:** **[L6]** only GROUP_CFO holds the permission, so prohibiting self-approval **makes posting impossible** without a second grant. **CEO wildcard:** any new permission is auto-granted to GROUP_CEO unless explicitly excluded — the role deliberately denied posting would gain approval. **AI permissions:** `CONST-AI-001 r3` names `finance:ledger.post` only; **a new approve permission would NOT be covered**, leaving AI formally able to approve journals. **Segregation of duties:** SOC2 (cited by the control) treats maker = checker as a failure. **`approvedBy`:** column ready, unused. **Audit provenance:** **[L6]** kernel provides it. **Idempotency:** **[L6]** `idempotency_key` + `withIdempotency()` exist. **Concurrent posting:** **[L6]** advisory locks exist. **Failed approval:** **[L6]** no rejected state — a rejected draft must not become an immutable entry. **Replay:** covered by existing idempotency |
| **Accounting consequences** | None directly |
| **Tax consequences** | None |
| **Governance consequences** | **B** enforces SoD without new permissions but still needs a second holder. **A/C/D** change the authority model |
| **Security / SoD consequences** | **Highest-impact area in this register.** Getting it wrong either blocks all posting or silently grants approval to CEO/AI |
| **Implementation consequences** | **A**: 1 new permission, no schema change. **B**: 0 new permissions, needs a second CFO-equivalent holder. **C/D**: role changes |
| **Migration required?** | **No** — `approved_by` already exists |
| **Affects historical data?** | No |
| **Reversible?** | Permission grants are reversible; **entries approved under a weak model are not** |
| **[RECOMMENDATION]** | **Option A or B.** **A** uses the existing `approved_by` column and adds one permission; **B** adds none but requires a second authorised human. **Not selected — and `finance:ledger.approve` is deliberately NOT added in this phase.** If A or C is chosen, the CFO must **also** rule that (i) the new permission is excluded from the GROUP_CEO wildcard and (ii) `CONST-AI-001` is extended to cover it |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO; **Board** if authority moves outside the CFO |
| **Evidence required** | Maker/checker policy + amended `CTL-FIN-002` |
| **Blocking** | **YES** |

> ### ⚠ Control assurance discrepancy — raised formally
>
> **[L3] `CTL-FIN-002` asserts an AUTOMATED, EFFECTIVE, PREVENTIVE control over a
> mechanism that does not exist.** **[L6]** There is no posting service, no
> checker capability, no approval state, and `approved_by` is never written;
> `evidence_document_id` is null and zero postings exist.
>
> **The recorded effectiveness rating is unsubstantiated and must not be relied
> upon in assurance or audit reporting.** Correcting the rating is
> **[RECOMMENDATION] required regardless of which maker/checker model is chosen**,
> and is itself a CFO/Internal Audit action (Art. 8: Internal Audit reports to the
> Risk & Audit Committee).

### D-23 — Pilot transaction

| Field | Content |
| --- | --- |
| **Question** | What is the safest first pilot transaction? |
| **System evidence** | **[L7]** All 4 requests are **USD**; **[L6]** their entities are **TZS**-functional. **[L6]** Only BEYU-FT (TRUST) and BEYU-HLD (HOLDING) are USD-functional and **both have 0 capital requests**. **[L2]** `ENT-FIN-002` thresholds are **USD-denominated** |
| **Existing authoritative rule** | **[L6]** No policy restricts `capital_requests.currency` |
| **Authority required** | **Group CFO** |
| **Options** | **A** new TZS request below all thresholds · **B** resolve FX first · **C** use an existing USD request · **D** other |
| **Advantages / disadvantages** | **A**: genuinely FX-free — `fx_rate = 1` becomes **correct rather than a fiction**; needs no FX policy. **B**: most complete, slowest; drags in IAS 21, OCI vs P&L, revaluation. **C**: **not viable** — would post USD into a TZS-functional entity, contradicting IFRS and D-02. **D**: treating a USD request as USD-functional contradicts the entity's functional currency |
| **Accounting consequences** | A produces a single-currency, single-entity, IFRS-clean entry |
| **Tax consequences** | Minimal if VAT-exclusive (D-18) |
| **Governance consequences** | **[L2] Threshold problem:** `ENT-FIN-002` is denominated in USD, so testing a TZS amount needs a rate — the very FX policy that is blocked. **A sub-threshold amount avoids this**, but the general problem is real and is itself `[PENDING]` |
| **Security / SoD consequences** | None new |
| **Implementation consequences** | A requires creating one capital request — **not done in this phase** |
| **Migration required?** | No |
| **Affects historical data?** | No |
| **Reversible?** | Yes |
| **[RECOMMENDATION]** | **Option A**, at an amount unambiguously below the USD 250,000 threshold on any plausible rate, at a TZS-functional entity such as BEYU-AGR. **Legitimacy checked, not assumed:** no policy forbids a TZS request; BEYU-AGR is IFRS, TZS-functional, has a treasury position and an existing CAPEX request. **The request is NOT created** |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO (capital request creation follows `ENT-FIN-002`) |
| **Evidence required** | Pilot specification approval |
| **Blocking** | **YES** for the pilot |

### FX — Foreign exchange policy

| Field | Content |
| --- | --- |
| **Question** | What is the authoritative FX rate source and treatment? |
| **System evidence** | **[L6]** `journal_entries.fx_rate` NOT NULL, **default `1`**. **[L6]** No rate table, no reporting-currency column, no revaluation mechanism. **[L7]** Treasury implies **three inconsistent USD/TZS rates** |
| **Existing authoritative rule** | **None.** **[L5]** `OBL-IFRS-CONSOL` implies IAS 21 applies, but no rate policy is ratified |
| **Authority required** | **Group CFO**, with **specialist** input for IAS 21 net-investment treatment |
| **Blocked downstream decisions** | USD/TZS transaction conversion · **`ENT-FIN-002` threshold testing for non-USD amounts** · functional-currency posting for the 4 existing requests · period-end revaluation · settlement gain/loss · **[L5]** consolidated reporting · deferred tax on FX differences |
| **Accounting consequences** | IAS 21: spot rate at transaction date; monetary items retranslated; net-investment differences to **OCI**, others to **P&L** |
| **Tax consequences** | Realised vs unrealised FX differences are treated differently for TZ tax |
| **Governance consequences** | A USD-denominated policy threshold cannot be applied to a TZS amount without a rate |
| **Security / SoD consequences** | **[RECOMMENDATION]** rate must never be client-supplied; override authority must be audited |
| **Implementation consequences** | **[RECOMMENDATION]** refuse to post rather than default to `1` |
| **Migration required?** | **Yes**, eventually — a rate source table and a reporting-currency concept |
| **Affects historical data?** | No — but a wrong rate becomes permanent |
| **Reversible?** | No — posted FX is immutable |
| **[RECOMMENDATION]** | **No rate source proposed.** A sub-threshold TZS pilot (D-23 A) proceeds legitimately without resolving general FX policy |
| **[FINAL DECISION]** | **`[PENDING]`** |
| **Decision owner** | Group CFO |
| **Required approver** | Group CFO + specialist |
| **Evidence required** | FX policy naming the rate source |
| **Blocking** | **YES** generally · **NO** for a TZS pilot |

### IC — Intercompany

| Field | Content |
| --- | --- |
| **Question** | How are cross-entity funding transactions recognised? |
| **System evidence** | **[L6]** `journal_entries.legal_entity_id` is **NOT NULL and singular**. **[L6]** Exhaustive column scan: the only `counterparty` column in the database is `legal_matters.counterparty` (litigation) — **no intercompany, due-to or due-from column exists in any finance table** |
| **Existing authoritative rule** | **[L5]** `OBL-IFRS-CONSOL`. **[L7]** A tax strategy notes *"Intercompany charge eliminated on consolidation"* — an annotation, not policy. **[L7]** Risk `ERM-003` transfer pricing, ESCALATED |
| **Authority required** | Group CFO |
| **Accounting consequences** | Equity injection vs intercompany loan produce materially different balance sheets |
| **Tax consequences** | Thin capitalisation, WHT on interest, transfer pricing |
| **Migration required?** | **Yes** — intercompany accounts and a counterparty dimension |
| **Reversible?** | Deferral is fully reversible |
| **[RECOMMENDATION]** | **`[DEFERRED]` — outside the first pilot.** See §7 |
| **[FINAL DECISION]** | **`[DEFERRED]`** |
| **Blocking** | **NO** for a single-entity pilot |

### OB — Opening balances · TAX — Tax boundary · EXEC — Execution semantics · RES / ENT-FIN-005 / CAP-2025-004

| ID | Question | Authority | Status | Blocking |
| --- | --- | --- | --- | --- |
| **OB** | How are opening balances established? | CFO + external auditor; **[RECOMMENDATION]** Board, as it sets the group's financial baseline | **`[PENDING]`** — **[RECOMMENDATION]** auditor-certified trial balance loaded as a governed opening journal; **migration-only bootstrap explicitly rejected** (no provenance, bypasses maker/checker) | **NO** under accrual pilot (§8) · **YES** before settlement |
| **TAX** | VAT/WHT/allowances/deferred tax recognition | CFO + **[L2]** `DOM-TAX-001` → Tax Governance Committee + specialist | **`[PENDING]`** — see §9 | Partly |
| **EXEC** | Does governance approval authorise, or instruct, execution? | CFO; **Board** if a new `capital:execute` capability | **`[PENDING]`** — **[RECOMMENDATION]** Interpretation 1 (authorises, does not instruct) | **YES** for execution |
| **RES** | RESERVE treatment | Board | **`[PENDING]`** — may require **no journal at all** | NO |
| **ENT-FIN-005** | Missing treasury policy cited by the waterfall RESERVE tier | Board | **`[PENDING]`** — **[L2]** confirmed absent (count 0) | NO |
| **CAP-2025-004** | USD 1.8m IC resolution requiring unobtained Board ratification | Board | **`[PENDING]`** | That request only |

---

## §6 — Why the seeded treasury rates are not an authoritative FX source

**[L7]** The treasury snapshot implies three different USD/TZS rates:

| Entity | TZS balance | USD base balance | Implied rate |
| --- | --- | --- | --- |
| BEYU-AGR | 980,000,000.00 | 375,000.00 | **2,613.3333** |
| BEYU-HEA | 2,870,000,000.00 | 1,098,000.00 | **2,613.8434** |
| BEYU-TZH | 6,120,000,000.00 | 2,340,000.00 | **2,615.3846** |

These **cannot** be treated as an authoritative rate source because:

1. **They disagree with each other** — three rates for one currency pair in one
   snapshot. Any choice among them is arbitrary; averaging them invents a fourth
   number that appears nowhere.
2. **They are L7 seed data** — illustrative demonstration values, never ratified.
3. **They are derived, not sourced** — a quotient of two rounded balances, with
   no rate provider, no timestamp and no quotation basis.
4. **They have no effective date** — IAS 21 requires the rate *at the transaction
   date*; a snapshot ratio has no date.
5. **`base_currency_balance` never names its base currency** — USD is inferred.
6. **[L1] Art. 4** requires material decisions to record "on which data" — a
   reverse-engineered ratio cannot satisfy that evidential standard.

**Conclusion: this strengthens the FX block rather than relieving it.**

**Can a sub-threshold TZS pilot proceed without general FX policy?**
**[RECOMMENDATION] Yes** — a TZS transaction at a TZS-functional entity performs
**no conversion**: `fx_rate = 1` is arithmetically correct, not a placeholder.
The pilot must be below the `ENT-FIN-002` threshold so no USD threshold
conversion is required. This is a recommendation; adoption is CFO.

---

## §7 — Intercompany determination

**Why a single-entry cross-entity transaction is structurally impossible:**
**[L6]** `journal_entries.legal_entity_id` is `NOT NULL` and **singular** — one
entry belongs to exactly one legal entity, and `journal_lines` carries no entity
of its own. A cross-entity transaction therefore **cannot** be expressed as one
journal entry; it necessarily requires two entries in two entities. A
service-boundary prohibition would simply decline to create the second.

| Item | Determination |
| --- | --- |
| Future intercompany service required? | **Yes** — the BEYU topology (governance at ancestors, capital at operating companies) makes most real funding intercompany |
| Reciprocal entries | `[PENDING]` — mirrored legs or independent posting |
| Due-to / due-from | `[PENDING]` — **[L6]** no such accounts or columns exist |
| Elimination | `[PENDING]` — **[L5]** required by `OBL-IFRS-CONSOL` |
| FX | `[PENDING]` — **[L6]** BEYU-HLD (USD) → BEYU-TZH (TZS) crosses currency **and** jurisdiction |
| Atomicity | `[PENDING]` — **[RECOMMENDATION]** if both legs are required they must share one DB transaction; the kernel already supports this |

**Caveat the CFO must see:** if CAPEX at an operating company is *funded by a
parent*, the economically complete transaction **is** intercompany and a
single-entity posting records only half of it. The pilot is accounting-complete
only if the CAPEX is **self-funded** from the entity's own resources — which for
BEYU-AGR is **[UNKNOWN]** and `[PENDING]`.

**Classification: `[DEFERRED]` — does not block a self-funded single-entity pilot.**

---

## §8 — Opening balance re-evaluation under the accrual model

**Question:** does `CAPEX → debit PP&E / credit payable` allow a first pilot with
no opening cash balance?

**[RECOMMENDATION] Yes — analytically.** The entry debits an asset and credits a
liability. **Neither line touches cash.** Both accounts legitimately start at
zero, because the transaction *creates* both balances. Nothing is presupposed,
and no opening balance is required for the entry to be complete and balanced.

By contrast, under D-05 **Option A** the credit goes to cash — which must
already exist, and the ledger is empty. **Option A cannot be the first
transaction in an empty ledger without first solving opening balances.**

**Therefore, conditional on the CFO selecting D-05 Option B:**

- **Opening cash ceases to be a blocker for the accrual pilot** — recorded here
  as a conditional removal, not an unconditional one.
- **It is retained in full as a future settlement requirement.** The moment the
  payable is settled, cash is credited and an opening cash balance (OB) becomes
  mandatory.

> **This must not become a reason to select Option B.** The accounting merit of
> the recognition basis is the CFO's decision; the implementation convenience is
> a consequence, not a justification. Recorded explicitly to prevent the
> inference being made later.

**No opening balance is created.**

---

## §9 — Tax policy boundary

**Three layers that must not be conflated:**

| Layer | Definition | State |
| --- | --- | --- |
| **ACCOUNTING POLICY** | When and at what amount a transaction enters the books | **[L6]** absent |
| **TAX POLICY** | How the tax authority treats it | **[L2]** `DOM-TAX-001` governs *process*, not treatments |
| **IMPLEMENTATION RULES** | How the software computes and posts it | Not started — correctly |

| Item | Required authority |
| --- | --- |
| VAT recoverability on capital goods | **SPECIALIST** (TZ VAT law) + **[L2]** Tax Governance Committee |
| Withholding tax (incl. cross-border AE→TZ) | **SPECIALIST** + CFO |
| Capital allowances (TZ Third Schedule) | **SPECIALIST** + CFO |
| Deferred tax (IAS 12) | **SPECIALIST** + CFO — **[L7]** IAS 12 appears once, as a tax-strategy annotation, **not policy** |
| Deductible vs non-deductible expenditure | CFO + specialist |
| Tax basis vs accounting basis | **SPECIALIST** + CFO — the source of all deferred tax |
| **Is the capital request amount VAT-inclusive or exclusive?** | **CFO** — **[L6]** `capital_requests` has **no tax flag**; this directly changes the capitalised amount |

**[L2] Authoritative mechanism that already exists:** `DOM-TAX-001` requires a
statutory basis, contemporaneous documentation and a filed position paper, and
routes uncertain positions to the **Tax Governance Committee**. This is the
correct existing channel — no new tax governance mechanism should be invented.

**[L5] Not accounting policy:** `OBL-TZ-VAT` and `OBL-TZ-PAYE` prove filing
obligations exist. They say nothing about recognition.

**No tax accounts are invented.**

---

## §10 — Decision dependency graph

```
                    [L1] CONSTITUTION Art. 5 — CFO financial authority
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
        D-05 ACCRUAL BASIS  ◀── blocking          D-06 CoA SCOPE ◀── blocking
        (CFO)                                     (CFO + Architecture Review Board)
                    │                                   │
                    │                                   ├──▶ migration? A:no B/C/D:yes
                    ▼                                   ▼
        D-07 CAPEX TREATMENT ◀── blocking        MINIMUM CoA TRANCHE (2–4 accounts)
        (CFO)                                           │
                    │                                   │
                    └───────────────┬───────────────────┘
                                    ▼
                    D-12 FINANCIAL PERIODS ◀── blocking
                    (CFO; Board for fiscal year)
                    └─ requires NEW period permission ── constitutional (Art. 3)
                                    │
                                    ▼
                    D-13/D-14 MAKER / CHECKER ◀── blocking
                    (CFO; Board if authority moves) ── constitutional
                    ├─ CEO wildcard exclusion    ── constitutional
                    └─ CONST-AI-001 extension    ── constitutional
                                    │
                                    ▼
                          POSTING SERVICE (engineering)
                          guarded by migration 0005 ✔ already enforced
                                    │
                                    ▼
                    D-23 CAPEX PILOT ◀── blocking (needs a TZS request)
                                    │
                                    ▼
                    EXEC — CAPITAL EXECUTION SEMANTICS ◀── blocking
                    (CFO; Board if new capability)
                                    │
                                    ▼
                          CASH SETTLEMENT / TREASURY
                          ├─ OB opening balances    ── specialist (auditor)
                          └─ FX policy              ── blocking for cross-currency

  DEFERRABLE (do not block the pilot):
      IC intercompany · RES reserve · ENT-FIN-005 · CAP-2025-004 ratification
      D-07 items 11–15 (depreciation, useful life, residual, impairment, disposal)

  SPECIALIST-DEPENDENT:
      TAX (VAT recoverability, WHT, capital allowances, deferred tax) · OB (auditor)
      FX (IAS 21 net-investment / OCI treatment)

  CONSTITUTIONAL (Board or ARB involvement):
      D-06 (Art. 11 ARB) · D-12 fiscal year · D-13/14 if authority moves
      any new permission · capital:execute capability · OB (financial baseline)
```

**Classification summary**

| Class | Decisions |
| --- | --- |
| **Blocking** | D-05, D-06, D-07, D-12, D-13, D-14, D-23, EXEC (for execution), FX (cross-currency only) |
| **Non-blocking** | `CTL-FIN-002` correction (but **[RECOMMENDATION]** urgent) |
| **Deferrable** | IC, RES, ENT-FIN-005, CAP-2025-004, D-07 items 11–15, OB (accrual pilot only) |
| **Specialist-dependent** | TAX (all), OB (auditor), FX (IAS 21) |
| **Constitutional** | D-06 (ARB), D-12 fiscal year, D-13/14 authority moves, any new permission, `capital:execute`, OB baseline |

---

## §11 — Minimum viable accounting-policy package

The smallest authoritative package for: one entity · one functional currency ·
one CAPEX transaction · accrual-first · no intercompany · no FX · no tax beyond
an approved treatment · maker/checker · immutable double-entry · reversal-only.

**Policy statements that must exist before engineering begins — eleven:**

| # | Required policy statement | Authority |
| --- | --- | --- |
| **P1** | *"BEYU recognises capital expenditure on an accrual basis; the recognition event is `<named event>`."* | CFO |
| **P2** | *"A CAPEX transaction debits `<asset class>` and credits `<liability class>` at initial recognition."* | CFO |
| **P3** | *"The capitalised amount is the request amount, `<including / excluding>` VAT, `<plus / excluding>` directly attributable costs."* | CFO (+ specialist for VAT) |
| **P4** | *"The chart of accounts is scoped `<tenant-wide / per entity / master+mapping>`, numbered `<scheme>`."* | CFO + ARB |
| **P5** | *"The following accounts are established: `<2–4 accounts with code, name, type, IFRS category>`."* | CFO |
| **P6** | *"Financial periods are `<frequency>`, aligned to `<fiscal year>`; `<role>` may open a period."* | CFO (Board: fiscal year) |
| **P7** | *"Every journal entry must belong to an OPEN period."* (or the explicit contrary) | CFO |
| **P8** | *"Journal posting requires maker `<role>` and checker `<role>`; self-approval is `<permitted / prohibited>` `<threshold>`."* | CFO (Board if authority moves) |
| **P9** | *"`<new permission>` is excluded from the GROUP_CEO wildcard and denied to AI under `CONST-AI-001`."* — required only if P8 creates a permission | CFO |
| **P10** | *"The pilot transaction is a `<amount>` TZS CAPEX request at `<entity>`."* | CFO |
| **P11** | *"`CTL-FIN-002` effectiveness is restated as `<rating>` until the posting service is operational."* | CFO + Internal Audit |

**Already authoritative — needs no new statement:**
IFRS basis (L6) · per-entity functional currency (L6) · corrections by reversal
(L1 Art. 5 + L6 migration `0005`) · approval thresholds (L2 `ENT-FIN-002`) ·
posting authority is CFO-only (L6) · AI may not post (L2 `CONST-AI-001 r3`) ·
periods belong to legal entities and cannot overlap (L6) · balanced, ≥2-line,
single-sided, non-negative, immutable entries (L6 migration `0005`).

**With P1–P11, engineering is mechanical: no accounting judgement remains in code.**

---

## §12 — Formal CFO decision table

**Not signed. Not approved. Recorded for the competent authority.**

| ID | Decision | Proposed option | Authority | Status | Blocking |
| --- | --- | --- | --- | --- | --- |
| D-05 | Accrual treatment | `[OPTION]` — **[RECOMMENDATION]** B (accrual/payable), on accounting merit only | CFO | **PENDING** | **YES** |
| D-06 | CoA scope | `[OPTION]` — **[RECOMMENDATION]** C long-term; A only zero-migration | CFO + ARB | **PENDING** | **YES** |
| D-07 | CAPEX treatment | `[OPTION]` — 18 sub-items open; no threshold or code proposed | CFO | **PENDING** | **YES** |
| D-12 | Financial calendar | `[OPTION]` — **[RECOMMENDATION]** monthly, no reopening | CFO (Board: fiscal year) | **PENDING** | **YES** |
| D-13 | Maker model | `[OPTION]` — **[RECOMMENDATION]** A or B | CFO | **PENDING** | **YES** |
| D-14 | Checker model | `[OPTION]` — incl. whether CFO may self-approve | CFO (Board if authority moves) | **PENDING** | **YES** |
| D-23 | Pilot request | `[OPTION]` — **[RECOMMENDATION]** A, sub-threshold TZS at BEYU-AGR | CFO | **PENDING** | **YES** |
| FX | FX policy | `[OPTION]` — no rate source proposed | CFO + specialist | **PENDING** | **YES** general · **NO** TZS pilot |
| IC | Intercompany | DEFERRED | CFO | **DEFERRED** | **NO** |
| OB | Opening balances | `[OPTION]` — **[RECOMMENDATION]** auditor-certified TB via governed journal; migration bootstrap rejected | CFO + auditor (possibly Board) | **PENDING** | **NO** under accrual pilot · **YES** before settlement |
| TAX | Tax treatment | `[OPTION]` — VAT-inclusive vs exclusive first | CFO + Tax Governance Committee + specialist | **PENDING** | Partly |
| EXEC | Execution semantics | `[OPTION]` — **[RECOMMENDATION]** Interpretation 1 | CFO (Board if new capability) | **PENDING** | **YES** for execution |
| CTL | `CTL-FIN-002` restatement | `[OPTION]` — **[RECOMMENDATION]** restate now | CFO + Internal Audit | **PENDING** | **NO** (but urgent) |

---

## Scope statement

**[FACT]** Documentation only. No schema, migration, enum, CoA, financial period,
posting service, journal, capital execution, treasury, permission, role or
financial-data change. **`finance:ledger.approve` was deliberately NOT added.**
Ledger verified: **0 accounts, 0 periods, 0 entries, 0 lines**; capital 4;
treasury 5 totalling 11,783,000.00 — unchanged.

Related: `CFO_DECISION_WORKSHEET_PHASE_5D.md`,
`CFO_ACCOUNTING_POLICY_DECISIONS.md`,
`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md`,
`docs/governance/CAPITAL_EXECUTION_BLOCKED.md`.
