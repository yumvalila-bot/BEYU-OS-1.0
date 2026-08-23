# Governance Authority Gap Register

**Status:** FINDINGS ONLY — `[NOT AUTHORITY]`. Nothing here has been ratified. No decision ID,
approval date or signature in this document is real; where an authority is named it identifies
who *would* need to decide, not anyone who *has* decided.

**Method:** hostile attack against the running system. Destructive probes ran in scratch database
`beyu_5r` or inside always-rolled-back transactions. Main-database state verified identical
before and after.

**Phase:** 5R · Branch `arena/01a01b69-beyu-os-1-0`

---

## 1. The authority ladder — what is actually represented

| # | State | Represented? | Where | Enforced? | Enforcing layer | Raw SQL bypass? |
|---|-------|--------------|-------|-----------|-----------------|-----------------|
| 1 | EXISTS | yes | row in `policies` | n/a | — | n/a |
| 2 | ACTIVE | yes | `policies.status` | yes | app (`evaluatePolicy`) | yes — no state machine |
| 3 | EFFECTIVE | yes | `effective_from` / `effective_to` | yes | app + DB CHECK (0008) | partly — dates are DB-validated for coherence, not for authority |
| 4 | APPROVED | **column only** | `approved_by_resolution_id` | **no** | FK proves the target *exists* (0007) — nothing proves it *approves* | yes |
| 5 | RATIFIED | **NOT REPRESENTED** | — | no | — | n/a |
| 6 | AUTHORIZED (domain-scoped) | **NOT REPRESENTED** | — | no | — | n/a |
| 7 | ALLOWED TO CONTROL EXECUTION | **NOT REPRESENTED** | — | no | — | n/a |

**Verified:** `evaluatePolicy()` consumes a policy if and only if `status = 'ACTIVE'` **and** the
current date falls inside its effective window. Nine fixtures spanning every lifecycle status
were planted; exactly one was consumed. DRAFT, IN_REVIEW, APPROVED, SUPERSEDED, SUSPENDED and
RETIRED policies are inert, as are ACTIVE policies outside their window.

**Does any code treat ACTIVE as equivalent to RATIFIED?** No. `src/lib/policy.ts` documents the
opposite in-source ("`status = 'ACTIVE'` alone is NOT sufficient to treat a policy as current")
and the token `RATIFIED` appears nowhere in `src/`. The gap is one of *absence*, not of
misinterpretation.

**Is the engine the primary gate?** No, and this matters for reading the attack matrix. Policy is
a documented defence-in-depth **overlay**: "Absence of an explicit ALLOW does not grant access;
RBAC/ABAC is evaluated independently in authz.ts (both must pass)." The engine returning ALLOW
for an unknown action is therefore not an escalation — `can()` independently refuses.

---

## 2. Gap register

### A. ALREADY RATIFIED / ENFORCED `[VERIFIED]`

| ID | Control | Authority | Evidence |
|----|---------|-----------|----------|
| A-1 | Audit and event ledgers reject UPDATE and DELETE | Art. 8 | attacks A1/A2/A6 blocked on real rows |
| A-2 | Audit and event ledgers reject TRUNCATE | Art. 8 | migration 0008; attacks A3/A4 blocked |
| A-3 | Policy effective window enforced on read | existing ratified effective-dating | Phase 5O; 8 of 9 status fixtures inert |
| A-4 | Policy effective window must be coherent | internal consistency with `financial_periods` | migration 0008 CHECK |
| A-5 | Deny-overrides precedence is deterministic | documented engine semantics | WORKFLOW DENY beat CONSTITUTION ALLOW; 20/20 identical |
| A-6 | Tenant policy scope fails closed on null tenant | Art. 9 | Phase 5P fix |
| A-7 | Journal tenant/entity scope | Art. 9 | migration 0006 |
| A-8 | `finance:ledger.post` is GROUP_CFO-only | existing RBAC | every role except CFO combined = denied |
| A-9 | AI cannot reach ledger posting | `CONST-AI-001 r3` | DENY under all role combinations |

### D. POLICY-INDEPENDENT DEFECT — FIXED THIS PHASE `[HARDENED]` `[POLICY-INDEPENDENT]`

**D-1 — Governance provenance columns had no referential integrity (systemic)**

- **Finding:** seven columns asserting "this object was authorised by that resolution" had no
  foreign key. Phase 5P fixed only `policies`.
- **Evidence:** in scratch DB, a capital request of USD 999,999 with status `APPROVED` was
  persisted citing `RES_DOES_NOT_EXIST_AT_ALL`. Affected: `beneficiaries`,
  `capital_requests`, `foundation_programs`, `regulatory_changes`, `tax_strategy_assessments`,
  `waterfall_configs`, `waterfall_runs`.
