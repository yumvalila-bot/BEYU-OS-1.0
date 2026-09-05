# BEYU OS — ACCOUNTING GOVERNANCE RATIFICATION — FINAL REPORT

**Scope:** Policy & governance only — P1 / P6 / P7 / P9 for `CAP_POSTING` (supplements the engineering-wide certification)  
**Date:** 2026-09-05 (UTC)  
**Baseline:** `a7321a3` (`origin/main`, PR #24 merge) → `87b2dfb` (PR #25 verification) — fresh audit on `arena/01a070bf-beyu-os-1-0`  
**Authoritative registries:** `governance_decision_registry` + `governance_capability_registry` (`drizzle/0010`)  
**Canonical resolutions:** `resolutions` / `resolutionVotes` (4 seeded)  
**Auditor:** BEYU OS Governance & Accounting-Policy Agent (Arena) — as auditor, not as financial or governance authority

This report is the **policy/governance** counterpart to `CAP_POSTING_END_TO_END_ENGINEERING_CERTIFICATION.md`. It cross-references that document for database, security, Web/Flutter, Noelia, and deployment evidence rather than duplicating it.

---

## Verdict

### ACCOUNTING POLICY RATIFICATION INCOMPLETE — CAP_POSTING = LOCKED

No accounting policy has been ratified for any of the four dependencies of `CAP_POSTING`. The correct queue state is preserved; no policy, authority, or provenance was invented to make the system appear compliant.

---

## 1. Authority model (re-verified, not assumed)

* Group CFO — Art.5 financial consequences — required for P1, P7, P9; co-required with ARB for P6.
* Architecture Review Board — Art.11 — co-required for P6 (and for any schema/migration choice in P6/P7/P9).
* Group Board — Art.4 reserved matters — required for B-04 fiscal-year convention (component of P7) and for any new capability/permission creation (B-09 `finance:ledger.approve`, `finance:period.manage`), and for `C-1` provenance model.
* Resolution closure — 9-condition invariant (`DECISION_AUTHORITY_MODEL.md §1`) — both `governance:resolution.approve` *and* presiding seat (`CHAIR`/`SECRETARY` on owning body) are independently required; only `CHIEF_GOVERNANCE_OFFICER` explicitly holds the permission (CEO wildcard is incidental), so CFO cannot close its own governance resolution — SoD by design (`HUMAN_RATIFICATION_QUEUE Q2`).
* Provenance — `GOVERNED` (audit-ledger trail) vs `REFERENCE_DATA` (seed/edit); only `APPROVED`+`GOVERNED` authorises (`C1_POLICY_PROVENANCE_DECISION.md`, `GOVERNANCE_AUTHORITY_GAP_REGISTER`).
* Effective dating — `approval_date ≤ today`, `effective_from ≤ today ≤ effective_to`, `validUntil` on `approvals`; future/missing → `APPROVED_NOT_EFFECTIVE`, expired → `EXPIRED` (`verifyDecisionAuthority` ladder).

No GitHub, Arena, database-admin, or document-authorship identity was treated as CFO/ARB/Board authority.

---

## 2. P1 — Recognition Basis (`governance_decision_registry P1`)

* **Question:** What event triggers recognition of a capital transaction?
* **Options (all PENDING):** A cash at payment, B accrual at obligation/invoice, C accrual at control transfer/receipt, D staged — recommendation B/C is not a decision.
* **Facts:** IFRS 8/8 (supporting), no ratified recognition statement, corrections=reversal (structurally enforced), no invoice/PO/GR/commitment/payment-terms artefacts — B/C would require absent concepts.
* **Must resolve (17):** event, cash/accrual, revenue/expense/assets/liabilities/capital/intercompany, corrections/reversals/adjustments/period boundaries/effective date/uncertain events/scope/version/transition — **all PENDING** for P1.
* **Intake:** No CFO signed block, no `APPROVED` `GOVERNED` resolution citing P1, no 12-point evidence — supporting only.
* **Status:** **PENDING — NOT RATIFIED** — `P1=PENDING/LOCKED`, `effective_from NULL`, `blockedBy` includes `P1`.

---

## 3. P6 — Chart of Accounts (`governance_decision_registry P6`)

* **Question:** Scope + numbering + owner + lifecycle of the canonical CoA.
* **Options (all PENDING):** A tenant-wide (no migration, weak isolation), B entity-specific (migration — global uniqueness blocks naive), C shared canonical+applicability (strongest consolidation, mapping table required), D dimension. Recommendation C (or A as zero-migration pilot) not a decision; no codes proposed (placeholder would become permanent policy).
* **Facts:** `ledger_accounts.tenant_id NOT NULL`, globally unique `code`, no `legal_entity_id`; consumers entity-scoped — **honest inconsistency documented**, not patched — 0 accounts.
* **Must resolve:** hierarchy, IDs, classes `ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE`, posting eligibility, entity/country/tenant dimensions, intercompany, consolidation, inactive handling — **all PENDING**.
* **Intake:** No CFO+ARB block, no resolution — supporting only.
* **Status:** **PENDING — NOT RATIFIED** — schema inconsistency awaits genuine decision; a “convenient” migration now would rewrite history.

---

## 4. P7 — Period Linkage (`governance_decision_registry P7`)

* **Question:** Must every posting belong to an open entity-valid period? (+ fiscal calendar, timezone)
* **Dependency:** `["P5"]` — P5 (fiscal-year-end, frequency, who may open) is itself PENDING → **transitively** `RATIFIED_NOT_READY` even if P7 were hypothetically ratified.
* **Facts:** `journal_entries.period_id` **nullable** (control gap), `financial_periods` `OPEN/CLOSING/CLOSED/LOCKED` without semantics, 0 periods, **no `finance:period.manage` granted** — nobody can open a period today.
* **Options (all PENDING):** A mandatory OPEN same-entity, reject absent/closed, transaction date selects; B optional; C mandatory-but-any-status.
* **Must resolve:** accounting/transaction/posting/effective date roles, fiscal period/calendar, timezone, open/closed/future/backdating, adjustments/reversals/corrections/reopening (+ P5 year/frequency/authority).
* **Intake:** No CFO block (and Board fiscal-year not yet), supporting only; recommendation “mandatory OPEN” not a decision.
* **Status:** **PENDING — NOT RATIFIED** and dependency-blocked.

---

## 5. P9 — Posting Controls (`governance_decision_registry P9`)

* **Question:** Who may create/approve/post/reverse/correct, and may one person hold a prohibited combination?
* **Facts:** `finance:ledger.post` HIGH_RISK — **GROUP_CFO only** (CEO 3-exclusion correct), `finance:ledger.approve` **absent**, `approved_by` unwritten, no draft/pending states, `delegations` table exists but Q9 pending, `CTL-FIN-002` maker/checker on all postings (no threshold) but marked `AUTOMATED/EFFECTIVE` over non-existent mechanism — **assurance misstatement F-2**, `CONST-AI-001 r3` denies AI ledger posting by name only.
* **11 answers (all PENDING):** maker, checker, same person post+approve, CFO self-approve, amount-varying, entity-varying, reversals, emergency, delegated authority, evidence, AI.
* **Options (all PENDING):** A self-approve (no SoD, fails SOC2), B separate roles, C delegated checker, D threshold-based, E governance+accounting approval, F other — B/C/D genuine SoD but blocked (single holder → forbidding self-approve makes posting impossible without second human). Hazard: new `finance:ledger.approve` would need CEO-wildcard exclusion + `CONST-AI-001` extension (B-09).
* **Status:** **PENDING — NOT RATIFIED** — single-actor create→approve→post→reverse remains structurally possible.

---

## 6. Cross-policy

Hypothetical contradictions (none ratified, future joint ratification must avoid): P1↔P6 payable-class vs CoA scope, P1↔P7 recognition date vs period selector, P1↔P9 accrual 2-stage vs SoD, P6↔P7 tenant-wide Cash vs entity periods, P6↔P9 CoA owner = checker circularity, P7↔P9 reopen-vs-reversal. **All UNRESOLVED → independently blocking** (as documented in end-to-end §7).

---

## 7. Authority & provenance (12-point)

For each of P1/P6/P7/P9: identity, role, scope, jurisdiction, delegation, provenance `GOVERNED`, effective date, version, conditions, approval mechanism, timestamp, revocation → **all NULL / NOT VERIFIED**. No inference from authorship/GitHub/silence. `governance_decision_registry` seeded `P1/P6/P7/P9 = PENDING/LOCKED` with null authority cols; `provenance` NULL (not `GOVERNED`), `effective_from` NULL, `resolution_id` NULL.

## 8. Governance resolution & registry

* **Resolution:** Does not exist for accounting policy — blank template `ACCOUNTING_POLICY_GOVERNANCE_RESOLUTION_TEMPLATE.md` intentionally unfilled. Existing 4 resolutions cover waterfall/beneficiary/capital-allowance and are `REFERENCE_DATA` (capital gate correctly refuses `REFERENCE_DATA`).
* **Registry:** `REGISTRY UPDATE BLOCKED — AUTHORITY REQUIRED` — writing now would manufacture authority; correct queue state is `PENDING/LOCKED`.

## 9. CAP_POSTING derivation

`CAP_POSTING` (`seed.ts:1396`) → `[P1,P6,P7,P9]` (transitively `P5` via P7). Each decision maps via `verifyDecisionAuthority` → `isExecutable` is true for *only* `ACTIVATED`; plus `cap.activationStatus=ACTIVATED` and non-empty `requiredDecisions`. Observed: `P1/P6/P7/P9 all PENDING` → `checkCapabilityActivation("CAP_POSTING") → executable:false, blockedBy:[P1,P6,P7,P9]` → `requireCapability` throws `CapabilityLockedError` → posting engine cannot execute. Flipping only the capability row remains denied (proven in `activation-gate.test`).

**Therefore: `CAP_POSTING = LOCKED`.** No environment-variable, feature-flag, admin, worker, Noelia, or test-only path changes this (audited §1.4).

---

## 10. Historical preservation

* Prior artefacts — `ACCOUNTING_POLICY_RATIFICATION_REPORT.md` (PR #24), `ACCOUNTING_GOVERNANCE_RATIFICATION_REPORT.md` / `EXECUTIVE_SUMMARY.md` (PR #25 `87b2dfb`), `CAP_POSTING_AUDIT_REPORT.md`, seeded `ACCOUNTING_POLICY_RATIFICATION_REGISTER.md` — all retained and cross-referenced.
* No migration file rewritten, no `audit_log` history rewritten, no policy row retro-fitted with backdated approval — the gap register (`D-1`, `F-2`) records the retro-linkage hazard (`data-first then constraint`) rather than concealing it.

---

## 11. What would make this report read `RATIFIED`

Only: the Group CFO completes §3c blocks in `docs/finance/DRAFT_ACCOUNTING_POLICY_RATIFICATION_PACKAGE.md` with **exact ratification wording** (e.g. `BEYU recognises capital expenditure on a <cash/accrual> basis. The recognition event is <…>.`, `The BEYU chart of accounts is <…>, numbered <…>, owned by <role>.`, period rule with selector date + reopen rules, SoD answers 1-11), **effective date + scope + conditions + evidence**, enacted as an **`APPROVED` resolution with `GOVERNED` provenance** (quorum/majority met by an eligible presiding seat holding `governance:resolution.approve` — Chief Governance Officer today — while CFO supplies the financial determination). ARB co-signs P6. Board resolves B-04 fiscal-year and B-09 if any new permission is created. Then `verifyDecisionAuthority` returns `ACTIVATED` per decision, and `checkCapabilityActivation("CAP_POSTING")` returns `executable:true` — the subject of the companion `CAP_POSTING_TECHNICAL_ACTIVATION_CERTIFICATION.md`.

Until then: **ACCOUNTING POLICY RATIFICATION INCOMPLETE — CAP_POSTING = LOCKED.**

---

*Auditor:* Arena — as auditor, not as financial or governance authority.  
*Date:* 2026-09-05 (UTC) · Commit `87b2dfb` → this report atop; Main `a7321a3`.  
*Classification:* Authoritative verification report — **does not create policy or grant authority.**

*END*
