# BEYU-LF-D43 — Software Development, Commissioning, Contractor, Employment and Contribution Agreement Checklist

Document ID: `BEYU-LF-D43`
Title: Software Development, Commissioning, Contractor, Employment and Contribution Agreement Checklist
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`COMPLETE_DRAFT`** — the checklist is complete. **It has not been applied to any engagement. No
agreement has been reviewed, amended or executed.**
Document owner: Group CTO function (proposed) with HR and counsel
Approving authority (proposed): each board; counsel for the form
Next review date: Annually, and on any change in the development model (in-house, offshore, agency, AI)
Classification: `CONFIDENTIAL`
Related documents: `D15` §4–§6, `D39`, `D40`, `D41`, `D42`, `D45`, `D47`, `D70`, `D71`, `D74`
Depends on: employment law (**not researched — `[COUNSEL TO CONFIRM]`**); `Q-IP-01`, `Q-IP-04`

> **⚠ THE ONE-PARAGRAPH PROBLEM.**
> Almost every "we own our software" failure in a small group has the same shape: **someone contributed code,
> design, content, data or a model, under no written terms, and the group never obtained the rights.** It is
> discovered during due diligence, a financing, a sale, a dispute or an exit — **by which time the
> contributor may be gone, hostile, or simply unable to be found.**
> **This checklist exists to apply the rule: NO CONTRIBUTION WITHOUT TERMS.**

---

## 1. Who is a "contributor"? (the list that catches people out)

| # | Contributor type | Typically missed? | The instrument needed |
|---|---|---|---|
| 1 | Employee (permanent, probationary, part-time) | Employment terms often omit IP | Employment contract + IP clause (+ assignment where required) |
| 2 | **Intern, trainee, student, apprentice** | **Very often missed** | Written terms + assignment |
| 3 | **Contractor / freelancer (including ex-employees)** | Often informal | Services agreement + assignment (`D41`) |
| 4 | **Agency / outsourcing firm / offshore team** | Often missed — the agency's terms may reserve its own IP | Master services agreement with **express assignment/vesting** + named personnel |
| 5 | **Founder (before or after incorporation)** | Frequently missed | Founder assignment; founder agreement |
| 6 | **Family member or friend "helping"** | Frequently missed and awkward | Treat exactly as a third party — **the family relationship is not a licence** |
| 7 | **Volunteer / community contributor** | Missed | Contribution terms (`D43` §5) |
| 8 | **Open-source upstream author** | n/a — the licence governs | `D45` |
| 9 | **Designer / illustrator / photographer / copywriter** | Sometimes missed | Commissioning agreement + assignment (with moral-rights handling) |
| 10 | **Data provider / dataset licensor** | Missed | Data licence + data-protection terms (`D70`) |
| 11 | **AI model or tool used in development** | **Almost always missed** | Licence/terms review of the model or tool (`D45` §2.2) |
| 12 | **Cloud, PaaS, API and third-party service provider** | Sometimes missed — terms shift rights | Terms review; **note that some vendors claim rights over inputs/outputs** |
| 13 | **Adviser or consultant who writes anything** | Missed | `D36` engagement letter + IP term |
| 14 | **The Trust, Foundation or Family Office, if any person from those bodies contributes** | Missed | Clarity: which entity is the contributor, and who owns the output |

## 2. The checklist (apply to each engagement before work starts)

### A. Identification

| # | Item | ✔ |
|---|---|---|
| A-1 | The **legal entity** commissioning the work is named (not "the group", not "BEYU OS", not a project) | ☐ |
| A-2 | The **contributor** is correctly identified (person or entity; if a person, their identity documents) | ☐ |
| A-3 | The **relationship** is correctly characterised (employment / services / agency / other) | ☐ |
| A-4 | Any **sub-contractor the contributor may use** is identified, and the flow-down obligation is stated | ☐ |
| A-5 | The engagement's **deliverables** are described precisely | ☐ |

### B. Intellectual property

