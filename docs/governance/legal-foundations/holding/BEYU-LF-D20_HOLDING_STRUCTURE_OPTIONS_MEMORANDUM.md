# BEYU-LF-D20 — BEYU Holding Company — Corporate Structure and Jurisdiction Options Memorandum

Document ID: `BEYU-LF-D20`
Title: BEYU Holding Company — Corporate Structure and Jurisdiction Options Memorandum
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`INFORMATIONAL`** — options memorandum for professional review. **Not advice. No company has
been incorporated. No jurisdiction has been chosen.**
Document owner: Company Secretary function (proposed) with counsel
Approving authority (proposed): Founder + Trustees + counsel + tax adviser
Next review date: On receipt of counsel's and the tax adviser's opinions (GATE 2/GATE 5)
Classification: `INTERNAL`
Related documents: `D01`, `D21`, `D22`, `D23`, `D24`, `D27`, `D30`, `DC-01`, `D48`, `D53`, `D63`, `D64`,
`D68`, `D69`
Depends on: `DAA-ARCH-001`, `DAA-ARCH-002`, `DAA-ARCH-005`, `DAA-ARCH-006`, `DAA-HOLD-001`,
`DAA-HOLD-002`; counsel's answers to `Q-H-02`, `Q-H-05`, `Q-TAX-02`, `Q-TAX-03`, `Q-LEG-03`, `Q-LEG-04`

