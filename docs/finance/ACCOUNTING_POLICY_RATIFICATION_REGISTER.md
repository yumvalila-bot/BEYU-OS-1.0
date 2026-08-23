# Accounting policy ratification register

**Status: AUTHORITY-READY RATIFICATION REGISTER. No decision has been made.**
Phase 5G · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0` · Baseline commit `0fd82e9`

This register is designed so that an actual authorised CFO, Board member or
specialist can **explicitly ratify or reject each item**. It converts the
outstanding questions from Phase 5F into decision-ready form.

## Governing rules applied

> **Repository evidence is not a decision. Recommendations are not decisions.
> Implementation convenience is not accounting authority.**

**Every decision status below is `PENDING`.** Nothing has been fabricated: no
decision maker, decision date, approval number, board minute, policy document,
signature or effective date appears anywhere in this register.

### Verification of existing authority (performed this phase)

**[FACT]** A search of the governance record for any ratification of accounting
policy returned **nothing**:

- **[FACT]** 4 resolutions exist: `BEYU-BRD-2025-014` (waterfall config, APPROVED),
  `BEYU-FC-2025-007` (beneficiary class, APPROVED), `BEYU-IC-2025-021` (capital
  allocation, **TABLED**), `BEYU-TGC-2025-031` (capital allowance, **DRAFT**).
- **[FACT]** **No resolution** references a chart of accounts, ledger, accounting
  period, recognition basis, posting or maker/checker.
- **[FACT]** The policy register is unchanged: `CONST-AI-001`, `DOM-TAX-001`,
  `ENT-FIN-002`, `ENT-FIN-003`, `ENT-SEC-004`. **None defines an accounting treatment.**

**Conclusion: no authoritative accounting decision exists in the repository.
Every item therefore remains `PENDING`.**

> **[FACT] Note on `BEYU-TGC-2025-031`.** A Tax Governance Committee resolution
> *"Adopt capital allowance position for agricultural machinery"* exists and is
> directly relevant to CAPEX at BEYU Agriculture Ltd. **Its status is `DRAFT`.**
> A draft resolution confers **no authority** and must not be relied upon. It is
> recorded here because, once ratified, it would partially resolve **T-03**.

---

## §2 — Outstanding decisions carried forward from Phase 5F

Existing IDs and numbering preserved. **No status changed because an option
appears preferable.**

| ID | Question | Proposed option | Authority | Status |
| --- | --- | --- | --- | --- |
| **P1** | Recognition basis | `[OPTION]` | CFO | **PENDING** |
| **P2** | CAPEX debit/credit classes | `[OPTION]` | CFO | **PENDING** |
| **P3** | Measurement basis | `[OPTION]` | CFO + specialist | **PENDING** |
| **P4** | Chart of accounts scope | `[OPTION]` | CFO + Architecture Review Board | **PENDING** |
| **P5** | First CoA tranche | `[OPTION]` | CFO | **PENDING** |
| **P6** | Financial calendar | `[OPTION]` | CFO; Board for fiscal year | **PENDING** |
| **P7** | Period-mandatory rule | `[OPTION]` | CFO | **PENDING** |
| **P8** | Maker/checker model | `[OPTION]` | CFO; Board if authority moves | **PENDING** |
| **P9** | Execution authority | `[OPTION]` | CFO; Board if new capability | **PENDING** |
| **P10** | First pilot transaction | `[OPTION]` | CFO | **PENDING** |
| **P11** | Opening balances | `[OPTION]` | CFO + auditor; possibly Board | **PENDING** |
| **T-01…T-06** | Tax treatments | — | Specialist + Tax Governance Committee | **PENDING** |
| **FX-01…FX-09** | FX policy | — | CFO + specialist | **BLOCKED — POLICY REQUIRED** |
| **IC** | Intercompany | Defer | CFO | **DEFERRED** |
| **EF5** | `ENT-FIN-005` missing policy | — | Board | **PENDING** |
| **C004** | `CAP-2025-004` ratification | — | Board | **PENDING** |
| **CTL** | `CTL-FIN-002` restatement | — | CFO + Internal Audit | **PENDING** |

*(P9 is the execution-authority decision per this phase's §11. The
permission-constraint item previously numbered P9 in Phase 5F is carried inside
P8 as a conditional consequence, so no ID is lost or reused.)*

---

## §3–§13 — Decision records

Every record carries the full field set. **Decision maker, decision date,
supporting document and effective date are deliberately left blank.**

---

### P1 — Accounting recognition basis

| Field | Content |
| --- | --- |
| **Decision ID** | P1 |
| **Policy question** | When a capital transaction creates an economic obligation before cash settlement, what event triggers accounting recognition? |
| **Current authoritative facts** | **[FACT]** IFRS is the accounting basis (`accounting_standard` NOT NULL, 8/8 entities). **[FACT]** No ratified recognition statement exists in the constitution, any policy, any control, any ADR or any resolution. **[FACT]** Corrections are by reversal (Art. 5), enforced by migration `0005` |
| **Existing constraints** | **[FACT]** No invoice, purchase-order, goods-receipt, commitment or payment-terms concept exists in the schema. Options requiring those events cannot currently be observed by the system |
| **Options** | **A** Cash basis — recognise at payment · **B** Accrual — recognise at obligation (invoice/contract) · **C** Accrual — recognise at control transfer (receipt of goods/services) · **D** Staged/percentage-of-completion |
| **Consequences — A** | Debit asset, credit cash in one entry. **Weak under IAS 16** (recognition should follow control, not payment). Requires cash to exist first, so opening balances become a prerequisite. No payable class needed |
| **Consequences — B** | Two stages: (1) debit asset, credit payable; (2) debit payable, credit cash. IFRS-consistent. Requires a payable class and an obligation-triggering artefact. Recognition and settlement separately controllable — stronger SoD |
| **Consequences — C** | Technically most correct for IAS 16. Requires a goods-receipt concept that does not exist. Recognition fully decoupled from both approval and payment |
| **Consequences — D** | Only relevant if multi-period construction CAPEX exists — **[UNKNOWN]** |
| **Recommendation** | **[RECOMMENDATION]** B or C on IFRS merit; A is weak. **Not a decision.** **Explicitly recorded: the fact that B removes the opening-cash blocker is a consequence, not a justification. The basis must be chosen on accounting merit** |
| **Required authority** | Group CFO (Constitution Art. 5) |
| **Exact decision wording** | *"BEYU recognises capital expenditure on a `<cash / accrual>` basis. The recognition event is `<commitment / invoice receipt / receipt of goods or services / payment>`. Recognition is independent of governance approval and of cash settlement. Where an obligation is recognised before payment, the entity debits `<asset class>` and credits `<payable class>`; settlement is a separate posting."* |
| **Decision status** | **PENDING** |
| **Decision maker** | _(blank — not yet decided)_ |
| **Decision date** | _(blank)_ |
| **Supporting document** | _(blank)_ |
| **Effective date** | _(blank)_ |
| **Implementation impact** | Blocks P2, P5, P7, P10, P11 and the posting service |
| **Reversibility** | Low. Posted entries are immutable; a later basis change applies prospectively and creates a comparability break |
| **Historical-data impact** | None — ledger is empty (0/0/0/0) |

---

### P2 — CAPEX recognition and classes

| Field | Content |
| --- | --- |
| **Decision ID** | P2 |
| **Policy question** | What classes are debited and credited on initial recognition of a CAPEX transaction, and what qualifies as CAPEX? |
| **Current authoritative facts** | **[FACT]** `request_type='CAPEX'` exists as a requester's label with no binding definition. **[FACT]** No debit/credit mapping exists for any of the 5 request types. **[FACT]** No asset register, depreciation table or threshold field exists |
| **Existing constraints** | **[FACT]** `journal_lines` supports any account class, so no schema limit applies. **[FACT]** Reversal-only correction is enforced |
| **Options** | Debit: **PP&E** vs **assets under construction** (until commissioned). Credit: determined by P1 — **cash** or **payable** |
| **Consequences** | Assets-under-construction defers depreciation start and needs a commissioning event that does not exist. PP&E directly is simpler but may start depreciation early |
| **Accounting policy vs implementation mechanics** | **Policy:** what qualifies as CAPEX, capitalisation criteria, which classes, attributable costs. **Mechanics:** how the service builds a balanced entry, which is already fully constrained by migration `0005` |
| **Dependencies to record separately** | Depreciation (method, useful life, start point, residual) · impairment (IAS 36) · disposal. **[RECOMMENDATION]** deferrable past first posting **only if** the CFO accepts an un-depreciated asset — itself a decision and a reportable period-end gap |
| **Recommendation** | **[RECOMMENDATION]** None. **No account codes and no capitalisation threshold are proposed** |
| **Required authority** | Group CFO |
| **Exact decision wording** | *"A CAPEX transaction is defined as `<definition>`. Expenditure at or above `<threshold>` is capitalised. On initial recognition the entity debits `<asset class>` and credits `<liability or cash class>`. Directly attributable costs `<are / are not>` capitalised. Depreciation `<commences at / is deferred pending>` `<event>`."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks P5 and the pilot |
| **Reversibility** | None once posted — a wrong treatment becomes permanent history correctable only by reversal |
| **Historical-data impact** | None |

---

### P3 — Measurement basis

| Field | Content |
| --- | --- |
| **Decision ID** | P3 |
| **Policy question** | Is the capitalised amount the approved request amount, and does it include VAT and directly attributable costs? |
| **Current authoritative facts** | **[FACT]** `capital_requests` has **no tax-treatment flag** — whether a request amount is VAT-inclusive is **[UNKNOWN]**. **[FACT]** No attributable-cost concept exists |
| **Existing constraints** | The capitalised amount directly determines the asset's carrying value and all subsequent depreciation |
| **Options** | Amount as approved · amount plus attributable costs · amount net of recoverable VAT · a combination |
| **Consequences** | Each produces a different carrying value and therefore a different P&L over the asset's life |
| **Recommendation** | **[RECOMMENDATION]** None — depends on VAT recoverability (**T-01**), which is a specialist question |
| **Required authority** | Group CFO + **specialist** (VAT recoverability) |
| **Exact decision wording** | *"The capitalised amount is the approved request amount, `<including / excluding>` VAT, `<plus / excluding>` directly attributable costs comprising `<list>`."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks the pilot |
| **Reversibility** | None once posted |
| **Historical-data impact** | None |

---

### P4 — Chart of accounts scope

| Field | Content |
| --- | --- |
| **Decision ID** | P4 |
| **Policy question** | Is the canonical chart of accounts tenant/group-wide, entity-specific, a shared canonical chart with entity applicability, or another model? |
| **Current authoritative facts** | **[FACT]** `ledger_accounts.tenant_id` NOT NULL; **no `legal_entity_id`**. **[FACT]** `ledger_accounts.code` is **globally unique**. **[FACT]** `financial_periods` and `journal_entries` are legal-entity scoped. **[FACT]** 0 accounts exist. **[FACT]** Account classes are fixed by enum: `ASSET\|LIABILITY\|EQUITY\|REVENUE\|EXPENSE` |
| **Existing constraints** | The schema is internally inconsistent: accounts are tenant-scoped while everything consuming them is entity-scoped. **Global code uniqueness forecloses the naive per-entity model** |
| **Options** | **A** tenant/group-wide · **B** entity-specific · **C** shared canonical with entity applicability · **D** account plus entity-as-dimension |
| **Consequences — A** | No migration; matches the schema as built. Weak entity isolation; one "Cash" account shared across USD and TZS entities; strains as jurisdictions grow |
| **Consequences — B** | Strongest isolation; **blocked by global uniqueness** unless codes are prefixed or the constraint changes — **a migration**. Consolidation requires a mapping layer that does not exist |
| **Consequences — C** | Strongest consolidation (`OBL-IFRS-CONSOL` is ACTIVE); best fit for TRUST(MU/USD) → HOLDING(AE/USD) → COUNTRY_HOLDING(TZ/TZS) → operating entities; requires a mapping table — **a migration**; heaviest for a first pilot |
| **Consequences — D** | Flexible; largest departure from the existing model; migration required |
| **Recommendation** | **[RECOMMENDATION]** C is architecturally safest long term. A is the only zero-migration path and cheapest for a pilot, at the cost of near-certain rework. **Not a decision.** **No account codes proposed. Schema not changed** |
| **Required authority** | Group CFO + **Architecture Review Board** (Constitution Art. 11) |
| **Exact decision wording** | *"The BEYU chart of accounts is `<tenant-wide / entity-specific / shared canonical with entity applicability / other>`. Account codes follow `<numbering scheme>`. Account creation is authorised by `<role>`."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks P5, all posting, and determines whether a migration is required |
| **Reversibility** | Low. Once accounts carry immutable entries, re-scoping is a mapping exercise, not an edit |
| **Historical-data impact** | None now. **Choosing A now and B/C later WOULD affect posted history** |

---

### P5 — Initial CoA tranche

| Field | Content |
| --- | --- |
| **Decision ID** | P5 |
| **Policy question** | Which minimum account classes are established for the first pilot? |
| **Current authoritative facts** | **[FACT]** 0 accounts exist. No CoA appears in docs, seed or code |
| **Existing constraints** | Account classes are enum-fixed. Codes must be globally unique. Currency lives on the journal entry, not the account |
| **Recommendation** | **[RECOMMENDATION]** The classes below. **No authoritative account numbers are invented** |
| **Required authority** | Group CFO |
| **Exact decision wording** | *"The following ledger accounts are established: `<code>`, `<name>`, `<account_type>`, `<ifrs_category>`, applicable to `<entity scope>`."* (repeated per account) |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks the pilot |
| **Reversibility** | Accounts may be deactivated (`active` flag) but not deleted once used |
| **Historical-data impact** | None |

**Proposed account classes — all `[PROPOSED — NOT RATIFIED]`:**

| # | Purpose | Economic substance | Normal balance | Entity scope | Currency implications | FS classification | Required for pilot? | Policy basis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Property, plant & equipment | Tangible capital asset controlled by the entity | **Debit** | Per P4 | Carried in the entity's functional currency | Statement of financial position — non-current asset | **Yes** — debit side of CAPEX | IAS 16; **pending P2** |
| 2 | Trade / capital payable | Obligation to a supplier not yet settled | **Credit** | Per P4 | Functional currency; FX applies if supplier invoices in another currency | Statement of financial position — current liability | **Yes if P1 = accrual** | IAS 37 / IFRS 9; **pending P1** |
| 3 | Bank / cash | Cash controlled by the entity | **Debit** | Per P4 | One account per currency, or currency on the entry — **depends on P4** | Statement of financial position — current asset | **Only if P1 = cash basis** | **Pending P1** |
| 4 | Opening-balance equity / suspense | Counterpart establishing opening positions | **Credit** | Per P4 | Functional currency | Equity | **Only if P11 requires opening balances** | **Pending P11** |

**Minimum for an accrual pilot: accounts 1 and 2 only (two accounts).**
**[FACT]** No code, name or IFRS category is proposed for any of them — an
invented placeholder would become permanent policy once entries are immutable.

---

### P6 — Financial calendar

| Field | Content |
| --- | --- |
| **Decision ID** | P6 |
| **Policy question** | What is BEYU's fiscal year and period structure, and who may create, open, close and reopen periods? |
| **Current authoritative facts** | **[FACT]** `financial_periods(id, legal_entity_id, code, starts_on, ends_on, status, closed_by, closed_at)`; **0 rows**. **[FACT]** Statuses `OPEN\|CLOSING\|CLOSED\|LOCKED` exist with **no defined semantics**. **[FACT]** **No period-management permission exists in the 47-permission catalogue — nobody can currently open a period.** **[FACT]** `OBL-TZ-VAT` requires monthly filing |
| **Existing constraints — already enforced, not decisions** | Periods belong to a legal entity (FK NOT NULL) · periods **cannot overlap** (`financial_period_no_overlap`) · `starts_on < ends_on` (`financial_period_dates_ordered`) |
| **Sub-decisions, all PENDING** | Fiscal year (**Board**) · period length · period creation authority · opening authority · closing authority · reopening permitted? · reopening requires governance approval? · late postings · post-close corrections · year-end transition |
| **Consequences** | Period boundaries drive cut-off, comparability and VAT reconciliation. Reopening a closed period is a classic audit red flag |
| **Recommendation** | **[RECOMMENDATION]** Monthly, aligned to TZ filing; no reopening after close; a new period-management permission restricted to a finance role. **Not a decision** |
| **Required authority** | Group CFO; **Group Board** for the fiscal-year convention |
| **Exact decision wording** | *"BEYU financial periods are `<monthly / quarterly>`, aligned to a fiscal year ending `<date>`, maintained `<per legal entity / group-wide>`. `<role>` may create and open a period. `<role>` may close a period. Reopening a closed period is `<prohibited / permitted only with `<authority>` approval>`. Postings after close are `<prohibited / permitted as adjusting entries during CLOSING>`."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks period creation and therefore all posting; **requires a new permission** |
| **Reversibility** | Frequency is reversible before posting, not after |
| **Historical-data impact** | None |

---

### P7 — Period-mandatory rule

| Field | Content |
| --- | --- |
| **Decision ID** | P7 |
| **Policy question** | Must every journal posting belong to an open, entity-valid financial period? |
| **Current authoritative facts** | **[FACT] `journal_entries.period_id` is NULLABLE** — the schema permits a journal entry with **no period at all**. **[FACT]** `journal_entries.legal_entity_id` is NOT NULL, so entity validity is enforceable. **[FACT]** Currency lives on the entry (`currency`, `fx_rate`), not on the period |
| **Existing constraints** | Nothing currently prevents a period-less entry |
| **Required determinations** | (a) Must an **open** period exist? (b) Must the period belong to the **same legal entity** as the entry? (c) Is there any **currency** validity requirement on a period? |
| **Edge cases requiring explicit rules — all PENDING** | **No period exists** → reject the posting, or auto-create? · **Period is closed** → reject, or route to the next open period? · **Period is reopened** → are new postings permitted, or only reversals? · **Transaction date differs from posting date** → which date selects the period? |
| **Consequences** | A nullable period is a control gap: entries could evade period close entirely, defeating cut-off |
| **Recommendation** | **[RECOMMENDATION]** Every entry must reference a period in status OPEN belonging to the same legal entity; reject when absent or closed; the **transaction date** selects the period. **Not a decision** |
| **Required authority** | Group CFO |
| **Exact decision wording** | *"Every journal entry must reference a financial period of the same legal entity in status `<OPEN>`. Postings are rejected where no such period exists. The period is selected by the `<transaction / posting>` date. Where a period is reopened, `<only reversing entries / all entries>` may be posted."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks the posting service design |
| **Reversibility** | High before posting begins |
| **Historical-data impact** | None |

---

### P8 — Maker / checker

| Field | Content |
| --- | --- |
| **Decision ID** | P8 |
| **Policy question** | What is the segregation-of-duties model for journal posting, and may the Group CFO post and approve the same entry? |
| **Current authoritative facts** | **[FACT]** `finance:ledger.post` is a **single** HIGH_RISK permission held by **GROUP_CFO only** (re-verified). **[FACT]** GROUP_CEO does **not** hold it — one of exactly 3 wildcard exclusions. **[FACT] `finance:ledger.approve` does not exist in any role and was not created.** **[FACT]** `journal_entries.approved_by` exists and is written by **no code path**. **[FACT]** No draft/pending/rejected state exists on `journal_entries`. **[FACT]** A `delegations` table exists |
| **Existing constraints** | **[FACT]** `CTL-FIN-002` requires maker/checker on **all** journal postings, with no materiality threshold. **[FACT]** `CONST-AI-001 r3` denies AI `finance:ledger.post` **by name** |
| **Options** | **A** CFO posts and self-approves · **B** separate finance maker/checker roles · **C** delegated checker authority · **D** threshold-based approval · **E** governance approval plus accounting approval · **F** other |
| **The eleven required answers — all PENDING** | 1 **Who may prepare/post?** · 2 **Who may check?** · 3 **May the same person post and approve?** · 4 **May the CFO self-approve?** · 5 **Does approval vary by amount?** · 6 **Does approval vary by entity?** · 7 **How are reversals handled** (a reversal is itself a posting — does it need approval?) · 8 **Emergency corrections?** · 9 **May delegated authority be used?** · 10 **What evidence must be recorded?** · 11 **What role may AI/HIVE/Noelia play?** |
| **Consequences — A** | Works today with zero changes, but **no segregation of duties** — a failure under SOC2, which `CTL-FIN-002` itself cites as a framework |
| **Consequences — B/C/D** | Genuine SoD, but **[FACT]** since GROUP_CFO is the *only* holder, prohibiting self-approval **makes posting impossible** until a second authorised human exists |
| **Consequences — E** | Conflates governance authority with accounting control; **[RECOMMENDATION]** avoid — Art. 5 separates them |
| **Conditional consequence if a new capability is required** | **`NEW PERMISSION REQUIRED — POLICY DECISION ONLY`.** Two silent failure modes must be closed in the same decision: **(i)** the GROUP_CEO wildcard grants all permissions except 3 named exclusions, so a new permission would be **auto-granted to the role deliberately denied posting**; **(ii)** `CONST-AI-001 r3` names `finance:ledger.post` only, so a new permission would **not** be covered and AI would formally be able to approve journals. **Not implemented in this phase** |
| **Recommendation** | **[RECOMMENDATION]** B or D. **Not a decision. No permission created** |
| **Required authority** | Group CFO; **Group Board** if posting or approval authority moves outside the CFO, as that alters the constitutional finance authority model |
| **Exact decision wording** | *"Journal posting requires a maker holding `<permission>` and a checker holding `<permission>`. The same natural person `<may / may not>` act as both maker and checker `<unconditionally / below `<threshold>`>`. The Group CFO `<may / may not>` self-approve. Reversing entries `<require / do not require>` independent approval. Delegated checker authority `<is / is not>` permitted under the existing delegation model. AI-initiated actions may `<not>` act as maker or checker."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks the posting service; determines whether a permission and policy amendments are required |
| **Reversibility** | Permission grants are reversible; **entries approved under a weak model are not** |
| **Historical-data impact** | None — zero postings exist |

---

### P9 — Execution authority

| Field | Content |
| --- | --- |
| **Decision ID** | P9 |
| **Policy question** | What authority is required to execute a capital transaction, as distinct from authorising it and from posting it? |
| **Current authoritative facts** | **[FACT]** The governance gate stops at `GOVERNANCE_AUTHORIZED` and, per its own implementation, *"moves no money, posts no journal entry, creates no ledger record, issues no treasury instruction and calls no external system"*. **[FACT]** No `capital:execute`, `capital:fund` or `treasury:transfer` capability exists. **[FACT]** No treasury transaction table exists |
| **Existing constraints — the separation to preserve** | **Governance authorization ≠ accounting posting authority ≠ capital execution authority.** **[FACT]** The constitution supports this reading: Art. 4 vests material decisions in governance bodies while Art. 5 vests financial consequences in the CFO, and `finance:ledger.post` is deliberately excluded from the CEO wildcard |
| **Options** | **A** existing `finance:ledger.post` suffices · **B** a separate capital-execution capability · **C** governance resolution alone · **D** accounting approval alone · **E** a combination (e.g. governance authorization **plus** execution capability **plus** posting approval) |
| **Consequences — A** | Collapses execution into posting; the CFO alone could move capital with no separate execution control |
| **Consequences — B** | Preserves separation, but **creating a new capability is a new constitutional power** → Board |
| **Consequences — C** | **[RECOMMENDATION] Reject** — would make governance approval an irreversible money-movement trigger with no financial control |
| **Consequences — D** | Ignores the governance prerequisite already implemented |
| **Consequences — E** | Strongest control; most complex; must not become a second authorization system |
| **Related open question** | Does `GOVERNANCE APPROVED` mean *"the action is authorised"* or *"the transaction must now be executed"*? **[BEHAVIOUR]** The system behaves as the former, but **[FACT]** that is an artefact of execution being unimplemented, **not** a ratified position |
| **Recommendation** | **[RECOMMENDATION]** E, with authorisation and execution kept distinct. **Not a decision. No capability granted** |
| **Required authority** | Group CFO; **Group Board** if a new capability is created |
| **Exact decision wording** | *"Capital execution requires `<governance authorization>` plus `<capability>`. Governance authorization alone `<does not>` constitute authority to move funds or post journals. Accounting posting authority `<is / is not>` sufficient to execute a capital transaction."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks the capital execution service |
| **Reversibility** | High — nothing implemented |
| **Historical-data impact** | None |

---

### P10 — First pilot transaction

| Field | Content |
| --- | --- |
| **Decision ID** | P10 |
| **Policy question** | What legitimate business transaction will constitute the first accounting pilot? |
| **Current authoritative facts** | **[FACT]** **Zero TZS capital requests exist** — re-verified this phase (`count = 0`). **[FACT]** All 4 requests are USD against TZS-functional entities. **[FACT]** Only BEYU-FT (TRUST) and BEYU-HLD (HOLDING) are USD-functional, and **both have 0 capital requests**. **[FACT]** `CAP-2025-004` is **not** governance-approved (see **C004**) |
| **Existing constraints** | Pilot must be: single entity · single functional currency · single request type · single treatment · no intercompany · no FX · no tax complexity beyond an explicit decision · no treasury movement · fully governed · fully auditable · reversal-only correction |
| **Options** | **A** a genuinely new TZS capital request · **B** another legitimate TZS transaction already supported by the business · **C** an approved USD-functional-entity transaction · **D** wait for FX policy |
| **Consequences — A** | Clean and FX-free: `fx_rate = 1` is arithmetically **correct**, not a placeholder. Requires a real business need and `ENT-FIN-002` approval |
| **Consequences — B** | **[FACT]** Attractive because it needs no new capital request — but **[UNKNOWN]** to engineering whether such a transaction exists. **This is a business question for the CFO** |
| **Consequences — C** | Requires a new request at BEYU-FT or BEYU-HLD (both have none). A trust or holding company is a poor fit for a CAPEX pilot |
| **Consequences — D** | Safe but slow; unnecessary if A or B is available |
| **Recommendation** | **[RECOMMENDATION]** A or B. **Not a decision. No capital request was created. No data was manufactured** |
| **Required authority** | Group CFO (request creation follows `ENT-FIN-002` thresholds) |
| **Exact decision wording** | *"The first accounting pilot is `<transaction description>` at `<legal entity>`, denominated in `<currency>`, of type `<CAPEX>`, in the amount of `<amount>`, recognised in accordance with P1 and P2."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Blocks the pilot |
| **Reversibility** | High |
| **Historical-data impact** | None |

> **[FACT] Anti-fabrication statement.** A pilot transaction must represent a real
> business event authorised through `ENT-FIN-002`. It must not be invented to make
> a test pass. Engineering cannot determine whether a genuine TZS capital need
> exists — that is a business fact known only to the CFO.

---

### P11 — Opening balances

| Field | Content |
| --- | --- |
| **Decision ID** | P11 |
| **Policy question** | Are opening balances required for the selected pilot, and if so how are they established and authorised? |
| **Current authoritative facts** | **[FACT]** The ledger is empty (0/0/0/0). **[FACT]** `treasury_positions` holds 5 balances totalling 11,783,000.00 — but that is a **snapshot table with no journal provenance** and is **not** a ledger balance |
| **Conditional analysis** | **[FACT]** Under accrual (P1 option B/C) the first CAPEX entry debits an asset and credits a payable. **Neither line touches cash.** Both accounts legitimately start at zero because the transaction creates both balances. **Therefore, if and only if the CFO selects accrual on accounting merit, opening cash is not required for the pilot's initial recognition.** Under P1 option A the credit is to cash, which must already exist — so opening balances become a hard prerequisite |
| **Retained requirement** | Opening balances remain required for settlement of the payable, any cash-crediting entry, and any meaningful trial balance or financial statements |
| **Options if required** | **A** opening-balance journal · **B** import from a legacy system (**[FACT]** none identified) · **C** auditor-certified opening trial balance loaded via A · **D** migration-only bootstrap · **E** start prospectively at zero |
| **Consequences — D** | **[RECOMMENDATION] Reject** — bypasses maker/checker and audit provenance and manufactures financial data with no evidential basis |
| **Elements the mechanism must define** | Source evidence (**specialist/auditor**) · effective date · balancing account (**not invented here**) · approving authority · maker/checker · reconciliation · correction by reversal |
| **Recommendation** | **[RECOMMENDATION]** C then A. **Not a decision. No opening balance created** |
| **Required authority** | Group CFO + external auditor; **[RECOMMENDATION]** Group Board, as opening balances establish the group's entire financial baseline |
| **Exact decision wording** | *"Opening balances are established by `<mechanism>` as at `<effective date>`, evidenced by `<document>`, with the balancing entry to `<account>`, approved by `<authority>`."* |
| **Decision status** | **PENDING** |
| **Decision maker / date / document / effective date** | _(blank)_ |
| **Implementation impact** | Conditional — not blocking for an accrual pilot; blocking before settlement |
| **Reversibility** | None once posted |
| **Historical-data impact** | Establishes the baseline for all future history |

---

## §14 — Tax specialist decisions

**Three layers kept separate:**

| Layer | State |
| --- | --- |
| **Accounting policy** | **[FACT]** Absent — no tax accounts, no recognition rules |
| **Tax policy** | **[FACT]** `DOM-TAX-001` governs *process* (statutory basis, contemporaneous documentation, filed position paper, Tax Governance Committee approval for uncertain positions) — **not treatments** |
| **Statutory filing obligation** | **[FACT]** `OBL-TZ-VAT` (monthly VAT return), `OBL-TZ-PAYE` — filing only |

| ID | Question | Authority | Status |
| --- | --- | --- | --- |
| **T-01** | Is input VAT on capital goods recoverable? | **SPECIALIST DECISION REQUIRED** + Tax Governance Committee | **PENDING** |
| **T-02** | Withholding tax, including cross-border AE→TZ | **SPECIALIST DECISION REQUIRED** | **PENDING** |
| **T-03** | Capital allowances (TZ Third Schedule) | **SPECIALIST DECISION REQUIRED** — **[FACT]** `BEYU-TGC-2025-031` addresses exactly this for agricultural machinery but is **DRAFT** and confers no authority | **PENDING** |
| **T-04** | Deferred tax (IAS 12) | **SPECIALIST DECISION REQUIRED** — **[FACT]** IAS 12 appears once, as a `tax_strategies.accounting_effect` annotation, not policy | **PENDING** |
| **T-05** | Deductible vs non-deductible expenditure | CFO + specialist | **PENDING** |
| **T-06** | Tax-account mapping | CFO, after T-01…T-04 | **PENDING** |

**Nothing decided. No tax accounts invented.**

---

## §15 — FX

**Status: `BLOCKED — POLICY REQUIRED`.**

**[FACT]** No rate was derived from treasury snapshots; no USD/TZS rate was
selected; no FX table or service was created. The seeded treasury implies **three
mutually inconsistent** USD/TZS rates (2,613.3333 / 2,613.8434 / 2,615.3846),
which disagree with each other, are seed data, are quotients of rounded balances
with no provider or timestamp, and carry no effective date — IAS 21 requires the
rate *at the transaction date*.

| ID | Question requiring authoritative resolution | Status |
| --- | --- | --- |
| **FX-01** | Rate source | **PENDING** — none proposed |
| **FX-02** | Transaction-date rate | **PENDING** |
| **FX-03** | Reporting-date rate | **PENDING** |
| **FX-04** | Revaluation of monetary items | **PENDING** |
| **FX-05** | Realised vs unrealised FX differences | **PENDING** — different TZ tax treatment |
| **FX-06** | Functional currency | **RESOLVED** — per-entity, schema-enforced |
| **FX-07** | Reporting currency | **PENDING** — **[FACT]** no column, no policy |
| **FX-08** | Rounding | **PENDING** — TZS has no minor unit in practice; USD has 2 dp |
| **FX-09** | Rate authority and override | **PENDING** — **[RECOMMENDATION]** never client-supplied |

A no-FX pilot may proceed **only** if genuinely single-functional-currency —
a TZS transaction at a TZS-functional entity, where no conversion occurs.

---

## §16 — Intercompany

**Status: `DEFERRED`.** Architectural reasons, all previously established and
re-confirmed:

1. **[FACT]** No finance counterparty model — an exhaustive column scan found the
   only `counterparty` column in the database is `legal_matters.counterparty`
   (litigation, unrelated to finance).
2. **[FACT]** A journal entry has exactly **one** legal entity
   (`legal_entity_id` NOT NULL, singular; `journal_lines` carries no entity), so a
   cross-entity transaction **cannot** be expressed as a single entry.
3. Reciprocal entries are not defined — equity injection vs intercompany loan
   produce materially different balance sheets.
4. **[FACT]** Elimination policy absent, though `OBL-IFRS-CONSOL` is ACTIVE.
5. Intercompany FX unresolved (BEYU-HLD USD → BEYU-TZH TZS crosses currency
   **and** jurisdiction).

**Retained caveat:** if operating-company CAPEX is *parent-funded*, the complete
transaction **is** intercompany and a single-entity posting captures only half.
The pilot is accounting-complete only if **self-funded** — **PENDING** (P10).

**Not implemented.**

---

## §17 — ENT-FIN-005

| Field | Content |
| --- | --- |
| **Reference location** | **[FACT]** `waterfall_tiers` sequence 4 — `RESERVE`, *"Mandatory reserve floor (90 days)"*, type `THRESHOLD_TOPUP`, `legal_basis` = *"Board treasury policy ENT-FIN-005"* |
| **Existence** | **[FACT]** **Does not exist** — re-verified this phase: `select count(*) from policies where code='ENT-FIN-005'` → **0**. The register contains only `CONST-AI-001`, `DOM-TAX-001`, `ENT-FIN-002`, `ENT-FIN-003`, `ENT-SEC-004` |
| **Dependency** | The waterfall's mandatory reserve tier claims a legal basis that cannot be produced on audit; any future RESERVE-type accounting treatment inherits the gap |
| **Missing authority** | A board-level treasury policy establishing the reserve floor |
| **Responsible authority** | **Group Board** |
| **Blocks the pilot?** | **No** — a CAPEX pilot does not touch the RESERVE tier |
| **Status** | **`BOARD/POLICY DECISION REQUIRED` — PENDING** |

**Not invented. Not recreated.**

---

## §18 — CAP-2025-004

**`CAP-2025-004 is NOT an eligible pilot transaction.`**

**[FACT] Governance chain re-verified this phase — it fails on two independent counts:**

1. **The resolution is not approved.** `BEYU-IC-2025-021` has status **`TABLED`**,
   not APPROVED.
2. **The approving body is insufficient.** The resolution's own consequences text
   states *"Requires Group Board ratification as a reserved matter above
   USD 1,000,000"*, and `ENT-FIN-002 r2` makes ≥ USD 1,000,000 a Group Board
   reserved matter. The body of record is the **Investment Committee**.

**Rule preserved verbatim: Investment Committee approval is insufficient where
Group Board ratification is required.**

**[FACT]** Nothing was altered: resolution status, voting result, governance
thresholds, body authority and ratification requirements are all unchanged.
**No governance was weakened to enable accounting testing.**

**C004 — Board ratification: PENDING.**

---

## §19 — CTL-FIN-002

**The control was NOT modified.**

| Field | Current stated value | Actual evidence |
| --- | --- | --- |
| Title | Maker/checker on all journal postings | — |
| `control_type` | PREVENTIVE | No preventive mechanism exists |
| `automation` | **AUTOMATED** | **[FACT]** No posting service exists; nothing is automated |
| `effectiveness` | **EFFECTIVE** | **[FACT]** No checker mechanism exists |
| `owner_role` | GROUP_CFO | — |
| `last_tested_at` | 2025-11-30 | **[FACT]** A test date is recorded for a control that could not have been tested |
| `evidence_document_id` | **null** | **[FACT]** No evidence attached |
| Postings covered | "all journal postings" | **[FACT]** Zero journal entries have ever existed |
| `approved_by` | — | **[FACT]** Column exists; written by **no code path** |

> The control asserts an AUTOMATED, EFFECTIVE, PREVENTIVE control over a
> mechanism that does not exist. **The rating is unsubstantiated and must not be
> relied upon in assurance or audit reporting.**

**`RECOMMENDATION — NOT RATIFIED`** — proposed corrected status for the control
owner (GROUP_CFO) and Internal Audit (Art. 8: Internal Audit reports to the Risk
& Audit Committee):

| Field | Current | Proposed |
| --- | --- | --- |
| `automation` | AUTOMATED | `MANUAL` or `NOT_IMPLEMENTED` |
| `effectiveness` | EFFECTIVE | `NOT_EFFECTIVE` / `NOT_TESTED` |
| `evidence_document_id` | null | Reference to this register pending implementation |
| Description | unchanged | Add: *"Design documented; enforcement pending posting service."* |

**CTL — PENDING.**

---

## §20 — Authority-ready decision sheets

**No names, dates or signatures are filled in.**

### CFO RATIFICATIONS

```
DECISION ID:            P1 — Accounting recognition basis
QUESTION:               What event triggers accounting recognition of a capital transaction?
RECOMMENDED OPTION:     [RECOMMENDATION] Accrual (B or C) on IFRS merit — not a decision
ALTERNATIVES:           A cash basis · B accrual at obligation · C accrual at control transfer · D staged
CONSEQUENCES:           Determines whether the first entry touches cash, whether a payable class is
                        required, and whether opening balances are a prerequisite. Low reversibility
                        once entries are posted.
