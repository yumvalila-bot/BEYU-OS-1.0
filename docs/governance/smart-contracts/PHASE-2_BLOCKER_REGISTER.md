# BEYU-SCG-16 — Phase 2 Blocker Register

Document ID: `BEYU-SCG-16`
Title: Phase 2 Blocker Register
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: when any single blocker clears, and in any event on the next governance review
Related documents: `BEYU-SCG-04`, `BEYU-SCG-10`, `BEYU-SCG-13`, `BEYU-SCG-15`, `BEYU-SCG-17`; legal pack `DECISION_AND_ASSUMPTIONS_REGISTER.md`
Depends on: nothing — it records the state of the world

> **CONTROL BLOCK.**
> **This is** the register of what blocks progress, classified by **who** can clear each item, with
> what evidence would close it. Every item here is **open**. Nothing in this document is cleared, and
> a blocker is not removed by writing about it.
> **This is not** a risk acceptance. No item may be accepted, waived or deferred by the platform: the
> classes below name an authority outside the software, and where that authority has not acted, the
> correct state is `BLOCKED`.

---

## 1. How to read this register

Classification answers one question: **who can clear it?**

| Class | Meaning | Clearing authority |
|---|---|---|
| **TECHNICAL ENFORCEMENT** | Software can clear it | Engineering, under review |
| **GOVERNANCE-BODY DECISION** | Only a constituted body can clear it, by recorded decision | The body, once constituted and evidenced |
| **CUSTODY** | Requires a custody decision and an appointed custodian | Board + custodian, plus counsel |
| **LEGAL** | Requires Tanzanian counsel or a regulator | Counsel / regulator |
| **IDENTITY & ROLE VERIFICATION** | Requires evidence of a person's identity and authority | The authority that can verify it |
| **PRIVACY & CHILD PROTECTION** | Requires a privacy decision, with a specific duty of care for the minor | Privacy owner + counsel |
| **PROVIDER DUE DILIGENCE** | Requires assessment of a third party | Procurement + risk + counsel |
| **OUT OF SCOPE** | Recorded so that its absence is not mistaken for an oversight | — |

**No verified authority ⇒ `BLOCKED`.** Where an item requires an authority that does not exist or has
not acted, this register records `BLOCKED`, never `PENDING` and never `ASSUMED`.

---

## 2. GOVERNANCE-BODY DECISION

| ID | Blocker | Why it blocks | Evidence that would clear it | State |
|---|---|---|---|---|
| `BLK-01` | **No approving body is evidenced as constituted.** `authorizeAutomation()` therefore denies by default with `GOVERNANCE_BODY_NOT_CONSTITUTED`, and authorization is **unavailable** rather than merely unused | Every authorization step (2C steps 4 and 10) requires an approver whose authority is evidenced. Inventing one would be the defect, not the fix | Appointment records + `R-APP-01` entries + a `GOVERNED` decision in `R-DEC-01` | **BLOCKED** |
| `BLK-02` | **`R-AUT-01` holds zero authorized automations** — deliberately, and it must stay zero until `BLK-01` clears | Populating it to show progress would manufacture authority | A governed decision per automation, with scope, version, window and revocation route | **BLOCKED** (by `BLK-01`) |
| `BLK-03` | **All nine `BEYU-SCG-08` registers open at ZERO** (`R-DEP-01`, `R-CUS-01`, `R-AUT-01`, `R-ORA-01`, `R-INC-01`, `R-REC-01`, `R-EVD-01`, `R-APP-01`, `R-DEC-01`) | Templates are honest; a register is a control only when it holds entries | First governed entries, made by an authorized body | **BLOCKED** |
| `BLK-04` | **The 27 FIRs remain unratified (24 blocking)**, including the family-institution FIRs that bear on roles, membership and beneficiary status | Role and authority models cannot be finalised against unratified authority questions | Ratification by the competent body, or an express scoping-out | **BLOCKED** |

---

## 3. CUSTODY

