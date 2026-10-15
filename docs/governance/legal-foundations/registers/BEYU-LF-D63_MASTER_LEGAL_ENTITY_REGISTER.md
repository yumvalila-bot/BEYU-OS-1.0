# BEYU-LF-D63 — Master Legal Entity Register

Document ID: `BEYU-LF-D63`
Title: Master Legal Entity Register
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — **BLANK TEMPLATE. Not populated. No row describes a real entity,
office, asset, obligation, transaction, decision or document.**
Owner: Chief Governance Officer (proposed)
Approving authority (proposed): the Trustees and each board (no body is evidenced as constituted)
Next review date: Quarterly; and immediately on any incorporation, registration, change or dissolution
Classification: `HIGHLY_RESTRICTED` when populated
Related documents: `D20`, `D30`, `D64`, `D65`, `D66`, `D67`, `D68`, `D69`, `D70`
Depends on: the incorporations/registrations themselves; counsel's answers to `Q-R-01`, `Q-H-02`

> **⚠ STATUS.** **No legal entity in this pack has been evidenced as existing.** The repository's seeded entities are
demonstration data (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6) and must never be entered here. An entity
is entered **only** when its incorporation/registration certificate has been inspected and its reference
recorded.


---

## 1. Purpose

To be the **single index of every legal entity and body** in the BEYU structure, so that at any moment the
family can answer: *what exists, where it is registered, who owns it, who runs it, what it is for, and what
obligations attach to it.* This register is the anchor for `D64`–`D70`.

## 2. Field definitions

| # | Field | Definition | Required? | Source |
|---|---|---|---|---|
| 1 | **Entity ID** | Internal reference (`ENT-001`…) | ✔ | Assigned on entry |
| 2 | **Legal name** | Exactly as on the certificate | ✔ | Certificate of incorporation/registration |
| 3 | **Legal form** | Private company limited by shares / limited by guarantee / incorporated trustees / NGO / society / trust (unincorporated) / foreign company / other | ✔ | The certificate and the governing law |
| 4 | **Jurisdiction of incorporation/registration** | Country and, if relevant, the registry | ✔ | Certificate |
| 5 | **Registration number** | **Only from the certificate** | ✔ | Certificate |
| 6 | **Registration date** | | ✔ | Certificate |
| 7 | **Registered office** | Current | ✔ | Certificate + the filing record |
| 8 | **Governing document** | The constitution/trust instrument, with its date and `D74` reference | ✔ | The executed document |
| 9 | **TIER** | Tier 1 Trust / Tier 2 Holding / Tier 3 Country Holding / Tier 4 Sector Operating Company / Foundation / Family Office / other | ✔ | `D30` §2 (with the `DAA-ARCH-005` question recorded) |
| 10 | **Sector OS mapping** | `HEALTH_OS` / `FINANCE_OS` / `AGRICULTURE_OS` / `UJENZI_OS` / not a Sector OS / outside the four (with the reason) | ✔ | `D30` §7.1 — **a Sector OS is a software identity, not a legal entity** |
| 11 | **Purpose** | One sentence, from the governing document | ✔ | Governing document |
| 12 | **Shareholder(s) of record** | With the class and number, cross-referring to `D64` | ✔ | Share register |
| 13 | **Ultimate beneficial owner(s)** | Cross-referring to `D65`, **stating which regime's definition is applied** | ✔ | The beneficial-ownership analysis |
| 14 | **Directors / trustees / governing body** | Cross-referring to `D66` | ✔ | The appointment record + the registry filing |
| 15 | **Company secretary / secretary function** | | ✔ | Appointment record |
| 16 | **Auditor** | Or "none appointed" | ✔ | Engagement letter |
| 17 | **Tax registration(s)** | **Only from the certificate/notice** | ✔ | The tax registration document |
| 18 | **Licences held** | With the licence number and expiry, cross-referring to `D68` | ✔ | The licence |
| 19 | **Data-protection status** | Not applicable / registration pending / registered — cross-referring to `D70` | ✔ | The registration |
| 20 | **Accounting reference date** | | ✔ | Constitution/filing |
| 21 | **Reporting obligations** | Cross-referring to `D68` | ✔ | Verified per jurisdiction |
| 22 | **Status** | `PROPOSED` / `INCORPORATED` / `REGISTERED` / `DORMANT` / `IN DISSOLUTION` / `DISSOLVED` | ✔ | Evidence |
| 23 | **Evidence file** | The `D74` reference for the certificate and the constitution | ✔ | `D74` |
| 24 | **Last verified** | Date, by whom | ✔ | — |

## 3. Controls

| # | Control |
|---|---|
| C-01 | An entity may be entered **only** against an inspected certificate; the source is recorded |
| C-02 | **Demonstration/seed entities may never be entered**; if one appears, it is deleted with a recorded reason and the discovery reported |
| C-03 | Tier and Sector OS mapping are **separate fields**; a Sector OS identity never creates an entity |
| C-04 | Ultimate beneficial owners are recorded **with the regime's definition named** (`D65`) |
| C-05 | Every entity has a **named secretary function** and a compliance owner |
| C-06 | Verification at least quarterly; **`LAST VERIFIED` older than 90 days flags the row** |
| C-07 | Status changes are never deleted — a superseded status is retained with its date |
| C-08 | Access is limited to the Company Secretary function, the Chief Governance Officer, the auditors on scope, and counsel |

## 4. Interface with the control plane

The control plane's **entity records, tenant classifications and parent-child links are records**, not legal
facts. Required discipline: (a) an entity record must cite its certificate reference; (b) a tenant
classification (`HEALTH_OS` etc.) must never be presented as a legal entity; (c) a parent-child link must
match the share register; (d) **no bulk import from a demonstration dataset**.

## 5. Decisions required

1. Who maintains this register, and who may read it.
2. Whether the register is held in the control plane, a governed document repository, or both (with one
   designated as authoritative).
3. The verification frequency.

## 6. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **registration and reporting obligations** of each legal form, and the correct registry.
2. The **requirements for a foreign entity** operating in Tanzania (`Q-H-02(b)`).
3. The **beneficial-ownership filing** obligations per entity (`Q-H-05`).
4. The **disclosure/registration** obligations of a trust as such (or its absence).
5. Whether any entity requires a **licence** to exist or to operate (`Q-LEG-04`).

**This register is blank. No entity is recorded. Nothing in it evidences that any entity exists.**