EXACT RATIFICATION WORDING:
    "BEYU recognises capital expenditure on a <cash / accrual> basis. The recognition event is
     <commitment / invoice receipt / receipt of goods or services / payment>. Recognition is
     independent of governance approval and of cash settlement."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            P2 — CAPEX recognition and classes
QUESTION:               What qualifies as CAPEX and which classes are debited and credited?
RECOMMENDED OPTION:     [RECOMMENDATION] None — no class, code or threshold proposed
ALTERNATIVES:           Debit PP&E vs assets under construction; credit cash vs payable (follows P1)
CONSEQUENCES:           Defines the balance-sheet effect and the depreciation start point.
                        Irreversible once posted.
EXACT RATIFICATION WORDING:
    "A CAPEX transaction is defined as <definition>. Expenditure at or above <threshold> is
     capitalised. On initial recognition the entity debits <asset class> and credits
     <liability or cash class>. Directly attributable costs <are / are not> capitalised."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            P3 — Measurement basis
QUESTION:               Is the capitalised amount VAT-inclusive, and are attributable costs included?
RECOMMENDED OPTION:     [RECOMMENDATION] None — depends on T-01 (specialist)
ALTERNATIVES:           As approved · plus attributable costs · net of recoverable VAT
CONSEQUENCES:           Directly changes the asset's carrying value and all subsequent depreciation.
EXACT RATIFICATION WORDING:
    "The capitalised amount is the approved request amount, <including / excluding> VAT,
     <plus / excluding> directly attributable costs comprising <list>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            P4 — Chart of accounts scope
