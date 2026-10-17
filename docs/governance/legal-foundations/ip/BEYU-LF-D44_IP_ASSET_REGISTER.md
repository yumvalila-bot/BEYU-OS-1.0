# BEYU-LF-D44 — Trademark, Copyright, Domain, Design, Database, Documentation, Dataset and Trade-Secret Register

Document ID: `BEYU-LF-D44`
Title: Trademark, Copyright, Domain, Design, Database, Documentation, Dataset and Trade-Secret Register
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — **the register is BLANK. No asset is recorded. No registration,
renewal, filing or verification is evidenced.**
Document owner: Group CTO function (proposed) with counsel and the Company Secretary function
Approving authority (proposed): each board
Next review date: Quarterly (until stable); then annually
Classification: `HIGHLY_RESTRICTED`
Related documents: `D39`, `D40`, `D41`, `D42`, `D45`, `D46`, `D47`, `D63`, `D68`, `D71`, `D74`
Depends on: the registry-source rule (§5); `Q-IP-02`, `Q-IP-03`; the fixture quarantine (`GATE-0` §7)

> **⚠ RELATIONSHIP TO `D40` — READ THIS SO THE TWO REGISTERS ARE NOT CONFUSED.**
> **`D40` is the chain of title**: *who owns it, and on what evidence.*
> **`D44` is the asset and obligations register**: *what exists, what it is registered as, when it must be
> renewed, what it is used for, and what risk attaches to it.*
> **They are reconciled quarterly. Where they disagree, `D40` (title) governs the ownership question and
> `D44` (asset) governs the maintenance question — and the disagreement itself is logged as a defect.**

---

## 1. Purpose

To hold, **per asset and per right-type**, the operational facts needed to maintain, renew, protect and use
each asset — and to be the feeder for the compliance calendar (`D68`).

## 2. Register templates by asset class

### 2.1 Trade marks (wordmarks, devices, logos, slogans, sub-brands)

| # | Field | Note |
|---|---|---|
| 1 | Asset ID (link to `D40`) | — |
| 2 | Mark (exact representation) | The **exact** form filed/used; attach the image reference |
| 3 | Mark type | Word / device / combined / slogan / series |
| 4 | Classes and goods/services | **Per class** — the pack verified that applications are made per class (`D40` §5.2) |
| 5 | Registry and territory | Named |
| 6 | Application/registration number | **From the registry** |
| 7 | Filing date, registration date | From the registry |
| 8 | **Term and renewal date** | **`[COUNSEL TO CONFIRM]` — the pack asserts NO term (`D40` §5.2)** |
| 9 | Registered proprietor | As on the certificate |
| 10 | Agent of record | Where a local agent is required |
| 11 | **Evidence of use** | Invoices, material, dated samples — **necessary to defend against a non-use attack** |
| 12 | First use date and territories | Evidence-anchored |
| 13 | Watch/monitoring arrangement | If any; **and it must be a real service, not a fixture claim** |
| 14 | Encumbrances / licences / co-existence agreements | `D42` |
| 15 | Renewal owner and diary reference | `D68` |
| 16 | Status | `IDEA` / `SEARCHED` / `FILED` / `GRANTED` / `OPPOSED` / `LAPSED` / `NOT REGISTERED` |

**EMPTY. No mark is recorded. In particular, the fixture "registration `TZ-2025-4421`" must NOT be entered —
it does not exist.**

### 2.2 Copyright works (software, documentation, content, designs, artwork, video)

| # | Field | Note |
|---|---|---|
| 1 | Asset ID | — |
| 2 | Work description and version | — |
| 3 | Creator(s) | Named; employee/contractor/agency |
| 4 | **Assignment/licence chain** | Link to `D40` |
| 5 | Repository / storage location and its **owning account** | `D35` §2 C-05 |
| 6 | Publication status and date | — |
| 7 | Third-party/open-source components | Link to `D45` |
| 8 | AI involvement | Tool, extent, and the rights-status question |
| 9 | Registration | **Only if a voluntary copyright registration regime applies** — `[COUNSEL TO CONFIRM]` |
| 10 | Evidence of authorship/creation | Dated files, commit history, design files, witnesses |

**EMPTY.**

### 2.3 Domains, DNS and digital assets

| # | Field | Note |
|---|---|---|
| 1 | Domain / subdomain / handle | — |
| 2 | **Registered owner (the entity, not a person)** | Mandatory |
| 3 | Registrar and **account holder**; two-person control? | `D35` §2 |
| 4 | Registration and **expiry date** | → `D68` with **at least two reminders** |
| 5 | Auto-renew enabled? Payment method under entity control? | A lapse here is a public event |
| 6 | DNS provider, key records, DNSSEC, **who may change DNS** | `D47` procedure |
| 7 | Certificate/SSL management owner and expiry | — |
| 8 | Mail records and sending domains (SPF/DKIM/DMARC) | Brand and security |
| 9 | Social handles, app-store accounts, payment/API accounts | Same discipline: **entity-owned, two-person control** |
| 10 | Recovery/maintenance contacts | Entity contacts, not personal |

**EMPTY.** **Rule: a domain registered in an individual's name is a risk item, not an asset.**

### 2.4 Designs, databases and datasets

