# BEYU-LF — Master Document Register

Document ID: `BEYU-LF-REG-MASTER`
Version: 1.1 (expansion)
Date: 2026-10-15
Status: `INFORMATIONAL`
Owner: Chief Governance Officer (proposed)
Revision 1.1 note: this register now includes the **expansion series** (`TC`, `FA`, `INC`, `CX`, `CAP`, `ESOP`,
`NDA`, `RC`, `IP-TM`, `IP-EV`, `EMP`, `TOS`, `PRIV`, `CMP`, `FIN`) in **new sections J, K and L**. **`D01`–`D75`
and `DC-01` are NOT renumbered.** See `GATE-0B_EXPANSION_COVERAGE_INVENTORY.md` for the convention and the
coverage decisions.
Approving authority (proposed): BEYU Family Trust trustees **and** BEYU Holding Company board — **neither body is evidenced in this repository as legally constituted** (see `DECISION_AND_ASSUMPTIONS_REGISTER.md` `DAA-ARCH-001`, `DAA-ARCH-002`)
Next review date: `[SET ON APPROVAL]` — suggested trigger: on any GATE 5 professional review outcome
Classification: `INTERNAL`

---

## 1. How to read this register

- **Status** uses the document-status vocabulary in `README.md` §3.1. *No document in this pack is
  executed, filed, registered, notarised or legally effective.*
- **Owner** is the proposed *accountable* human role for maintaining the document. It is a proposal.
  Where the role does not yet exist, it is marked `(role to be established)`.
- **Dependencies** are document IDs or gate references that must resolve before the document can move
  past its current status.
- **Approvers** are the bodies whose approval the document *proposes* is required. Because the legal
  existence of those bodies is unevidenced, every approver entry is a **proposal**.
- **Legal basis** distinguishes three things the pack must never blur:
  - `MANDATORY` — the clause exists because a statute/regulator requires it. **Every such instance
    carries `[COUNSEL TO CONFIRM]`** because no instrument in this pack has been verified against
    official text by a qualified professional.
  - `CONTRACTUAL` — the clause is a proposed private bargain between the parties.
  - `PRACTICE` — optional governance practice with no legal force on its own.

### Standing warnings

> **W1.** Seeded rows in `src/db/seed.ts` (entities, registration numbers, TINs, ownership
> percentages, provenance strings) are **demonstration data**, not legal facts. See
> `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6.
>
> **W2.** Fixture "documents" in `sectors/health/src/data/documents.ts` (signed IP assignment,
> registered trademark `TZ-2025-4421`, Madrid Protocol filing) are **fictional fixtures**. See
> `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §7.
>
> **W3.** A family constitution is **not** a statute, trust instrument or court order. Company
> resolutions are **not** trust instruments. Software records are **not** legal authority. See
> `DEFINED_TERMS.md` §Legal-effect ladder.
>
> **W4.** `trust_provisions.legal_effect_status` defaults to **`INERT`** and
> `enforceability_assumed` to **`false`** in migration `0041`. Documents in this pack must not be
> loaded into the control plane in a way that implies enforceability.

---

## 2. Section A — Trust formation and administration