QUESTION:               Is the CoA tenant-wide, entity-specific, shared canonical, or another model?
RECOMMENDED OPTION:     [RECOMMENDATION] C long-term; A is the only zero-migration path — not a decision
ALTERNATIVES:           A tenant-wide · B entity-specific (blocked by global code uniqueness without a
                        migration) · C shared canonical with entity applicability · D entity dimension
CONSEQUENCES:           Determines whether a migration is required and whether consolidation is
                        natural or requires a mapping layer. Low reversibility once accounts carry
                        immutable entries.
EXACT RATIFICATION WORDING:
    "The BEYU chart of accounts is <tenant-wide / entity-specific / shared canonical with entity
     applicability / other>. Account codes follow <numbering scheme>. Account creation is
     authorised by <role>."
STATUS: PENDING
SIGNATORY: __________          CO-SIGNATORY (Architecture Review Board): __________
DATE: __________

DECISION ID:            P5 — Initial CoA tranche
QUESTION:               Which accounts are established for the first pilot?
RECOMMENDED OPTION:     [PROPOSED — NOT RATIFIED] PP&E and payable for an accrual pilot (2 accounts)
ALTERNATIVES:           Add bank/cash and opening-balance equity if P1 = cash basis or P11 applies
CONSEQUENCES:           No account codes are proposed; an invented placeholder would become permanent
                        policy once entries are immutable.
