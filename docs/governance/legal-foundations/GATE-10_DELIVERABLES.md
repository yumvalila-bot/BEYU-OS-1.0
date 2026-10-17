# BEYU-LF-REG-G10 — Gate 10 Deliverables

Document ID: `BEYU-LF-REG-G10`
Title: Gate 10 — the deliverable set (A–K), the findings by severity, the open items, the verification log and
the merge recommendation
Version: 1.0 · Date 2026-10-15
Status: `INFORMATIONAL`
Owner: CGO (proposed) · Approving authority (proposed): the family, on the human review
Next review date: At the human review gate
Classification: `INTERNAL`
Related: every document in this pack; in particular `REQUEST_TO_DOCUMENT_MATRIX.md`,
`GATE-9_VERIFICATION_CHECKS.md`, `MASTER_DOCUMENT_REGISTER.md`, `CHANGE_LOG.md`,
`ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md`, `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md`

---

## A. Executive summary

**What was produced.** A documentation expansion of `docs/governance/legal-foundations/` — **30 new documents**
in **15 new lettered series** (`TC, FA, INC, CX, CAP, ESOP, NDA, RC, IP-TM, IP-EV, EMP, TOS, PRIV, CMP, FIN`),
registered in **new sections J, K and L** of the master register, **with `D01`–`D75` and `DC-01` untouched and
unnumbered**. The four trust clauses were **integrated into the deed itself** (`D02`), not left as loose files.

**What it is.** Preparation for qualified professionals: each document carries its purpose, its clause text, the
plain-language explanation, the risks, the assumptions, the counsel/accountant questions, the required
decisions and its status. **It is a working set of drafts, templates and questions.**

**What it is not — and this is the operative part.**

> **Nothing was created, incorporated, registered, licensed, filed, executed, issued, transferred, valued,
> approved or adopted. No entity, trust, share, office, asset, contract, customer, employee, licence or
> registration is verified to exist. No clause has been reviewed by a lawyer. No accounting policy is ratified
> and there is no ledger. Four areas of law that these documents depend on — employment, restraint of trade,
> consumer protection and sector regulation — were NOT researched, and the documents say so on their face
> rather than filling the gap with an assumption.**

**The three things that matter most:**

1. **The pack's honesty is structural, not stylistic.** The cap table is **blank**; the five financial
   statements are **blank**; the model has **no inputs**; the deck has **no claims**; the ESOP has **no plan**;
   the privacy notice is **unpublished** and the terms are **not in force**; the IP register opens at **zero**;
   the employment contracts **cannot be used** until counsel supplies the mandatory terms. **Each of those is a
   deliberate outcome built into the document, because the alternative — a plausible invention — is the one
   error that cannot be undone later.**
2. **The most consequential finding is a conflict, not a gap.** **P-17:** `D02` §16.5 and `D04` RM-04 give
   two different answers for who may remove a Trustee. **The pack does not choose** — it flags the conflict in
   both documents and routes it to `Q-TC-07`. A silently resolved conflict would have been the defect.
3. **The work that remains is not drafting.** It is **decisions, professional advice and evidence**: settle the
   jurisdiction and structure; instruct counsel on the priority-1 questions; answer the accountant's five
   priority questions; complete the data inventory; and record what actually exists. **The matrix
   (`REQUEST_TO_DOCUMENT_MATRIX.md`) names, per document, exactly what each item is waiting for.**

**Recommendation:** **merge the pull request as a documentation package for human review — and take none of the
actions the documents describe as blocked.** The merge blockers (M1–M5) below are pre-conditions of *merge*, not
of *use*.

---

## B. File list

**Complete and authoritative:** `MASTER_DOCUMENT_REGISTER.md` v1.1 (103 registered paths, all resolving —
verified by `GATE-9_VERIFICATION_CHECKS.md` Check 1). **The pack now holds 120 markdown files.**

### B.1 New in this expansion (30 documents)