| ID | Title | Purpose | Legal entity / governance body | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D01` | BEYU Family Trust — Structure Options and Legal Feasibility Memorandum | Compare legally plausible Tanzanian and alternative trust routes (incl. Trustees' Incorporation Act, Cap. 318) and record trade-offs | BEYU Family Trust (to be settled) | Family Office Principal | 1.0 | `INFORMATIONAL` | MANDATORY + PRACTICE | `LEGAL_SOURCES_REGISTER`; GATE 2 | Trustees + counsel | On counsel sign-off | `trust/BEYU-LF-D01_TRUST_STRUCTURE_OPTIONS_MEMORANDUM.md` |
| `BEYU-LF-D02` | BEYU Family Trust Deed | Counsel-review draft deed with schedules | BEYU Family Trust / Settlor / Trustees | Trustees (proposed) | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D01, D06, D09 | Settlor + Trustees + counsel | On execution | `trust/BEYU-LF-D02_TRUST_DEED.md` | 
| `BEYU-LF-D03` | Trustee Governance — Appointment, Removal, Resignation, Replacement and Incapacity Rules | Trustee lifecycle rules with reserved-matter and judicial-control boundaries | Trust / Protector / Trustees | Trustees | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D02, D04 | Trustees + Protector + counsel | Annual | `trust/BEYU-LF-D03_TRUSTEE_GOVERNANCE_RULES.md` |
| `BEYU-LF-D04` | Trustee Powers, Duties, Conflicts, Indemnities, Remuneration and Reserved Matters Schedule | Defines trustee powers/duties and the limits that cannot be self-waived | Trust | Trustees | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D02 | Trustees + counsel | Annual | `trust/BEYU-LF-D04_TRUSTEE_POWERS_DUTIES_RESERVED_MATTERS.md` |
| `BEYU-LF-D05` | Beneficiary and Distribution Framework | Beneficiary classes, eligibility, distributions, discretion limits, private-benefit controls | Trust / Trustees | Trustees | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D02, D04, D07 | Trustees + counsel | Annual | `trust/BEYU-LF-D05_BENEFICIARY_AND_DISTRIBUTION_FRAMEWORK.md` |
| `BEYU-LF-D06` | Initial Trust Property and Settlement Schedule | Settlement schedule/vesting mechanics for initial property | Trust | Settlor + Trustees | 1.0 | `PRELIMINARY_FRAMEWORK` | MANDATORY + CONTRACTUAL | D02; `[INITIAL TRUST PROPERTY]` | Settlor + Trustees + counsel + (registrar/land office as applicable) | On settlement | `trust/BEYU-LF-D06_INITIAL_TRUST_PROPERTY_SCHEDULE.md` |
| `BEYU-LF-D07` | Trust Investment, Risk, Liquidity, Borrowing and Asset Protection Governance | Prudent-investment style framework; borrowings, guarantees, encumbrance; asset-protection limits (lawful only) | Trust / Investment Committee | Trustees + CIO(proposed) | 1.0 | `PRELIMINARY_FRAMEWORK` | MANDATORY + CONTRACTUAL | D04, D05, D33, D34 | Trustees + counsel + tax adviser | Annual | `trust/BEYU-LF-D07_TRUST_INVESTMENT_RISK_GOVERNANCE.md` |
| `BEYU-LF-D08` | Trust Accounts, Records, Reporting, Review and Audit Policy | Books, records, accounts, audit, retention and reporting to beneficiaries/protector | Trust | Trustees + Group CFO(proposed) | 1.0 | `PRELIMINARY_FRAMEWORK` | MANDATORY + PRACTICE | D07, D68, D69 | Trustees + auditor + counsel | Annual | `trust/BEYU-LF-D08_TRUST_ACCOUNTS_RECORDS_AUDIT_POLICY.md` |
| `BEYU-LF-D09` | Trust Amendment, Dispute Resolution, Succession and Termination Provisions | Amendment mechanics, forum, perpetuity/termination, succession of trustees | Trust | Trustees | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D02, D03, D29, D57 | Trustees + Protector + counsel | Annual | `trust/BEYU-LF-D09_TRUST_AMENDMENT_DISPUTE_TERMINATION.md` |
| `BEYU-LF-D10` | Trustee Resolutions, Consents and Meeting-Minutes Templates | Blank instrument templates for trustee governance | Trust | Trustees + Company Secretary(proposed) | 1.0 | `TEMPLATE_NOT_EXECUTED` | PRACTICE (evidence of MANDATORY duties) | D02, D03, D04 | Trustees | Annual | `trust/BEYU-LF-D10_TRUSTEE_RESOLUTION_TEMPLATES.md` |

> **Path note.** `BEYU-LF-D02` (Trust Deed) deliberately uses the **short slug**
> `trust/BEYU-LF-D02_TRUST_DEED.md`. Section A file names above are exact; the register is
> authoritative if a path and a file name ever differ, and `CHANGE_LOG.md` lists the canonical set.

## 3. Section B — Family constitution and family governance

| ID | Title | Purpose | Body | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D11` | BEYU Family Constitution | Statement of family purpose, values, rights/obligations, governance and amendment rules | Family Assembly / Family Council | Family Council Chair (proposed) | 1.0 | `COMPLETE_DRAFT` | PRACTICE + CONTRACTUAL (see §8) | D12–D19 | Family Assembly (ratification threshold `[FAMILY ASSEMBLY TO SET]`) | Annual | `family/BEYU-LF-D11_FAMILY_CONSTITUTION.md` |
| `BEYU-LF-D12` | Family Council Charter | Membership, mandate, meetings, quorum, voting, records | Family Council | Family Council Chair | 1.0 | `COMPLETE_DRAFT` | PRACTICE + CONTRACTUAL | D11 | Family Assembly | Annual | `family/BEYU-LF-D12_FAMILY_COUNCIL_CHARTER.md` |
| `BEYU-LF-D13` | Family Assembly and Family Meeting Procedures | Convening, notice, agenda, quorum, minutes, decisions, records | Family Assembly | Family Council Secretary(proposed) | 1.0 | `COMPLETE_DRAFT` | PRACTICE | D11, D12 | Family Assembly | Annual | `family/BEYU-LF-D13_FAMILY_ASSEMBLY_PROCEDURES.md` |
| `BEYU-LF-D14` | Family Values, Conduct, Confidentiality and Conflict-of-Interest Code | Behavioural standard + conflict disclosure/recusal regime | Family + all fiduciaries | Family Council | 1.0 | `COMPLETE_DRAFT` | PRACTICE + MANDATORY (for fiduciaries) | D11, D25 | Family Assembly + boards | Annual | `family/BEYU-LF-D14_VALUES_CONDUCT_CONFLICTS_CODE.md` |
| `BEYU-LF-D15` | Family Employment, Recruitment, Performance, Remuneration and Exit Policy | Arm's-length employment of family members | Employing entities + Family Council | Group HR(proposed) | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + MANDATORY (employment law `[COUNSEL TO CONFIRM]`) | D14, D25, D27 | Boards + Family Council | Annual | `family/BEYU-LF-D15_FAMILY_EMPLOYMENT_POLICY.md` |
| `BEYU-LF-D16` | Next-Generation Education, Mentorship, Stewardship and Leadership Development Framework | Develop successors without conferring entitlement | Family Council | Family Council | 1.0 | `COMPLETE_DRAFT` | PRACTICE | D11, D57, D59 | Family Assembly + Trustees (for trust-funded support) | Annual | `family/BEYU-LF-D16_NEXT_GENERATION_FRAMEWORK.md` |
| `BEYU-LF-D17` | Family Dispute Prevention, Mediation, Escalation and Resolution Policy | Graded dispute ladder, forum selection, confidentiality | Family + entities | Family Council | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL (effect depends on incorporation into instruments/clauses) | D09, D29, D11 | Family Assembly + Trustees + boards + counsel | Annual | `family/BEYU-LF-D17_DISPUTE_RESOLUTION_POLICY.md` |
| `BEYU-LF-D18` | Family Participation, Eligibility, Representation and Removal Rules | Who participates in which forum, on what basis, and how that ends | Family Council | Family Council | 1.0 | `COMPLETE_DRAFT` | PRACTICE + CONTRACTUAL | D12, D13, `[FIR-003]`, `[FIR-006]` | Family Assembly | Annual | `family/BEYU-LF-D18_PARTICIPATION_ELIGIBILITY_RULES.md` |
| `BEYU-LF-D19` | Family Communication, Recordkeeping and Confidentiality Protocol | Channels, records, classification, retention and access | Family Office (capability) | Family Office Principal | 1.0 | `COMPLETE_DRAFT` | PRACTICE + MANDATORY (data protection) | D14, D70 | Family Council + DPO | Annual | `family/BEYU-LF-D19_COMMUNICATION_RECORDS_PROTOCOL.md` |

## 4. Section C — Holding company and ownership governance

