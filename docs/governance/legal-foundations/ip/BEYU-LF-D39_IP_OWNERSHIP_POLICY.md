# BEYU-LF-D39 — BEYU Group Intellectual Property Ownership and Stewardship Policy

Document ID: `BEYU-LF-D39`
Title: BEYU Group Intellectual Property Ownership and Stewardship Policy
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`COMPLETE_DRAFT`** — the policy is drafted. **It is not adopted. No IP has been identified,
assigned, registered, licensed, valued or enforced.**
Document owner: Group CTO function (proposed) with counsel
Approving authority (proposed): each board, and the Trustees for Trust-held IP
Next review date: Annually
Classification: `CONFIDENTIAL` (the IP registers are `HIGHLY_RESTRICTED`)
Related documents: `D40`–`D47`, `D51`, `D53`, `D54`, `D63`, `D67`, `D72`, `D74`
Depends on: `GATE-0` §7 (the fixture findings); counsel's IP answers (`Q-IP-01`–`Q-IP-04`)

> **⚠ THE SIX IP TRUTHS. Nothing in this pack changes any of them.**
> **1. Authorship is not ownership.** The person who writes the code, or draws the mark, or assembles the
> dataset does not automatically lose their rights — **unless and until the law or an instrument transfers
> them**.
> **2. Registration is not validity.** A certificate evidences a registration; it does not prove that the
> mark is valid, distinctive or enforceable.
> **3. Possession is not title.** Having the file, the repository, the server, the login or the deploy key is
> **not** ownership of what is in it.
> **4. Showing an asset in a register does not transfer it.** (`D40` §2.4.)
> **5. A signed assignment must actually comply with the formalities of the applicable law**, including any
> that cannot be waived (and moral rights may not be assignable in the way a draft assumes).
> **6. This pack has found no evidence that any IP asset is owned by any BEYU entity.** The IP register opens
> at **zero verified entries** (`GATE-0` §7).

---

## 1. The fixture hazard (read this before relying on anything in the repository)

The repository contains **fictional** IP "documents" in a sector demonstration dataset. They are **not
evidence**, and they must never be cited as fact:

| Fixture | What it claims | The truth |
|---|---|---|
| `DOC-IP-001` "Intellectual Property Assignment Agreement", status **"Signed"**, dated 2026-02-10, between "All 42 BEYU Engineers" and "BEYU Holding Co.", `onChain: true`, hash `0xdc66…` | That a valid, signed, irrevocable assignment of inventions, copyrights, **AI model weights**, datasets and trademarks exists | **Fiction.** No such agreement is evidenced. Additionally: an assignment purporting to be made by **"All 42 BEYU Engineers"** as a single collective party, executed "on-chain" through a smart contract, transfers nothing. **A blockchain record is not a signature, a deed or a valid assignment.** |
| `DOC-TM-001` "Trademark Registration — 'BEYU' (**TZ-2025-4421**)", "Granted 12 May 2025", "Renewal: every 10 years" | A granted Tanzanian registration in classes 9, 42 and 44 | **Fiction.** No registration is evidenced; the number is synthetic. The **renewal term is disputed across sources** (7 vs 10 years) and this pack **asserts no term** (`D40` §5.3; `LEGAL_SOURCES_REGISTER.md` `IP-3`). |
| `DOC-TM-002` "Beauty Health OS (**EAC regional filing**)" and a **"Madrid Protocol designating KE, UG, RW, ZA, NG (filed 2025-09-30, pending)"** | That a Madrid Protocol filing is possible for Tanzania | **Impossible as stated.** **Tanzania is not a member of the Madrid Protocol**, so a Tanzanian-origin Madrid filing cannot be made on that basis. ARIPO (Banjul Protocol) is **not domestically implemented**. Treat the whole record as fiction (`LEGAL_SOURCES_REGISTER.md` `IP-2`). |
| "Two cease-and-desist letters issued in 2025 (both resolved amicably)", "TRA-IP Bureau" watch service | That enforcement activity has occurred | **Fiction**, and note the authority is misnamed (the trade-mark registry function observed in the sources sits with **BRELA**, not TRA). |

**The rule (already applied by the audit):** these fixtures are **quarantined**. They may be discussed as
*examples of what a real record would look like*, and they must never be used to populate a register, to
support a valuation, to answer a due-diligence question, or to tell a counterparty, a bank or a regulator
that an asset is owned. **The IP inventory (`D40`) opens at zero confirmed entries.**

