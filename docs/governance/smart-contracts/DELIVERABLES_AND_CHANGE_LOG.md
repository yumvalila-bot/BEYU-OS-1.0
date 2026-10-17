# BEYU-SCG-13 — Deliverables and Change Log

Document ID: `BEYU-SCG-13`
Title: Deliverables and Change Log
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Related documents: all of `BEYU-SCG`
Depends on: nothing

> **Control block.** This document reports what was produced, what was deliberately not produced, what
> a reviewer must still decide, and what a merge would and would not authorise. **Nothing in it
> authorises anything.**

---

## A. What was delivered

| # | Deliverable | Path | Status |
|---|---|---|---|
| A1 | Phase 0 audit of the repository for this engagement (30 classified findings) | `PHASE-0_SHARED_SMART_CONTRACT_GOVERNANCE_AUDIT.md` | `INFORMATIONAL` |
| A2 | Pack README: scope, vocabulary, boundaries, single sources | `README.md` | `DRAFT FOR PROFESSIONAL REVIEW` |
| A3 | Smart contract authority framework (reserved matters, fail-closed rules, evidence rules) | `SMART_CONTRACT_AUTHORITY_FRAMEWORK.md` | `PRELIMINARY_FRAMEWORK` |
| A4 | Contract and smart-contract lifecycle governance (states, gates, progression, execution) | `CONTRACT_AND_SMART_CONTRACT_LIFECYCLE_GOVERNANCE.md` | `PRELIMINARY_FRAMEWORK` |
| A5 | Signing, key custody and attestation governance | `SIGNING_KEY_CUSTODY_AND_ATTESTATION_GOVERNANCE.md` | `CONDITIONAL_DRAFT` |
| A6 | Automation governance (classes, prohibitions, human bindings, failure behaviour) | `AUTOMATION_GOVERNANCE.md` | `PRELIMINARY_FRAMEWORK` |
| A7 | Machine-readable automation inventory (23 automations, 6 human bindings, derived from code) | `AUTOMATION_INVENTORY.json` | `INFORMATIONAL` |
| A8 | Oracle and external data governance (feeds, limits, source register, uncertainty policy) | `ORACLE_AND_EXTERNAL_DATA_GOVERNANCE.md` | `PRELIMINARY_FRAMEWORK` |
| A9 | On-chain evidence and reconciliation governance | `ONCHAIN_EVIDENCE_AND_RECONCILIATION_GOVERNANCE.md` | `PRELIMINARY_FRAMEWORK` |
| A10 | Incident, pause, upgrade and rollback runbook | `INCIDENT_PAUSE_UPGRADE_AND_ROLLBACK_RUNBOOK.md` | `CONDITIONAL_DRAFT` |
| A11 | Nine register specifications, all empty | `REGISTERS_AND_TEMPLATES.md` | `TEMPLATE_NOT_EXECUTED` |
| A12 | Testing and verification standard, with the measured baseline | `TESTING_AND_VERIFICATION_STANDARD.md` | `PRELIMINARY_FRAMEWORK` |
| A13 | 20 counsel questions for the smart-contract and automation domain | `COUNSEL_QUESTIONS.md` | `INFORMATIONAL` |
| A14 | Request-to-document matrix (51 items) | `REQUEST_TO_DOCUMENT_MATRIX.md` | `INFORMATIONAL` |
| A15 | Verification log (14 checks, 4 self-found defects, limitations) | `VERIFICATION_LOG.md` | `INFORMATIONAL` |
| A16 | This deliverables and change record | `DELIVERABLES_AND_CHANGE_LOG.md` | `INFORMATIONAL` |
| A17 | Master document register of the pack | `MASTER_DOCUMENT_REGISTER.md` | `INFORMATIONAL` |

**Change-set shape:** documentation only. **No code, schema, migration, configuration, environment,
deployment, secret or live record was created or modified.** The change set is confined to
`docs/governance/smart-contracts/`; the legal pack under `docs/governance/legal-foundations/` was not
edited by this engagement.

## B. What was deliberately not done

| # | Not done | Why |
|---|---|---|
| B1 | No deployment, upgrade, pause, signature, transaction or broadcast | No deployment exists; BEYU holds no keys; SC-RM decisions unadopted |
| B2 | No register populated | Registers require decisions, appointments and real deployments — none exist; an empty register is the accurate record |
| B3 | No automation authorised | Authorisation is a board act (SC-RM-07); the pack supplies the register, not the authorisation |
| B4 | No source approved; no oracle verified | Verification requires access to the source; the environment cannot reach it |
| B5 | No new mechanical check implemented (V-3…V-7) | The confirmed scope was documentation; implementing checks is a code change requiring its own review |
| B6 | No legal citation added; no statutory position asserted | Counsel must answer; this environment cannot reach Tanzanian primary sources |
| B7 | No code defect fixed (the two documentation-drift observations in `payments/risk.ts` and `payments/ingest.ts`) | A documentation-only change set must not smuggle a code change; recorded instead (`BEYU-SCG-04` AU-OPEN-06). **Phase 2 note:** both were fixed in a **separate, clearly labelled commit** once the change set was no longer documentation-only — the separation this entry was protecting was preserved in substance, not abandoned |
| B8 | No legal-pack document amended, renumbered or superseded | The legal pack is owned by its own engagement; this pack cross-references it |
| B9 | No entity, appointment, instrument or custody arrangement created or named | Outside this engagement's authority and the repository's evidence |

## C. Merge blockers

