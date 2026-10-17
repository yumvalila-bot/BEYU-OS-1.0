# BEYU-LF — Implementation Roadmap and Execution Checklist

Document ID: `BEYU-LF-REG-ROADMAP`
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Owner: Chief Governance Officer (proposed)
Purpose: state, in order, what must happen before **any** legal instrument in this pack can be executed,
filed or relied upon — and who must do it.
Classification: `INTERNAL`

> **THE ROADMAP'S CENTRAL RULE.**
> **No gate may be skipped, and no gate may be passed by document-writing.** Every gate below requires a
> **human** decision, a **professional** opinion, a **payment**, a **signature**, or a **filing**. This pack
> can prepare work for a gate; it can never satisfy one.
> **Where a gate is not passed, the instruments downstream of it must not be executed** — and no
> "interim" execution is permitted on the basis that the paperwork can be fixed later.

---

## 1. The gates

### GATE 0 — Repository and evidence audit ✅ **COMPLETE**

**Deliverable:** `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md`.
**Outcome:** the repository's legal-looking material was classified; the seed-data and fixture hazards were
identified; the authority ranking and six conflicts were recorded.
**Effect:** nothing below may rely on seed data, sector fixtures or root status reports as legal fact.

### GATE 1 — Decision and assumptions register ✅ **COMPLETE**

**Deliverable:** `DECISION_AND_ASSUMPTIONS_REGISTER.md` (`BEYU-LF-REG-DAR`).
**Outcome:** 78 items classified A–F; the operating rule established that no claim is relied on without a
class; the top-three derailers identified.
**Effect:** every later document cites `DAA-*` IDs instead of re-deriving conclusions.

### GATE 2 — Source verification and counsel instruction ☐ **NOT PASSED**

| # | Requirement | Owner | Evidence that the gate is passed |
|---|---|---|---|
| 2.1 | `LEGAL_SOURCES_REGISTER.md` reviewed, and each `REQUIRES VERIFICATION` item either verified against official text or left flagged | Chief Governance Officer + counsel | A marked-up register with the verification status updated |
| 2.2 | **Counsel instructed** on `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` | Founder | An engagement letter with a named advocate |
| 2.3 | **Tax adviser instructed** on `§5` of the counsel brief | Founder | An engagement letter |
| 2.4 | Written answers received to the **four unblocking questions**: `Q-T-02` (trust route and Cap. 318 applicability), `Q-G-01` (Foundation form), `Q-G-03` (Foundation independence), `Q-H-01` (dual-class validity) | Counsel | Written opinions |
| 2.5 | The **first trust jurisdiction** decided (`DAA-ARCH-006`) | Founder | A recorded decision |
| 2.6 | The **"Sector LLC"** question decided (`DAA-ARCH-005`) | Founder | A recorded decision |

**Blocked until GATE 2 passes:** `D01` route selection; `D02` finalisation; `D20`/`D21`/`D22`/`D23`;
`D48`/`D49`; `DC-01` insertion into any instrument; **all filings and registrations**.

### GATE 3 — Structure and constitutional decisions ☐ **NOT PASSED**

| # | Requirement | Owner |
|---|---|---|
| 3.1 | The **family definition** adopted (`FIR-003`) | Family Assembly |
| 3.2 | The **beneficiary classes** decided and counsel-confirmed (`D05` §2) | Settlor + counsel |
| 3.3 | The **share capital plan** decided (who subscribes, at what price, with what consideration) (`D24` §9) | Founder + board |
| 3.4 | The **authority allocation** decided — every threshold in `D04` §7 and `D27` §3 | Family + board |
| 3.5 | The **dual-class design** decided (ratio, holders, conversion triggers, sunset) — **or abandoned** (`DC-01` §4) | Founder + counsel |
| 3.6 | The **Foundation form** decided (`D48`) | Founder + counsel |
| 3.7 | The **exit, deadlock and succession** mechanisms decided (`D29`, `D57`, `D59`) | Family + counsel |

### GATE 4 — Documentation and registration preparation ☐ **NOT PASSED**

