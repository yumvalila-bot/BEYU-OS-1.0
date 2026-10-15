# BEYU-LF — Cross-Document Consistency Report

Document ID: `BEYU-LF-REG-CONSISTENCY`
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Owner: Chief Governance Officer (proposed)
Purpose: record every cross-document conflict, duplication, ambiguity and open item found while drafting
this pack, so that nothing is quietly resolved by drafting and nothing is quietly forgotten.
Classification: `INTERNAL`

---

## 1. How to read this report

Each item records: **what the conflict is**, **where it is**, **what this pack did about it** (and, where the
answer is "nothing", that the matter is deliberately left open), **who resolves it**, and **the logging
status**. A "**logged: OPEN**" item is a defect in the pack's consistency until it is resolved — and it must
not be resolved by choosing whichever reading is convenient.

**Severity:** `S1` = affects validity, ownership or authority; `S2` = affects the meaning of a document;
`S3` = presentation/terminology.

---

## 2. Conflicts carried forward from the Gate 0 repository audit

| # | Conflict | Severity | Where | What this pack did | Resolves | Status |
|---|---|---|---|---|---|---|
| C-1 | **Policy provenance / accounting authority:** `ACCOUNTING AUTHORITY = NOT RATIFIED`; PATH A — no new ratification exists; a documented `NOT NULL`/retro-link sequencing hazard | **S1** | Gate 0 §3; `HUMAN_RATIFICATION_QUEUE.md` | The pack **does not** treat any accounting-authority claim as established. Money appears only as a **reference** to the accounting authority; the Trust never holds a ledger (`D08` §1.3, `D35` §6) | Human ratification (not this pack) | **OPEN** |
| C-2 | **24 blocking FIRs** (of 27) remain unresolved; the three resolved are **constraints, not grants** | **S1** | Gate 0 §8; `phase-3-unratified-denylist.md` | The pack treats them as binding constraints and **pre-empts none** (`DAA-*` classifications; `DEFINED_TERMS.md` §8) | The family / the FIR process | **OPEN** |
| C-3 | **First trust jurisdiction:** prose and the brief say Tanzania-first; seeded data shows a Mauritian trust and a DIFC holding company | **S1** | `D01` §2; `D20` §2; `DAA-ARCH-006` | **Deliberately unresolved.** `D01` and `D20` present routes and trade-offs and **recommend nothing**; the pack states no jurisdiction as chosen | Founder + counsel (`Q-T-02`, `Q-H-02`) | **OPEN (deliberate)** |
| C-4 | **"Sector LLC"** vs the repository's "Sector Operating Company" and four Sector OSs | **S1** | `D30` §2; `DAA-ARCH-005` | **Deliberately unresolved.** The pack uses **"Sector Operating Company"**, defines **no** "Sector LLC", and records both readings in full | Founder + counsel (`D30` §8 decision 1) | **OPEN (deliberate)** |
| C-5 | **Seeded entities** (Trust `MU-TR-100241`, Holdings `DIFC-4471`, Foundation `TZ-NGO-00891`, TINs, percentages) read like legal facts | **S1** | Gate 0 §6; `D63`, `D64`, `D67` | Every register is a **blank template**; the anti-fabrication rule is stated in each (`D24` §1, `D67` §) and no seeded value is reproduced | Continuing discipline | **MITIGATED** |
| C-6 | **Sector fixture "documents"**: a signed IP assignment, trademark `TZ-2025-4421`, and a Madrid filing designating five countries — all fiction, and the Madrid filing is independently impossible because **Tanzania is not a Madrid member** | **S1** | Gate 0 §7; `D39`, `D40`, `D44` | The IP register opens at **zero verified entries**; the fixture is recorded as a hazard; `D40` §Open title gaps names it | Continuing discipline | **MITIGATED** |
| C-7 | **Seed group contains a MINING entity (60%) that is not one of the four canonical Sector OSs** | **S2** | Gate 0 §6; `D30` §7.3 | `D30` §7.3 requires the annual governance review to ask whether the mining activity is real, and, if so, to require a **recorded architecture decision** rather than a quiet extension of the four-Sector-OS model | Family / architecture authority | **OPEN** |

## 3. Conflicts inside this pack (found while drafting)