| Series | Document | Path |
|---|---|---|
| `TC` | Trust Clause Pack | `trust/BEYU-LF-TC-01_TRUST_CLAUSE_PACK.md` |
| `FA` | Founders Agreement | `corporate/BEYU-LF-FA-01_FOUNDERS_AGREEMENT.md` |
| `CX` | Co-founder Exit and Separation | `corporate/BEYU-LF-CX-01_CO_FOUNDER_EXIT_AND_SEPARATION.md` |
| `INC` | Incorporation and Formation Pack | `corporate/BEYU-LF-INC-01_INCORPORATION_AND_FORMATION_PACK.md` |
| `CAP` | Cap Table and Share Register | `corporate/BEYU-LF-CAP-01_CAP_TABLE_AND_SHARE_REGISTER.md` |
| `ESOP` | Employee Share Option Plan | `corporate/BEYU-LF-ESOP-01_EMPLOYEE_SHARE_OPTION_PLAN.md` |
| `NDA` | Confidentiality Agreement Pack | `ip/BEYU-LF-NDA-01_MUTUAL_AND_ONE_WAY_NDA_PACK.md` |
| `RC` | Restrictive Covenants Pack | `ip/BEYU-LF-RC-01_RESTRICTIVE_COVENANTS_PACK.md` |
| `IP-TM` | IP Search, Filing and Renewal Tracker | `ip/BEYU-LF-IP-TM-01_SEARCH_FILING_AND_RENEWAL_TRACKER.md` |
| `IP-EV` | IP Evidence Archive and Attestations | `ip/BEYU-LF-IP-EV-01_IP_EVIDENCE_ARCHIVE_AND_ATTESTATIONS.md` |
| `EMP` | Employment Contract Framework | `employment/BEYU-LF-EMP-01_EMPLOYMENT_CONTRACT_FRAMEWORK.md` |
| `EMP` | Offer Letters / Barua za Ajira (EN + SW) | `employment/BEYU-LF-EMP-02_OFFER_LETTERS_BARUA_ZA_AJIRA.md` |
| `EMP` | HR Policies and Employee Handbook | `employment/BEYU-LF-EMP-03_HR_POLICIES_AND_HANDBOOK.md` |
| `EMP` | Bilingual Glossary and Language Control | `employment/BEYU-LF-EMP-04_BILINGUAL_GLOSSARY_EN_SW.md` |
| `TOS` | Terms of Service (EN + SW) | `product-compliance/BEYU-LF-TOS-01_TERMS_OF_SERVICE.md` |
| `PRIV` | Privacy Policy / Sera ya Faragha (EN + SW) | `product-compliance/BEYU-LF-PRIV-01_PRIVACY_POLICY.md` |
| `PRIV` | Data Inventory and Data-Flow Mapping | `product-compliance/BEYU-LF-PRIV-02_DATA_INVENTORY_AND_FLOW_MAPPING.md` |
| `CMP` | Compliance Pack | `product-compliance/BEYU-LF-CMP-01_COMPLIANCE_PACK.md` |
| `FIN` | Pitch Deck Framework and Claim Evidence | `fundraising/BEYU-LF-FIN-01_PITCH_DECK_AND_CLAIM_EVIDENCE.md` |
| `FIN` | Financial Model | `fundraising/BEYU-LF-FIN-02_FINANCIAL_MODEL.md` |
| `FIN` | Term Sheet | `fundraising/BEYU-LF-FIN-03_TERM_SHEET.md` |
| `FIN` | Income Statement | `financial-reporting/BEYU-LF-FIN-04_INCOME_STATEMENT.md` |
| `FIN` | Cash Flow Statement | `financial-reporting/BEYU-LF-FIN-05_CASH_FLOW_STATEMENT.md` |
| `FIN` | Balance Sheet | `financial-reporting/BEYU-LF-FIN-06_BALANCE_SHEET.md` |
| `FIN` | Statement of Changes in Equity | `financial-reporting/BEYU-LF-FIN-07_STATEMENT_OF_CHANGES_IN_EQUITY.md` |
| `FIN` | Notes to the Financial Statements | `financial-reporting/BEYU-LF-FIN-08_NOTES_TO_THE_FINANCIAL_STATEMENTS.md` |
| `FIN` | Reconciliation and Integrity Controls | `financial-reporting/BEYU-LF-FIN-09_RECONCILIATION_AND_INTEGRITY_CONTROLS.md` |
| Panel | Gate 0B Coverage Inventory | `GATE-0B_EXPANSION_COVERAGE_INVENTORY.md` |
| Panel | Request-to-Document Matrix | `REQUEST_TO_DOCUMENT_MATRIX.md` |
| Panel | Accountant Questions | `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md` |
| Panel | Gate 9 Verification Checks | `GATE-9_VERIFICATION_CHECKS.md` |
| Panel | **Gate 10 Deliverables (this file)** | `GATE-10_DELIVERABLES.md` |

