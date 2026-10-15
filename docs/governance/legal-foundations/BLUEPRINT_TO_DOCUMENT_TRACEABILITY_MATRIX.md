# BEYU-LF — Blueprint-to-Document Traceability Matrix

Document ID: `BEYU-LF-REG-TRACE`
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Owner: Chief Governance Officer (proposed)
Purpose: show, for **each established BEYU principle**, which documents implement it, at which
sections, whether that implementation is verifiable, and what remains unresolved.
Classification: `INTERNAL`

---

## How to read this matrix

- **Principle** — restated from the engagement brief §2 and from repository evidence
  (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §4).
- **Implementing document(s)** — pack document IDs.
- **Where** — the section that carries the obligation. Section names are stable; if a document is
  later renumbered the **heading text** is the identifier, not the number.
- **Verification** — `BY INSPECTION` (the clause exists and can be read), `BY EVIDENCE` (turns on
  evidence outside this repository, so cannot be verified here), `BY PROFESSIONAL REVIEW` (turns on
  counsel/tax/regulator), `UNRESOLVED` (not yet implementable).
- **Unresolved issues** — linked to the Decision and Assumptions Register (`DAA-…`) and the counsel
  questions (`Q-…`).

---

## 1. Constitutional control plane and Sector OS boundaries

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P1 | BEYU OS is the Constitutional Control Plane, Enterprise Operating Kernel and Governed Intelligence Layer. | `README.md` §6.1; `DEFINED_TERMS.md` §3 | "Sector and OS boundaries" | BY INSPECTION | None — architectural, not legal. `DAA-ARCH-003`. |
| P2 | The canonical Sector OSs are **exactly** `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`. | `README.md` §6.1; `D30` §Sector scope; `D47` §sub-brand control | "No fifth Sector OS" | BY INSPECTION | None. `DAA-ARCH-004`. |
| P3 | Neither `FOUNDATION` nor `FAMILY_OFFICE`, `HCM` nor `NOELIA` is a Sector OS. | `README.md` §6.2–6.4; `D31` §Status; `D48` §Status | "Not a Sector OS" statement in each | BY INSPECTION | None. |
| P4 | BEYU Foundation is a **separately governed nonprofit sister organisation** and **not automatically** a Holding Body subsidiary. | `D48`–`D55`, especially `D48` §Status, `D50` §Independence, `D51` (whole) | "Independence" clauses | BY PROFESSIONAL REVIEW | Form unresolved `DAA-FDN-001`; independence characterisation `DAA-FDN-004`; `Q-G-01`, `Q-G-03`. |
| P5 | BEYU Family Office is a **shared capability**, not automatically a company, asset owner, or Sector OS. | `D31` §Status, `D32` §Scope, `D35` (whole), `D38` §Sources of truth | "The Family Office owns nothing in its own name" | BY INSPECTION | Entity question left open `DAA-FO-001`. |
| P6 | NOELIA_AI is a governed intelligence system, **never** a trustee, director, shareholder, legal authority, or substitute for an authorised human decision. | `D04` §Prohibited delegations; `D22` §Disqualification; `D27` §AI boundary; `D59` §AI boundary; `D31` §AI boundary; `D51` §AI boundary; `D61` §AI boundary; `D62` §AI boundary | "AI is never an authority" | BY INSPECTION + grep in `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` §7 | None; consistent with `FIR-017`. |
| P7 | The digital governance boundary must **align with** real legal entities, their authority and permissions — and creates none of them. | `DEFINED_TERMS.md` §2 (legal-effect ladder); every register's standing warning; `D27` §Relationship to the control plane | "Software creates no legal right" | BY INSPECTION | None — this is the pack's foundational convention. |

