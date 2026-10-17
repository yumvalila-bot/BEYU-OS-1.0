# BEYU-SCG-06 — On-Chain Evidence and Reconciliation Governance

Document ID: `BEYU-SCG-06`
Title: On-Chain Evidence and Reconciliation Governance
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the evidence rules and reconciliation findings exist in code; the
escalation procedure is `[PROPOSED]`; **nothing is anchored, deployed or reconciled today**.
Owner (proposed): Chief Governance Officer with the Group CFO (reconciliation) `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`
Classification: `INTERNAL`
Related documents: `BEYU-SCG-01`, `BEYU-SCG-02`, `BEYU-SCG-03`, `BEYU-SCG-05`, `BEYU-SCG-07`, `BEYU-SCG-08`; legal pack: `BEYU-LF-CAP-01`, `BEYU-LF-D24`, `BEYU-LF-D40`, `BEYU-LF-IP-EV-01`, `BEYU-LF-PRIV-01`, `BEYU-LF-PRIV-02`, `BEYU-LF-D70`, `BEYU-LF-D74`
Depends on: the register specifications (`BEYU-SCG-08`); counsel's answers on evidential weight and data protection (Q-SCG-02…Q-SCG-05)

> **CONTROL BLOCK.**
> **This is** the governance of what a cryptographic commitment, an anchored hash, an indexed event
> or an on-chain position may be used to prove inside BEYU — and what each may never be used for.
> **This is not** evidence that anything happened. In a fresh environment the registry contains
> **zero verified records and zero verified anchors**, and no chain has been contacted.
> **Prohibited content:** no address presented as BEYU's; no transaction hash presented as BEYU's; no
> claim that a settlement, a delivery, a payment or a transfer occurred; no legal conclusion about
> admissibility.

---

## 1. The three sentences that govern this domain

1. **A verified anchor proves that a commitment existed, in a specific published form, at a specific
   block depth — and nothing else.**
2. **Chain state is never authoritative by observation.** Reconciliation *reports findings*; it never
   updates a cap table, a contract record, an obligation state or a share register.
3. **A record is not the instrument.** The register is the index; the instrument (or the ledger, or
   the decision) is the evidence — the same convention the legal pack applies to its registers.

## 2. Anchors — what the platform verifies (verified behaviour)

**Anchor methods**: `EVM_TRANSACTION_CALLDATA`, `EVM_LOG_INDEXED`, `ONCHAIN_REGISTRY_COMMITMENT`,
`BEYU_HASH_CHAIN_ONLY` (the last is internal hash-chaining with no chain involvement at all — and must
never be described as an on-chain anchor).

**Statuses and permitted progression** (`ANCHOR_STATUSES`, verified): `PENDING` → `RECORDED`/`FAILED`/`BLOCKED`;
`RECORDED` → `VERIFIED`/`REVOKED`/`SUPERSEDED`/`FAILED`; `VERIFIED` → `REVOKED`/`SUPERSEDED`;
`SUPERSEDED`, `REVOKED` terminal; `FAILED`/`BLOCKED` → `PENDING`.

**A verification succeeds only when all of the following hold** (verified, `evaluateAnchor`): the
network is supported; the recorded chain id matches the network; a transaction hash and a block
number exist; **the confirmation depth meets the network's requirement**; the content hash is a
32-byte digest; and the **recomputed commitment matches the stored commitment**.

**Required confirmations by network** (measured catalogue): `local-anvil` 0 (not production),
`sepolia` 3, `base-sepolia` 3 (not production), `ethereum` 12, `base` 12, `polygon` 64 (production).

**Two properties that are governance, not implementation detail:**

| Rule | Statement |
|---|---|
| E-1 `[MANDATORY]` | **A block-hash mismatch is reported as a reorg candidate and never silently healed.** Verification itself never demotes an anchor: a mismatch is recorded as findings, and changing status is a separate governed act. |
| E-2 `[MANDATORY]` | **A commitment binds a hash of content that never leaves BEYU.** No document content, no personal data and no confidential terms are published; only the commitment is. |
| E-3 `[MANDATORY]` | **`BEYU_HASH_CHAIN_ONLY` is not a public-chain anchor** and must never be described, reported or relied on as one. |
| E-4 `[MANDATORY]` | **Verification never creates authority.** `createsAuthority: false` is structural; no anchor, however deep, authorises an act. |

## 3. What each artefact may and may not prove

| Artefact | May support | May **never** establish |
|---|---|---|
| Commitment (EIP-712 digest) | That specific content was canonicalised and hashed as recorded | Authorship, consent, authority, legal effect |
| `VERIFIED` anchor | That the commitment was published and matches at the required depth | That an obligation was performed, a payment made, or a delivery accepted |
| Indexed event (`ANCHOR_COMMITTED`, `OBLIGATION_PAID`, `OWNERSHIP_TRANSFERRED`, `PARAMETER_CHANGED`, `PAUSED`, `CONTRACT_UPGRADED`, …) | That the platform or a contract emitted a log the platform indexed and deduplicated | Ownership, title, settlement, or that the underlying act was lawful or authorised |
| Token position | The platform's **observation** of a balance it was told about | Any legal or beneficial ownership, any entitlement, any share |
| Reconciliation finding | That a discrepancy exists between two sources | Which source is right, or that a correction should be made |