| ID | Title | Purpose | Entity | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D20` | BEYU Holding Company — Corporate Structure and Jurisdiction Options Memorandum | Compare holding-company jurisdictions and structures; record trade-offs; no recommendation is binding | BEYU Holding Company (proposed) | Group CFO + counsel | 1.0 | `INFORMATIONAL` | MANDATORY + PRACTICE | D01, GATE 2 | Founder + counsel + tax adviser | On counsel sign-off | `holding/BEYU-LF-D20_HOLDING_STRUCTURE_OPTIONS_MEMORANDUM.md` |
| `BEYU-LF-D21` | Holding Company Constitutional-Document Review and Proposed Amendment Schedule | Review checklist + amendment schedule for MEMART/articles equivalents | Holding Company | Company Secretary(proposed) | 1.0 | `BLOCKED` | MANDATORY | D20; `[EXISTING CONSTITUTIONAL DOCUMENTS]` | Board + shareholders + BRELA filing | On amendment | `holding/BEYU-LF-D21_CONSTITUTIONAL_DOCUMENT_REVIEW.md` |
| `BEYU-LF-D22` | Dual-Class Share Rights and Restrictions Schedule | Full rights table: voting, economic, transfer, conversion, consent | Holding Company | Company Secretary | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + MANDATORY formalities | `BEYU-LF-DC-01`, D23, D24 | Board + Class A + Class B + counsel + BRELA filing | Annual | `holding/BEYU-LF-D22_DUAL_CLASS_RIGHTS_SCHEDULE.md` |
| `BEYU-LF-D23` | Shareholders' Agreement | Draft agreement / term sheet, marked for counsel completion | Holding Company + shareholders | Company Secretary | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL | D22, D24, D27, D29 | All shareholders + counsel | Annual | `holding/BEYU-LF-D23_SHAREHOLDERS_AGREEMENT.md` |
| `BEYU-LF-D24` | Share Issuance, Subscription, Transfer, Pre-emption, Dilution and Buyback Procedures | Operational + legal procedure for every capital event | Holding Company (+ subsidiaries) | Company Secretary | 1.0 | `PRELIMINARY_FRAMEWORK` | MANDATORY + CONTRACTUAL | D21, D22, D23 | Board / shareholders per schedule | Annual | `holding/BEYU-LF-D24_SHARE_PROCEDURES.md` |
| `BEYU-LF-D25` | Board Charter and Director Duties/Conflicts Framework | Board role, duties, conflicts, evaluation, delegation | Holding Company board | Chair | 1.0 | `COMPLETE_DRAFT` | MANDATORY + PRACTICE | D20, D27 | Board + shareholders | Annual | `holding/BEYU-LF-D25_BOARD_CHARTER.md` |
| `BEYU-LF-D26` | Board Committee Terms of Reference | Audit & Risk; Investment; Governance/Remuneration (where justified) | Board committees | Chair | 1.0 | `COMPLETE_DRAFT` | PRACTICE + MANDATORY (audit) | D25, D27, D34 | Board | Annual | `holding/BEYU-LF-D26_BOARD_COMMITTEES_TOR.md` |
| `BEYU-LF-D27` | Reserved Matters Schedule and Delegation of Authority Matrix | Single matrix of who decides what, and the financial/legal thresholds | Trust → Holding → subsidiaries | Chief Governance Officer | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + PRACTICE | D04, D22, D25, D30 | Trustees + Board + shareholders | Annual | `holding/BEYU-LF-D27_RESERVED_MATTERS_AND_DELEGATION_MATRIX.md` |
| `BEYU-LF-D28` | Shareholder, Board and Class-Consent Resolution Templates | Blank resolution instruments | Holding Company / subsidiaries | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | PRACTICE (evidence of MANDATORY acts) | D21, D22, D23, D27 | Board / shareholders | Annual | `holding/BEYU-LF-D28_RESOLUTION_TEMPLATES.md` |
| `BEYU-LF-D29` | Deadlock, Dispute Resolution, Exit, Transfer and Continuity Framework | Deadlock ladders, buy/sell, exit, succession-safe continuity | Holding Company + Groups | Company Secretary | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL | D23, D17, D57, D59 | Shareholders + counsel | Annual | `holding/BEYU-LF-D29_DEADLOCK_EXIT_CONTINUITY.md` |
| `BEYU-LF-D30` | Country Holding Company and Sector LLC/Operating Company Governance Framework | Parent/subsidiary authority, intercompany boundaries, board composition, local-law deference | Country holdings + sector operating companies | Group CFO + CGO | 1.0 | `PRELIMINARY_FRAMEWORK` | MANDATORY + CONTRACTUAL | D25, D27, D29 | Boards + counsel per jurisdiction | Annual | `holding/BEYU-LF-D30_COUNTRY_HOLDING_AND_SECTOR_GOVERNANCE.md` |

## 5. Section D — Dual-class share arrangement (preserved as a proposal)

| ID | Title | Purpose | Entity | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-DC-01` | Dual-Class Share Arrangement — Proposal, Lawful Options and Trade-off Memorandum | Preserves the Class A (1 vote) / Class B (1,000 votes) proposal **as a proposal**, explores lawful alternatives and protections, and lists what counsel must verify | Holding Company | Company Secretary + counsel | 1.0 | `INFORMATIONAL` | MANDATORY (validity is a legal question) | GATE 2 | Founder + counsel + tax adviser | On counsel sign-off | `dual-class/BEYU-LF-DC-01_DUAL_CLASS_PROPOSAL_MEMORANDUM.md` |

**Non-negotiable framing (restated because this is where a drafting exercise can go wrong):**

- The proposal is **Class C** — a proposed commercial intention, **not** a fact.
- This pack does **not** assume a trust owns shares, that the founder holds or has been issued any
  share, that any class exists, or that enhanced voting rights are lawful.
- No clause in this pack purports to defeat mandatory law, creditors' rights, court orders, statutory
  duties of directors, or legitimate minority protections.
- Enhanced voting rights, if they are lawful at all, exist **only** if created by the entity's
  constitutional documents and any required resolutions/filings — never by software.

## 6. Section E — Family office and wealth governance