EXACT RATIFICATION WORDING:
    "The following ledger accounts are established: <code>, <name>, <account_type>,
     <ifrs_category>, applicable to <entity scope>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            P6 — Financial calendar
QUESTION:               What is the fiscal year and period structure, and who opens and closes periods?
RECOMMENDED OPTION:     [RECOMMENDATION] Monthly, aligned to TZ filing; no reopening — not a decision
ALTERNATIVES:           Monthly / quarterly; per entity / group-wide; reopening permitted or prohibited
CONSEQUENCES:           No period-management permission currently exists, so nobody can open a period.
                        A new permission is required.
EXACT RATIFICATION WORDING:
    "BEYU financial periods are <monthly / quarterly>, aligned to a fiscal year ending <date>,
     maintained <per legal entity / group-wide>. <role> may create and open a period. <role> may
     close a period. Reopening a closed period is <prohibited / permitted only with <authority>>."
STATUS: PENDING
SIGNATORY: __________          (Fiscal-year convention also requires Board — see B-04)
DATE: __________

DECISION ID:            P7 — Period-mandatory rule
QUESTION:               Must every posting belong to an open, entity-valid period?
RECOMMENDED OPTION:     [RECOMMENDATION] Yes; reject when absent or closed; transaction date selects
ALTERNATIVES:           Mandatory OPEN · optional · mandatory but any status
CONSEQUENCES:           period_id is NULLABLE today, so entries could evade period close entirely.
EXACT RATIFICATION WORDING:
    "Every journal entry must reference a financial period of the same legal entity in status
     <OPEN>. Postings are rejected where no such period exists. The period is selected by the
     <transaction / posting> date."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            P8 — Maker/checker
