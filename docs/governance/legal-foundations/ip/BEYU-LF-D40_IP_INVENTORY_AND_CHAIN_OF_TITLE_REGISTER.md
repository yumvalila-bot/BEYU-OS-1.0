# BEYU-LF-D40 — IP Inventory and Chain-of-Title Register

Document ID: `BEYU-LF-D40`
Title: IP Inventory and Chain-of-Title Register
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — **the register is BLANK. Zero assets are verified. Zero chains of
title are evidenced.**
Document owner: Group CTO function (proposed)
Approving authority (proposed): each board (no board exists)
Next review date: Quarterly until the inventory stabilises; then annually
Classification: `HIGHLY_RESTRICTED`
Related documents: `D39`, `D41`, `D43`, `D44`, `D45`, `D46`, `D47`, `D63`, `D67`, `D68`, `D72`, `D74`
Depends on: the repository's IP fixture quarantine (`GATE-0` §7); counsel's IP answers (`Q-IP-01`–`Q-IP-04`)

> **⚠ THE REGISTER'S FIRST AND MOST IMPORTANT ENTRY IS A NEGATIVE FINDING.**
> **This pack has verified NO intellectual property asset as owned by any BEYU entity.** The only
> IP-looking records found in the repository were **fictional sector-demonstration fixtures** (`D39` §1),
> including an "assignment" by a non-existent collective party and a trade-mark registration that does not
> exist in any registry. **The inventory therefore starts empty, and every entry must be created from a
> source document that a human has inspected.**

---

## 1. Purpose and the distinction the register exists to preserve

A register that conflates these five columns is worse than no register, because it will be believed:

| Column | The question it answers | Evidence that can support it |
|---|---|---|
| **Authorship / creation** | Who made it? | Employment/engagement records; the code history; the design files |
| **Registered title** | Is there a registration, in whose name? | The certificate, from the registry |
| **Contractual title** | Has the right been assigned to someone? | The executed assignment, with consideration and formalities |
| **Licence** | What rights may be used, by whom, on what terms? | The executed licence (`D42`), or an open-source licence (`D45`) |
| **Custody / access / operational use** | Who holds it and who uses it? | Repository access, the deployment, the registrar account |

**The rule: every asset row must answer all five columns separately, and "used by us" must never be entered
in the "owned by" column.**

## 2. The register template

### 2.1 Asset identification

| # | Field | Definition | Required |
|---|---|---|---|
| 1 | **IP ID** | Internal reference (`IP-001`…) | ✔ |
| 2 | **Asset name** | Short, unambiguous | ✔ |
| 3 | **Asset type** | Trademark / wordmark+device / copyright work / software (source, object) / AI model or weights / prompt library / dataset / database / design / documentation / trade secret / know-how / domain / DNS record / social handle / trade dress / patent (if any) / plant variety / other | ✔ |
| 4 | **Description** | What it is, in plain words | ✔ |
| 5 | **Geographic scope** | Territory (or "worldwide, unregistered") | ✔ |
| 6 | **Product/OS use** | Which product it belongs to (`HEALTH_OS`, etc. — **a product identity, not an owner**) | ✔ |
| 7 | **Materiality** | `CRITICAL` / `IMPORTANT` / `ROUTINE` — drives maintenance effort | ✔ |

### 2.2 The five-column title analysis (this is where the register earns its name)

| # | Field | Definition | Required |
|---|---|---|---|
| 8 | **Author(s)/creator(s)** | Named individuals or entities, with their relationship (employee / contractor / supplier / founder / unknown) | ✔ |
| 9 | **Creation date / first use** | Evidence-anchored | ✔ |
| 10 | **Registered?** | Yes/no; if yes: registry, number, classes, filing and grant dates, **term, renewal date** | ✔ |
| 11 | **Registered owner (per the certificate)** | Exactly as recorded | If registered |
| 12 | **Contractual owner (per an assignment)** | If different from the author or the registered owner | ✔ |
| 13 | **Consideration for the assignment** | What was paid/given — **an assignment without consideration is a risk flag** | If assigned |
| 14 | **Assignment evidence** | The `D74` reference | If assigned |
| 15 | **Formalities satisfied?** | Writing / signature / witness / notarisation / **recordal against the registration** — with the date | If assigned |
| 16 | **Licence(s) in** | Inbound: what the group may use (incl. open source) | ✔ |
| 17 | **Licence(s) out** | Outbound: to whom, on what terms (`D42`) | If any |
| 18 | **Custodian / holder** | Who physically/digitally holds it | ✔ |
| 19 | **Operational user** | Which entity uses it | ✔ |
| 20 | **Owner's entity** | **The legal entity that owns it — or `OWNERSHIP UNESTABLISHED`** | ✔ |
| 21 | **Title status** | `VERIFIED` / `ASSERTED BUT UNVERIFIED` / `CONTESTED` / `UNKNOWN` / `OWNERSHIP UNESTABLISHED` | ✔ |
| 22 | **Confidence** | High / medium / low, with the reason | ✔ |
| 23 | **Gap / open item** | What would be needed to move it to `VERIFIED` | ✔ |
| 24 | **Last verified** | Date, by whom, against what | ✔ |

