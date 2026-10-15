# BEYU-LF-D06 — Initial Trust Property and Settlement Schedule (Asset Settlement and Transfer Mechanics)

Document ID: `BEYU-LF-D06`
Title: Initial Trust Property and Settlement Schedule (Asset Settlement and Transfer Mechanics)
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the mechanics for each asset class are **unverified**. **No
transfer has been effected under this protocol.**
Document owner: Company Secretary function + Finance OS authority (proposed)
Approving authority (proposed): Trustees (decision) + counsel (form) + Finance OS (accounting)
Next review date: On counsel's advice, and before the first settlement
Classification: `HIGHLY_RESTRICTED` when populated
Related documents: `D02` Schedule 1, `D07`, `D08`, `D10`, `D20`, `D40`, `D63`, `D67`, `D68`, `D74`
Depends on: counsel's answers to `Q-T-05`, `Q-TAX-03`, `Q-R-01`, `Q-R-02`; `DAA-TRUST-006`, `DAA-TRUST-007`

> **⚠ The single most important rule in this document.** **Listing an asset on a schedule, recording
> it in a register, describing it in a policy, entering it in the control plane, or marking it
> "transferred" in a software field DOES NOT TRANSFER IT.** A transfer requires the instrument and the
> filing/registration step that the law prescribes for that asset class. Until then, the asset belongs
> to whoever owned it before, and any statement to the contrary is a **defect**.
>
> **No asset is identified in this document. `[INITIAL TRUST PROPERTY]` has not been supplied.**

---

## 1. Purpose and standing

**1.1** To define, asset class by asset class, the **preconditions, instrument, filings, accounting and
evidence** required before any asset is treated as held by the Trust.

**1.2** This is an **operational protocol**, not a legal opinion. Every row marked `[COUNSEL TO
CONFIRM]` must be answered before the first settlement of that asset class.

**1.3** Standing: `PRELIMINARY_FRAMEWORK`. It may be used as a **checklist** and as the basis for a
conveyancing/transaction instruction. It may not be used to assert that any asset has been transferred.

---

## 2. The five-step vesting protocol (applies to every asset)

| Step | Name | What must happen | Who | Evidence produced |
|---|---|---|---|---|
| **V1** | **Title verification** | Confirm the transferor's title from the primary document (certificate of title, share certificate, registration certificate, policy, contract). Confirm no charge, lien, caveat, restriction, pledge or third-party right. Confirm the asset is not subject to a court order or a pending dispute. | Counsel + Company Secretary | Title opinion or verified title file; entry in `D63` (Legal Entity & Asset Master) |
| **V2** | **Authority to transfer** | Confirm the transferor has power to transfer: board/shareholder/trustee authority as applicable; spousal or co-owner consent where the asset is jointly held; regulator consent where required. | Counsel | Extracts of the authorising resolutions; consents |
| **V3** | **Instrument** | Execute the correct **written instrument** (deed of settlement, transfer deed, stock transfer form, assignment, novation) with the **execution formalities** confirmed by counsel (`Q-R-02`). | Parties | Executed original → `D74` |
| **V4** | **Filing, registration, stamping, consent** | Complete every **third-party step**: registry filing/registration, stamp duty, notarisation, exchange-control approval, regulator notification, counterparty consent/novation, bank mandate change. | Company Secretary | Filed forms with acknowledgement; stamped instrument; approvals |
| **V5** | **Accounting and register update** | Record the asset in the sole accounting authority; update the Asset and Liability Register (`D67`) and the Trust's asset schedule; only **then** set status `TRANSFERRED`. | Finance OS authority | Accounting entry reference; register entries; reconciliation sign-off |

**2.1 Mandatory sequencing.** V1 → V2 → V3 → V4 → V5. Steps may be prepared in parallel but **status may
only advance in order**. A skipped step must be recorded as an **open exception** and reported to the
Trustees and the Protector.

**2.2 Fail-closed rule.** If counsel has not confirmed the mechanic for an asset class, the asset class
is **NOT TRANSFERABLE under this protocol**. The Trust must not accept it, and the Trustees must not
describe it as Trust property.

**2.3 No "deemed transfer".** There is no concept of a deemed or software transfer. There is no back-dating.
There is no "we will document it later" status that changes ownership.

---

## 3. Asset-class mechanics (each row `[COUNSEL TO CONFIRM]`)

> The table states **what must be investigated and documented**, using generic transaction mechanics.
> It does **not** assert Tanzanian law. Where a cell says `[C]`, counsel must supply the answer.

### 3.1 Cash and bank deposits

