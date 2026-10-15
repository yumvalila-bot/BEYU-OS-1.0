# BEYU-SCG-08 — Registers and Templates

Document ID: `BEYU-SCG-08`
Title: Registers and Templates (specification)
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — every register below is a **specification and a blank template**.
Nothing has been entered. **All registers open at ZERO.**
Owner (proposed): Chief Governance Officer / Company Secretary function `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`, then per each register's cadence
Classification: `INTERNAL`
Related documents: `BEYU-SCG-01`…`BEYU-SCG-07`, `BEYU-SCG-09`, `BEYU-SCG-14`; legal pack: `BEYU-LF-D63`–`D75`, especially `D74` (execution and custody), `D73` (decisions and delegations), `D72` (related parties), `IP-EV-01` (evidence archive)
Depends on: appointments (`[TO BE APPOINTED]`); the custody decision; the reserved-matter decisions

> **CONTROL BLOCK.**
> **These are register specifications.** A populated register is an operating record, and the
> registers in this group belong in a **controlled, access-restricted, encrypted system of record** —
> not in this repository, and never in a public channel.
> **A register is an index, not the evidence.** The instrument, the decision, the audit record or the
> ledger entry is the evidence; the register says where it is.
> **Prohibited content anywhere in any register:** private keys, seed phrases, keystores, passphrases,
> recovery shares, passwords, API secrets, unredacted bank or custodian account numbers, personal data
> beyond a role reference, or any value that would let a reader act as BEYU.

---

## 1. Rules common to every register in this group

| Rule | Statement |
|---|---|
| G-1 `[MANDATORY]` | **Every row references evidence.** A row with no evidence reference is a claim, not a record, and is marked `UNSUPPORTED` rather than accepted. |
| G-2 `[MANDATORY]` | **A row never implies authority.** Being listed is not being authorised. Authorisation is a decision with a reference. |
| G-3 `[MANDATORY]` | **Never a secret.** Registers hold references to external custody and custody arrangements, never key material (see `BEYU-SCG-03`). |
| G-4 `[MANDATORY]` | **Blank ≠ zero ≠ unlimited.** An empty cell means nothing is verified; a zero is an explicit measured value; a blank limit is **restrictive**, never unlimited (`BEYU-SCG-01` A-3). |
| G-5 `[MANDATORY]` | **Statuses come from the shared vocabulary** (`BEYU-SCG-01` pack status labels; `BEYU-SCG-06` finding statuses). `APPROVED`/`EXECUTED`/`FILED`/`REGISTERED` require the evidence — never a drafting completion. |
| G-6 `[MANDATORY]` | **Registers are append-only for corrections.** A correction is a new row referencing the corrected one; history is not rewritten. |
| G-7 `[PROPOSED]` | Every register has a named owner (a role) and a review cadence; an ownerless register is escalated at the next governance review. |
| G-8 `[MANDATORY]` | The register specification lives here; a populated register's **location** is recorded in `BEYU-LF-D74`, and its **content** does not live in this repository. |

---

## 2. `R-DEP-01` — Deployment and registry register

**Purpose.** The index of every smart-contract registry record, its provenance and its operational
status. **Opening state: ZERO entries; nothing verified.**

| Column | Notes |
|---|---|
| Registry record reference | Platform record id |
| Name / purpose | — |
| Network key + chain id | From the governed network catalogue |
| Contract address | Empty until `BEYU-SCG-03` K-2 is satisfied; an address is never presented as BEYU's on the strength of a row |
| Source commit (full SHA) / repository ref | Reproducibility requirement (`BEYU-SCG-02` L-10) |
| Compiler version / optimizer runs / ABI hash / bytecode hash | — |
| Proxy kind / implementation address / upgrade authority / multisig / timelock (+ delay) | References, not keys |
| Audit status + audit report reference | — |
| Legal-review status | `REVIEW_OPEN` until a human closes it; never inferred |
| Operational status | One of the nine registry states; transitions per the enforced edge set |
| Governance body reference | The decision that authorised the state |
| Owner (role) / review date | `[TO BE APPOINTED]` |

## 3. `R-CUS-01` — Key and custody register

**Purpose.** Who holds what signing capability, under which arrangement, with which quorum.
**Opening state: ZERO entries. No custodian, no key, no arrangement.**

