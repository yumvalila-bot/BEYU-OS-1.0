# BEYU-SCG-07 — Incident, Pause, Upgrade and Rollback Runbook

Document ID: `BEYU-SCG-07`
Title: Incident, Pause, Upgrade and Rollback Runbook
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`CONDITIONAL_DRAFT`** — drafted and expressly conditional on appointments that do not exist
(`[TO BE APPOINTED]`), a custody arrangement that does not exist, and counsel's advice on notification
duties.
Owner (proposed): Chief Governance Officer with the Group CFO; incident commander `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`, and **after every incident and every upgrade**
Classification: `CONFIDENTIAL`
Related documents: `BEYU-SCG-01`, `BEYU-SCG-02`, `BEYU-SCG-03`, `BEYU-SCG-05`, `BEYU-SCG-06`, `BEYU-SCG-08`; legal pack: `BEYU-LF-D61` (risk register), `BEYU-LF-D62` (crisis authority matrix), `BEYU-LF-D17` (disputes), `BEYU-LF-D70`, `BEYU-LF-D74`
Depends on: incident commander and deputy appointments; the custodian appointment; counsel's answers (Q-SCG-09, Q-SCG-10, Q-SCG-12)

> **CONTROL BLOCK.**
> **This is** a runbook: what happens, in order, when something goes wrong in the smart-contract or
> automation domain — including the honest statement of **what BEYU cannot currently do**.
> **This is not** an authority to act on-chain, to move funds, to contact a counterparty's bank, or to
> make any public statement. Every action below is either (a) an action on BEYU's own records, which
> the platform already permits, or (b) an action requiring a decision and an appointment that do not
> yet exist.
> **Prohibited content:** no promise of recovery; no claim that BEYU can freeze, reverse, claw back or
> recover a transaction; no admission of liability; no invented notification deadline.

---

## 1. The structural fact that shapes every response

**BEYU holds no keys and has no signing or broadcasting capability** (`BEYU-SCG-03` §1). The direct
consequences, stated plainly so that no reader assumes otherwise:

| Consequence | Meaning for an incident |
|---|---|
| BEYU cannot move, freeze or recover assets on-chain | Recovery depends entirely on an **external custodian arrangement that does not yet exist** and on counterparties |
| BEYU cannot reverse a transaction | Immutability is a property, not an obstacle to be worked around |
| BEYU cannot "unpause" somebody else's contract | Pause/unpause applies to BEYU's own execution packages and its own records |
| BEYU's fastest controls are **on its own records**: blocking advance, opening exceptions, pausing execution packages, suspending schedules, revoking anchors, escalating | These are real, effective and immediate — within BEYU |
| **Refusing to act** is often the correct action | A suspected compromise is not a reason to sign faster |

## 2. Incident classes

| Class | Examples | Severity guide |
|---|---|---|
| **I-1 Key or custody compromise** | Suspected custodian key compromise; custody insider threat; quorum member unavailable or acting alone | **SEV-1** |
| **I-2 Contract compromise** | Exploit, unauthorised upgrade, malicious proxy implementation, compromised upgrade authority | **SEV-1** |
| **I-3 Unauthorised transfer / unknown holder** | `UNAUTHORIZED_TRANSFER`, `UNKNOWN_HOLDER` findings; unexplained movement | **SEV-1** |
| **I-4 Oracle failure or manipulation** | Feed deviation quarantine, disputed feed, poisoned source, source outage during settlement | **SEV-2** (SEV-1 if a settlement was attempted) |
| **I-5 Finality / reorg anomaly** | Block-hash mismatch, confirmation regression, chain halt affecting BEYU's records | **SEV-2** |
| **I-6 Dispute freeze** | Counterparty dispute paused execution; contested obligation | **SEV-3** (SEV-2 if funds are held) |
| **I-7 Upgrade failure** | Failed or partially applied upgrade; rollback needed | **SEV-1** if production, **SEV-3** if testnet |
| **I-8 Automation misbehaviour** | An automation that acts outside its registered class; a schedule running under the wrong identity; a refusal loop; a suppressed finding | **SEV-2**, **SEV-1** if money or authority was affected |
| **I-9 Evidence or audit loss** | Missing anchors, gaps in the event ledger, deleted evidence, failed backup verification | **SEV-2** |
| **I-10 Data-protection incident** | Personal data exposed through evidence, feeds or commitments | **SEV-1** |