| Item | Detail |
|---|---|
| Instrument | Written settlement/instruction to the bank; new account or mandate in the Trustees' names |
| Formalities | `[C]` Account-opening requirements; KYC for a trust; whether the trust/trustees need a TIN; whether the Cap. 318 route requires the corporate name |
| Third-party steps | Bank account opening in the Trustees' name; closure/transfer of the existing account; standing instructions; signatory change to two Trustees |
| Tax | `[C]` Any transfer tax; interest income treatment; withholding |
| Evidence | Bank confirmation; statement; accounting entry |
| Special risk | **Never commingle the Settlor's money with Trust money in an account the Settlor alone controls.** |

### 3.2 Shares in a private company

| Item | Detail |
|---|---|
| Instrument | Stock/share transfer form + board approval + delivery of the share certificate; or an issue of new shares to the Trustees |
| Formalities | `[C]` Whether the transfer instrument must be stamped; whether the company's articles restrict transfer (a private company's articles normally do); whether a shareholders' agreement requires consent |
| Third-party steps | Company registers the transfer; new share certificate in the Trust's/Trustees' name; **beneficial-ownership filing** with the registrar where required (`Q-H-05`) |
| Tax | `[C]` Capital gains tax on the disposal by the transferor; stamp duty; any relief for a settlement on trust |
| Evidence | Cancelled/returned certificate; new certificate; updated register of members; filing acknowledgement |
| Special risk | **Settlement may trigger CGT for the transferor even though no cash changes hands.** Counsel/tax must opine **before** execution. |

### 3.3 Land and buildings

| Item | Detail |
|---|---|
| Instrument | Deed of transfer/assignment; vesting instrument if the Trust is incorporated |
| Formalities | `[C]` Compulsory registration of the transfer; stamp duty; consent to transfer (occupancy/lease terms); spousal consent where applicable; whether the Ministry of Lands requires an approved form |
| Third-party steps | Registration at the land registry; issue of a title reflecting the Trust; land rent and rates records updated; where the Trust is incorporated, confirm whether any restriction applies to land holding |
| Tax | `[C]` Stamp duty, capital gains, any local levy |
| Evidence | Registered instrument; new certificate of title/right of occupancy; registry search |
| Special risk | **Land is the asset class most likely to be lost by an informality.** Do not accept any land item without a registry search and counsel's written mechanic. |

### 3.4 Intellectual property

| Item | Detail |
|---|---|
| Instrument | **Written assignment** (trade mark, copyright, design, patent) or licence; for copyright, a work-by-work assignment; for software, a source-and-contribution schedule |
| Formalities | `[C]` Trade-mark assignments must usually be **recorded** on the register to bind third parties; copyright assignment may or may not need recordal; whether notarisation/stamping is required; moral-rights waivers |
| Third-party steps | Register recordal for marks; domain transfers with registrar approval; open-source contribution confirmations |
| Tax | `[C]` Whether an assignment on trust is a disposal for tax purposes; withholding on royalties |
| Evidence | Executed assignment; register recordal receipt; register of members/owners |
| Special risk | **The repository contains no signed assignment whatsoever** (`D40` §Open title gaps). The IP register opens at **zero verified entries**. Any claim of ownership in the repository's sector fixtures is **not** evidence. |

### 3.5 Insurance policies and other contingent benefits

| Item | Detail |
|---|---|
| Instrument | Deed of assignment of the policy, or a trust endorsement / change of ownership with the insurer |
| Formalities | `[C]` Insurer's own form; whether assignment is permitted; consent; named-beneficiary rules |
| Third-party steps | Insurer records the change; premium payment mechanism updated |
| Tax | `[C]` Treatment of a policy held on trust; proceeds on death |
| Evidence | Endorsed policy; insurer's written confirmation; premium schedule |
| Special risk | **Contingent cover is never reported as an asset** (`D67`). Do not let a policy be described as "Trust wealth". |

### 3.6 Loans, receivables and other contractual rights