| ID | Blocker | Why it blocks | Evidence that would clear it | State |
|---|---|---|---|---|
| `BLK-09` | **No custody decision and no appointed custodian.** `BEYU-SCG-03` is a `CONDITIONAL_DRAFT` and its `K-1` holds fail-closed | Signing-key custody cannot be designed before the custodian and the standard are chosen | Board resolution naming the custodian, adopting a custody standard, with counsel review | **BLOCKED** |

No custodian is named, none is proposed here, and no key material exists anywhere in the repository.

---

## 4. LEGAL (Tanzanian counsel or regulator)

Counsel items are recorded in full in `BEYU-SCG-10` and in the legal pack's
`LEGAL_SOURCES_REGISTER.md`. This register records only their status as blockers.

| ID | Blocker | Evidence that would clear it | State |
|---|---|---|---|
| `BLK-10` | **Twenty counsel questions remain unanswered.** Ten are marked blocking: `Q-SCG-01`…`Q-SCG-04`, `Q-SCG-07`, `Q-SCG-09`, `Q-SCG-11`, `Q-SCG-12`, `Q-SCG-15`, `Q-SCG-19` | Written advice from qualified Tanzanian counsel, per question | **BLOCKED** |
| `BLK-11` | **The trademark term conflict is unresolved** — a secondary source states 7 years, another 10. The conflict is recorded and **neither figure is asserted** | Primary text or counsel confirmation | **BLOCKED** |
| `BLK-12` | **Trust-incorporation fee conflict** — the statute indicates 100,000 for incorporation while Form T.I.2 indicates 20,000 | RITA confirmation or counsel | **BLOCKED** |
| `BLK-13` | **Gate 0: `ACCOUNTING AUTHORITY = NOT RATIFIED`** | Ratification by the competent authority | **BLOCKED** |

Every legal item above is recorded with its issuing authority, date/version, official URL, date
accessed and its uncertainty in the legal pack's `LEGAL_SOURCES_REGISTER.md`. Where a provision could
not be retrieved from a primary source, it is not cited as fact anywhere in either pack.

---

## 5. IDENTITY & ROLE VERIFICATION

| ID | Blocker | Why it blocks | Evidence that would clear it | State |
|---|---|---|---|---|
| `BLK-05` | **Family Office membership is not modelled at all.** There is no membership table, no seat, no term and no record of who holds a seat; `src/lib/family/office/authority.ts` derives authority only from `RESOLUTION`/`DELEGATION` references and carries no `role` field | Membership confers no authority — that is correct — but the absence of the concept also means membership cannot be evidenced, granted, limited or revoked. `BEYU-SCG-15` §7 row 11 and `BEYU-SCG-17` `A-09` record the gap | A governance decision defining seats, holders and terms, **then** an additive, isolated, reviewed schema change | **BLOCKED** |
| `BLK-14` | **The family drafting facts are unverified drafting inputs, not identity records.** The settlors' and daughter's details are recorded as *reported* facts supplied for drafting; no identity document, date of birth, address, signature or citizenship is evidenced | Deriving a date of birth from a reported age, or treating a reported relationship as a verified identity, would fabricate evidence inside a trust instrument | Identity verification by the competent authority, with the evidence recorded | **BLOCKED** |
| `BLK-15` | **Every `familyMembers` row enters with `verificationStatus = UNVERIFIED`, and no verifier is evidenced** | The schema is correct to default to `UNVERIFIED`; the missing piece is an authority able to verify | A verifier with evidenced authority, per row, recorded with method and date | **BLOCKED** |
| `BLK-16` | **No trustee identity, no guardian identity and no other beneficiary identities exist.** None is invented here | The instrument has a single `[SETTLOR NAME]` slot and an undefined `[BENEFICIARY CLASS]`; the other beneficiaries are **expressly not** identified by the user | Instructions naming them, then counsel review | **BLOCKED** |

---

## 6. PRIVACY & CHILD PROTECTION