QUESTION:               What is the SoD model, and may the CFO post and approve the same entry?
RECOMMENDED OPTION:     [RECOMMENDATION] B or D — not a decision; no permission created
ALTERNATIVES:           A CFO self-approves · B separate roles · C delegated checker · D threshold-based
                        · E governance + accounting approval · F other
CONSEQUENCES:           GROUP_CFO is the only holder of finance:ledger.post, so prohibiting
                        self-approval makes posting impossible without a second authorised human.
                        If a new permission is created it must be excluded from the GROUP_CEO
                        wildcard and added to CONST-AI-001, or the CEO and AI silently gain
                        approval authority.  NEW PERMISSION REQUIRED — POLICY DECISION ONLY.
EXACT RATIFICATION WORDING:
    "Journal posting requires a maker holding <permission> and a checker holding <permission>.
     The same natural person <may / may not> act as both. The Group CFO <may / may not>
     self-approve. Reversing entries <require / do not require> independent approval.
     AI-initiated actions may not act as maker or checker."
STATUS: PENDING
SIGNATORY: __________          (Board co-approval if authority moves outside the CFO)
DATE: __________

DECISION ID:            P9 — Execution authority
QUESTION:               What authority is required to execute a capital transaction?
RECOMMENDED OPTION:     [RECOMMENDATION] E — governance authorization plus a distinct execution
                        capability plus posting approval — not a decision