## 2. Identity, access and control-plane invariants

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P8 | GlobalUserID is canonical; one person master; email is a lookup key, not the authorization identity. | `D66` §Identity key; `D63` §Party linkage; `D38` §Data dictionary | "Reference GlobalUserID" | BY INSPECTION | None. |
| P9 | Entity / country / tenant classification governs scope. | `D63` (jurisdiction + entity type fields); `D30` (country-tier authority); `D69` (per-jurisdiction obligations) | Field definitions | BY INSPECTION | First-jurisdiction conflict `DAA-ARCH-006`. |
| P10 | Least privilege, MFA step-up, delegation with consent, auditability, row-level security, fail-closed financial posting. | `D27` §Control-plane interface; `D35` §Controls; `D73` §Records | "Preserve, do not weaken" | BY INSPECTION | None — the pack deliberately changes nothing in the control plane. |
| P11 | Financial history is never overwritten; corrections are reversals. | `D08` §Corrections; `D35` §Reconciliation; `D67` §Corrections | "Reversal, not overwrite" | BY INSPECTION | None. |
| P12 | AI never bypasses authorisation and never takes material decisions. | `D27`, `D31`, `D62`, `D61`, `D59`, `D51` | "Advisory only" | BY INSPECTION | None. |

## 3. Ownership, authority and liability separation

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P13 | Trust → Holding Body → Country Holding → Sector Operating Company chain is the intended architecture **subject to legal, tax, jurisdictional and operational validation**. | `D01`, `D20`, `D30`, `DC-01` | "Architecture summary" in each | BY PROFESSIONAL REVIEW | "Sector LLC" conflict `DAA-ARCH-005`; first jurisdiction `DAA-ARCH-006`; `Q-H-02`. |
| P14 | Trust, Holding Body, subsidiaries, Family Office, Foundation and individual family members have **separately defined** ownership, authority, liability and asset boundaries. | `D27` (authority); `D30` (entity boundaries); `D31`/`D35` (Family Office boundaries); `D51` (Foundation boundary); `D07` (trust asset boundary); `D67` (assets by owner) | "Boundary statement" in each | BY INSPECTION | `[FIR-001]`, `[FIR-012]`, `[FIR-018]` remain unratified but the *boundary* is resolved as a constraint. |
| P15 | The Family Office does **not** automatically own trust, holding, subsidiary or Foundation assets. | `D31` §Assets, `D35` (whole), `D38` §Boundaries, `D67` §Custody field | "No beneficial ownership by the Family Office" | BY INSPECTION | `DAA-FO-002`. |
| P16 | The Foundation's charitable assets cannot be used for private benefit. | `D51` §Prohibited benefits; `D52` §Private-benefit safeguards; `D53` §Arm's length; `D54` §Consideration | "Purpose lock" | BY PROFESSIONAL REVIEW | Statutory basis `[COUNSEL TO CONFIRM]`; `Q-G-03`. |

## 4. Capital, control and the dual-class proposal

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P17 | The dual-class proposal (Class A 1 vote; Class B 1,000 votes; equal economic rights per share) is a **proposal awaiting approval**, preserved consistently. | `DC-01` (whole), `D22` §Rights table, `D23` §Clause 4, `D24` §Issuance, `D59` §Control events | "Proposal status" banner | BY INSPECTION | `DAA-DC-001`; validity `Q-H-01`. |
| P18 | Proposed Class B holders include the founder and the BEYU Family Trust, **subject to legal validation and documented approvals**. | `DC-01` §Proposed holders; `D22` §Schedule 1 | `[FOUNDER NAME]`, `[TRUSTEE NAME]` placeholders only | UNRESOLVED | `DAA-DC-005` — no holder may be named until confirmed. |
| P19 | Enhanced Class B voting rights may continue to approved successors **only where legally permissible and properly documented**. | `D22` §Succession of class rights; `D59` (decision tree); `D57` §Succession instruments | "Permitted succession" | BY PROFESSIONAL REVIEW | `Q-H-01(g)`; `Q-S-05`. |
| P20 | Distinguish **voting rights** from **economic entitlements**, **board appointment rights**, **vetoes**, **distribution rights**, and **control of reserved matters**. | `D22` §2 (separate right categories); `DC-01` §Right-category table; `D27` (authority vs ownership) | "Rights taxonomy" | BY INSPECTION | `Q-H-01`, `Q-H-03(b)`. |
| P21 | The structure must **not** purport to defeat mandatory law, creditors' rights, court orders, legitimate minority protections or statutory duties. | `DC-01` §Lawful-limits; `D22` §Clause 3 (no impairment of statutory rights); `D23` §Clause 19; `D29` §Clause 14; `D59` §Limits | "Overriding-law clause" | BY PROFESSIONAL REVIEW | `DAA-DC-004`; enumerate protections via `Q-H-01(e)`. |
| P22 | Not to assume a trust automatically owns shares, that the founder has issued shares, or that enhanced voting rights are valid. | `DC-01` §Assumptions expressly NOT made; `D22` §Status; `D64` §Standing warning | "Assumptions not made" list | BY INSPECTION | `DAA-DC-002`, `DAA-DC-003`. |

