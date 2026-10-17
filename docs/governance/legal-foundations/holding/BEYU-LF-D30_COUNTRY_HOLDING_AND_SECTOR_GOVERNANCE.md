# BEYU-LF-D30 — Country Holding Company and Sector LLC/Operating Company Governance Framework

Document ID: `BEYU-LF-D30`
Title: Country Holding Company and Sector LLC/Operating Company Governance Framework
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — no country holding company and no sector operating company exists in
law. **The "Sector LLC" question is unresolved (`DAA-ARCH-005`).**
Document owner: Chief Governance Officer (proposed) with each sector's management
Approving authority (proposed): the holding company's board + each subsidiary's own board + counsel
Next review date: Annually
Classification: `INTERNAL` — the per-entity schedules are `HIGHLY_RESTRICTED`
Related documents: `D20`, `D22`, `D23`, `D25`, `D26`, `D27`, `D28`, `D29`, `D35`, `D53`, `D61`, `D63`,
`D64`, `D66`, `D68`, `D72`
Depends on: **`DAA-ARCH-004`, `DAA-ARCH-005`** (the "Sector LLC" question), `DAA-ARCH-003`,
`DAA-ARCH-007`, `DAA-ARCH-008`; counsel's answers to `Q-H-02`, `Q-LEG-04`

> **⚠ THE ARCHITECTURAL BOUNDARIES (established — do not erode).**
> **1. There are exactly four Sector OSs:** `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`.
> **A Sector OS is a software/operating system identity, not a legal entity.** Adding a fifth Sector OS, or
> treating any other capability as a Sector OS, is **prohibited** unless the architecture is deliberately
> changed by an authorised decision.
> **2. `FOUNDATION` is not a Sector OS and is not a subsidiary of the holding company.** It is a separately
> governed nonprofit sister organisation (`D48`–`D55`).
> **3. `FAMILY_OFFICE` is not a Sector OS.** It is a shared capability, not an asset owner
> (`D31`–`D38`).
> **4. `HCM` and `NOELIA` are not Sector OSs.**
> **5. This framework does not, and cannot, resolve what "Sector LLC" means** — see §2.
> **6. The repository's seeded entity list and ownership percentages are demonstration data** and must never
> be used to populate a register (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6).

---

## 1. Purpose and the intended chain

**1.1 Purpose.** To define how the tier below the holding company works: what a **Country Holding Company**
is for, what each **Sector Operating Company** is for, how each is governed, what authority each has, how
they interact (upward, sideways and with the Family Office and the Foundation), and what must be true before
any of them is incorporated.

**1.2 The intended chain (as designed).**

```
BEYU Family Trust  [Tier 1 — D01–D10: not constituted]
        │  (shares)
BEYU Holding Company  [Tier 2 — D20–D29: not incorporated]
        │  (shares)
Country Holding Company(ies)  [Tier 3 — this document: not incorporated]
        │  (shares)
Sector Operating Company(ies)  [Tier 4 — this document: not incorporated]
        │
   the operating businesses:  HEALTH_OS · FINANCE_OS · AGRICULTURE_OS · UJENZI_OS

Separately governed, not in this chain:  BEYU Foundation  [D48–D55]
Shared capability, not an owner:          BEYU Family Office  [D31–D38]
```

**1.3 What this document is not.** It is not a group-structure chart to be filed anywhere; it is not a claim
that any entity exists; and it is not a substitute for each company's own constitution.

---

## 2. The **"Sector LLC"** question — stated precisely and left open

**2.1 The source of the ambiguity.** The engagement brief refers to a "holding company with dual-class shares
and a **Sector LLC** structure". The repository's architecture recognises **four Sector OSs** and
"**Sector Operating Companies**". The repository contains **no `SECTOR_LLC` entity type**.

**2.2 Reading A — "Sector LLC" is shorthand for the operating company.** Then the chain is Tier 1 → Tier 2 →
Tier 3 → **Sector Operating Company**, and this document governs. **This pack uses the vocabulary "Sector
Operating Company"** and **defines no "Sector LLC"** (`DEFINED_TERMS.md` §3).

**2.3 Reading B — "Sector LLC" is a distinct legal form or a distinct tier.** Then:
(a) **Counsel must confirm** whether such a form exists in the intended jurisdiction, whether it is
available to a Tanzanian group, and how it differs from an ordinary private company (as read, the Tanzanian
"LLC" is not a distinct vehicle type in the Companies Act — **`[COUNSEL TO CONFIRM]`**);
(b) the architecture acquires a **fourth legal tier**, with its own constitution, board, filings and
liability profile; and
(c) `D27`, `D63`, `D64`, `D66` and `D68` must be **re-drafted** to reflect the extra layer.

