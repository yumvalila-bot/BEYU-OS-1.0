# BEYU-LF-IP-EV-01 — IP Evidence Archive, Contributor Attestations and Enforcement Log

Document ID: `BEYU-LF-IP-EV-01`
Title: IP Evidence Archive — contributor attestations, authorship evidence, open-source review, enforcement log
and evidence rules
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` + `INFORMATIONAL`** — **the archive is empty. No attestation has been signed, no
authorship evidence has been assembled, and no enforcement matter exists.**
Owner (proposed): Group CTO with the Company Secretary function · Approving authority (proposed): the board
(archive standards); the owner for each evidence item
Next review date: On counsel's markup; **then quarterly**, and on every release, hire, grant or enforcement step
Classification: `CONFIDENTIAL` (may contain personal data — `PRIV-01` applies)
Related: `D39`, `D40`, `D41`, `D43`, `D44`, `D45`, `D46`, `D47`, `IP-TM-01`, `D71`, `D74`, `NDA-01`, `EMP-01`,
`CMP-01`
Depends on: `D41` (the assignment instrument), `D43` (the contributor checklist), `D45` (open-source policy),
`D74` (custody register)

> **⚠ WHY THIS DOCUMENT EXISTS.**
> **Because "we own our IP" is a statement that must be provable years later, by people who were not there.**
> A registration certificate proves a registration; it does **not** prove who wrote the code, whether the
> contractor assigned it, whether a component is under a copyleft licence, or whether the dataset was lawfully
> obtained. **The archive is what answers those questions — and it is built at the time, not afterwards.**
> **And the archive starts EMPTY.** The repository's fictional IP documents (`DOC-IP-001`, `DOC-TM-001`
> `TZ-2025-4421`, `DOC-TM-002`) are **fixtures and must never be entered, cited or migrated into this archive**
> (`D39` §1; `D44` §5.3; `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6).

---

## 1. Evidence classification (what counts as proof)

| # | Evidence class | Proves | Does NOT prove | Where it lives |
|---|---|---|---|---|
| 1.1 | **Registry certificate / filing receipt** (inspected, with its reference) | That the registry issued that document on that date | Ownership if the holder name is wrong; validity without use | `D74` |
| 1.2 | **Executed assignment (`D41`)** | The transfer of specified rights by a specified person | The person's authority; rights they did not hold | `D74` |
| 1.3 | **Employment/contractor contract with an IP clause (`EMP-01`)** | The contractual position between the parties | The statutory position — the law may override `[COUNSEL TO CONFIRM]` | `D74` |
| 1.4 | **Contributor attestation (§3)** | The person's statement about their contribution | Its truth; it is a statement, not a warranty of fact | This archive |
| 1.5 | **Repository/commit evidence** (authorship metadata, timestamps, signatures) | That a contributor made a change at a time | Who owned it, or that they were authorised | This archive |
| 1.6 | **Open-source inventory / SBOM (`D45`)** | What components are used and their licences as recorded | That the recording is complete or current | `D45` |
| 1.7 | **Licence texts as received** | The terms as they existed at the version used | That the group complied | This archive |
| 1.8 | **Third-party licence grant (inbound)** | The rights the group was given | Rights outside the grant | `D74` |
| 1.9 | **Payment records to contributors** | That a contributor was engaged and paid | What they assigned | `D69` |
| 1.10 | **Design files, drafts, wireframes, specifications, meeting notes** | The evolution and authorship of a work | Ownership | This archive |
| 1.11 | **Model/dataset documentation** (source, licence, consent, lawful basis) | The origin of a dataset | The lawfulness of every use | `PRIV-01` + this archive |
| 1.12 | **A statement by a person** ("we wrote it", "he did it") | Nothing on its own | — | **Not evidence. Record it as a lead, then find the document.** |

**1.13 The honesty rule.** **Where an item of evidence does not exist, the archive records the gap.** A file
that lists what is missing is doing its job; a file that implies completeness it cannot show is a liability.

## 2. The chain-of-title file (per asset — mirroring `D40`)

| # | Requirement | Status |
|---|---|---|
| 2.1 | Asset identification (what exactly is claimed) | ☐ |
| 2.2 | The **creator(s)**, by name | ☐ |
| 2.3 | The **basis** on which the group claims the rights (employment / assignment / inbound licence / statutory) | ☐ |
| 2.4 | The **instrument** (executed, dated, with the parties named) | ☐ |
| 2.5 | The **assignment schedule** (a blanket "all IP" clause with no schedule is a defect — `FA-01` §2.4) | ☐ |
| 2.6 | Any **prior holder's** chain (a contractor who themselves used a subcontractor — the "sub-sub problem") | ☐ |
| 2.7 | Any **encumbrance** (security interest, licence, escrow) | ☐ |
| 2.8 | Any **third-party right** in the asset (a stock image, a font, a library, a dataset, a model weight) | ☐ |
| 2.9 | Any **moral-rights** position `[COUNSEL TO CONFIRM]` | ☐ |
| 2.10 | The **location of every original** | ☐ |

## 3. Contributor attestation (blank form)

