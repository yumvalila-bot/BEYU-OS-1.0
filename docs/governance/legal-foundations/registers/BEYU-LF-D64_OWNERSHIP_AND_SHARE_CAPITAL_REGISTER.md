# BEYU-LF-D64 — Ownership and Share Capital Register Template

Document ID: `BEYU-LF-D64`
Title: Ownership and Share Capital Register Template
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — **BLANK TEMPLATE. Not populated. No row describes a real entity,
office, asset, obligation, transaction, decision or document.**
Owner: Company Secretary function (proposed)
Approving authority (proposed): each company's board (no board exists)
Next review date: On every capital event; verified annually
Classification: `HIGHLY_RESTRICTED` when populated
Related documents: `DC-01`, `D22`, `D23`, `D24`, `D30`, `D63`, `D65`, `D66`, `D74`
Depends on: the incorporation, the Articles, the share issues and transfers themselves

> **⚠ STATUS.** **No share exists. No share has been issued, transferred or bought back. This register is empty.**
The repository's seeded ownership percentages (96% / 85% / 81.6% and similar) are **demonstration data** and
must never be entered. **A cap table is only ever derived from the company's register of members** — never
from a model, a simulation, a plan or a dashboard (`D24` §1).


---

## 1. Purpose

To record, for every company: its **authorised and issued capital**, its **classes and rights**, and its
**holders** — with the evidence chain for each entry.

## 2. Schedule A — share capital and classes

| # | Field | Definition | Source |
|---|---|---|---|
| 1 | Company (ID from `D63`) | | `D63` |
| 2 | Class (A / B / other) | Exactly as in the Articles | The Articles |
| 3 | Nominal/par value | As stated | The Articles |
| 4 | Number authorised | If the constitution states a limit | The Articles |
| 5 | Number issued | From the register of members | Register of members |
| 6 | **Votes per share** | **Only from the executed Articles** — never from a proposal | The Articles; `D22` |
| 7 | Economic rights | Per the Articles | The Articles |
| 8 | Conversion / redemption features | With the clause reference | The Articles |
| 9 | Authority creating the class | The resolution + the filing | `D73`, `D74` |
| 10 | **Validity confirmed?** | Has counsel confirmed the class is lawfully created? | Counsel's opinion |
| 11 | Status | `PROPOSED` / `CREATED BUT UNISSUED` / `IN ISSUE` | Evidence |

**Schedule A is EMPTY. The `[1,000]`-vote Class B proposal must not appear as a created class until counsel
confirms it and the Articles are adopted (`DC-01`, `D22`).**

## 3. Schedule B — holders (the register of members)

| # | Field | Definition | Source |
|---|---|---|---|
| 1 | Holder name | As registered | The register of members |
| 2 | Holder type | Individual / trust (trustees) / company / nominee | The registration |
| 3 | Class and number of shares | | Register of members |
| 4 | Certificate reference | | The certificate |
| 5 | Date of registration | | Register of members |
| 6 | Consideration paid | With the evidence of payment | Bank confirmation / the `D06` record |
| 7 | Beneficial owner(s) | With the **regime's definition named** | `D65` |
| 8 | Restrictions | Charge, lien, escrow, pre-emption | The instrument |
| 9 | Transfer/transmission history | Reference to the instrument and the `D73` decision | `D74` |
| 10 | Evidence file | The subscription/transfer documents | `D74` |

**Schedule B is EMPTY.**

## 4. Schedule C — options, warrants and convertibles (**separate from shares**)

| # | Field | Note |
|---|---|---|
| 1 | Instrument | Option / warrant / convertible / ESOP |
| 2 | Holder | — |
| 3 | Number and class of underlying shares | — |
| 4 | Exercise terms, vesting and leaver provisions | — |
| 5 | Plan reference and approval | `D24` §2.4 |
| 6 | Tax position | `[TAX TO CONFIRM]` |

**Rule:** options are **never** shown as issued shares. **A cap table that shows options as shares is
misleading and is prohibited** (`D24` §7.3). **EMPTY.**

## 5. Schedule D — capital events log

| # | Event (issue / transfer / subdivision / reduction / buyback / conversion) | Date | Authority | Resolution | Instrument | Filing | Register updated | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | — | — | — | — | — | — | — | — |

**EMPTY.** Every event must follow the five-step protocol in `D24` §1.3 (S1–S5).

## 6. Controls

| # | Control |
|---|---|
| C-01 | **The register of members is the only source for Schedule B.** A cap table derived from anything else is prohibited |
| C-02 | No entry before the authority, the resolution, the instrument, the consideration and the filing exist (`D24` S1–S4) |
| C-03 | `votes_per_share` may be populated **only** from executed Articles |
| C-04 | Simulations are watermarked and never entered; a simulation may not be exported into this register |
| C-05 | Transfers require an adherence deed where the shareholders' agreement applies (`D23` cl. 12.7) |
| C-06 | Every entry cites its `D74` evidence file |
| C-07 | Annual verification against the register of members, the certificates and the registry filings |

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **statutory form and contents** of the register of members, where it must be kept, and any inspection
   right.
2. Whether **share certificates** are required, and their form.
3. Whether **treasury shares** are permitted.
4. The **filing** required for each capital event, and the period (`Q-R-01`).
5. Whether a **trust** may be registered as a member, and in what name (`Q-H-05(b)`).
6. The **stamp duty** position on issues, transfers and buybacks.

**This register is empty. No share exists. No cap table exists.**