ALTERNATIVES:           A ledger.post suffices · B separate capability · C governance alone
                        (reject) · D accounting approval alone · E combination
CONSEQUENCES:           Preserves governance authorization ≠ posting authority ≠ execution authority.
                        A new capability is a new constitutional power and requires the Board.
EXACT RATIFICATION WORDING:
    "Capital execution requires <governance authorization> plus <capability>. Governance
     authorization alone does not constitute authority to move funds or post journals."
STATUS: PENDING
SIGNATORY: __________          (Board co-approval if a new capability is created)
DATE: __________

DECISION ID:            P10 — First pilot transaction
QUESTION:               What legitimate business transaction will be the first accounting pilot?
RECOMMENDED OPTION:     [RECOMMENDATION] A or B — not a decision; no request created
ALTERNATIVES:           A new TZS capital request · B an existing legitimate TZS transaction ·
                        C USD-functional-entity transaction · D wait for FX policy
CONSEQUENCES:           Zero TZS capital requests exist. CAP-2025-004 is ineligible. Whether a
                        genuine TZS capital need exists is a business fact known only to the CFO.
EXACT RATIFICATION WORDING:
    "The first accounting pilot is <transaction description> at <legal entity>, denominated in
     <currency>, of type <CAPEX>, in the amount of <amount>, recognised in accordance with P1 and P2."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            P11 — Opening balances