## 5. Family governance and the family constitution

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P23 | A family constitution's **moral/contractual** status must be distinguished from any **legally binding** provision. | `D11` §Enforceability map (full table); `DEFINED_TERMS.md` §4 | "Enforceability map" | BY PROFESSIONAL REVIEW | `DAA-FAM-006`; `Q-S-06`. |
| P24 | Clauses requiring separate contracts, company resolutions, trust provisions or other instruments must be **identified as such**. | `D11` §Enforceability map (column "Required instrument"); `D13` §Decisions; `D18` §Effect | "Required instrument" column | BY INSPECTION | `FIR-006`, `FIR-007` unratified. |
| P25 | Family governance participation ≠ ownership, beneficiary status, voting, or legal signatory authority. | `D18` §Non-derivation rule; `D12` §Limits; `D13` §Limits | "Participation confers nothing" | BY INSPECTION | `FIR-003`; `Q-F-01`. |
| P26 | Beneficiary records ≠ trustee determination / legal entitlement. | `D05` §Appointment vs entitlement; `D65` §Beneficiary data; `D19` §Records | "Registry is not entitlement" | BY INSPECTION | `FIR-009`, `FIR-010`; `Q-T-04`. |

## 6. Succession, incapacity and continuity

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P27 | No single instrument substitutes for another (constitution ≠ trust deed ≠ will ≠ power of attorney ≠ company document ≠ software workflow). | `D59` §Instrument matrix; `D56` §Interim vs legal; `D57` §Instruments required | "Instrument matrix" | BY PROFESSIONAL REVIEW | `DAA-SUC-002`; `Q-S-01`, `Q-S-03`. |
| P28 | Identify where separate wills, powers of attorney, insurance, employment agreements, shareholder arrangements or other instruments may be required, and refer to counsel. | `D57` §Required-instrument schedule; `D56` §Required instruments; `D67` §Insurance; `D15` §Employment | "Counsel referral" column | BY PROFESSIONAL REVIEW | `DAA-SUC-001`. |
| P29 | Crisis authority is time-boxed and cannot permanently displace governance. | `D62` §Sunset and non-ratification; `D56` §Time-box; `D60` §Continuity | "Sunset clause" | BY INSPECTION | Must be mirrored into instruments — `Q-R-02`. |

## 7. IP, brand and data

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P30 | Ownership must not be asserted without verified evidence; distinguish authorship, registered ownership, contractual ownership, licence rights, custody and operational use. | `D40` §Six-column model; `D39` §4 (no automatic transfer); `D44` §Verification status | "Six-column title model" | BY EVIDENCE | `DAA-IP-001`, `DAA-IP-002`; `Q-IP-01`. |
| P31 | Missing assignments and uncertain chain of title must be flagged. | `D40` §Open title gaps (pre-seeded with the known gaps); `D39` §Transitional measures | "Open gaps register" | BY INSPECTION | Fixture documents `DAA-IP-003`. |
| P32 | The Holding Body may be **proposed** as owner of designated group-wide core IP **where valid title is established**; subsidiaries and the Foundation may need separate rights or licences; **no automatic transfer is implied**. | `D39` §5 (proposed ownership policy), §6 (no automatic transfer); `D42` (licence template); `D54` (Foundation licence) | "Proposed, subject to title" | BY PROFESSIONAL REVIEW | `Q-IP-01`, `Q-IP-07`. |
| P33 | Brand principles preserved: "Bridging Care. Building Trust."; Trust, Care, Integrity, Innovation, Impact. | `D47` §Brand principles; `D39` §Brand; `D14` §Values | "Brand principles" | BY INSPECTION | None. |
| P34 | Data protection and retention obligations apply to family/beneficiary data. | `D19`, `D70`, `D55`, `D74` §Access classification, `D65` §Access class | "Classification + retention" fields | BY PROFESSIONAL REVIEW | `DAA-REG-002` (registration status); `Q-DP-01`…`Q-DP-06`. |