**2.4 The consequence of not resolving it.** If a structure is built on Reading A and the family intended
Reading B, the group will have **one fewer layer than intended** — with tax, liability and control
consequences that are difficult and expensive to correct later. **This is a decision, not a detail.**

**2.5 The pack's rule.** **Do not build a structure on an unresolved reading.** Record the question
(`DAA-ARCH-005`), decide it (**§9, decision 1**), and only then incorporate.

---

## 3. Country Holding Company — purpose, mandate and limits

**3.1 Purpose (proposed).** To hold the shares of the sector operating companies within a country; to
receive and allocate dividends within its country; to provide or procure group shared services; to hold any
country-specific licences or property; and to be the level at which country-level regulation and tax are
managed.

**3.2 Mandate (proposed — the board must adopt it).**

| # | Country holding **may** | Country holding **may not** |
|---|---|---|
| 1 | Hold and vote the shares of its operating companies | Take a Reserved Matter (`D27`) without the holder-level approval |
| 2 | Appoint directors of its subsidiaries **through the correct process and only where it holds the appointment right** | Direct a subsidiary's board on a decision that belongs to that board |
| 3 | Set country-level budgets within the group plan | Exceed the group's authority limits |
| 4 | Procure shared services and charge for them (`D53`) | Charge a related party without the `D53`/`D72` process |
| 5 | Hold country licences and property | Hold group core IP except as `D39` provides |
| 6 | Employ country-level staff | Employ group-level staff without authority |
| 7 | Report to the holding company as required | Withhold information from the group's compliance functions |

**3.3 Mandatory minimums for every country holding.** A constitution consistent with this framework and
`D27`; a board with `[NUMBER]` directors including `[NUMBER]` independent (where practicable); a company
secretary function; a local audit arrangement; a compliance calendar (`D68`); a **beneficial-ownership**
analysis for its own shares and its subsidiaries' (`D65`); a data-protection position (`D70`); and an
**arm's-length** relationship with every other group company (`D53`).

**3.4 Country-specific legal requirements.** **The pack asserts nothing about the law of any country other
than Tanzania.** Each country holding must have: **local counsel's confirmation** of the corporate form, the
director and secretary requirements, the filing regime, the tax registrations, the exchange-control position
and the sector-licensing position **before** incorporation. **A country holding incorporated without local
advice is a liability, not an asset.**

---

## 4. Sector Operating Company — purpose, mandate and limits

**4.1 Purpose.** To conduct one sector's business (`HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS` or `UJENZI_OS`)
under its own licences, with its own board, its own accounts, and its own liability.