| # | Conflict | Severity | Where | What this pack did | Resolves | Status |
|---|---|---|---|---|---|---|
| P-1 | **Two reserved-matters lists:** the Trust's (`D04` §7, `RM-01`–`RM-20`) and the company's (`D27` §3). They govern different bodies and are **not** interchangeable | **S1** | `D04` §7; `D27` §1.2, §8 | Defined the relationship, added a **cross-walk** (`D27` §8) and the **double-recording rule** (§8.4); stated that where they conflict, the instrument governing the relevant body prevails | Counsel (to ensure the trust deed and the Articles reflect the intended allocation) | **RESOLVED AS DRAFT; requires instrument consistency** |
| P-2 | **"Sector LLC"** appears in the engagement brief and in the register's own title for D30 | **S2** | `D30` title; `DEFINED_TERMS.md` §3 | Kept the register's title (traceability) but defined the term to mean **Sector Operating Company**, with the ambiguity recorded | Founder + counsel | **OPEN (deliberate)** |
| P-3 | **Family definition (`FIR-003`)** is unresolved, yet eight documents depend on it (beneficiary classes, participation, employment, next generation, succession) | **S1** | `D05` §2.3, `D11` §4.2, `D18` §", `D57` | Each document states the dependency, uses a placeholder, defines **no** family, and forbids any register from creating an entitlement by implication | Family Assembly + counsel | **OPEN (deliberate)** |
| P-4 | **Whether a right belongs in the Articles or in the shareholders' agreement** — the single most consequential drafting question | **S1** | `D23` clause 2.3 | Added the **`ARTICLES` / `HERE` classification table** and a consistency undertaking | Counsel (`Q-H-01(c)`) | **OPEN — counsel** |
| P-5 | **The dual-class arrangement may be unlawful, yet the control plane can model it** | **S1** | `DC-01` §8; `D22` | Every document states the arrangement is a **proposal**; software capability is described as **mechanism, not authority**; the register may only reflect an **executed** instrument | Counsel (`Q-H-01`) | **OPEN — counsel** |
| P-6 | **The AI boundary appears in many documents** (Trust, company, family, Foundation, Family Office, registers) — risk of inconsistency | **S2** | `D02` cl. 7.4; `D25` §1.4; `D12` §1.4; `D31` §6.5; `D51`; `D61`; `D62` | Each instance was written to the same rule: **AI may prepare and analyse; AI may never decide, vote, hold office, sign, be counted for quorum, or be recorded as an actor** | None (consistent by construction; verify by inspection) | **RESOLVED** |
| P-7 | **Shadow ledger prohibition (`FIR-018`)** vs the Family Office's natural tendency to keep working records | **S1** | `D35` §6.3; `D08` §1.3; `D05` §1.2 | Stated as an absolute prohibition with a **discovery procedure** (preserve, report, reconcile under supervision) | Continuing discipline | **RESOLVED AS DRAFT** |
| P-8 | **Trust distributions vs family support:** payments that look like support may be Trust distributions, company benefits, family-activity spend, or personal money — each with a different decision-maker | **S2** | `D05` §6.2; `D16` §3.1; `D35` §4 E-04 | Added the **"which pot is this?"** analysis: each source has its own decision-maker, and a payment must be characterised before it is made | Counsel/tax | **RESOLVED AS DRAFT; characterisation per payment** |
| P-9 | **Payment authority:** the Family Office "executes" while `D35` requires two signatures and a recorded decision — possible mismatch if a mandate grants execution authority without the signature rule | **S1** | `D34` §3 clause 2/8; `D35` §3.1 | `D34` §8.2 and `D35` §3.1 state that an execution mandate **never** overrides the two-signature rule or the requirement of a recorded decision | Implementing body | **RESOLVED AS DRAFT** |
| P-10 | **D06's title** (Initial Trust Property and Settlement Schedule) is narrower than its content (mechanics for every asset class) | **S3** | `D06` title | Title retained for register traceability; content and scope stated in the document's own header, and the mismatch noted here | None needed | **ACCEPTED (noted)** |
| P-11 | **`D21` is BLOCKED** while other holding documents assume the Articles will be drafted to the intended governance | **S1** | `D21` §1, §4.2; `D23` clause 2.3 | `D21` states the blocker and the two resolution paths (review the real documents, or re-scope to a drafting brief); the dependency is recorded in `D23`'s blocking list | Provide the documents, or confirm Path B | **OPEN (blocking dependency)** |
| P-12 | **The pack's own numbering** (`D01`…`D75`, `DC-01`) vs references in prose to sections by number, which may shift | **S3** | Throughout | The pack's convention: **cite the heading text, not the section number**, where a document is renumbered; cross-references use document IDs, not section numbers, wherever a section might move | Drafting discipline | **RESOLVED AS CONVENTION** |

| P-13 | **Documents cited counsel questions that did not exist** (`Q-G-04`, and the family/family-office questions `Q-F-01`, `Q-FO-01`, `Q-FO-02` relied on by the `DAR` and `D11`) | **S2** | `DAR`; `TRACE`; `D11`; `D38` | `Q-G-04` was retargeted to `Q-G-02`; and **`Q-F-01`, `Q-FO-01`, `Q-FO-02` were added to the counsel brief as §6.1**, because the questions are real, relied upon, and belong in the scope | Counsel (to answer them) | **RESOLVED (brief extended)** |
| P-14 | **Eleven register status cells disagreed with the documents' own status banners** (D06, D07, D08, D16, D24, D30, D32, D33, D34, D38, D75) | **S3** | `MASTER_DOCUMENT_REGISTER.md` vs each document | The **documents** were treated as authoritative for their own status and the register was aligned — **except D75**, where the document's blanket template header was the error and was corrected to `COMPLETE_DRAFT` | None (reconciled at this revision) | **RESOLVED** |
| P-15 | **Three filenames deviated from the register** (D60, D61, D62 were written under longer names) | **S3** | `succession-risk/` | **Renamed to the register's paths** (the register is authoritative — the D05/D06 precedent) and the deviation recorded in `CHANGE_LOG.md` §2 | None | **RESOLVED** |
| P-16 | **`registers/README.md`** exists as a section index but is not itself a registered document | **S3** | `registers/README.md` | Recorded here and in `CHANGE_LOG.md` §1 as an **index**, not a document; the register remains the list of documents | None | **ACCEPTED (noted)** |