| ID | Blocker | Owner |
|---|---|---|
| M1 | **No body is evidenced as constituted**, so the framework's approving authority does not exist and nothing in the pack can be adopted | BEYU (formation and appointments) |
| M2 | **No custody decision and no custodian** — mainnet acts remain prohibited by governance regardless of software posture | Board `[TO BE DECIDED]` |
| M3 | **Blocking counsel questions unanswered** (`BEYU-SCG-10`: Q-SCG-01…Q-SCG-04, Q-SCG-07, Q-SCG-09, Q-SCG-11, Q-SCG-12, Q-SCG-15, Q-SCG-19) | Counsel |
| M4 | **Automation register empty** — intended, but a reviewer must not read the inventory (A7) as authorisation | Reviewer's understanding; board for authorisation |
| M5 | **PARTIALLY CLEARED in Phase 2.** `V-3`, `V-4`, `V-4A`, `V-6` and `V-7` are implemented (`npm run verify:scg`, `tests/smart-contracts`). **Still open:** `V-5` is a human procedure (`BLK-19`); `V-3`'s coverage is a floor, not a completeness proof (`BLK-20`); a static scan cannot prove absence of a capability (`BLK-22`) | Engineering, under review |
| M6 | **The branch now carries three workstreams** (the legal pack, the smart-contract pack, and the Phase 2 enforcement code) — **and is no longer documentation-only**, so this pack's own `V-09` reads SUPERSEDED | Reviewer / owner decision on how to sequence the merge; see `BEYU-SCG-17` §4 for the split recommendation (**recommendation only — not executed**) |
| M7 | **Twenty-six open blockers remain, none cleared** — classified by the authority that can clear each | `BEYU-SCG-16` |

*Legend: status is not `BLOCKED` in the pack sense — these are blockers to **adoption and reliance**,
not to merging a documentation pack that states them.*

## D. What a merge does and does not authorise

A merge of the branch carrying this pack:

1. does **not** approve, adopt or ratify any document, threshold, reserved matter or automation;
2. does **not** authorise a deployment, an upgrade, a pause, a signature, a transaction or a payment;
3. does **not** create a custodian, a key, an address or a custody arrangement;
4. does **not** authorise any oracle source or external provider;
5. does **not** authorise any register to be populated from seed, demo or synthetic data;
6. does **not** make any statement legally effective, nor close any counsel question;
7. does **not** change `CAP_POSTING`, which remains LOCKED;
8. does **not** change a single line of code, schema or configuration — and therefore cannot be cited
   as an engineering change, a fix or an improvement.

## E. Change log

### v1.0 — 2026-10-15 (initial pack, post-audit)

**Added:** the 17 registered deliverables in §A.

**Not modified:** the legal pack; any source file; any migration; any configuration.

**Defects found by this pack's own verification and fixed within it** (see `BEYU-SCG-12` §3):
`D-1` a wrong legal-pack filename reference in `SCG-10`; `D-2` a wrong directory in a
`BEYU-SCG-14` cross-reference; `D-3` an over-strong word ("guarantees") in `SCG-06`; `D-4` a missing
non-establishment statement in `SCG-14`.

**Deliberately kept open** (recorded, not fixed here): the two documentation-drift observations in the
payments modules (`BEYU-SCG-04` AU-OPEN-06); every `[TO BE DECIDED]`, `[TO BE APPOINTED]`,
`[USER TO SUPPLY]`, `[COUNSEL TO CONFIRM]` and `REQUIRES VERIFICATION` marker.

### Next revision triggers

Any of: adoption of a reserved matter; a custody decision or custodian appointment; any deployment or
upgrade; any new or changed automation; any approved oracle source; any incident; any counsel answer
received; any change to the code boundaries this pack restates.

## F. Verification performed, and its limits

Performed: the 14 checks in `BEYU-SCG-12` (register resolution, status vocabulary, completion-label
audit, secret/address scan, register zero-states, JSON validity, cross-reference resolution,
forbidden-OS scan, documentation-only footprint, statutory-citation scan, promise scan,
non-establishment coverage, and an institutional-fact review against the audit). Four defects were
found and fixed; the rest passed.

**Limits:** content checks are not legal, security or assurance opinions; no chain, provider,
registry, bank or regulator was contacted; the repository's own suite result (5,292 passed, 0 failed,
38 files skipped) describes **software behaviour only**.

## G. Next actions

**Single next action:** instruct a qualified Tanzanian advocate on the `[BLOCKING]` questions in
`BEYU-SCG-10` — Q-SCG-01…Q-SCG-04, Q-SCG-07, Q-SCG-09, Q-SCG-11, Q-SCG-12, Q-SCG-15, Q-SCG-19 —
before any external reliance is placed on this pack.

**Ordered follow-ups:**

1. Settle whether BEYU intends to deploy anything on a public network at all. If the answer is no,
   most of this pack becomes latent governance rather than a live programme — and saying so is a
   legitimate outcome.
2. If yes: decide the custody model (SC-RM-04) and appoint the custodian before any address exists.
3. Adopt the reserved-matter schedule into `BEYU-LF-D27` and `BEYU-LF-D04` §7.
4. Populate `R-AUT-01` by decision for the automations that already exist; until then, treat them as
   **unauthorised but active-in-code** — a state the board should be told about explicitly.
5. Implement the proposed checks (V-3…V-7) as a separate engineering change with its own tests.

## H. What this document does not establish

It approves nothing, adopts nothing, certifies nothing, and does not convert any draft into an
operative instrument. It records what was written, what was not, and what must happen first.
