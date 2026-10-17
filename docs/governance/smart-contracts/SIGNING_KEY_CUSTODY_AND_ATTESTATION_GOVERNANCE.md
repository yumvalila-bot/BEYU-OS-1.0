# BEYU-SCG-03 — Signing, Key Custody and Attestation Governance

Document ID: `BEYU-SCG-03`
Title: Signing, Key Custody and Attestation Governance
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`CONDITIONAL_DRAFT`** — drafted and expressly conditional on a custody decision that has not
been taken, a custodian who has not been appointed, and counsel's answers on electronic signatures
and evidence.
Owner (proposed): Chief Governance Officer with the Group CFO (custody operations) `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board; trustees where a trust asset is engaged
`[NEITHER BODY IS REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`
Classification: `CONFIDENTIAL` — **and never a place for key material, which this repository must not hold at all.**
Related documents: `BEYU-SCG-01`, `BEYU-SCG-02`, `BEYU-SCG-07`, `BEYU-SCG-08`; legal pack: `BEYU-LF-D35` (custody and payment controls), `BEYU-LF-D74` (execution and custody register), `BEYU-LF-D17`, `BEYU-LF-D61`
Depends on: the custody decision `[TO BE DECIDED]`; the custodian appointment `[CUSTODIAN TO BE APPOINTED]`; counsel's answers — `BEYU-SCG-10` Q-SCG-01…Q-SCG-04

> **CONTROL BLOCK.**
> **This is** the governance of how BEYU would sign, who would hold what, how custody would be
> evidenced, rotated, revoked and audited — written **before** any key exists, which is the only
> safe order.
> **This is not** a custody arrangement, an appointment, a mandate or a key. **No key material,
> seed phrase, keystore, hardware-wallet backup, passphrase or private credential may ever be
> committed to this repository, pasted into documentation, or recorded in the registers as a value.**
> Registers record **references to external custody arrangements** — never secrets.
> **Prohibited content in this document and in any register it specifies:** private keys; seed
> phrases; keystore JSON; passphrases; recovery shares; unredacted hardware-wallet serials paired with
> locations; custody agreements with unredacted account numbers. A document or register that would
> require such content is not written here at all.

---

## 1. Verified position today (measured by the Phase 0 audit)

| Fact | Evidence |
|---|---|
| **No key material exists anywhere in the repository** — no private key, seed phrase, keystore, wallet credential or hot-address column | `drizzle/0042_…` header ("NO KEY MATERIAL"); no such column in `smart_contract_registry` or `blockchain_*` |
| **No signing capability exists** — nothing imports a signer, derives an address, signs a digest or broadcasts a transaction | `src/lib/blockchain/service.ts` §1 ("NO KEYS, EVER"); no `viem`, `ethers`, `web3` or RPC client in `package.json` or `src/` |
| **No address is presented as BEYU's** | The registry's `address` column is optional; in a fresh environment there are **zero verified registry rows** |
| `signerRef` names an **external** custody arrangement | `blockchain_anchors.signer_ref` is a *reference*; `src/lib/blockchain/service.ts` |
| BEYU **computes** commitments to a published standard so a signature produced elsewhere can be checked | `src/lib/blockchain/eip712.ts` — EIP-712 typed data, verified against the standard's published vectors in `tests/blockchain/eip712.test.ts` |
| A signature binds a **hash, never the document** | `src/lib/contracts/signing.ts` §1 — content never leaves BEYU |
| Signature **method is metadata**; enforceability is never inferred | `contracts/signing.ts` — `enforceability` is always `REQUIRES_LEGAL_REVIEW` until a human closes it |
| Signature methods modelled | `QUALIFIED_ELECTRONIC`, `ADVANCED_ELECTRONIC`, `SIMPLE_ELECTRONIC`, `WET_INK_SCANNED`, `BOARD_RESOLUTION_ATTESTED`, `BLOCKCHAIN_ADDRESS_ATTESTED`, `COUNTERSIGNED_WET_INK` — **modelled, not legally validated** |
| Signatures are stored as **evidence only** | `contract_signatures` (migration 0042 header: "signature EVIDENCE only") |

**Consequence.** The absence of keys is a structural boundary, not a policy statement, and this pack
does not weaken it. Everything below governs a future state in which BEYU *decides* to sign — and it
is written so that the decision is a documentary one, taken before the first key exists.

## 2. What a signature proves, and what it does not

| A signature (of any method) can establish | A signature can never establish |
|---|---|
| That a specific private key (or pen) produced a specific value over a specific digest at a specific time, as recorded | That the signer **is** the person or entity they appear to be |
| That the signed content was, at that moment, unaltered | That the signer had **authority** to bind anyone |
| That the signature matches the recognised method's requirements as the platform models them | That the instrument is **valid, enforceable or effective** under any law |
| That a ceremony took place as recorded | That consent was informed, free or lawful |

**Rules.**

| Rule | Statement |
|---|---|
| K-1 `[MANDATORY]` | **No key material in this repository.** No exception, including test material, examples, screenshots, redacted-looking values or fixtures. A test that needs a key uses an ephemeral, clearly-labelled, non-BEYU test value in a disposable environment and never a value that could sign anything real. |
| K-2 `[MANDATORY]` | **No address may be published, labelled or relied on as BEYU's** until: (a) the custody decision is taken, (b) a custodian is appointed, (c) the key register entry exists with an external reference, and (d) the registry record is complete with provenance. Until then, a `smart_contract_registry.address` value is **unverified data about an artefact**, not an identity. |
| K-3 `[MANDATORY]` | **An address attestation proves knowledge of a key, not identity or authority.** `BLOCKCHAIN_ADDRESS_ATTESTED` is a signature *method*; it never substitutes for a recorded signing authority (`BEYU-SCG-01`). |
| K-4 `[MANDATORY]` | **No signing by an AI system.** NOELIA_AI and any model-driven component may compute, verify, compare and report. None may hold, use or be delegated a key. |
| K-5 `[MANDATORY]` | **Signing never imports authority into the digest.** The authority comes from the recorded decision; the digest binds the content to it. |
| K-6 `[MANDATORY]` | **Enforceability stays open.** `REQUIRES_LEGAL_REVIEW` is closed only by a recorded human determination with a reference (`BEYU-LF-D73`). No method, no quorum, no notary-by-analogy closes it. |
| K-7 `[PROPOSED]` | Signature method requirements per instrument class (wet ink vs advanced electronic vs qualified) are set by counsel's advice for the jurisdiction and the instrument, then recorded here — not chosen by engineering convenience. |

## 3. Custody governance to be decided `[PROPOSED]`

**Nothing in this section is adopted.** Each row states the position this pack *proposes* and the
decision that must precede it.

| # | Topic | Proposed position | Decision needed |
|---|---|---|---|
| K-8 | Custody model | A **qualified external custodian** (institutional or regulated) holds key material; BEYU holds no key material in its own systems for the first production use | `[TO BE DECIDED]`: external custodian vs institutional multisig vs both |
| K-9 | Quorum | Any mainnet-signing arrangement requires a **quorum** of independent approvers, no single approver able to act alone, and **no approver who also prepared the transaction** | Quorum size and the roles `[TO BE DECIDED]` |
| K-10 | Human binding | Every signing act requires a digest-bound human approval naming the contract, the obligation, the package and the approvers (`src/lib/noelia/human-approval.ts` semantics, reused — not reinvented) | Whether the platform approval is the operative record or a parallel record |
| K-11 | Separation | Custodian ≠ beneficiary ≠ approver ≠ counterparty principal; where the body is too small, the gap is recorded as a finding | `[TO BE DECIDED]` |
| K-12 | Ceremony | Key generation and any quorum change occur in a recorded ceremony with witnesses, a minute and an evidence reference — **the record holds references, never key material** | Ceremony protocol and witnesses |
| K-13 | Backup and recovery | Recovery is possible without any single person's sole control; recovery shares are held by different custodians in different locations | Scheme and custodians `[TO BE DECIDED]` |
| K-14 | Rotation | Scheduled rotation with a defined period and a revocation procedure that works **without** the custodian's cooperation | Period and mechanism |
| K-15 | Revocation | Any custodian, or any two directors, may **initiate** a suspension of signing; revocation completes by board decision; the registry's `upgrade_authority`/`multisig_address` references are updated as a governed act | Who may suspend instantly |
| K-16 | Evidence | Every custody event produces a record: appointment, ceremony, rotation, revocation, access, incident | Where the records live (outside this repository) |
| K-17 | Insurance | Whether the custody arrangement is insured, and on what terms | `[COUNSEL TO CONFIRM]` / broker |
| K-18 | Audit | Annual independent review of the custody arrangement, with the report's reference recorded (never its sensitive content) | Auditor `[AUDITOR TO BE APPOINTED]` |

**Rule K-19 `[MANDATORY]`.** Until K-8, K-9 and K-14 have decisions **and** the custodian appointment
exists, **no mainnet signing may occur**, whatever the software posture reports, and no registry record
may reach `APPROVED_MAINNET` on the strength of an unappointed custody path.

## 4. What the registers record (specification — see `BEYU-SCG-08`)

| Register | Records | **Never records** | Opening state |
|---|---|---|---|
| `R-CUS-01` Key and custody register | Custodian identity reference, arrangement type, purpose, networks, quorum shape, external agreement reference, appointment/rotation/revocation dates, review date | Key values, seed phrases, shares, passwords, unredacted account numbers | **ZERO ENTRIES — nothing verified** |
| `R-DEP-01` Deployment register | Registry records: network, provenance, hashes, proxy/upgrade/timelock posture, audit and legal-review references | Addresses presented as BEYU's before K-2 is satisfied | **ZERO ENTRIES — nothing verified** |
| `R-ATT-01` Attestation log (inside `R-APP-01`) | Which digest a custodian attested, when, under which recorded approval | Any claim that the attestation conveys authority | **ZERO ENTRIES** |

## 5. Electronic signatures and evidence — the legal question this document cannot answer

Whether an electronic signature (of any class modelled above) is valid, admissible or sufficient for a
given instrument under Tanzanian law, and what weight a hash or a transaction record carries as
evidence, are **legal questions** and are outstanding. They are recorded as `BEYU-SCG-10`
Q-SCG-01…Q-SCG-06 and must be answered by a qualified Tanzanian advocate before any external reliance.
**Nothing in this document, and no software state, answers them.**

## 6. Open items

| ID | Open item | Needs |
|---|---|---|
| K-OPEN-01 | Custody model, quorum, rotation period, revocation authority | `[TO BE DECIDED]` |
| K-OPEN-02 | Custodian appointment | `[CUSTODIAN TO BE APPOINTED]` |
| K-OPEN-03 | Signature-method requirements per instrument class | `[COUNSEL TO CONFIRM]` |
| K-OPEN-04 | Admissibility and evidential weight of hashes/transaction records | `[COUNSEL TO CONFIRM]` |
| K-OPEN-05 | Insurance position | `[TO BE DECIDED]` |
| K-OPEN-06 | Where the custody records and the key register are kept, and who may read them | `[TO BE DECIDED]` — **not this repository** |

## 7. What this document does not establish

It does not create a custodian, a custody arrangement, a key, an address, an authority or a signature.
It does not validate any electronic-signature method, and it does not assert that any instrument has
been or can be executed electronically under any law.
