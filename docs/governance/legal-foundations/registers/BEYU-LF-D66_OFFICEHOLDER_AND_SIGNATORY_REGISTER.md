# BEYU-LF-D66 — Trustee, Director, Officer and Authorised-Signatory Register

Document ID: `BEYU-LF-D66`
Title: Trustee, Director, Officer and Authorised-Signatory Register
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — **BLANK TEMPLATE. Not populated. No row describes a real entity,
office, asset, obligation, transaction, decision or document.**
Owner: Company Secretary function (proposed)
Approving authority (proposed): the Trustees and each board (none is evidenced as constituted)
Next review date: On every appointment, resignation, removal or capacity event; verified annually
Classification: `HIGHLY_RESTRICTED` (personal data)
Related documents: `D03`, `D18`, `D24`, `D25`, `D27`, `D35`, `D63`, `D64`, `D68`, `D70`, `D73`, `D74`
Depends on: `FIR-003`; counsel's answers to `Q-T-03`, `Q-H-03`, `Q-R-01`

> **⚠ STATUS.** **No person holds any office. No trustee, director, officer, protector or signatory has been
appointed. This register is empty.** The repository's seeded people, roles and permissions are demonstration
data. **A software role grant is not an office, and this register is not the source of office** — the
instrument is (`D03` §10).


---

## 1. Purpose

To hold the **single, separated record** of (a) **legal offices** (trustee, protector, director, officer,
governing-body member) and (b) **signatory/authority entitlements** — keeping the two **distinct**, and
distinguishing both from **family roles** (`D18` §5.2).

## 2. Schedule A — legal offices

| # | Field | Definition | Source |
|---|---|---|---|
| 1 | Person (party reference / GlobalUserID) | The identity key — **not** a name string alone | — |
| 2 | **Office** | Trustee / Protector / Director / Company Secretary / CEO / CFO / Foundation governor / other | The instrument + the appointment decision |
| 3 | **Entity or Trust** | The body in which the office is held | `D63` |
| 4 | **Appointing body and decision reference** | Who appointed, by what power | `D73` |
| 5 | **Instrument of appointment** | Deed / resolution / letter, with the `D74` reference | `D74` |
| 6 | **Eligibility confirmed** | Screening performed; disqualification checks; residency (Trust) | `D03` §2, `D25` §2.1 |
| 7 | **Independence assessment** | Independent yes/no, with the basis | `D25` §2.2 |
| 8 | **Conflicts declared** | Reference to the declaration | `D14`, `D73` |
| 9 | Term start / end | | Appointment |
| 10 | **Regulator notification/return** | Reference and date, cross-referring to `D68` | `D68` |
| 11 | **Capacity/end event** | Death / resignation / removal / incapacity / disqualification / term expiry, with the evidence | `D03` §6 |
| 12 | **Access revoked** | Date, so that office and access are decoupled properly | `D08` §8.3 |
| 13 | Status | `PROPOSED` / `IN OFFICE` / `CEASED` | Evidence |

**Schedule A is EMPTY.**

## 3. Schedule B — authorised signatories and authority entitlements

| # | Field | Definition | Source |
|---|---|---|---|
| 1 | Person | | — |
| 2 | **Authorising body and decision** | Per `D27` (and the mandate for a delegate) | `D73` |
| 3 | **What may be signed** | By document class (payments, filings, contracts, instruments) | The delegation/mandate |
| 4 | **Limit** | Amount/value, or "none" | The delegation/mandate |
| 5 | **Dual-signature requirement** | Who the co-signatory must be | `D35` §3.1 |
| 6 | **Bank mandates affected** | With the bank reference and the date of the update | `D67` |
| 7 | Expiry / review | | The delegation |
| 8 | **Software access** | The *access* entitlement — **expressly NOT authority** | — |

**Schedule B is EMPTY.** **The rule: authority comes from the delegation or the mandate; access comes from
the control plane. They must be kept aligned, and neither may be inferred from the other.**

## 4. Controls

| # | Control |
|---|---|
| C-01 | **Office is never conferred by this register, by software, by a workflow or by an AI output** |
| C-02 | Every office entry cites an executed instrument and a decision |
| C-03 | Family roles (`D18`) are recorded in a **separate** part of the family register — never merged here |
| C-04 | A change of office triggers: mandate/bank updates, access review, insurance notification, regulator filing, and a `D68` diary entry |
| C-05 | Incapacity is **never** determined by a software flag (`D03` §6.4) |
| C-06 | Access revocation is recorded separately from the end of office, and both are completed |
| C-07 | Personal data: least privilege; never in a public repository; a departure triggers a data-handling review |

## 5. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **eligibility and disqualification** rules for each office (`Q-T-03`, `Q-H-03`).
2. The **notification/return** obligations on each appointment and cessation, and the periods (`Q-R-01`).
3. Whether a **corporate trustee or corporate director** may hold office, and its requirements.
4. Whether a person may hold **multiple offices** across the group without a conflict, and the disclosure
   required.
5. The **signature formalities** for each document class (`Q-R-02`).

**This register is empty. Nobody holds office. Nobody has signing authority.**