## 2. Principles

| # | Principle | Consequence |
|---|---|---|
| P-01 | **Title must be established, then recorded — never assumed** | Every asset needs a chain-of-title entry (`D40`) with its evidence |
| P-02 | **One asset, one owner** (per asset, per jurisdiction, per right-type) | Split ownership is recorded explicitly, not glossed |
| P-03 | **The owner is the legal entity, never "the group", never a project, never an OS** | "BEYU OS" is a product identity; it owns nothing |
| P-04 | **Ownership of a *product* is a bundle** — code, mark, design, data, documentation, know-how, domain — **each with its own title question** | Never treat "the app is ours" as one fact |
| P-05 | **Consideration matters** | An assignment without consideration may be unenforceable; record what was paid or given |
| P-06 | **Formalities matter** | Writing, signature, witnessing, notarisation, recordal against a registration — as the applicable law requires (`[COUNSEL TO CONFIRM]`) |
| P-07 | **A licence does not transfer title** | State expressly which of the exclusive rights are granted, and which are excluded |
| P-08 | **The Foundation's IP position is separate and purpose-locked** | `D51`, `D54`; a "free" licence between group and Foundation must still be documented and arm's-length-testable |
| P-09 | **AI does not own, and AI does not hold or transfer rights** | No AI signature, no AI authorship claim; **and note that the copyright/inventorship status of AI-assisted output is unsettled — do not assert protection** (`Q-IP-04`) |
| P-10 | **Registration is a means, not the end** | Register where it protects value and where the cost is justified; document why where it is not |

## 3. The intended ownership map (a proposal — currently **no evidenced owner**)