| ID | Blocker | Why it blocks | Evidence that would clear it | State |
|---|---|---|---|---|
| `BLK-06` | **Minority is not modelled anywhere in the codebase.** No date of birth, no age, no guardian, no incapacity, no age-transition event exists in schema, service or test | A daughter who is a minor cannot be protected *by the system* when the system has no concept of minority. The protection today rests entirely on access control and classification, which is real but partial | A privacy and child-protection decision, **then** an additive, isolated, reviewed schema change — never a production migration in this phase | **BLOCKED** |
| `BLK-07` | **The specific child-protection rules are drafting positions, not agreed controls:** no login credentials, no signature capability, no payment or investment authority, no administrative permissions, no direct control of trust assets from membership alone; identity minimised and excluded from logs, public blockchain data, analytics and unnecessary UI | These are stated as requirements in `BEYU-SCG-17` §6 and the legal-pack amendment proposal. They need a decision to become controls | Privacy owner + counsel confirmation, then enforcement in code where enforceable | **BLOCKED** |
| `BLK-17` | **`FIR-015` (privacy, minors, sealed records, retention) and `FIR-016` (evidence/audit/provenance) are unratified** | Family and vault handling cannot be finalised against unratified rules | Ratification (`Q-DP-01`) | **BLOCKED** |

The duty of care here is asymmetric: a minor cannot consent, cannot ratify a mistake later, and cannot
be made whole by an appeal. The default is therefore minimum data, minimum access, no capability, and
`BLOCKED` where an answer is required.

---

## 7. PROVIDER DUE DILIGENCE

| ID | Blocker | Why it blocks | Evidence that would clear it | State |
|---|---|---|---|---|
| `BLK-18` | **No oracle, RPC, custody or payment provider has been assessed.** `R-ORA-01` is empty and ten feeds are named with no live source configured | An oracle is an authority input the platform did not create and cannot vouch for: unattested external data must never become a ground of execution | Provider assessment with provenance, failure modes, manipulation resistance and contractual terms, plus legal review | **BLOCKED** |

---

## 8. TECHNICAL ENFORCEMENT

These are the blockers engineering can clear. Each is open; none is claimed as done.

| ID | Blocker | What would clear it | State |
|---|---|---|---|
| `BLK-08` | **The seed wrote fabricated verification metadata that could be read as legal or identity evidence.** `src/db/seed.ts` asserted `verificationStatus: "VERIFIED"`, `verificationMethod: "DOCUMENTARY_AND_COUNSEL_REVIEW"`, `verifiedBy: "FAMILY_COUNCIL"` and `verifiedAt: 2025-06-02` on demo family members, `eligibility: "ELIGIBLE"` + `verifiedBy: "TRUSTEE_BOARD"` + `approvedByResolutionId: R2025_007` on demo beneficiaries, `kycStatus: "VERIFIED"` + `kycMethod: "NIDA_DOCUMENT_VERIFICATION"` on every demo party, and a `dataBasis` naming a "lineage verification pack FV-2025-03". None of it happened (`BEYU-SCG-15` `C-5`, `BEYU-SCG-17` `A-08`) | Synthetic rows that carry a verifying actor, a method and a date are indistinguishable from evidence. The actor, the method and the pack did not exist; the repository's own federation registry records NIDA as `CONTRACT_PENDING` / `NONE_PUBLISHED` / `UNVERIFIED`, so the KYC claim could not have been performed at all | **CORRECTED IN CODE, PENDING HUMAN REVIEW** — the fabrication is removed and `tests/security/synthetic-fixture-integrity.test.ts` (15 tests, verified to fail against the old data and pass against the fix) now guards it. Remaining, and not cleared by that change: **the seed is never legal or identity evidence**, and every environment seeded before the fix still holds the fabricated rows — a successful re-seed does **not** overwrite them (`onConflictDoNothing`), so remediation of each existing environment is an authorised, evidenced operator action, never an unattended one | **CORRECTED IN CODE — awaiting review; residual open** |
| `BLK-19` | `V-5` (documentation-only change set) is **not automated** and cannot be: an artefact does not carry the intent to be documentation-only. It is a pull-request property | The review checklist in `BEYU-SCG-17` §4, applied by a human reviewer | **OPEN — by design** |
| `BLK-20` | `V-3`'s coverage check is a **directory-level floor**, not behaviour-level completeness | A per-behaviour inventory method, or accepting the floor explicitly as the standard | **OPEN** |
| `BLK-21` | **Sixteen authority-check kinds exist; no populated determination store was observed**, so the number ever performed is unknown | Reading the determination store in a governed environment and recording the count | **OPEN** |
| `BLK-22` | **`verify:scg` is not a proof of absence.** A static scan cannot prove no signing capability exists; it proves the patterns it knows are absent | Nothing fully clears this. It is a limitation to be stated whenever the check is cited as assurance | **OPEN — inherent** |
| `BLK-23` | **Critical findings from this phase are non-blocking on merge only if they are disclosed.** The change set is no longer documentation-only (`BEYU-SCG-15` §8), so the pack's own `V-09` reads SUPERSEDED | The PR-split recommendation (`BEYU-SCG-17` §4), decided by a human reviewer | **OPEN** |