## 3. Roles `[TO BE APPOINTED]`

| Role | Responsibility | Appointed? |
|---|---|---|
| Incident commander | Runs the response, owns the timeline, makes the call on severity | `[TO BE APPOINTED]` |
| Technical lead | Platform evidence, log reconstruction, containment within BEYU's own systems | `[TO BE APPOINTED]` |
| Treasury/custody liaison | The external custodian relationship; payment rails | `[TO BE APPOINTED]` |
| Legal/company secretary | Instruments, notifications, privilege, evidence chain | `[TO BE APPOINTED]` |
| Communications | One voice; nothing outside the approved wording | `[TO BE APPOINTED]` |
| Board liaison | Escalation to the board and, where a trust asset is engaged, to the trustees | `[TO BE APPOINTED]` |

**Rule R-1 `[MANDATORY]`.** No person may both execute and approve a containment action. Where the
body is too small to separate roles, **the gap is recorded in the incident record as a finding** — it
is never papered over by one person playing two roles silently.

## 4. First actions (the first hour)

**Steps that are within BEYU's own records and require no external authority:**

1. **Record the incident** — time, reporter, class, severity, what is known and what is not. Unknown
   facts are recorded as unknown (`BEYU-SCG-08` R-INC-01).
2. **Pause execution packages** for the affected contract(s) (`PAUSED` state).
3. **Suspend the relevant automations** — schedules and orchestration for the affected scope.
4. **Block advancement in payments** — open/strengthen exceptions; a blocking risk signal stops
   auto-postability without deleting the money record.
5. **Revoke or supersede anchors** where the commitment itself is in question (a governed act, not an
   automatic one).
6. **Preserve evidence** — snapshot the platform records, logs, audit trail, event ledger entries and
   digest material; **place legal holds**; nothing is deleted, including things that look wrong.
7. **Freeze the registry record** — no transition; the record is marked for review through the
   governed path, never edited to look better.
8. **Notify internally** — the incident commander, the roles in §3, the board liaison. Use one channel
   and one timeline.

**Steps that require an appointment or an arrangement that does not exist yet:**

9. Contact the external custodian / multisig counterparties — **no such arrangement exists today**.
10. Contact the network, an exchange, a counterparty bank or a law-enforcement contact — **requires
    counsel's advice and a board decision** (`[COUNSEL TO CONFIRM]`).
11. Public statement — **only** through Communications with legal review; never spontaneously.

## 5. Decision rights for pause, unpause and revocation `[PROPOSED]`

| Act | May initiate | Requires | Evidence recorded |
|---|---|---|---|
| Pause an execution package | Incident commander, CFO, or GC acting alone (speed matters) | Post-hoc ratification within 24 h by a second role | Reason, timestamp, scope, who acted |
| Resume (unpause) a package | Nobody alone | **Two independent roles** + a written determination that the cause is resolved | Cause, remediation, evidence, approvers |
| Revoke/supersede an anchor | CFO + GC jointly | Board notification | Reason, commitment reference, replacement |
| Suspend a schedule or automation | Platform owner or CFO | Register note; post-hoc ratification | Scope, reason, duration |
| Suspend signing at the custodian | Any custodian, or any two directors | Immediate record; board within 24 h | Time, initiator, scope |
| Resume signing after suspension | Board | Custody review completed and recorded | Review reference |

**Rule R-2 `[MANDATORY]`.** **Automation never resumes anything that was paused by a human.** A paused
package, a suspended schedule or a suspended signature path is resumed only by the human act above.

## 6. Upgrade and rollback `[PROPOSED]`

**No upgrade may be performed today** (no deployment exists, no custodian exists, and SC-RM-02 is not
adopted). When it may be, the process is:

1. **Change record** — what changes, why, which registry record, which interface, which data.
2. **Assessment** — risk classification, security review, re-audit where material, legal review of any
   changed obligation or term.
3. **Rollback plan, in writing, before the upgrade** — including the case where rollback is
   impossible; an irreversible upgrade requires an explicit board decision that says so.
4. **Staging** — testnet deployment and verification, with the registry record updated to
   `VERIFIED_TESTNET`.
5. **Timelock and multisig** — the delay must be real and observed; approval must be quorate.
6. **Legal review closure** — recorded, with references, before mainnet approval.
7. **Execution** — by the external custodian/signers under the recorded approval (`BEYU-SCG-02` L-12).
8. **Post-deployment verification** — commitments recomputed, events indexed, reconciliation run,
   registry record updated; findings recorded even where immaterial.

**Rule R-3 `[MANDATORY]`.** An upgrade with no documented rollback path and no board decision
accepting irreversibility is **prohibited**.

## 7. Evidence preservation and privilege

| Rule | Statement |
|---|---|
| R-4 `[MANDATORY]` | On any SEV-1/SEV-2 incident, **legal hold is applied immediately**; retention-based deletion is blocked for the affected scope, including documents that would normally expire. |
| R-5 `[MANDATORY]` | Evidence is captured **before** remediation where capture is possible without worsening harm; the capture method and hashes are recorded. |
| R-6 `[MANDATORY]` | Nothing in the incident scope is deleted, edited or "tidied". Corrections are appended with references. |
| R-7 `[PROPOSED]` | Legal-privileged material is kept separated and marked; the incident record references it without reproducing it. |
| R-8 `[MANDATORY]` | Where personal data is involved, the data-protection assessment is opened in parallel (`BEYU-LF-D70`), and notification decisions are made by counsel, not by the response team. |

## 8. Notification `[COUNSEL TO CONFIRM]`

| Audience | Rule |
|---|---|
| Internal | Immediate, per §4.8 |
| Board / trustees | Within 24 h for SEV-1; at the next meeting otherwise |
| Insurer | Only where a policy exists and counsel advises; `[TO BE DECIDED]` whether any applicable policy exists |
| Counterparties | Only with counsel's advice and a board decision; no admission of liability |
| Regulator / authority | **Only where a legal obligation requires it, identified by counsel in writing**; no deadline is asserted in this runbook because none has been verified from a primary source in this environment |
| Public | Communications only, with legal review |
| Custodian / exchange / law enforcement | Through counsel and the board; preserve evidence; do not negotiate unilaterally |

## 9. Post-incident review `[PROPOSED]`

Within **ten working days** of containment: a written review covering the timeline, root cause,
what the controls did and did not catch, whether any automation acted outside its class, whether the
inventory/register was accurate, and the changes required. Findings are recorded in `R-INC-01`,
risks in `BEYU-LF-D61`, control changes in `BEYU-SCG-04A`/`BEYU-SCG-08` as applicable. **A review that
concludes "no changes required" must say so explicitly and justify it.**

## 10. Open items

| ID | Open item | Needs |
|---|---|---|
| R-OPEN-01 | Incident commander and deputies unappointed | `[TO BE APPOINTED]` |
| R-OPEN-02 | No custodian arrangement exists, so §4.9 has no addressee | `[CUSTODIAN TO BE APPOINTED]` |
| R-OPEN-03 | Notification duties (data protection, financial, contractual) and their deadlines | `[COUNSEL TO CONFIRM]` |
| R-OPEN-04 | Insurance position and insurer notification terms | `[TO BE DECIDED]` / broker |
| R-OPEN-05 | Whether any on-chain protocol has a pause, freeze or recovery mechanism BEYU could use | Not established; depends on future deployment |
| R-OPEN-06 | Contact paths for each class of incident | `[USER TO SUPPLY]` |

## 11. What this document does not establish

It does not appoint an incident commander, create a custodian relationship, authorise any on-chain
act, promise any recovery, or assert any notification duty or deadline. It is a procedure awaiting the
appointments, arrangements and legal answers it names.