| Asset class | Intended owner (proposal) | Instrument that would create it | Status |
|---|---|---|---|
| Group and sector marks, tagline, logo | Holding company (Tanzanian marks: the Tanzanian entity) | Assignment; or first filing by the intended owner | **Not established** |
| Product software (source, object, architecture) | The entity that commissioned and paid for it | Contributor assignments (`D41`) + `D43` checklist | **Not established** |
| AI models, weights, prompts, pipelines | The entity that commissioned them; **subject to contributor and licence analysis** | Assignment + licence review | **Not established** (fixture claims are fiction) |
| Datasets and data products | **Carefully analysed** — data may not be ownable at all, and personal data is governed by `D70` | Contractual rights, database rights where they exist, licence terms | **Not established** |
| Designs, wireframes, illustrations | The commissioning entity | Assignment (with the contractor's moral-rights analysis) | **Not established** |
| Documentation, SOPs, manuals, training material | The entity | Assignment | **Not established** |
| Trade secrets (methods, code, formulas, pricing models) | The group entity that holds them **in fact — with real secrecy** | Secrecy measures + confidentiality + employment terms (`D15`) | **Not established** |
| Domains, DNS and digital assets | The operating entity that uses them | Registration in the entity's name; registrar account under entity control (`D47`) | **Not established** |
| Open-source components | **Nobody in the group owns them** | Licence compliance (`D45`) | Tracked, not owned |

**3.1 Cross-entity rule.** Where an asset is used by one entity and owned by another, the **use must be
licensed in writing** (`D42`), and where the two entities are related, the intra-group licence must be
commercially defensible (`D72`, `D53`). **Using another entity's IP without a licence — even inside the same
family — is a defect, not a convenience.**

**3.2 Trust-held IP rule.** If the Trust is to hold IP, three separate questions must be answered: (a) may the
Trustee hold it under the trust instrument and the applicable law; (b) who may grant licences and on what
terms (a Reserved Matter, `D04` §7); and (c) what happens on a distribution. **Until those are answered, no
IP is placed in the Trust.**

## 4. Stewardship duties

| # | Duty | What it means in practice |
|---|---|---|
| S-01 | **Know what you have** | The `D40` inventory is complete and current for each operating entity |
| S-02 | **Know who owns it** | Each asset has a chain-of-title entry with evidence |
| S-03 | **Keep it secret where secrecy is the protection** | Access control, NDAs, marked confidentiality, need-to-know; **a trade secret loses protection when it stops being secret** |
| S-04 | **Renew and maintain on time** | `D44` renewal triggers feed `D68`; **a missed renewal is an avoidable loss** |
| S-05 | **Record the licences you grant and the licences you take** | `D42`, `D45` |
| S-06 | **Protect, proportionately** | Enforcement is a business decision with a cost (§6) |
| S-07 | **Do not over-claim** | Never describe a pending application as granted, or a claim as a right |
| S-08 | **Do not create unintended conveyances** | No asset transfer without a decision, an instrument and a register update |
| S-09 | **Escalate** | Suspected infringement, copying, leakage, or a departing contributor with unassigned work |

## 5. Who decides what

| Decision | Authority |
|---|---|
| Adopting this policy | Each board; the Trustees for Trust matters |
| Creating title (taking an assignment) | The entity's board (`D27` F-15) |
| Filing a new application | The entity's board, on the CTO's recommendation — **costed** |
| Recording a licence | The entity's board; `D42` |
| Transferring IP out of an entity | **Board + shareholders' reserved-matter check (`D27`)** — an outbound transfer may need shareholder consent |
| IP as security | `D27` financing matters; counsel |
| Enforcement action (cease-and-desist, takedown, litigation) | `D46` escalation — **litigation authority is `D27`/`D71`** |
| Placing IP in the Trust, or distributing it | Trustees + counsel + the Reserved-Matters process (`D04` §7) |

## 6. Enforcement posture (summary; procedure in `D46`)

**The default posture is: document, preserve, escalate — not threaten.** Before any enforcement step: confirm
the asset's title and validity (a badly-founded cease-and-desist letter can be actionable itself); confirm
who owns the right; take advice where the counterparty is a partner, a client, an ex-employee, or a
government body; and **never let a brand ambassador, a social-media responder or an AI draft send a legal
demand.**

## 7. Controls and record-keeping

| # | Control |
|---|---|
| C-01 | The **IP inventory is the single source of asset truth** (`D40`) and is completed **before** any asset is described as owned |
| C-02 | The **asset register** (`D44`) is the renewal and verification layer feeding `D68` |
| C-03 | Every assignment/licence is filed in `D74`; the ownership change is recorded in `D67` where the asset is material |
| C-04 | **Source-code repository access is not ownership**; the repository's access list is a security control, not a title record |
| C-05 | Third-party components are inventoried (`D45`); **an unclean component is a live risk** |
| C-06 | AI output: no registration or assignment may describe AI as the author/inventor; and no protection claim is asserted for AI-generated material without advice |
| C-07 | Annual review: title, renewals, licences, gaps, and the open items in `D40` §7 |

## 8. Decisions required from the user / family / governing bodies

1. **Which entity is intended to own the group's IP** — and whether that is one entity or several.
2. Whether the **Trust** is to hold any IP (and if so, which).
3. Whether to fund **registrations** (and in which countries/classes) — a cost decision.
4. Whether the **Foundation** holds any IP of its own (and how it is licensed — `D54`).
5. Whether the group will license IP to third parties at all, and on what terms.
6. Who may speak publicly about the group's marks and products (`D47`).

## 9. Counsel review note — `[COUNSEL TO CONFIRM]`

1. **What creates title** by asset type and by law: copyright works, software, databases, designs, trade
   marks, trade secrets, know-how — and what formalities each requires (`Q-IP-01`).
2. Whether **employees'** work-product vests in the employer automatically or needs an assignment, and
   whether **contractors'** does (`Q-IP-01(a)`–`(d)`).
3. **Moral rights**: whether they can be waived, and how to draft the waiver.
4. The **term and renewal** rules for each registered right (`Q-IP-02`) — **note the unresolved trade-mark
   term (7 vs 10 years)**; do not rely on the fixture's "10 years".
5. Whether **AI-generated or AI-assisted** output can be protected at all, and who (if anyone) would own it
   (`Q-IP-01(e)`, `Q-IP-06`).
6. The **recordal** requirements to make an assignment effective against third parties and against a
   registration.
7. Whether a **licence** to or from the Foundation creates a private-benefit or tax problem (`D51`, `D52`).
8. The **cross-border** position where the owner and the user are in different jurisdictions, and any
   exchange-control or tax consequence (`Q-LEG-03`, `Q-TAX-03`).

**No IP asset is evidenced as owned. Nothing in this policy is in force. Adopting this policy transfers
nothing by itself.**