### 2.3 The register

| IP ID | Asset | Type | Registered? | Registered owner | Contractual owner | Title status | Owner entity | Evidence | Open item |
|---|---|---|---|---|---|---|---|---|---|
| — | **NO VERIFIED ASSETS. The inventory is empty.** | — | — | — | — | — | — | — | — |

## 3. The working method (how an entry becomes `VERIFIED`)

| Step | Action | Evidence produced |
|---|---|---|
| 1 | **Inventory the claim** — someone says "we own X". Write it down as an assertion, not a fact | The row, with `ASSERTED BUT UNVERIFIED` |
| 2 | **Identify the creators** — employees? contractors? suppliers? founders? an unknown? | HR/engagement records |
| 3 | **Trace the legal chain** — employment terms, contractor terms, purchase terms, prior assignments | The documents |
| 4 | **Check the registry** — where the claim is a registration, obtain the certificate from the registry (or confirm no registration exists) | The certificate / a negative record |
| 5 | **Identify the gaps** — missing assignments, missing schedule, missing consideration, missing recordal | The gap list |
| 6 | **Remedy** — take the missing assignment (`D41`), file the recordal, or abandon the claim | The instrument (`D74`) |
| 7 | **Move the row to `VERIFIED`** — only when steps 2–6 are complete | The verified row |

**3.1 The negative-finding discipline.** Where an asset is important and the chain cannot be completed, the
row stays `OWNERSHIP UNESTABLISHED` **with the reason stated**, and the board is told. **A register that
"probably" owns everything is a liability in a due diligence, a financing, a dispute or a tax enquiry.**

## 4. Special asset classes

### 4.1 Software and AI

| # | Rule |
|---|---|
| 1 | **The repository's existence proves nothing about title.** Access lists are security records; commit history is authorship evidence, not ownership evidence |
| 2 | Every contributor of code must be covered by `D41`/`D43` — employees, contractors, **interns, volunteers, founders, agencies, and offshore teams** |
| 3 | **AI model weights, prompts and pipelines** require the same chain analysis **plus** a licence analysis of the training data and the model's own terms (`Q-IP-04`) |
| 4 | A model trained on third-party or personal data may be **unusable, or usable only with restrictions** — that is a licensing question, not just a technical one |
| 5 | **Open-source components are tracked, not owned** (`D45`) |

### 4.2 Datasets and data products

**Rule: do not assume a dataset is ownable.** What exists may be: contractual rights (terms of use), database
rights (where recognised), copyright in a compilation (where originality exists), **or nothing**. And where
the data includes personal data, **the PDPA governs it regardless of who "owns" it** (`D70`). Every dataset
row must state its source, its lawful basis and its licence terms.

### 4.3 Trade secrets

| # | Requirement |
|---|---|
| 1 | **Secrecy is the protection** — record the access controls, the confidentiality obligations, the markings, and the need-to-know population |
| 2 | A secret disclosed without an NDA may be **unprotectable** — record the disclosures |
| 3 | Departing personnel: the exit checklist (`D15` §9) must cover **the return of secrets and the confirmation of no retention** |
| 4 | **Do not register a trade secret as a trade mark or patent without advice** — you may be publishing the thing you were protecting |

### 4.4 Domains, DNS, social handles and digital assets

