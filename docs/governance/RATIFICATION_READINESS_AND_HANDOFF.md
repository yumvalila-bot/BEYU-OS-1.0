# Ratification Readiness & Engineering→Authority Handoff

**Status:** `[NOT AUTHORITY]` — readiness assessment and action queue. Decides nothing.
**Phase:** 5T · Branch `arena/01a01b69-beyu-os-1-0`
**Accounting authority:** `NOT RATIFIED`

This is the handoff document. Engineering work that can be done without authority is complete;
what remains requires named humans to decide.

---

## 1. P1–P11 dependency graph (§4)

```
        C-1  policy provenance          <-- CRITICAL PATH, blocks C-5
              |
              v
        C-5  ratification semantics
              |
   +----------+-------------------------------------------+
   |                                                       |
   v                                                       v
 P1 recognition basis          [CFO]              P5 CoA scope      [CFO + ARB]
   |                                                       |
   +--> P2 capital treatment   [CFO]                       +--> P6 initial CoA tranche [CFO]
   |      |                                                        ^
   +--> P3 measurement         [CFO + tax specialist]              |
          |                                                        |
          +--------------------> (P1, P5 both required) -----------+
                                                                   |
 P7 fiscal calendar   [CFO + BOARD for fiscal year]                |
   |                                                               |
   v                                                               |
 P8 period lifecycle  [CFO]                                        |
                                                                   |
 P4 currency / FX     [CFO + IAS 21 specialist]  -- independent    |
 P9 maker / checker   [CFO; BOARD if authority moves] -- independent
                                                                   |
                    all of the above                               |
                              |  <--------------------------------+
                              v
                     P10 pilot transaction   [CFO under ENT-FIN-002]
                              |
                              v
                     P11 execution boundary  [CFO; BOARD if new capability]
```

**Independent — ratifiable in parallel:** P1, P5, P7, P4, P9.
**Dependent:** P2←P1 · P3←P1 · P6←P1,P5 · P8←P7 · P10←P1..P9 · P11←P10.

| Aspect | Affected decisions |
|---|---|
| Requires **Board** | P7 (fiscal year), P9 (if authority moves), P11 (if new capability) |
| Requires **specialist** | P3 (VAT), P4 (IAS 21 FX) |
| Requires **Architecture Review Board** | P5 (Art. 11 canonical change) |
| Affects **schema/migration** | P5 (models B/C/D only), P4 (rate source, eventually) |
| Affects **permissions** | P9, P11 (only if a new capability is ratified) |
| Affects **historical data** | none today — the ledger is empty |
| Affects **financial execution** | P10, P11 |
| Safely **deferrable** | P4 (not needed for a single-functional-currency pilot), P6 accounts 3–5 |

**Minimum sequence to unlock implementation:** `C-1 → P1 → P5 → P6 → P7 → P8 → P2 → P3 → P9 → P10`.
P4 may be deferred if the pilot is single-currency; P11 is required only before execution.

---

## 2. Implementation-readiness matrix (§7)

| Decision | Authority required | Status | Engineering dependency | Implementation artifact | Migration? | Test? | Security review? | Specialist? | Blocker |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | Board / CGO | **BLOCKED BY AUTHORITY** | none | decision block in `C1_POLICY_PROVENANCE_DECISION.md` | only if Option A | yes | yes | no | no decision |
| C-2 | Board / CFO | **BLOCKED BY AUTHORITY** | C-1 | rule on referencing pending resolutions | additive | yes | no | no | dangerous half already blocked |
| C-3 | Board / CGO | **BLOCKED BY AUTHORITY** | none | legal transition matrix | trigger only | yes | yes | no | no write path exists today |
| C-4 | Board / CGO | **BLOCKED BY AUTHORITY** | none | amendment procedure | trigger only | yes | yes | no | no procedure defined |
| C-5 | Board | **BLOCKED BY DEPENDENCY** | C-1 | ratification semantics | tbd | yes | yes | no | depends on C-1 |
| P1 | CFO | **CFO REQUIRED** | C-1 | §3c block | no | yes | no | no | not ratified |
| P2 | CFO | **BLOCKED BY DEPENDENCY** | P1 | §3c block | no | yes | no | no | P1 |
| P3 | CFO + tax specialist | **SPECIALIST REQUIRED** | P1 | §3c block | no | yes | no | VAT | P1 |
| P4 | CFO + IAS 21 specialist | **SPECIALIST REQUIRED** | none | §3c block | eventually | yes | no | FX | deferrable |
| P5 | CFO + ARB | **BOARD REQUIRED** (Art. 11) | none | §3c block | models B/C/D | yes | yes | no | not ratified |
| P6 | CFO | **BLOCKED BY DEPENDENCY** | P1, P5 | §3c block | no (rows only) | yes | no | no | P1, P5 |
| P7 | CFO + **Board** | **BOARD REQUIRED** | none | §3c block | no | yes | no | no | not ratified |
| P8 | CFO | **BLOCKED BY DEPENDENCY** | P7 | §3c block | no | yes | no | no | P7 |
| P9 | CFO; Board if authority moves | **CFO REQUIRED** | none | §3c block | no | yes | yes | no | not ratified |
| P10 | CFO under `ENT-FIN-002` | **BLOCKED BY DEPENDENCY** | P1–P9 | §3c block | no | yes | yes | no | all above |
| P11 | CFO; Board for new capability | **BLOCKED BY DEPENDENCY** | P10 | §3c block | if capability | yes | yes | no | P10 |

