# CFO accounting policy decision package

**Status: FORMAL DECISION PACKAGE FOR RATIFICATION. Not an implementation specification.**
Phase 5F · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0` · Baseline commit `12cb357`

This package is prepared for the competent BEYU authority to **ratify accounting
policy before engineering begins**. It consolidates Phases 5B–5E into eleven
policy statements (P1–P11), each with the exact wording required for a decision.

## Governing rule applied throughout

> **Repository evidence is not a CFO decision.
> Recommendations are not decisions.
> Implementation convenience is not accounting authority.**

**No `[RECOMMENDATION]` in this document has been converted into a decision.**
Every implementation-critical item is marked `[CFO DECISION REQUIRED]`,
`[BOARD DECISION REQUIRED]`, `[SPECIALIST DECISION REQUIRED]` or `[DEFERRED]`.

| Label | Meaning |
| --- | --- |
| **[FACT]** | Verified in schema, code, data or DB behaviour. |
| **[BEHAVIOUR]** | How the system behaves today. Descriptive, not authoritative. |
| **[RECOMMENDATION]** | Engineering opinion. **No authority. Never adopted policy.** |
| **[CFO DECISION REQUIRED]** / **[BOARD DECISION REQUIRED]** / **[SPECIALIST DECISION REQUIRED]** / **[DEFERRED]** | Outstanding authority. |

---

## §2 — Reconciliation of prior phases

No settled discovery is repeated. Existing decision IDs are preserved.

| Decision | Current status | Authoritative source | Required authority | Implementation blocker |
| --- | --- | --- | --- | --- |
| **D-01** Accounting basis (IFRS) | **RESOLVED** | `legal_entities.accounting_standard` NOT NULL, 8/8 IFRS; `OBL-IFRS-CONSOL` | — | None |
| **D-02** Functional currency | **RESOLVED** | `functional_currency` NOT NULL; 6 TZS / 2 USD | — | None |
| **D-03** Posting authority | **RESOLVED** | `finance:ledger.post` HIGH_RISK, **GROUP_CFO only** (re-verified this phase); excluded from GROUP_CEO wildcard; `CONST-AI-001 r3` denies AI | — | None |
| **D-04** Correction doctrine | **RESOLVED** | Constitution Art. 5 + migration `0005` (10/10 probes) | — | None |
| **D-05** Accrual basis | **[CFO DECISION REQUIRED]** | None | Group CFO | **Blocks posting** |
| **D-06** CoA scope | **[CFO DECISION REQUIRED]** | None | CFO + Architecture Review Board (Art. 11) | **Blocks CoA** |
| **D-07** CAPEX treatment | **[CFO DECISION REQUIRED]** | None | Group CFO | **Blocks pilot** |
| **D-12** Financial calendar | **[CFO DECISION REQUIRED]** | Partial: schema enforces entity-scoping + non-overlap | CFO; Board for fiscal year | **Blocks periods** |
| **D-13/14** Maker/checker | **[CFO DECISION REQUIRED]** | `CTL-FIN-002` (declarative only) | CFO; Board if authority moves | **Blocks posting service** |
| **D-23** First pilot | **[CFO DECISION REQUIRED]** | None | Group CFO | **Blocks pilot** |
| **OB** Opening balances | **[CFO DECISION REQUIRED]** + **[SPECIALIST]** | None | CFO + external auditor | Conditional (see §11) |
| **FX** | **[BLOCKED — POLICY REQUIRED]** | None | CFO + specialist | Blocks cross-currency |
| **TAX** | **[SPECIALIST DECISION REQUIRED]** | `DOM-TAX-001` governs process only | CFO + Tax Governance Committee | Partial |
| **IC** Intercompany | **[DEFERRED]** | Structural: `legal_entity_id` NOT NULL singular | Group CFO | No |
| **EXEC** Execution semantics | **[CFO DECISION REQUIRED]** | None | CFO; Board if new capability | Blocks execution |
| **RES / ENT-FIN-005** | **[BOARD DECISION REQUIRED]** | Policy confirmed **absent** (count 0) | Group Board | No |
| **CAP-2025-004** | **[BOARD DECISION REQUIRED]** | Resolution status **TABLED** | Group Board | No — excluded from pilot |
| **CTL-FIN-002** | **Assurance misstatement** | Control record | CFO + Internal Audit | No (but urgent) |

---

## §4 — Minimum policy package P1–P11

### P1 — Recognition basis (D-05)

1. **Question.** When a capital request creates an economic obligation before cash settlement, what event triggers recognition?
2. **Existing authoritative evidence.** **[FACT]** IFRS is the basis (schema, 8/8). **[FACT]** No ratified recognition statement exists anywhere.
3. **Resolved.** IFRS applies; corrections are by reversal (Art. 5).
4. **Unresolved.** The recognition event itself.
5. **Authority.** **[CFO DECISION REQUIRED]**
6. **Options.** A payment · B obligation/invoice (accrual) · C control transfer/receipt · D staged.
7. **Accounting consequences.** Determines whether the first entry touches cash and whether a liability class is needed.
8. **Tax/compliance.** VAT tax point is normally the invoice; capital allowances typically begin at use.
9. **Data-model.** **[FACT]** No invoice, PO, goods-receipt or payment-terms concept exists — B and C require an artefact the system cannot currently observe.
10. **Migration.** None.
11. **Historical data.** None — ledger empty.
12. **Reversal/correction.** Entries immutable; a later basis change applies prospectively and breaks comparability.
13. **Security/governance.** Under B, recognition and settlement are separately controllable — stronger SoD.
14. **Implementation dependency.** Blocks P2, P7, and the pilot.
15. **[RECOMMENDATION]** B or C on IFRS merit; A is weak under IAS 16. **Explicitly not selected.**
16. **Exact wording required.** *"BEYU recognises capital expenditure on a `<cash / accrual>` basis. The recognition event is `<named event>`. Recognition is independent of governance approval and of cash settlement."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocking.

### P2 — CAPEX debit/credit classes (D-07)

1. **Question.** What classes are debited and credited at initial CAPEX recognition?
2. **Evidence.** **[FACT]** No mapping exists for any of the 5 request types.
3. **Resolved.** Reversal doctrine (Art. 5 + `0005`); approval thresholds (`ENT-FIN-002`).
4. **Unresolved.** Debit class (PP&E vs assets-under-construction) and credit class (cash vs payable).
5. **Authority.** **[CFO DECISION REQUIRED]**
6. **Options.** Determined by P1; debit class independently open.
7. **Accounting.** Defines the balance-sheet effect.
8. **Tax.** Asset class drives capital-allowance category.
9. **Data-model.** **[FACT]** No asset register exists.
10. **Migration.** None for one posting; required for an asset register.
11. **Historical data.** None.
12. **Reversal.** Wrong treatment becomes permanent history, correctable only by reversal.
13. **Security.** None specific.
14. **Dependency.** Blocks the pilot.
15. **[RECOMMENDATION]** None — no class proposed.
16. **Exact wording.** *"A CAPEX transaction debits `<asset class>` and credits `<liability or cash class>` at initial recognition."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocking.

### P3 — Measurement basis (D-07 items 4, 5, 20)

1. **Question.** Is the capitalised amount the request amount, and does it include VAT and attributable costs?
2. **Evidence.** **[FACT]** `capital_requests` has **no tax flag** — whether USD 640,000 is VAT-inclusive is **[UNKNOWN]**.
3. **Resolved.** Nothing.
4. **Unresolved.** All of it.
5. **Authority.** **[CFO DECISION REQUIRED]** + **[SPECIALIST DECISION REQUIRED]** for VAT recoverability.
6. **Options.** Amount as-is · amount + attributable costs · amount net of recoverable VAT.
7. **Accounting.** Directly changes the capitalised value.
8. **Tax.** TZ VAT recoverability on capital goods is a legal question.
9–14. No migration; no historical data; wrong amount is permanent; blocks the pilot.
15. **[RECOMMENDATION]** None.
16. **Exact wording.** *"The capitalised amount is the approved request amount, `<including / excluding>` VAT, `<plus / excluding>` directly attributable costs."*
17. **Status.** **[CFO DECISION REQUIRED]** + **[SPECIALIST]** — blocking.

### P4 — Chart of accounts scope (D-06)

1. **Question.** Tenant-wide, entity-specific, shared canonical with entity applicability, or another model?
2. **Evidence.** **[FACT]** `ledger_accounts.tenant_id` NOT NULL, **no `legal_entity_id`**; **`code` globally unique**; periods and entries are entity-scoped; 0 accounts.
3. **Resolved.** Account classes (`ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE`).
4. **Unresolved.** Scope, numbering, entity applicability.
5. **Authority.** **[CFO DECISION REQUIRED]** + Architecture Review Board (Art. 11).
6–14. Full option analysis in §6 below.
15. **[RECOMMENDATION]** C long-term; A is the only zero-migration path. **Not selected.**
16. **Exact wording.** *"The BEYU chart of accounts is `<tenant-wide / entity-specific / shared canonical with entity applicability>`, numbered `<scheme>`. Accounts are owned by `<role>`."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocks CoA.

### P5 — First CoA tranche

1. **Question.** Which accounts are established first?
2. **Evidence.** **[FACT]** 0 accounts exist. No CoA in docs, seed or code.
3–4. Nothing resolved; codes, names and IFRS categories all unresolved.
5. **Authority.** **[CFO DECISION REQUIRED]**
6. **Options.** 2 accounts (accrual pilot: asset + payable) or 3–4 (cash pilot adds bank + opening equity).
7–14. Depends entirely on P1 and P4.
15. **[RECOMMENDATION]** **No account codes or names proposed** — deliberately withheld, since an invented placeholder would become permanent policy once entries are immutable.
16. **Exact wording.** *"The following accounts are established: `<code, name, account_type, ifrs_category>` … "*
17. **Status.** **[CFO DECISION REQUIRED]** — blocking.

### P6 — Financial calendar (D-12)

1. **Question.** Fiscal year, period frequency, and who may open a period?
2. **Evidence.** **[FACT]** `financial_periods` exists, 0 rows; **[FACT]** no period-management permission exists in the 47-permission catalogue — **nobody can currently open a period**.
3. **Resolved (schema-enforced).** Periods belong to legal entities; periods may **not** overlap; dates must be ordered (`0005`).
4. **Unresolved.** Fiscal year, frequency, opening/closing authority.
5. **Authority.** **[CFO DECISION REQUIRED]**; **[BOARD DECISION REQUIRED]** for the fiscal-year convention.
6–14. See §8.
15. **[RECOMMENDATION]** Monthly, aligned to TZ filing. **Not selected.**
16. **Exact wording.** *"BEYU financial periods are `<frequency>`, aligned to a fiscal year ending `<date>`. `<role>` may open a period; `<role>` may close a period."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocks periods.

### P7 — Period mandatory on postings

1. **Question.** Must every journal entry belong to an OPEN period?
2. **Evidence.** **[FACT]** `journal_entries.period_id` is **NULLABLE** — the schema permits a journal with no period.
3–4. Unresolved.
5. **Authority.** **[CFO DECISION REQUIRED]**
6. **Options.** Mandatory OPEN period · optional · mandatory but any status.
7. **Accounting.** Determines cut-off integrity.
13. **Security.** A nullable period is a control gap: entries could evade period close.
15. **[RECOMMENDATION]** Mandatory and OPEN. **Not selected.**
16. **Exact wording.** *"Every journal entry must belong to a financial period in status `<OPEN / …>`."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocking.

### P8 — Maker/checker model (D-13/D-14)

1. **Question.** What is the segregation-of-duties model for posting, and may the CFO self-approve?
2. **Evidence.** **[FACT]** `finance:ledger.post` is a single HIGH_RISK permission held by **GROUP_CFO only** (re-verified). **[FACT]** `finance:ledger.approve` **does not exist** and was **not created**. **[FACT]** `approved_by` written by no code path. **[FACT]** No draft/pending/rejected state.
3. **Resolved.** Posting authority is CFO-only; AI is denied posting.
4. **Unresolved.** Everything else.
5. **Authority.** **[CFO DECISION REQUIRED]**; **[BOARD DECISION REQUIRED]** if authority moves outside the CFO.
6–14. See §9.
15. **[RECOMMENDATION]** Options B or D. **Not selected.**
16. **Exact wording.** *"Journal posting requires a maker holding `<permission>` and a checker holding `<permission>`. Self-approval by the same user is `<permitted / prohibited>` `<threshold>`. `<role>` may act as checker."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocks posting service.

### P9 — Permission-model consequences (conditional on P8)

1. **Question.** If P8 creates a permission, how is it constrained?
2. **Evidence.** **[FACT]** The GROUP_CEO wildcard grants **all** permissions except 3 named exclusions — a new permission is **auto-granted to the CEO** unless explicitly excluded. **[FACT]** `CONST-AI-001 r3` denies AI `finance:ledger.post` **by name** — a new permission would **not** be covered.
3–4. Conditional on P8.
5. **Authority.** **[CFO DECISION REQUIRED]** (policy amendment, not a code change).
13. **Security.** **Two silent failure modes:** the role deliberately denied posting would gain approval authority; and AI would be formally able to approve journals.
15. **[RECOMMENDATION]** If any permission is created, exclude it from the CEO wildcard and extend `CONST-AI-001`. **Not selected.**
16. **Exact wording.** *"`<new permission>` is excluded from the GROUP_CEO wildcard and is denied to AI-initiated actions under `CONST-AI-001`."*
17. **Status.** **[CFO DECISION REQUIRED]** — conditional.

### P10 — Pilot transaction (D-23)

1. **Question.** What is the first pilot transaction?
2. **Evidence.** **[FACT]** All 4 capital requests are USD against TZS-functional entities. **[FACT] Confirmed this phase: there are ZERO TZS capital requests** — option A is definitively unavailable. **[FACT]** Only BEYU-FT and BEYU-HLD are USD-functional and both have 0 requests.
3–4. See §10.
5. **Authority.** **[CFO DECISION REQUIRED]**
15. **[RECOMMENDATION]** A new sub-threshold TZS request. **Not created. Not selected.**
16. **Exact wording.** *"The first accounting pilot is a `<amount>` TZS CAPEX transaction at `<entity>`, recognised under P1 and P2."*
17. **Status.** **[CFO DECISION REQUIRED]** — blocks pilot.

### P11 — CTL-FIN-002 restatement

1. **Question.** What is the correct effectiveness rating for `CTL-FIN-002`?
2. **Evidence.** **[FACT]** PREVENTIVE / **AUTOMATED** / **EFFECTIVE**, owner GROUP_CFO, `last_tested_at` 2025-11-30, `evidence_document_id` **null**, over a mechanism that does not exist.
3–4. See §17.
5. **Authority.** **[CFO DECISION REQUIRED]** + Internal Audit (Art. 8 — Internal Audit reports to the Risk & Audit Committee).
15. **[RECOMMENDATION]** Restate to a not-yet-operational rating **regardless of which P8 model is chosen** — the current rating is factually wrong today. **Control not modified in this phase.**
16. **Exact wording.** *"`CTL-FIN-002` effectiveness is restated to `<rating>` until an automated maker/checker mechanism is operational and evidenced."*
17. **Status.** **[CFO DECISION REQUIRED]** — non-blocking but urgent.

---

## §5 — D-05: recognition basis, event by event

**[FACT]** These seven events are distinct. Nothing in the repository requires them to coincide.

| Event | Exists in the system? | Creates an accounting obligation? |
| --- | --- | --- |
| **Economic recognition** | No — no posting service | The question P1 answers |
| **Approval** (governance) | **[FACT]** Yes — `GOVERNANCE_AUTHORIZED` | **[RECOMMENDATION]** Almost certainly not: approving a budget is not incurring a liability |
| **Commitment** | **[FACT]** No commitment/encumbrance concept | **[CFO DECISION REQUIRED]** |
| **Invoice** | **[FACT]** No invoice table | **[CFO DECISION REQUIRED]** — the usual accrual trigger |
| **Receipt of goods/services** | **[FACT]** No goods-receipt concept | **[CFO DECISION REQUIRED]** — the IAS 16 control-transfer point |
| **Payment** | **[FACT]** No payment primitive | **[CFO DECISION REQUIRED]** |
| **Settlement** | **[FACT]** No treasury transaction table | **[CFO DECISION REQUIRED]** |

**If accrual is selected, the exact rule required for implementation is:**

> *"An obligation is recognised when `<invoice received / goods or services received / contract signed>`. At that moment the entity debits `<asset class>` and credits `<payable class>` for `<measurement basis>`. Cash is not affected until settlement, which is a separate posting."*

Without the bracketed terms, engineering cannot proceed without guessing.

> ### Statement on selection bias
> **[FACT]** Under accrual the first CAPEX entry is asset/payable and touches no
> cash, which removes the opening-balance blocker from the pilot. **This is a
> consequence, not a justification.** The recognition basis must be decided on
> accounting merit under IFRS. This document explicitly records the convenience
> so that it cannot later be mistaken for a reason.

---

## §6 — D-06: chart of accounts scope

**[FACT] The schema is internally inconsistent:** accounts are tenant-scoped
while periods and entries are entity-scoped. **[FACT]** `ledger_accounts.code` is
**globally unique**, which forecloses the naive per-entity model.

| Model | Entity isolation | Consolidation | Numbering | Functional currency | Hierarchy fit | Migration |
| --- | --- | --- | --- | --- | --- | --- |
| **A** tenant/group-wide | Weak — rests only on `journal_entries.legal_entity_id` | Easy | Single scheme, no collisions | **Problem** — one "Cash" account shared by USD and TZS entities | Poor above 1 country | **None** |
| **B** entity-specific | Strongest | Hard — needs a mapping layer | **[FACT] Blocked** by global uniqueness unless prefixed | Clean — one account, one currency | Good | **Required** |
| **C** shared canonical + entity applicability | Good | **Strongest** | Master + local applicability | Handled at applicability level | **Best** for trust→holding→country→opco | **Required** |
| **D** account + entity dimension | Good | Good | Single scheme | Dimension-resolved | Good | Required |

**Hierarchy consideration.** **[FACT]** BEYU spans TRUST (MU, USD) → HOLDING
(AE, USD) → COUNTRY_HOLDING (TZ, TZS) → 4 operating entities (TZ, TZS), plus a
root FOUNDATION. Three jurisdictions with different statutory chart requirements,
consolidating under IFRS (`OBL-IFRS-CONSOL`).

**[RECOMMENDATION]** Model **C**. **[CFO DECISION REQUIRED] + Architecture Review
Board.** **No account codes or names are proposed.**

---

## §7 — D-07: CAPEX accounting policy

| Item | Determination |
| --- | --- |
| Recognition trigger | **[CFO DECISION REQUIRED]** — P1 |
| Asset recognition | **[CFO DECISION REQUIRED]** — PP&E vs assets-under-construction |
| Payable/accrual treatment | **[CFO DECISION REQUIRED]** — exists only if P1 selects accrual |
| Cash treatment | **[CFO DECISION REQUIRED]** — at recognition or at settlement |
| Capitalisation criteria | **[CFO DECISION REQUIRED]** — **no threshold invented** |
| Directly attributable costs | **[CFO DECISION REQUIRED]** — freight, installation, professional fees |
| Depreciation dependency | **[CFO DECISION REQUIRED]** — method, useful life, start point. Deferrable past first posting **only if** the CFO accepts an un-depreciated asset, itself a decision and a period-end gap |
| Impairment dependency | **[CFO DECISION REQUIRED]** — IAS 36 |
| Disposal dependency | **[CFO DECISION REQUIRED]** |
| Reversal/correction | **RESOLVED** — Art. 5 + `0005`, verified 10/10 |
| Documentation requirements | **[CFO DECISION REQUIRED]** — **[FACT]** a `documents` table exists but has no linkage to capital or journal records |
| Governance requirements | **RESOLVED** — `ENT-FIN-002` by amount |
| Entity-level applicability | **[CFO DECISION REQUIRED]** — one policy group-wide, or per jurisdiction |

**No PP&E accounts created. No posting logic written.**

---

## §8 — D-12: financial period policy

**Accounting-period policy vs database mechanics — kept separate:**

| Database mechanics — **[FACT] already enforced by `0005`** | Accounting policy — **[CFO DECISION REQUIRED]** |
| --- | --- |
| Periods belong to a legal entity (FK, NOT NULL) | Whether the calendar is group-wide or per entity |
| Periods cannot overlap (`financial_period_no_overlap`) | Fiscal-year definition and period frequency |
| `starts_on < ends_on` (`financial_period_dates_ordered`) | Who may open / close / reopen |
| Statuses exist: `OPEN\|CLOSING\|CLOSED\|LOCKED` | **What those four statuses mean** |
| `closed_by`, `closed_at` columns exist | Late postings, post-close corrections, year-end transition |

| Item | Determination |
| --- | --- |
| Fiscal-year definition | **[BOARD DECISION REQUIRED]** — drives statutory reporting |
| Period structure | **[CFO DECISION REQUIRED]** — **[FACT]** monthly VAT filing suggests monthly, but a filing cadence is not an accounting calendar |
| Who may open | **[CFO DECISION REQUIRED]** — **[FACT] no permission exists; nobody can today** |
| Who may close | **[CFO DECISION REQUIRED]** — `closed_by` unused |
| Reopening permitted? | **[CFO DECISION REQUIRED]** — **[RECOMMENDATION]** prohibit |
| Reopening requires governance approval? | **[CFO DECISION REQUIRED]** — **[RECOMMENDATION]** if permitted at all, it is a reserved matter |
| Late postings | **[CFO DECISION REQUIRED]** |
| Corrections after close | **[CFO DECISION REQUIRED]** — mechanism resolved (reversal); **which period it lands in** is open |
| Year-end transition | **[CFO DECISION REQUIRED]** — retained-earnings roll-forward needs an equity account |
| Entity-specific vs group calendar | **[CFO DECISION REQUIRED]** — **[FACT]** schema is per-entity, so a group calendar must be a convention, not a constraint |

---

## §9 — D-13/D-14: maker/checker

**`finance:ledger.approve` has NOT been added, per instruction.**

| Model | Description | SoD strength | Viability |
| --- | --- | --- | --- |
| **A** CFO posts and self-approves | One human, both roles | **None** — SoD failure under SOC2, which `CTL-FIN-002` itself cites | Works today; contradicts the control |
| **B** Separate finance maker/checker roles | Two roles, two humans | Strong | Requires a new role or permission |
| **C** Delegated checker authority | CFO delegates checking | Moderate — depends on delegate independence | **[FACT]** a `delegations` table exists |
| **D** Threshold-based approval | Dual control above an amount | Pragmatic; standard practice | Requires a threshold decision |
| **E** Governance approval + accounting posting approval | Two different authorities | Strong, but **conflates** governance with accounting control | **[RECOMMENDATION]** avoid — Art. 5 separates them |
| **F** Other | — | — | **[CFO DECISION REQUIRED]** |

| Dimension | Determination |
| --- | --- |
| Self-approval | **[CFO DECISION REQUIRED]** — **[FACT]** GROUP_CFO is the **only** holder; prohibiting it makes posting **impossible** without a second grant |
| Same-user approval | **[CFO DECISION REQUIRED]** — enforceable as `approved_by <> posted_by` |
| Same-role approval | **[CFO DECISION REQUIRED]** — two humans in one role may satisfy SoD |
| Same-entity approval | **[CFO DECISION REQUIRED]** |
| Amount thresholds | **[CFO DECISION REQUIRED]** — **[FACT]** `CTL-FIN-002` says *all* postings, no threshold |
| Emergency corrections | **[CFO DECISION REQUIRED]** — **[RECOMMENDATION]** no break-glass for posting |
| Reversals | **[CFO DECISION REQUIRED]** — a reversal is itself a posting; does it need approval? |
| Delegated authority | **[CFO DECISION REQUIRED]** — `delegations` exists |
| Absence/unavailability | **[CFO DECISION REQUIRED]** — the practical driver for delegation |
| AI / Noelia restrictions | **RESOLVED for posting** (`CONST-AI-001 r3`); **[CFO DECISION REQUIRED]** for any new permission (P9) |
| Audit evidence | **RESOLVED** — kernel provides `recordAuditTx()` / `publishEventTx()` |
| Permission model | **[CFO DECISION REQUIRED]** |
| Interaction with `finance:ledger.post` | **[CFO DECISION REQUIRED]** — **[FACT]** as a single permission it can only mean "do everything", which is **logically incompatible** with maker/checker |

**Required final determination:** whether CFO-only posting authority **remains
sufficient**, or whether another role structure is required. **[CFO DECISION
REQUIRED]**, escalating to **[BOARD DECISION REQUIRED]** if authority moves
outside the CFO. **No permissions changed in this phase.**

---

## §10 — D-23: first pilot

**Pilot constraints (all mandatory):** single legal entity · single functional
currency · single request type · single treatment · no intercompany · no FX ·
no tax complexity beyond an explicit decision · no treasury movement · fully
governed · fully auditable · reversal-only correction.

| Option | Determination |
| --- | --- |
| **A** Use an existing legitimate TZS capital request | **[FACT] NOT AVAILABLE — definitively.** Verified this phase: **zero** TZS capital requests exist; all 4 are USD |
| **B** Create a new TZS request | **[RECOMMENDATION]** the only clean path. `fx_rate = 1` becomes arithmetically **correct**, not a placeholder. **[CFO DECISION REQUIRED]** — **not created in this phase** |
| **C** Convert an existing request | **[RECOMMENDATION] Reject.** Converting a USD request to TZS would mutate governed capital data, require an FX rate (blocked), and falsify an approved record |
| **D** Wait for FX policy | Viable and safe, but unnecessary if B is chosen |

> **[FACT] Anti-fabrication statement.** A pilot request must represent a **real
> business transaction** authorised through `ENT-FIN-002`. It must not be invented
> to make a test pass. Whether a genuine TZS capital need exists at BEYU-AGR (or
> another TZS entity) is **[UNKNOWN]** to engineering and is
> **[CFO DECISION REQUIRED]**. **No request was created.**

---

## §11 — Opening balances

**Re-evaluated after P1, as instructed.**

**[FACT]** Under accrual (P1 option B), the first CAPEX entry debits an asset and
credits a payable. **Neither line touches cash.** Both accounts legitimately
start at zero because the transaction creates both balances.

**Consequence, documented:** if — and only if — the CFO selects accrual on
accounting merit, **opening cash is not required for the pilot's initial
recognition**. This is a downstream consequence of P1, **not a reason to select
it** (§5).

**Opening balances remain required for:** any cash-crediting entry, settlement of
the payable, and any meaningful trial balance or financial statement.

**If opening balances are required, the policy decision needed is:**

| Element | Authority |
| --- | --- |
| Mechanism (auditor-certified TB → governed opening journal) | **[CFO DECISION REQUIRED]** |
| Source evidence standard | **[SPECIALIST DECISION REQUIRED]** — external auditor |
| Effective date | **[CFO DECISION REQUIRED]** |
| Balancing account | **[CFO DECISION REQUIRED]** — **not invented here** |
| Approving authority | **[BOARD DECISION REQUIRED]** — **[RECOMMENDATION]** it establishes the group's entire financial baseline |
| Maker/checker on the opening entry | **[CFO DECISION REQUIRED]** — **[RECOMMENDATION]** dual control matters most here |

**[RECOMMENDATION]** A migration-only bootstrap must be **rejected**: it bypasses
maker/checker and audit provenance and manufactures financial data.
**No opening balance created.**

---

## §12 — FX

**[FACT] No rate is derived from seeded treasury data.** The snapshot implies
three mutually inconsistent USD/TZS rates:

| Entity | TZS balance | USD base | Implied rate |
| --- | --- | --- | --- |
| BEYU-AGR | 980,000,000.00 | 375,000.00 | **2,613.3333** |
| BEYU-HEA | 2,870,000,000.00 | 1,098,000.00 | **2,613.8434** |
| BEYU-TZH | 6,120,000,000.00 | 2,340,000.00 | **2,615.3846** |

Not usable as a rate source: they **disagree with each other**; they are seed
data; they are quotients of rounded balances with no provider or timestamp;
they carry no effective date (IAS 21 requires the transaction-date rate);
`base_currency_balance` never names its base currency; and Art. 4 requires
material decisions to record "on which data".

| Item | Status |
| --- | --- |
| Transaction-date FX | **[CFO DECISION REQUIRED]** |
| Reporting-date FX | **[CFO DECISION REQUIRED]** |
| Revaluation | **[CFO DECISION REQUIRED]** |
| Realised vs unrealised | **[CFO DECISION REQUIRED]** — different TZ tax treatment |
| Rate source | **[CFO DECISION REQUIRED]** — **none proposed** |
| Rate authority | **[CFO DECISION REQUIRED]** — **[RECOMMENDATION]** never client-supplied |
| Rounding | **[CFO DECISION REQUIRED]** — **[FACT]** TZS has no minor unit in practice; USD has 2 dp |
| Base/reporting currency | **[CFO DECISION REQUIRED]** — **[FACT]** no reporting-currency column exists |

**General FX: `[BLOCKED — POLICY REQUIRED]`.**
A no-FX pilot may proceed **only** if genuinely single-functional-currency —
i.e. a TZS transaction at a TZS-functional entity, where no conversion occurs.

---

## §13 — Tax / specialist items

**Three layers kept separate:**

| Layer | State |
| --- | --- |
| **1. Accounting recognition** | **[FACT]** absent |
| **2. Tax treatment** | **[FACT]** `DOM-TAX-001` governs *process* (statutory basis, documentation, position paper, Tax Governance Committee for uncertain positions) — not treatments |
| **3. Statutory filing** | **[FACT]** `OBL-TZ-VAT`, `OBL-TZ-PAYE` — filing obligations only |

| Item | Status |
| --- | --- |
| VAT treatment / recoverability on capital goods | **[SPECIALIST DECISION REQUIRED]** + Tax Governance Committee |
| Withholding tax (incl. cross-border AE→TZ) | **[SPECIALIST DECISION REQUIRED]** |
| Capital allowances (TZ Third Schedule) | **[SPECIALIST DECISION REQUIRED]** |
| Deferred tax (IAS 12) | **[SPECIALIST DECISION REQUIRED]** — **[FACT]** IAS 12 appears once, as a tax-strategy annotation, not policy |
| Tax-account mappings | **[CFO DECISION REQUIRED]** after the above |
| VAT-inclusive vs exclusive request amounts | **[CFO DECISION REQUIRED]** — P3 |

**Nothing invented.**

---

## §14 — Intercompany

**`[DEFERRED]`**, recorded with reasons:

1. **[FACT]** No finance-table counterparty model exists — an exhaustive column
   scan found the only `counterparty` column in the database is
   `legal_matters.counterparty` (litigation, unrelated).
2. **[FACT]** `journal_entries.legal_entity_id` is **NOT NULL and singular**, and
   `journal_lines` carries no entity — a cross-entity transaction **cannot** be
   expressed as one journal entry.
3. Reciprocal entries would require additional policy (equity injection vs loan)
   and architecture (paired entries, atomicity across two entities).
4. Elimination (`OBL-IFRS-CONSOL`) and FX both remain unresolved.

**Caveat retained:** if CAPEX at an operating company is *parent-funded*, the
complete transaction **is** intercompany and a single-entity posting captures
only half. The pilot is accounting-complete only if **self-funded** —
**[CFO DECISION REQUIRED]**. **Not implemented.**

---

## §15 — ENT-FIN-005

| Item | Finding |
| --- | --- |
| **Referenced where** | **[FACT]** `waterfall_tiers` sequence 4 (`RESERVE`, "Mandatory reserve floor (90 days)", `THRESHOLD_TOPUP`), `legal_basis` = *"Board treasury policy ENT-FIN-005"* |
| **Exists?** | **[FACT] No** — verified again this phase: `select count(*) from policies where code='ENT-FIN-005'` → **0**. The register holds only `CONST-AI-001`, `DOM-TAX-001`, `ENT-FIN-002`, `ENT-FIN-003`, `ENT-SEC-004` |
| **Dependent behaviour** | The waterfall RESERVE tier claims a legal basis that cannot be produced on audit; any RESERVE-type capital treatment would inherit the gap |
| **Why it matters** | A mandatory reserve floor is a **treasury policy with board authority**. Its absence means a distribution control is operating without a documented mandate |
| **Who must authorize** | **[BOARD DECISION REQUIRED]** — ratify the policy, or amend the waterfall tier's legal basis |
| **Blocks the first pilot?** | **No** — a CAPEX pilot does not touch the RESERVE tier |

**Not recreated.**

---

## §16 — CAP-2025-004

**[FACT] Governance chain verified this phase and it is NOT satisfied:**

- Resolution `BEYU-IC-2025-021`, body **Investment Committee** (COMMITTEE).
- **Resolution status: `TABLED`** — not APPROVED.
- Consequences text: *"Requires Group Board ratification as a reserved matter above USD 1,000,000."*
- **[FACT]** `ENT-FIN-002 r2`: ≥ USD 1,000,000 → Group Board reserved matter.
- Amount: USD 1,800,000 — above the threshold.

**Two independent failures:** the resolution is not approved (TABLED), **and**
even if approved, Investment Committee approval is **insufficient** where Group
Board ratification is required.

**Rule preserved and restated:** *Investment Committee approval is insufficient
where Group Board ratification is required.*

**Determination: `CAP-2025-004` is EXCLUDED from the first pilot.**
**[BOARD DECISION REQUIRED]** to ratify. **No governance weakening or bypass was
performed to make an accounting pilot executable.**

---

## §17 — CTL-FIN-002

**[FACT] Current recorded state:**

| Field | Value |
| --- | --- |
| Title | Maker/checker on all journal postings |
| `control_type` | PREVENTIVE |
| `automation` | **AUTOMATED** |
| `effectiveness` | **EFFECTIVE** |
| `owner_role` | GROUP_CFO |
| `last_tested_at` | 2025-11-30 |
| `evidence_document_id` | **null** |
| Frameworks | IFRS, SOC2 |

**[FACT] Contradicting reality:** no posting service exists · no checker
mechanism exists · `approved_by` is written by no code path · zero journal
entries have ever existed · no evidence document is attached.

> **The control asserts an AUTOMATED, EFFECTIVE, PREVENTIVE control over a
> mechanism that does not exist, and records a test date for a control that could
> not have been tested.** The rating is **unsubstantiated** and must not be relied
> upon in assurance or audit reporting.

**[RECOMMENDATION] Proposed corrected status — for the control owner (GROUP_CFO)
and Internal Audit (Art. 8):**

| Field | Current | Proposed **[RECOMMENDATION]** |
| --- | --- | --- |
| `automation` | AUTOMATED | `MANUAL` or `NOT_IMPLEMENTED` |
| `effectiveness` | EFFECTIVE | `NOT_EFFECTIVE` / `NOT_TESTED` |
| `evidence_document_id` | null | Reference to this package pending implementation |
| Title/description | unchanged | Note: *"Design documented; enforcement pending posting service."* |

**The control was NOT modified in this phase** — no authoritative instruction
authorised the change. **[CFO DECISION REQUIRED]** + Internal Audit.

---

## §18 — Decision matrix

| ID | Decision | Current status | Authority | Blocks CoA? | Blocks periods? | Blocks posting? | Blocks pilot? | Specialist? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | Accounting basis (IFRS) | **RESOLVED** | — | No | No | No | No | No |
| D-02 | Functional currency | **RESOLVED** | — | No | No | No | No | No |
| D-03 | Posting authority (CFO-only) | **RESOLVED** | — | No | No | No | No | No |
| D-04 | Correction by reversal | **RESOLVED** | — | No | No | No | No | No |
| P1/D-05 | Recognition basis | **CFO DECISION REQUIRED** | CFO | No | No | **YES** | **YES** | No |
| P2/D-07 | CAPEX debit/credit | **CFO DECISION REQUIRED** | CFO | No | No | **YES** | **YES** | No |
| P3 | Measurement basis | **CFO DECISION REQUIRED** | CFO + specialist | No | No | **YES** | **YES** | **Yes** (VAT) |
| P4/D-06 | CoA scope | **CFO DECISION REQUIRED** | CFO + ARB | **YES** | No | **YES** | **YES** | No |
| P5 | First CoA tranche | **CFO DECISION REQUIRED** | CFO | **YES** | No | **YES** | **YES** | No |
| P6/D-12 | Financial calendar | **CFO DECISION REQUIRED** | CFO; Board (fiscal year) | No | **YES** | **YES** | **YES** | No |
| P7 | Period mandatory | **CFO DECISION REQUIRED** | CFO | No | **YES** | **YES** | **YES** | No |
| P8/D-13/14 | Maker/checker | **CFO DECISION REQUIRED** | CFO; Board if authority moves | No | No | **YES** | **YES** | No |
| P9 | Permission constraints | **CFO DECISION REQUIRED** (conditional) | CFO | No | No | **YES** | **YES** | No |
| P10/D-23 | Pilot transaction | **CFO DECISION REQUIRED** | CFO | No | No | No | **YES** | No |
| P11 | CTL-FIN-002 restatement | **CFO DECISION REQUIRED** | CFO + Internal Audit | No | No | No | No | No |
| OB | Opening balances | **CFO DECISION REQUIRED** | CFO + auditor (poss. Board) | No | No | No | Conditional | **Yes** |
| FX | FX policy | **BLOCKED** | CFO + specialist | No | No | No | No (TZS pilot) | **Yes** |
| TAX | Tax treatments | **SPECIALIST DECISION REQUIRED** | CFO + TGC + specialist | No | No | No | Partial | **Yes** |
| IC | Intercompany | **DEFERRED** | CFO | No | No | No | No | No |
| EXEC | Execution semantics | **CFO DECISION REQUIRED** | CFO; Board if new capability | No | No | No | No | No |
| RES | Reserve treatment | **BOARD DECISION REQUIRED** | Board | No | No | No | No | No |
| ENT-FIN-005 | Missing treasury policy | **BOARD DECISION REQUIRED** | Board | No | No | No | No | No |
| CAP-2025-004 | Board ratification | **BOARD DECISION REQUIRED** | Board | No | No | No | No (excluded) | No |

**Totals: 4 RESOLVED · 12 CFO DECISION REQUIRED · 3 BOARD DECISION REQUIRED ·
3 SPECIALIST DECISION REQUIRED · 1 DEFERRED · 1 BLOCKED.**

---

## §19 — Implementation readiness gate

| # | Implementation-critical item | Authoritative? | Evidence |
| --- | --- | --- | --- |
| 1 | Accounting basis | **YES** | IFRS, schema-enforced, 8/8 entities |
| 2 | Functional currency | **YES** | Per-entity, NOT NULL |
| 2b | Reporting currency | **NO** | No column, no policy |
| 3 | CoA scope | **NO** | P4 pending |
| 4 | First CoA tranche | **NO** | P5 pending; 0 accounts |
| 5 | CAPEX recognition/treatment | **NO** | P2 pending |
| 6 | Accrual treatment | **NO** | P1 pending |
| 7 | Financial calendar | **NO** | P6 pending |
| 8 | Period open/close authority | **NO** | P6 pending; **no permission exists** |
| 9 | Maker/checker model | **NO** | P8 pending |
| 10 | Opening-balance policy | **NO** (conditional) | OB pending |
| 11 | First pilot transaction | **NO** | P10 pending; **zero TZS requests exist** |
| 12 | Execution authority | **NO** | EXEC pending |
| 13 | Tax treatment for the pilot | **NO** | P3 / TAX pending |
| 14 | FX policy (if cross-currency) | **BLOCKED** | Not required for a TZS pilot |

**2 of 14 authoritative. Engineering may not begin.**

---

## Scope statement

**[FACT]** Documentation only. No application source change, migration, CoA row,
posting service, period service, capital-execution route, new finance permission,
journal entry, treasury movement, fabricated capital request or fabricated
opening balance. **`finance:ledger.approve` was NOT created.** `CTL-FIN-002` was
**not modified**. Ledger verified: **0 accounts, 0 periods, 0 entries, 0 lines**;
capital 4; treasury 5 totalling 11,783,000.00.

Related: `CFO_ACCOUNTING_POLICY_DECISION_REGISTER.md` (5E),
`CFO_DECISION_WORKSHEET_PHASE_5D.md` (5D),
`CFO_ACCOUNTING_POLICY_DECISIONS.md` (5C),
`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md` (5B).