**Rule E-5 `[MANDATORY]`.** Ownership, title, entitlements and interests are established by
instruments and registers (`BEYU-LF-CAP-01`, `D24`, `D39`, `D63`–`D67`), or they are
**`OWNERSHIP UNESTABLISHED`**. An on-chain observation never fills that gap.

## 4. Reconciliation governance

**Finding codes** (`RECONCILIATION_FINDINGS`, verified): `CAP_TABLE_MISMATCH`, `OWNERSHIP_MISMATCH`,
`VESTING_MISMATCH`, `TOKEN_BALANCE_MISMATCH`, `UNAUTHORIZED_TRANSFER`, `UNKNOWN_HOLDER`,
`STALE_BLOCKCHAIN_STATE`.

**What the code already enforces:** reconciliation runs are **findings-only**; they never mutate a
cap table, a contract, an obligation or a position (`src/lib/blockchain/service.ts` boundary 3), and
they report `DATA_NOT_AVAILABLE` where there is nothing to compare rather than inventing a target.

| Rule `[PROPOSED]` | Statement |
|---|---|
| E-6 | Every finding is **assigned to a named role** and carries a status (`OPEN`, `UNDER_REVIEW`, `RESOLVED_WITH_EVIDENCE`, `ACCEPTED_AS_KNOWN`). An unassigned finding is a governance defect. |
| E-7 | **`UNAUTHORIZED_TRANSFER` and `UNKNOWN_HOLDER` are escalated immediately** (same working day) under `BEYU-SCG-07`, because they are potential incidents, not bookkeeping differences. |
| E-8 | A finding is **never closed by editing the canonical record**. Closure requires evidence of the true position — an instrument, a ledger entry, a verified decision — recorded in `BEYU-SCG-08` R-REC-01. |
| E-9 | Recurring mismatches (three or more in a review period, or any mismatch that persists past two review cycles) trigger a **root-cause review** and a register entry. |
| E-10 | Where a discrepancy cannot be resolved, the position stays unresolved and visible. **`UNRECONCILED` is a legitimate recorded state; a plugged number is not.** |
| E-11 | Comparison targets are **canonical platform records only** — never a second copy of a cap table, never a spreadsheet held privately. |
| E-12 | A reconciliation run is **not evidence of accuracy**: it proves that two sources were compared on a date, with a stated result. |

## 5. Evidence handling, privacy and retention

| Rule | Statement |
|---|---|
| E-13 `[MANDATORY]` | Evidence artefacts (commitments, verification findings, run outputs) are **append-only**; corrections are new records that reference what they correct. |
| E-14 `[MANDATORY]` | **Legal holds block deletion** regardless of retention expiry. Retention runs from the artefact's recorded creation time under the retention policy — and eligibility is never destruction (`src/lib/data-governance/retention-service.ts`). |
| E-15 `[PROPOSED]` | Where an evidence artefact references personal data, the reference is recorded in the privacy inventory (`BEYU-LF-PRIV-02`) and the data-protection checklist (`BEYU-LF-D70`) is completed before first use. |
| E-16 `[MANDATORY]` | **Immutability is not a licence to publish personal data.** Because a commitment cannot be undone, the rule that content never leaves BEYU (E-2) is also a data-protection control. |
| E-17 `[PROPOSED]` | Evidence custody follows `BEYU-LF-D74`; where an artefact is held outside the platform, the custody reference is recorded, never the artefact's sensitive content. |
| E-18 `[PROPOSED]` | The evidence archive register (`BEYU-SCG-08` R-EVD-01) opens at **zero entries** and lists only references, never content. |

## 6. Publication rule for anything on-chain `[MANDATORY]`

Before any commitment is published to a public network, all of the following must be recorded:

1. a reserved-matter decision (SC-RM-01/SC-RM-02) where the act is a deployment or an upgrade;
2. confirmation that the commitment contains **no personal data, no confidential terms and no
   credentials** — only a digest computed to the published standard;
3. the registry record's provenance (repository, full source commit, compiler, hashes);
4. the legal-review status, which remains `REQUIRES_LEGAL_REVIEW` until a human closes it;
5. the evidence record of the approval, in `R-APP-01`.

**Rule E-19 `[MANDATORY]`.** Nothing may be published whose commitment cannot be recomputed and
verified by an independent party from the recorded provenance. A commitment that only BEYU can verify
is not evidence; it is a claim.

## 7. Open items

| ID | Open item | Needs |
|---|---|---|
| E-OPEN-01 | Zero verified registry records, zero verified anchors, zero token positions | A real deployment decision — not taken |
| E-OPEN-02 | Evidential weight and admissibility of commitments and chain records under Tanzanian law | `[COUNSEL TO CONFIRM]` — Q-SCG-02, Q-SCG-03 |
| E-OPEN-03 | Data-protection position for hash commitments referencing personal data | `[COUNSEL TO CONFIRM]` — Q-SCG-04; `PRIV-02` |
| E-OPEN-04 | Who owns reconciliation escalation, and the review cadence | `[TO BE APPOINTED]` |
| E-OPEN-05 | Whether any network will be used in production at all | `[TO BE DECIDED]` — SC-RM-08 |
| E-OPEN-06 | Retention periods for evidence artefacts, and their interaction with legal holds | `[TO BE DECIDED]` with `BEYU-LF-D70`, `D74` |

## 8. What this document does not establish

It establishes no anchor, no deployment, no ownership, no balance, no reconciliation result and no
legal position. It states what the platform measures, what it refuses to conclude, and how BEYU
intends to govern both.