## 4. Terminology consistency check (the controlled vocabulary)

`DEFINED_TERMS.md` is the pack's controlled vocabulary. Verified by inspection:

| Term | Consistent usage | Notes |
|---|---|---|
| Trust / BEYU Family Trust | ✔ | Always "proposed / not evidenced as constituted" where a status is stated |
| Holding Body / BEYU Holding Company | ✔ | Neutral placeholder where the jurisdiction is open (`DEFINED_TERMS.md` §3) |
| Sector OS / Sector Operating Company | ✔ | "Sector LLC" **never** used as a defined term |
| BEYU Foundation | ✔ | Always "separately governed; never a subsidiary; never a Sector OS" |
| BEYU Family Office | ✔ | Always "shared capability; owns nothing; decides nothing fiduciary" |
| NOELIA_AI | ✔ | Always "advisory; never an authority" |
| Reserved matter | ✔ | Two contexts, explicitly distinguished (`D04` §7 vs `D27` §3) |
| Beneficial owner | ✔ | Deliberately **not** defined by the pack; each register must state which regime's definition applies (`DEFINED_TERMS.md` §6) |
| Distribution | ✔ | Trust-only meaning; a Foundation payment is a **grant (Foundation)**, a company payment is a **dividend** or a **benefit** |
| `[COUNSEL TO CONFIRM]` | ✔ | Used consistently as the professional-verification marker |
| Placeholders | ✔ | `[BRACKETED CAPITALS]`; never filled by inference |

## 5. Prohibited-phrasing audit (the `DEFINED_TERMS.md` §9 test)

Applied by inspection to the documents drafted so far:

| Prohibited phrasing | Found? | Action |
|---|---|---|
| A statement that an entity/trust/share **exists** | **No** | Every such statement is status-tagged |
| A statement that a person **holds office** or has been appointed | **No** | All offices are "proposed"; signature blocks are blank templates |
| A statement that a document has been **executed/filed/registered** | **No** | Every instrument carries a status banner and an unexecuted execution block |
| A statement of **fee, rate, threshold, deadline or percentage** as verified | **No** | All such items are `[USER TO SUPPLY]` or `[COUNSEL TO CONFIRM]`; the pack asserts no tax rate, no fee and no filing period as verified |
| A representation that the **dual-class arrangement is lawful** | **No** | Stated as a proposal in every instance |
| A representation that a **family rule is legally binding** | **No** | The Enforceability Map (`D11` §10) classifies each clause |
| An **AI-described decision** | **No** | `FIR-017` boundary stated in every relevant document |
| Use of **seed/fixture data as fact** | **No** | Registers are blank; hazards named |

## 6. Items deliberately left open in this pack (do not "fix" by choosing)

1. The **first trust jurisdiction** (`C-3`).
2. The **"Sector LLC"** question (`C-4`).
3. Whether the **dual-class ratio** is lawful (`P-5`).
4. The **family definition** (`P-3`).
5. All **`FIR-…`** decisions and **`C-1`…`C-5`** accounting decisions (`C-1`, `C-2`).
6. Every **threshold** the family has not supplied — which, under the fail-closed rule, means the highest
   authority applies.
7. **`D21`** — blocked until the documents are provided or Path B is confirmed.

**The rule for a future editor:** if you find one of these items "unresolved", **do not resolve it. Fix the
reason it is unresolved or leave it unresolved and visible.**

## 7. Open items requiring action (summary)

| # | Action | Owner | Priority |
|---|---|---|---|
| 1 | Decide the first trust jurisdiction | Founder + counsel | **Highest** (`C-3`) |
| 2 | Decide what "Sector LLC" means | Founder + counsel | **Highest** (`C-4`) |
| 3 | Obtain counsel's answers to `Q-H-01(a)`–`(h)` for the dual-class arrangement | Counsel | **Highest** (`P-5`) |
| 4 | Adopt the family definition (`FIR-003`) | Family Assembly | **Highest** (`P-3`) |
| 5 | Provide the constitutional documents, or confirm Path B for `D21` | Family | High (`P-11`) |
| 6 | Confirm the `ARTICLES`/`HERE` classification with counsel | Counsel | High (`P-4`) |
| 7 | Confirm which seeded entities (if any) correspond to real intentions — especially MINING | Founder | Medium (`C-7`) |
| 8 | Resolve the policy-provenance / accounting-authority ratification | Human ratification route | High (`C-1`) |
| 9 | Answer `Q-F-01` (who is "family" in law) — added to the brief in this revision; it gates eight documents | Family Assembly + counsel | **Highest** (`P-3`) |
| 10 | Populate `D68` from official sources, and determine the data-protection registration position (`DAA-REG-002`) | Company Secretary + DPO | **Highest — time-sensitive** |