- **Current enforcement (before):** none. **Attack result:** SUCCEEDED.
- **Authority source:** Art. 4 — traceability "under which authority ... with which approvals".
  A citation pointing at nothing is not traceability.
- **Why policy-independent:** it asserts only that a cited object must *exist*. It encodes no
  view on who may approve what, nor that approval is required.
- **Risk:** fabricated or dangling governance provenance on financial and beneficiary records;
  silent loss of the audit trail if a resolution were removed.
- **Remediation:** migration `0009` — FK to `resolutions(id) ON DELETE RESTRICT` on all seven,
  matching the 0007 precedent.
- **Migration impact:** additive. **Historical-data impact:** none — 0 orphans across all seven
  columns, verified before writing. **Reversibility:** each FK is independently droppable.
- **Status:** FIXED, regression-tested, fault-injected (dropping one FK fails 3 tests).

**D-2 — Test teardown could leave production controls disarmed**

- **Finding:** `purge()` in `tests/finance/ledger-integrity.test.ts` disabled the ledger
  immutability triggers with no `try/finally`. Any failure between the disable and the re-enable
  left them OFF for the remainder of the run.
- **Risk:** later assertions in the same run become false passes; a security control is silently
  absent while tests report green.
- **Remediation:** restoration moved into `finally`; added `tests/security/control-restoration.test.ts`
  asserting that all nine required triggers exist and that **no** trigger anywhere is disabled.
- **Status:** FIXED. Complies with the standing rule that no test helper may silently weaken a
  production control.

### C. GOVERNANCE DECISION REQUIRED `[GOVERNANCE DECISION REQUIRED]`

These are real gaps that **cannot be closed without inventing a rule**, which is prohibited.

**C-1 — Policy approval linkage is optional and unvalidated**

- All five ACTIVE policies have `approved_by_resolution_id = NULL`. The FK guarantees a cited
  resolution exists; nothing requires a citation, or requires it to be `APPROVED`.
- **Why not fixed:** enforcing linkage would instantly deactivate `CONST-AI-001` — the article
  denying AI ledger posting — and disable the engine. The remedy is more dangerous than the
  defect until the five policies are retro-linked by the competent body.
- **Decision maker:** Board / Chief Governance Officer. **Required artifact:** a resolution
  retro-linking each ACTIVE policy, then a migration adding NOT NULL.

**C-2 — Capital requests may cite a non-approved resolution**

- `CAP-2025-004` (USD 1.8M, `UNDER_REVIEW`) cites `BEYU-IC-2025-021`, which is **TABLED** — a
  resolution that has not been decided.
- **Why not fixed:** requiring `APPROVED` would encode an unratified rule about what "cited by"
  means, and would invalidate existing seeded data. Whether a request may *reference* a pending
  resolution while awaiting its outcome is a governance question, not an engineering one.
- **Mitigation in place:** capital execution does not exist, so this cannot move money.
- **Decision maker:** Board / Group CFO.

**C-3 — No policy status state machine**

- Every illegal transition succeeds at the DB layer: `RETIRED→ACTIVE`, `SUPERSEDED→ACTIVE`,
  `DRAFT→ACTIVE`, `ACTIVE→DRAFT`. Only an invalid *enum value* is rejected.
- **Mitigating fact:** there is **no API route and no service function that writes to
  `policies`** — verified by inspection. Only direct SQL reaches it, i.e. an actor who could
  equally drop any constraint added.
- **Why not fixed:** nobody has defined which transitions are legal. Is `SUSPENDED→ACTIVE`
  reinstatement or must it be re-approved? Is `SUPERSEDED→ACTIVE` a legitimate incident rollback
  or forgery? **Decision maker:** Board / CGO.

**C-4 — Approved resolutions remain content-mutable**

- An `APPROVED` resolution's `status`, `title` and `decision_date` can be rewritten by direct SQL.
  Deletion is blocked (0007/0009 FKs); content is not frozen.
- **Mitigating fact:** the service layer enforces legal transitions — every status write in
  `governance-vote-service.ts` is guarded by a status-scoped `WHERE` (tabling requires `DRAFT`;
  deciding requires `TABLED`/`VOTED`).
- **Why not fixed:** freezing would forbid legitimate clerical correction with no ratified
  amendment procedure to replace it. Art. 5 prescribes "controlled reversal or adjustment" for
  *financial* history only. **Decision maker:** Board / CGO.

**C-5 — RATIFIED and EXECUTION-AUTHORITY are unrepresented**

- The system cannot express "this policy is ratified" or "this policy may control execution in
  domain X". **This is the core YELLOW condition.**
- **Why not fixed:** adding a `RATIFIED` enum value or an authorization table *is itself* a
  governance decision about what ratification means and who confers it. Creating it now would
  manufacture authority. See §4 below for the minimum contract, proposed but **not implemented**.

