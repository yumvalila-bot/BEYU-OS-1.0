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

## 6. Status of this pack

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
