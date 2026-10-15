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

## Version 1.1 — 2026-10-15 — expansion (trust clauses, founders/corporate, confidentiality and IP, employment, product terms and privacy, compliance, fundraising and financial reporting)

**Scope:** the expansion requested by the BEYU legal/wealth/corporate/HR/IP/fundraising/financial-governance
brief. **30 documents added in 15 new lettered series; 13 existing documents modified; `D01`–`D75` and `DC-01`
NOT renumbered.** The convention and the coverage decisions are in `GATE-0B_EXPANSION_COVERAGE_INVENTORY.md`;
the per-item mapping is in `REQUEST_TO_DOCUMENT_MATRIX.md`; the checks are in `GATE-9_VERIFICATION_CHECKS.md`;
the deliverable set is in `GATE-10_DELIVERABLES.md`.

**Entry point for a reviewer:** `GATE-10_DELIVERABLES.md` (executive summary, findings, open items, merge
blockers), then `REQUEST_TO_DOCUMENT_MATRIX.md` (what is still missing, per document), then the four trust
clauses as they now appear in `trust/BEYU-LF-D02_TRUST_DEED.md` §10.8–10.20, §11A, §16.4–16.15 and §20A.

### 1. Documents added (30)

| Series | Documents | Section in the register |
|---|---|---|
| `TC` | `TC-01` (trust clauses — **integrated into `D02`**, not standalone) | Section A / §14 |
| `FA`, `INC`, `CX`, `CAP`, `ESOP` | 5 corporate documents | §14 |
| `NDA`, `RC`, `IP-TM`, `IP-EV` | 4 confidentiality/IP documents | §14 (folders: `ip/`) |
| `EMP` | 4 employment documents (EN + Kiswahili) | **Section J** |
| `TOS`, `PRIV`, `CMP` | 4 product-terms/privacy/compliance documents | **Section K** |
| `FIN` | 9 finance documents (fundraising + reporting) | **Section L** |
| Pack-level | `GATE-0B` inventory, request-to-document matrix, accountant questions, Gate 9 checks, Gate 10 deliverables | §15 |

### 2. Documents modified (13) and why

| Document | Change | Reason |
|---|---|---|
| `D02` Trust Deed | **Four clauses inserted operatively** (§10.8–10.20 discretionary distribution; §11A spendthrift; §16.4–16.15 removal/replacement; §20A no-contest); entrenchment extension marked `[PROPOSED — NOT APPLIED]`; new §23.6 severability; integration note | The Gate 1 requirement was that the clauses live **in the deed**, not as disconnected files |
| `D03` | §5 precedence note | To remove the possibility of two removal regimes being read independently |
| `D04` | RM-04 reconciled-with-reference and flagged | **Consistency item P-17** |
| `D05` | §3 deed anchor | The "no entitlement" position is now in the operative instrument |
| `D06`, `D07` | `Q-LEG03` → `Q-LEG-03` (3 occurrences) | **Defect found by Gate 9 Check 9** |
| `D09` | §3 and §6 cross-references | `D02` §11A and §20A now exist |
| `D23` | **New §5A** (11 interface rules) + extended counsel note | The SHA had no vesting/leaver interface |
| `MASTER_DOCUMENT_REGISTER` | v1.1: sections J/K/L; coverage rows; blocked-items note | Registering the expansion |
| `README` | v1.1: §11.3 status taxonomy, §11.4 record fields, §11.5 what the expansion did/did not do, lessons 13–15 | A reader must be able to tell "drafted" from "effective" |
| `DECISION_AND_ASSUMPTIONS_REGISTER` | v1.1: §9 (28 new `DAA-*` entries), §10 (the decisions the expansion cannot make); sections renumbered 11–14 | New classes of claim require classification |
| `CROSS_DOCUMENT_CONSISTENCY_REPORT` | v1.1: P-17…P-30, four priority rows | The expansion created new interfaces |
| `LEGAL_SOURCES_REGISTER` | v1.1: expansion note (no new source; four expressly unresearched areas) | **Honesty about what was not researched** |
| `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL` | v1.1: §9A with `Q-TC-01`…`Q-TC-38` | The expansion's questions needed to be asked in writing |
| `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST` | v1.1: §6 expansion gates | Which gate delivered what, and what blocks each |

### 3. Defects found and corrected in this revision

| # | Defect | Where | Correction |
|---|---|---|---|
| 1 | **A counsel-question reference missing its hyphen** (`Q-LEG03`) | `D06`, `D07` | Corrected to `Q-LEG-03`; found by Gate 9 Check 9 |
| 2 | **Two register paths contained a typo** (`BEYYU-LF-TC-01`, `BEYYU-LF-IP-TM-01`) | `MASTER_DOCUMENT_REGISTER.md` (introduced and fixed within this revision) | Corrected; Check 1 now returns `103/103` |
| 3 | **A section-numbering collision in `DECISION_AND_ASSUMPTIONS_REGISTER.md`** (introduced and fixed within this revision) | `DAR` §9/§10 | Renumbered to 11–14 |
| 4 | **A literal typo in the Kiswahili offer-letter heading** (`OF A YA KAZI`) | `EMP-02` | Corrected to `OFA YA KAZI` |
| 5 | **A portmanteau typo** (`CORP ORATE EVENTS`) | `ESOP-01` | Corrected to `CORPORATE EVENTS` |

