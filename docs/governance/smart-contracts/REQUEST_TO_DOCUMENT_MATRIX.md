# BEYU-SCG-11 — Request-to-Document Matrix

Document ID: `BEYU-SCG-11`
Title: Request-to-Document Matrix
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`INFORMATIONAL`**
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Related documents: `BEYU-SCG-PHASE0`, `BEYU-SCG-01`…`BEYU-SCG-14`
Depends on: nothing

> **HOW TO READ THIS MATRIX.** Every row is a capability, control or question the engagement needed to
> address. The matrix says **which document addresses it**, and — more importantly — **whether that
> document actually settles anything**. Rows are derived from the Phase 0 audit and the confirmed
> Phase 1 scope (documentation pack with a machine-readable inventory). **Where a row says
> `PENDING DECISION`, `BLOCKED` or `NOT ESTABLISHED`, no document in this pack fixes it, and no
> reader may treat the existence of a document as the existence of the thing.**

**Status vocabulary used in this matrix**

| Status | Meaning |
|---|---|
| `DRAFTED` | A document exists and states the governance position; **it is not approved** |
| `DRAFTED_AS_PROCEDURE` | A procedure is drafted; it cannot operate until named appointments/inputs exist |
| `SPECIFIED_EMPTY` | A register specification exists; the register itself is **empty** |
| `PENDING_DECISION` | Blocked on a human decision (`[TO BE DECIDED]`) |
| `BLOCKED` | Blocked on something this environment cannot obtain (counsel's answer, external verification) |
| `NOT_ESTABLISHED` | Nothing in the repository establishes it; the pack records the absence honestly |
| `CODE_BOUNDARY` | The constraint is enforced by code; this pack restates it and cannot weaken it |

---

## 1. Authority and decision rights

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 1 | Written authority framework for smart contracts | `BEYU-SCG-01` | `DRAFTED` + `PENDING_DECISION` | Reserved-matter schedule is `[PROPOSED]`; no threshold set |
| 2 | Human authority vs software state; legal-effect ladder position of chain records | `BEYU-SCG-01` §2 | `DRAFTED` | Cites the legal pack's ladder; asserts no legal effect |
| 3 | Reserved matters for on-chain acts (deploy, upgrade, pause, custody, oracle, issuance, decommission) | `BEYU-SCG-01` §5 | `PENDING_DECISION` | SC-RM-01…SC-RM-10 unadopted |
| 4 | Segregation of duties, conflicts, MFA boundary | `BEYU-SCG-01` §7 | `DRAFTED` | MFA/human-only boundary already enforced by permissions |
| 5 | Evidence rules: what may support a decision; what never may | `BEYU-SCG-01` §8 | `DRAFTED` | Data as evidence explicitly refused |

## 2. Lifecycle, gates and execution

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 6 | Contract lifecycle states, terminal/performing/pre-execution sets | `BEYU-SCG-02` §2 | `CODE_BOUNDARY` | 20 states, verified in code |
| 7 | Review-gate ownership and closure evidence | `BEYU-SCG-02` §2.1 | `DRAFTED` + `PENDING_DECISION` | Gate owners `[TO BE APPOINTED]` |
| 8 | Authority checks (16 kinds, 4 results) | `BEYU-SCG-02` §2.2 | `CODE_BOUNDARY` | Enforcement already in the engine |
| 9 | Smart-contract registry progression, testnet-first, no revival | `BEYU-SCG-02` §3 | `CODE_BOUNDARY` | Edge set verified; no shortcut to mainnet |
| 10 | Execution packages, seven gates, production multisig + timelock | `BEYU-SCG-02` §4 | `CODE_BOUNDARY` | `permitted: true` is a posture, not permission |
| 11 | Human execution decision recorded before an external signer acts | `BEYU-SCG-02` L-12, `BEYU-SCG-08` `R-APP-01` | `SPECIFIED_EMPTY` | Register empty |

## 3. Signing, custody and attestation

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 12 | No keys in the repository; no signing capability | `BEYU-SCG-03` §1, K-1 | `CODE_BOUNDARY` | Structural: no signer, no key column, no web3 dependency |
| 13 | What a signature proves and what it never proves | `BEYU-SCG-03` §2 | `DRAFTED` | Method is metadata; enforceability stays open |
| 14 | Custody model, quorum, ceremony, rotation, revocation, insurance, audit | `BEYU-SCG-03` §3 | `PENDING_DECISION` | K-8…K-18 undecided; no custodian |
| 15 | Address-as-identity prohibition | `BEYU-SCG-03` K-2, K-3 | `DRAFTED` | No BEYU address exists to publish |
| 16 | Register of custody arrangements | `BEYU-SCG-08` `R-CUS-01` | `SPECIFIED_EMPTY` | ZERO entries |

## 4. Automation

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 17 | Automation classes A1–A7 and what each may do | `BEYU-SCG-04` §2 | `DRAFTED` | A7 external execution prohibited |
| 18 | Absolute prohibitions binding every automation | `BEYU-SCG-04` §3 | `DRAFTED` | 13 prohibitions, incl. no timer, no posting, no model-as-risk-score |
| 19 | Where a human must bind | `BEYU-SCG-04` §4 | `DRAFTED` | Digest/version/expiry binding already enforced |
| 20 | Failure behaviour (fail closed; nothing hidden) | `BEYU-SCG-04` §5 | `CODE_BOUNDARY` | Verified in ingestion, scheduler, idempotency |
| 21 | Automation register (authorisation) | `BEYU-SCG-08` `R-AUT-01` | `SPECIFIED_EMPTY` | **ZERO authorised automations** |
| 22 | Machine-readable inventory of automations that exist | `BEYU-SCG-04A` | `DRAFTED` | 23 entries, 6 human bindings, derived from code |
| 23 | Process for adding or changing an automation | `BEYU-SCG-04` §7 | `DRAFTED` | Requires a refusal test and a register entry |

## 5. External data (oracles)

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 24 | Governed feeds, source kinds, deviation limits, max ages | `BEYU-SCG-05` §2 | `CODE_BOUNDARY` | Measured values reproduced exactly |
| 25 | Fail-closed oracle rules (9 rules) | `BEYU-SCG-05` O-1…O-9 | `CODE_BOUNDARY` | Reading is input, never authority |
| 26 | Source approval register and verification status discipline | `BEYU-SCG-05` §3, `BEYU-SCG-08` `R-ORA-01` | `SPECIFIED_EMPTY` | **ZERO approved sources** |
| 27 | Uncertainty policy for repository authority data (`UTT_AMIS`, `TMX`, `TRAB`) | `BEYU-SCG-05` O-18 | `DRAFTED` | `uncertain: true` rows may never be an `authorityRef` |
| 28 | Data-source disputes and impact assessment | `BEYU-SCG-05` §4 | `DRAFTED` | No silent history correction |

## 6. Evidence and reconciliation

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 29 | Anchor verification requirements; reorg candidates never healed | `BEYU-SCG-06` §2 | `CODE_BOUNDARY` | Confirmation depths per network recorded |
| 30 | What each artefact may and may not prove | `BEYU-SCG-06` §3 | `DRAFTED` | Ownership stays `OWNERSHIP UNESTABLISHED` absent instruments |
| 31 | Reconciliation finding codes and escalation | `BEYU-SCG-06` §4 | `DRAFTED` | Same-day escalation for `UNAUTHORIZED_TRANSFER`/`UNKNOWN_HOLDER` (proposed) |
| 32 | Publication rule for on-chain commitments | `BEYU-SCG-06` §6, E-19 | `DRAFTED` | Recomputability requirement |
| 33 | Evidence archive register | `BEYU-SCG-08` `R-EVD-01` | `SPECIFIED_EMPTY` | ZERO artefacts |
| 34 | Reconciliation/escalation register | `BEYU-SCG-08` `R-REC-01` | `SPECIFIED_EMPTY` | ZERO findings |

## 7. Incidents, upgrades and rollback

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 35 | Incident classes and severity guide | `BEYU-SCG-07` §2 | `DRAFTED` | Ten classes |
| 36 | Roles and separation in a response | `BEYU-SCG-07` §3, R-1 | `PENDING_DECISION` | `[TO BE APPOINTED]` |
| 37 | First-hour containment actions that BEYU can actually take | `BEYU-SCG-07` §4 | `DRAFTED` | Includes the honest limits: no keys, no recovery |
| 38 | Pause/unpause/revocation decision rights | `BEYU-SCG-07` §5 | `DRAFTED` | Automation may never resume what a human paused |
| 39 | Upgrade process with mandatory rollback plan | `BEYU-SCG-07` §6, R-3 | `DRAFTED` | No upgrade possible today |
| 40 | Evidence preservation, legal hold, privilege | `BEYU-SCG-07` §7 | `DRAFTED` | |
| 41 | Notification duties and deadlines | `BEYU-SCG-07` §8 | `BLOCKED` | **No deadline asserted** — counsel must identify duties |
| 42 | Post-incident review requirement | `BEYU-SCG-07` §9 | `DRAFTED` | Ten working days (proposed) |
| 43 | Incident register | `BEYU-SCG-08` `R-INC-01` | `SPECIFIED_EMPTY` | ZERO incidents |

## 8. Assurance, questions and control documents

| # | Item | Document | Status | Note |
|---|---|---|---|---|
| 44 | Testing and verification standard; what a green suite proves | `BEYU-SCG-09` | `DRAFTED` | Baseline measurements recorded with skips |
| 45 | Proposed additional mechanical checks (V-3…V-7) | `BEYU-SCG-09` §4 | `PENDING_DECISION` | **Not implemented**; a code change would be required |
| 46 | Counsel questions (20, Tanzania-first) | `BEYU-SCG-10` | `DRAFTED` | None answered |
| 47 | Verification of this pack's own consistency and honesty | `BEYU-SCG-12` | `DRAFTED` | Exact commands and observed output recorded |
| 48 | Deliverables, non-deliverables, blockers, next action | `BEYU-SCG-13` | `DRAFTED` | Merge blockers listed |
| 49 | Register of every document in this pack | `BEYU-SCG-14` | `DRAFTED` | Paths verified to resolve |
| 50 | Relationship to the legal pack (no duplication, no renumbering) | `README` §10, `BEYU-SCG-11` §9 | `DRAFTED` | Legal pack untouched |
| 51 | Non-establishment statements | every document | `DRAFTED` | Each ends with what it does not establish |

## 9. What this matrix does not do

It does not adopt anything, appoint anyone, populate any register, answer any question, or convert a
drafted document into an operative one. It is an index of coverage and of gaps — and the gaps are the
honest part.
