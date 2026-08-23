# CFO decision worksheet — Phase 5D

**Status: DECISION DOCUMENT FOR THE COMPETENT AUTHORITY. Not an implementation specification.**
Phase 5D · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0` · Baseline commit `515b644`

This worksheet takes the Phase 5C register
(`docs/finance/CFO_ACCOUNTING_POLICY_DECISIONS.md`) and works each open gate up
to the point of decision — options laid out, consequences traced, evidence
cited. **It selects nothing.** A `[RECOMMENDATION]` in this document is
engineering opinion and **must never be treated as adopted policy**, no matter
how strongly reasoned.

Authority: Constitution **Art. 5** (Group CFO under board delegated authority);
reserved matters escalate under **Art. 4**.

## Labels

| Label | Meaning |
| --- | --- |
| **[FACT]** | Verified in schema, code, data or DB behaviour. |
| **[BEHAVIOUR]** | How the system behaves today. Descriptive, not authoritative. |
| **[EXISTING AUTHORITY]** | Already ratified: constitution, active policy, registered control. |
| **[RECOMMENDATION]** | Engineering opinion. **No authority.** |
| **[CFO DECISION]** / **[BOARD DECISION]** / **[SPECIALIST]** | Required authority. |
| **[UNKNOWN]** | Not determinable from the repository. |

---

## §3 — Master decision table

| ID | Question | Current Evidence | Proposed Options | Recommended Option | Authority | Blocking? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **D-05** | Accrual vs cash recognition | **[FACT]** never stated; IFRS implies accrual but inference ≠ policy | A immediate cash · B payable then settlement · C recognise on acquisition · D other | **[RECOMMENDATION]** B or C (IFRS-consistent); **not selected** | CFO | **YES** | CFO DECISION REQUIRED |
| **D-06** | CoA scope | **[FACT]** `ledger_accounts` has `tenant_id`, **no `legal_entity_id`**; periods + entries are entity-scoped | A tenant-wide · B entity-specific · C group master + entity mapping · D other | **[RECOMMENDATION]** C; **not selected** | CFO + Architecture | **YES** | CFO DECISION REQUIRED |
| **D-07** | CAPEX treatment | **[FACT]** no debit/credit mapping exists | see §6 (20 dimensions) | none — 20 sub-decisions | CFO | **YES** | CFO DECISION REQUIRED |
| **D-12** | Financial calendar | **[FACT]** table exists, 0 rows, 4 statuses undefined | see §7 | **[RECOMMENDATION]** monthly, no reopen; **not selected** | CFO (Board for fiscal year) | **YES** | CFO DECISION REQUIRED |
| **D-13/14** | Maker/checker + meaning of `finance:ledger.post` | **[FACT]** single permission, CFO-only; `approved_by` never written | Model A/B/C/D (§8) | **[RECOMMENDATION]** A; **not selected** | CFO (Board if new capability) | **YES** | CFO DECISION REQUIRED |
| **D-22** | Opening balances *(new)* | **[FACT]** ledger empty; a cash credit presupposes cash | A opening journal · B import · C audited TB · D migration bootstrap · E other | **[RECOMMENDATION]** C then A; **not selected** | CFO + external auditor | **YES** | CFO + SPECIALIST |
| **D-15** | FX policy | **[FACT]** `fx_rate` default `1`; **[FACT] seeded treasury implies 3 different USD/TZS rates** (2613.33 / 2613.84 / 2615.38) | see §10 | **[RECOMMENDATION]** refuse to post without a rate; **not selected** | CFO | **YES** for cross-currency | **BLOCKED** |
| **D-23** | Pilot currency strategy *(new)* | **[FACT]** 4/4 requests USD vs TZS entities; **[FACT]** only BEYU-FT and BEYU-HLD are USD-functional, and both have **0 capital requests** | A new TZS request · B resolve FX first · C use USD entity · D other | **[RECOMMENDATION]** A; **not selected** | CFO | **YES** | CFO DECISION REQUIRED |
| **D-17** | Intercompany | **[FACT]** no intercompany accounts; **[FACT]** `journal_entries.legal_entity_id` is NOT NULL and singular | prohibit cross-entity in pilot vs define now | **[RECOMMENDATION]** prohibit in pilot | CFO | No (deferrable) | **DEFERRED — OUTSIDE FIRST PILOT** |
| **D-18** | Tax / VAT on CAPEX | **[FACT]** VAT/PAYE are *filing* obligations only | see §12 | none | CFO + Tax Governance Committee + specialist | Partly | CFO + SPECIALIST |
| **D-19** | Execution semantics | **[FACT]** gate stops at `GOVERNANCE_AUTHORIZED`, no financial side effects | see §13 | **[RECOMMENDATION]** Interpretation 1; **not selected** | CFO (Board if new capability) | **YES** for execution | CFO DECISION REQUIRED |
| **D-11/20** | RESERVE + missing `ENT-FIN-005` | **[FACT]** policy absent (count 0) | ratify or amend waterfall | none | Board | No (outside pilot) | **BOARD DECISION REQUIRED** |
| **D-21** | `CAP-2025-004` ratification | **[FACT]** USD 1.8m, IC resolution requires Board ratification, not obtained | ratify / decline / re-scope | none | Board | That request only | **BOARD DECISION REQUIRED** |

---

## §4 — D-05: accrual policy

### The three concepts that must not be conflated

| Concept | Question it answers | Authority | Current state |
| --- | --- | --- | --- |
| **Governance authorization** | *May this be done?* | Governance bodies (Art. 4) | **[FACT]** implemented |
| **Accounting recognition** | *When does this enter the books, and as what?* | Group CFO (Art. 5) | **[FACT]** undefined |
| **Cash settlement** | *When does money actually move?* | Treasury | **[FACT]** unimplemented |

**[FACT]** These are three different events with three different authorities and
three different timestamps. Nothing in the repository requires them to coincide,
and **[BEHAVIOUR]** the governance gate explicitly performs no financial action.

### Options for CAPEX

**Option A — immediate cash transaction** (recognise asset and pay simultaneously)

| Dimension | Consequence |
| --- | --- |
| Recognition event | Payment |
| Debit / credit | PP&E / cash-bank |
| Cash effect | Immediate |
| Liability effect | None |
| Reversal | Single reversing entry |
| Supporting evidence | Payment confirmation |
| IFRS rationale | **Weak.** IAS 16 recognises on control transfer, not on payment. Acceptable only where they coincide |
| Tax | Capital allowance timing may diverge from payment |
| Capital approval interaction | Approval → immediate posting; collapses two events |
| Funding interaction | Requires cash to exist first (**D-22**) |
| Settlement interaction | None — settlement *is* recognition |

**Option B — payable/accrual first, then settlement** (two-stage)

| Dimension | Consequence |
| --- | --- |
| Recognition event | Obligation arises (invoice/delivery) |
| Debit / credit | Stage 1: PP&E / payable. Stage 2: payable / cash |
| Cash effect | Deferred to stage 2 |
| Liability effect | Payable recognised |
| Reversal | Two entries, each reversible independently |
| Supporting evidence | Invoice or contract, then payment |
| IFRS rationale | **Strongest.** Matches accrual accounting and IAS 16 |
| Tax | VAT tax point usually at invoice, not payment |
| Capital approval | Approval precedes obligation |
| Funding | Recognition possible **before** cash exists — partially relieves D-22 |
| Settlement | Distinct, separately auditable event |

**Option C — recognise only when acquired** (control transfer)

| Dimension | Consequence |
| --- | --- |
| Recognition event | Asset received/commissioned |
| Debit / credit | PP&E / cash **or** payable, depending on payment timing |
| Cash effect | Independent |
| Liability effect | Only if unpaid at receipt |
| Reversal | Single entry |
| Supporting evidence | Goods-receipt / commissioning certificate |
| IFRS rationale | **Technically most correct** for IAS 16 |
| Tax | Capital allowances typically begin at use |
| Capital approval | Approval well before recognition |
| Funding | Recognition may lag funding |
| Settlement | Fully decoupled |

**Option D — another treatment** (e.g. staged/percentage-of-completion for
construction, IFRIC-style). **[UNKNOWN]** whether BEYU has multi-period
construction capex.

### Structural obstacles common to B and C

- **[FACT]** There is **no invoice, purchase-order, goods-receipt or commissioning
  concept** anywhere in the schema. Options B and C require an event the system
  cannot currently observe.
- **[FACT]** `capital_requests` has no delivery, milestone or payment-terms field.

**Determination: `CFO DECISION REQUIRED`.** No authoritative evidence resolves
D-05. **[RECOMMENDATION]** B or C are IFRS-consistent and A is weak — but the
choice, and the triggering artefact that would make B or C observable, are the
CFO's.

---

## §5 — D-06: chart of accounts scope

**[FACT] The schema is internally inconsistent on this point:**

| Table | Scoping |
| --- | --- |
| `ledger_accounts` | `tenant_id` NOT NULL · **no `legal_entity_id`** |
| `financial_periods` | `legal_entity_id` NOT NULL |
| `journal_entries` | `tenant_id` **and** `legal_entity_id`, both NOT NULL |

So accounts are tenant-scoped while everything that uses them is entity-scoped.
**[FACT]** `ledger_accounts.code` is globally unique, which forecloses the naive
form of Option B (two entities cannot both hold code `1000`).

### Options

**A — tenant-wide shared CoA** (accounts belong to the tenant; entity comes from the entry)

- Entity isolation: **weak** — no account-level entity boundary; isolation rests entirely on `journal_entries.legal_entity_id`
- Consolidation: **easy** — one account set aggregates naturally
- Numbering: single scheme; no collisions
- Functional currency: **problem** — one "Cash" account is used by USD and TZS entities; currency lives on the entry, not the account
- Intercompany: needs an explicit counterparty dimension that does not exist
- Audit: simple
- Permissions: simple; tenant scoping already enforced
- Migrations: **none** — matches the schema as built
- Multi-country: strains as jurisdictions add statutory accounts

**B — legal-entity-specific CoA**

- Isolation: **strongest**
- Consolidation: **hard** — requires a mapping layer that does not exist
- Numbering: per-entity; **[FACT]** blocked by the global unique constraint on `code` unless codes are prefixed or the constraint changes (**a migration**)
- Currency: clean — each account belongs to one functional currency
- Migrations: **required**
- Multi-country: natural fit for statutory charts

**C — group master CoA + entity mappings**

- Isolation: good — master defines semantics, mapping controls entity use
- Consolidation: **strongest** — the master *is* the consolidation view
- Numbering: master scheme + local mapping
- Currency: handled at mapping level
- Intercompany: mapping can carry a counterparty dimension
- Migrations: **required** (a mapping table)
- Multi-country: **best** — IFRS master, statutory local charts
- Cost: most complex; heaviest for a first pilot

**D — another model** (e.g. account + dimensions, where entity is a posting
dimension rather than an account attribute). **[UNKNOWN]**.

**[RECOMMENDATION] — CFO/ARCHITECTURE DECISION REQUIRED.** Option **C** is the
safest long-term fit for a 5-level, multi-jurisdiction, IFRS-consolidating group
with an active `OBL-IFRS-CONSOL` obligation. Option **A** is the only one
requiring **no migration** and is therefore the cheapest pilot, at the cost of
rework once consolidation matters. **Not selected.**

### Minimum CoA tranche for the first pilot

**No account numbers assigned** (D-06 unresolved). Classes only:

| # | Purpose | Class | Needed because |
| --- | --- | --- | --- |
| 1 | Bank/cash | ASSET | Credit side of a paid CAPEX, and the opening-balance target |
| 2 | PP&E (or assets under construction) | ASSET | Debit side of CAPEX |
| 3 | Opening-balance equity / suspense | EQUITY | **Only** if D-22 chooses an opening journal — a balanced first entry needs a counterpart |
| 4 | Trade/capital payable | LIABILITY | **Only** if D-05 chooses Option B |

**Two to four accounts.** Every one of them is **CFO DECISION REQUIRED** for
code, name and `ifrs_category`.

---

## §6 — D-07: CAPEX treatment (20 dimensions)

Single entity, single currency. **No numbers, thresholds or codes invented.**

| # | What policy must specify | Status |
| --- | --- | --- |
| 1 | What constitutes CAPEX | **CFO DECISION REQUIRED** — **[FACT]** `request_type='CAPEX'` is a *requester's* label; no definition binds it to IAS 16 |
| 2 | Recognition threshold | **CFO DECISION REQUIRED** — capitalise vs expense below a limit. **[FACT]** no threshold exists |
| 3 | Asset class | **CFO DECISION REQUIRED** — **[FACT]** no asset register exists in the schema |
| 4 | Initial measurement | **CFO DECISION REQUIRED** — cost per IAS 16.16 |
| 5 | Directly attributable costs | **CFO DECISION REQUIRED** — freight, installation, professional fees |
| 6 | Prepayment treatment | **CFO DECISION REQUIRED** |
| 7 | Accrual treatment | **CFO DECISION REQUIRED** — flows from D-05 |
| 8 | Payable treatment | **CFO DECISION REQUIRED** — flows from D-05 |
| 9 | Cash settlement | **CFO DECISION REQUIRED** — **[FACT]** no treasury transaction primitive exists |
| 10 | Capitalisation point | **CFO DECISION REQUIRED** |
| 11 | Depreciation start | **CFO DECISION REQUIRED** — IAS 16: when available for use |
| 12 | Useful life authority | **CFO DECISION REQUIRED** — who sets and who reviews |
| 13 | Residual value | **CFO DECISION REQUIRED** |
| 14 | Impairment | **CFO DECISION REQUIRED** — IAS 36 trigger and testing |
| 15 | Disposal | **CFO DECISION REQUIRED** |
| 16 | Reversal/correction | **[EXISTING AUTHORITY] RESOLVED** — Art. 5 reversal only, enforced by migration `0005` |
| 17 | Supporting documents | **CFO DECISION REQUIRED** — **[FACT]** a `documents` table exists but no linkage from capital or journal |
| 18 | Governance approval | **[EXISTING AUTHORITY] RESOLVED** — ENT-FIN-002 by amount |
| 19 | Tax treatment | **CFO DECISION REQUIRED** + specialist (§12) |
| 20 | VAT treatment | **CFO DECISION REQUIRED** + specialist (§12) |

### Minimum CFO decision to make ONE CAPEX posting mechanically implementable

Items 1–15 and 17–20 govern the full asset lifecycle. **A single initial
recognition posting** needs far less. The minimum is:

1. **The recognition event** (D-05) — what fact triggers the entry.
2. **The debit class** — PP&E or assets under construction.
3. **The credit class** — cash/bank or payable (follows from 1).
4. **Whether the full request amount is the measurement basis**, or whether
   attributable costs/VAT adjust it (items 4, 5, 20).
5. **The two-to-four accounts** from §5, with codes and IFRS categories.

Deferrable past the first posting: depreciation, useful life, residual,
impairment, disposal (items 11–15) — **provided** the CFO accepts that the
asset sits un-depreciated until those decisions exist, which is itself
**CFO DECISION REQUIRED** and would be a reportable gap at period end.

---

## §7 — D-12: financial calendar

| # | Item | Determination |
| --- | --- | --- |
| 1 | Fiscal year | **CFO DECISION REQUIRED** (**[RECOMMENDATION]** Board-level, since it affects statutory reporting) — **[FACT]** unknown; TZ statutory year may differ from the group's |
| 2 | Period frequency | **CFO DECISION REQUIRED** — **[FACT]** monthly VAT filing (`OBL-TZ-VAT`) *suggests* monthly, but a filing cadence is not an accounting calendar |
| 3 | Opening authority | **CFO DECISION REQUIRED** — **[FACT]** no period-management permission exists in the 47-permission catalogue; granting one is a permission change requiring explicit authority |
| 4 | Closing authority | **CFO DECISION REQUIRED** — **[FACT]** `closed_by` column exists, unused |
| 5 | Reopening authority | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** prohibit; reopening a closed period is the classic audit red flag |
| 6 | Period locking | **CFO DECISION REQUIRED** — **[FACT]** `OPEN\|CLOSING\|CLOSED\|LOCKED` exist with **no defined semantics**; the difference between CLOSED and LOCKED must be stated |
| 7 | Backdated posting | **CFO DECISION REQUIRED** — into an OPEN prior period? |
| 8 | Adjusting entries | **CFO DECISION REQUIRED** — permitted during `CLOSING`? That is a plausible purpose for the status |
| 9 | Year-end close | **CFO DECISION REQUIRED** — retained-earnings roll-forward; needs an equity account |
| 10 | Audit lock | **CFO DECISION REQUIRED** — plausibly the purpose of `LOCKED` |
| 11 | Post-close corrections | **CFO DECISION REQUIRED** — **[EXISTING AUTHORITY]** must be a reversal; the open question is *which period it lands in* |
| 12 | Reversal treatment | **[EXISTING AUTHORITY] RESOLVED** as to mechanism; period assignment is **CFO DECISION REQUIRED** |

**Compatibility with immutability: [FACT] confirmed.** Migration `0005` blocks
UPDATE/DELETE on entries and lines and enforces non-overlapping, correctly
ordered periods. No period *integrity* work remains — only *policy*.

### Minimum policy before the first journal can be posted

Only three of the twelve:

1. **Period frequency and boundaries** — enough to create one period with valid dates.
2. **Who may open a period** — **[FACT]** currently nobody can; no permission exists.
3. **Whether posting requires an OPEN period at all** — **[FACT] `journal_entries.period_id` is NULLABLE**, so the schema permits a journal with no period. Whether that is ever acceptable is **CFO DECISION REQUIRED**; **[RECOMMENDATION]** it should not be.

Items 4–12 can follow after the first posting but **before the first close**.

---

## §8 — D-13/D-14: maker/checker

**[FACT] Current state:** `finance:ledger.post` is a single HIGH_RISK permission
held only by `GROUP_CFO`, excluded from the GROUP_CEO wildcard, and denied to AI
by `CONST-AI-001 r3`. `journal_entries.approved_by` exists and is **written by no
code path**. `CTL-FIN-002` asserts *"Maker/checker on all journal postings"* as
PREVENTIVE / **AUTOMATED** / **EFFECTIVE**, with `evidence_document_id` **null**
and zero postings in existence.

> **The registered control asserts an automated, effective preventive control
> over a mechanism that does not exist.** Its recorded effectiveness is
> unsubstantiated and should not be relied upon in assurance reporting.

### Model comparison

| Criterion | **A** `post` = maker + new `ledger.approve` | **B** `post` = final posting, maker/checker elsewhere | **C** `prepare` + `approve` + `post` | **D** other governed model |
| --- | --- | --- | --- | --- |
| Segregation of duties | Clean two-role split | **Not enforced in the ledger** — relies on an external process | Strongest; three-way split | **[UNKNOWN]** |
| CFO authority | Preserved; CFO can be either role | Preserved unchanged | Diluted across three holders | — |
| CEO exclusion | **[FACT]** must extend to the new permission, else the CEO wildcard silently grants approval | Unchanged | Must extend to all three | — |
| Self-approval prevention | Enforceable (`approved_by <> posted_by`) | Not enforceable in-ledger | Enforceable | — |
| Emergency handling | Needs an explicit break-glass rule | Inherits existing | Most rigid | — |
| Auditability | `posted_by` + `approved_by` both populated | **Weak** — approval invisible to the ledger | Fullest trail | — |
| Idempotency | **[FACT]** `idempotency_key` + `withIdempotency()` already exist | same | same | — |
| Concurrency | **[FACT]** advisory-lock pattern already exists | same | Hardest — three-stage race | — |
| Reversal | Reversal is itself a posting; does it need approval too? **CFO DECISION REQUIRED** | same | same | — |
| AI prohibition | **[FACT]** `CONST-AI-001 r3` names `finance:ledger.post` **only** — a new permission is **not** covered and would need the policy amended | Unchanged; fully covered | Two new permissions uncovered | — |
| Future delegation | Straightforward | Opaque | Most granular | — |
| Schema impact | **None** — `approved_by` already exists | None | None | — |
| New permissions | 1 | 0 | 2 | **[UNKNOWN]** |

**[RECOMMENDATION]** Model **A** — it uses the `approved_by` column already in
the schema, adds exactly one permission, and enforces self-approval prevention
in the ledger. **Not selected.** Any new permission is **CFO DECISION REQUIRED**,
and **BOARD DECISION REQUIRED** if it alters constitutional authority.

> **[FACT] Two consequences the CFO must rule on explicitly if Model A or C is chosen:**
> 1. **The CEO wildcard must exclude the new permission**, otherwise
>    `GROUP_CEO` — which is deliberately denied posting — silently receives
>    approval authority and the control is defeated at birth.
> 2. **`CONST-AI-001 r3` must be extended.** It denies AI `finance:ledger.post`
>    by name. A new `finance:ledger.approve` would **not** be covered, leaving AI
>    formally able to approve journals. That is a policy amendment, not a code change.

### Can a single CFO perform both maker and checker?

**Not assumed either way — this is the crux.**

- **[FACT]** Only one seeded role holds `finance:ledger.post`: `GROUP_CFO`. If
  self-approval is prohibited and no second holder is granted, **no journal can
  ever be posted**. The control would be self-defeating.
- **[FACT]** `CTL-FIN-002` states maker/checker applies to *all* journal
  postings, with no materiality threshold and no exception.
- **[EXISTING AUTHORITY]** Art. 5 vests financial authority in the Group CFO —
  but says nothing about whether that authority may be exercised twice over one
  transaction.
- **[BEHAVIOUR]** Standard practice (and SOC2, which `CTL-FIN-002` cites as a
  framework) treats maker = checker as a segregation-of-duties failure.

**Determination: `CFO DECISION REQUIRED`, escalating to `BOARD DECISION
REQUIRED` if resolving it means granting posting or approval authority to a role
other than Group CFO** — that would alter the constitutional finance authority
model, which currently concentrates it deliberately.

Three coherent resolutions exist, and the CFO must pick one:
(i) grant a second, restricted approval role; (ii) permit self-approval below a
CFO-set materiality threshold and record the accepted risk; (iii) amend
`CTL-FIN-002` to state that maker/checker is **not yet operational** and correct
its effectiveness rating. **[RECOMMENDATION]** (iii) is required *regardless*,
because the current rating is factually wrong today.

---

## §9 — D-22: opening-balance bootstrap

**[FACT]** The ledger is empty. A CAPEX credit to cash presupposes cash exists.
**[FACT]** `treasury_positions` holds 5 balances totalling USD 11,783,000 — but
that is a **snapshot table with no journal provenance**, not a ledger balance,
and using it as one would fabricate financial history.

### Options

| Option | Mechanism | Evidence basis | Risk |
| --- | --- | --- | --- |
| **A** Opening-balance journal | A normal balanced entry: debit assets, credit an opening-balance equity account | Whatever the CFO accepts | Creates an immutable entry from possibly unaudited data |
| **B** Opening-balance import | Bulk load of a prior trial balance | Legacy system export | **[FACT]** no legacy finance system is identified anywhere |
| **C** Audited opening trial balance | External auditor certifies balances at a cut-off date, then loaded via A | Auditor's certificate | Slowest; **highest integrity** |
| **D** Migration-only bootstrap | Balances inserted by SQL migration | None | **[RECOMMENDATION] reject** — bypasses maker/checker, audit trail and `0005` intent; creates financial data with no provenance |
| **E** Other | e.g. start the ledger at zero and post only prospectively, treating pre-existing cash as out of scope | — | Viable if the pilot avoids crediting cash |

**[RECOMMENDATION]** **C then A** — auditor-certified balances loaded as a
normal, governed opening journal, so the first entry is as immutable and
provenanced as every later one. **Option D should be explicitly rejected**;
migrations must not manufacture financial data.

> **[RECOMMENDATION] Option E deserves genuine consideration:** if D-05 selects
> the accrual route (Option B), the first CAPEX posting is **PP&E / payable** and
> **touches no cash at all**. The opening-balance blocker would then not apply to
> the pilot — it would only arise at settlement. This makes D-05 and D-22
> interdependent, and choosing accrual materially shrinks the critical path.

### The opening mechanism must define

| Element | Status |
| --- | --- |
| Source evidence | **CFO DECISION REQUIRED** + **SPECIALIST** (auditor) |
| Effective date | **CFO DECISION REQUIRED** — must align with D-12 |
| Approving authority | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** Board, given it establishes the group's entire financial starting position |
| Maker/checker | **CFO DECISION REQUIRED** — depends on D-13/14; **[RECOMMENDATION]** the opening entry is precisely where dual control matters most |
| Balancing account | **CFO DECISION REQUIRED** — **not invented here**. Conventionally an opening-balance equity or suspense account, but the class and code are the CFO's |
| Audit provenance | **[FACT]** kernel provides `recordAuditTx()` / `publishEventTx()` automatically |
| Entity | **CFO DECISION REQUIRED** — per entity; 8 entities means 8 opening positions |
| Currency | **CFO DECISION REQUIRED** — each entity's functional currency (D-02 resolved) |
| Reconciliation | **CFO DECISION REQUIRED** — to `treasury_positions`? **[FACT]** they carry inconsistent implied FX rates (§10), so they cannot be reconciled to without a rate decision |
| Correction/reversal | **[EXISTING AUTHORITY]** reversal only |

**Authority determination: CFO approval is necessary but likely not sufficient.**
**[RECOMMENDATION]** opening balances require **external/auditor evidence** and,
because they establish the financial baseline of the whole group,
**BOARD DECISION REQUIRED** is defensible. The CFO must rule on the required
authority level.

---

## §10 — D-15 / D-23: the FX blocker

**[FACT] New evidence found this phase — the seeded treasury contains three
mutually inconsistent USD/TZS rates:**

| Entity | TZS balance | USD base balance | Implied rate |
| --- | --- | --- | --- |
| BEYU-AGR | 980,000,000.00 | 375,000.00 | **2,613.3333** |
| BEYU-HEA | 2,870,000,000.00 | 1,098,000.00 | **2,613.8434** |
| BEYU-TZH | 6,120,000,000.00 | 2,340,000.00 | **2,615.3846** |

Three different rates for the same currency pair in the same snapshot. **Under
no circumstances may these be reverse-engineered into an FX rate source** — they
are illustrative seed data, they disagree with each other, and any rate derived
from them would be arbitrary. This strengthens the D-15 block rather than
relieving it.

### Pilot currency strategy (D-23)

| Option | Assessment |
| --- | --- |
| **A — create a new TZS capital request** | **[RECOMMENDATION]** Cleanest. A TZS request against a TZS-functional entity (e.g. BEYU-AGR) is genuinely FX-free: `fx_rate = 1` becomes **correct rather than a fiction**. Requires no FX policy |
| **B — resolve FX policy first** | Most complete, slowest; drags in rate source, IAS 21, OCI vs P&L, revaluation, stale-rate handling — none of which the pilot needs |
| **C — use a USD-functional entity** | **[FACT] Not viable as-is.** Only BEYU-FT (TRUST) and BEYU-HLD (HOLDING) are USD-functional, and **both have zero capital requests**. Using them still requires creating a new request, and a holding/trust entity is a poor fit for a CAPEX pilot |
| **D — other** | e.g. treat a USD request against a TZS entity as a USD-functional transaction — **[RECOMMENDATION] reject**: it contradicts D-02 and IAS 21 |

**Constitutional and operational legitimacy of a TZS pilot — checked, not assumed:**

- **[FACT]** No policy restricts `capital_requests.currency` to USD. The schema
  accepts any currency.
- **[FACT]** ENT-FIN-002 thresholds are denominated **"USD 250,000"** and
  **"USD 1,000,000"**. A TZS request therefore raises a genuine question: at what
  rate is the threshold tested? **A sub-threshold TZS pilot avoids this**, but
  the general problem is real and is itself **CFO DECISION REQUIRED** —
  policy thresholds in USD cannot be evaluated against TZS amounts without the
  very FX policy that is blocked.
- **[FACT]** BEYU-AGR is TZS-functional, IFRS, has a real treasury position and
  an existing CAPEX request, so a TZS CAPEX request there is operationally
  coherent.
- **[RECOMMENDATION]** Legitimate, **provided** the amount sits below the
  ENT-FIN-002 threshold on any plausible rate, so no threshold conversion is needed.

**The request is NOT created.** Adoption is **CFO DECISION REQUIRED**.

### FX requirements that remain unresolved regardless

| Item | Status |
| --- | --- |
| Rate source | **CFO DECISION REQUIRED** — **not invented here**. Bank of Tanzania, bank rate, market feed all plausible |
| Rate timestamp | **CFO DECISION REQUIRED** |
| Transaction date | **CFO DECISION REQUIRED** — IAS 21 spot rate at transaction date |
| Reporting date | **CFO DECISION REQUIRED** — tied to D-16 reporting currency |
| Settlement rate | **CFO DECISION REQUIRED** — realised gain/loss |
| Revaluation | **CFO DECISION REQUIRED** — monetary items at period end |
| FX gain/loss | **CFO DECISION REQUIRED** — P&L vs OCI; **[FACT]** IAS 21 sends net-investment differences to OCI, directly relevant to BEYU-HLD→BEYU-TZH |
| Stale/missing rates | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** refuse to post rather than default to `1` |
| Override authority | **CFO DECISION REQUIRED** — **[RECOMMENDATION]** never client-supplied |
| Audit evidence | **CFO DECISION REQUIRED** — **[EXISTING AUTHORITY]** Art. 4 requires "on which data" |

---

## §11 — D-17: intercompany

**Can the first posting service safely enforce "cross-entity posting prohibited
until intercompany policy is ratified"?**

**[FACT] Yes — and the schema already enforces it structurally.**
`journal_entries.legal_entity_id` is **NOT NULL and singular**: one entry belongs
to exactly one legal entity. A cross-entity transaction is therefore **already
impossible within a single journal entry**; it would require two entries. A
prohibition would simply refuse to create the second one.

**Would the restriction block the proposed pilot?** **[FACT] No.** A
single-entity CAPEX posting at BEYU-AGR involves one entity only.

**However — [FACT] a caveat the CFO must see:** if D-05/D-07 determine that
CAPEX funding at an operating company is *sourced from a parent*, then the
economically complete transaction **is** intercompany, and a single-entity
posting records only one half. The pilot would be accounting-complete only if
the CAPEX is funded from the entity's **own** resources. Whether that is true for
BEYU-AGR is **[UNKNOWN]** and **CFO DECISION REQUIRED**.

**Classification: `DEFERRED — OUTSIDE FIRST PILOT`**, conditional on the pilot
being a self-funded single-entity transaction. **Not implemented.**

---

## §12 — D-18: tax / VAT

**[FACT] Layer separation — the repository conflates these:**

| Layer | State |
| --- | --- |
| **Tax compliance (filing)** | **[EXISTING AUTHORITY]** `OBL-TZ-VAT` (monthly VAT return), `OBL-TZ-PAYE`; `DOM-TAX-001` requires statutory basis, contemporaneous documentation, filed position paper, and Tax Governance Committee approval for uncertain positions |
| **Tax treatment (assessment)** | **[BEHAVIOUR]** `tax_strategies` + assessments evaluate eligibility; **[FACT]** never posted |
| **Accounting recognition** | **[FACT]** absent — no tax accounts in the finance schema |

**A compliance obligation is not accounting policy.** `OBL-TZ-VAT` proves BEYU
must *file* VAT returns; it says nothing about how input VAT on a capital
purchase is recognised.

### CAPEX-specific tax questions and their required authority

| Question | Authority |
| --- | --- |
| Is the capital request amount **VAT-inclusive or exclusive**? | **CFO DECISION REQUIRED** — **[FACT]** `capital_requests` has no tax flag; this changes the capitalised amount directly |
| Is input VAT on capital goods **recoverable**? | **SPECIALIST** (TZ VAT law) + Tax Governance Committee |
| Input/output VAT account structure | **CFO DECISION REQUIRED** (after the above) |
| Withholding tax on payment to supplier | **SPECIALIST** + CFO |
| Capital allowances (TZ Third Schedule) | **SPECIALIST** + CFO — **[FACT]** a seeded strategy already claims one |
| Deferred tax on the allowance/depreciation gap | **SPECIALIST** + CFO — **[FACT]** IAS 12 appears once, as a `tax_strategies.accounting_effect` annotation, **not ratified policy** |
| Tax payable / receivable accounts | **CFO DECISION REQUIRED** |
| Income tax recognition | **CFO DECISION REQUIRED** — **[FACT]** waterfall tier 1 cites *Income Tax Act Cap 332 — 30%*, but that is a **distribution model**, not a recognition policy |
| Non-deductible expenditure | **CFO DECISION REQUIRED** |
| Uncertain positions | **[EXISTING AUTHORITY]** `DOM-TAX-001` → **Tax Governance Committee** |

**[RECOMMENDATION]** The pilot can avoid most of this **only** if the CFO
confirms the amount is VAT-exclusive and defers input-VAT recognition — itself a
decision, not an assumption. **No tax accounts are invented here.**

---

## §13 — D-19: execution semantics

### The domain boundary

```
PROPOSAL → GOVERNANCE AUTHORIZATION → CAPITAL EXECUTION → ACCOUNTING RECOGNITION
        → POSTING → CASH SETTLEMENT → TREASURY → RECONCILIATION
