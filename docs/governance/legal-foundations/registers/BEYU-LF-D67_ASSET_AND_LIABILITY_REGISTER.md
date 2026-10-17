# BEYU-LF-D67 — Asset and Liability Register

Document ID: `BEYU-LF-D67` · Version 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — **BLANK TEMPLATE. Not populated. No row describes a real person, asset, obligation, transaction, decision or document.**
Owner (proposed): Company Secretary function with the CFO. Approving authority: the board, and the Trustees for Trust assets.
Classification: `HIGHLY_RESTRICTED`. Related: `D05` §5.2, `D06`, `D30`, `D35`, `D63`, `D64`, `D68`, `D71`, `D74`. Depends on: `DAA-REG-001`; the assets themselves; counsel's answers on settlement mechanics (`Q-T-05`).

> **⚠ THE TWO PROHIBITIONS.**
> **1. NEVER enter a seeded, fixture or imagined asset.** The registers open at **zero**. `MU-TR-100241`,
> `DIFC-4471`, `TZ-NGO-00891`, the seeded percentages and the fixture trademark `TZ-2025-4421` **do not
> exist** (`GATE-0` §6–§7).
> **2. NEVER record "the group owns it".** Every row has a **named legal owner that exists**. An asset whose
> owner cannot be established is entered as **`OWNERSHIP UNESTABLISHED`** and escalated — **not guessed.**

---

## 1. Purpose

To answer, for every asset and liability: **who owns it, who holds it, who uses it, what it is worth and on
what basis, and what is owed.** This register is the anchor for the settlement schedule (`D06`), the IP
registers (`D40`, `D44`), the insurance review (`D71`) and the reporting (`D33`, `D38`).

## 2. Assets — field definitions

| # | Field | Definition | Required |
|---|---|---|---|
| 1 | Asset ID | `ASSET-###` | ✔ |
| 2 | Description | What it is, plainly | ✔ |
| 3 | **Legal owner (the entity)** | A named entity from `D63`; two owners = two rows | ✔ |
| 4 | **Ownership evidence** | Certificate, deed, register entry, invoice, contract — with the `D74` reference | ✔ |
| 5 | **Title status** | `VERIFIED` / `ASSERTED` / `CONTESTED` / `OWNERSHIP UNESTABLISHED` | ✔ |
| 6 | Registered holder (if different from the owner) | e.g. a nominee or custodian | If applicable |
| 7 | Custodian / location | Institution, vault, system, jurisdiction | ✔ |
| 8 | **Documents of title**: who holds them, and where | Cross-ref `D74` | ✔ |
| 9 | Operational user | Which entity uses it | ✔ |
| 10 | Encumbrance | Charge, pledge, lien, mortgage, restriction, or none | ✔ |
| 11 | Insurance | Policy, sum insured, expiry, cross-ref `D71` | ✔ |
| 12 | **Valuation** and **basis** (cost/market/income/independent/management) and **date** | A valuation without a basis and a date is not a valuation | ✔ |
| 13 | Currency | | ✔ |
| 14 | Acquisition date and consideration | | ✔ |
| 15 | Intended disposition | Hold / settle into trust / licence / sell — and the decision reference | Optional |
| 16 | Trust-settlement status (`D06`) | Not settled / settled (with the instrument reference) / not intended | ✔ |
| 17 | Review date | | ✔ |

**2.1 Asset classes to be covered** (each may need its own sub-schedule): cash and bank; receivables;
investments and securities; loans receivable; **shares and interests in entities**; real property; equipment
and vehicles; **intellectual property** (refer to `D40`/`D44` — do not duplicate the detail here);
inventory; **domains and digital assets**; insurance policies and their surrender values; pension/retirement
interests; **personal assets relevant to the structure** (only to the extent the family chooses to record
them, and with the privacy implications accepted); and contingent assets.

## 3. Liabilities — field definitions

| # | Field | Definition | Required |
|---|---|---|---|
| 1 | Liability ID | `LIAB-###` | ✔ |
| 2 | Description and type | Loan / trade payable / lease / tax / guarantee / contingent / other | ✔ |
| 3 | **Legal obligor (the entity)** | Named; **never "the group"** | ✔ |
| 4 | Counterparty | | ✔ |
| 5 | Principal, currency, interest, maturity | | ✔ |
| 6 | Security given, and by whom | | ✔ |
| 7 | **Guarantees given or received** | Including by the Trust or a family member — **cross-ref `D27` F-06 and `D04` §7 RM-07** | ✔ |
| 8 | Covenants and the headroom | With the test and the date | ✔ |
| 9 | Contingent liabilities | Claims, disputes, undertakings — cross-ref `D71` | ✔ |
| 10 | Evidence | The instrument, with the `D74` reference | ✔ |
| 11 | Status | Current / repaid / in default / disputed | ✔ |

## 4. Controls

| # | Control |
|---|---|
| C-01 | **No entry without evidence**; unsupported rows marked `ASSERTED` and escalated |
| C-02 | **Two owners = two rows.** No blurred ownership |
| C-03 | **Valuations carry a basis and a date**; a management estimate is labelled as such |
| C-04 | **The register is reconciled quarterly** with `D64` (shares), `D40`/`D44` (IP), `D71` (insurance/claims) and the accounting authority |
| C-05 | **No ledger functionality**: this register records **ownership and existence**, not balances. Balances live in the accounting authority (`FIR-018`) |
| C-06 | **Access** is restricted; the register reveals the family's position |
| C-07 | **Settlement into the trust** follows `D06` V1–V5; **a register entry never effects a transfer** |

## 5. Decisions required

1. Whether the register extends to **personal family assets** (and, if so, who may see them).
2. The **valuation policy** (who values, how often, what basis, what cost).
3. The **custodian** and the documents-of-title location.
4. Whether the register is held in the control plane, a governed repository, or both.

## 6. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **formal requirements** to record each asset class as owned (and the traps: nominee holdings, joint
   property, unregistered transfers).
2. Whether any asset **cannot lawfully be held** by the intended entity.
3. The **settlement mechanics** into a trust for each asset class (`Q-T-05`).
4. The **disclosure** consequences of recording personal assets.
5. Whether **security or guarantees** require registration to be effective.
6. The **tax** consequences of each holding and transfer.

**This register is blank. No asset or liability is recorded. Nothing here evidences that anything is owned or owed.**