**Nothing is `READY`.** No row is marked READY merely because code could be written.

---

## 3. Minimum-change implementation plan, to execute ONLY after ratification (§8)

Executed strictly in dependency order, one ratified decision at a time:

1. **Consume the ratified decision** — read the completed `§3c` block. Reject anything not at
   `RATIFIED / EFFECTIVE`.
2. **Verify authority** — confirm the backing resolution is `APPROVED` **and** evaluates to
   `provenance = GOVERNED`, not `REFERENCE_DATA`.
3. **Implement the smallest change** that satisfies the ratified decision's acceptance criterion.
4. **Migration only if unavoidable** — numbered, additive, with snapshot/journal, clean-install
   and upgrade fingerprint parity, and drift check.
5. **Behavioural regression tests**, plus fault injection proving each new control non-vacuous.
6. **Full validation** — typecheck, lint, build, suite twice, BEFORE→AFTER financial state.

**Preserved without exception:** existing architecture, migrations 0000–0009, the security model,
tenant and entity isolation, the governance model, working functionality, the test harness, all
nine database controls.

**Explicitly prohibited, even if convenient:** rebuilding or rescaffolding · speculative schema
changes · speculative accounting logic · speculative chart of accounts · speculative periods ·
speculative FX rules · speculative tax rules · speculative capitalisation rules · speculative
maker/checker semantics · speculative ratification states or enum values.

---

## 4. What the system proves, and what it cannot (§6)

| The system PROVES | The system does NOT prove |
|---|---|
| A policy exists, is ACTIVE, and is within its effective window | That any policy was approved by anyone |
| A cited resolution exists (FK, `ON DELETE RESTRICT`) | That the citation means the resolution *approves* the policy |
| Only an `APPROVED` resolution authorises a capital transition | That a policy is ratified or execution-eligible |
| `provenance = GOVERNED` distinguishes governed decisions from seed data | Which execution domain a policy is entitled to govern |
| Audit and event history cannot be UPDATEd, DELETEd or TRUNCATEd | — |
| Unratified accounting capabilities are undefined and ungrantable | — |

**Engineering may safely consume:** lifecycle status, effective dating, tenant/entity scope,
resolution status, `GOVERNED` provenance.
**Engineering must reject:** any claim that ACTIVE implies approved or ratified; any ratification
supplied as seed data or direct edit; any accounting value not present in a completed `§3c` block.

---

## 5. Human action queue (§11) — ordered by dependency

**1. Decide C-1 — policy provenance**
· *Decision maker:* Group Board / Chief Governance Officer
· *Artifact:* `docs/governance/C1_POLICY_PROVENANCE_DECISION.md`
· *Decision:* is provenance to an approving resolution mandatory for ACTIVE policies?
· *Unlocks:* C-5, and the ability to state that any BEYU policy is ratified. **If Option A:
remediation must be data first, constraint second — the reverse order deactivates all five ACTIVE
policies including `CONST-AI-001` and disables the policy engine.**

**2. Resolve the CFO approval-authority question**
· *Decision maker:* Group Board
· *Artifact:* `AUTHORITY_LIFECYCLE_CONTRACT.md` Part 7
· *Decision:* `GROUP_CFO` does not hold `governance:resolution.approve`, yet is named approving
authority for ten P-decisions. Choose: (a) CFO determines, an authorised body records; (b) Board
ratifies directly; (c) grant the CFO approval authority — which collapses separation of duties.
· *Unlocks:* a followable ratification path for P1–P11.

**3. Ratify the independent accounting decisions — P1, P5, P7, P9**
· *Decision makers:* Group CFO; **Group Board** for P7's fiscal year; CFO + ARB for P5
· *Artifact:* `§3c` blocks in `DRAFT_ACCOUNTING_POLICY_RATIFICATION_PACKAGE.md`
· *Unlocks:* P2, P3, P6, P8 — and the first migration that may legitimately create accounting
structure.

**4. Commission specialist reviews — P3 (VAT), P4 (IAS 21)**
· *Decision makers:* Group CFO plus the named specialists
· *Unlocks:* measurement and any cross-currency posting. Deferrable if the pilot is
single-functional-currency.

**5. Ratify the dependent decisions, then P10 and P11**
· *Decision maker:* Group CFO under `ENT-FIN-002`; Board for any new capability
· *Unlocks:* the accounting substrate, the posting service, and finally capital execution.

**6. Optional, lower urgency — decide C-2, C-3, C-4**
· *Decision maker:* Board / CGO
· These are lower risk than they appear: the dangerous half of C-2 is already blocked, C-3 has no
application write path, and C-4's audit trail is immutable.

---

## 6. Next engineering phase — valid only AFTER step 3

**Phase 6 — Ratified Accounting Substrate.** Becomes valid once P1, P5, P6 and P7 are ratified
*and* verifiable as `GOVERNED`. Scope: create exactly the ratified chart-of-accounts rows and
financial periods, nothing more. No posting service until P8 and P9 are ratified.

Until then, any further engineering phase would either re-audit proven controls or invent
governance semantics. **Neither is legitimate work.**