## 8. Registers, evidence and control

| # | Principle | Implementing document(s) | Where | Verification | Unresolved issues |
|---|---|---|---|---|---|
| P35 | Registers must have useful field definitions, owner, update triggers, evidence requirements, access classification, retention guidance and review frequency — **without fabricated entries**. | `D63`–`D75` (each has a "Field definitions" and "Controls" section) | Field-definition tables | BY INSPECTION | Population is `NOT_DONE` (`DAA-REG-001`). |
| P36 | An explicit list of decisions requiring user approval must appear in each document. | Every pack document §"Decisions required from the user/family/governing bodies" | Named section | BY INSPECTION | Each section names its own. |
| P37 | Each document must carry a counsel-review note identifying jurisdiction-specific and enforceability questions. | Every pack document §"Counsel review note" | Named section | BY INSPECTION | Every such note ends `[COUNSEL TO CONFIRM]`. |
| P38 | Decision classification A–F must be maintained. | `DECISION_AND_ASSUMPTIONS_REGISTER.md` (whole) | Class columns | BY INSPECTION | 78 classified items. |

---

## 9. Coverage of the engagement brief's own acceptance criteria

| Brief criterion | Where satisfied | Status |
|---|---|---|
| 1. Repository audit actually performed, limitations recorded | `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` | ✔ Complete |
| 2. Every required document present or explicitly blocked with reason + next action | `MASTER_DOCUMENT_REGISTER.md` §11 + each document | ✔ (one blocked: `D21`) |
| 3. Four canonical Sector OSs unchanged; Foundation not a Sector OS or subsidiary | `D30`, `D31`, `D48`, `README` §6 | ✔ |
| 4. Family Office treated as a shared capability unless an entity is deliberately approved | `D31`, `D32`, `D35`, `DAA-FO-001` | ✔ |
| 5. Trust / Holding / subsidiaries / Family Office / Foundation / members have separated ownership, authority, liability, assets | `D27`, `D30`, `D31`, `D35`, `D51`, `D67` | ✔ |
| 6. Dual-class proposal consistently represented and subject to counsel review | `DC-01`, `D22`, `D23`, `D24`, `D59` | ✔ |
| 7. No ownership/formation/issuance/registration/execution/transfer claimed without evidence | Structural rule in `DEFINED_TERMS.md` §9; enforced by inspection in the consistency report | ✔ |
| 8. Legal references have source details and verification status | `LEGAL_SOURCES_REGISTER.md` | ✔ |
| 9. Every unresolved decision and material legal uncertainty recorded | `DECISION_AND_ASSUMPTIONS_REGISTER.md`; `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` | ✔ |
| 10. Consistent terminology, cross-references, approval authorities, succession rules | `DEFINED_TERMS.md` + consistency report | ✔ (with 9 logged open conflicts) |
| 11. Registers have usable field definitions and controls without fabricated entries | `registers/*` | ✔ (all templates, none populated) |
| 12. Roadmap reflects legal dependencies and human approval gates | `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` | ✔ |
| 13. No production code, settings, migrations or live records changed | `CHANGE_LOG.md` | ✔ |
| 14. Changes available for human review in a pull request | `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` GATE 6; PR raised on the session branch | ✔ (see final report) |