| # | Item | ✔ |
|---|---|---|
| B-1 | There is an **express written assignment or vesting clause** in favour of the commissioning entity — **not a generic reference to "the group's IP"** | ☐ |
| B-2 | The clause covers **everything that will be produced**: source and object code, architecture, tests, scripts, infrastructure-as-code, **AI models/weights/prompts**, datasets, designs, artwork, copy, documentation, and **the repository and its history** | ☐ |
| B-3 | The clause covers **future and as-yet-unidentified works** (with the present-assignment-plus-further-assurances structure) | ☐ |
| B-4 | **Moral rights** are addressed to the extent the law permits, and the contributor consents to modification/attribution practice | ☐ |
| B-5 | **Consideration** is stated | ☐ |
| B-6 | **Pre-existing materials** of the contributor are listed (Schedule A), and the contributor **licenses them in** where they will be used | ☐ |
| B-7 | **The further-assurances and recordal** obligations are present | ☐ |
| B-8 | The **warranties** are present: ownership; no prior assignment; no encumbrance; no infringement | ☐ |
| B-9 | **Third-party and open-source** material must be disclosed **before** incorporation into the product | ☐ |
| B-10 | The **employer's/commissioner's right to register** the work (copyright, mark, design, patent) is stated | ☐ |
| B-11 | **The assignment survives termination** of the engagement | ☐ |
| B-12 | **AI-use disclosure**: the contributor must disclose any generative-AI tools used in the deliverables, and the **licence terms and rights status** of the output (a real due-diligence question now) | ☐ |

### C. Confidentiality and security

| # | Item | ✔ |
|---|---|---|
| C-1 | Confidentiality obligations defined, **including after termination** | ☐ |
| C-2 | **Trade secrets** identified and the handling rules stated | ☐ |
| C-3 | **Access is granted on a named basis** and revoked on exit; **no shared credentials** | ☐ |
| C-4 | The contributor must not use the group's code/data in other work, or in a personal project, or to train a personal model | ☐ |
| C-5 | **Return/deletion of materials** on exit, with a **certificate of no retention** (including local copies, repositories, cloud drives, model fine-tunes and backups) | ☐ |
| C-6 | The contributor's **own devices and tools** are governed (a device/security annex) | ☐ |

### D. Data protection

| # | Item | ✔ |
|---|---|---|
| D-1 | Whether the contributor will access **personal data**, and on what lawful basis (`D70`) | ☐ |
| D-2 | A **processing agreement** where the contributor is a processor | ☐ |
| D-3 | **Cross-border transfer**: where the contributor or their tooling is outside the jurisdiction, the transfer position is documented (`Q-DP-02`) | ☐ |
| D-4 | **No personal data in an unapproved AI tool** | ☐ |
| D-5 | Any **dataset** supplied or created: its source, its lawful basis, its licence terms | ☐ |

### E. Commercial and operational

