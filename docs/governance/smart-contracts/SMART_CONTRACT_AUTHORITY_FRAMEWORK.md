# BEYU-SCG-01 — Smart Contract Authority Framework

Document ID: `BEYU-SCG-01`
Title: Smart Contract Authority Framework
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the framework is drafted; every appointment, threshold and
delegation in it is `[TO BE DECIDED]`, and nothing in it has been adopted by any body.
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board, with the BEYU Family Trust trustees where
a trust asset, a beneficiary interest or a trustee power is engaged `[NEITHER BODY IS REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`
Classification: `INTERNAL`
Related documents: `BEYU-SCG-PHASE0`, `BEYU-SCG-02`, `BEYU-SCG-03`, `BEYU-SCG-04`, `BEYU-SCG-07`, `BEYU-SCG-08`, `BEYU-SCG-10`; legal pack: `BEYU-LF-D27`, `BEYU-LF-D04` §7, `BEYU-LF-D34`, `BEYU-LF-D35`, `BEYU-LF-D73`, `BEYU-LF-D74`, `BEYU-LF-DEFINED_TERMS` §2
Depends on: the audit (`BEYU-SCG-PHASE0`); appointments that do not exist (`[TO BE APPOINTED]`); the
adoption of `BEYU-LF-D27` into the Articles and shareholders' agreement; counsel's answers in `BEYU-SCG-10`

> **CONTROL BLOCK.**
> **This is** a governance framework that says **who may do what, on whose recorded authority, with
> what evidence** in the smart-contract and on-chain domain — and, just as importantly, **who may
> not**.
> **This is not** authority. No appointment, delegation, approval, mandate, custody arrangement or
> threshold is created by this document. It creates no authority in software, in a database row, in a
> wallet, in an address or in an AI system.
> **Prohibited content in this document:** no key material; no address presented as BEYU's; no
> claim that any deployment exists; no legal conclusion; no invented threshold, fee or statutory
> reference. Where such content would be needed, the text carries `[TO BE DECIDED]` or
> `[COUNSEL TO CONFIRM]` instead.

---

## 1. Purpose

The Phase 0 audit found a capable engine with no written authority framework around it: a registry
that can record provenance, an execution gate that can report `permitted: true`, a scheduler that can
run briefings, and a payments pipeline that can raise trust on settlement evidence — but no document
saying who may authorise those acts.

**The framework's single purpose is to make the answer to "who may do this?" a documentary question,
not an inference from software.**

## 2. Where a chain record sits on the legal-effect ladder

`BEYU-LF-DEFINED_TERMS` §2 establishes the ladder that governs the whole BEYU documentation set. Its
rank 8 entry — *"a software record / control-plane entry … creates no legal right, title, authority or
liability whatsoever"* — applies with full force to every artefact this domain produces:

| Artefact | Ladder position | What it can establish | What it cannot establish |
|---|---|---|---|
| A registry row | software record | that a record was entered, by whom, when | that a contract exists in law, or is valid |
| A content hash commitment | software record | that a specific document version existed at a time, unaltered | authorship, authority, consent or enforceability |
| A `VERIFIED` anchor | software record | that a commitment was published and matches at a depth | that an obligation was performed or a payment made |
| A `permitted: true` execution posture | software record | that the platform's gates are open | that anyone is authorised to execute anything |
| An oracle reading marked `usable` | software record | that a governed input passed freshness and deviation checks | that the underlying fact is true in the world |
| An `EXECUTED` execution package state | software record | that the platform recorded execution evidence | legal effect — see §6 |

**The ladder is not a slogan here.** It is why §4 requires a *recorded human decision* as the
authority for every act in §5, and why §8 refuses data as evidence of authority.

## 3. Who holds authority

