# BEYU-SCG-02 — Contract and Smart-Contract Lifecycle Governance

Document ID: `BEYU-SCG-02`
Title: Contract and Smart-Contract Lifecycle Governance
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the lifecycle described here exists in code and was verified by
the Phase 0 audit; the **governance** around it (who closes which gate, with which evidence) is
`[PROPOSED]` and unadopted.
Owner (proposed): Chief Governance Officer with the Company Secretary function `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board (company-side gates); BEYU Family Trust
trustees (trust-engaged gates) `[NEITHER BODY IS REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`
Classification: `INTERNAL`
Related documents: `BEYU-SCG-01`, `BEYU-SCG-03`, `BEYU-SCG-06`, `BEYU-SCG-07`, `BEYU-SCG-08`; legal pack: `BEYU-LF-D27`, `BEYU-LF-D28`, `BEYU-LF-D73`, `BEYU-LF-D74`, `BEYU-LF-EMP-01`, `BEYU-LF-NDA-01`, `BEYU-LF-RC-01`, `BEYU-LF-D41`, `BEYU-LF-D23`
Depends on: adoption of the reserved-matter schedule (`BEYU-SCG-01` §5); counsel's answers (`BEYU-SCG-10`); the appointment of gate owners

> **CONTROL BLOCK.**
> **This is** the governance of a lifecycle that already exists in the platform: which states a
> contract or a smart-contract registry record may occupy, who may move it, and what evidence each
> move requires.
> **This is not** a claim that any contract, deployment or registry record exists, nor that any
> lifecycle state has legal effect. **A software state is not a legal status** (`BEYU-SCG-01` §3).
> **Prohibited content:** no registration numbers, no addresses, no fabricated counterparties, no
> legal conclusions about the effect of any state.

---

## 1. Two lifecycles, deliberately separate

| Lifecycle | Subject | Where it lives | What it decides |
|---|---|---|---|
| **Contract lifecycle** | The agreement itself (a governed record, not the document file) | `src/lib/contracts/vocabulary.ts`, `model.ts`, `service.ts`; `contract_records`, `contract_lifecycle_events` | Whether the platform regards an agreement as negotiated, reviewed, signed, performing or finished |
| **Registry progression** | A deployed artefact's **operational** standing | `src/lib/blockchain/model.ts`; `smart_contract_registry` | Whether a contract has been auditioned, testnet-proven, mainnet-approved or withdrawn |
| **Execution package** | A single contemplated on-chain act | `src/lib/blockchain/model.ts`; execution-posture endpoint | Whether one specific obligation may be executed on-chain **right now** |

They are **not** interchangeable: a contract may be `ACTIVE` with no deployed artefact; a registry
record may be `VERIFIED_TESTNET` with no live commercial arrangement; an execution package may be
`EXECUTABLE` while the contract is suspended — in which case the gate refuses (`CONTRACT_LIFECYCLE_NOT_PERFORMING`).

## 2. Contract lifecycle (as the platform enforces it)

**States** (`CONTRACT_LIFECYCLE_STATES`, verified): `REQUESTED`, `DRAFTING`, `INTERNAL_REVIEW`,
`COUNTERPARTY_REVIEW`, `LEGAL_REVIEW`, `RISK_REVIEW`, `COMMERCIAL_APPROVAL`,
`AUTHORITY_VERIFICATION`, `SIGNATURE_PENDING`, `EXECUTED`, `ACTIVE`, `PERFORMANCE_MONITORING`,
`AMENDED`, `RENEWED`, `COMPLETED`, `TERMINATED`, `EXPIRED`, `DISPUTED`, `SUSPENDED`, `ARCHIVED`.

**Verified structural properties:**

- Terminal states are `COMPLETED`, `TERMINATED`, `EXPIRED`, `ARCHIVED` — they accept no further
  transition, only governed supersession.
- **Performing** states are `ACTIVE`, `PERFORMANCE_MONITORING`, `AMENDED`, `RENEWED`. Only these
  permit obligations to be operative and on-chain execution to be considered.
- **Pre-execution** states are all of `REQUESTED` … `SIGNATURE_PENDING`: *the document may still be
  edited and nothing is binding.*
- Review gates are enumerable (`CONTRACT_REVIEW_GATES`): `INTERNAL_REVIEW`, `COUNTERPARTY_REVIEW`,
  `LEGAL_REVIEW`, `RISK_REVIEW`, `COMMERCIAL_APPROVAL`, `AUTHORITY_VERIFICATION`. **A gate is closed
  only by a recorded human act carrying the named authority; the software never infers closure.**

### 2.1 Gate ownership and evidence — `[PROPOSED]`

| Gate | Who may close it `[PROPOSED]` | Evidence required | Notes |
|---|---|---|---|
| `INTERNAL_REVIEW` | The requesting function's head | Review record referencing the draft version | Business correctness, not legal |
| `COUNTERPARTY_REVIEW` | The counterparty, through the responsible officer | Counterparty response recorded; version identified | Never recorded as closed on a verbal report |
| `LEGAL_REVIEW` | A qualified advocate, or the General Counsel function where licensed to review | Determination reference; **`LEGAL_REVIEW_CLOSED` is a human act** | `[COUNSEL TO CONFIRM]`: who may close it under Tanzanian practice |
| `RISK_REVIEW` | Risk function | Risk assessment reference; insurance/limits checked | Feeds `BEYU-LF-D61` |
| `COMMERCIAL_APPROVAL` | Budget holder within the delegation matrix | Approval reference + threshold satisfied | Thresholds unset → **fail-closed** (`BEYU-SCG-01` A-3) |
| `AUTHORITY_VERIFICATION` | Company Secretary / Governance function | The authority checks of §2.2 all `SATISFIED` | MFA step-up where the platform requires it |

### 2.2 Authority checks (as the platform enforces them)

Sixteen checks are enumerable, each with exactly four outcomes (`SATISFIED`, `MISSING`,
`NOT_REQUIRED`, `BLOCKED_BY_RESTRICTION`), stored per check with threshold version:
`CONTRACTING_ENTITY_IDENTIFIED`, `COUNTERPARTY_IDENTIFIED`, `SIGNATORY_AUTHORITY`, `DELEGATION_VALID`,
`APPROVAL_THRESHOLD_MET`, `BOARD_APPROVAL`, `TRUSTEE_APPROVAL`, `SHAREHOLDER_APPROVAL`,
`FINANCE_APPROVAL`, `PROCUREMENT_APPROVAL`, `LEGAL_REVIEW_CLOSED`, `RISK_REVIEW_CLOSED`,
`REGULATORY_RESTRICTIONS_CHECKED`, `CONFLICTS_CHECKED`, `COMPLIANCE_RESTRICTIONS_CHECKED`,
`RESERVED_MATTERS_CHECKED`.

**Governance rules:**

| Rule | Statement |
|---|---|
| L-1 `[MANDATORY]` | A `MISSING` or `BLOCKED_BY_RESTRICTION` check blocks the transition. There is no "proceed and record later". |
| L-2 `[MANDATORY]` | `NOT_REQUIRED` requires a reason recorded with the determination; it is not a default and cannot be inferred from silence. |
| L-3 `[PROPOSED]` | A contract may not enter `SIGNATURE_PENDING` while any mandatory check is `MISSING`, and may not enter `EXECUTED` without signature evidence bound to a content hash (`BEYU-SCG-03`). |
| L-4 `[MANDATORY]` | Every contract type maps to a contract family (`WORKFORCE`, `CONFIDENTIALITY_AND_IP`, `COMMERCIAL`, `PUBLIC_AND_PARTNERSHIP`, `CAPITAL`, `DATA`, …). The family drives which checks are mandatory; a contract with no family is not valid input. |
| L-5 `[PROPOSED]` | Where the legal pack already drafts the instrument type (`BEYU-LF-EMP-01`, `NDA-01`, `RC-01`, `D41`, `D23`, `D37`), the governed record must reference the **legal-pack document as the source of the clause text**; the platform record is the register entry, not the instrument. |

### 2.3 What an `EXECUTED` state means — and does not mean

The platform's `EXECUTED` state records that **execution evidence was recorded** (who signed, in what
order, by which method, against which content hash, with which authentication evidence). It is
**not** a determination that the agreement is valid, enforceable, or effective under any law. That
determination is counsel's, and where it is required it is recorded as a `LEGAL_REVIEW_CLOSED`
determination with a reference — never inferred from the state.

## 3. Registry progression (as the platform enforces it)

**States** (`CONTRACT_OPERATIONAL_STATUSES`, verified): `DRAFT`, `AUDIT_PENDING`, `APPROVED_TESTNET`,
`DEPLOYED_TESTNET`, `VERIFIED_TESTNET`, `APPROVED_MAINNET`, `DEPLOYED_MAINNET`, `DEPRECATED`,
`COMPROMISED`.

**Permitted transitions (verified, exclusive):**

| From | To |
|---|---|
| `DRAFT` | `AUDIT_PENDING`, `DEPRECATED` |
| `AUDIT_PENDING` | `APPROVED_TESTNET`, `DRAFT`, `DEPRECATED` |
| `APPROVED_TESTNET` | `DEPLOYED_TESTNET`, `DEPRECATED` |
| `DEPLOYED_TESTNET` | `VERIFIED_TESTNET`, `APPROVED_TESTNET`, `DEPRECATED` |
| `VERIFIED_TESTNET` | `APPROVED_MAINNET`, `DEPRECATED` |
| `APPROVED_MAINNET` | `DEPLOYED_MAINNET`, `VERIFIED_TESTNET`, `DEPRECATED` |
| `DEPLOYED_MAINNET` | `DEPRECATED`, `COMPROMISED` |
| `DEPRECATED` | `COMPROMISED` |
| `COMPROMISED` | (terminal) |

**The structural rule the code enforces, and the governance that restates it:**

| Rule | Statement |
|---|---|
| L-6 `[MANDATORY]` | **Testnet-first is not a preference.** `APPROVED_MAINNET` is reachable only from `VERIFIED_TESTNET`; no shortcut exists, and none may be added. |
| L-7 `[MANDATORY]` | A deployed or compromised record cannot be revived. Withdrawal is recorded as `DEPRECATED`/`COMPROMISED` and superseded by a new record. |
| L-8 `[PROPOSED]` | Entry to `APPROVED_TESTNET` requires the same reserved-matter decision path as mainnet *in kind*, with the audit requirement set by risk classification — because the code permits the step and only governance can condition it. |
| L-9 `[PROPOSED]` | Every registry record must name a **governance body reference** and a **legal review status**; a record without them is incomplete, and incompleteness is recorded as a finding, never back-filled to look complete. |
| L-10 `[MANDATORY]` | The registry records **provenance**: repository reference, full source commit, compiler version, optimizer runs, ABI hash and bytecode hash. A record lacking reproducible provenance may not be relied on for any decision. |

## 4. Execution packages — the "may this act now?" governance

**States** (`EXECUTION_PACKAGE_STATES`, verified): `DRAFT`, `READY`, `PROPOSED`, `TIMELOCKED`,
`EXECUTABLE`, `EXECUTED`, `PAUSED`, `VOIDED`, `FAILED`.

**Transitions (verified, exclusive):** `DRAFT→{READY, VOIDED}`; `READY→{PROPOSED, VOIDED, PAUSED}`;
`PROPOSED→{TIMELOCKED, READY, VOIDED}`; `TIMELOCKED→{EXECUTABLE, READY, VOIDED, PAUSED}`;
`EXECUTABLE→{EXECUTED, PAUSED, VOIDED}`; `PAUSED→{READY, VOIDED}`; `FAILED→{DRAFT, VOIDED}`;
`EXECUTED` and `VOIDED` are terminal.

**Every gate that must hold for `permitted: true`** (verified, `evaluateExecutionGates`):

1. the contract lifecycle allows it (`CONTRACT_LIFECYCLE_NOT_PERFORMING` otherwise);
2. the package is in `EXECUTABLE` (`STATE_…_NOT_EXECUTABLE` otherwise);
3. the contract address is **registry-verified on that network** (`SMART_CONTRACT_NOT_VERIFIED_IN_REGISTRY`);
4. an oracle input is **usable** where the obligation depends on one (`ORACLE_INPUT_UNUSABLE`);
5. no open dispute pauses execution (`OPEN_DISPUTE_PAUSES_EXECUTION`);
6. evidence is recorded (`EVIDENCE_NOT_RECORDED`);
7. **on a production network**, additionally: multisig approval (`MULTISIG_APPROVAL_MISSING`) and
   timelock readiness (`TIMELOCK_NOT_READY`).

| Rule | Statement |
|---|---|
| L-11 `[MANDATORY]` | **`permitted: true` is a posture, not a permission** (`BEYU-SCG-01` A-2). The endpoint computes gates; it does not sign, submit or broadcast, and no authority exists in a posture. |
| L-12 `[PROPOSED]` | The human execution decision is recorded in the register (`BEYU-SCG-08` R-APP-01) **before** any external signer acts, naming the digest, the package, the approvers and the timestamp. |
| L-13 `[MANDATORY]` | A `PAUSED` package may not be resumed by automation; resumption is a human act under SC-RM-03. |
| L-14 `[PROPOSED]` | `FAILED` packages are never silently retried: the retry is a new package, referencing the failed one. |

## 5. Cross-domain lifecycle interactions

| Situation | Governed behaviour |
|---|---|
| A `PAYMENT` obligation becomes due | The obligation is a **reference** with `authoritative_owner = FINANCE_OS`. Payment happens under Finance authority (LOCKED) or not at all. On-chain payment confirmation is **input** to a verification, never a posting. |
| A dispute opens | The contract may move to `DISPUTED`; the dispute **pauses** execution packages; dispute handling follows `BEYU-LF-D17`. |
| A counterparty is also an employee, a founder or a related party | `BEYU-LF-D72` disclosure applies before the gate is closed; the conflict check is one of the sixteen authority checks (`CONFLICTS_CHECKED`). |
| An IP assignment is part of the deal | The instrument and its chain of title belong to `BEYU-LF-D39`/`D41`; the platform record references it and never replaces it. |
| A worker is engaged | Employment classification and the bilingual documents belong to `BEYU-LF-EMP-01`…`EMP-04`; misclassification is a counsel question, not a lifecycle setting. |

## 6. Open items

| ID | Open item | Needs |
|---|---|---|
| L-OPEN-01 | Gate owners unappointed for all six review gates | `[TO BE APPOINTED]` |
| L-OPEN-02 | Contract-family → mandatory-check map is enforced by policy data that is **unset** | `[TO BE DECIDED]` — thresholds/limits are governance inputs |
| L-OPEN-03 | Who may close `LEGAL_REVIEW` under Tanzanian practice | `[COUNSEL TO CONFIRM]` |
| L-OPEN-04 | Whether the registry's `legal_review_status` should be a gating condition for `APPROVED_MAINNET` | `[TO BE DECIDED]` |
| L-OPEN-05 | Retention and legal-hold interaction for contract records and their evidence | `BEYU-LF-D74`, `BEYU-LF-D70`, retention service |

## 7. What this document does not establish

No contract exists, no deployment exists, no gate has been closed, no registration has occurred and
no legal effect attaches to any state named here. The lifecycle descriptions are reports about the
platform's own records.