QUESTION:               Are opening balances required, and how are they established?
RECOMMENDED OPTION:     [RECOMMENDATION] C then A — auditor-certified TB via a governed opening
                        journal; migration-only bootstrap rejected — not a decision
ALTERNATIVES:           A opening journal · B legacy import (none exists) · C audited TB ·
                        D migration bootstrap (reject) · E start prospectively at zero
CONSEQUENCES:           Under accrual, the pilot needs no opening cash. Under a cash basis, opening
                        balances are a hard prerequisite. Required in all cases before settlement.
EXACT RATIFICATION WORDING:
    "Opening balances are established by <mechanism> as at <effective date>, evidenced by
     <document>, with the balancing entry to <account>, approved by <authority>."
STATUS: PENDING
SIGNATORY: __________          (External auditor evidence required; Board approval recommended)
DATE: __________

DECISION ID:            CTL — CTL-FIN-002 restatement
QUESTION:               What is the correct effectiveness rating for CTL-FIN-002?
RECOMMENDED OPTION:     [RECOMMENDATION — NOT RATIFIED] Restate automation and effectiveness to
                        reflect that no enforcement mechanism exists
ALTERNATIVES:           Restate now · restate when the posting service ships · leave unchanged (reject)
CONSEQUENCES:           The current rating is an assurance misstatement today and is relied upon by
                        IFRS and SOC2 framework mappings.
EXACT RATIFICATION WORDING:
    "CTL-FIN-002 automation is restated to <value> and effectiveness to <value> until an automated
     maker/checker mechanism is operational and evidenced."
STATUS: PENDING
SIGNATORY: __________          CO-SIGNATORY (Internal Audit): __________
DATE: __________
```

### BOARD RATIFICATIONS

```
DECISION ID:            B-04 — Fiscal-year convention (component of P6)
QUESTION:               What is BEYU's fiscal year end?
RECOMMENDED OPTION:     [RECOMMENDATION] None — jurisdictional and statutory question
ALTERNATIVES:           Calendar year · TZ statutory year · another group convention
CONSEQUENCES:           Drives statutory reporting across MU, AE and TZ, and VAT reconciliation.
EXACT RATIFICATION WORDING:
    "The BEYU Group fiscal year ends on <date>, applicable to <all entities / listed entities>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            EF5 — ENT-FIN-005 treasury policy