| ID | Title | Purpose | Body | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D31` | BEYU Family Office Charter | Defines the Family Office as a **shared capability**, its mandate, boundaries, authority and reporting | Family Office (capability, not an OS/company) | Family Office Principal | 1.0 | `COMPLETE_DRAFT` | PRACTICE + CONTRACTUAL | D04, D27, `[FIR-001]`, `[FIR-018]` | Trustees + Board | Annual | `family-office/BEYU-LF-D31_FAMILY_OFFICE_CHARTER.md` |
| `BEYU-LF-D32` | Family Office Service Catalogue and Service-Level Framework | Services, service levels, escalation, exclusions | Family Office | Family Office Principal | 1.0 | `PRELIMINARY_FRAMEWORK` | CONTRACTUAL | D31, D37 | Trustees + Board | Annual | `family-office/BEYU-LF-D32_SERVICE_CATALOGUE.md` |
| `BEYU-LF-D33` | Wealth Consolidation, Reporting, Budgeting, Liquidity and Investment Governance Policy | Consolidated reporting boundaries; budget and liquidity discipline | Family Office + entities | Group CFO | 1.0 | `PRELIMINARY_FRAMEWORK` | PRACTICE + `[FIR-018]` boundary | D31, D34, D38 | Trustees + Board | Annual | `family-office/BEYU-LF-D33_WEALTH_REPORTING_POLICY.md` |
| `BEYU-LF-D34` | Investment Mandate, Risk Appetite, Due Diligence and Approval Framework | Written mandate, risk appetite statement, DD standard, approval thresholds | Investment Committee | CIO(proposed) | 1.0 | `TEMPLATE_NOT_EXECUTED` | CONTRACTUAL + MANDATORY (regulated products `[COUNSEL TO CONFIRM]`) | D07, D26, D27 | Trustees + Investment Committee | Annual | `family-office/BEYU-LF-D34_INVESTMENT_MANDATE.md` |
| `BEYU-LF-D35` | Family Office Authority, Custody, Payment, Expense and Reconciliation Controls | Who may hold, move, approve and reconcile money — and what the Family Office may **never** do | Family Office + Finance OS | Group CFO | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D31, D33, `[FIR-018]`, CAP_POSTING | Boards + auditors | Annual | `family-office/BEYU-LF-D35_CUSTODY_PAYMENT_CONTROLS.md` |
| `BEYU-LF-D36` | Adviser Selection, Fees, Conflicts, Confidentiality and Oversight Policy | Professional adviser lifecycle and independence | Family Office | Family Office Principal | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + MANDATORY (conflicts) | D14, D31, D37 | Trustees | Annual | `family-office/BEYU-LF-D36_ADVISER_OVERSIGHT_POLICY.md` |
| `BEYU-LF-D37` | Family Office Service Agreement Templates | Blank engagement agreements (family member / entity / external) | Entities ↔ Family Office | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | CONTRACTUAL | D31, D32, D35, D36 | Boards + counsel | Annual | `family-office/BEYU-LF-D37_SERVICE_AGREEMENT_TEMPLATES.md` |
| `BEYU-LF-D38` | Family Wealth Dashboard Data Dictionary and Reporting Schedule | Field-level definitions, sources of truth, cadence, recipients | Family Office + Finance OS | Group CFO | 1.0 | `PRELIMINARY_FRAMEWORK` | PRACTICE | D33, D35 | Trustees + Board + auditors | Annual | `family-office/BEYU-LF-D38_DASHBOARD_DATA_DICTIONARY.md` |

## 7. Section F — Intellectual property and brand stewardship

| ID | Title | Purpose | Entity | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D39` | BEYU Group Intellectual Property Ownership and Stewardship Policy | Proposed group IP ownership policy **only where valid title is established**; no automatic transfer | Group (Trust/Holding/subsidiaries/Foundation) | Group CTO + counsel | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + MANDATORY formalities | D40, D41, D42 | Boards + Trustees + counsel | Annual | `ip/BEYU-LF-D39_IP_OWNERSHIP_POLICY.md` |
| `BEYU-LF-D40` | IP Inventory and Chain-of-Title Register | Audit-grade inventory distinguishing authorship, registered title, contractual title, licence, custody, operational use | Group | Group CTO | 1.0 | `PRELIMINARY_FRAMEWORK` | PRACTICE (evidence for MANDATORY) | GATE 0 §7 finding | Boards + counsel | Quarterly | `ip/BEYU-LF-D40_IP_INVENTORY_AND_CHAIN_OF_TITLE_REGISTER.md` |
| `BEYU-LF-D41` | IP Assignment Template (founders, employees, contractors, contributors) | Instrument to create title where none exists — subject to local-law review | Any | Group CTO + counsel | 1.0 | `TEMPLATE_NOT_EXECUTED` | MANDATORY formalities `[COUNSEL TO CONFIRM]` | D43, D45 | Boards + counsel | Annual | `ip/BEYU-LF-D41_IP_ASSIGNMENT_TEMPLATE.md` |
| `BEYU-LF-D42` | IP Licence Template (incl. intra-group and Foundation) | Grant/limit rights without transferring title | Any | Group CTO + counsel | 1.0 | `TEMPLATE_NOT_EXECUTED` | CONTRACTUAL + MANDATORY (recordal) | D39, D40, D51, D54 | Boards + counsel + (registrar recordal) | Annual | `ip/BEYU-LF-D42_IP_LICENCE_TEMPLATE.md` |
| `BEYU-LF-D43` | Software Development, Commissioning, Contractor, Employment and Contribution Agreement Checklist | Checklist ensuring every contributor's rights are captured | Any | Group CTO + HR | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D41, D45 | Boards + counsel | Annual | `ip/BEYU-LF-D43_CONTRIBUTOR_AGREEMENT_CHECKLIST.md` |
| `BEYU-LF-D44` | Trademark, Copyright, Domain, Design, Database, Documentation, Dataset and Trade-Secret Register | Per-asset-type register with verification status and renewal triggers | Group | Group CTO + counsel | 1.0 | `PRELIMINARY_FRAMEWORK` | PRACTICE | D40, D46 | Boards | Quarterly | `ip/BEYU-LF-D44_IP_ASSET_REGISTER.md` |
| `BEYU-LF-D45` | Open-Source and Third-Party Software Compliance Policy | Licence inventory, copyleft controls, SBOM, attribution, AI/model supply chain | Group | Group CTO | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + MANDATORY (licence terms) | D43, D44 | Boards | Annual | `ip/BEYU-LF-D45_OPEN_SOURCE_COMPLIANCE_POLICY.md` |
| `BEYU-LF-D46` | IP Renewal, Protection, Access, Licensing, Transfer, Valuation and Enforcement Procedures | Operational procedures and escalation, incl. infringement and take-down | Group | Group CTO + counsel | 1.0 | `COMPLETE_DRAFT` | PRACTICE + MANDATORY (procedural) | D40, D42, D44, D71 | Boards + counsel | Annual | `ip/BEYU-LF-D46_IP_ENFORCEMENT_PROCEDURES.md` | 
| `BEYU-LF-D47` | Brand Use, Reputation, Domain and Digital Asset Stewardship Policy | Brand use, sub-brand control, domain/DNS, social, takedown, AI impersonation | Group | Brand owner(proposed) | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + PRACTICE | D39, D44, D46 | Boards | Annual | `ip/BEYU-LF-D47_BRAND_DOMAIN_STEWARDSHIP_POLICY.md` |

## 8. Section G — Foundation independence and nonprofit governance