| Item | Detail |
|---|---|
| Instrument | Deed of assignment/novation (novation requires the counterparty's consent); notice of assignment to the debtor |
| Formalities | `[C]` Whether notice is required to perfect the assignment; whether stamp duty applies; whether a loan agreement prohibits assignment |
| Third-party steps | Counterparty consent/novation; notice to debtors; banking records |
| Tax | `[C]` Disposal consequences; interest withholding |
| Evidence | Executed assignment/novation; consent; notice and acknowledgement |
| Special risk | A "loan receivable" that is not recoverable is **not an asset**; do not list it at face value without an impairment decision. |

### 3.7 Entity interests and lower-tier holdings

| Item | Detail |
|---|---|
| Instrument | Per §3.2 for shares; for a partnership/LLP interest, the partnership's consent and the applicable transfer mechanism |
| Third-party steps | Company/partnership register; beneficial ownership filings up and down the chain; tax registrations |
| Evidence | Registers; certificates; filings |
| Special risk | The seeded structure shows a trust → holding → country holding → operating companies chain. **None of it exists in law.** Do not settle "an interest in the group" as if it were a single thing — settle specific shares in specific companies. |

### 3.8 Foreign assets

| Item | Detail |
|---|---|
| Precondition | Only **after** exchange-control, tax and data-protection advice (`Q-LEG03`, `Q-TAX-02`, `Q-DP-02`) |
| Instrument | Per the foreign jurisdiction's law |
| Third-party steps | Foreign registration; local counsel; reporting obligations in both jurisdictions |
| Evidence | Local opinion; filings; accounting entries |
| Special risk | Cross-border structures are the **highest-risk** area in this pack. No foreign asset may be accepted on the basis of an internal analysis without local advice. |

### 3.9 Digital assets, data and software accounts

| Item | Detail |
|---|---|
| Instrument | Written assignment of rights; account ownership transfer where the platform permits; a written record of what is **not** transferable |
| Formalities | `[C]` Whether the platform's terms permit transfer; whether a licence is all that can be given |
| Evidence | Account transfer confirmation; assignment; inventory |
| Tax | `[C]` |
| Special risk | **A software account is not an asset of the estate unless the terms of service permit transfer.** Where only a licence exists, record it as a licence, not as ownership. |

---

## 4. Prohibited acts (mandatory)

1. **No transfer before V1.** Never execute a transfer before title has been verified.
2. **No artificial status.** Never set a register field to `TRANSFERRED`, `OWNED`, `ACTIVE` or equivalent
   before V4 is complete.
3. **No fabricated references.** Never enter a certificate number, registration number, filing reference
   or date that has not been seen on a real document.
4. **No self-verification.** The person who prepared the transfer may not be the sole verifier of its
   completion.
5. **No overlooked encumbrance.** A transfer subject to an undisclosed charge is a breach of the
   Trustees' duty; verify with a registry search and a written warranty.
6. **No unauthorised asset class.** An asset class counsel has not cleared under `[COUNSEL TO CONFIRM]`
   may not be accepted onto trust.
7. **No cash-only trusts.** The Trust must not be presented as funded if the only "funding" is an
   internal accounting entry.

---

## 5. Control-plane interaction (record-keeping only)

| Step | Control-plane record | Caution |
|---|---|---|
| Title verification | `D63` asset record with `title_status = VERIFIED` and `title_evidence_ref` | Only after the document is inspected |
| Authority | Attach the resolution/consent to the asset record | An approval state is not authority |
| Instrument | `D74` register of executed instruments | The **executed original** is the evidence |
| Filing | `D68` obligation/filing record with acknowledgement reference | A calendar entry is not a filing |
| Accounting | The sole accounting source of truth | Trust software holds references only |
| Custody | `D67` custody field | Custody ≠ ownership; a Family Office custody record conveys no title |

**Forbidden.** (a) Bulk "ownership transfer" scripts or migrations; (b) setting an asset's owner by a
database update as though it were a legal act; (c) presenting a demo/seed asset as settled; (d) using an
AI output as a title opinion.

---

## 6. Decisions required from the user / family / governing bodies

1. Supply **Schedule 1 (Initial Trust Property)** — the actual list, asset by asset, **or** confirm that
   the Trust will initially hold only cash (`[USER TO SUPPLY]`).
2. Instruct counsel on the **asset classes actually intended** (do not spend on classes not used).
3. Confirm **who pays the transfer costs and taxes** (settlor or Trust) and how that is documented.
4. Confirm the **target timeframe** and whether any asset is intended to move before the instrument is
   executed (answer: no — this protocol forbids it).
5. Confirm whether **any asset will be held via a nominee/custodian**, and why.

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. For **each asset class intended**: the correct instrument; the formalities (writing, signature,
   witness, notarisation, stamping, registration, consent); the filing period; the consequence of
   missing a step; and whether the step is constitutive (title fails) or merely evidential.
2. **Tax** consequences of settlement per class, and whether any relief applies (`Q-TAX-03`).
3. **Beneficial-ownership** filings triggered by the settlement, and by the Trust being the registered
   holder (`Q-H-05(b)(e)`).
4. Whether a settlement is liable to be set aside on **creditor, insolvency or matrimonial** grounds and
   what protective steps (solvency statement, disclosure, timing) are appropriate.
5. Whether the Trust may hold **land**, and any restriction on the amount or the route.
6. Whether any asset requires **regulator or sector-licence approval** to be held by a trust.
7. Whether **exchange control** approval is required for any item.
8. Whether **data protection** restricts transferring records that accompany an asset (e.g. a customer
   list, a lease file, an employee file).
9. The **correct treatment of the Trust's name** on registers for each asset class (Trustees as
   individuals vs the incorporated body).

**No asset has been transferred. No item on this protocol has been completed. This document is a
checklist and a question list, not a record of any transaction.**