```
IP CONTRIBUTOR ATTESTATION — CONFIDENTIAL | Ref [ ] | Date [ ]
1. I am [NAME], and I contributed to [PROJECT / REPOSITORY / WORK] between [DATES].
2. The basis of my engagement was: [employment / contractor agreement dated __ / volunteer / other __].
3. I have signed an IP assignment dated [__] (or: I have not, and this attestation is not a substitute —
   please see note 6).  [If none: the company must obtain one before relying on this.]
4. CONTRIBUTIONS: I contributed to the following (list by module/asset/file/specification):
   [ ]
5. THIRD-PARTY MATERIAL: I used the following third-party material, and I identify its source and licence:
   [ ]  (including any AI-generated or AI-assisted code, and where the model was used)
6. I confirm that, to the best of my knowledge, the work I contributed was my own original work, except for
   the third-party material identified above, and that I did not knowingly incorporate material belonging to
   another person or obtained in breach of an obligation.
7. I confirm I have not granted any right in the work to anyone else, and there is no security interest,
   licence or claim over it that I am aware of.
8. I understand that this attestation is relied on by the company, and that providing false information may
   have consequences under my agreement and at law.
SIGNED: ______________________  DATE: ______________
NOTHING IN THIS FORM TRANSFERS RIGHTS. ONLY AN ASSIGNMENT DOES. (D41)
[COMPANY USE] Reviewed by [ ] on [ ]; gaps identified: [ ]; assignment obtained? Y/N; filed in D74: Y/N
```
**3.1 The form's own warning is deliberate.** The most common chain-of-title failure is a company that has **a
statement saying a person assigned their rights, and no assignment.**

## 4. Open-source and third-party review (procedure — policy is `D45`)

| # | Step | Evidence |
|---|---|---|
| 4.1 | **Inventory** each dependency at the version used (an SBOM, or an equivalent record) | The inventory; the lock file |
| 4.2 | **Identify** the licence from the distribution itself, not from memory | The licence text as received |
| 4.3 | **Classify** the licence by obligation (permissive / notice / copyleft / network-copyleft / unclear) | `D45` §4 |
| 4.4 | **Assess the impact of copyleft** on the group's distribution model — and the interaction with the group's **proprietary** code and any **SaaS** delivery | `[COUNSEL TO CONFIRM]` — the analysis is fact-specific |
| 4.5 | **Attribution and notice files** maintained and shipped where required | The NOTICE file and its version |
| 4.6 | **Unclear or "no licence" components** are escalated — **not used** until resolved | The escalation record |
| 4.7 | **AI-generated code** is assessed: which tool, which terms, whether the output may be relied on, and whether it is disclosed | `D45` §7 |
| 4.8 | **Models, weights and datasets**: licence, provenance, and any restrictions on commercial use or on training data | `D45` §7; `PRIV-01` |
| 4.9 | **Third-party content** (images, fonts, icons, audio, text, test data) — licensed, in the archive, or replaced | The licence |
| 4.10 | **A release gate**: no production release without 4.1, 4.3, 4.5 and 4.6 closed | The release record |

## 5. Enforcement and incident log (blank)

| # | Date | Matter | Asset | Nature (infringement / misuse / leak / dispute / takedown) | Evidence preserved | Counsel instructed? | Action and outcome | Closed? |
|---|---|---|---|---|---|---|---|---|
| *— NO MATTERS —* | | | | | | | | |

**5.1 The enforcement-decision rule.** **Enforcement is a board decision on counsel's advice, with the cost,
the commercial effect and the evidence assessed** (`D46` §4). **It is never a unilateral act by an officer, a
"take-down by default", or a reaction to a competitor.** A takedown sent in error exposes the group to a claim.
**5.2** The following are recorded **even where no action is taken**: an infringement detected and tolerated (a
tolerance decision should be a decision, not an oversight), a leaked asset, a contributor dispute, and any
**demand received** by the group.

## 6. Archive maintenance

| # | Rule |
|---|---|
| 6.1 | **One archive, one index**, with a named owner; entries linked to `D40`/`D44` |
| 6.2 | **Originals (or certified/filed copies) in `D74`**, with a reference from the archive — **the archive is an index, not the vault** |
| 6.3 | **Personal data in the archive** (attestations, IDs, contributor contracts) is processed under `PRIV-01`, with a lawful basis, retention and access control |
| 6.4 | **Retention**: per the retention schedule; a **legal hold** overrides expiry (`retention-service` semantics — eligibility is not destruction) |
| 6.5 | **A quarterly completeness review**, minuted, with the gaps presented to the Audit and Risk Committee |
| 6.6 | **No AI output may be entered as evidence.** A model's assertion about ownership or authorship is **not** evidence (`DEFINED_TERMS` §2; `D31` §6) |
| 6.7 | **Evidence is never edited, back-dated or "cleaned up."** A missing document is recorded as missing; a correction is recorded as a correction with its date and author |

## 7. Decisions required from the user / family / governing bodies

1. **Which entity owns which IP** (the structure decision; `D55` for the Foundation's separate IP).
2. Whether **every contributor — including founders, past contractors and volunteers — is to be documented
   now** (a remediation exercise, and the pack's recommendation), and who runs it.
3. The **archive owner** and the reporting line.
4. The **open-source** position for the group's distribution and licensing model (`D45` §4).
5. The **AI-tool** policy for code and content generation (`D45` §7; `PRIV-01` §9).
6. The **evidence retention** period for IP records.
7. Who **authorises enforcement**, and the budget.

## 8. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether the **employment** IP rule (statutory vesting in the employer) applies to each category of
   contributor, and what it covers — **this has not been researched in this pack**.
2. Whether **contractor** IP clauses are effective without a separate assignment, and whether moral rights
   must be waived separately (`Q-IP-04`).
3. Whether an **unassigned** contributor's rights may be remediated after the fact, and how.
4. Whether **AI-generated output** is protectable, and what the group may claim about it (`Q-IP-05`).
5. Whether a **dataset** or a **model** attracts any right, and what may be licensed (`Q-IP-06`).
6. Whether a **security interest** over IP must be recorded, and the consequences of not recording it.
7. **What the group may state publicly about its IP** — no claim of ownership, registration or filing may be
   made without the evidence in this archive.

**The archive is empty. No attestation exists. No chain of title is established. Zero IP is verified as owned
by any entity in this group.**