| ID | Title | Purpose | Entity | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D48` | BEYU Foundation — Legal Structure and Registration Options Memorandum | Compare Tanzanian nonprofit legal forms (NGO under Cap. 56; company limited by guarantee; Trustees' Incorporation Act route; society) and their trade-offs | BEYU Foundation (sister organisation) | Foundation Director + counsel | 1.0 | `INFORMATIONAL` | MANDATORY | `LEGAL_SOURCES_REGISTER`; GATE 2 | Foundation board + counsel + regulator (as applicable) | On counsel sign-off | `foundation/BEYU-LF-D48_FOUNDATION_STRUCTURE_OPTIONS.md` |
| `BEYU-LF-D49` | Foundation Constitution / Governing-Document Checklist | Clause checklist against the chosen legal form's requirements | Foundation | Foundation Director | 1.0 | `PRELIMINARY_FRAMEWORK` | MANDATORY | D48 | Foundation board + counsel + regulator | On registration | `foundation/BEYU-LF-D49_FOUNDATION_GOVERNING_DOCUMENT_CHECKLIST.md` |
| `BEYU-LF-D50` | Foundation Board / Governing Body Charter and Conflicts Policy | Independence, composition, duties, conflicts, recusal | Foundation board | Foundation board chair(proposed) | 1.0 | `COMPLETE_DRAFT` | MANDATORY (duties) + PRACTICE | D48, D49 | Foundation board + counsel | Annual | `foundation/BEYU-LF-D50_FOUNDATION_BOARD_CHARTER.md` |
| `BEYU-LF-D51` | Foundation Independence and Related-Party Transaction Protocol | Arm's-length rules, disclosure, approval, documentation, no automatic group direction | Foundation ↔ Group | Foundation board + CGO | 1.0 | `COMPLETE_DRAFT` | MANDATORY (fiduciary/private-benefit) + CONTRACTUAL | D48, D50, D72 | Foundation board + Trustees + counsel | Annual | `foundation/BEYU-LF-D51_INDEPENDENCE_RELATED_PARTY_PROTOCOL.md` |
| `BEYU-LF-D52` | Charitable Purpose, Grantmaking, Donations, Restricted Funds and Private-Benefit Safeguards | Purpose-lock, restricted vs unrestricted funds, grant DD, prohibited benefit | Foundation | Foundation Director | 1.0 | `COMPLETE_DRAFT` | MANDATORY + PRACTICE | D48, D49, D51 | Foundation board + counsel + regulator | Annual | `foundation/BEYU-LF-D52_CHARITABLE_PURPOSE_AND_GRANTS.md` |
| `BEYU-LF-D53` | Foundation Funding, Shared Services, Cost Allocation and Inter-Entity Transactions Policy | How the Foundation is funded and how shared costs are allocated at arm's length | Foundation + Group | Group CFO + Foundation Director | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D51, D54, D72 | Foundation board + Group boards + tax adviser | Annual | `foundation/BEYU-LF-D53_FUNDING_AND_COST_ALLOCATION.md` |
| `BEYU-LF-D54` | Foundation / Group IP Licence and Shared-Services Agreement Templates | Blank instruments implementing D51/D53 | Foundation ↔ Group | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | CONTRACTUAL + MANDATORY (recordal/charity law) | D42, D51, D53 | Foundation board + Group boards + counsel | Annual | `foundation/BEYU-LF-D54_FOUNDATION_IP_AND_SHARED_SERVICES_TEMPLATES.md` |
| `BEYU-LF-D55` | Foundation Recordkeeping, Reporting, Oversight and Regulatory Compliance Checklist | Filings, returns, audit, public reporting, renewal triggers | Foundation | Foundation Director + DPO | 1.0 | `COMPLETE_DRAFT` | MANDATORY | D48, D53, D68, D69, D70 | Foundation board + auditor + regulator | Annual | `foundation/BEYU-LF-D55_FOUNDATION_COMPLIANCE_CHECKLIST.md` |

## 9. Section H — Succession, incapacity, continuity and risk

| ID | Title | Purpose | Body | Owner | Ver. | Status | Legal basis | Dependencies | Approvers (proposed) | Next review | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D56` | Founder Incapacity and Emergency Continuity Policy | Immediate-capacity ladder; distinguishes *interim governance* from *legal succession* | Group + Trust | CGO + Trustees | 1.0 | `COMPLETE_DRAFT` | PRACTICE + MANDATORY (separate mandates required) | D58, D60, D62 | Trustees + Board + counsel | Annual | `succession-risk/BEYU-LF-D56_FOUNDER_INCAPACITY_CONTINUITY.md` |
| `BEYU-LF-D57` | Family and Enterprise Succession Framework | Multi-generation succession architecture across ownership, control and management | Group + Family | CGO + Family Council | 1.0 | `COMPLETE_DRAFT` | PRACTICE + CONTRACTUAL | D11, D16, D29, D59 | Trustees + boards + Family Assembly | Annual | `succession-risk/BEYU-LF-D57_SUCCESSION_FRAMEWORK.md` |
| `BEYU-LF-D58` | Trustee, Director, Key-Person and Executive Succession Procedures | Named-role succession, deputies, handover, records | All entities | Company Secretary | 1.0 | `COMPLETE_DRAFT` | MANDATORY (filings on change) + PRACTICE | D03, D25, D30 | Boards + Trustees | Annual | `succession-risk/BEYU-LF-D58_ROLE_SUCCESSION_PROCEDURES.md` |
| `BEYU-LF-D59` | Voting-Control and Shareholder Succession Decision Tree | Which instrument governs each event; prevents software from being treated as the mechanism | Holding Company + shareholders | Company Secretary + counsel | 1.0 | `COMPLETE_DRAFT` | MANDATORY + CONTRACTUAL | D22, D23, D29, D57 | Shareholders + counsel + tax adviser | Annual | `succession-risk/BEYU-LF-D59_VOTING_CONTROL_DECISION_TREE.md` |
| `BEYU-LF-D60` | Business Continuity, Disaster Recovery and Critical-Records Policy | Continuity of **legal capacity** and critical records, not only IT | All entities | CGO + CTO | 1.0 | `COMPLETE_DRAFT` | PRACTICE + MANDATORY (records/regulatory) | D56, D62, D74 | Boards + auditors | Annual | `succession-risk/BEYU-LF-D60_CONTINUITY_AND_RECORDS.md` |
| `BEYU-LF-D61` | Enterprise Risk Register and Risk Escalation Framework | Field-defined risk register + escalation + appetite linkage | All entities | Chief Risk & Compliance | 1.0 | `PRELIMINARY_FRAMEWORK` | PRACTICE | D34, D60, D71 | Boards + Audit & Risk Committee | Quarterly | `succession-risk/BEYU-LF-D61_ENTERPRISE_RISK_REGISTER.md` |
| `BEYU-LF-D62` | Crisis Authority and Emergency Decision Matrix | Time-boxed emergency authority that cannot permanently displace governance | All entities | CGO | 1.0 | `COMPLETE_DRAFT` | CONTRACTUAL + PRACTICE (must be mirrored in instruments) | D56, D60, D27 | Boards + Trustees + counsel | Annual | `succession-risk/BEYU-LF-D62_CRISIS_AUTHORITY_MATRIX.md` |

## 10. Section I — Compliance, registers and operating templates

