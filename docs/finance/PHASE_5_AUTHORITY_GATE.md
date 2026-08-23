# Phase 5 — Accounting authority gate

# ENGINEERING BLOCKED — ACCOUNTING AUTHORITY NOT YET RATIFIED

**Phase 5H · 2026-08-21 · Branch `arena/01a01b69-beyu-os-1-0` · Baseline commit `df2c481`**

This is a status artifact, not a policy-discovery document. Discovery is complete
(Phases 5B–5G). This records **whether BEYU has crossed the authority boundary
for accounting engineering.** It has not.

---

## 1 — Baseline (independently verified)

| Item | Verified |
| --- | --- |
| HEAD / working tree | `df2c481`, clean, no re-clone |
| Migration fingerprint | `8bafa4b0f09c62a918933158789df01c` |
| Full suite | 311/311 |
| Finance regression | 58/58 |
| Ledger | 0 accounts · 0 periods · 0 journal entries · 0 journal lines |
| Capital requests | 4 (all USD) · **0 TZS** |
| Treasury | 5 positions · 11,783,000.00 |
| `finance:ledger.post` | GROUP_CFO only |
| `finance:ledger.approve` | Does not exist |
| Migration 0005 controls | 3 triggers · 4 constraints · **10/10 bypass probes blocked** |
| Governance → Capital | Implemented and passing |
| Capital execution | Not implemented |

**No baseline fact differs from Phase 5G.**

---

## 2 — Authority intake result

Searched every level of the authority hierarchy for a decision capable of
resolving P1–P11.

| Level | Source | Result |
| --- | --- | --- |
| **L1** Constitution | 11 articles | **No article establishes an accounting treatment.** Art. 5 assigns *authority* to the CFO; it does not exercise it |
| **L2/L5** Resolutions | 4 total | `BEYU-BRD-2025-014` APPROVED (waterfall config — not accounting policy) · `BEYU-FC-2025-007` APPROVED (beneficiary class — unrelated) · `BEYU-IC-2025-021` **TABLED** · `BEYU-TGC-2025-031` **DRAFT** |
| **L3/L6** Policies | 5 ACTIVE | `CONST-AI-001`, `DOM-TAX-001`, `ENT-FIN-002`, `ENT-FIN-003`, `ENT-SEC-004` — **none defines a debit/credit, CoA, recognition basis, period rule or maker/checker mechanic** |
| **L4** Specialist | — | **No specialist-opinion table exists** in the schema; no tax opinion, auditor attestation or ruling is recorded anywhere |
| **L7** ADRs | 4 ACCEPTED | Control plane, family office, tax-intelligence placement, audit chain. **None addresses accounting judgement** (and by rule an ADR could not) |
| **L8+** | Seed data, tax strategies, prior AI documents | **Informational only — not authority** |

**Decisive query:** no APPROVED resolution and no ACTIVE policy establishes a
debit/credit mapping, a chart of accounts, a recognition basis, a period rule or
a maker/checker mechanic. **Result: zero matches.**

**Also verified:** no commits since `df2c481`; no new or modified files anywhere
in the working tree; no external artifact containing a ratification or signature.

> **NO NEW AUTHORITATIVE DECISIONS FOUND.**

### Explicitly rejected as ratification