| Authority | Held by | Status |
|---|---|---|
| Legal power to bind a legal entity | The entity's **directors**, acting within the constitution, shareholders' agreement and the law | `[TO BE APPOINTED]` — no appointment is evidenced in this repository |
| Power over trust assets and trustee decisions | The **trustees** (`BEYU-LF-D03`, `D04`) | `[TO BE APPOINTED]` — the trust is not evidenced as constituted |
| Investment limits and mandate | The mandate and its limits (`BEYU-LF-D34`) | Limits are **unset**; a blank investment limit is **zero**, not unlimited |
| Custody and payment authority | The custody/payment control framework (`BEYU-LF-D35`) | `[CUSTODIAN TO BE APPOINTED]`; no custody arrangement exists in this repository |
| Accounting authority | Finance OS, and only Finance OS, under `CAP_POSTING` | **LOCKED**; `AR` and `AP` deliberately have no canonical table (`src/lib/finance/truth.ts`) |

**Non-authorities — binding statements, not preferences.**

1. **NOELIA_AI is not a trustee, director, legal adviser, accountant, signatory, custodian or an
   independent distribution/payment authority.** Its outputs are analysis; its tool surface is
   permission-gated; five of its forty-three tools declare a domain write, and none of them is granted
   by being listed (`BEYU-SCG-04`).
2. **A URL, hostname, DNS name, certificate, address or wallet is never proof of identity or
   authorisation.** Possession of a key proves control of a key.
3. **A software state is not a legal status.** A contract in `ACTIVE`, a registry record in
   `DEPLOYED_MAINNET`, or an anchor in `VERIFIED` are platform facts about platform records.
4. **A hash is evidence of integrity, never of authority.** Signing a digest does not import the
   signer's authority into the digest (`BEYU-SCG-03`).
5. **A blockchain is not a register of legal title.** On-chain positions are explicitly
   non-authoritative in the schema, and reconciliation against them can only report findings
   (`BEYU-SCG-06`).

## 4. The authority model the code already enforces

This section restates **boundaries that exist in code today**, so that the governance framework and
the engine cannot be read as alternatives to each other. Sources: `src/lib/contracts/model.ts`,
`vocabulary.ts`, `service.ts`; `src/lib/decision-authority.ts`; `drizzle/0042_…`.

| Property | Verified state |
|---|---|
| Authority checks are explicit, enumerable acts | `AUTHORITY_CHECK_KINDS`: `CONTRACTING_ENTITY_IDENTIFIED`, `COUNTERPARTY_IDENTIFIED`, `SIGNATORY_AUTHORITY`, `DELEGATION_VALID`, `APPROVAL_THRESHOLD_MET`, `BOARD_APPROVAL`, `TRUSTEE_APPROVAL`, `SHAREHOLDER_APPROVAL`, `FINANCE_APPROVAL`, `PROCUREMENT_APPROVAL`, `LEGAL_REVIEW_CLOSED`, `RISK_REVIEW_CLOSED`, `REGULATORY_RESTRICTIONS_CHECKED`, `CONFLICTS_CHECKED`, `COMPLIANCE_RESTRICTIONS_CHECKED`, `RESERVED_MATTERS_CHECKED` |
| Every check has exactly four outcomes | `SATISFIED`, `MISSING`, `NOT_REQUIRED`, `BLOCKED_BY_RESTRICTION` — and a determination row is stored per check |
| Deny is final | An unlisted lifecycle transition is refused; a missing mandatory check blocks execution; an absent evidence reference is "not proven", never "assumed ok" |
| Thresholds are policy data, not code opinions | `DEFAULT_AUTHORITY_THRESHOLDS` exists as a policy shape; the *values* are governance inputs, and a blank resolves restrictively |
| Authority verdicts are fail-closed | `src/lib/decision-authority.ts`: only `ACTIVATED` is executable; `REFERENCE_DATA` — seed or hand-inserted data — **never** authorises; no environment variable, config flag, seed row or UI state can bypass it |
| Money-adjacent obligations are references, not money | `PAYMENT` obligations carry `authoritative_owner = FINANCE_OS`; nothing in the domain posts |
| Authority operations are human-only | `contracts:authority` is documented as **MFA step-up; human only**; `blockchain:manage` is documented as "never chain key custody, never a posting route" |

**Rule A-1 `[MANDATORY]`.** No new authority path may be added outside these primitives. A second
engine that decides authority would be a second source of truth and is prohibited; if a genuine gap
is found, it is closed in `src/lib/authority/` or `src/lib/decision-authority.ts`, reviewed, tested
and then documented here — never the reverse.