| ID | Title | Purpose | Owner | Ver. | Status | Dependencies | Approvers (proposed) | Review frequency | Path |
|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-D63` | Master Legal Entity Register | Single register of every legal entity, its registration, jurisdiction, status and evidence | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | GATE 0 §6 | Boards + counsel | Quarterly | `registers/BEYU-LF-D63_MASTER_LEGAL_ENTITY_REGISTER.md` |
| `BEYU-LF-D64` | Ownership and Share Capital Register Template | Statutory share/member register fields + capital events | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | D24, D63 | Boards + counsel | On every capital event; reconciled quarterly | `registers/BEYU-LF-D64_OWNERSHIP_AND_SHARE_CAPITAL_REGISTER.md` |
| `BEYU-LF-D65` | Beneficial Ownership and Disclosure Register / Checklist | Beneficial-ownership identification, evidence and filing control | Company Secretary + CGO | 1.0 | `TEMPLATE_NOT_EXECUTED` | D63, D64, `LEGAL_SOURCES_REGISTER` §CO-4 | Boards + counsel | On change; confirm annually | `registers/BEYU-LF-D65_BENEFICIAL_OWNERSHIP_REGISTER.md` |
| `BEYU-LF-D66` | Trustee, Director, Officer and Authorised-Signatory Register | Who holds which office, since when, with what authority and evidence | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | D03, D25, D63 | Boards + Trustees | On change; confirm annually | `registers/BEYU-LF-D66_OFFICEHOLDER_AND_SIGNATORY_REGISTER.md` |
| `BEYU-LF-D67` | Asset and Liability Register | Asset/liability inventory with title evidence, custody and encumbrance | Group CFO | 1.0 | `TEMPLATE_NOT_EXECUTED` | D06, D35, D63 | Boards + auditors | Quarterly | `registers/BEYU-LF-D67_ASSET_AND_LIABILITY_REGISTER.md` |
| `BEYU-LF-D68` | Contract, Obligation, Renewal and Filing Calendar | Every obligation with a date, owner and evidence | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | D55, D63, D69 | Boards | Monthly review | `registers/BEYU-LF-D68_OBLIGATION_AND_FILING_CALENDAR.md` |
| `BEYU-LF-D69` | Tax and Accounting Obligations Checklist by Entity and Jurisdiction | Per-entity/jurisdiction obligation checklist (no rates asserted) | Group CFO + tax adviser | 1.0 | `TEMPLATE_NOT_EXECUTED` | D63, D68, `LEGAL_SOURCES_REGISTER` §TAX | Boards + tax adviser | Annual + on law change | `registers/BEYU-LF-D69_TAX_AND_ACCOUNTING_CHECKLIST.md` |
| `BEYU-LF-D70` | Data Protection and Information Governance Compliance Checklist | PDPA-aligned control checklist, DPO, transfers, retention | DPO(proposed) | 1.0 | `TEMPLATE_NOT_EXECUTED` | D19, D55, `LEGAL_SOURCES_REGISTER` §DP | Boards + DPO | Annual | `registers/BEYU-LF-D70_DATA_PROTECTION_CHECKLIST.md` |
| `BEYU-LF-D71` | Litigation, Claims, Insurance and Regulatory Correspondence Register | Matter register with privilege and notification controls | Chief Risk & Compliance | 1.0 | `TEMPLATE_NOT_EXECUTED` | D61, D67 | Boards + counsel + insurer | Monthly | `registers/BEYU-LF-D71_LITIGATION_CLAIMS_INSURANCE_REGISTER.md` |
| `BEYU-LF-D72` | Related-Party Transaction Register | Identify, approve, price and disclose related-party transactions | CGO + Group CFO | 1.0 | `TEMPLATE_NOT_EXECUTED` | D14, D51, D53, D27 | Boards + auditors | On transaction; reviewed quarterly | `registers/BEYU-LF-D72_RELATED_PARTY_TRANSACTION_REGISTER.md` |
| `BEYU-LF-D73` | Decision, Resolution, Consent and Delegation Register | Index of every governance act and where its evidence lives | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | D10, D28, D27 | Boards + Trustees | Monthly | `registers/BEYU-LF-D73_DECISION_AND_DELEGATION_REGISTER.md` |
| `BEYU-LF-D74` | Legal Document Execution and Custody Register | Execution status, custody, originals, versions, access control | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | **All documents** | Boards + Trustees | On execution; annual verification | `registers/BEYU-LF-D74_LEGAL_DOCUMENT_EXECUTION_AND_CUSTODY_REGISTER.md` |
| `BEYU-LF-D75` | Annual Governance Review Checklist | One annual cycle that evidences the whole framework | CGO | 1.0 | `COMPLETE_DRAFT` | All | Trustees + boards + Family Assembly | Annual (mandatory) | `registers/BEYU-LF-D75_ANNUAL_GOVERNANCE_REVIEW_CHECKLIST.md` |

## 11. Section J — Employment, HR and the employment interface (expansion series `EMP`)

| ID | Title | Purpose | Owner | Ver. | Status | Dependencies | Approvers (proposed) | Review frequency | Path |
|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-EMP-01` | Employment Contract Framework | Modular employer determination, worker categories, contract shell and the mandatory-terms blocker | HR + Company Secretary | 1.0 | `CONDITIONAL_DRAFT` | `EMP-01` Part F (counsel); employment-law research (**not done**) | Boards; counsel | Annual; on law change | `employment/BEYU-LF-EMP-01_EMPLOYMENT_CONTRACT_FRAMEWORK.md` |
| `BEYU-LF-EMP-02` | Offer Letters / Barua za Ajira (EN + Kiswahili) | Offer, conditional offer, confirmation, change-of-terms and withdrawal templates | HR | 1.0 | `TEMPLATE_NOT_EXECUTED` | `EMP-01` §2 and Part F | Authorised officer (`D27`) | Annual | `employment/BEYU-LF-EMP-02_OFFER_LETTERS_BARUA_ZA_AJIRA.md` |
| `BEYU-LF-EMP-03` | HR Policies and Employee Handbook | 25-policy handbook, modular by entity; incorporates `D15` by reference | HR + Company Secretary | 1.0 | `CONDITIONAL_DRAFT` | `EMP-01` Part F; `D15`; counsel | Board of the employing entity | Annual | `employment/BEYU-LF-EMP-03_HR_POLICIES_AND_HANDBOOK.md` |
| `BEYU-LF-EMP-04` | Bilingual Glossary and Language Control (EN ↔ Kiswahili) | Working glossary, translation QC and the governing-language decision | HR + Company Secretary | 1.0 | `PRELIMINARY_FRAMEWORK` | `EMP-04` §5 (counsel); certified translation where required | Board on counsel's advice | 6-monthly | `employment/BEYU-LF-EMP-04_BILINGUAL_GLOSSARY_EN_SW.md` |

## 12. Section K — Product terms, privacy and compliance (expansion series `TOS`, `PRIV`, `CMP`)