`BEYU-TGC-2025-031` ("Adopt capital allowance position for agricultural
machinery") is **DRAFT** — it confers no authority, notwithstanding its direct
relevance to CAPEX at BEYU Agriculture Ltd. `BEYU-IC-2025-021` is **TABLED**.
Seed data, tax-strategy annotations (including the single IAS 12 reference),
compliance filing obligations, proposed account classes, prior AI-generated
documents and general IFRS knowledge were all excluded per §2.

---

## 3 — P1–P11 authority matrix

| ID | Decision | Status | Authority required |
| --- | --- | --- | --- |
| **P1** | Accounting recognition basis | **PENDING** | Group CFO |
| **P2** | CAPEX classification / recognition | **PENDING** | Group CFO |
| **P3** | Measurement basis | **PENDING** | CFO + specialist (VAT) |
| **P4** | Functional/reporting currency & FX | **PARTIALLY RATIFIED** | See below |
| **P5** | Accrual vs immediate cash | **PENDING** | Group CFO |
| **P6** | Chart-of-accounts scope | **PENDING** | CFO + Architecture Review Board |
| **P7** | Initial CoA tranche | **PENDING** | Group CFO |
| **P8** | Financial-period / calendar policy | **PENDING** | CFO; Board for fiscal year |
| **P9** | Period open/close authority & posting restrictions | **PENDING** | Group CFO |
| **P10** | Maker/checker segregation | **PENDING** | CFO; Board if authority moves |
| **P11** | First permitted capital-execution transaction | **PENDING** | Group CFO |

**Every PENDING item: `NO AUTHORITATIVE DECISION FOUND — IMPLEMENTATION BLOCKED`.**

### P4 — the single partially ratified item

| Field | Content |
| --- | --- |
| **Authoritative source** | `legal_entities.functional_currency` NOT NULL and `accounting_standard` NOT NULL, populated for 8/8 entities; obligation `OBL-IFRS-CONSOL` ACTIVE |
| **Source type** | L6 — schema-enforced existing state, corroborated by an active compliance obligation |
| **Document ID** | Migration `0000_kernel_v1_baseline`; obligation `OBL-IFRS-CONSOL` |
| **Approving body** | Not separately recorded — adopted as part of the ratified kernel baseline |
| **Approval status / date** | Baseline state; **no discrete approval record exists** |
| **Decision text (precise paraphrase)** | Each legal entity has a designated functional currency (6 TZS, 2 USD) and reports under IFRS |
| **Scope** | Functional currency and accounting framework only |
| **Conditions** | Does **not** extend to FX treatment |
| **Implementation consequence** | Single-functional-currency posting is determinable per entity |
| **Migration consequence** | None |
| **Additional authority required** | **Yes — substantial.** Reporting/presentation currency is undefined (no column, no policy). FX rate source, transaction-date rate, revaluation, realised/unrealised treatment and rounding are all unresolved. **FX remains `BLOCKED — POLICY REQUIRED`** |

---

## 4 — Supplementary items

| Item | Status |
| --- | --- |
| Opening-balance policy / evidence | **PENDING** — CFO + external auditor |
| VAT treatment | **PENDING** — specialist. `OBL-TZ-VAT` is a *filing* obligation, not recognition policy |
| Withholding tax | **PENDING** — specialist |
| Capital allowances | **PENDING** — specialist. `BEYU-TGC-2025-031` is DRAFT |
| Deferred tax | **PENDING** — specialist |
| Depreciation / impairment / disposal | **PENDING** — CFO |
| Intercompany | **DEFERRED** — structurally safe: `journal_entries.legal_entity_id` is NOT NULL and singular, so a cross-entity transaction cannot be expressed in one entry |
| FX rate source / revaluation | **BLOCKED — POLICY REQUIRED** |
| Execution authority | **PENDING** — CFO; Board if a new capability |
| Is `finance:ledger.approve` constitutionally required? | **PENDING** — depends on P10. If created it must be excluded from the GROUP_CEO wildcard and added to `CONST-AI-001`, or the CEO and AI silently gain approval authority |
| `ENT-FIN-005` | **PENDING — Board.** Cited by the waterfall RESERVE tier; confirmed absent from the policy register |
| `CAP-2025-004` | **INELIGIBLE.** Resolution TABLED; IC approval insufficient above USD 1M. Unaltered |

---

## 5 — CTL-FIN-002

**`CTL-FIN-002 = ASSURANCE MISSTATEMENT — OWNER ACTION REQUIRED`**

Verified this phase: `effectiveness` **EFFECTIVE**, `automation` **AUTOMATED**,
`evidence_document_id` **null**, `last_tested_at` **2025-11-30** — over a
mechanism that does not exist (no posting service, no checker, `approved_by`
written by no code path, zero journal entries ever). **Zero resolutions address
controls; no `control_tests` table exists.**

**No authoritative owner decision exists** to correct its status, evidence,
testing date or automation classification, to retire it or to replace it.
**The control was not modified.** Governance records are not silently repaired.

---

## 6 — Consequences and responsibility

| Blocker | Responsible decision maker | Required decision artifact |
| --- | --- | --- |
| P1, P2, P3, P5 recognition & measurement | **Group CFO** | Written accounting policy naming the recognition event and debit/credit classes |
| P6, P7 chart of accounts | **Group CFO + Architecture Review Board** (Art. 11) | CoA scope policy + numbering scheme + first tranche |
| P8, P9 periods | **Group CFO**; **Board** for fiscal year | Financial calendar policy + period authority |
| P10 maker/checker | **Group CFO**; **Board** if authority moves | SoD policy; permission decision if required |
| P11 pilot | **Group CFO** | Identification of a real, governed TZS transaction |
| FX | **Group CFO + specialist** | FX policy naming the rate source |
| Tax items | **Tax Governance Committee + specialist** | Ratified tax positions (incl. ratifying `BEYU-TGC-2025-031`) |
| Opening balances | **CFO + external auditor**; Board recommended | Certified opening trial balance |
| `ENT-FIN-005` | **Group Board** | Ratify the treasury policy, or amend the waterfall tier's legal basis |
| `CTL-FIN-002` | **GROUP_CFO + Internal Audit** | Control restatement |

---

## 7 — Implementation blocked

The following must **not** be created while the above remain pending, because
each would permanently encode an unratified accounting judgement into immutable
journal entries:

ledger accounts · account numbers · posting rules · debit/credit mappings ·
recognition rules · period rules · FX rules · tax mappings · maker/checker
permissions · approval permissions · capital-execution transitions ·
opening balances · journal-posting service.

**Decision sufficiency rule applied:** where an implementation would permanently
encode an accounting judgement and no authoritative decision establishes it,
the correct action is to **stop**. Migration `0005` makes journal entries
immutable, so a wrong treatment cannot be edited — only reversed, leaving the
error permanently in the audit record.

---

## 8 — Safe work that may proceed without accounting authority

Not authorised here; recorded so the phase is not read as "nothing can be done":

- Non-financial capabilities unrelated to the ledger.
- Read-only reporting over data that already exists.
- Test, tooling, CI and documentation work.
- The known-issues backlog outside finance (e.g. the dual permission source).
- Preparing the posting service **design** — without accounts, rules or code
  that encodes a treatment.

---

## 9 — Prohibition on policy invention

**BEYU OS must never manufacture accounting policy to make the software
executable.** Specifically prohibited: inferring a treatment from IFRS general
knowledge; promoting a recommendation to a decision; deriving an FX rate from
treasury snapshots (the seeded values imply three mutually inconsistent USD/TZS
rates); fabricating a pilot transaction, opening balance or cash position;
converting an existing USD request to TZS; altering `CAP-2025-004`, its
resolution or `CTL-FIN-002`; bypassing the governance gate; or creating a
permission merely to make a workflow executable.

**The IFRS distinction is maintained throughout:** IFRS is the external
*framework*; BEYU's *adopted policy* and its *implementation rule* are separate
and remain unauthorised.

---

## 10 — Verification

Documentation-only change. **NO APPLICATION SEMANTICS CHANGED.**

| Check | Result |
| --- | --- |
| Typecheck / lint / build | Clean |
| Full suite | 311/311 |
| Finance regression | 58/58 |
| Migration fingerprint | `8bafa4b0f09c62a918933158789df01c` — unchanged |
| Integrity bypass probes | **10/10 blocked** |
| Ledger | 0/0/0/0 |
| Treasury | 11,783,000.00 — unchanged |
| Capital requests | 4 — unchanged |
| Permissions | Unchanged |
| `src/`, `drizzle/`, `tests/` | Zero changes |

**No control was weakened to obtain a passing result.**

---

**Gate result: `YELLOW — WAITING FOR AUTHORITATIVE ACCOUNTING RATIFICATION`.**

Prior artifacts: `ACCOUNTING_POLICY_RATIFICATION_REGISTER.md` (5G, signature-ready
sheets), `CFO_ACCOUNTING_POLICY_DECISION_PACKAGE.md` (5F),
`CFO_ACCOUNTING_POLICY_DECISION_REGISTER.md` (5E),
`CFO_DECISION_WORKSHEET_PHASE_5D.md` (5D),
`CFO_ACCOUNTING_POLICY_DECISIONS.md` (5C),
`docs/governance/ACCOUNTING_POLICY_DISCOVERY.md` (5B).
