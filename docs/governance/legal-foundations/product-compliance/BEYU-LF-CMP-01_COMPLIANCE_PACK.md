# BEYU-LF-CMP-01 — Compliance Pack (Obligations Register and Control Trackers)

Document ID: `BEYU-LF-CMP-01`
Title: Compliance Pack — obligations register, entity/registration, tax, beneficial ownership, employment, data
protection, IP renewals, contracts, permits, incidents, complaints, retention, training, resolutions,
related-party, conflicts and evidence rules
Version: 1.0 (draft) · Date 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — **the obligations register is substantially EMPTY. No obligation has been
verified against a current authoritative source in this document. NOTHING IN THIS DOCUMENT ESTABLISHES
COMPLIANCE.**
Owner (proposed): Company Secretary function and the DPO, reporting to the Audit and Risk Committee · Approving
authority (proposed): the board
Next review date: **Quarterly**, and on every law change, entity change, filing and incident
Classification: `CONFIDENTIAL`
Related: **`D63`–`D75` (13 registers — cross-referenced, NOT restated)**, `D70` (PDPA checklist), `D55`
(Foundation), `D68`, `D69`, `D71`, `D72`, `D65`, `D74`, `PRIV-01`, `PRIV-02`, `EMP-01`–`EMP-04`, `TOS-01`,
`IP-TM-01`, `INC-01`, `CAP-01`
Depends on: **verified sources for every obligation** (`LEGAL_SOURCES_REGISTER.md` records what has been
verified and what has NOT); the entity structure (`INC-01`); counsel and the accountant