| ID | Title | Purpose | Owner | Ver. | Status | Dependencies | Approvers (proposed) | Review frequency | Path |
|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-TOS-01` | Terms of Service (EN + Kiswahili) | Product terms grounded in the actual product and contracting entity | Company Secretary + product owner | 1.0 | `CONDITIONAL_DRAFT` | `INC-01`; product definition; `PRIV-02`; counsel | Board | Annual; on product change | `product-compliance/BEYU-LF-TOS-01_TERMS_OF_SERVICE.md` |
| `BEYU-LF-PRIV-01` | Privacy Policy / Sera ya Faragha (EN + Kiswahili) | Published privacy notice — the output of the data inventory | DPO function | 1.0 | `CONDITIONAL_DRAFT` | **`PRIV-02` complete**; entity; counsel | Board on counsel's advice | Annual; on any change of processing | `product-compliance/BEYU-LF-PRIV-01_PRIVACY_POLICY.md` |
| `BEYU-LF-PRIV-02` | Data Inventory and Data-Flow Mapping | **The prerequisite**: categories, purposes, bases, recipients, transfers, retention, rights | DPO + CTO | 1.0 | `PRELIMINARY_FRAMEWORK` | `[USER TO CONFIRM]` facts; `D70`; counsel | Board | Quarterly | `product-compliance/BEYU-LF-PRIV-02_DATA_INVENTORY_AND_FLOW_MAPPING.md` |
| `BEYU-LF-CMP-01` | Compliance Pack (Obligations Register and Trackers) | Obligations register + 16 control trackers; **cross-references `D63`–`D75`, does not duplicate** | Company Secretary + DPO → Audit & Risk Committee | 1.0 | `PRELIMINARY_FRAMEWORK` | Verified sources per obligation; `INC-01`; counsel + accountant | Board | Quarterly | `product-compliance/BEYU-LF-CMP-01_COMPLIANCE_PACK.md` |

## 13. Section L — Finance, fundraising and financial reporting (expansion series `FIN`)

| ID | Title | Purpose | Owner | Ver. | Status | Dependencies | Approvers (proposed) | Review frequency | Path |
|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-FIN-01` | Pitch Deck Framework and Claim Evidence Checklist | Deck structure + the evidence rule for every investor-facing claim | CEO + CFO | 1.0 | `TEMPLATE` | Verified entity, records, IP, compliance (`CMP-01`) | Board (re-approval on any change) | Before any external use | `fundraising/BEYU-LF-FIN-01_PITCH_DECK_AND_CLAIM_EVIDENCE.md` |
| `BEYU-LF-FIN-02` | Financial Model | Assumptions register, drivers, costs, headcount, capex, working capital, tax, financing, runway, scenarios, sensitivity | CFO | 1.0 | `TEMPLATE` | Ratified accounting policy (`C-1`); accountant | Board; A&R Committee | Monthly once a business exists | `fundraising/BEYU-LF-FIN-02_FINANCIAL_MODEL.md` |
| `BEYU-LF-FIN-03` | Term Sheet | Conditional framework, coordinated with `D23`/`CAP-01`/`ESOP-01` | CEO + counsel | 1.0 | `TEMPLATE_NOT_EXECUTED` | `INC-01`; `CAP-01`; a real transaction | Board + shareholders | Only when a transaction arises | `fundraising/BEYU-LF-FIN-03_TERM_SHEET.md` |
| `BEYU-LF-FIN-04` | Income Statement | Blank statement template + reporting parameters + data-request checklist | CFO | 1.0 | `TEMPLATE` | Ledger; opening position; accountant | Board; A&R Committee | Monthly once a ledger exists | `financial-reporting/BEYU-LF-FIN-04_INCOME_STATEMENT.md` |
| `BEYU-LF-FIN-05` | Cash Flow Statement | Blank template + the cash bridge | CFO | 1.0 | `TEMPLATE` | Bank reconciliations; ledger | Board; A&R Committee | Monthly | `financial-reporting/BEYU-LF-FIN-05_CASH_FLOW_STATEMENT.md` |
| `BEYU-LF-FIN-06` | Balance Sheet | Blank template + the accounting equation | CFO | 1.0 | `TEMPLATE` | Opening position; fixed-asset register; share register | Board; A&R Committee | Monthly | `financial-reporting/BEYU-LF-FIN-06_BALANCE_SHEET.md` |
| `BEYU-LF-FIN-07` | Statement of Changes in Equity | Blank template + the equity bridge | CFO | 1.0 | `TEMPLATE` | Verified share register (**zero verified shares**) | Board; A&R Committee | Monthly | `financial-reporting/BEYU-LF-FIN-07_STATEMENT_OF_CHANGES_IN_EQUITY.md` |
| `BEYU-LF-FIN-08` | Notes to the Financial Statements | 26-note disclosure framework | CFO + Company Secretary | 1.0 | `TEMPLATE` | The statements; current registers | Board | With the statements | `financial-reporting/BEYU-LF-FIN-08_NOTES_TO_THE_FINANCIAL_STATEMENTS.md` |
| `BEYU-LF-FIN-09` | Reconciliation and Integrity Controls | 22 controls, the four bridges and the findings discipline | CFO → A&R Committee | 1.0 | `PRELIMINARY_FRAMEWORK` | A ledger and statements (**neither exists**) | Board; A&R Committee | With every statement | `financial-reporting/BEYU-LF-FIN-09_RECONCILIATION_AND_INTEGRITY_CONTROLS.md` |

## 14. Expansion series — trust clauses, founders and corporate (`TC`, `FA`, `INC`, `CX`, `CAP`, `ESOP`, `NDA`, `RC`, `IP-TM`, `IP-EV`)