QUESTION:               Should the missing board treasury policy be ratified, or the waterfall
                        RESERVE tier's legal basis amended?
RECOMMENDED OPTION:     [RECOMMENDATION] None — the Board must decide whether the reserve floor
                        mandate exists
ALTERNATIVES:           Ratify ENT-FIN-005 · amend the tier's legal_basis · remove the tier
CONSEQUENCES:           A mandatory distribution control currently operates citing a policy that
                        cannot be produced on audit.
EXACT RATIFICATION WORDING:
    "Board treasury policy ENT-FIN-005 is <adopted as attached / confirmed as never adopted, and
     waterfall tier RESERVE legal basis is amended to <basis>>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            C004 — CAP-2025-004 ratification
QUESTION:               Does the Group Board ratify the USD 1,800,000 Health OS capital allocation?
RECOMMENDED OPTION:     [RECOMMENDATION] None — a reserved matter for the Board alone
ALTERNATIVES:           Ratify · decline · re-scope below the threshold
CONSEQUENCES:           Resolution BEYU-IC-2025-021 is TABLED and was approved only at Investment
                        Committee level; ENT-FIN-002 r2 requires Group Board ratification above
                        USD 1,000,000. The request remains ineligible for the accounting pilot
                        regardless of this decision.
EXACT RATIFICATION WORDING:
    "The Group Board <ratifies / declines to ratify> resolution BEYU-IC-2025-021 as a reserved
     matter under ENT-FIN-002."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            B-09 — New capability creation (conditional on P8 and P9)
QUESTION:               Does the Board authorise creating a new finance capability?
RECOMMENDED OPTION:     [RECOMMENDATION] None
ALTERNATIVES:           Authorise · decline · achieve SoD without a new permission
CONSEQUENCES:           A new capability is a new constitutional power. It must be excluded from
                        the GROUP_CEO wildcard and added to CONST-AI-001, or the CEO and AI
                        silently gain the authority.
EXACT RATIFICATION WORDING:
    "The Group Board authorises the creation of <permission>, excluded from the GROUP_CEO
     permission set and denied to AI-initiated actions under CONST-AI-001."
STATUS: PENDING
SIGNATORY: __________
DATE: __________
```

### SPECIALIST RATIFICATIONS

```
DECISION ID:            T-01 — VAT recoverability on capital goods
QUESTION:               Is input VAT on qualifying capital goods recoverable in Tanzania?
RECOMMENDED OPTION:     [RECOMMENDATION] None — a legal determination
ALTERNATIVES:           Fully recoverable · partially recoverable · not recoverable
CONSEQUENCES:           Determines P3 and therefore the capitalised amount of every CAPEX asset.
EXACT RATIFICATION WORDING:
    "Input VAT on qualifying capital goods is <fully / partially / not> recoverable; the
     non-recoverable portion is <capitalised / expensed>."
STATUS: PENDING
SIGNATORY: __________          (Tax Governance Committee reference: __________)
DATE: __________

DECISION ID:            T-02 — Withholding tax
QUESTION:               What WHT applies to supplier payments, including cross-border AE→TZ?
RECOMMENDED OPTION:     [RECOMMENDATION] None
ALTERNATIVES:           Per statute and applicable treaty
CONSEQUENCES:           Affects settlement amounts and creates a tax payable.
EXACT RATIFICATION WORDING:
    "Withholding tax of <rate> applies to <payment class>, remitted under <obligation>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            T-03 — Capital allowances
QUESTION:               What capital allowance applies to qualifying plant under the TZ Third Schedule?
RECOMMENDED OPTION:     [RECOMMENDATION] None — note that resolution BEYU-TGC-2025-031 addresses this
                        for agricultural machinery but is DRAFT and confers no authority
ALTERNATIVES:           Per statute
CONSEQUENCES:           Creates the book/tax difference driving deferred tax (T-04).
EXACT RATIFICATION WORDING:
    "Capital allowances of <rate/method> apply to <asset class> from <event>."
STATUS: PENDING
SIGNATORY: __________          (Ratify BEYU-TGC-2025-031: __________)
DATE: __________

DECISION ID:            T-04 — Deferred tax (IAS 12)
QUESTION:               How is deferred tax recognised on the book/tax difference?
RECOMMENDED OPTION:     [RECOMMENDATION] None
ALTERNATIVES:           Per IAS 12
CONSEQUENCES:           Requires deferred tax accounts that do not exist.
EXACT RATIFICATION WORDING:
    "Deferred tax is recognised on <temporary differences> at <rate>, presented as <classification>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            FX-01 — FX rate source
QUESTION:               What is the authoritative source for the USD/TZS rate?
RECOMMENDED OPTION:     [RECOMMENDATION] None — deliberately not proposed. The three inconsistent
                        seeded treasury rates must not be used
ALTERNATIVES:           Central bank published rate · a named bank's rate · a market data provider
CONSEQUENCES:           Blocks all cross-currency posting, revaluation, consolidation, and testing
                        of USD-denominated ENT-FIN-002 thresholds against non-USD amounts.
EXACT RATIFICATION WORDING:
    "The authoritative FX rate source is <source>, taken at <time> on the <transaction / posting>
     date. Where no rate is available, postings are <rejected / deferred>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________

DECISION ID:            OB-EV — Opening-balance evidence standard (component of P11)
QUESTION:               What evidence is required to establish opening balances?
RECOMMENDED OPTION:     [RECOMMENDATION] Auditor-certified opening trial balance
ALTERNATIVES:           Audited TB · management representation · legacy export (none exists)
CONSEQUENCES:           Establishes the group's entire financial baseline; permanently immutable.
EXACT RATIFICATION WORDING:
    "Opening balances as at <date> are certified by <auditor> per <report reference>."
STATUS: PENDING
SIGNATORY: __________
DATE: __________
```

---

## Scope statement

**[FACT]** Documentation only. No source change, migration, schema change,
permission, CoA record, period record, journal entry, opening balance, treasury
change, capital mutation, governance mutation, new service or new route.
**`finance:ledger.approve` was not created. `CTL-FIN-002` was not modified.
`CAP-2025-004` and its resolution were not altered.** Ledger verified:
**0 accounts, 0 periods, 0 journal entries, 0 journal lines**; capital requests 4;
treasury 5 positions totalling 11,783,000.00.

**NO APPLICATION SEMANTICS CHANGED.**

Related: `CFO_ACCOUNTING_POLICY_DECISION_PACKAGE.md` (5F),
`CFO_ACCOUNTING_POLICY_DECISION_REGISTER.md` (5E),
`CFO_DECISION_WORKSHEET_PHASE_5D.md` (5D),
`CFO_ACCOUNTING_POLICY_DECISIONS.md` (5C),
`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md` (5B).