## 5. Proposed reserved-matter schedule for on-chain and automation acts

**`[PROPOSED]` — this schedule is a drafting plan. It is not adopted, it binds nobody, and no
threshold in it is set.** Adoption requires the competent body to add these matters to
`BEYU-LF-D27` (company side) and `BEYU-LF-D04` §7 (trust side), each through its own instrument.

| # | Act | Decision required | Who decides `[PROPOSED]` | Evidence that must exist before the act | System gate that already exists |
|---|---|---|---|---|---|
| SC-RM-01 | Approve a mainnet deployment | Board resolution (and trustee approval where a trust asset is engaged) | Board + trustees | Audit report reference, legal-review closure, registry record with source commit and bytecode hash | Registry progression `APPROVED_MAINNET` is reachable **only** from `VERIFIED_TESTNET` |
| SC-RM-02 | Upgrade a deployed contract | Board resolution naming the upgrade authority and the timelock | Board | Change record, re-audit where the change is material, updated registry record | Proxy kind / upgrade authority / timelock columns; upgrade authority is a **reference**, not a key |
| SC-RM-03 | Pause or unpause execution | Incident or risk decision recorded as it is taken | CEO/CFO/GC jointly `[TO BE DECIDED]` | Incident reference (`BEYU-SCG-07`), reason, expected duration | Execution package `PAUSED` state; `OPEN_DISPUTE_PAUSES_EXECUTION` blocker |
| SC-RM-04 | Appoint, rotate or revoke a signing custodian | Board resolution; mandate check | Board | Custody agreement reference, key register entry, separation-of-duties assessment | No key column exists; `signerRef` must resolve to a governed custody reference |
| SC-RM-05 | Approve an oracle or external data source | Risk decision with a source-verification record | Risk + CFO `[TO BE DECIDED]` | Source register entry with verification status and authority reference | An authoritative feed **must** carry an `authorityRef`; open data can never trigger settlement |
| SC-RM-06 | Issue, transfer or recognise any token, unit or on-chain position | Shareholders'/trustees' decision under the applicable instrument | Board + shareholders/trustees | Instrument reference, register entry, counsel confirmation of the legal character | Token positions are non-authoritative; no issuance capability exists |
| SC-RM-07 | Grant an automation the right to act without a human | Board resolution per automation | Board | Register entry in `BEYU-SCG-08` R-AUT-01, threat assessment, refusal test | Automation register + `BEYU-SCG-04` prohibitions |
| SC-RM-08 | Connect a new network or provider endpoint | Board decision on the network and the counterparty | Board + CFO | Due diligence record, network catalogue review, legal opinion where required | Network catalogue is a code constant; adding one is a code change |
| SC-RM-09 | Decommission or deprecate a registry record | Recorded decision with reasons | Board | Registry record with supersession reference | `DEPRECATED` / `COMPROMISED` termininal states; a deployed record cannot be revived |
| SC-RM-10 | Any treasury or payment movement | Finance authority under `CAP_POSTING` and the treasury framework | CFO, under the accounting authority that does not yet exist | Recorded decision, verified beneficiary, two signatures, reconciliation | **LOCKED.** `CAP_POSTING` refuses; no automation may substitute for it |

**Rule A-2 `[MANDATORY]`.** Until SC-RM-01…SC-RM-10 are adopted **and** the corresponding
appointments exist, **every mainnet act is blocked as a matter of governance**, whatever the software
posture reports. `permitted: true` is not permission.

## 6. Fail-closed rules (binding on all documents in this pack)