> **⚠⚠ WHAT THIS DOCUMENT IS — AND THE ONE THING IT IS NOT.**
> **It is a control framework**: the place where the group records **every obligation it believes it has**, who
> owns it, what evidence proves it, and who reviews it. **It is the document that turns a list of laws into an
> operating discipline.**
> **IT IS NOT A COMPLIANCE CLAIM.** **Task-completion is not compliance, and a register entry is not
> compliance.** The group has **no verified entity, no registration, no licence, no filing and no permit**
> (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md`; `INC-01`). **Nothing here may be described as "compliant",
> "audited", "certified" or "verified" until the evidence column holds a real document.**
> **And: the 13 registers (`D63`–`D75`) already exist and already hold the templates.** This document
> **cross-references them and adds the trackers the brief names** — it does **not** duplicate them, and where
> this document and a register conflict, **the register governs** (`MASTER_DOCUMENT_REGISTER.md`).

---

## 1. The obligations register (the core table)

**Every obligation is recorded with these fields. An obligation without a source is not an obligation — it is
an assumption.**

| # | Field | The rule |
|---|---|---|
| 1.1 | **Obligation** | Stated as one verifiable act ("file X by Y"), not as a theme ("be compliant") |
| 1.2 | **Source / authority** | The **instrument** (statute, regulation, contract, licence, standard). **A secondary summary may never be the source** (`README` §3.3) |
| 1.3 | **Provision** | The section/regulation/article — **only if verified**; otherwise `UNVERIFIED` |
| 1.4 | **Applicability** | Which entity, which activity, which jurisdiction, which threshold |
| 1.5 | **Owner** | A **named role** (not "the team"); the role is accountable even if the task is delegated |
| 1.6 | **Deadline / periodicity** | From the instrument; **`UNVERIFIED` where the period is not verified** (`IP-TM-01` §2.4 is the model) |
| 1.7 | **Evidence** | The document that proves the obligation was met; its location (`D74`) |
| 1.8 | **Status** | Per §2 — **never `COMPLIANT` without evidence** |
| 1.9 | **Reviewer** | Who checks the owner's work (segregation of duties — the owner does not self-certify) |
| 1.10 | **Last reviewed / next review** | The review is a record, not an intention |
| 1.11 | **Risk if missed** | Penalty/ consequence **only where verified**; otherwise "unknown — counsel to assess" |
| 1.12 | **Cross-reference** | The register/document where the detail lives |

### 1.1 The register (blank by design — populated only from verified sources)

| ID | Obligation | Source | Provision | Applies to | Owner | Period | Evidence | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|---|
| `OBL-000` | *[the register opens empty. Fourteen obligation families are indexed in §3–§16; nothing is populated until verified.]* | | | | | | | `UNPOPULATED` | |

**1.2 Why it opens empty.** Because a fabricated obligations register is one of the most dangerous artefacts
this pack could produce: **it looks like diligence, it lists deadlines that nobody derived, and it will be
relied on.** **The register is populated from the sources recorded in `LEGAL_SOURCES_REGISTER.md` — and only
those.**

## 2. Status vocabulary (use exactly these; never improvise)

| Status | Meaning | Evidence required |
|---|---|---|
| `UNPOPULATED` | The field or the row has not been completed | — |
| `UNVERIFIED` | An obligation is believed to exist, but the instrument has not been checked | The lead only |
| `VERIFIED_OBLIGATION` | The instrument has been read, the provision recorded, and the retrieval logged | The source record (`LEGAL_SOURCES_REGISTER.md`) |
| `NOT_APPLICABLE` | The obligation does not apply, **with the reason recorded** | The reason |
| `IN_PROGRESS` | Steps taken; **not yet met** | The step records |
| `MET_PENDING_EVIDENCE` | Claimed as done, **evidence not yet filed** | **Treated as not met for reporting** |
| `MET_WITH_EVIDENCE` | Done, **and the evidence is filed** | The document, with a `D74` reference |
| `OVERDUE` | The deadline passed | The deadline source |
| `LAPSED` / `FAILED` | Not done, and the consequence is being managed | The incident/finding record (`D71`) |
| `CLOSED_WITH_FINDING` | A failure occurred and was closed with a recorded finding | The finding |

**2.1 The two prohibitions.** **(a) `COMPLIANT` is not a status in this pack** — it is a conclusion that only a
review, an audit or a regulator can reach, and the pack does not award it to itself. **(b) `MET_PENDING_EVIDENCE`
is never reported as done.**

## 3. Entity, registration and corporate obligations

| # | Tracker | Detail lives in | What must be recorded |
|---|---|---|---|
| 3.1 | **Entity register** — every entity, its jurisdiction, form, certificate reference, registered office, officers and status | `D63` | **Certificate reference only if inspected** |
| 3.2 | **Registration obligations** — formation, annual returns, confirmation statements, change notifications, registers kept at the registered office | `D66`, `D68` | The instrument, the period, the form, the evidence |
| 3.3 | **Constitutional documents** — the filed version, and every amendment | `D74` | `D21` **remains `BLOCKED`** |
| 3.4 | **Statutory registers** — members, directors, secretaries, charges, beneficial owners | `D64`, `D65`, `D66` | Who maintains them, where they are kept, the last reconciliation |
| 3.5 | **Officer appointments and cessations** — with the filings | `D68` | Including a **trustee's appointment/removal** where the trust is incorporated (`D02` §16.14) |
| 3.6 | **Company secretary function** — who performs it, the delegations | `D27`, `D73` | The appointment, the authority |
| 3.7 | **Charges and security interests** — registration, release, and the register of charges | `D66` | Including an IP security interest (`IP-EV-01` §2.7) |
| 3.8 | **Related-party and conflicts** | `D72`, `D14` | See §14–§15 |
| 3.9 | **Cross-border corporate steps** — any foreign registration or branch registration | `D68` | `ss.433–434`-type foreign-company obligations are **recorded, not assumed** (`LEGAL_SOURCES_REGISTER.md` `CO-3` — secondary) |

## 4. Tax obligations (recorded; **the content requires the accountant and counsel**)

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 4.1 | **Registration** — tax identification, VAT and any other registration, with thresholds | `D68`, `D69` | **No rate, threshold or exemption may be entered from memory** |
| 4.2 | **Periodic returns and their periods** | `D68` | Periods **only from the instrument**; the pack's tax sources are partial (`LEGAL_SOURCES_REGISTER.md` `TAX-1`…`TAX-3`) |
| 4.3 | **Payroll taxes and statutory contributions** — and the employer registrations | `D69`, `EMP-01` §8 | `[COUNSEL/ACCOUNTANT TO CONFIRM]` |
| 4.4 | **Withholding taxes** — on payments to contractors, landlords, non-residents, and on share-based payments | `D69` | `Q-TAX-03` |
| 4.5 | **Capital gains and the payment period on a disposal** | `D69` | The pack verified that a CGT provision and a **30-day payment** obligation exist for a relevant disposal — **the application to a specific transaction is `[COUNSEL/ACCOUNTANT TO CONFIRM]`** |
| 4.6 | **Trust taxation** — the position of the trust and of distributions | `D69`, `D02` §10 | The pack verified that a **trust-taxation provision exists**; **its content and its application are `[COUNSEL/ACCOUNTANT TO CONFIRM]`** |
| 4.7 | **Transfer pricing / related-party transactions** | `D72` | `[COUNSEL/ACCOUNTANT TO CONFIRM]` |
| 4.8 | **Tax on the Foundation / nonprofit** — and the exemption conditions | `D55`, `D69` | **No exemption may be claimed**; the regime was **not** researched |
| 4.9 | **Tax on equity events** (issue, vesting, exercise, repurchase) | `ESOP-01` §6, `CX-01` §4.8 | `Q-TAX-03` |
| 4.10 | **Records retention** for tax | `D69`, `PRIV-02` §6 | `[COUNSEL/ACCOUNTANT TO CONFIRM]` |

**4.11 The prohibition.** **No rate, threshold, deadline, penalty or exemption may be inserted into this pack
from memory, from a summary or from another jurisdiction.** Where the figure is not verified, the entry is
`UNVERIFIED` and the row states what must be obtained — **from the instrument itself, by the accountant or
counsel.**

## 5. Licences, permits and sector obligations

| # | Tracker | Note |
|---|---|---|
| 5.1 | **Licences and permits** — what the group holds, who issued it, its number, its validity, its conditions and its renewal | `D68`, `D74` | **The register opens empty. The group holds no verified licence** (`Q-LEG-04`) |
| 5.2 | **Sector regulator obligations** — reporting, inspections, fit-and-proper requirements, complaints handling, professional registration | `D68` | **Health, finance, agriculture and construction each have their own regimes — NONE has been researched in this pack** |
| 5.3 | **Product and device rules** — whether the group's product is regulated as a medical device, a financial product or otherwise | `TOS-01` §18 | `[COUNSEL TO CONFIRM]` |
| 5.4 | **Advertising and claims** — what the group may say about its product and services | `TOS-01` §4, `FIN-01` §3 | **The same prohibition as the deck: no unverified claim** |
| 5.5 | **Import/export, customs and standards** — where the group ships goods | `D68` | `[COUNSEL TO CONFIRM]` |
| 5.6 | **Professional registrations** of individuals whose practice requires one | `EMP-03` §3.2 | Verified per person, with the renewal tracked |
| 5.7 | **Any claim of licensure in marketing, on the website or in the app** | `TOS-01`, `FIN-01` | **Prohibited until the licence exists and its number is verified** |

## 6. Beneficial ownership and transparency

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 6.1 | **Beneficial ownership analysis** — the natural persons who ultimately own or control each entity | `D65` | The pack's sources record that a beneficial-ownership framework exists, with **substantial-control concepts and forms** (`LEGAL_SOURCES_REGISTER.md` `CO-2`/`CO-3`) |
| 6.2 | **The register of beneficial owners** and its maintenance | `D65` | Who is a beneficial owner, and the evidence |
| 6.3 | **Filing obligations and periods** | `D68` | **Periods only from the instrument** — `[COUNSEL TO CONFIRM]` |
| 6.4 | **The trust-as-shareholder question** — who is disclosed when a trust holds shares, and in what capacity | `D65`, `D02` | `Q-H-05(b)` — **one of the most consequential open questions in this pack** |
| 6.5 | **A change in the position** (a new shareholder, a transfer, a death) | `D65`, `D68` | A change notice is an obligation with a clock |
| 6.6 | **Sanctions and prohibited persons** screening | `CMP-01` §5, `D71` | `[COUNSEL TO CONFIRM]` the applicable regime |
| 6.7 | **The family's own understanding of the structure** | `D20`, `DOCUMENT_SETS` | **The family should be able to state who owns what — and today it cannot, because nothing is verified** |

## 7. Employment obligations

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 7.1 | **Employer registrations** per entity | `EMP-01` §2 | **Not established** |
| 7.2 | **The mandatory employment terms** (the "Part F" schedule) | `EMP-01` §8 | **Not researched** |
| 7.3 | **Payroll, statutory deductions and contributions** | `D69` | No rate may be assumed |
| 7.4 | **Working time, rest and leave records** | `EMP-03` §P-13/P-14 | `[COUNSEL TO CONFIRM]` |
| 7.5 | **Health and safety** — risk assessments, incidents, statutory reporting | `EMP-03` §P-06 | `[COUNSEL TO CONFIRM]`; **the sector rules may add to it** |
| 7.6 | **Work permits and right to work** | `EMP-01` §2.11 | Verified before work starts |
| 7.7 | **Worker classification** per engagement | `EMP-01` §3 | **The register of classifications, with the evidence** |
| 7.8 | **Termination and dismissal process** conformity | `EMP-03` §P-15 | `[COUNSEL TO CONFIRM]` |
| 7.9 | **Collective and representative obligations** | `EMP-01` §4.18 | `[COUNSEL TO CONFIRM]` |

## 8. Data-protection obligations

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 8.1 | **The data inventory and flow map** | **`PRIV-02`** | **The prerequisite**; substantially unknown |
| 8.2 | **Registration, notification and the DPO** | `D70`, `PRIV-02` §9 | The pack's sources record **registration, a DPO role and reporting duties** as obligations — **verified from the instruments recorded in `LEGAL_SOURCES_REGISTER.md` `DP-1`…`DP-4`; the group has none** |
| 8.3 | **Cross-border transfers and any permit** | `PRIV-02` §5 | **A permit regime is recorded as an obligation; nothing has been applied for** |
| 8.4 | **Data-subject requests and their timescales** | `PRIV-02` §7 | **The routes must work** |
| 8.5 | **Breach detection, assessment and notification** | `PRIV-02` §8, `D71` §3 | **Periods from the instrument** |
| 8.6 | **Processor agreements** | `PRIV-02` §4.6 | **Not in place** |
| 8.7 | **DPL/impact assessments** | `PRIV-02` §9.10 | For high-risk processing |
| 8.8 | **Consent records and withdrawal** | `PRIV-02` §2J, §7.6 | The mechanisms exist in code (`consent-service.ts`, `federation/consent.ts`) — **a mechanism is not a lawful basis and is not evidence of consent** |
| 8.9 | **Employee and family data** | `EMP-03` §P-03, `PRIV-02` §2D | **Family financial data is `HIGHLY_RESTRICTED`** |
| 8.10 | **AI and personal data** | `PRIV-02` §4.6, `D45` §7 | `[COUNSEL TO CONFIRM]` |

## 9. IP and brand obligations

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 9.1 | **Searches, filings, registrations, renewals** | **`IP-TM-01`** | **Zero verified rights; the term is unresolved; no deadline may be derived** |
| 9.2 | **Chain of title and assignments** | `D40`, `D41`, `IP-EV-01` §2 | **Zero verified owned IP** |
| 9.3 | **Open-source and third-party licences** | `D45`, `IP-EV-01` §4 | Attribution maintained per release |
| 9.4 | **Brand and domain stewardship** | `D47` | Including the registrant-entity question |
| 9.5 | **Enforcement and takedowns** | `D46`, `IP-EV-01` §5 | Board decisions on advice |

## 10. Contract obligations

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 10.1 | **Contract register** — every contract, counterparty, value, term, renewal, termination right and **change-of-control clause** | `D67` | The change-of-control clause is the one everyone forgets |
| 10.2 | **Obligations extracted from contracts** (deliverables, service levels, exclusivity, minimum commitments, reporting) | `D67`, this register | Each becomes an obligation row with an owner |
| 10.3 | **Renewal and notice dates** | `D68` | **Entered from the contract itself** |
| 10.4 | **Insurance** — policies, cover, exclusions, renewal | `D71` | Including D&O, cyber and professional indemnity |
| 10.5 | **Guarantees, security and indemnities given** | `D67`, `D72` | A guarantee given by one entity for another is a related-party matter and a solvency matter |

## 11. Incidents, complaints and findings

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 11.1 | **Incident register** — security, data, safety, financial, operational | `D71` §3 | Severity, containment, notification, lessons |
| 11.2 | **Complaints register** — customers, patients, workers, family, beneficiaries, regulators | `D71` §4 | With the response, the timescale and the outcome |
| 11.3 | **Whistleblowing reports** | `D71` §7, `EMP-03` §P-09 | **Retaliation prohibited**; the log protects the reporter's identity to the extent lawful |
| 11.4 | **Regulatory enquiries, inspections and findings** | `D71` §5 | **Including a finding against the group: recorded, never hidden** |
| 11.5 | **Litigation and claims** | `D71` §1–§2 | With reserves and the accounting treatment (`FIN-06` §liabilities) |
| 11.6 | **Corrective actions** | This register | **A finding without a corrective action and a reviewer is not closed** |

## 12. Retention schedule

| # | Rule |
|---|---|
| 12.1 | **One retention schedule**, per record class, referencing the obligation that requires the retention (tax, employment, health, corporate, contractual, data-protection) |
| 12.2 | `PRIV-02` §6 holds the **data-protection** view; `D69`/`D68`/`EMP-01` §6.2 hold the others; **this register reconciles them** |
| 12.3 | **The system's actual semantics govern** (`PRIV-02` §6.2): retention from the document's upload timestamp; **a legal hold blocks deletion regardless of expiry**; eligibility is a decision; destruction requires human approval |
| 12.4 | **A legal or regulatory retention obligation overrides a shorter deletion request** — and the notice must say so (`PRIV-01` §8) |
| 12.5 | **Destruction is evidenced** (what was destroyed, when, by whom, under what authority) |

## 13. Training and awareness

| # | Tracker | Note |
|---|---|---|
| 13.1 | **Training matrix** — role × mandatory training (data protection, health and safety, anti-bribery, confidentiality, information security, harassment, AI use) | **A matrix with no attendees is an intention, not training** |
| 13.2 | **Completion records**, with dates and the version of the material | The evidence |
| 13.3 | **Board and trustee induction** — duties, conflicts, the pack's framework (`D02`, `D25`) | Including the **AI and software prohibitions** (`D31` §6) |
| 13.4 | **Re-training triggers** — a law change, an incident, a new system, a new market | Recorded |

## 14. Resolutions and authority

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 14.1 | **Decision register** — every board, shareholder, trustee and committee decision, with the authority relied on | `D73` | **The register is an index; the signed minute/resolution is the evidence** |
| 14.2 | **Delegations and limits** | `D27`, `D73` | **A decision taken outside the delegation is recorded as a finding** |
| 14.3 | **Reserved matters** — the list and the approvals actually obtained | `D04` §7 (trust), `D27` §5 (company) | **The fail-closed rule**: a blank threshold → the more restrictive approval |
| 14.4 | **Circular/written resolutions** and their validity | `D28` | `[COUNSEL TO CONFIRM]` |

## 15. Conflicts and related parties

| # | Tracker | Detail lives in | Note |
|---|---|---|---|
| 15.1 | **Conflicts declarations** — directors, officers, trustees, key staff, and their connected persons | `D14`, `D72` | **Declared, recorded, and the interested person excluded from discussion, quorum and vote** |
| 15.2 | **Related-party register** — every transaction with a related party, its terms, its approval, its arm's-length assessment and its disclosure | `D72` | **A related-party transaction without a recorded approval is a finding** |
| 15.3 | **Family-member employment, loans, guarantees, property and payments** | `D72`, `EMP-03` §P-25 | The highest-risk category in a family group |
| 15.4 | **Gifts, hospitality and political contributions** | `EMP-03` §P-11 | Thresholds `[TO BE DECIDED]` |
| 15.5 | **The Foundation's interactions with group entities** | `D48`–`D55` | **Private benefit is the risk**; every interaction documented |
| 15.6 | **Trust ↔ company interactions** | `D02`, `D27` | Distributions, loans, guarantees, services |

## 16. Evidence rules (the discipline that makes the register meaningful)

| # | Rule |
|---|---|
| 16.1 | **No status without evidence.** `MET_WITH_EVIDENCE` requires the document, filed, with a `D74` reference |
| 16.2 | **The instrument governs; the register indexes it.** Never cite the register as proof of a filing (`DEFINED_TERMS` §2) |
| 16.3 | **A deadline is not a filing.** Entering a date does not perform the obligation |
| 16.4 | **Every deadline is entered from the official source**, with the derivation recorded (`IP-TM-01` §2.4) |
| 16.5 | **Segregation of duties**: the owner does not review their own work (1.9) |
| 16.6 | **A lapse is recorded as a lapse** — with the finding, the consequence and the corrective action. **Never a silent status change** |
| 16.7 | **A software record is not evidence of compliance** (`DEFINED_TERMS` §2; `X-7`) — including a green dashboard, an automated check, a completion flag or an AI summary |
| 16.8 | **A retro-registered transaction is a finding** and is recorded as one |
| 16.9 | **The register is reviewed quarterly**, minuted, with the overdue items presented — **including the items the group would rather not show** |
| 16.10 | **Nothing in this register may be published, shown to a regulator, an investor or a customer as a compliance certification.** It is an internal control document |

## 17. Decisions required from the user / family / governing bodies

1. **Who owns compliance** — the Company Secretary function and the DPO, with the Audit and Risk Committee
   reviewing.
2. Whether the group will **populate the register from verified sources only** (the pack's rule), accepting
   that it will begin mostly empty.
3. The **budget** for professional advice — because every obligation row here needs counsel or the accountant.
4. Whether the group will **stop doing** anything that creates an obligation it cannot meet (frequently the
   cheapest and best answer).
5. The **frequency of the review** and who presents it.
6. How **family-member matters** are handled in the register (§15.3) with privacy preserved.
7. Whether the group engages a **compliance officer or outsourced function**.

## 18. Counsel and accountant review note

**`[COUNSEL TO CONFIRM]`**
1. **The obligations themselves** — the register is empty because nothing has been verified. **This is the
   single largest body of work outstanding in the pack.**
2. The **applicability thresholds** — turnover, headcount, sector, jurisdiction.
3. The **deadlines and penalties**, from the instruments.
4. The **sector regimes** (health, finance, agriculture, construction) — **none researched**.
5. **Beneficial-ownership** filings where a trust is the shareholder.
6. The **Foundation's** obligations and the private-benefit rule.

**`[ACCOUNTANT / TAX TO CONFIRM]`**
7. The **tax obligations** in §4 — registrations, periods, rates, exemptions and the trust's position.
8. The **retention periods** imposed by tax and accounting law.
9. Whether any **exemption or incentive** is available — **and never to claim one that has not been obtained**.

**The obligations register is empty. No obligation is verified. No filing, registration, licence or permit is
held. NOTHING IN THIS DOCUMENT ESTABLISHES OR EVIDENCES COMPLIANCE WITH ANY LAW.**