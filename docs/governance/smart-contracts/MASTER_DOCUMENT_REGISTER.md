# BEYU-SCG-14 — Master Document Register

Document ID: `BEYU-SCG-14`
Title: Master Document Register (Smart Contract Governance & Automation pack)
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Related documents: every document in this pack; legal pack `MASTER_DOCUMENT_REGISTER.md`
Depends on: nothing (it indexes what exists)

> **The register is the index; the document is the record.** A document that is not listed here does
> not belong to this pack. A listed document whose file is missing is a defect to be raised, not a
> document to be assumed.

---

## 1. Registered documents

| # | Path (all under `docs/governance/smart-contracts/`) | Document ID | Status | Classification | Depends on |
|---|---|---|---|---|---|
| 0 | `PHASE-0_SHARED_SMART_CONTRACT_GOVERNANCE_AUDIT.md` | `BEYU-SCG-PHASE0` | `INFORMATIONAL` | `INTERNAL` | nothing — it is the audit |
| 1 | `README.md` | (pack level) | `DRAFT FOR PROFESSIONAL REVIEW` | `INTERNAL` | the audit |
| 2 | `SMART_CONTRACT_AUTHORITY_FRAMEWORK.md` | `BEYU-SCG-01` | `PRELIMINARY_FRAMEWORK` | `INTERNAL` | audit; appointments; `BEYU-LF-D27`/`D04` adoption; counsel |
| 3 | `CONTRACT_AND_SMART_CONTRACT_LIFECYCLE_GOVERNANCE.md` | `BEYU-SCG-02` | `PRELIMINARY_FRAMEWORK` | `INTERNAL` | `BEYU-SCG-01` §5; gate owners |
| 4 | `SIGNING_KEY_CUSTODY_AND_ATTESTATION_GOVERNANCE.md` | `BEYU-SCG-03` | `CONDITIONAL_DRAFT` | `CONFIDENTIAL` | custody decision; custodian appointment; counsel |
| 5 | `AUTOMATION_GOVERNANCE.md` | `BEYU-SCG-04` | `PRELIMINARY_FRAMEWORK` | `INTERNAL` | inventory; SC-RM-07 decisions; counsel |
| 6 | `AUTOMATION_INVENTORY.json` | `BEYU-SCG-04A` | `INFORMATIONAL` | `INTERNAL` | the audited commit; updated with every automation change |
| 7 | `ORACLE_AND_EXTERNAL_DATA_GOVERNANCE.md` | `BEYU-SCG-05` | `PRELIMINARY_FRAMEWORK` | `INTERNAL` | source register (empty); counsel |
| 8 | `ONCHAIN_EVIDENCE_AND_RECONCILIATION_GOVERNANCE.md` | `BEYU-SCG-06` | `PRELIMINARY_FRAMEWORK` | `INTERNAL` | register specifications; counsel |
| 9 | `INCIDENT_PAUSE_UPGRADE_AND_ROLLBACK_RUNBOOK.md` | `BEYU-SCG-07` | `CONDITIONAL_DRAFT` | `CONFIDENTIAL` | incident commander appointment; custodian; counsel |
| 10 | `REGISTERS_AND_TEMPLATES.md` | `BEYU-SCG-08` | `TEMPLATE_NOT_EXECUTED` | `INTERNAL` | appointments; custody decision; every register is empty |
| 11 | `TESTING_AND_VERIFICATION_STANDARD.md` | `BEYU-SCG-09` | `PRELIMINARY_FRAMEWORK` | `INTERNAL` | nothing for §2; §4 checks are proposals |
| 12 | `COUNSEL_QUESTIONS.md` | `BEYU-SCG-10` | `INFORMATIONAL` | `CONFIDENTIAL` | instruction of counsel |
| 13 | `REQUEST_TO_DOCUMENT_MATRIX.md` | `BEYU-SCG-11` | `INFORMATIONAL` | `INTERNAL` | nothing |
| 14 | `VERIFICATION_LOG.md` | `BEYU-SCG-12` | `INFORMATIONAL` | `INTERNAL` | the pack's own checks |
| 15 | `DELIVERABLES_AND_CHANGE_LOG.md` | `BEYU-SCG-13` | `INFORMATIONAL` | `INTERNAL` | the pack |
| 16 | `MASTER_DOCUMENT_REGISTER.md` | `BEYU-SCG-14` | `INFORMATIONAL` | `INTERNAL` | nothing |