### 4. Deliberately open (do NOT "fix" by choosing)

1. **P-17** — who may remove a Trustee (`D02` §16.5 vs `D04` RM-04). **Routed to `Q-TC-07`.**
2. **The order of precedence** between the Articles, `D23`, `FA-01` and `CX-01`. **Routed to `Q-TC-14`.**
3. **The trademark term** (7 vs 10 years). **No date may be derived.**
4. **The `D02` §20.2 entrenchment extension.** Proposed, not applied, pending the Settlor and counsel.
5. **`D21` `BLOCKED`**, `INC-01` in part `BLOCKED`, `PRIV-01` publication gated. **All three stay blocked.**
6. **Every `[USER TO SUPPLY]`, `[TO BE DECIDED]` and `[COUNSEL TO CONFIRM]` placeholder in the new documents.**
   **Blank is the deliverable** in the cap table, the five statements, the model, the deck's claims, the ESOP
   pool and the offer letters.

### 5. Evidence discipline applied to this revision (binding on the expansion)

1. **No invented fact, figure, date, rate, fee, citation or identifier.** Every gap is `[COUNSEL TO CONFIRM]`,
   `[ACCOUNTANT TO CONFIRM]`, `[USER TO SUPPLY]` or `UNVERIFIED`.
2. **No fictional fixture was promoted.** The seeded/fixture identifiers (`DOC-IP-001`, `TZ-2025-4421`,
   `MU-TR-100241`, `DIFC-4471`, `TZ-NGO-00891`, and others) appear **only** inside statements that they are
   fiction or demonstration data. **Gate 9 Check 6 confirms this outside those contexts.**
3. **No completion word was applied.** No new document carries `APPROVED`, `EXECUTED`, `FILED` or `REGISTERED`
   (Check 5, refined form: zero hits). **Drafting completion is not approval.**
4. **No legal proposition was asserted where the law was not researched** — employment, restraint of trade,
   consumer protection and sector regulation are four labelled gaps.
5. **Four areas of law were NOT researched and are labelled on the face of every document that depends on
   them**; **no new legal source was verified in this revision.**

### 6. Verification performed (and its limits)

**14 checks with exact commands, run and recorded in `GATE-9_VERIFICATION_CHECKS.md`** — including the
register↔disk audit (`103/103`), the ID/status audit (`120/120`), the no-renumbering audit (`75/75` + `DC-01`),
the unregistered-file audit (`0`), the fictional-identifier audit, the cap-table numeric audit, the employment
fabrication audit, the counsel-question resolution audit, the accountant-question audit, the `D##` reference
audit, the bilingual-parity presence audit, the findings-recorded audit and the prohibited-claim audit.

**What was NOT done, and is not claimed:** **no registry, bank, land registry, IP registry, regulator, auditor
or court was contacted or checked; no legal, tax or accounting conclusion was verified; no clause was tested for
enforceability; no financial statement was prepared; no control in `FIN-09` was run; and the bilingual texts
were not reconciled for equivalence.** The working environment had **no general internet access**, so official
registries were unreachable (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §9).

### 7. Next revision

| # | Trigger | What changes |
|---|---|---|
| 1 | Counsel's answers (priority: `Q-TC-01`…`Q-TC-04`, `Q-TC-07`; employment `Q-TC-21`–`Q-TC-25`; product/sector `Q-TC-29`, `Q-TC-30`, `Q-TC-35`) | Gates 1, 2, 4 and 5 move; **P-17 closes**; the deed finalises |
| 2 | The jurisdiction/structure decision | `INC-01` completes, `D21` unblocks, `CAP-01` and the financial series become possible |
| 3 | The accountant's answers (`AQ-02` first) | `FIN-02` and `FIN-04`–`FIN-09` move from `TEMPLATE` to prepared statements |
| 4 | `PRIV-02` completion | `PRIV-01` may be published; `TOS-01` may be finalised |
| 5 | The founders' decisions (allocation, vesting, leavers) | `FA-01`, `CX-01`, `CAP-01`, `ESOP-01` |
| 6 | **Any execution, filing, registration or register population** | **This log records it, with the document, the date and the evidence reference — and only then may a completion status be applied** |

**Change control:** a change to any document in this pack is recorded here, with the reason. **A change that
alters a legal position is also recorded in `D73` and, where an instrument is affected, in `D74`.**