### E. ACCOUNTING-RATIFICATION DEPENDENT `[ACCOUNTING RATIFICATION REQUIRED]` `[BLOCKED]`

P1–P11 remain pending (P4 partially authorised only). All of the following remain **absent by
design** and were re-verified this phase: chart of accounts (0 rows), financial periods (0 rows),
posting service (no such module), recognition rules, CAPEX/depreciation/impairment/disposal, FX
engine, tax/VAT/WHT accounting, opening balances, maker/checker, `finance:ledger.approve`
(0 definitions), capital execution, treasury settlement, intercompany accounting.

**Firewall verified:** journal entries 0, journal lines 0, ledger accounts 0, financial periods 0,
FUNDED capital requests 0. No pending accounting judgement was found embedded in code.

### F. CONSTITUTIONALLY REQUIRED — outstanding

**F-1 — `ENT-FIN-005` is cited by waterfall tier 4 but does not exist** (carried forward).
**F-2 — `CTL-FIN-002` is marked EFFECTIVE over a mechanism that does not exist**; no
`control_tests` table. Assurance misstatement — **owner action required**. Never modified.

---

## 3. What would close the YELLOW gate — minimum authority contract (§4, PROPOSED ONLY)

To distinguish states 4–7, the smallest change consistent with the existing schema would be:

1. **Provenance (state 4)** — already expressible: `approved_by_resolution_id` + FK. Closing it
   needs *data* (retro-linkage) and a NOT NULL migration, not new architecture.
2. **Ratification (state 5)** — expressible **without new tables** as the conjunction
   *policy is ACTIVE* ∧ *cited resolution exists* ∧ *cited resolution status = `APPROVED`*.
   The schema can already represent every term; only the *rule* is missing.
3. **Execution authority (states 6–7)** — **not** expressible today. It needs a mapping from a
   policy to the execution domain it governs.

**Proof the existing schema cannot express state 6/7:** `policies` carries `domain`,
`level`, `classification` and `owner_role`, none of which state *which execution capability* the
policy is authorised to gate. No join path exists from `policies` to any permission or capability
identifier.

**Therefore states 4 and 5 need no schema change** — only a ratified decision plus data. Only
states 6–7 would need new structure, and defining it encodes a governance decision, so it is
classified `[GOVERNANCE DECISION REQUIRED]` and **is not implemented**.

---

## 4. Standing risk statement

BEYU OS can prove *what a policy says*, *when it applies*, and now *that the authority it cites
exists*. It still cannot prove *that the cited authority approved it*, nor *that it is entitled
to control execution*. Until C-1 and C-5 are resolved by the competent body, **no policy in BEYU
OS may be cited as evidence of ratified authority** in an assurance, audit or financial-execution
context.

---

## 5. Phase 5S addendum — firewall verification and decision packaging

No new authority appeared (0 commits since 5R; both APPROVED resolutions concern waterfall
configuration and beneficiary verification, neither of which touches C-1..C-5). **Outcome B.**

**Corrections to earlier assumptions, established empirically in 5S:**

* **C-2 is materially less severe than recorded.** The capital gate *does* distinguish resolution
  status — `getGovernanceDecisionAuthorization()` authorises on `APPROVED` only, and
  `CAP-2025-004` is refused with "Resolution BEYU-IC-2025-021 is TABLED". A **second** gate
  requires `provenance === "GOVERNED"`; all four seeded resolutions are `REFERENCE_DATA`, so no
  seeded resolution can authorise a capital transition at all. Only the question of whether a
  request may *reference* a pending resolution remains open.
* **The policy engine cannot conflate ACTIVE with APPROVED**, because it never reads
  `approved_by_resolution_id`. Proven: policies with NULL, TABLED and APPROVED provenance are
  consumed identically (12-case matrix, 3 consumed, all ACTIVE+in-window).
* **The accounting firewall holds.** Ten of eleven accounting capabilities are undefined and
  denied to *every* role combination; `finance:ledger.post` remains CFO-only. With 0 chart of
  accounts rows and 0 financial periods, no posting is representable even if it were authorised.

**New in 5S:** `tests/security/authority-firewall.test.ts` (24 tests) pins all three firewalls.
Fault-injected twice — relaxing the engine's lifecycle predicate fails 6 tests; defining
`capital:execute` as a permission fails 2 — then restored.

**Harness re-audit:** all trigger disabling occurs inside `try/finally`; every test cleanup is
namespaced to test-created ids; **0 seeded resolutions match any test cleanup pattern**.

**Decision artifacts produced:** `C1_POLICY_PROVENANCE_DECISION.md` (two options, unrecommended,
blank decision block) and `AUTHORITY_LIFECYCLE_CONTRACT.md` (C-2..C-5 audit and the seven-state
chain). Both `[NOT AUTHORITY]`.