| # | Field | Note |
|---|---|---|
| 1 | Asset ID and description | — |
| 2 | Right type | Registered design / unregistered design / database right (where recognised) / contractual only / **none established** |
| 3 | Creator and chain | `D40` |
| 4 | For datasets: **source, lawful basis, licence terms, personal-data content, restrictions** | `D70` |
| 5 | For datasets: **permitted uses and prohibited uses** in plain words | Critical for AI training and analytics |
| 6 | Retention and deletion obligations | `D70` |

**EMPTY.**

### 2.5 Trade secrets and know-how

| # | Field | Note |
|---|---|---|
| 1 | Secret ID and description (kept at a **controlled** level of detail) | — |
| 2 | Owner entity | — |
| 3 | **Secrecy measures**: access list, marking, encryption, physical control | The protection **is** the measures |
| 4 | Persons with access (and their confidentiality instruments) | `D15`, `D43` |
| 5 | **Disclosures made** (and under what NDA or exception) | An undisclosed NDA-less disclosure may destroy protection |
| 6 | Value rationale | Why this is a secret worth protecting |
| 7 | Incident history | — |
| 8 | Review date | — |

**EMPTY.**

## 3. Verification statuses

| Status | Meaning |
|---|---|
| `VERIFIED` | A human has inspected the source (registry certificate, instrument, account) and the reference is recorded |
| `ASSERTED` | Someone claims it; no source inspected |
| `EXPIRED` / `LAPSED` | The period has passed and the right is lost or unenforceable |
| `CONTESTED` | Opposed, challenged, or in dispute (`D71`) |
| `NOT REGISTERED` | Deliberately or actually unregistered |
| `OWNERSHIP UNESTABLISHED` | Title cannot be shown (`D40`) |

**Rule: no row above `ASSERTED` may be reported to a board, a bank, an investor or a counterparty as a fact.**

## 4. The renewal and obligation feed

| # | Rule |
|---|---|
| 1 | **Every dated obligation in this register creates a `D68` entry**, with at least two reminders (a long-lead and a short-lead) |
| 2 | **No renewal date is entered from memory, a spreadsheet or an unverified source** — only from the registry |
| 3 | The renewal owner is **named**; an unowned renewal is treated as a risk item |
| 4 | **A missed renewal is reported as an incident** (`D71`), with the cause and the remedy attempt — **not quietly corrected** |
| 5 | Where the group decides **not** to renew, the decision and the reason are recorded (a deliberate abandonment is legitimate; an accidental lapse is not) |
| 6 | Where a **use requirement** applies, evidence of use is collected **in the ordinary course**, not reconstructed in a hurry |

## 5. Source discipline (the rule that prevents embarrassment)

**5.1 Primary-source rule.** Registration numbers, dates, classes, proprietors, terms and renewal dates are
recorded **only** from the registry's own output (a certificate, a published record, or a registry
acknowledgement), and the source is cited in the row.

**5.2 The trade-mark term is unresolved.** The pack found the Tanzanian term reported as **7 years** in one
source and **10 years** in another, and the repository fixture asserts 10. **No term and no renewal date is
asserted here**, and **no calendar entry may be created from any of them** until counsel confirms
(`Q-IP-02`; `LEGAL_SOURCES_REGISTER.md` `IP-3`).

**5.3 Fixture quarantine.** The sector demonstration dataset's trade-mark record (including the
"Madrid Protocol" filing, which is **impossible** because Tanzania is not a Madrid member) must never be
imported here (`D39` §1; `GATE-0` §7).

## 6. Controls

| # | Control |
|---|---|
| C-01 | Reconciliation with `D40` quarterly; discrepancies logged as defects |
| C-02 | No entry without a source; no source without a `D74` reference where the source is an instrument |
| C-03 | **Registry verification** at least annually for every registered right the group relies on |
| C-04 | Renewal diaries are **tested** (does the reminder actually arrive, and is the owner still in post?) |
| C-05 | Access is least-privilege (the register reveals strategy and gaps) |
| C-06 | Any change of agent, registrar, DNS provider or account holder is a **controlled change** requiring the `D47`/`D46` approval |
| C-07 | The register is not a marketing document and must never be published in any form |

## 7. Decisions required

1. **Which registrations the group will pay for** — markets, classes, and the annual budget.
2. Whether to engage a **watch service**, and for which markets.
3. The **domain portfolio policy** (which domains are defensive registrations, which are operational).
4. Who owns the **registrar and DNS accounts**, and who is the second controller.
5. Whether to record **evidence of use** systematically (recommended) and who does it.

## 8. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **term, renewal and use** requirements for a Tanzanian trade mark — **the pack asserts no term**.
2. Whether a **voluntary copyright registration** or deposit exists as a practical option.
3. Whether **design registration** is available and worthwhile for the group's products.
4. Whether **database rights** exist in the relevant jurisdictions.
5. The requirements to maintain a **trade-secret** claim.
6. What a **registry search** should cover before adopting a new mark, and whether a clearance search is
   advisable (`D46` §6.5).
7. The **recordal** requirements for licences and assignments (`D42`, `D41`).
8. Whether any **social handle, app-store or payment account** the group relies on is held in a person's
   name, and how to transfer it lawfully.

**This register is blank. No asset, registration, renewal or filing is recorded. Nothing here may be
reported as a fact.**
