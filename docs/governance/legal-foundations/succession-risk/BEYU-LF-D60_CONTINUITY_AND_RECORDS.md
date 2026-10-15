# BEYU-LF-D60 — Business Continuity, Disaster Recovery and Critical-Records Policy

Document ID: `BEYU-LF-D60` · Version 1.0 (draft) · Date 2026-10-15
Status: **`COMPLETE_DRAFT`** — **no continuity plan exists; no backup or restoration has been tested; no critical-record inventory exists; nothing here is in force.**
Owner (proposed): Chief Technology Officer with the Chief Governance Officer. Approving authority (proposed): the board, the Trustees and the Family Council, each for its own part.
Classification: `HIGHLY_RESTRICTED` (this document concerns people and incapacity).
Related: `D08`, `D56`, `D58`, `D61`, `D62`, `D67`, `D70`, `D71`, `D74`, `D75`
Depends on: the existing engineering/security documentation (**mechanism, not legal authority**); `Q-R-04`

> **⚠ THE LEGAL DIMENSION OF CONTINUITY.**
> Continuity is usually treated as an engineering topic. In this pack it has a legal edge: **you cannot
> comply with a filing deadline if you cannot reach your records; you cannot prove ownership if the only copy
> of the instrument is lost; you cannot defend a claim if the evidence is gone; and you cannot exercise a
> power if the authority document is in a system nobody can access.**
> **And the converse: a restitution of data is not a restitution of legal position.** Restoring a backup
> **never** restores a right, a title or an authority that was not validly created (`DEFINED_TERMS.md` §2).

---

## 1. Scope

(a) **Operations**: the systems, people and suppliers whose failure stops the group; (b) **records**: the
critical legal, financial, personal and technical records; (c) **authority**: how decisions are made in a
disruption; (d) **evidence**: how the group proves what it did and what it owns.

## 2. Critical records (the inventory that must exist)

| # | Record class | Owner | Backup | Location | Access if a person is unavailable |
|---|---|---|---|---|---|
| 2.1 | **Trust instrument** and related deeds (originals + copies) | Trustees | Encrypted off-site + registry/deposit per `Q-R-04` | `D74` | Two trustees + counsel |
| 2.2 | Constitutional documents and registers (`D63`, `D64`, `D66`) | Company Secretary | Encrypted + registry filings | `D74` | Secretary + a director |
| 2.3 | **Share certificates, title deeds, insurance policies, licences** | Secretary | Copies; originals in custody per `D74` | vault | Secretary + a director |
| 2.4 | **Financial records** and the accounting system | CFO | System-level backup + off-site | accounting authority | CFO + a director |
| 2.5 | **Contracts and the obligation calendar** (`D68`) | Secretary | Encrypted + the calendar is itself backed up | — | Secretary + CGO |
| 2.6 | **Personal and beneficiary data** | DPO | Encrypted; access-controlled; **restoration is a data-protection event** | — | DPO + CGO |
| 2.7 | **Source code, models and datasets** | CTO | Repository mirrors; entity-owned accounts | — | CTO + a second admin |
| 2.8 | **Credentials and keys** | CTO | Approved credential store with break-glass procedure | — | two named people |
| 2.9 | **Litigation and dispute files** | CGO | Encrypted; **privilege-protected** | — | CGO + counsel |
| 2.10 | **Minutes, resolutions, delegations** (`D73`) | Secretary | Encrypted | — | Secretary + CGO |

**2.11 The "two-person" rule.** **Every class above must be recoverable if any single person is
unavailable.** Where it is not, that is a **critical risk** (`D61`) — record it, do not assume it.

## 3. Continuity plan requirements

| # | Requirement |
|---|---|
| 3.1 | **Business impact analysis**: which activities cannot stop, for how long, and what depends on them |
| 3.2 | **Recovery objectives stated** (recovery time and recovery point) **for each critical activity** — in the group's own words, not a vendor's |
| 3.3 | **Named alternates** for each critical role (`D58`) |
| 3.4 | **Supplier dependency map** with alternates where a single supplier is critical |
| 3.5 | **Authority during disruption**: `D62`'s emergency matrix — who may act, for what, for how long, with what reporting |
| 3.6 | **Decision record** during an incident — every material decision recorded contemporaneously (`D73`) |
| 3.7 | **Communication plan**: who speaks, to whom (staff, customers, family, regulator, bank, insurer) with a **single named spokesperson** (`D47` §6) |
| 3.8 | **Insurance and notification**: notify the insurer within policy deadlines; a late notification can forfeit cover (`D71`) |
| 3.9 | **Legal holds**: in a dispute or an investigation, **preserve records and suspend deletion** — a data-retention policy does not override a legal hold |
| 3.10 | **Test**: at least annually, **and record the result honestly**, including what failed |

## 4. Disaster recovery requirements

| # | Requirement |
|---|---|
| 4.1 | Backups are **encrypted**, **off-site**, and **tested by an actual restoration** at least annually |
| 4.2 | **Restoration is verified against the source** — a backup that restores nothing usable is not a backup |
| 4.3 | **A restoration test is a legal event** where personal data or privileged material is involved: access must be controlled and the restoration logged (`D70`) |
| 4.4 | **Ransomware/exfiltration** is treated as a security incident *and* a potential **legal** incident (notification duties, confidentiality, trade secrets) |
| 4.5 | **Degraded-mode operations** are defined (manual payment process — **with the two-signature rule preserved**, and the manual record reconciled afterwards) |
| 4.6 | **Post-incident review** with actions, owners and dates — and the lessons fed into `D61` |

## 5. Prohibited practices

| # | Prohibited |
|---|---|
| 1 | **Claiming a system can restore a right, a title or an authority** |
| 2 | Relying on a **single copy** of a critical instrument or on a **single person's** credentials |
| 3 | Storing working copies of registers or financial records **outside the approved environment** ("just on my laptop") |
| 4 | Testing a restoration on **live personal data** without controls |
| 5 | Deleting records subject to a **legal hold**, or "cleaning up" during an incident |
| 6 | Communicating during an incident without the single-spokesperson rule |
| 7 | Presenting a continuity plan that has **never been tested** as if it were operational |

## 6. Decisions required

1. The **critical activity list** and the recovery objectives.
2. The **records custodian** and the **second access holder** for each record class.
3. The **backup and testing** cadence, and who signs off the test.
4. The **emergency authority** (`D62`) and its interaction with `D56`.
5. The **spokesperson** and the communication protocol.
6. The **insurance notification** process.

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **custody** requirements for originals, and what must be deposited with a court or regulator (`Q-R-04`).
2. Whether a restored electronic record has **evidential weight**, and the requirements to rely on it.
3. The **notification duties** to a regulator or to data subjects after a breach (`Q-DP-05`).
4. The **legal-hold** obligations and the consequences of deletion.
5. Whether **insurance cover** responds to cyber, data or business-interruption losses.
6. Whether **privilege** survives a restoration or transfer of the privileged material.
7. The **contractual** notification duties to customers and suppliers.
8. Whether any **regulated activity** requires a continuity plan filed with a regulator.

**No continuity plan exists. No restoration has been tested. Nothing in this policy is in force.**