| # | Requirement |
|---|---|
| 1 | Registered **in the operating entity's name**, with the registrar account controlled by the entity (not by an individual's personal account, not by an agency's account) |
| 2 | The registrar account has **two-person control** and recovery details held by the entity (`D35` §2 C-05) |
| 3 | Renewals are in `D68`; **an expired domain is an immediate reputational and security event** must be treated as such (not "fixed quietly") |
| 4 | DNS changes require the `D47` procedure; a change of DNS is a **material** event |

## 5. Registration and renewal data (only what is verified)

**5.1 Nothing in this register is verified as at the date of this draft.**

**5.2 Trade marks.** The pack verified from the Trade and Service Marks Act materials that applications are
made **per class** (a separate application for each class), through the **registry** (BRELA), that a **local
agent** is required for a foreign applicant, and that **Tanzania is not a member of the Madrid Protocol**
(`LEGAL_SOURCES_REGISTER.md` `IP-2`, `IP-3`). **It also found the renewal term reported inconsistently
(7 years by one source, 10 by another). This pack therefore asserts NO term and NO renewal period**; the
term is a `[COUNSEL TO CONFIRM]` item, and no calendar entry may be created from an unverified term.

**5.3 The fixture caution.** The demonstration dataset's "renewal every 10 years (next 12 May 2035)" and its
"Madrid Protocol designating KE, UG, RW, ZA, NG" claim are **both unusable** (`D39` §1).

## 6. Controls

| # | Control |
|---|---|
| C-01 | **No entry is created from a fixture, a demonstration dataset, a marketing claim or an AI output** |
| C-02 | Every entry cites its evidence; **an entry without evidence is `ASSERTED BUT UNVERIFIED`** |
| C-03 | The five columns (§1) are never collapsed; **"used by us" is never recorded as "owned by us"** |
| C-04 | Renewal dates are entered **only** from a registry source, never from a spreadsheet or memory |
| C-05 | Where a chain gap is found, it is logged as an open item with an owner — **and reported to the board** |
| C-06 | Access to this register is limited; it contains personal data (authors, inventors) |
| C-07 | The register is reconciled with `D44` (asset register) and `D67` (material assets) quarterly |

## 7. Open items (the register's own gap list)

| # | Open item | Why it matters | Owner |
|---|---|---|---|
| 1 | **Is the group name/mark registered anywhere, by anyone?** A registry search must be performed, in Tanzania and in the relevant markets | The whole brand position depends on it | CTO + counsel |
| 2 | **Is there a real IP assignment from any real person to any real entity?** | Determines whether the group owns its software at all | Counsel |
| 3 | **Who are the actual contributors** to the codebase, and under what terms (employees, contractors, offshore)? | Drives the `D43` remediation | HR + CTO |
| 4 | **What open-source licences are in the products**, and are any copyleft? | `D45` | CTO |
| 5 | **Are the domains registered in an entity's name or an individual's?** | Domain control is a real-world control | CTO |
| 6 | **Is any AI model, dataset or weight in use, and on what terms?** | Licensing and personal-data exposure | CTO + DPO |
| 7 | **Which entity is *intended* to own each asset?** | Without this, no assignment can be drafted | Founder |
| 8 | **Is any asset held by a third party** (agency, developer, host, freelancer) without an assignment? | The most common real-world title failure | CTO |

## 8. Counsel review note — `[COUNSEL TO CONFIRM]`

1. What evidence **actually establishes title** for each asset type, and how complete a chain is needed.
2. Whether a **confirmatory assignment** can cure a historical gap, and its required formalities and
   consideration.
3. Whether **recordal** against a registration is required to make an assignment effective against third
   parties.
4. The **term, renewal and use requirements** for a Tanzanian trade mark — **the pack asserts no term**.
5. Whether any **foreign filing route** is available (and what is not — e.g. Madrid), and the preferred route
   (`Q-IP-02`).
6. The position on **AI-generated** material and on **model weights trained on third-party data**.
7. Whether a **trade secret** programme is adequate in the group's circumstances.
8. The **tax and exchange-control** consequences of assigning IP into or out of the group (`Q-TAX-03`,
   `Q-LEG-03`).

**This register is blank. Zero assets are verified. No chain of title is evidenced. Nothing here may be
presented to a counterparty, a bank, an investor, a regulator or a tax authority as a statement of
ownership.**
