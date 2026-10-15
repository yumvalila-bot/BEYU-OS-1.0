# BEYU-LF — Change Log

Document ID: `BEYU-LF-REG-CHANGELOG` · Version 1.0 · Date 2026-10-15 · Status `INFORMATIONAL`
Status: `INFORMATIONAL` (a control document — it records drafting, not legal effect)
Owner: Chief Governance Officer (proposed) · Classification: `INTERNAL`

Purpose: record **what was created, what was changed, and what was deliberately left open** in this pack, so
that a reader can tell the difference between a considered position and an accident.

> **⚠ THE PACK IS A DRAFT.** Every document in it is marked with a status. **No instrument has been executed,
> no filing made, no register populated and no right created.** This change log records drafting — **not**
> legal effect.

---

## Version 1.0 — 2026-10-15 — initial pack

### 1. Created

| Group | Documents | Status as filed |
|---|---|---|
| Pack-level (8 + this log) | `README.md`; `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md`; `MASTER_DOCUMENT_REGISTER.md`; `DECISION_AND_ASSUMPTIONS_REGISTER.md`; `LEGAL_SOURCES_REGISTER.md`; `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md`; `DEFINED_TERMS.md`; `BLUEPRINT_TO_DOCUMENT_TRACEABILITY_MATRIX.md`; `CHANGE_LOG.md` | mixed (`INFORMATIONAL` control documents) |
| Section A — Trust (`D01`–`D10`) | D01 options; D02 deed; D03 trustee governance; D04 powers/duties/reserved matters; D05 beneficiary & distribution; D06 settlement schedule; D07 investment & risk; D08 accounts/records/audit; D09 amendment/dispute/termination; D10 trustee resolutions | mixed; D02 `COMPLETE_DRAFT` **NOT EXECUTED** |
| Section B — Family (`D11`–`D19`) | constitution, council, assembly, values/conflicts, employment, next generation, disputes, participation, communication/records | `COMPLETE_DRAFT` / `PRELIMINARY_FRAMEWORK` |
| Section C — Holding (`D20`–`D30`) | D20 options; **D21 `BLOCKED` by design**; D22 dual-class rights schedule; D23 shareholders' agreement; D24 share procedures; D25 board charter; D26 committee terms; D27 reserved matters & delegation matrix; D28 resolution templates; D29 deadlock/exit/continuity; D30 country holding & sector governance | mixed |
| Section D — Dual class (`DC-01`) | proposal memorandum | `TEMPLATE_NOT_EXECUTED` (a proposal; **not lawful until counsel confirms**) |
| Section E — Family office (`D31`–`D38`) | D31 charter; D32 service catalogue; D33 wealth reporting; D34 investment mandate; D35 custody/payment controls; D36 adviser oversight; D37 service agreement templates; D38 dashboard data dictionary | mixed |
| Section F — IP (`D39`–`D47`) | D39 ownership policy; D40 inventory & chain of title; D41 assignment template; D42 licence template; D43 contributor checklist; D44 asset register; D45 open source; D46 enforcement procedures; D47 brand/domain stewardship | mixed; **the IP register opens at ZERO verified assets** |
| Section G — Foundation (`D48`–`D55`) | D48 structure options; D49 governing-document checklist; D50 board charter; D51 independence & related-party protocol; D52 purpose/grants; D53 funding & cost allocation; D54 IP & shared-services templates; D55 compliance checklist | mixed |
| Section H — Succession & risk (`D56`–`D62`) | D56 founder incapacity; D57 succession framework; D58 role succession; D59 voting-control decision tree; D60 continuity & records; D61 enterprise risk register; D62 crisis authority matrix | mixed |
| Section I — Registers (`D63`–`D75`) | entity, ownership, beneficial ownership, officeholder, asset & liability, obligation calendar, tax & accounting, data protection, litigation/claims/insurance, related party, decision & delegation, document execution & custody, annual governance review | **all blank templates** |
| Index | `registers/README.md` (section I index) | `INFORMATIONAL` |

**Total: 76 registered documents plus this change log and the section-I index.** Every path in
`MASTER_DOCUMENT_REGISTER.md` resolves to a file on disk (verified at this revision).

### 2. Corrected during drafting (defects found and fixed)