**17 registered paths: 16 Markdown documents + 1 JSON inventory.** Every path is verified to resolve
by `BEYU-SCG-12` V-02.

## 2. Legal-pack documents this pack depends on (cross-references, never renumbered)

| Legal-pack path (under `docs/governance/legal-foundations/`) | ID | Used by this pack for |
|---|---|---|
| `DEFINED_TERMS.md` | (pack level) §2 | The legal-effect ladder (`BEYU-SCG-01` §2) |
| `MASTER_DOCUMENT_REGISTER.md` | (pack level) | The convention that a register indexes and does not replace evidence |
| `LEGAL_SOURCES_REGISTER.md` | (pack level) §3.3 | Source verification vocabulary (`BEYU-SCG-05` O-11) |
| `holding/BEYU-LF-D27_RESERVED_MATTERS_AND_DELEGATION_MATRIX.md` | `BEYU-LF-D27` | Reserved matters the on-chain schedule must be added to |
| `holding/BEYU-LF-D28_RESOLUTION_TEMPLATES.md` | `BEYU-LF-D28` | Decisions that authorise on-chain acts |
| `holding/BEYU-LF-D23_SHAREHOLDERS_AGREEMENT.md` | `BEYU-LF-D23` | Capital-side instruments behind any on-chain interest |
| `holding/BEYU-LF-D24_SHARE_PROCEDURES.md` | `BEYU-LF-D24` | Share procedures — never replaced by a token record |
| `family/BEYU-LF-D17_DISPUTE_RESOLUTION_POLICY.md` | `BEYU-LF-D17` | Disputes that pause execution |
| `trust/BEYU-LF-D03_TRUSTEE_GOVERNANCE_RULES.md`, `D04` | `BEYU-LF-D03`, `D04` | Trust-side reserved matters |
| `family-office/BEYU-LF-D34_INVESTMENT_MANDATE.md` | `BEYU-LF-D34` | Investment limits; blank = zero |
| `family-office/BEYU-LF-D35_CUSTODY_PAYMENT_CONTROLS.md` | `BEYU-LF-D35` | Custody and payment controls |
| `ip/BEYU-LF-D39_IP_OWNERSHIP_POLICY.md`, `D40`, `D41`, `D45` | `BEYU-LF-D39`, `D40`, `D41`, `D45` | Code IP, chain of title, assignment, open source |
| `ip/BEYU-LF-IP-EV-01_IP_EVIDENCE_ARCHIVE_AND_ATTESTATIONS.md` | `BEYU-LF-IP-EV-01` | Evidence archive conventions |
| `product-compliance/BEYU-LF-PRIV-01…`, `PRIV-02`, `D70` | `BEYU-LF-PRIV-01`, `PRIV-02`, `D70` | Privacy policy, data inventory, data-protection checklist |
| `corporate/BEYU-LF-CAP-01_CAP_TABLE_AND_SHARE_REGISTER.md` | `BEYU-LF-CAP-01` | The only cap table; on-chain positions never replace it |
| `registers/BEYU-LF-D61…`, `D62`, `D72`, `D73`, `D74` | `BEYU-LF-D61`, `D62`, `D72`, `D73`, `D74` | Risk register, crisis authority, related parties, decisions, execution/custody |
| `finance`/`FIN-09` reconciliation controls | `BEYU-LF-FIN-09` | Reconciliation control conventions |

## 3. Rules for this register

| Rule | Statement |
|---|---|
| MR-1 | A document is added to this register **in the same change** that creates it. |
| MR-2 | A status change is recorded here and explained in `BEYU-SCG-13` §change log. |
| MR-3 | **No document may be removed** while any other document references it; supersession is recorded, deletion is not. |
| MR-4 | The four completion labels (`APPROVED`, `EXECUTED`, `FILED`, `REGISTERED`) may appear here only with an evidence reference in `BEYU-LF-D74`. **None appears today.** |
| MR-5 | Where this pack and the legal pack both cover a subject, the legal pack owns the instrument and this pack owns the capability; neither silently overrides the other. |

## 4. What this register does not establish

It establishes no document, approves nothing, and grants nothing. It indexes documents whose own
front matter states whether anything about them is settled — and today, for every document in this
pack, the answer is no.