---

## 9. OUT OF SCOPE

| ID | Item | Why it is out of scope |
|---|---|---|
| `BLK-24` | Choosing a custodian, appointing trustees, creating signing powers, approving a beneficiary schedule, constituting a governance body, selecting a provider, ratifying FIRs, answering counsel questions, deploying to any network (production **or** testnet), applying any production migration, moving funds | Each requires an authority the platform does not hold. Recording them as blockers is the correct act; **performing them would be the breach** |
| `BLK-25` | Exchange control, AML, `.tz` domain rules, VAT, employment, land, charity tax exemption, Zanzibar regimes, and the Copyright and Societies Acts | Not retrieved from a primary source during research, so never cited. See the legal pack's `LEGAL_SOURCES_REGISTER.md` "not retrieved — never cite" list |
| `BLK-26` | Closing this phase's work by merging | A merge is a human decision at the review gate. Nothing in this repository may self-approve, auto-merge or deploy |

---

## 10. Summary

| Class | Open blockers |
|---|---|
| TECHNICAL ENFORCEMENT | `BLK-08`, `BLK-19`, `BLK-20`, `BLK-21`, `BLK-22`, `BLK-23` |
| GOVERNANCE-BODY DECISION | `BLK-01`, `BLK-02`, `BLK-03`, `BLK-04` |
| CUSTODY | `BLK-09` |
| LEGAL | `BLK-10`, `BLK-11`, `BLK-12`, `BLK-13` |
| IDENTITY & ROLE VERIFICATION | `BLK-05`, `BLK-14`, `BLK-15`, `BLK-16` |
| PRIVACY & CHILD PROTECTION | `BLK-06`, `BLK-07`, `BLK-17` |
| PROVIDER DUE DILIGENCE | `BLK-18` |
| OUT OF SCOPE | `BLK-24`, `BLK-25`, `BLK-26` |

**26 blockers, 0 cleared.** The six technical items are open rather than blocked, because engineering
can act on them under review. The other twenty require an authority that has not acted, and each
is recorded as `BLOCKED` for that reason.

**Phase 3 reconciliation (2026-10-15).** This register previously stated a total of 26 while holding
24 rows: `BLK-05` and `BLK-08` were cited by `BEYU-SCG-15` `C-5`, `BEYU-SCG-17` `A-08`/`A-09` and the
legal pack's `BEYU-LF-D76` while having no row of their own. Both rows are restored above from those
cross-references — no blocker was invented, and no count was adjusted to fit. `BLK-08` is the only
entry with a corrective change set; **it is not cleared**, because its clearing authority is
engineering under review and that review has not happened. See `BEYU-SCG-18`.

`BLK-01` is the keystone: while no approving body is evidenced as constituted, authorization is
unavailable, `R-AUT-01` must stay empty, and the correct posture for every automation is refusal.
That is not a failure of this phase — it is the phase's most important finding, and it is now enforced
by code rather than described in a document.

---

## What this register does not establish

* It is not a risk-acceptance record. No blocker has been accepted, waived or deferred, and the
  platform does not hold the authority to accept any of them.
* It is not a completeness proof. It records the blockers found; a blocker nobody has looked for yet
  is not in it.
* It does not clear anything. An entry is cleared by the authority named in its class, on evidence,
  and the clearing act must be recorded — never by editing this table.
* It does not resolve any counsel question, appoint anyone, or decide anything.
* It is not legal advice, and the classification of an item as LEGAL is not an opinion on the law.