| # | Defect | Fix |
|---|---|---|
| 1 | **Filename/title deviations** from the register (the D05/D06 precedent) | All filenames and `Title:` lines reconciled to the register, which is authoritative. **Three further deviations found and corrected in this revision:** D60, D61 and D62 were written under longer filenames and **renamed** to `succession-risk/BEYU-LF-D60_CONTINUITY_AND_RECORDS.md`, `…D61_ENTERPRISE_RISK_REGISTER.md`, `…D62_CRISIS_AUTHORITY_MATRIX.md` |
| 2 | **Status-cell mismatches** between the register and the documents (11 rows: D06, D07, D08, D16, D24, D30, D32, D33, D34, D38, D75) | The **documents' own status** is now authoritative and the register was aligned to it — **except D75**, where the document's blanket template header was the error (a review checklist is not a blank register) and the document was corrected to `COMPLETE_DRAFT` |
| 3 | **Dangling counsel-question citations** (`Q-G-04`, `Q-F-01`, `Q-FO-01`, `Q-FO-02`) referenced by documents but absent from the counsel brief | `Q-G-04` retargeted to `Q-G-02`; **`Q-F-01`, `Q-FO-01` and `Q-FO-02` were added to the counsel brief as §6.1 (family-governance questions)** because the underlying questions are real and were relied on by the Decision and Assumptions Register and by D11 |
| 4 | **Mis-numbered IP citations** where a counsel question was cited for the wrong subject (term/renewal, first ownership, moral rights, recordal) | Corrected across `D39`–`D46` to the actual `Q-IP-01`–`Q-IP-07` numbering (e.g. the trade-mark **term** is `Q-IP-02`; **first ownership** is `Q-IP-01`; **Madrid/regional filing** is `Q-IP-03`; **assignment formalities and moral rights** is `Q-IP-04`) |
| 5 | **Empty section references** (`§)`) in five places | Replaced with the correct referenced section or an intelligible description |
| 6 | **A wrong internal reference** (`D28` AD-01, which is the adherence-deed template, cited for a board delegation schedule) | Corrected to the `D28` B-01 board-resolution template, with the schedule recorded in `D73` |
| 7 | A stray text corruption in `D35` | Corrected |

**These are resolved; do not re-apply.** They are also recorded in
`CROSS_DOCUMENT_CONSISTENCY_REPORT.md` as pack-internal items.

### 3. Deliberately left open (do not "fix" by choosing)

| # | Item | Why it stays open |
|---|---|---|
| 1 | **First trust jurisdiction** (`DAA-ARCH-006`) | Requires the founder's decision and counsel (`Q-T-02`, `Q-H-02`). The pack states no jurisdiction as chosen |
| 2 | **"Sector LLC"** (`DAA-ARCH-005`) | The term is used in the brief and the register's title; the pack uses **"Sector Operating Company"** and defines no "Sector LLC" (`D30` §2) |
| 3 | **Dual-class lawfulness** (`DC-01`) | `Q-H-01(a)`–`(h)` unanswered; the arrangement appears nowhere as an executed or valid structure |
| 4 | **The family definition** (`FIR-003`) | Requires the family's decision and counsel (`Q-F-01`) |
| 5 | **`D21` — review of existing constitutional documents** | `BLOCKED`: **no such documents exist to review.** It must not be completed by invention |
| 6 | **All thresholds, limits, quorums, fees and dates** | `[USER TO SUPPLY]`. Under the fail-closed rule a blank means the **most restrictive** approval applies |
| 7 | **All `FIR-…` and `C-1`…`C-7` items** | Belong to other processes; this pack must not pre-empt them |
| 8 | **The trade-mark term** | Sources conflict (7 vs 10 years); the pack asserts **no term** and creates no renewal date |
| 9 | **Tax positions** | The pack asserts **no rate, exemption, threshold or period** |

### 4. Evidence discipline applied (and to be maintained)

| # | Rule |
|---|---|
| 1 | **Seeded and fixture data are never converted into legal fact.** `MU-TR-100241`, `DIFC-4471`, `TZ-NGO-00891`, the seeded percentages, the fixture "signed IP assignment", trademark `TZ-2025-4421` and the "Madrid Protocol" filing are quarantined (`GATE-0` §6–§7) |
| 2 | **Registers open empty** and may be populated only from inspected sources (`D63`–`D75`) |
| 3 | **All statements about a real structure are status-tagged**; the pack never asserts that an entity, trust, share, office or asset exists |
| 4 | **Every legal proposition carries `[COUNSEL TO CONFIRM]`** where the pack has not verified the primary text |
| 5 | **The pack's own documents are not authority**: the legal-effect ladder (`DEFINED_TERMS.md` §2) places them at the bottom, and software below them |

### 5. Next revision

| # | Trigger | What changes |
|---|---|---|
| 1 | Counsel's answers to `Q-T-02`, `Q-G-01`, `Q-G-03`, `Q-H-01` | GATE 2 passes; D01/D02, D48/D49, `DC-01`, D20–D23 finalise |
| 2 | The family definition (`FIR-003`) | D05, D11, D16, D18, D57 finalise |
| 3 | The `DAA-ARCH-005`/`006` decisions | D30 and the holding documents finalise |
| 4 | The accounting-authority ratification (`C-1`) | The money controls and the reporting documents become reliable |
| 5 | **Any execution, filing or register population** | This log records it, with the document, the date and the evidence reference |

**Change control:** a change to any document in this pack is recorded here, with the reason. **A change that
alters a legal position is also recorded in `D73` and, where an instrument is affected, in `D74`.**