| # | Requirement | Owner |
|---|---|---|
| 4.1 | Constitutional documents drafted to the decided governance (or `D21`'s blocker resolved) | Counsel + Company Secretary |
| 4.2 | The trust instrument finalised and settled by counsel | Counsel |
| 4.3 | Insurance, bank and adviser arrangements prepared | Family Office (proposed) |
| 4.4 | The compliance calendar (`D68`) populated **from official sources only** | Company Secretary |
| 4.5 | The registers (`D63`–`D74`) opened, with their owning body identified | Company Secretary / Family Office |
| 4.6 | The beneficial-ownership analysis completed (`D65`) | Counsel |
| 4.7 | The data-protection position resolved, **including registration and the cross-border question** (`D70`) | Counsel |

### GATE 5 — Professional review and scope/fee agreement ✅ **SCOPE DEFINED** (`LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` §11–§12)

| # | Requirement | Owner |
|---|---|---|
| 5.1 | Scope, deliverables and fee agreed in writing | Founder + counsel |
| 5.2 | Counsel returns: the structure opinion; marked-up drafts; written answers to the four unblocking questions; the filing calendar; and a scope/limitations statement for this pack | Counsel |
| 5.3 | Any second specialist identified (tax, IP recordal, nonprofit regulation) and instructed | Founder |

### GATE 6 — Human review, ratification and the internal gate ☐ **NOT PASSED**

| # | Requirement | Owner | Note |
|---|---|---|---|
| 6.1 | This pack is reviewed and **accepted or corrected** by the human decision-makers | Founder, Trustees (proposed), board (proposed) | **The pack is a draft; acceptance is a human act** |
| 6.2 | The unresolved **`FIR-…` decisions and `C-1`…`C-5`** are addressed through their own process | The FIR process | **This pack must not pre-empt them** |
| 6.3 | The **policy-provenance / accounting-authority** ratification is resolved | Human ratification route | `C-1`; the critical path |
| 6.4 | The **jurisdiction and structure** decisions are recorded with reasons | Founder | — |

### GATE 7 — Execution, filing and operational activation ☐ **NOT PASSED**

Ordered, dependency-driven. **Nothing here may be done before the gate it depends on.**

| Order | Step | Depends on | Evidence produced |
|---|---|---|---|
| 7.1 | Execute the **trust instrument** (with the mechanism chosen at GATE 2) | GATE 2, 3, 5 | The executed deed → `D74` |
| 7.2 | Appoint the trustees; make any required notification/return | 7.1 | Appointment deed; filing acknowledgement → `D66`, `D68` |
| 7.3 | Appoint the protector (if adopted) | 7.1 | Instrument → `D74` |
| 7.4 | Open the Trust's bank account; set the two-signature mandate | 7.1, 7.2 | Mandate; `D67` |
| 7.5 | Incorporate the **holding company** (or decide the flat structure) | GATE 2, 3 | Certificate; constitution → `D63`, `D74` |
| 7.6 | Adopt the Articles with the decided class rights; adopt the authority matrix | 7.5 | Filed Articles; board resolution |
| 7.7 | Execute the **shareholders' agreement** (if adopted) | 7.6 | Executed agreement → `D74` |
| 7.8 | Appoint the board; make the registry filings | 7.5, 7.6 | Resolutions; filings → `D66`, `D68` |
| 7.9 | Issue the **initial shares** and pay the consideration (`D24` §2) | 7.6, 7.8 | Share register; certificates; filings; accounting → `D64`, `D65` |
| 7.10 | Settle the **initial trust property** (`D06` V1–V5, asset by asset) | 7.1, 7.9 | Instruments; filings; registrations → `D67`, `D74` |
| 7.11 | Register/incorporate the **Foundation** in its chosen form | GATE 2, 3 | Certificate; constitution → `D63`, `D74` |
| 7.12 | Establish the **Foundation's** governance, policies and grant framework | 7.11 | Adopted documents |
| 7.13 | Put the **group–Foundation** arrangements in place (arm's length, documented) | 7.5, 7.11 | Agreements → `D53`, `D54`, `D72` |
| 7.14 | Establish the **Family Office** capability in its decided form and execute the mandates | GATE 3; `D31` §2 | Mandates → `D35`, `D37` |
| 7.15 | Complete **IP**: the chain-of-title work, the assignments, the filings, the recordals, the licences (`D39`–`D47`) | GATE 2 (IP questions) | Executed assignments; recordals → `D40`, `D44` |
| 7.16 | Complete **data protection**: registrations, DPO arrangement, cross-border permits where needed | GATE 4 | Registrations; permits → `D70` |
| 7.17 | Populate the **compliance calendar** with every obligation and period **from official sources** | 7.4–7.16 | The calendar → `D68` |
| 7.18 | Run the **first annual governance review** and the **first continuity test** | 7.1–7.17 | `D75`, `D60` evidence |

---

## 2. Critical path (what actually gates everything else)

```
GATE 2 (counsel's four unblocking answers)
   └─► the jurisdiction + structure decision
         └─► the trust route  ──► execute the trust ──► appoint trustees ──► the settlement
         └─► the company structure ──► incorporate ──► Articles ──► share issue
               └─► the authority matrix becomes real only when it is in the instruments
GATE 3 (the family definition) ──► the beneficiary classes ──► the Trust's purpose and distribution rules
GATE 6 (the accounting-authority ratification) ──► the money controls can be relied on
```

**The three things that most delay this kind of programme, in order:** (1) nobody instructs counsel, so the
questions stay unanswered; (2) the family definition is never adopted, so every family-facing document
stalls; (3) the structure is executed before the questions are answered, and then has to be unpicked.

## 3. What must NOT be done before its gate

| Must not happen | Until |
|---|---|
| Executing any trust instrument | GATE 2 (route) and GATE 3 |
| Incorporating any company | GATE 2 (jurisdiction and structure) |
| Issuing any share | The company's Articles are adopted and counsel has confirmed the issue mechanics |
| Placing the dual-class arrangement in any instrument | `Q-H-01(a)`–`(h)` answered |
| Registering the Foundation | Its form decided and counsel-advised |
| Any transfer of an asset onto trust | `D06` V1–V4 complete **for that asset class** |
| Engaging the Family Office's mandates | Its legal form decided (`D31` §2) |
| Making any **payment** from a body's account | The body's decision recorded, and the `D35` controls implemented |
| Populating any register | The **source document** exists |
| Filing anything | The filing requirement and period **verified from the official source** |
| Telling any person that the structure exists | The structure exists |

## 4. Ownership and accountability

| Role (proposed) | Accountable for |
|---|---|
| **Founder / Settlor** | The jurisdiction, structure and family-definition decisions; instructing advisers |
| **Counsel** | The legal route, the instruments, the filings, the limitations statement |
| **Trustees** (once appointed) | The Trust, its accounts, its distributions, its filings |
| **The board** (once constituted) | The company, its filings, its solvency, its compliance |
| **Foundation governing body** (once appointed) | The Foundation's purpose, funds and filings |
| **Chief Governance Officer** | The pack, the registers, the calendar, the consistency |
| **Company Secretary function** | The statutory registers, the resolutions, the filings |
| **Family Office Principal** | Reporting, reconciliation, controls, escalations |
| **Family Council** | The family's own governance, records and the Enforceability Verification Statement |

## 5. Immediate next actions (the shortest useful list)

1. **Instruct counsel** with `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` (the four unblocking questions
   first).
2. **Decide the two open architecture questions** (jurisdiction; "Sector LLC").
3. **Adopt the family definition** — or record explicitly that the Constitution is deferred until it exists.
4. **Provide the constitutional documents** (or confirm Path B for `D21`).
5. **Confirm whether any entity, trust, share or asset actually exists today**, and if so, provide the
   instrument. **Everything downstream depends on this answer.**
6. **Decide whether a structure is needed at all** — the flat option (`D20` Option 4) is a legitimate
   answer, and it is cheaper.

## 6. Expansion gates (revision 1.1) — Gates 1–7 and what each one delivered

**The expansion ran the same discipline as Gates 0–7: audit, draft, integrate, record, and stop at the human
review gate.** Each expansion gate is complete **as drafting** and **blocked as substance** — and the roadmap's
rule is unchanged: **nothing moves to "executed" because a document exists.**

| Gate | Delivered | **What it is blocked on** | Where the blocker is recorded |
|---|---|---|---|
| **1 — Trust clauses** | The four clauses integrated **into the deed** (`D02` §10.8–10.20, §11A, §16.4–16.15, §20A), mirrored in `D03` §5, cross-referenced in `D04`/`D05`/`D09`, with `Q-TC-01`–`Q-TC-08` filed | **Counsel (`Q-TC-01`–`Q-TC-04`, `Q-TC-07`) and the jurisdiction/structure decision** | `TC-01` §6; **P-17** |
| **2 — Founders and corporate** | `FA-01`, `INC-01`, `CX-01`, `CAP-01`, `ESOP-01`, `FIN-03`; `D23` extended with §5A | **The structure decision; the founders' own decisions; counsel (`Q-TC-09`–`Q-TC-16`, `Q-R-01`)** | `REQUEST_TO_DOCUMENT_MATRIX` §2 |
| **3 — Confidentiality, covenants, IP** | `NDA-01`, `RC-01`, `IP-TM-01`, `IP-EV-01` (no duplicate IP assignment — `D41` reused) | **Counsel (`Q-TC-17`–`Q-TC-20`) and the unresolved trademark term** | `RC-01` §3.12; `IP-TM-01` §1 |
| **4 — Employment** | `EMP-01`–`EMP-04`, EN + Kiswahili, with the employer determination at `EMP-01` §2 | **Employment-law research — `EMP-01` Part F is EMPTY. NO HIRING MAY OCCUR** | `EMP-01` §8; `DAA-EMP-001` |
| **5 — ToS, privacy, compliance** | `TOS-01`, `PRIV-01`, `PRIV-02`, `CMP-01` | **`PRIV-02` (the data inventory) and the entity/product definition** | `PRIV-01` §1 (the publication gate) |
| **6 — Fundraising** | `FIN-01`, `FIN-02`, `FIN-03` | **Everything: no traction, no records, no transaction, no accounting authority** | `FIN-01` §1; `DAA-FIN-002/003` |
| **7 — Financial reporting** | `FIN-04`–`FIN-09`, **blank by design**, with the 15-item data-request checklist | **No ledger, no opening position, no ratified policy — `CMP-01` and `AQ-02` are the critical path** | `FIN-04` §0; `DAA-FIN-001` |
| **8/9/10 — Registers, checks, deliverables** | `MASTER_DOCUMENT_REGISTER` v1.1 (sections J/K/L); `REQUEST_TO_DOCUMENT_MATRIX`; `ACCOUNTANT_QUESTIONS…`; `GATE-9_VERIFICATION_CHECKS`; `GATE-10_DELIVERABLES` | — | — |

**6A.1 The three actions that unblock the most.** **(1) Instruct counsel with the priority-1 questions** — it
unblocks Gates 1, 2, 4 and 5. **(2) Settle the jurisdiction and structure** — it unblocks `INC-01`, `D21`,
`CAP-01` and the whole of Gate 7. **(3) Ask the accountant the five priority questions** — it unblocks the
model and every statement.
**6A.2 What must NOT be done next.** Do not incorporate, do not issue a share, do not hire, do not publish terms
or a privacy notice, do not file an IP application, do not issue a deck, and do not prepare a statement. **Each
of those is blocked by a specific missing input, and the pack says which one.**

## 7. Status of this pack

**All 76 registered documents now exist as drafts** (`D01`–`D75`, `DC-01`), plus the pack-level control
documents, the section-I index and `CHANGE_LOG.md`. **The pack is therefore complete as a DRAFTING
deliverable — and it remains wholly unexecuted.**

| What is true | What is not true |
|---|---|
| Every document is drafted, indexed and cross-referenced | Any instrument is executed, filed or registered |
| The registers exist as templates with defined fields and controls | Any register is populated |
| The decision and assumption layer (`DAR`) classifies every proposition | Any `FIR` or `C-1`…`C-7` item is resolved by this pack |
| The counsel brief states the questions, and the answer is required | Any legal question is answered |
| The roadmap states the order of execution | Any step of it has been performed |

**The next gate is GATE 6 — human review and acceptance of this pack.** **GATE 2 (counsel) is the gate that
unblocks everything else**, and the accounting-authority ratification (`C-1`) is the critical path for the
money controls. **Nothing in this pack should be presented to a family member, a bank, a regulator, a donor
or a counterparty as a legal instrument, and nothing in it should be relied upon as legal advice.**

**One closing caution, recorded because it is the failure mode this pack was written to prevent: the pack
describes a structure. It does not create one. Anything that exists only in this folder does not exist.**