| Column | Notes |
|---|---|
| Custody arrangement reference | External agreement reference — never the agreement's sensitive content |
| Custodian (legal entity / institution) | — |
| Purpose and scope | Which networks, which contracts, which acts |
| Quorum shape | Number and independence of approvers |
| Approver roles | Role references, never secrets |
| Appointment date / evidence reference | Ceremony minute reference where applicable |
| Rotation due | Per `BEYU-SCG-03` K-14 |
| Suspension / revocation history | Date, initiator, decision reference |
| Review date / reviewer | `[AUDITOR TO BE APPOINTED]` |

**Explicit prohibition:** no key value, seed phrase, share, passphrase, keystore, PIN or credential —
in any column, in any attachment, in any linked document that lives in this repository.

## 4. `R-AUT-01` — Automation authorisation register

**Purpose.** The **authorisation** record for automations — deliberately separate from the inventory
(`BEYU-SCG-04A`), which merely describes what exists. **Opening state: ZERO authorised automations.**

| Column | Notes |
|---|---|
| Automation inventory reference | The `BEYU-SCG-04A` entry id (e.g. `AUT-05`) |
| Class | A1…A6 (A7 prohibited) |
| Authorised scope | What it may do unattended, precisely |
| Authorisation decision reference | SC-RM-07 decision, with date and body |
| Human-binding points | Where a human must bind |
| Refusal test reference | The test that proves fail-closed behaviour |
| Owner (role) / review date | `[TO BE APPOINTED]` |
| Status | `PROPOSED` / `AUTHORISED` / `SUSPENDED` / `WITHDRAWN` — `AUTHORISED` requires the decision reference |

## 5. `R-ORA-01` — Oracle and external data source register

**Purpose.** Which external sources may influence a governed decision. **Opening state: ZERO
approved sources.**

| Column | Notes |
|---|---|
| Source name / principal | The actual provider, verified |
| Feed(s) served | From the ten governed feeds |
| Source kind | `AUTHORITATIVE_PRIMARY` / `SISTER_SOURCE` / `OPEN_DATA` / `MANUAL_EVIDENCE` / `ONCHAIN_PUSH` |
| Authority reference | The record that qualifies it (mandatory for authoritative kinds) |
| Verification status | `VERIFIED_PRIMARY` / `VERIFIED_SECONDARY` / `REQUIRES VERIFICATION` (`BEYU-LF-LEGAL_SOURCES_REGISTER` §3.3) |
| Retrieval record | URL, date, what was read — or an explicit gap |
| Deviation limit / max age | Per feed, as measured in `BEYU-SCG-05` §2 |
| Fallback order / manual-evidence path | — |
| Personal data? | Yes/No; if yes, an assessment reference (O-15) |
| Owner (role) / review date | `[TO BE APPOINTED]` |

**Prohibition:** a source carrying `uncertain: true` in repository federation data (e.g. `UTT_AMIS`,
`TMX`, `TRAB`) may not be entered as an approved source, and may not be cited as an authority, until
verified against the source itself (`BEYU-SCG-05` O-18).

## 6. `R-INC-01` — Incident register

**Purpose.** Every incident, its containment and its review. **Opening state: ZERO entries.**

| Column | Notes |
|---|---|
| Incident id / date-time | — |
| Class / severity | I-1…I-10; SEV-1…SEV-3 |
| Reporter / incident commander | Role references |
| Scope | Contracts, packages, automations, data, parties |
| Containment actions (with times) | Including **which records were paused, held or suspended** |
| Evidence captured | References and hashes; **no content reproduction** |
| Legal hold applied? | Yes/No + reference |
| Notifications | Audience, time, approver — **only where counsel identified a duty** |
| Root cause / review reference | Post-incident review document reference |
| Control changes required | Linked to `R-AUT-01`, `R-CUS-01`, `R-DEP-01` updates |
| Status | `OPEN` / `CONTAINED` / `REVIEWED` / `CLOSED` |

## 7. `R-REC-01` — Reconciliation and escalation register

**Purpose.** Every reconciliation finding, its owner, its status and the evidence that closed it.
**Opening state: ZERO entries.**

