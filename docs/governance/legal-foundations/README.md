# BEYU Foundational Legal, Wealth, Governance and Enterprise Document Pack

**Pack ID:** `BEYU-LF`
**Version:** 1.0 (initial counsel-review pack)
**Date of preparation:** 2026-10-15 (Africa/Dar_es_Salaam)
**Status:** `DRAFT FOR PROFESSIONAL REVIEW` — nothing in this pack is executed, filed, registered, notarised, or legally effective.
**Location:** `docs/governance/legal-foundations/` (new; no suitable existing location existed — see §Location decision below)
**Owner:** Chief Governance Officer (proposed) `[TO BE APPOINTED]`
**Approving authority (proposed):** BEYU Family Trust trustees + BEYU Holding Company board `[NEITHER BODY IS REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED — see DECISION_AND_ASSUMPTIONS_REGISTER]`

---

## 1. What this pack is

This pack translates the established BEYU architectural blueprint into a coordinated set of
**legal-document drafts, governance instruments, registers, legal research notes, implementation
plans and professional-review checklists** for a Tanzania-first multigenerational family enterprise.

It is **drafting and research work product**. It is **not** legal advice, **not** a substitute for
advice from an advocate of the High Court of Tanzania, a tax adviser, an accountant, a licensed
corporate secretary, or a regulator. Every legal proposition in this pack carries an explicit
verification status; every instrument that would create, transfer, vary or extinguish a legal right
is marked as an unexecuted draft.

> **Arena.ai is an AI system and does not provide legal advice.** Outputs in this pack were produced
> by an AI documentation agent operating on an open-source repository. No advocate, notary,
> accountant, tax adviser or regulator has reviewed, approved, certified or filed anything in this
> pack. Treat every clause as a **starting point for professional review**, not as a settled
> position.

## 2. What this pack is not

- It does **not** create, incorporate, register or recognise any entity, trust, foundation, office
  or governing body.
- It does **not** issue, allot, transfer, pledge, charge or vary any share, unit, interest, right or
  asset.
- It does **not** create any entitlement, beneficiary status, office, appointment, delegation or
  authority.