| ID | Title | Purpose | Owner | Ver. | Status | Dependencies | Approvers (proposed) | Review frequency | Path |
|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-TC-01` | Trust Clause Pack | The four trust clauses with purpose, text, plain language, risks, law assumptions and counsel questions | CGO | 1.0 | `CONDITIONAL_DRAFT` | Counsel (`Q-TC-01`…`Q-TC-08`); the jurisdiction/legal-form decision | Settlor + Trustees on counsel's advice | On counsel markup | `trust/BEYU-LF-TC-01_TRUST_CLAUSE_PACK.md` |
| `BEYU-LF-FA-01` | Founders Agreement | Contributions, roles, decision rights, equity, vesting, leavers, IP, covenants, exit, disputes | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | `INC-01`; `D21`; counsel | Board + shareholders | Annual | `corporate/BEYU-LF-FA-01_FOUNDERS_AGREEMENT.md` |
| `BEYU-LF-CX-01` | Co-founder Exit and Separation | The exit clause and the separation agreement, with the leaver rules and the release limits | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | `FA-01`; `D24` §6; counsel | Board (+ shareholders per `D27`) | Annual | `corporate/BEYU-LF-CX-01_CO_FOUNDER_EXIT_AND_SEPARATION.md` |
| `BEYU-LF-INC-01` | Incorporation and Formation Pack | Prerequisites, sequencing, constitutional checklist, formation checklist and resolutions | Company Secretary + counsel | 1.0 | `PRELIMINARY_FRAMEWORK` (**in part `BLOCKED`**) | The structure decision (`DAA-ARCH-005/006`) | Founder, then first board | On the structure decision | `corporate/BEYU-LF-INC-01_INCORPORATION_AND_FORMATION_PACK.md` |
| `BEYU-LF-CAP-01` | Cap Table and Share Register | **Blank-by-design** cap table, evidence standard, register reconciliation (**zero verified shares**) | Company Secretary | 1.0 | `TEMPLATE` | `INC-01`; `D64`; counsel | Board (+ shareholders on an issue) | On every capital event | `corporate/BEYU-LF-CAP-01_CAP_TABLE_AND_SHARE_REGISTER.md` |
| `BEYU-LF-ESOP-01` | Employee Share Option Plan | Plan, grant, vesting, exercise and leaver rules; pool and dilution discipline | Board / Remuneration Committee | 1.0 | `TEMPLATE_NOT_EXECUTED` | `INC-01`; counsel; accountant (`Q-TAX-03`) | Shareholders (plan/pool); board (grants) | Annual | `corporate/BEYU-LF-ESOP-01_EMPLOYEE_SHARE_OPTION_PLAN.md` |
| `BEYU-LF-NDA-01` | Confidentiality Agreement Pack | Mutual and one-way NDAs, seven counterparty variants, model-training carve-out, whistleblowing carve-out | Company Secretary | 1.0 | `TEMPLATE_NOT_EXECUTED` | Counsel (party capacity; data-protection terms) | Board (delegated within `D27` limits) | Annual | `ip/BEYU-LF-NDA-01_MUTUAL_AND_ONE_WAY_NDA_PACK.md` |
| `BEYU-LF-RC-01` | Restrictive Covenants Pack | Non-compete and the narrower alternatives; **enforceability NOT assumed**; assessment framework | Company Secretary + counsel | 1.0 | `CONDITIONAL_DRAFT` | `Q-R-06` and jurisdiction research (**not done**) | Board on counsel's advice | On counsel mark; on jurisdiction change | `ip/BEYU-LF-RC-01_RESTRICTIVE_COVENANTS_PACK.md` |
| `BEYU-LF-IP-TM-01` | IP Search, Filing and Renewal Tracker | Search/filing/renewal tracker; **term unresolved — no date may be derived**; **zero verified rights** | Group CTO + counsel | 1.0 | `TEMPLATE` | Verification of the term, fees and route from the official source | Board on counsel's advice | Quarterly | `ip/BEYU-LF-IP-TM-01_SEARCH_FILING_AND_RENEWAL_TRACKER.md` |
| `BEYU-LF-IP-EV-01` | IP Evidence Archive and Attestations | Contributor attestations, chain of title, open-source review, enforcement log, evidence rules | Group CTO + Company Secretary | 1.0 | `TEMPLATE` / `INFORMATIONAL` | `D41`; `D43`; `D45`; `D74` | Board (standards); owners per item | Quarterly | `ip/BEYU-LF-IP-EV-01_IP_EVIDENCE_ARCHIVE_AND_ATTESTATIONS.md` |

## 15. Pack-level expansion documents

| ID | Title | Purpose | Owner | Ver. | Status | Dependencies | Approvers (proposed) | Review frequency | Path |
|---|---|---|---|---|---|---|---|---|---|
| `BEYU-LF-REG-EXPANSION` | Gate 0B Expansion Coverage Inventory | Coverage mapping, ID convention, nine pre-drafting conflicts (X-1…X-9) and the scope limits of the expansion | CGO | 1.0 | `INFORMATIONAL` | — | CGO | On any change to the expansion | `GATE-0B_EXPANSION_COVERAGE_INVENTORY.md` |
| `BEYU-LF-REG-RTM` | Request-to-Document Matrix | **Every item the brief requested → the document that answers it → status → what is still missing** | CGO | 1.0 | `INFORMATIONAL` | This register | CGO | On any change | `REQUEST_TO_DOCUMENT_MATRIX.md` |
| `BEYU-LF-REG-G9` | Gate 9 Verification Checks | The 14 checks, their exact commands, their results and **what they do NOT prove** | CGO | 1.0 | `INFORMATIONAL` | The pack | CGO | On any change | `GATE-9_VERIFICATION_CHECKS.md` |
| `BEYU-LF-REG-G10` | Gate 10 Deliverables | Executive summary, file list, matrix, register/status summary, source report, consistency findings, financial validation, C/H/M/L findings, open items, verification log and merge recommendation (A–K) | CGO | 1.0 | `INFORMATIONAL` | The pack | The family at the review gate | At the review gate | `GATE-10_DELIVERABLES.md` |
| `BEYU-LF-REG-ACCTQ` | Accountant Questions for BEYU Financial Reporting | The questions that must be answered before any financial statement, model or tax line is prepared | CFO | 1.0 | `INFORMATIONAL` | `FIN-02`, `FIN-04`–`FIN-09` | CFO + accountant | On any accounting decision | `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md` |

## 16. Coverage check against the brief

| Brief item | Document ID(s) | Present? |
|---|---|---|
| A1–A10 Trust formation and administration | D01–D10 | Yes |
| B11–B19 Family constitution and governance | D11–D19 | Yes |
| C20–C30 Holding company and ownership governance | D20–D30 | Yes |
| D Dual-class arrangement (proposal) | DC-01, D22, D23, D24, D59 | Yes |
| E31–E38 Family office and wealth governance | D31–D38 | Yes |
| F39–F47 Intellectual property and brand stewardship | D39–D47 | Yes |
| G48–G55 Foundation independence and nonprofit governance | D48–D55 | Yes |
| H56–D62 Succession, incapacity, continuity and risk | D56–D62 | Yes |
| I63–I75 Compliance, registers and operating templates | D63–D75 | Yes |
| **J Expansion — employment/HR (EMP-01…EMP-04)** | `EMP-01`–`EMP-04` | Yes |
| **K Expansion — product terms, privacy, compliance (TOS-01, PRIV-01/02, CMP-01)** | `TOS-01`, `PRIV-01`, `PRIV-02`, `CMP-01` | Yes |
| **L Expansion — finance, fundraising, reporting (FIN-01…FIN-09)** | `FIN-01`–`FIN-09` | Yes |
| **Expansion — trust clauses, founders and corporate (TC-01, FA-01, INC-01, CX-01, CAP-01, ESOP-01, NDA-01, RC-01, IP-TM-01, IP-EV-01)** | `TC-01`, `FA-01`, `INC-01`, `CX-01`, `CAP-01`, `ESOP-01`, `NDA-01`, `RC-01`, `IP-TM-01`, `IP-EV-01` | Yes |
| **Addresses** — every item the brief requested, mapped to the answering document and its gaps | `REQUEST_TO_DOCUMENT_MATRIX.md` | Yes |
| **Accountant questions** | `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md` | Yes |
| Cross-document matrix | `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` | Yes |
| Blueprint-to-document traceability | `BLUEPRINT_TO_DOCUMENT_TRACEABILITY_MATRIX.md` | Yes |
| Legal questions for counsel | `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` | Yes |
| Legal sources register | `LEGAL_SOURCES_REGISTER.md` | Yes |
| Decision and assumptions register | `DECISION_AND_ASSUMPTIONS_REGISTER.md` | Yes |
| Implementation roadmap and execution checklist | `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` | Yes |
| Change log | `CHANGE_LOG.md` | Yes |

**Blocked documents and why:** `BEYU-LF-D21` is `BLOCKED` — it reviews *existing* constitutional
documents (MEMART/articles equivalent) that were **not supplied and do not exist in this
repository**. Blocker resolution: provide the current constitutional documents (or confirm the
company is not yet incorporated and D21 should instead become a drafting task under D20).
**Second blocked item (revision 1.1):** `BEYU-LF-INC-01` is `PRELIMINARY_FRAMEWORK` and **in part `BLOCKED`** —
it cannot be completed until the jurisdiction and structure decisions (`DAA-ARCH-005`, `DAA-ARCH-006`) are made;
and `BEYU-LF-PRIV-01` may not be published until `PRIV-02` is complete. **No other document is blocked; all
others are drafted or specified with explicit placeholders.**