| Column | Notes |
|---|---|
| Run reference / date | — |
| Finding code | One of the seven codes (`BEYU-SCG-06` §4) |
| Subject | Position, holder, contract, obligation |
| Sources compared | Canonical platform records only |
| Assigned role / owner | `[TO BE APPOINTED]` |
| Escalated? | `UNAUTHORIZED_TRANSFER` and `UNKNOWN_HOLDER` escalate same-day (E-7) |
| Resolution evidence reference | Instrument, ledger, verified decision — never an edit to the canonical record |
| Status | `OPEN` / `UNDER_REVIEW` / `RESOLVED_WITH_EVIDENCE` / `ACCEPTED_AS_KNOWN` / `UNRECONCILED` |
| Root-cause review reference | Where recurring (E-9) |

## 8. `R-EVD-01` — On-chain evidence archive register

**Purpose.** Where evidence artefacts are, what they attest and how they can be recomputed.
**Opening state: ZERO entries.**

| Column | Notes |
|---|---|
| Evidence id / date | — |
| Artefact type | Commitment digest, anchor record, verification findings, indexed event set, reconciliation output |
| Subject | Document/obligation/contract reference |
| Commitment value or digest | A digest is not a secret; it is recorded so it can be **recomputed** |
| Network / block / confirmation depth | Where an anchor exists |
| Storage location reference | External custody reference — **never content in this repository** |
| Recomputability statement | The provenance needed for an independent party to verify (E-19) |
| Retention / legal hold | Per policy; holds override |
| Owner (role) | `[TO BE APPOINTED]` |

## 9. `R-APP-01` — On-chain act approval and attestation register

**Purpose.** The human decision that preceded any external signing or on-chain act, and any
attestation made. **Opening state: ZERO entries.**

| Column | Notes |
|---|---|
| Act reference | The execution package, deployment or upgrade |
| Reserved matter | SC-RM-01…SC-RM-10 |
| Decision reference | Resolution/decision + date + body |
| Payload digest + version | What was approved, exactly (human binding semantics) |
| Approvers (roles) | Independence and separation recorded |
| Conflict disclosures | `BEYU-LF-D72` reference |
| Attestation reference | Who attested which digest, when (never a key or an address-as-identity) |
| Outcome | `APPROVED_FOR_EXECUTION` / `REFUSED` / `DEFERRED` — recorded, never inferred |
| Post-act verification | Evidence reference; findings recorded even if immaterial |

## 10. `R-DEC-01` — Decisions and open items register (smart-contract domain)

**Purpose.** Every decision this pack depends on, and every item still open. **Opening state: the
open items listed across `BEYU-SCG-01`…`SCG-07` and `SCG-13` (all `OPEN`).**

| Column | Notes |
|---|---|
| Item id | e.g. `A-OPEN-01`, `K-OPEN-02`, `AU-OPEN-04`, `O-OPEN-05`, `E-OPEN-03`, `R-OPEN-03` |
| Question | What exactly must be decided or answered |
| Type | `DECISION` / `COUNSEL` / `ACCOUNTANT` / `USER_INPUT` / `APPOINTMENT` |
| Owner | Role `[TO BE APPOINTED]` |
| Decision reference / answer | Empty until it exists |
| Status | `OPEN` / `ANSWERED` / `SUPERSEDED` |

---

## 11. Custody of populated registers

| Register | Where a populated version belongs | Why not here |
|---|---|---|
| `R-DEP-01` | Governance system of record; platform is the operational view | This repository is public and version-controlled |
| `R-CUS-01` | Access-restricted compliance system, with the custody agreement in a data room | Contains custody relationships |
| `R-AUT-01` | Governance system of record | Authorisation decisions |
| `R-ORA-01` | Governance system of record; contracts in the data room | Contractual terms |
| `R-INC-01` | Restricted incident system; forensics in the data room | Contains sensitive incident detail and possibly personal data |
| `R-REC-01` | Finance/governance system of record | May contain party references |
| `R-EVD-01` | Evidence store with integrity controls | References only in any case |
| `R-APP-01` | Governance system of record | Decisions and attestations |
| `R-DEC-01` | Governance system of record | Open decisions |

**Rule G-9 `[MANDATORY]`.** Where a populated register lives outside this repository, the **location**
and the **custodian role** are recorded in `BEYU-LF-D74`; the register's content is not duplicated
into git at any point.

## 12. What this document does not establish

It does not populate a register, verify an entry, appoint an owner, authorise an automation, approve a
source, or record an incident, a finding, an artefact or a decision. Every register it specifies is
**empty**, and the emptiness is the accurate state.