### B.2 Modified in this expansion (13 documents)

| Document | Change |
|---|---|
| `trust/BEYU-LF-D02_TRUST_DEED.md` | **The four clauses inserted operatively** — §10.8–10.20 (discretionary distribution), §11A.1–11A.10 (spendthrift), §16.4–16.15 (removal/replacement), §20A.1–20A.9 (no-contest); §20.2 entrenchment extension marked `[PROPOSED — NOT APPLIED]`; new §23.6 severability; header integration note |
| `trust/BEYU-LF-D03_TRUSTEE_GOVERNANCE_RULES.md` | §5 precedence note deferring to `D02` §16 |
| `trust/BEYU-LF-D04_TRUSTEE_POWERS_DUTIES_RESERVED_MATTERS.md` | RM-04 reconciled-with-reference to `D02` §16.5 and flagged as **P-17** |
| `trust/BEYU-LF-D05_BENEFICIARY_AND_DISTRIBUTION_FRAMEWORK.md` | §3 deed anchor to `D02` §10.8 |
| `trust/BEYU-LF-D06_…`, `D07_…` | **Defect fix:** `Q-LEG03` → `Q-LEG-03` (3 occurrences) |
| `trust/BEYU-LF-D09_TRUST_AMENDMENT_DISPUTE_TERMINATION.md` | §3 and §6 cross-references to `D02` §11A and §20A |
| `holding/BEYU-LF-D23_SHAREHOLDERS_AGREEMENT.md` | **New §5A** (founder equity/vesting/leaver interface, 11 rules) and extended counsel note |
| `MASTER_DOCUMENT_REGISTER.md` | v1.1: **sections J, K, L** added; expansion coverage rows; blocked-items note extended |
| `README.md` | v1.1: §11.3 status taxonomy, §11.4 per-document record fields, §11.5 what the expansion did and did not do; lessons 13–15 |
| `DECISION_AND_ASSUMPTIONS_REGISTER.md` | v1.1: **§9 expansion entries (28 new `DAA-*`)** and **§10 the decisions the expansion cannot make**; sections renumbered 11–14 |
| `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` | v1.1: **conflicts P-17…P-30** and four new priority rows |
| `LEGAL_SOURCES_REGISTER.md` | v1.1: **expansion note — no new verified source, and four expressly unresearched areas** |
| `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` | v1.1: **§9A with `Q-TC-01`…`Q-TC-38`** and priority guidance |
| `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` | v1.1: **§6 expansion gates** (delivered / blocked-on / where recorded) |
| `CHANGE_LOG.md` | §6 expansion entry |

---

## C. Request-to-document matrix

**Delivered as `REQUEST_TO_DOCUMENT_MATRIX.md`** — every requested item mapped to the document that answers it,
its status, and **what is still missing**. **That third column is the deliverable.** Summary:

| Gate | Items | Complete as drafting | **Substantively blocked** |
|---|---|---|---|
| 1 — Trust clauses | 7 | 7 | **7 (counsel + the structure decision)** |
| 2 — Founders/corporate | 11 | 11 | **11 (structure, founders' decisions, counsel)** |
| 3 — NDA/covenants/IP | 5 | 5 | **5 (counsel; the trademark term for any renewal date)** |
| 4 — Employment | 7 | 7 | **7 (employment law is unresearched — `EMP-01` Part F is empty)** |
| 5 — ToS/privacy/compliance | 6 | 6 | **6 (`PRIV-02` unknown; obligations register empty)** |
| 6 — Fundraising | 4 | 4 | **4 (no traction, no records, no transaction)** |
| 7 — Statements and notes | 10 | 10 | **10 (no ledger, no opening position, no ratified policy)** |
| 8/9/10 — Registers/checks/deliverables | 8 | 8 | — |
| **Total** | **58** | **58** | **50** |

**Read that table carefully:** *"complete as drafting" and "blocked" are both true at the same time.* The
documents exist; the things they describe do not.

---

## D. Register and status summary

**`MASTER_DOCUMENT_REGISTER.md` v1.1** — 103 registered documents; **sections A–I unchanged**, **sections J, K,
L added**, §15 for the pack-level expansion documents, §16 for the coverage check. **All 103 paths resolve**
(Check 1).

| Status | Documents in the pack | Meaning |
|---|---|---|
| `COMPLETE_DRAFT` | The original `D`-series policies, charters, procedures, registers | Drafted for review |
| `CONDITIONAL_DRAFT` | `TC-01`, `EMP-01`, `EMP-03`, `RC-01`, `TOS-01`, `PRIV-01` | Drafted, expressly conditional |
| `TEMPLATE` / `TEMPLATE_NOT_EXECUTED` | `FA-01`, `CX-01`, `CAP-01`, `ESOP-01`, `NDA-01`, `IP-TM-01`, `IP-EV-01`, `EMP-02`, `FIN-01`, `FIN-02`, `FIN-03`, `FIN-04`–`FIN-08`, and the original deeds/agreements/resolutions | Blank instruments |
| `PRELIMINARY_FRAMEWORK` | `INC-01`, `EMP-04`, `PRIV-02`, `CMP-01`, `FIN-09`, `GATE-0B`, and the original framework documents | Structure only |
| `BLOCKED` | **`D21`** (no constitutional documents exist); **`INC-01` in part**; **`PRIV-01` publication** | Cannot proceed without an input that does not exist |
| `INFORMATIONAL` | Registers, logs, matrices, question lists, `GATE-0`, this file | Analysis and index |

**No document in this pack carries `APPROVED`, `EXECUTED`, `FILED` or `REGISTERED`** (Check 5, refined form:
zero hits).

---

## E. Legal source verification report

**Recorded in `LEGAL_SOURCES_REGISTER.md` v1.1.** In summary:

| Item | Finding |
|---|---|
| **New verified sources added by this expansion** | **NONE.** Every legal proposition in the new documents is either an already-recorded source or an express `[COUNSEL TO CONFIRM]` question |
| **Invented citations** | **None.** No statute, section, regulation, case, fee, deadline, rate, exemption or URL was created to fill a gap |
| **Unresearched areas relied on by new documents** | **Employment law** (`EMP-01`–`EMP-04`); **restraint of trade** (`RC-01`); **consumer protection** (`TOS-01`); **sector regulation** (`CMP-01` §5, `TOS-01` §18, `FIN-01` §4) — **all four are labelled on the face of the documents that depend on them** |
| **Carried-forward unresolved items** | The **trademark term** (7 vs 10 years — contradictory; **no renewal date may be derived**); the **incorporation fee conflict**; **Madrid is not a route** and **ARIPO/Banjul was found not domesticated**; the **PDPA implementation timeline** (secondary sources only) |
| **Network limitation** | The working environment had **no general internet access**; official registries (`rita.go.tz`, `brela.go.tz`, `tra.go.tz`, `pdpc.go.tz` and others) were **unreachable**. Recorded in `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §9. **Nothing may be represented as having been checked at any registry** |

---

## F. Consistency findings

**Recorded in `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` v1.1** — **30 items** in total: **P-01…P-16** (original) and
**P-17…P-30** (this expansion; Check 13 verifies 14 rows present).

**The expansion's most significant findings:**

| ID | Finding | Severity | How it is handled |
|---|---|---|---|
| **P-17** | `D02` §16.5 vs `D04` RM-04 — **two provisions govern Trustee removal** | **S1** | Flagged in both documents; `D03` §5 precedence note; routed to **`Q-TC-07`**; **the pack does not choose** |
| **P-19** | **Four instruments touch one event** (Articles, `D23`, `FA-01`, `CX-01`) | **S1** | Flagged at `D23` §5A.11; routed to `Q-TC-14` |
| **P-30** | **Retention promises the system cannot perform** | **S1** | The system's actual semantics written into `PRIV-02` §6.2–6.3, `PRIV-01` §8, `CMP-01` §12.3 |
| **P-20** | Software records mistaken for legal effect | **S2** | Every control-plane reference states records ≠ title; `legal_effect_status` INERT; `enforceability_assumed` false; `secretRef` ≠ secret |
| **P-25** | The trademark term could be "resolved" by picking a figure | **S2** | Asserted no term in three documents |
| **P-21, P-22, P-23, P-26, P-27** | Five document-pair overlaps (`D15`↔`EMP-03`, `D70`↔`PRIV-*`, `docs/finance`↔`FIN-*`, `D02`↔`TC-01`, `EMP-01`↔`EMP-03`) | **S2–S3** | Each addressed by an incorporation-by-reference rule, a precedence rule, or an explicit negative finding |

---

## G. Financial validation report

**Recorded across `FIN-02` and `FIN-04`–`FIN-09`. The honest summary:**

| # | Item | Finding |
|---|---|---|
| 1 | **Ratified accounting authority** | **NONE.** `ACCOUNTING AUTHORITY = NOT RATIFIED`; the `C-1` policy-provenance question is **the critical path** |
| 2 | **Ledger** | **NONE.** No book of record exists |
| 3 | **Opening balances** | **NONE.** Every balance sheet depends on a position that has not been established |
| 4 | **Framework, currency, entity, period** | **UNDETERMINED** (`FIN-04`–`FIN-07` §0) |
| 5 | **Statements** | `FIN-04`–`FIN-08` are **blank templates**; no figure may be entered without the accountant's confirmation and the 15-item data-request checklist |
| 6 | **Model** | `FIN-02` is **empty**. Every input is a decision or a question. **Tax lines stay blank with a flag — a zero would assert that no tax is payable** |
| 7 | **Reconciliation controls** | `FIN-09` defines **22 controls and four bridges**; **`NOT_RUN` is the accurate result for all 22** |
| 8 | **Validation performed** | **File-level only** (`GATE-9_VERIFICATION_CHECKS.md`): the statements contain **no figures that could be wrong**, the cap table contains **no invented holding**, and **no audited/filed/approved claim appears**. **This is documentation hygiene, not financial validation.** |
| 9 | **What "validated" cannot mean here** | **No assertion is made that any accounting treatment, tax position, valuation or financial statement is correct, compliant or ready for use.** A qualified accountant must review every financial document before external or operational reliance |

---

## H. Findings by severity (C / H / M / L)

### C — Critical (must be resolved before any external reliance)

| # | Finding | Where | Resolution route |
|---|---|---|---|
| C-1 | **No entity exists** to contract, employ, own, file or be sued — and `D21` is `BLOCKED` | `INC-01`; `DAA-INC-001` | Decide the jurisdiction and structure; instruct counsel |
| C-2 | **P-17: two provisions govern Trustee removal** | `D02` §16.5 vs `D04` RM-04 | `Q-TC-07` — counsel decides which governs |
| C-3 | **`EMP-01` Part F is empty — employment law is unresearched. No contract or offer may be issued** | `EMP-01` §1.1, §8 | `Q-TC-21`–`Q-TC-25`; then populate Part F |
| C-4 | **No accounting authority, no ledger, no opening position** — all financial reporting is blocked | `FIN-04` §0; `FIN-09`; `DAA-FIN-001` | `AQ-02`, `AQ-01`, `AQ-09` |
| C-5 | **`PRIV-01` may not be published until `PRIV-02` is complete** — and the data inventory is substantially unknown | `PRIV-01` §1; `PRIV-02` | Complete the inventory; `Q-TC-31`–`Q-TC-35` |
| C-6 | **Zero verified IP; zero verified shares** — any claim of ownership, registration or capitalisation would be false | `IP-EV-01`; `CAP-01`; `DAA-IP-001`, `DAA-CAP-001` | Obtain the evidence, or state the position as unestablished |
| C-7 | **The Trust's jurisdiction and legal form are unresolved, so the deed is nowhere near execution-ready** | `DAA-ARCH-006`; `D02` header | Priority-1 counsel questions |

### H — High (must be resolved before the relevant action)

| # | Finding | Where | Route |
|---|---|---|---|
| H-1 | **Sector regimes unresearched** (health, finance, agriculture, construction) — determines whether the product may be offered and what may be claimed | `CMP-01` §5; `TOS-01` §18 | `Q-TC-30` |
| H-2 | **Restraint-of-trade enforceability unknown**; the group's protection is designed to work without a non-compete | `RC-01`; `DAA-RC-001` | `Q-TC-17`–`Q-TC-20` |
| H-3 | **The obligations register is empty** — no obligation verified against a current source | `CMP-01` §1 | Counsel + accountant, per obligation family |
| H-4 | **The trademark term is unresolved** — no renewal date may be derived | `IP-TM-01` §1.2; `DAA-IP-002` | Verify from the statute and rules |
| H-5 | **Four instruments touch one event** (Articles, `D23`, `FA-01`, `CX-01`) — no order of precedence | `D23` §5A.11; **P-19** | `Q-TC-14` |
| H-6 | **No processor agreements, no transfer position, no working rights routes** | `PRIV-02` §4, §5, §7 | `Q-TC-31`–`Q-TC-33` |
| H-7 | **The employer is unidentified for every worker**; the "holding employs everyone" assumption is unverified | `EMP-01` §2; `DAA-INC-002` | The employer determination, per worker |
| H-8 | **`D23`'s new §5A depends on `FA-01`/`CX-01` decisions that have not been made** | `D23` §5A | The founders' decisions |

### M — Medium

| # | Finding | Where |
|---|---|---|
| M-1 | The dual-class proposal remains unapproved and is not in any constitutional document | `D22`; `DAA-CAP-002` |
| M-2 | The bilingual texts are unreconciled and the governing language is undecided | `EMP-04` §5 |
| M-3 | The `D02` §20.2 entrenchment extension is proposed, not applied | `D02` §20.2; `DAA-TC-003` |
| M-4 | The trademark classes, territory route and use requirement are unverified | `IP-TM-01` §1 |
| M-5 | The Foundation's employer/private-benefit boundary is unresolved | `EMP-03` §3.4; `Q-TC-27` |
| M-6 | No insurance position (D&O, professional indemnity, cyber) is in place | `CMP-01` §10.4 |
| M-7 | The privacy retention schedule is not aligned to the obligation sources | `CMP-01` §12 |

### L — Low (documentation and hygiene)

| # | Finding | Where |
|---|---|---|
| L-1 | `Q-LEG03` typo corrected in `D06`/`D07` | `CHANGE_LOG.md` §6 |
| L-2 | `Q-G-04` remains as a documented false positive | P-13 |
| L-3 | The `FIN` series spans two sub-series (fundraising and reporting) | P-24 |
| L-4 | `registers/README.md` is a section index, not a registered document | P-16 |
| L-5 | The naive Check 5 and Check 14 greps produce known false positives | `GATE-9_VERIFICATION_CHECKS.md` |

---

## I. Open items

| # | Open item | Owner | Blocking what |
|---|---|---|---|
| 1 | **Instruct Tanzanian counsel** with the priority-1 questions (`Q-TC-01`…`Q-TC-04`, `Q-TC-07`; `Q-TC-21`–`Q-TC-25`; `Q-TC-29`, `Q-TC-30`, `Q-TC-35`) | Family | Gates 1, 2, 4, 5 and the structure |
| 2 | **Settle the jurisdiction and structure** (`DAA-ARCH-005/006`) | Family + counsel | `INC-01`, `D21`, `CAP-01`, the entire financial series |
| 3 | **Answer the five priority accountant questions** (`AQ-02`, `AQ-01`/`AQ-04`, `AQ-09`, `AQ-22`/`AQ-23`, `AQ-25`/`AQ-32`) | CFO + accountant | `FIN-02`, `FIN-04`–`FIN-09` |
| 4 | **Complete `PRIV-02`** (the data inventory and flow map) | DPO + CTO | `PRIV-01` publication; `TOS-01` |
| 5 | **Determine the employer** for every worker and populate `EMP-01` Part F | HR + counsel | Any hiring |
| 6 | **Test every restrictive covenant with counsel** before relying on one | Counsel | `RC-01`, `D23` §8, `FA-01` §5.4 |
| 7 | **Verify the trademark term, the route and the fee schedule** from the official source | Counsel/agent | `IP-TM-01` renewal tracking |
| 8 | **Establish the book of record** (a ledger) and the opening position | CFO + accountant | Every statement |
| 9 | **Decide the founders, the allocations, the vesting and the leaver definitions** | Family | `FA-01`, `CX-01`, `CAP-01`, `ESOP-01` |
| 10 | **Resolve whether the group is fundraising at all**, and the product/entity question | Board | `FIN-01`–`FIN-03` |
| 11 | **Populate the obligations register** from verified sources, per family | Secretary + DPO + counsel + accountant | `CMP-01` |
| 12 | **Reconcile the bilingual texts and decide the governing language** | HR + counsel | `EMP-02`–`EMP-04`, `TOS-01`, `PRIV-01` |

---

## J. Verification log

**`GATE-9_VERIFICATION_CHECKS.md`** records the **14 checks with their exact commands, their literal results at
revision 1.1, and — for each — what it does NOT prove.** Results in summary: **Check 1 `103/103`; Check 2
`120/120`; Check 3 `75/75` + `DC-01`; Check 4 `0` unregistered; Check 5 `0` (refined, with the naive form's
known false positive documented); Check 6 `0`; Check 7 `[]` numeric; Check 8 one formatting example; Check 9
`70` cited / `1` documented false positive; Check 10 `48` defined / `8` cited; Check 11 `0` unresolved; Check 12
`3/3` present; Check 13 `14` + `9` recorded; Check 14 two known false positives.**

**No check was represented as proving anything about the law, the facts or the world.** **No registry, bank,
land registry, IP registry, regulator, auditor, court or production environment was accessed, contacted or
checked.** **No automated check in this pack proves enforceability, statutory compliance, tax correctness, audit
readiness or accounting compliance — and none is claimed to.**

**Test environment note:** the checks are file-level shell/Python operations on this repository. **Any command
not listed in `GATE-9_VERIFICATION_CHECKS.md` was not run, and is not claimed to have been.**

---

## K. Merge recommendation and blockers

### K.1 Recommendation

**Merge pull request #108 as a documentation package for human review.** It adds drafts, templates, questions
and registers; it changes no executable code, no schema, no migration, no configuration and no production
setting; and **it takes none of the actions the documents describe.**

**And, with the same emphasis: merging is a decision about documents, not about the structure.** A merged pack
does not create a trust, a company, a share, an employment relationship, a licence, a registration, a contract,
a customer or a right. **The pack says so on every relevant page, and this file says so here.**

### K.2 Merge blockers — conditions of merge, not of use

| # | Blocker | Status |
|---|---|---|
| **M1** | **The branch is the session branch and no other branch or `main` was touched** — no force push, no direct push to `main`, no merge performed by the agent | **Apply before merge** (verify in the PR view) |
| **M2** | **No file outside `docs/governance/legal-foundations/` was modified**; the change is documentation-only | **Apply before merge** |
| **M3** | **No executable artefact was added** (no code, no migration, no script that runs, no seed change) | **Apply before merge** |
| **M4** | **No document claims approval, execution, filing or registration** (Check 5 refined form: zero hits; Check 14: two known false positives) | **Apply before merge** |
| **M5** | **The 88 pre-existing documents remain intact in ID and content except for the eleven recorded modifications** (checks 3, 4, 11, and `CHANGE_LOG.md` §6) | **Apply before merge** |

### K.3 What merging does NOT authorise

| # | Not authorised by a merge |
|---|---|
| 1 | **Incorporating, registering or filing anything** |
| 2 | **Issuing a share, an option or any security**; or **completing the cap table** |
| 3 | **Hiring, making an offer, or issuing any employment document** |
| 4 | **Publishing terms of service or a privacy notice** |
| 5 | **Filing an IP application, paying a fee, or counting a renewal date** |
| 6 | **Showing any investor material to any person** |
| 7 | **Preparing, approving or filing a financial statement**; or **posting to any ledger** |
| 8 | **Executing any instrument; transferring any asset; making any payment; or representing that any entity exists** |

### K.4 The single next action

**Instruct counsel with `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` §9A (priority 1), and settle the jurisdiction
and structure.** Everything else in this pack is waiting on those two things — and the matrix says so, document
by document.

---

**This pack is preparation for qualified professionals. It is not legal, tax or accounting advice, and it must
not be represented as approved, executed, filed, registered, enforceable, compliant or complete. Nothing in it
establishes the existence of any entity, right, office, share, asset, licence or registration — and where such a
thing does not exist, the documents say so on their face.**