- It does **not** assert that any BEYU entity exists in law. Where the repository contains entity
  names, registration numbers, ownership percentages or governing bodies, those are, unless
  separately evidenced, **seeded reference/demonstration data inside a software control plane**, not
  legal facts (see `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6).
- It does **not** modify application code, database schema, migrations, production settings or live
  records. This is a documentation-only change set.

## 3. Status vocabulary used throughout the pack

Two vocabularies are used and must not be confused.

### 3.1 Document status (front matter of every document)

| Label | Meaning |
|---|---|
| `COMPLETE_DRAFT` | Full instrument drafted to a standard suitable for counsel markup. Not executed. |
| `PRELIMINARY_FRAMEWORK` | Structure, headings and controls drafted; specific commercial or legal content deliberately left to be supplied. |
| `TEMPLATE_NOT_EXECUTED` | A blank execution/consent/resolution/register template. No signature, witness or notary block has been completed. |
| `BLOCKED` | Cannot be completed until a named input, decision or professional review is supplied. The blocker is named in the document. |
| `INFORMATIONAL` | Research note, matrix, register specification or report — not an instrument. |

### 3.2 Fact / decision classification (used in the Decision and Assumptions Register)

| Code | Class | Meaning |
|---|---|---|
| **A** | Verified existing fact | Supported by evidence in this repository or an official source actually inspected. |
| **B** | Established BEYU architectural decision | Stated as architectural intention by the project; **not** proof of legal formation. |
| **C** | Proposed arrangement awaiting approval | A commercial or governance proposal. Never to be treated as a fact. |
| **D** | Legal question requiring professional advice | Requires a qualified Tanzanian (or other relevant) professional. |
| **E** | Missing information requiring user input | Requires a human answer. |
| **F** | Registration/execution/implementation step not completed | A concrete step that has not been done and must not be claimed as done. |

### 3.3 Source verification status (used in the Legal Sources Register)

| Label | Meaning |
|---|---|
| `VERIFIED_PRIMARY` | The official statute/regulator source was retrieved in this session; the text quoted was read from that source. |
| `VERIFIED_SECONDARY` | Only a secondary (professional commentary/aggregator) source could be retrieved. |
| `REQUIRES VERIFICATION` | Could not be checked against an official source in this environment. Must be verified by counsel before reliance. |

## 4. Navigation

### 4.1 Pack-level control documents

| File | Purpose |
|---|---|
| `README.md` | This index, status vocabulary, limitations, location rationale. |
| `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` | What was actually inspected; evidence base; authority conflicts; fabricated-data findings. |
| `MASTER_DOCUMENT_REGISTER.md` | All documents: ID, title, purpose, entity/body, owner, version, status, dependencies, approvers, review date. |
| `DECISION_AND_ASSUMPTIONS_REGISTER.md` | Every fact/proposal/unknown/legal question, classified A–F. |
| `LEGAL_SOURCES_REGISTER.md` | Legislation and regulator sources with verification status and the question each answers. |
| `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` | Consolidated questions memorandum for the advocate. |
| `BLUEPRINT_TO_DOCUMENT_TRACEABILITY_MATRIX.md` | Each established BEYU principle → implementing documents → clauses → verification → unresolved issues. |
| `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` | Contradictions, missing clauses, circular authority, undefined terms, unowned responsibilities. |
| `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` | GATE 0 – GATE 7 with dependencies, evidence, blocking questions, completion criteria. |
| `DEFINED_TERMS.md` | Single controlled vocabulary for the pack. |
| `CHANGE_LOG.md` | Every file created, edited, or deliberately left untouched. |

### 4.2 Document sections (numbered as required by the engagement brief)

| Folder | Section | Document IDs |
|---|---|---|
| `trust/` | A — Trust formation and administration | `BEYU-LF-D01` … `BEYU-LF-D10` |
| `family/` | B — Family constitution and family governance | `BEYU-LF-D11` … `BEYU-LF-D19` |
| `holding/` | C — Holding company and ownership governance | `BEYU-LF-D20` … `BEYU-LF-D30` |
| `dual-class/` | D — Dual-class share arrangement (proposal) | `BEYU-LF-DC-01` (+ referenced by D22–D24) |
| `family-office/` | E — Family office and wealth governance | `BEYU-LF-D31` … `BEYU-LF-D38` |
| `ip/` | F — Intellectual property and brand stewardship | `BEYU-LF-D39` … `BEYU-LF-D47` |
| `foundation/` | G — Foundation independence and nonprofit governance | `BEYU-LF-D48` … `BEYU-LF-D55` |
| `succession-risk/` | H — Succession, incapacity, continuity and risk | `BEYU-LF-D56` … `BEYU-LF-D62` |
| `registers/` | I — Compliance, registers and operating templates | `BEYU-LF-D63` … `BEYU-LF-D75` |

## 5. Location decision

The repository already organises documentation by subject under `docs/` (`docs/governance/`,
`docs/architecture/`, `docs/foundation/`, `docs/compliance/`, `docs/security/`, `docs/finance/`,
`docs/branding/`). There is **no** existing legal-instrument or legal-research folder, and the
existing folders are engineering/architecture-oriented.

This pack therefore uses the clearly named location **`docs/governance/legal-foundations/`**, as
contemplated by the engagement brief, because:

1. it is a governance subject area, so `docs/governance/` is the closest existing parent;
2. it does not collide with or duplicate any existing document;
3. it keeps ~90 interrelated files in one reviewable unit rather than scattering them.

**No existing file was moved, renamed or deleted.** No file outside this new folder was modified
except the two index/change-log touch-points recorded in `CHANGE_LOG.md`.

## 6. Hard boundaries preserved by this pack

These are restated because the pack touches them and must not weaken them:

1. **Four canonical Sector OSs only** — `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`.
   Foundation, Family Office, HCM and NOELIA are **not** Sector OSs. Nothing in this pack creates a
   fifth.
2. **BEYU Foundation** is a separately governed nonprofit sister organisation. It is **not**
   automatically a Holding Company subsidiary, a Sector LLC or a Sector OS. Its independence and
   charitable-purpose safeguards are preserved in `foundation/`.
3. **BEYU Family Office** is a shared family wealth-administration and governance capability. It is
   **not** automatically a company, an asset owner, or an OS. See `family-office/`.
4. **NOELIA_AI** is a governed intelligence system. It is never a trustee, director, shareholder,
   legal authority, or substitute for an authorised human decision. This pack contains no clause
   purporting to give it any such role.
5. **The digital governance boundary is not a legal boundary.** Software access, RBAC/ABAC, tenant
   configuration, audit logs, URLs, workflows and AI-generated approvals do **not** create legal
   ownership or legal authority. Where this pack references the BEYU OS control plane, it does so as
   a *record-keeping and evidence* tool only.
6. **Fail-closed controls preserved.** GlobalUserID, entity/country/tenant classification, least
   privilege, MFA, delegation and consent, auditability, row-level security, and fail-closed
   financial posting controls are untouched by this pack.
7. **Brand principles preserved** — "Bridging Care. Building Trust."; Trust, Care, Integrity,
   Innovation, Impact. Brand assets remain subject to verified ownership and chain of title.

## 7. How to read a document in this pack

Every numbered document opens with front matter:

```text
Document ID:      BEYU-LF-Dnn
Title:            ...
Version:          1.0 (draft)
Date:             2026-10-15
Status:           COMPLETE_DRAFT | PRELIMINARY_FRAMEWORK | BLOCKED | TEMPLATE_NOT_EXECUTED | INFORMATIONAL
Document owner:   ...
Approving authority (proposed): ...
Next review date: [SET ON APPROVAL]
Classification:   ...
Related documents: ...
```

and contains, where relevant: purpose, scope, legal form/parties, definitions, roles/powers/decision
rights, restrictions, approvals, quorum/voting/records/delegation, conflicts/related-party controls,
confidentiality, dispute resolution, amendment/termination, schedules, cross-references,
implementation dependencies, a mandatory-legal / proposed-contractual / optional-practice
distinction, an explicit placeholder list, and a counsel-review note.

## 8. Placeholder convention

Unfilled facts appear in square brackets and are **never** invented. The canonical set is:

```text
[SETTLOR NAME] [TRUSTEE NAME] [PROTECTOR NAME] [BENEFICIARY CLASS] [BENEFICIARY NAME]
[REGISTERED OFFICE] [INITIAL TRUST PROPERTY] [COMPANY REGISTRATION NUMBER] [TIN]
[INCORPORATION DATE] [EFFECTIVE DATE] [SHARE CLASS TERMS] [NUMBER OF SHARES]
[NOMINAL VALUE] [JURISDICTION] [GOVERNING LAW] [DISPUTE FORUM] [COUNSEL TO CONFIRM]
[USER TO SUPPLY] [FOUNDER NAME] [FAMILY COUNCIL MEMBER]
```

If a document appears to read as a completed instrument, that is a drafting artefact — check the
front matter. Nothing here has been executed.

## 9. Confidentiality warning

This repository is **not** a suitable custodian for confidential signed instruments, identity
documents, beneficiary personal data, trust accounts, valuation reports or regulator correspondence.
Registers in `registers/` are **specifications and templates**, not populated registers. Populated
registers belong in a controlled, access-restricted, encrypted system of record — see
`registers/BEYU-LF-D75_ANNUAL_GOVERNANCE_REVIEW_CHECKLIST.md` §Custody and
`registers/BEYU-LF-D74_LEGAL_DOCUMENT_EXECUTION_AND_CUSTODY_REGISTER.md`.

## 10. Change control

This pack is versioned in Git on branch `arena/8fbc8030-beyu-os-1-0`. It is submitted for human
review as a pull request and **must not be auto-merged**. See
`IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` GATE 6 and GATE 7.

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-10-15 | Initial pack created (Gate 0 audit through Gate 7 readiness checklist) | AI documentation agent (Arena.ai Agent Mode) |

## 11. Drafting status at revision 1.0

**All 76 registered documents exist** (`D01`–`D75` plus `DC-01`), together with the pack-level control
documents, the section-I index and `CHANGE_LOG.md`. **Every path in `MASTER_DOCUMENT_REGISTER.md` resolves to
a file in this folder.**

**This means the documents are DRAFTED. It does not mean any of them is effective.** The status vocabulary
(§3.1) is the only permitted way to describe a document's state, and the statuses that dominate this pack are:

| Status | What it means | Where it is used |
|---|---|---|
| `COMPLETE_DRAFT` | The document is fully drafted **for human review** | Policies, charters, procedures, checklists |
| `PRELIMINARY_FRAMEWORK` | The structure is drafted; the content depends on a decision or a verification | Framework documents, registers not yet sourced |
| `TEMPLATE_NOT_EXECUTED` | A blank instrument. **Nothing has been executed** | Deeds, agreements, resolutions, mandates, registers |
| `BLOCKED` | Cannot be completed without an input that does not exist | `D21` (no constitutional documents exist to review) |
| `INFORMATIONAL` | Analysis, options, index or log | `GATE-0`, `DAR`, `LSR`, `D48`, `CHANGE_LOG`, this README |

**The two facts a reader must not lose:** **(1) no instrument in this pack has been executed, filed or
registered, and no register has been populated; and (2) the pack does not assert that any entity, trust,
share, office, asset or instrument exists** — because it found no evidence that any does.

**The first actions, in order:** instruct counsel with `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` (the four
unblocking questions first); decide the two open architecture questions (jurisdiction; "Sector LLC"); adopt
the family definition; and establish **what, if anything, actually exists today**. See
`IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` §5.

## 12. Lessons learned in assembling this pack

Recorded because they are the pack's most transferable output — they apply to any family or founder group
attempting the same work.

| # | Lesson | What it means in practice |
|---|---|---|
| 1 | **Legal-looking material is the most dangerous material in a repository.** | A demonstration dataset containing a "signed" IP assignment, a trademark registration number and a Madrid filing reads like fact, is rendered like fact, and is fiction. **Quarantine it, label it, and never let it into a register, a filing or a representation.** |
| 2 | **Most of the work is deciding, not drafting.** | Roughly half of the pack's content is decisions, thresholds and questions that only the family and its advisers can answer. A drafting exercise that avoids those decisions produces a beautiful document that cannot be used. |
| 3 | **The order of operations is: decide → draft → verify → execute → file → register.** | Everything in this pack sits at "draft". Attempting to execute first (or to file a structure that has not been decided) is how families end up unpicking a structure at cost. |
| 4 | **A family rule and a legal right are different things, and confusing them is expensive.** | A family constitution is largely unenforceable; a trust provision largely is. The pack therefore classifies every family clause by its real legal effect (`D11` §10) instead of pretending that a document makes it so. |
| 5 | **One document, one owner, one source of truth.** | Reserved matters appear in two places for a reason (the trust and the company) — but **the reporting schedule, the risk appetite, the report inventory, the authority-to-instruct table and the terminology each have exactly one home.** Duplication is how contradictions are born. |
| 6 | **Blank is not "unlimited".** | The fail-closed rule (blank threshold → highest approval; blank mandate limit → zero) prevents the single most common real-world abuse of a draft framework. |
| 7 | **Nobody is coming to check the paperwork until it matters.** | Banks, regulators, courts and counterparties all read documents at the worst possible moment. The annual governance review (`D75`) exists to read them before that. |
| 8 | **The Foundation is the hardest part.** | A family-founded nonprofit is structurally suspect; independence must be engineered through duties, conflicts, audit and public reporting — **not asserted in a recital**. |
| 9 | **A registry is not a signature, and a signature is not a right.** | A software record, a hash, a workflow approval or an AI output never creates legal effect (`DEFINED_TERMS.md` §2). The pack's strongest recurring rule. |
| 10 | **The most valuable deliverable is often the list of questions.** | `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` and the open-items tables are what convert a document pack into a programme of work. **A question asked once, in writing, to a qualified adviser is cheaper than any assumption.** |
| 11 | **Preserve the right to go to court.** | No policy in this pack removes a person's legal rights, and none may be used to pressure a person into giving one up. |
| 12 | **Do not let the pack become the structure.** | This pack describes a structure; it does not create one. **Anything that only exists in this folder does not exist.** |