**4.2 Mandate (proposed — each company's board must adopt it).**

| # | The operating company **may** | The operating company **may not** |
|---|---|---|
| 1 | Operate its business within its approved plan and budget | Exceed the limits in `D27` |
| 2 | Hold the licences it needs | Hold a licence belonging to another entity or to the group without a lawful reason |
| 3 | Employ its own people (`D15`) | Employ another entity's people on its payroll without a documented reason |
| 4 | Contract with third parties | Enter a related-party transaction without `D72` |
| 5 | Are the group's brand under `D47` | Register, licence out or amend the brand without authority |
| 6 | Licence technology from the group under a written licence (`D42`) | Use group IP without a written licence or claim ownership of group IP (`D39`, `D40`) |
| 7 | Report to its own board and to the country holding | Report directly to the family, bypassing the chain |

**4.3 The `HEALTH_OS` caution (illustrative of every regulated sector).** The repository's health sector
contains **fictional** "executed" legal fixtures — a signed IP assignment, a registered trademark
`TZ-2025-4421`, and a Madrid Protocol filing designating five countries. **All three are demonstration data.
The Madrid filing is doubly impossible because Tanzania is not a member of the Madrid System** (`D44`,
`D40`). A regulated operating company **must not** build its compliance position on any repository fixture.
**Every licence, registration and filing for a regulated sector must be verified directly with the regulator.**

**4.4 Sector-specific governance.** Each operating company must maintain: its own licence register (in
`D68`); its own regulatory correspondence (in `D71`); its own complaints/incident process where the sector
requires it; its own professional-indemnity and public-liability insurance (`D71`); and its own
patient/customer data-protection position (`D70`) — **because a data breach in a health business is a
different risk from a data breach in an agricultural one.**

**4.5 The "one company, one licence, one liability" principle.** Where a sector requires a licence, **the
licensed entity must be the entity that carries the liability.** **Do not hold a licence in one company and
operate the regulated business in another** — that structure invites a regulator's objection and can void
insurance.

---

## 5. Governance architecture across the tiers

### 5.1 Who decides what, across the chain

| Decision | Tier 1 (Trust) | Tier 2 (Holding) | Tier 3 (Country) | Tier 4 (Operating) |
|---|---|---|---|---|
| Trust distributions, beneficiary matters | **TRUSTEES** | — | — | — |
| Group strategy and the group plan | Consent right if any (`D22` §5) | **BD** (M for a Reserved Matter) | Input | Input |
| Group structure changes (new subsidiary, disposal) | Consent right if any | **BD/M** (`D27` C-09) | Executes | Executes |
| Group financing | If Trust assets are pledged: `D04` §7 RM-05/06 | **BD/M** (`D27` F-08) | Within limit | Within limit |
| Group core IP | If Trust owns IP: Trustees decide (`D39`) | **BD/M** (`D27` L-10) | Licences in | Licences in |
| Country budget | — | Approves | **BD** within plan | Input |
| Operating decisions | — | — | Oversight | **BD/CEO within limits** |
| Sector licences | — | — | Oversight | **BD** (the licensed entity) |
| Related-party transactions | If the Trust is a counterparty: `D04` §7 RM-09 | **Disinterested BD** | Disinterested BD | Disinterested BD |
| Employment and remuneration | — | **BD** for group senior roles | **BD** for country senior roles | **BD/CEO** within policy |

**5.2 The rule that prevents most group disputes.** **A parent company's power over a subsidiary is the
power of a shareholder** — to appoint directors, to approve reserved matters, and to receive information —
**not a power to manage.** A parent that manages a subsidiary's business directly exposes itself to
liability (and, in many jurisdictions, to being treated as a shadow director). **Use the shareholder route;
do not use the telephone route.**

### 5.3 Information flow (upward and sideways)

| Flow | Content | Frequency | Where recorded |
|---|---|---|---|
| Operating company → country holding | Management accounts; compliance status; risks; material events | Monthly | `D68`, `D71`, `D61` |
| Country holding → holding company | Consolidated country results; compliance; risks; opportunities | Monthly/quarterly | Group reporting |
| Holding company → Trustees | As the Trustees require for their own duties, and as the trust deed provides | `D08` §6 | Trust reporting |
| Family Office → the family | As mandated (`D33`, `D38`) | Per mandate | Family reporting |
| **Prohibited** | Personal data flows, employee personal data, patient/customer data, dispute details — **unless there is a lawful basis and a compliant transfer mechanism** (`D70`) | — | — |

**5.4 The intra-group services rule.** Every service provided between group companies must be: (a) in
writing; (b) on documented arm's-length terms; (c) charged on a documented cost or market basis; (d) approved
per `D27` (G-04) and recorded in `D72`; and (e) consistent with the tax advice on **transfer pricing**
(`Q-TAX-04`). **"The parent just tells the subsidiary what to do and the costs are absorbed" is not a
service arrangement — it is a transfer-pricing and governance exposure.**

### 5.5 The Foundation boundary at the operating tier.
An operating company may: sponsor, fund or partner with the Foundation **at arm's length**, on documented
terms (`D53`), with the Foundation's governors deciding independently (`D51`). **An operating company may
not:** direct a Foundation grant; fund the Foundation in a way that is really a benefit to a family member or
to the company's own image **without fair consideration and disclosure**; or use the Foundation's name for a
commercial purpose without a documented licence (`D54`).

### 5.6 The Family Office boundary at the operating tier.
The Family Office may **administer** a mandate given by the competent body; it may not **decide** anything in
an operating company; it may not hold an operating company's assets; and it must not have standing access to
an operating company's systems or data beyond its mandate (`D35` §Controls).

---

## 6. Incorporation checklist (per entity — none of this has been done)

| # | Requirement | Ref |
|---|---|---|
| 1 | A written **business case** for the entity (why it must exist) | `D20` §6 by analogy |
| 2 | **Local counsel's** confirmation of the form, requirements and filings | `Q-R-01` |
| 3 | The **constitution** drafted consistently with this framework and `D27` | `D21` (BLOCKED) |
| 4 | Confirmation of the **shareholder** (the correct tier) and the shares to be issued | `D24`, `D64` |
| 5 | The **board** and officers appointed by the correct process, and eligible | `D25`, `D66` |
| 6 | **Sector licensing** confirmed before trading, and the licence held by the operating entity | `Q-LEG-04` |
| 7 | **Tax** registrations and the group's transfer-pricing position | `D69`, `Q-TAX-03/04` |
| 8 | **Beneficial ownership** analysis and filings | `D65` |
| 9 | **Data protection** registration/position (and cross-border, if any) | `D70`, `Q-DP-01/02` |
| 10 | **Bank accounts** with two-signature mandates | `D35` |
| 11 | **Insurance** (sector-appropriate) | `D71` |
| 12 | **Compliance calendar** populated | `D68` |
| 13 | **Authority matrix** adopted for the entity | `D27` |
| 14 | **Registers** opened | `D63`, `D64`, `D66` |
| 15 | **IP licences** in place before using any group IP or the brand | `D42`, `D47` |

---

## 7. Control-plane and naming discipline

**7.1 Sector identity vs legal entity.** The control plane models **tenants and entity classifications**
(including "Sector OS" identities). **A tenant is not a company.** Mapping rules:

| Control-plane concept | Legal meaning |
|---|---|
| A Sector OS tenant (`HEALTH_OS`, etc.) | **A software/operating identity.** It may correspond to one or more legal entities. It is **not** a legal entity and does not hold assets, licences or liabilities. |
| An entity record | A **record of** a legal entity; the legal entity exists by incorporation, not by the record |
| A country classification | A **scope** for data and policy; not a legal status |
| A parent-child link in the software | A **record of** the intended shareholding; it does not create ownership — the share register and the instrument do |

**7.2 Prohibited practices.** (a) Treating a Sector OS tenant as a company in any register or filing;
(b) recording a shareholding link that does not exist in a share register; (c) using the seeded entity list
as a register; (d) presenting a seeded ownership percentage as a fact; (e) creating a fifth Sector OS without
an authorised architecture decision.

**7.3 The four-sector audit.** The annual governance review (`D75`) must confirm: **there are exactly four
Sector OSs**; that neither the Foundation nor the Family Office has been classified as one; that no seeded
entity has been promoted to "canonical" status; and that each operating entity maps to exactly one Sector OS
or is explicitly recorded as being outside the four (as the seeded MINING entity is — **which is a
cross-document consistency item**: if a mining business is real, the four-Sector-OS architecture must be
deliberately revisited by an authorised decision, not quietly extended).

---

## 8. Decisions required from the user / family / governing bodies

1. **Resolve `DAA-ARCH-005`: is "Sector LLC" shorthand (Reading A) or a distinct tier/form (Reading B)?**
2. Confirm **which countries** will have a country holding company, and why.
3. Confirm **whether a country holding tier is needed at all** in the first jurisdiction (a single-country
   group may not need it — see `D20` Option 4).
4. Confirm the **shareholder of each tier**, and the share class held.
5. Confirm the **board composition** at each tier and whether independent directors are appointed.
6. Confirm the **shared-services and cost-allocation** approach (`D53`) and the transfer-pricing advice.
7. Confirm the **sector-licensing** perimeter (`Q-LEG-04`) and, for each sector, whether the licensed entity
   operates the business.
8. Confirm whether the seeded **MINING** activity is real. If so, decide how it relates to the four-Sector-OS
   architecture (a recorded architecture decision), or record it as demonstration data only.
9. Confirm what each tier **reports upward** and at what frequency.

## 9. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether the **tiered structure** is lawful and tax-efficient, and the Tanzanian consequences of each
   layer (`Q-H-02`).
2. Whether a **country holding company** is required for any regulatory or tax purpose, or whether it is
   merely a convenience (**and if convenience, whether it is worth its cost**).
3. Whether the intended **sector activities** require licences, and whether the licensed entity must be the
   operating entity (and whether it must hold the assets the licence relates to).
4. Whether **local counsel** must be instructed in each country, and what each must confirm.
5. Whether the **parent–subsidiary relationship** as designed creates a shadow-directorship or a
   group-liability exposure.
6. Whether **intra-group services and charges** are lawful, and the transfer-pricing documentation required
   (`Q-TAX-04`).
7. Whether the **beneficial-ownership** disclosure obligations differ per tier, and who must file what
   (`Q-H-05`).
8. Whether **cross-border data flows** between tiers require a permit (`Q-DP-02`).
9. Whether any planned activity requires **foreign-investment approval, exchange-control approval or a
   competition clearance** (`Q-LEG-03`).

**No country holding company and no sector operating company exists in law. The "Sector LLC" question is
unresolved and must be decided before any structure is built on this framework.**