| # | Item | ✔ |
|---|---|---|
| E-1 | Fees, invoicing, expenses and the **payment chain** (`D35` §3) | ☐ |
| E-2 | **Related-party status** disclosed, and the `D72` process applied where relevant | ☐ |
| E-3 | The contributor's **conflicts of interest** disclosed (other clients, competing products) | ☐ |
| E-4 | **Non-solicitation / non-compete** only where lawful and necessary (`[COUNSEL TO CONFIRM]` — often unenforceable, and an over-broad clause can damage the group's position) | ☐ |
| E-5 | **Acceptance criteria** stated for deliverables | ☐ |
| E-6 | **Warranty period and remedy** for defective work | ☐ |
| E-7 | **Insurance** position (professional indemnity, where material) | ☐ |
| E-8 | What happens on **termination mid-delivery**: who keeps the work-in-progress, and on what terms | ☐ |
| E-9 | **Governing law, forum and formalities** (`Q-R-02`) | ☐ |

### F. Corporate and authority

| # | Item | ✔ |
|---|---|---|
| F-1 | The **signatory has authority** under `D27`, and any threshold approval was obtained (`D73`) | ☐ |
| F-2 | The engagement **value** is within the approver's limit — **no splitting to avoid approval** | ☐ |
| F-3 | The **original** is filed in `D74`; the **contributor and the instrument are recorded in `D40`** (chain of title) | ☐ |
| F-4 | Any **security/goods/services** registration or filing is diarised (`D68`) | ☐ |

## 3. Commissioning software from a third party (the specific traps)

| # | Trap | The control |
|---|---|---|
| 1 | The supplier's **standard terms** reserve ownership of the deliverable, or of reusable components | Mark up the terms; require the assignment; or accept a **broad, perpetual, irrevocable, transferable, sublicensable licence** — and record the choice |
| 2 | The supplier **reuses its own framework** — a licence is adequate, an assignment may not be available | Identify the "background IP" in a schedule and license it |
| 3 | The supplier uses **subcontractors or offshore teams** without flow-down | Contractual flow-down + disclosure of named personnel |
| 4 | **Escrow** is absent, and the supplier fails | Consider source-code escrow for critical systems |
| 5 | The supplier **disappears** with the repository, the domain, or the credentials | Entity-owned repositories, **entity-owned cloud accounts**, and admin access held by the entity (`D35` §2) |
| 6 | **Open-source contamination** arrives through the supplier | `D45` scanning obligation in the contract; SBOM delivery |
| 7 | **AI-generated material** arrives from the supplier with unclear rights | Disclosure obligation + a warranty + an indemnity where obtainable |

## 4. Employment-specific items (`[COUNSEL TO CONFIRM]` — employment law **not researched**)

**4.1** Whether work-product vests in the employer automatically, or by assignment, and the drafting needed.
**4.2** Whether a contractual **IP clause** is enforceable, and how it must be brought to the employee's
attention.
**4.3** Whether the employer may require an employee's **prior inventions** to be listed and excluded.
**4.4** **Inventor compensation** or statutory employee-inventor rights, where they exist.
**4.5** Whether the exit process requires a **separate confirmatory assignment** or a certificate.
**4.6** Whether **garden-leave, notice periods and restrictions** affect the security of the group's rights
and access.

## 5. Contribution terms for community or volunteer contributors

Where the group accepts contributions from outside (open-source repositories, hackathons, community work),
one of the following must be in place **before** the contribution is merged:

| Option | Instrument | Consequence |
|---|---|---|
| **1** | A signed **contributor assignment** (`D41`) | The group owns the contribution |
| **2** | A **contributor licence agreement** (a broad, perpetual, irrevocable licence to the group, with a patent grant) | The group may use it; the contributor retains ownership |
| **3** | **No contribution accepted** | The safest option where neither is achievable |

**5.1** A contribution with **no terms** is default-problematic. **A pull request is not a licence, and a
public repository with no licence is not permission to use** — the pack's position is that **unlicensed
contribution is not accepted into a product** (`D45` §2.2).

## 6. Application record

| # | Engagement | Contributor type | Instrument | IP clause present? | Assignment executed? | Filed (`D74`)? | Recorded in `D40`? | Review date |
|---|---|---|---|---|---|---|---|---|
| — | **No engagement has been reviewed. This record is empty.** | — | — | — | — | — | — | — |

## 7. Decisions required

1. Who may **approve** a development engagement, and up to what value (`D27`).
2. Whether external development is permitted at all, and subject to what controls.
3. The **default instrument** for each contributor type.
4. Whether the group will accept **community contributions**, and on which of the three options in §5.
5. Whether **source-code escrow** is required for critical systems.
6. Who **owns the repositories and cloud accounts** (the entity, always — with two-person admin control).

## 8. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **employment-law** position on work-product and the drafting required (`Q-IP-01(a)`–`(d)`).
2. Whether the group's **current** employment and contractor terms are adequate (`Q-IP-04`) — **and, if the pack's
   finding holds, that no real agreement has been inspected, the review itself is the open item.**
3. Whether **non-compete and non-solicitation** clauses are enforceable, and their permissible scope.
4. The **flow-down** obligations where a supplier uses subcontractors.
5. Whether a **moral-rights consent** is effective for designers and photographers.
6. **AI-assisted work**: disclosure duties, rights status, and whether a warranty is obtainable from a
   supplier.
7. The **cross-border** position for offshore development (tax, permanent establishment, data protection).
8. Whether any engagement creates an **employment relationship in substance** despite being documented as
   services (`D15`, `Q-LEG-03`).

**This checklist has not been applied to any engagement, and no agreement has been reviewed. The group's
current chain of title is unverified (`D40`).**