```

**[FACT]** Of these eight, only PROPOSAL, GOVERNANCE AUTHORIZATION and the
capital status transition exist. **[FACT]** Verified in code: the governance gate
states in terms it *"moves no money, posts no journal entry, creates no ledger
record, issues no treasury instruction and calls no external system"* — and the
implementation contains no financial coupling.

### The ten questions

| # | Question | Answer |
| --- | --- | --- |
| 1 | What event authorizes execution? | **CFO DECISION REQUIRED** — **[FACT]** `GOVERNANCE_AUTHORIZED` currently authorizes *nothing further*; no `capital:execute` capability exists |
| 2 | What event creates an accounting obligation? | **CFO DECISION REQUIRED** — flows from D-05. **[FACT]** governance approval alone almost certainly does **not** create one: approving a budget is not incurring a liability |
| 3 | What event creates a journal? | **CFO DECISION REQUIRED** — recognition, not authorization |
| 4 | What event moves cash? | **CFO DECISION REQUIRED** — **[FACT]** no treasury transaction primitive exists; nothing can move cash today |
| 5 | What event changes capital request status? | **[FACT] PARTLY RESOLVED** — governance authorization sets `GOVERNANCE_AUTHORIZED`; what sets `FUNDED` is **CFO DECISION REQUIRED** |
| 6 | What produces the execution event? | **CFO DECISION REQUIRED** — **[FACT]** `publishEventTx()` exists; the event *name and trigger* are undecided |
| 7 | **Can governance approval directly post a journal?** | **CFO DECISION REQUIRED** — **[RECOMMENDATION] no.** **[EXISTING AUTHORITY]** Art. 5 vests financial consequences in the CFO, and `finance:ledger.post` is deliberately excluded from the CEO wildcard, implying governance authority ≠ posting authority. But this is inference about design intent, **not a ratified answer** |
| 8 | **Can a journal exist without a capital request?** | **CFO DECISION REQUIRED** — **[RECOMMENDATION] yes, necessarily.** Payroll, depreciation, tax and **opening balances** (§9) have no capital request. **[FACT]** the schema agrees: `journal_entries` has no capital-request FK. A posting service must not require one |
| 9 | Can execution occur without governance authorization? | **[EXISTING AUTHORITY] RESOLVED — no.** Enforced by the Phase 4 gate and ENT-FIN-002 |
| 10 | **What if execution succeeds but settlement fails?** | **CFO DECISION REQUIRED** — the hardest case. If recognition and settlement are separate events (D-05 option B) they can diverge legitimately: the asset and payable stand, the payment failed, and a **reconciliation** concept is needed. **[FACT]** none exists. If they are one atomic event (option A), the whole thing rolls back and no reconciliation is needed. **D-05 determines whether BEYU needs a reconciliation domain at all** |

### The core constitutional question, restated

Does `GOVERNANCE APPROVED` mean *"the requested action is authorized"*
(Interpretation 1) or *"the financial transaction must now be executed"*
(Interpretation 2)?

**CFO DECISION REQUIRED — not chosen here.**

**[BEHAVIOUR]** The system behaves as Interpretation 1. **[FACT]** That is an
artefact of execution being unimplemented, **not** a ratified position, and must
not be cited as precedent. **[RECOMMENDATION]** Interpretation 1, because
Interpretation 2 would make governance approval an irreversible money-movement
trigger with no separate financial control — but the CFO must state this.

---

## §14 — First pilot readiness checklist

**Candidate (recommendation only):** single-entity CAPEX at a TZS-functional
entity, denominated in TZS, self-funded, no intercompany, VAT-exclusive.
**Not executed.**

### Required before CoA

| Item | Status |
| --- | --- |
| CoA scope model (D-06) | **CFO DECISION** |
| Account numbering scheme | **CFO DECISION** |
| Entity vs tenant account ownership | **CFO DECISION** |
| Account classes (`ASSET`…`EXPENSE`) | **READY** — enum exists |
| IFRS category values | **CFO DECISION** |
| Whether a migration is needed (options B/C) | **BLOCKED** on D-06 |

### Required before periods

| Item | Status |
| --- | --- |
| Fiscal year (D-12.1) | **CFO DECISION** (possibly **BOARD**) |
| Period frequency (D-12.2) | **CFO DECISION** |
| Period-open permission | **BLOCKED** — **[FACT]** no such permission exists; creating one needs explicit authority |
| Overlap/date integrity | **READY** — migration `0005` |
| Close/lock semantics | **CFO DECISION** (needed before first close, not first post) |

### Required before a posting service

| Item | Status |
| --- | --- |
| Maker/checker model (D-13/14) | **CFO DECISION** |
| Can CFO self-approve? | **CFO DECISION** (possibly **BOARD**) |
| CEO wildcard exclusion for any new permission | **CFO DECISION** |
| `CONST-AI-001` extension for any new permission | **CFO DECISION** |
| `CTL-FIN-002` effectiveness correction | **CFO DECISION** — **[RECOMMENDATION]** required regardless |
| Balance/immutability enforcement | **READY** — `0005`, 10/10 probes |
| Idempotency | **READY** — `withIdempotency()` + `idempotency_key` |
| Concurrency | **READY** — advisory locks |
| Audit + events | **READY** — `recordAuditTx()` / `publishEventTx()` |

### Required before the first journal

| Item | Status |
| --- | --- |
| Accrual basis (D-05) | **CFO DECISION** |
| CAPEX debit/credit classes (D-07) | **CFO DECISION** |
| 2–4 accounts created | **BLOCKED** on D-06 |
| One open period | **BLOCKED** on D-12 |
| Opening balances, if cash is credited (D-22) | **CFO DECISION** + **SPECIALIST** |
| VAT-inclusive vs exclusive (D-18) | **CFO DECISION** |
| A TZS-denominated request (D-23) | **CFO DECISION** |
| Is `period_id` mandatory? | **CFO DECISION** — **[FACT]** nullable in schema |
| Cross-entity prohibition | **DEFERRED** — safe |
| FX | **DEFERRED** for a TZS pilot; **BLOCKED** generally |

### Required before capital execution

| Item | Status |
| --- | --- |
| Execution semantics (D-19) | **CFO DECISION** |
| `capital:execute` capability | **BOARD DECISION** if a new constitutional power |
| What sets `FUNDED` | **CFO DECISION** |
| Execution event name/trigger | **CFO DECISION** |
| Governance prerequisite | **READY** — Phase 4 gate |
| Execution ≠ posting boundary | **CFO DECISION** |

### Required before cash movement

| Item | Status |
| --- | --- |
| Treasury transaction primitive | **BLOCKED** — **[FACT]** none exists; must not be fabricated |
| Settlement semantics (D-19.10) | **CFO DECISION** |
| Reconciliation domain | **CFO DECISION** — needed only under D-05 option B |
| Bank/payment integration | **BLOCKED** — out of scope |
| Treasury authority | **CFO DECISION** — **[FACT]** no `treasury:transfer` permission exists |
| FX for cross-currency settlement | **BLOCKED** — D-15 |

---

## §15 — Stop conditions

| # | Condition | Triggered | Basis |
| --- | --- | --- | --- |
| 1 | Accounting treatment must be invented | **YES** | D-05, D-07 unresolved |
| 2 | CoA scope ambiguous | **YES** | D-06; schema self-inconsistent |
| 3 | Opening-balance treatment undefined | **YES** | D-22 |
| 4 | Maker/checker authority undefined | **YES** | D-13/14; self-approval question open |
| 5 | CAPEX debit/credit unresolved | **YES** | D-07 |
| 6 | Financial-period policy unresolved | **YES** | D-12 |
| 7 | FX required but no policy | **YES** generally / avoidable for a TZS pilot | D-15, D-23 |
| 8 | Tax treatment required but unsupported | **YES** | D-18 |
| 9 | Execution semantics ambiguous | **YES** | D-19 |
| 10 | Permission change needed without authority | **YES** | period-open permission; any maker/checker permission |

**10 of 10 stop conditions active. No implementation code written.**

### Blocker summary

| Blocker | Authority | Exact decision needed | Unblocks |
| --- | --- | --- | --- |
| D-05 accrual | CFO | Option A, B, C or D for CAPEX | Recognition timing; determines whether a reconciliation domain is needed at all |
| D-06 CoA scope | CFO + Architecture | Tenant-wide, entity-specific, master+mapping, or other | Every posting; whether a migration is required |
| D-07 CAPEX | CFO | Recognition event + debit class + credit class + measurement basis | The pilot |
| D-12 calendar | CFO (Board for fiscal year) | Frequency, boundaries, who may open | Period creation |
| D-13/14 maker/checker | CFO (Board if authority moves) | Model + whether CFO may self-approve | Posting service; corrects the `CTL-FIN-002` assurance gap |
| D-22 opening balances | CFO + auditor (possibly Board) | Mechanism + balancing account + evidence standard | Any cash-touching posting |
| D-23 pilot currency | CFO | New TZS request, or FX first | An FX-free pilot |
| D-15 FX | CFO | Rate source above all | All 4 existing requests; USD-denominated policy thresholds |
| D-18 tax | CFO + Tax Governance Committee + specialist | VAT-inclusive or exclusive, to begin | Correct capitalised amount |
| D-19 execution | CFO (Board if new capability) | Interpretation 1 or 2 | Capital execution service |

---

## Scope statement

**[FACT]** Documentation only. No schema, migration, enum, CoA, financial period,
posting service, journal, capital execution, treasury, permission or role change.
Ledger verified after all work: **0 accounts, 0 periods, 0 journal entries,
0 journal lines**; capital requests 4; treasury positions 5 totalling
11,783,000.00 — all unchanged.

Related: `CFO_ACCOUNTING_POLICY_DECISIONS.md` (Phase 5C register),
`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md` (Phase 5B evidence),
`CAPITAL_EXECUTION_BLOCKED.md`, `DECISION_AUTHORITY_MODEL.md` §4.