| Rule | Statement |
|---|---|
| A-3 | **A blank is restrictive.** Where a threshold, cap, quorum or limit is unset, the more restrictive approval applies; where it is unclear which is more restrictive, the highest authority decides. No one may act on the basis that a blank means "no limit". |
| A-4 | **Unknown owner → `OWNERSHIP UNESTABLISHED`.** Where ownership of an asset, a share or a position cannot be evidenced, the position is unestablished and no act may be taken on the assumption of ownership. |
| A-5 | **A missing check blocks.** A `MISSING` or `BLOCKED_BY_RESTRICTION` authority check blocks the act. There is no "proceed and paper it later". |
| A-6 | **Legal review closes only by a human act.** `LEGAL_REVIEW_CLOSED` requires the reviewer's recorded determination; the software never infers closure, and a passing test never closes it. |
| A-7 | **Interested persons are excluded** from the decision they benefit from (`BEYU-LF-D14`, `D51`, `D72`). |
| A-8 | **Proposer ≠ approver ≠ executor.** Where a body is too small to separate all three, the segregation gap is recorded as a finding rather than pretended away. |
| A-9 | **A verbal instruction is void.** Only recorded decisions with references carry authority. |
| A-10 | **An approval expires.** A human approval binds a payload digest, a version and an expiry (`src/lib/noelia/human-approval.ts`); an approval for a different digest or version is refused. |

## 7. Separation of duties, conflicts and the MFA boundary

- The permission model already separates reading from authority: `contracts:read` / `contracts:manage`
  / `contracts:authority`, `blockchain:read` / `blockchain:manage`. **`contracts:authority` is
  documented as MFA step-up and human only.**
- Related-party and conflict handling is not a smart-contract concern alone: `BEYU-LF-D72` (related
  party transaction register) and `BEYU-LF-D14` (conflicts code) apply to on-chain counterparties,
  oracle sources, custodians and automation vendors exactly as they apply anywhere else.
- **Rule A-11 `[PROPOSED]`.** Any person who is a custodian, an oracle source's principal, or a
  counterparty's officer must disclose it before participating in the relevant decision, and the
  disclosure is recorded in `BEYU-LF-D72`.

## 8. Evidence rules — what may be relied on, and what never may

**May support a decision:** a recorded decision or resolution with a reference; an executed
instrument filed under `BEYU-LF-D74`; an audit or assessment actually performed and referenced; a
counsel opinion actually obtained; a verified source-register entry (`BEYU-LF-LEGAL_SOURCES_REGISTER`
conventions).

**May never be used as evidence of anything legal:**

| Never evidence | Why |
|---|---|
| Seed data, fixture rows, demo identifiers, synthetic TINs, sample percentages or dates, vault references | They are reference data inside a control plane (`BEYU-SCG-PHASE0` §1) |
| A `REFERENCE_DATA` provenance decision | `src/lib/decision-authority.ts` treats it as non-authorising by construction |
| An AI output, a briefing, a model summary | Analysis, not authority |
| A hash, an anchor, an indexed event, an oracle reading | Integrity and observation, not legal effect |
| A `permitted: true` posture | Gates open, nothing more |
| A passing test suite | Software behaviour; it proves nothing about enforceability, compliance or correctness of a legal position |
| A screenshot, an e-mail, a chat message or a verbal report | Not a recorded decision; not filed |

## 9. Open items

| ID | Open item | Needs |
|---|---|---|
| A-OPEN-01 | No body is evidenced as constituted, so no authority can be exercised under this framework | Formation and appointments; `BEYU-LF-D63`, `D66` |
| A-OPEN-02 | SC-RM-01…SC-RM-10 not adopted; no threshold set | Board + trustees, through `BEYU-LF-D27` and `D04` §7 |
| A-OPEN-03 | Custody authority unappointed; no custody agreement exists | `[CUSTODIAN TO BE APPOINTED]`, `BEYU-SCG-03` |
| A-OPEN-04 | Whether the legal character of any on-chain position is a security, a payment instrument or neither | `[COUNSEL TO CONFIRM]` — `BEYU-SCG-10` Q-SCG-08 |
| A-OPEN-05 | Whether an automated agent's acts bind an entity, and on what basis | `[COUNSEL TO CONFIRM]` — Q-SCG-11 |
| A-OPEN-06 | Reserved-matter *values* (thresholds) for SC-RM items | `[TO BE DECIDED]` |

## 10. What this document does not establish

It does not create authority, appoint anyone, adopt any threshold, approve any deployment, authorise
any key, authorise any payment, or assert that any entity, trust, contract, address or registration
exists. It is a framework awaiting the decisions it names.