> **⚠ READ THIS FIRST.** **No holding company exists.** The repository's seeded group — a `BEYU Holding
> Company` in DIFC under a Mauritian trust with a Tanzanian holding company beneath it, and four sector
> operating companies — is **synthetic demonstration data** (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6).
> Registration numbers, TINs, ownership percentages and provenance strings in the seed file are **not**
> legal facts and must never be cited as such.
> **This memorandum does not recommend a jurisdiction, a legal form, or a structure.** Its purpose is to
> let counsel and the family evaluate the options on the actual facts.

---

## 1. Purpose and scope

**1.1 Purpose.** To set out the design questions, the legally plausible options and their trade-offs, and
the evidence required, before any holding company is incorporated.

**1.2 The architectural position (as established in the repository).** The intended chain is:

> **BEYU Family Trust** → **BEYU Holding Company** → **Country Holding Company(s)** → **Sector Operating
> Company(s)**; with **BEYU Foundation** as a separately governed nonprofit sister organisation, **not** a
> subsidiary and **not** a Sector OS; and **BEYU Family Office** as a shared capability, not an asset
> owner. Four Sector OSs are canonical: `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`.

This memorandum concerns the **second** tier only. It does not re-open the Trust tier (`D01`) or the
operating-tier question (`D30`).

**1.3 Explicitly out of scope.** Choosing a jurisdiction; drafting the constitutional documents (that is
`D21`/`D22`/`D23`); tax advice; the sector licensing perimeter (`Q-LEG-04`).

## 2. The unresolved premises this memorandum cannot resolve

| # | Premise | Status | Consequence if assumed |
|---|---|---|---|
| P-1 | A holding company is needed at all | **Proposed, not established** (`DAA-HOLD-001`) | If the Trust holds operating companies directly, the entire mid-tier design (and its cost) disappears. |
| P-2 | The first trust jurisdiction | **Unresolved** (`DAA-ARCH-006`): Tanzania-first vs the seeded Mauritius/DIFC structure | Determines the holding tier's residence, tax and filing profile. |
| P-3 | Whether a **"Sector LLC"** tier exists as a distinct legal layer | **Unresolved** (`DAA-ARCH-005`) | See §7; the pack uses **"Sector Operating Company"** and defines no "Sector LLC". |
| P-4 | Whether the holding company issues **dual-class shares** | **A proposal only** (`DAA-DC-001`) | See `DC-01`, `D22`. |
| P-5 | Whether any shares have been issued, to whom, at what price | **No evidence** (`DAA-HOLD-002`) | A "cap table" in the repository is a structure, not a record; no cap table is asserted in this pack. |

## 3. The design questions the family must answer before choosing a jurisdiction

**Q1. What must the holding tier actually do?** Collectively: hold shares in the country holdings/operating
companies; hold the group's core IP (proposed — see `D39`); receive and allocate dividends; provide shared
services; act as the family's investment vehicle; possibly hold real property; and be the vehicle through
which family governance meets corporate governance. **A jurisdiction that is efficient for one of those
functions may be poor for another.**

**Q2. Where must it be resident?** Residence drives: tax; the filing and accounts regime; whether it can
hold Tanzanian land or shares in Tanzanian companies freely; exchange-control consequences; the availability
of treaty benefits; and the regulatory perimeter.

**Q3. Who must be able to control and to claim?** The Trust as shareholder; the family (through the Trust
and family governance); the trustees' jurisdiction; and the *locus* of the family's residence.

**Q4. What must the group be able to do operationally?** Open bank accounts; obtain credit; contract with
public bodies; hold licences; receive donor or investor funds; employ people; and litigate if necessary.

**Q5. What does transparency require?** Beneficial ownership disclosure; accounts and audit; tax filings;
and the **data-protection** position for the personal data the holding tier will hold about family members
and officers (`Q-DP-01`–`Q-DP-06`).

**Q6. What happens on a change of mind?** Redomiciliation, migration and exit mechanics; the cost of
unwinding; and the tax consequences of moving. **A structure chosen for convenience that cannot be
unwound cheaply is a trap.**

## 4. Option families (presented without recommendation)

> In each option: **what it delivers**, **the trade-offs**, and **the questions** that must be answered.
> Nothing here asserts the law of any jurisdiction other than as flagged; all legal statements for
> non-Tanzanian jurisdictions are **`REQUIRES VERIFICATION`** — this pack researched **Tanzania only**.

### Option 1 — **Tanzanian private company limited by shares** as the holding company

- **Delivers.** The well-understood default: a private company under the Companies Act (Cap. 212), with
  the private-company characteristics of restricted transfer, a member ceiling and no public offer
  (as read, s.27 in the 2002 numbering / s.29 in the R.E. 2023 text). Shares are movable property; share
  capital procedures (issue, class rights, alteration of capital, reduction) are statutory. Easiest to
  bank and to transact in Tanzania; land and sector shareholdings are straightforward; no foreign
  incorporation overlay.
- **Trade-offs.** Tanzanian corporate tax exposure on group income and gains; Tanzanian beneficial
  ownership filing obligations; the group's international flexibility is limited; any foreign investment
  by it is subject to Tanzanian exchange-control and tax rules; the family's succession/incapacity
  planning must be robust because the shares are the family's principal asset.
- **Questions.** `Q-H-01` (class rights and the dual-class proposal), `Q-H-05` (beneficial ownership),
  `Q-TAX-03` (intra-group flows), `Q-LEG-03` (exchange control), `Q-R-01` (filings).

### Option 2 — **Tanzanian company limited by guarantee** as a holding body

- **Delivers.** A corporate form used for non-profit and membership bodies (as read, the guarantee-company
  provisions contemplate a company formed for purposes other than profit and the distribution of income to
  members). It can hold assets and provide continuity.
- **Trade-offs.** Structurally a poor fit for a profit-seeking group holding company; the guarantee-company
  regime carries restrictions on the application of income and (as read) a bar on certain conversions; it
  does not naturally accommodate equity investment, dividends or share-based employee incentives.
- **Where it *is* relevant.** As a candidate form for the **Foundation** (`D48` §Options) — *not* as the
  group's holding company. Presented here only so the family can see that it has been considered and
  rejected for this purpose, with reasons.

### Option 3 — **Foreign holding company** (e.g. a Mauritius or DIFC entity, consistent with the seeded
structure)

- **Delivers.** Depending on the chosen jurisdiction: a neutral or territorial tax environment at the
  holding level; a familiar holding-company regime with treaty access (jurisdiction-dependent); the ability
  to hold Tanzanian and other operating companies alongside each other; and alignment with the family
  trust's jurisdiction if that is also offshore.
- **Trade-offs and hard questions.** **No part of this is established by this pack** and none of it may be
  assumed:
  - **Tanzanian tax on the structure** — including the controlled-foreign-corporation/controlled-foreign-
    trust tests (as read, the Income Tax Act contains such tests), the treatment of dividends and gains,
    transfer-pricing exposure on intra-group services, and any indirect-transfer exposure on a change of
    control of a Tanzanian company (`Q-TAX-02`, `Q-TAX-03`).
  - **Foreign company registration in Tanzania** — whether the foreign entity must register a place of
    business or file, and what follows (`DAA-HOLD-001`; the pack cites the foreign-company provisions of
    the Companies Act from secondary reading only — **`REQUIRES VERIFICATION`**).
  - **Exchange control** on capital, dividends, loans and repatriation (`Q-LEG-03`);
  - **Beneficial ownership** disclosure down the chain, including the ultimate beneficial owners;
  - **Substance and permanence** — a holding company with no real presence may be disregarded, attacked, or
    refused treaty benefits; and the family must be able to demonstrate actual governance;
  - **Data protection** — a foreign holding tier holding family, beneficiary and officer data creates a
    cross-border transfer question (`Q-DP-02`);
  - **Cost and complexity** — two compliance systems, two tax systems, two sets of advisers, and the risk of
    neither being done well.
- **Questions.** All of `Q-H-02`; and a specific instruction to counsel to **state the Tanzanian
  consequences in writing** before any structure is created.

### Option 4 — **No separate holding company** (Trust holds the operating companies directly;

  a **"flat"** structure)
- **Delivers.** Lowest cost; fewest filings; the fewest layers at which a succession or control problem can
  arise; and the clearest beneficial-ownership picture.
- **Trade-offs.** The Trustees then hold direct operating-company shareholdings, which makes the Trust's
  administration heavier and concentrates control questions in one instrument; multi-sector and
  cross-border expansion becomes harder; the group has no single vehicle to hold IP, raise group finance or
  provide shared services; and a single-sector problem reaches directly into the family's principal
  asset.
- **When it is genuinely the better answer.** A single-country, single-sector family business with no
  external investors and simple succession needs. **The family should be told this plainly** — a holding
  company is a tool, not a status symbol.

### Option 5 — **Hybrid/staged**: Tanzanian holding now, foreign tier later (or vice versa)

- **Delivers.** A structure that fits today's facts without pretending to predict tomorrow's; and the
  option to add a tier when the business case exists.
- **Trade-offs.** Beneath the apparent simplicity, migration and "push-down/pull-up" of holdings raise
  transfer-tax, stamp-duty and exchange-control questions; the family must plan the migration **in
  advance**, because restructuring later is usually more expensive.
- **Questions.** `Q-TAX-03` (the tax cost of a future migration), `Q-LEG-03` (approvals), `Q-R-01`
  (deregistration/filing consequences).

## 5. The choice matrix (structural, non-conclusive)

| Criterion | TZ shares Co | TZ guarantee Co | Foreign holding Co | Flat (no holding Co) | Staged |
|---|---|---|---|---|---|
| Country of incorporation | Tanzania | Tanzania | `[TO BE CHOSEN]` | n/a | Tanzania first |
| Holds Tanzanian operating shares cleanly | ✔ | ✘ (purpose/restrictions) | Needs registration/filing analysis | ✔ | ✔ |
| Holds group IP (proposed) | ✔ | Possible | ✔ | Trustees hold directly | ✔ |
| Can raise external equity | ✔ | ✘ | ✔ | Limited | ✔ |
| Supports ESOP | ✔ | ✘ | ✔ | ✘ | ✔ |
| Ordinary Tanzanian tax exposure | ✔ | ✔ | `[COUNSEL/TAX]` | ✔ (in the Trust) | ✔ |
| Beneficial-ownership disclosure | ✔ | ✔ | ✔ (both jurisdictions) | ✔ | ✔ |
| Exchange-control exposure | Low | Low | `[COUNSEL]` | Low | Medium |
| Cost to establish | Low | Low | High | Nil | Medium |
| Cost to unwind | Medium | Medium | High | n/a | Medium |
| Fits a multi-sector, multi-country ambition | Medium | ✘ | ✔ (if executed well) | ✘ | ✔ |
| Fits a single-country, single-sector family business | ✔ | ✘ | Over-engineered | ✔ | Over-engineered |

**5.1 The honest observation to give the family.** The repository's seeded structure (offshore trust →
DIFC holding → Tanzanian holding → operating companies) **describes a structure that has not been
established, has not been tax-advised, and whose Tanzanian consequences are unverified.** It should not be
treated as the target merely because it appears in the demonstration data.

## 6. Whatever is chosen, these must exist before incorporation

| # | Requirement | Why | Document |
|---|---|---|---|
| 1 | A written statement of what the holding company is for | Prevents an unfocused entity | This memo + `D20` §3 |
| 2 | Counsel's opinion on the Tanzanian consequences (and local-law opinion if foreign) | Structure risk | GATE 2 (`IMPLEMENTATION_ROADMAP` ) |
| 3 | Tax adviser's opinion on group flows, residency and exit | Cost and risk | GATE 2 |
| 4 | The constitutional documents (drafted to carry the dual-class proposal, if adopted) | Authority and rights | `D21`, `D22` |
| 5 | The shareholders' agreement (if there is more than one shareholder, or if the Trust needs protections) | Rights and deadlock | `D23` |
| 6 | The authority matrix (`D27`) | Who decides what | `D27` |
| 7 | The board charter and committee terms of reference | Corporate governance | `D25`, `D26` |
| 8 | The registers, opened at incorporation | Evidence | `D63`, `D64`, `D66`, `D68` |
| 9 | The beneficial-ownership analysis and the filing plan | Compliance | `D65` |
| 10 | The share-issuance plan (who subscribes, for what, at what price, with what evidence of payment) | Anti-fabrication | `D24`, `D64` |
| 11 | The data-protection registration/transfer analysis | Legal exposure | `D70` |
| 12 | The IP ownership analysis | Title | `D39`, `D40` |

## 7. The **"Sector LLC"** question — recorded, not resolved

The engagement brief's section C is headed "Holding Company and Ownership Governance" and concerns a
"holding company with dual-class shares and a Sector LLC structure". Separately, the BEYU architecture
recognises **four Sector OSs** and (in the repository's own vocabulary) **"Sector Operating Companies"**,
and contains **no `SECTOR_LLC` entity type**.

**Consequences of the ambiguity, written down so it is not lost:**

1. If "Sector LLC" is a **shorthand** for the operating company beneath the country holding, then the
   architecture is: Trust → Holding → Country Holding → **Sector Operating Company**, and this pack's
   `D30` governs it. **This is the reading this pack uses** (and this pack therefore defines no "Sector
   LLC" — see `DEFINED_TERMS.md` §3).
2. If "Sector LLC" is intended as a **distinct legal form** (a limited liability company, in the sense of
   a separate vehicle type), then: (a) counsel must confirm whether such a form exists in the chosen
   jurisdiction and how it differs from the ordinary private company; (b) the architecture acquires a
   fourth tier, with its own governance and filing requirements; and (c) `D30` and `D27` must be
   re-drafted.
3. **The pack does not choose.** The question is recorded as `DAA-ARCH-005` and must be answered by the
   family with counsel's advice.

## 8. What this memorandum explicitly does NOT conclude

1. That any holding company exists, or that any jurisdiction has been chosen.
2. That the seeded offshore structure is correct, necessary, lawful, tax-efficient, or achievable.
3. That a holding company is needed at all.
4. That the dual-class arrangement is lawful or advisable.
5. That any tax treatment applies.
6. That any of the trade-offs above are decisive.

## 9. Decisions required from the user / family / governing bodies

| # | Decision | Decision-maker | Needed by |
|---|---|---|---|
| 1 | Whether a holding company is needed, or whether the flat structure is correct for now | Founder + Trustees | Before GATE 2 |
| 2 | The **intended jurisdiction(s)** and whether an offshore tier is genuinely intended | Founder | Before GATE 2 |
| 3 | Whether **"Sector LLC"** is a shorthand or a distinct layer (`DAA-ARCH-005`) | Founder | Before `D30` is finalised |
| 4 | Whether the holding company will issue **dual-class shares** (`DC-01`) | Founder + counsel | Before `D21`/`D22` are finalised |
| 5 | The **shareholder of record** of the holding company (proposed: the Trust) and what happens if the Trust is not yet constituted | Founder + Trustees | Before any incorporation |
| 6 | The **funding** of the holding company and the evidence of payment for any shares issued | Founder | Before issuance (`D24`) |
| 7 | Instruction of counsel and a tax adviser | Founder | GATE 5 entry |

## 10. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **Tanzanian consequences** of each option, including for a foreign holding company: tax residency,
   the CFC/CFT tests, dividend and capital-gains treatment, withholding, transfer pricing, indirect
   transfer of Tanzanian interests, and any registration of a place of business.
2. Whether a Tanzanian company may lawfully be used as the group holding company **and** hold group IP and
   real property, and any restriction on it.
3. Whether a **company limited by guarantee** may lawfully be used for the purposes the family intends
   (and, if not, confirm that it is excluded).
4. The **beneficial-ownership** position for each option, including who must be disclosed where a trust is
   the registered shareholder.
5. Whether any **exchange-control** approval is needed for the chosen structure.
6. Whether the family's **sector activities** require the holding company itself to hold a licence
   (`Q-LEG-04`).
7. The **cost and mechanics of migration** if the family later changes jurisdiction.
8. Whether the **`[FIR-…]` decisions** the family makes here require any regulator or third-party consent.

**This memorandum recommends no structure, asserts no existence, and cites no synthetic data as fact. It is
a question list for professional advice.**
