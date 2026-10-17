# BEYU-LF — Defined Terms (controlled vocabulary)

Document ID: `BEYU-LF-REG-TERMS`
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Owner: Chief Governance Officer (proposed)
Applies to: **every document in this pack.** A term used in a pack document with a meaning different
from the one below is a defect; report it via `CROSS_DOCUMENT_CONSISTENCY_REPORT.md`.
Classification: `INTERNAL`

---

## 1. Rule of use

1. Capitalised terms in pack documents carry the meaning given here, unless a document defines a term
   locally for that document only (a local definition must be flagged as such).
2. Terms are **legal-form-neutral** wherever the underlying legal form is unresolved. For example this
   pack says **"the Holding Body"** when it means "whichever entity or body is established as the
   holding tier, if any".
3. A term in square brackets (`[TRUSTEE NAME]`) is a **placeholder**, not a definition.

---

## 2. The legal-effect ladder (the single most important convention in this pack)

Nothing in this pack is authority. Legal effect, where it can exist at all, comes from the following
instruments — in this order of superiority. **Each level can only be changed by something at that
level or above.**

| Rank | Instrument | Can it be created by software, a report, an AI output or a policy document? |
|---|---|---|
| 1 | **Applicable law** (statute, regulation, regulator requirement, court order) | **No.** |
| 2 | **A superior legal instrument** (a trust deed; the constitutional documents of a company; a court order; a regulator's licence condition) | **No** — requires the act that the law prescribes. |
| 3 | **A fiduciary duty** owed by a trustee, director, or nonprofit governor | **No** — arises from law/office. |
| 4 | **A signed contract** between identified parties (shareholders' agreement, service agreement, licence, employment contract) | **No** — requires signature by authorised persons. |
| 5 | **A company/family decision recorded by the correct body** (board resolution, shareholder resolution, class consent, trustee resolution, family resolution) | **No** — requires the body to exist, be competent, be quorate, and act. |
| 6 | **A ratified policy** adopted by an authorised body within its competence (a family policy; a group policy) | Only by the authorised body, within the instrument above it. |
| 7 | **An optional governance practice** (a convention, a charter adopted voluntarily, a reporting cadence) | Yes, but it binds no one legally. |
| 8 | **A software record / control-plane entry** (database row, RBAC grant, workflow state, audit entry, AI output) | Yes — **and it creates no legal right, title, authority or liability whatsoever.** |

> **The BEYU rule:** the **digital governance boundary must align with real legal entities, their
> authority, and their permissions** — but it never *creates* them. Software access, RBAC/ABAC, tenant
> configuration, audit logs, URLs, workflows and AI-generated approvals do **not** independently create
> legal ownership or legal authority.

---

## 3. Entity and structure terms

| Term | Definition in this pack | Status |
|---|---|---|
| **BEYU OS** | The constitutional control plane, enterprise operating kernel and governed intelligence layer of the BEYU ecosystem. A **software and governance system**, not a legal entity. | Established architectural decision (`DAA-ARCH-003`). |
| **Sector OS** | One of **exactly four** operating systems: `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`. | Established (`DAA-ARCH-004`). |
| **BEYU Family Trust** / **the Trust** | The intended first tier: a trust for the multigenerational benefit of the family. **Not evidenced as legally constituted.** | `PROPOSED` + `NOT_DONE` (`DAA-ARCH-001`). |
| **the Holding Body** | The intended second tier. Called "BEYU Holding Company" in prose; treated as a **neutral placeholder** because no company is evidenced and the intended jurisdiction is unresolved. | `PROPOSED` + `NOT_DONE`. |
| **Country Holding Company** | An intended intermediate company per country. | `PROPOSED`. |
| **Sector Operating Company** | The intended operating entity per sector. **This pack does not use the term "Sector LLC"** as a defined term: the repository contains no `SECTOR_LLC` entity type, and no legal form for "LLC" in Tanzania is asserted. | `PROPOSED`; conflict logged (`DAA-ARCH-005`). |
| **BEYU Foundation** / **the Foundation** | A **separately governed nonprofit sister organisation**. Never a Sector OS, never automatically a subsidiary of the Holding Body. Legal form unresolved. | Established as a boundary (`DAA-ARCH-007`); form `OPEN` (`DAA-FDN-001`). |
| **BEYU Family Office** / **the Family Office** | A **shared family wealth-administration and governance capability** (`SHARED_FAMILY_OFFICE`). **Not** an OS, **not** automatically a company, **not** an asset owner. | Established (`DAA-ARCH-008`). |
| **NOELIA_AI** / **Noelia** | The governed BEYU AI identity/interface. **Never** a trustee, director, shareholder, legal authority, or substitute for an authorised human decision. | Established (`DAA-ARCH-009`). |
| **Group** | The set of entities within the intended structure, taken together. The term is used for convenience and **does not imply** that any of them exists, or that one controls another in law. | — |
| **Related party** | (a) a family member; (b) a trustee, director, officer or senior employee of any Group body; (c) an entity controlled by any of them; (d) the Foundation in relation to any Group body; (e) the Family Office in relation to any Group body. | Proposed definition; per-regime definitions may be wider — `[COUNSEL TO CONFIRM]`. |

## 4. Family terms

| Term | Definition in this pack | Status |
|---|---|---|
| **Family** | The persons within the **`[BENEFICIARY CLASS]` / `[FAMILY DEFINITION TO BE ADOPTED]`**. **This pack defines no family.** Which descent/adoption/marriage/capacity relationships carry legal effect is an **unratified** decision (`FIR-003`, `DAA-FAM-003`). | `AWAITING_INPUT`. |
| **Founder** | `[FOUNDER NAME]`. **No identity is asserted.** | `AWAITING_INPUT`. |
| **Settlor** | `[SETTLOR NAME]` — the person who settles property on the Trust. | `AWAITING_INPUT`. |
| **Family Assembly** | The general meeting of the Family for family-governance purposes. | `PROPOSED`. |
| **Family Council** | The elected/appointed body that carries family governance between Family Assemblies. **Not** a trustee, board, protector or financial approver by virtue of being a Family Council. | `PROPOSED`. |
| **Family Constitution** | The written statement of family purpose, values, rights, obligations and governance. **A moral/contractual instrument, not a statute, trust instrument or court order.** Only clauses embedded in a superior instrument or a signed contract bind in law. | `PROPOSED`. |
| **Family Office Principal** | The accountable human role leading the Family Office. **A role, not a legal office.** | `PROPOSED`. |

## 5. Governance and authority terms

| Term | Definition in this pack |
|---|---|
| **Trustee** | A person or body corporate holding Trust assets in a fiduciary capacity. Must act personally; may not delegate fiduciary judgement unless the instrument permits it. |
| **Protector** | A person appointed under the Trust instrument to monitor and (if given) consent to or veto trustee acts. Not a trustee. Maximum lawful scope `[COUNSEL TO CONFIRM]`. |
| **Reserved matter** | A decision that a superior body reserves to itself and that a subordinate body may not take, or may take only with approval. Recorded in the single matrix at `holding/BEYU-LF-D27…`. |
| **Delegation** | A revocable, scoped, time-limited conferral of **authority to act** within limits, by a body competent to delegate. **Delegation never transfers fiduciary duty or statutory office.** |
| **Authority** | The lawful power to make a decision or take an act. **Distinct from capacity, from permission, and from access.** |
| **Permission** | A software access right in the control plane. **Creates no authority.** |
| **Quorum** | The minimum number of competent, non-recused members required for a body to transact. |
| **Recusal** | A person's withdrawal from deliberation/decision on a matter in which they have a conflict. |
| **Conflict of interest** | Any interest, relationship or duty that could improperly influence judgement. Must be disclosed; disclosure is a precondition to participation, not a substitute for recusal. |
| **Related-party transaction** | Any transaction between the Group and a related party (see §3). Recorded in `registers/BEYU-LF-D72…`. |
| **Reserved-matters matrix** | The single authoritative table of who decides what (see `D27`). If two documents appear to give different authorities, the matrix plus the superior instrument govern, and the conflict is logged. |
| **Emergency authority** | Time-boxed authority to act in a defined crisis. **Cannot** permanently displace governance, amend an instrument, or ratify itself. |
| **Ratification** | A competent body's formal adoption of a decision, under the correct instrument. **Software cannot ratify. A DRAFT, a recommendation, a TABLED resolution or an AI output is not ratification.** |

## 6. Capital and share terms

| Term | Definition in this pack |
|---|---|
| **Class A Share** | The proposed class carrying **one vote per share**. A **proposal**, not an existing class. |
| **Class B Share** | The proposed class carrying **`[1,000]` votes per share**. A **proposal**, not an existing class. The number is a proposed commercial intention and **must not** be described as lawful or valid until counsel advises. |
| **Economic rights** | Rights to dividends and to surplus on winding up. The proposal states these are **equal per share across classes**. |
| **Voting rights** | Rights to vote at general meetings. |
| **Board appointment right** | A right to appoint/remove a director. **Distinct from a voting right.** |
| **Veto / class consent** | A right of a class (or a holder) to block a defined action. **Distinct from a voting right and from a board appointment right.** |
| **Permitted transfer** | A transfer expressly allowed despite transfer restrictions (e.g. to a family trust, on death, to a wholly-owned group entity). |
| **Automatic conversion** | A pre-agreed conversion of one class into another on a defined event. Proposed; validity `[COUNSEL TO CONFIRM]`. |
| **Dilution** | Reduction of a holder's proportionate interest by new issuance. **A scenario in the control plane is a simulation, never an executed event.** |
| **Cap table** | The authoritative record of issued shares and holders. **No verified cap table exists**; the control plane holds empty (or synthetic) structures. |
| **Beneficial owner** | As defined by the **applicable regime** — deliberately **not** defined by this pack, because the Companies Act (as amended by the Finance Act 2020) and the Income Tax Act each contain their own definition. In any register, state **which** definition is being applied. |

## 7. Asset, custody and money terms

| Term | Definition in this pack |
|---|---|
| **Custody** | Physical/legal possession and safekeeping, whether or not accompanied by ownership. |
| **Legal owner** | The person or body in whom title is vested. |
| **Registered owner** | The person recorded in a public register (share register, land register, trade-mark register). **May differ from the beneficial owner.** |
| **Source of truth** | The single authoritative record for a data element. For **all money and accounting**, the source of truth is **Finance OS** (the sole accounting authority); a trust or family-office record holds **references only**. |
| **Distribution** | A payment or transfer of value from the Trust to a beneficiary. Requires a trustee decision, a lawful power, and Finance OS accounting. **Never** a software-authorised event. |
| **Grant (Foundation)** | A charitable payment by the Foundation to a recipient. Directionally **outward**; requires purpose alignment and cannot be a disguised private benefit. |
| **Contingent protection** | Insurance cover or a benefit that may or may not become payable (e.g. death benefit). **Never** summed into wealth or reported as an asset. |
| **Shadow ledger** | Any record of balances, postings, or account truth maintained outside Finance OS. **Prohibited** throughout this pack (`FIR-018`). |

## 8. Compliance and process terms

| Term | Definition in this pack |
|---|---|
| **Verification status** | One of `VERIFIED_PRIMARY`, `VERIFIED_SECONDARY`, `REQUIRES VERIFICATION` (`README.md` §3.3). |
| **Placeholder** | A bracketed token standing for information that has **not** been supplied. Never to be filled by guesswork. |
| **Blocked document** | A document that cannot be completed as drafted because a named input, decision or professional review is missing. A blocked document **states its blocker and the action that resolves it**. |
| **Unratified decision** | A decision recorded in the repository's registers as `PENDING`, `UNRESOLVED`, `REQUIRES LEGAL/POLICY RATIFICATION`, or `BLOCKING` — including `FIR-001`…`FIR-027` and accounting decisions `C-1`…`C-5`, `P1`…`P11`. **This pack must not answer or pre-empt any of them.** |
| **Fail-closed** | The control-plane principle that the absence of authority/evidence produces **denial**, never a fabricated approval. Applied in this pack by refusing to fill a gap. |
| **`[COUNSEL TO CONFIRM]`** | The pack's standard marker for a proposition that a qualified professional must verify before reliance. |
| **Gate** | A stage in `IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` (`GATE 0`…`GATE 7`) with defined entry criteria, evidence and completion criteria. |

## 9. Prohibited usages in this pack

The following are **drafting defects**. If present, they are logged in the consistency report:

| Prohibited phrasing | Why | Correct phrasing |
|---|---|---|
| "The Trustee has been appointed…" | Implies a completed act. | "The Trustee will be appointed by `[INSTRUMENT]`…" |
| "The company owns the IP…" | Asserts title with no evidence. | "Title is **claimed** by `[ENTITY]` subject to chain-of-title verification (see `D40`)." |
| "Class B shares carry 1,000 votes." | States a proposal as fact. | "The **proposal** is that Class B shares carry 1,000 votes, subject to counsel's advice and adoption in the constitutional documents." |
| "The Family Constitution binds all family members." | False without an embedding instrument. | "The Family Constitution is binding in law only to the extent a clause is embedded in a superior instrument or a signed contract (see `D11` §Enforceability map)." |
| "NOELIA approved…" | Breaches `FIR-017`. | "NOELIA produced an **advisory assessment**; the decision was made by `[HUMAN ROLE]`." |
| "Registered under Cap. 318." | Asserts a registration not evidenced. | "**Intended** to be registered under `[ROUTE]`, subject to counsel (see `D01`)." |
| Any statement of fee, rate, threshold, deadline or percentage not sourced. | Fabrication risk. | Cite `LEGAL_SOURCES_REGISTER` with verification status, or use `[COUNSEL TO CONFIRM]`. |

## 10. Cross-reference to the pack's own Status vocabulary

See `README.md` §3 for document status (`COMPLETE_DRAFT`, `PRELIMINARY_FRAMEWORK`,
`TEMPLATE_NOT_EXECUTED`, `BLOCKED`, `INFORMATIONAL`), fact classification (A–F), and source
verification status. Those three vocabularies, plus this glossary, are the whole controlled language
of the pack.
