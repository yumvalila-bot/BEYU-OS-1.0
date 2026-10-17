# BEYU OS — Shared Smart Contract Governance & Automation Pack

**Pack ID:** `BEYU-SCG`
**Version:** 1.0 (initial governance pack, post-audit)
**Date of preparation:** 2026-10-15 (Africa/Dar_es_Salaam)
**Status:** `DRAFT FOR PROFESSIONAL REVIEW` — nothing in this pack is approved, adopted, deployed, executed, filed or registered.
**Location:** `docs/governance/smart-contracts/`
**Owner (proposed):** Chief Governance Officer `[TO BE APPOINTED]`
**Approving authority (proposed):** BEYU Family Trust trustees **and** BEYU Holding Company board `[NEITHER BODY IS REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
**Preceded by:** `PHASE-0_SHARED_SMART_CONTRACT_GOVERNANCE_AUDIT.md` (`BEYU-SCG-PHASE0`) — this pack exists because that audit was done first.
**Companion pack:** `docs/governance/legal-foundations/` (`BEYU-LF`) — the legal-instrument and legal-research pack. This pack does not restate it, amend it, or renumber it.

---

## 1. What this pack is

This pack is the **written governance for capability that already exists in code.** The Phase 0 audit
established, by reading the repository and running its own suites, that BEYU OS already contains:

- a governed contracting engine (`src/lib/contracts/`, 10 modules) with a deny-final lifecycle, review
  gates and authority determinations that emit `REQUIRES_LEGAL_REVIEW` rather than legal conclusions;
- a smart-contract registry and blockchain evidence substrate (`drizzle/0042_…`, 18 tables;
  `src/lib/blockchain/`, 3 modules) that records provenance, integrity hashes, upgrade authority,
  multisig/timelock posture and legal-review status;
- a **read-only** on-chain execution-posture gate that computes whether the gates are open and can
  neither sign nor broadcast;
- an automation substrate that is bound to humans where it matters (digest-, version- and
  expiry-bound approvals; fail-closed authority verdicts; simulations that cannot mutate production
  state; no in-process timers);
- hard boundaries that are structural rather than conventional: **no key material anywhere**, no
  web3 dependency, no RPC client, no money path, and `creates_authority` / `grants_authority`
  columns that default false with no write path to true.

What did **not** exist was the governance layer: who may exercise those capabilities, under what
recorded authority, with what evidence, and what must never be automated. This pack supplies it.

Every rule in this pack is either **(a)** a restatement of a boundary the code already enforces, cited
to the file that enforces it, or **(b)** an explicitly marked `[PROPOSED]` governance rule that
requires a human decision before it means anything. The two are never blended silently.

## 2. What this pack is not

- It is **not** a deployment. Nothing here deploys, upgrades, pauses, executes or configures
  anything, on a chain or off it.
- It is **not** key custody. No key, seed phrase, keystore, address or custody arrangement is
  created, named or authorised by this pack.
- It is **not** legal advice, and it is **not** a compliance certification. No advocate, notary,
  auditor, regulator, custodian or exchange has reviewed or approved anything here.
- It is **not** a claim that any smart contract, address, token, holding, position, deployment or
  registration exists. The registers in `BEYU-SCG-08` deliberately open at **zero verified entries**.
- It is **not** an accounting instrument. Finance OS remains the sole accounting authority and
  `CAP_POSTING` remains **LOCKED**.
- It is **not** a fifth Sector OS, and it does not create one. Contracting, blockchain evidence and
  automation remain **shared capabilities**; the canonical architecture (BEYU Family Trust → BEYU
  Holding Company → Country Holding Companies → the four Sector OSs: `HEALTH_OS`, `FINANCE_OS`,
  `AGRICULTURE_OS`, `UJENZI_OS`) is preserved exactly, with HCM and the Family Office as shared
  capabilities and the Foundation as a separate nonprofit sister organisation.
- It is **not** authority derived from software. A record, a hash, a verified anchor, an indexed
  event, an oracle reading or a `permitted: true` posture is **evidence**, and evidence is not
  authority. Legal authority is held by legal entities and human officeholders; a URL or a hostname
  is never proof of identity or authorisation.
- It is **not** a statement that NOELIA_AI may decide anything. NOELIA_AI is not a trustee, director,
  legal adviser, accountant, signatory, custodian or independent distribution/payment authority.

## 3. Status vocabulary (reused, not reinvented)

This pack uses the **same** status vocabulary as `BEYU-LF`
(`docs/governance/legal-foundations/README.md` §3.1 and §11.3). Labels are not redefined here, and a
reader who understands the legal pack's taxonomy needs no new one.

| Label | Meaning | May it ever mean "done"? |
|---|---|---|
| `COMPLETE_DRAFT` | Fully drafted for human review | Drafted only |
| `PRELIMINARY_FRAMEWORK` | Structure and controls drafted; content depends on a decision or verification | **No** |
| `CONDITIONAL_DRAFT` | Drafted **and** expressly conditional on counsel, a decision or an input | **No** |
| `TEMPLATE_NOT_EXECUTED` | A blank register or template; nothing executed | **No** |
| `BLOCKED` | Cannot proceed without an input that does not exist | **No** |
| `INFORMATIONAL` | Analysis, index, log or question list | Not applicable |

**The status rule (binding on every document in this pack):**
> **Drafting completion never produces `APPROVED`.** `APPROVED`, `EXECUTED`, `FILED` and `REGISTERED`
> exist only where the corresponding documentary evidence exists and is filed in
> `BEYU-LF-D74` (legal document execution and custody register). **No document in this pack carries
> any of those four labels, and none may, on the strength of this pack alone.**

**Attribute tags** used inline: `[COUNSEL TO CONFIRM]`, `[USER TO SUPPLY]`, `[TO BE DECIDED]`,
`[PROPOSED]`, `[MANDATORY]`, `[OPTIONAL]`.

## 4. Navigation

### 4.1 Pack-level control documents

| File | ID | Role |
|---|---|---|
| `PHASE-0_SHARED_SMART_CONTRACT_GOVERNANCE_AUDIT.md` | `BEYU-SCG-PHASE0` | The audit that preceded everything; the evidence base for this pack |
| `README.md` | (pack level) | This file: scope, vocabulary, boundaries |
| `MASTER_DOCUMENT_REGISTER.md` | `BEYU-SCG-14` | The index of every document in this pack |

### 4.2 The documents

| # | File | ID | Status |
|---|---|---|---|
| 01 | `SMART_CONTRACT_AUTHORITY_FRAMEWORK.md` | `BEYU-SCG-01` | `PRELIMINARY_FRAMEWORK` |
| 02 | `CONTRACT_AND_SMART_CONTRACT_LIFECYCLE_GOVERNANCE.md` | `BEYU-SCG-02` | `PRELIMINARY_FRAMEWORK` |
| 03 | `SIGNING_KEY_CUSTODY_AND_ATTESTATION_GOVERNANCE.md` | `BEYU-SCG-03` | `CONDITIONAL_DRAFT` |
| 04 | `AUTOMATION_GOVERNANCE.md` | `BEYU-SCG-04` | `PRELIMINARY_FRAMEWORK` |
| 04A | `AUTOMATION_INVENTORY.json` | `BEYU-SCG-04A` | `INFORMATIONAL` |
| 05 | `ORACLE_AND_EXTERNAL_DATA_GOVERNANCE.md` | `BEYU-SCG-05` | `PRELIMINARY_FRAMEWORK` |
| 06 | `ONCHAIN_EVIDENCE_AND_RECONCILIATION_GOVERNANCE.md` | `BEYU-SCG-06` | `PRELIMINARY_FRAMEWORK` |
| 07 | `INCIDENT_PAUSE_UPGRADE_AND_ROLLBACK_RUNBOOK.md` | `BEYU-SCG-07` | `CONDITIONAL_DRAFT` |
| 08 | `REGISTERS_AND_TEMPLATES.md` | `BEYU-SCG-08` | `TEMPLATE_NOT_EXECUTED` |
| 09 | `TESTING_AND_VERIFICATION_STANDARD.md` | `BEYU-SCG-09` | `PRELIMINARY_FRAMEWORK` |
| 10 | `COUNSEL_QUESTIONS.md` | `BEYU-SCG-10` | `INFORMATIONAL` |
| 11 | `REQUEST_TO_DOCUMENT_MATRIX.md` | `BEYU-SCG-11` | `INFORMATIONAL` |
| 12 | `VERIFICATION_LOG.md` | `BEYU-SCG-12` | `INFORMATIONAL` |
| 13 | `DELIVERABLES_AND_CHANGE_LOG.md` | `BEYU-SCG-13` | `INFORMATIONAL` |
| 14 | `MASTER_DOCUMENT_REGISTER.md` | `BEYU-SCG-14` | `INFORMATIONAL` |

## 5. Where the technical truth lives (single sources)

This pack **indexes** technical facts; it does not become their source. If this pack and the code
disagree, the code and its migrations are right and this pack is stale.

| Subject | Single source |
|---|---|
| Architecture, current ecosystem status | `docs/ECOSYSTEM_STATUS.md` |
| Contract lifecycle, authority checks, obligations, signing posture | `src/lib/contracts/` |
| Anchors, oracles, events, registry progression, execution gates | `src/lib/blockchain/` |
| Contracting + blockchain tables | `drizzle/0042_governed_contracting_and_blockchain.sql` |
| Permissions and capability IA | `src/lib/constants.ts`, `src/app/os/capabilities.ts` |
| Authority verdicts and activation | `src/lib/decision-authority.ts`, `src/lib/authority/` |
| Automation, schedules, human approval | `src/lib/noelia/` |
| Payment ingestion, matching, risk, review | `src/lib/payments/` |
| Legal instruments, counsel questions, legal sources | `docs/governance/legal-foundations/` |
| Accounting authority | `src/lib/finance/truth.ts` — `AR`/`AP` deliberately have **no** canonical table |

## 6. Hard boundaries preserved by this pack

1. **No keys, ever.** No private key, seed phrase, keystore, wallet credential or hot-address column
   exists in the schema, and no code path signs a transaction. `signerRef` names an *external*
   custody arrangement. This pack does not create, name or authorise one.
2. **No money path.** Nothing in the contracting or blockchain domain posts a journal entry, marks a
   payment settled, or moves money. `CAP_POSTING` remains LOCKED and fail-closed.
3. **No canonical overwrite.** Reconciliation reports findings; it never updates a cap table, a
   contract record, an obligation state or a share register.
4. **No authority from chain data.** `createsAuthority` / `grantsAuthority` are false structurally,
   with no write path to true. An anchor proves a commitment existed; it proves nothing else.
5. **No legal effect implied.** Enforceability and legal-review fields stay open until a human closes
   them. Signature method, anchor status and oracle usability are **metadata**.
6. **No fifth Sector OS**; no `SMART_CONTRACT_OS`; no `HCM_OS`. Shared capabilities stay shared.
7. **No unattended act that the law, an instrument or a fiduciary duty requires a human to take.**
8. **No invented facts.** No registration number, address, fee, deadline, rate, statute section or
   official URL appears in this pack unless it was actually retrieved or actually measured — and where
   it was not, the text says so.

## 7. Placeholder convention

Unknown facts appear in square brackets and are never invented. In addition to the legal pack's
canonical set, this pack uses:

```text
[TO BE APPOINTED] [TO BE DECIDED] [USER TO SUPPLY] [COUNSEL TO CONFIRM]
[CUSTODIAN TO BE APPOINTED] [NETWORK TO BE DECIDED] [AUDITOR TO BE APPOINTED]
[NO ENTRY — NOTHING VERIFIED]
```

A register cell that is empty is **not** a zero and **not** an approval: it means nothing verified
exists there yet.

## 8. Confidentiality and custody

This repository is **not** a suitable custodian for key material, custody agreements, signed
instruments, security assessments, incident forensics containing personal data, or penetration-test
reports. The registers in `BEYU-SCG-08` are **specifications and templates**; populated registers
belong in a controlled, access-restricted, encrypted system of record, with custody recorded in
`BEYU-LF-D74`. Nothing in this pack may be pasted into a public channel.

## 9. Change control

- Changes to this pack are documentation changes, recorded in `CHANGE_LOG.md` (`BEYU-SCG-13`).
- Changes to the **code** boundaries this pack restates (keys, money path, authority columns,
  fail-closed gates) are engineering changes requiring their own review; this pack is updated
  **after** such a change, never before, and never to describe code that does not exist.
- A `[PROPOSED]` rule becomes binding only when the competent body adopts it by a recorded
  instrument, and only then may its status change — with the instrument referenced in `BEYU-LF-D73`
  (decision and delegation register) and `BEYU-LF-D74`.

## 10. Relationship to the legal pack

| Legal pack (`BEYU-LF`) | This pack (`BEYU-SCG`) |
|---|---|
| Drafts the *instruments* (deeds, agreements, policies) | Governs the *capability* that records, evidences and automates acts under them |
| Answers "what should the law say / what must counsel decide" | Answers "who may do what, with what evidence, and what may never be automated" |
| Owns the legal sources register and counsel questions | **Adds only** questions the smart-contract/automation domain raises (SCG-10) |
| Registers legal instruments and their custody (`D74`, `D63`–`D75`) | Registers deployments, custody arrangements, automations, oracle sources, incidents and reconciliation escalations (SCG-08) |

Where a legal instrument is required (a custody agreement, a mandate, a board approval, a
counterparty agreement), this pack **points at** the legal pack and does not draft a competing
instrument.

## 11. Drafting status at revision 1.0

**What this pack does:** states the authority framework, the lifecycle governance, the custody
governance that does not yet exist, the automation register and its machine-readable inventory, the
oracle and evidence governance, the incident runbook, the register specifications, the testing and
verification standard, the counsel questions, the request-to-document matrix, the verification log,
the deliverables record and the master register.

**What it does not do:** it establishes no authority, appoints nobody, approves nothing, deploys
nothing, holds no key, moves no money, reconciles nothing against a chain, and closes no legal
question. Twenty-one open items and the merge blockers are listed in `BEYU-SCG-13`.

**Verification performed (and its limits).** The checks actually run against this pack are recorded
in `BEYU-SCG-12` with the exact commands and their observed output; the pack's own regressions are
listed there too. Those checks verify **this pack's internal consistency and its honesty about what
exists**. They do **not** verify legal effect, statutory compliance, tax treatment, security or
audit readiness — and no run of them may be cited as if they did.

---

*This pack is drafting and engineering-governance work product produced by an AI documentation agent
operating on an open-source repository. No advocate, notary, auditor, regulator, custodian or
exchange has reviewed, approved, certified or filed anything in it.*
