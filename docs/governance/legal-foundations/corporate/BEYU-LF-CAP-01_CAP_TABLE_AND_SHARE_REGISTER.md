# BEYU-LF-CAP-01 — Cap Table, Share Ownership Register and Equity Evidence Standard

Document ID: `BEYU-LF-CAP-01`
Title: Capitalisation Table, Share Ownership Register and Equity Evidence Standard
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE` — the cap table is BLANK BY DESIGN. There are ZERO verified shareholders, ZERO verified
issued shares and NO verified ownership of any entity in this group.**
Owner (proposed): Company Secretary function · Approving authority (proposed): the board; the shareholders for
any issue or transfer
Next review date: On counsel's markup; then **on every issue, transfer, cancellation, option grant or
conversion** (this document is never "done")
Classification: `HIGHLY_RESTRICTED`
Related: `D22`, `D23`, `D24`, `D64`, `D66`, `D67`, `D69`, `D72`, `D73`, `D74`, `FA-01`, `INC-01`, `ESOP-01`,
`FIN-03`, `FIN-04`, `FIN-07`
Depends on: the incorporation of at least one entity (`INC-01`); a **share register** and the instruments that
support each holding; counsel on the lawfulness of each class and issue

> **⚠⚠ THE CENTRAL RULE OF THIS DOCUMENT.**
> **This cap table is EMPTY. It is empty on purpose, and it must stay empty until documentary evidence
> establishes each holding.** There is no share issued to anyone in this group: **`D21` is `BLOCKED`, no
> constitutional document exists, no certificate of incorporation has been seen, and the shareholders'
> agreement is a draft.** The repository's `founder_profiles`, `equity_positions`, `share_classes` and
> `cap_table_snapshots` tables and their seeded rows are **software records and demonstration data** — they
> are **not** evidence of ownership (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6).
> **INVENTING A CAP TABLE WOULD BE THE MOST DAMAGING ERROR AVAILABLE IN THIS ENTIRE EXPANSION.** It would
> create a false record of ownership on which tax, filings, fundraising, trusts and inheritance could later
> rely. **A blank cap table is correct; a plausible one is a defect.**

---

## 1. Why this is empty, and what would change that

| # | Prerequisite for a single row to exist | Status |
|---|---|---|
| 1.1 | **A legal entity exists** (a certificate inspected) | **NOT MET** |
| 1.2 | **Constitutional documents** exist and specify the share classes and numbers | **NOT MET** (`D21` `BLOCKED`) |
| 1.3 | **A share issue was validly decided** (board/shareholder resolution as the law requires) | **NOT MET** (`D24`) |
| 1.4 | **Consideration was dealt with** as the law requires | **NOT MET** (`D24` §1.3 S3) |
| 1.5 | **The register of members was written up** | **NOT MET** (`D64`) |
| 1.6 | **A certificate/statement was issued** where required | **NOT MET** |
| 1.7 | **Any required filing** was made and acknowledged | **NOT MET** (`D68`) |

**1.8 The test.** **A row enters this table only when every applicable box in §1 is evidenced.** Until then the
row does not exist — and neither does any percentage, any "founder owns X%", any valuation, or any
fully-diluted figure.

## 2. The cap table (BLANK BY DESIGN)

### 2.1 Issued and outstanding — VERIFIED

| Holder (legal name) | Entity | Class | Number of shares | Paid up? | Consideration | Date of issue | Register ref (`D64`) | Instrument ref | Evidence (`D74`) |
|---|---|---|---|---|---|---|---|---|---|
| *— NO VERIFIED HOLDING —* | | | | | | | | | |

**Subtotal — issued and outstanding: `0` (zero verified shares).** Any figure here without the columns behind
it is a fabrication.

### 2.2 Authorised / proposed capital (not ownership)

| Entity | Class | Authorised number | Rights (short) | Source (constitutional document, clause) | Status |
|---|---|---|---|---|---|
| *— NOT ESTABLISHED —* | | | | | `D21 BLOCKED` |

**2.2.1 Authorised ≠ issued ≠ owned.** A number in this table describes **authority to issue**, not
ownership, and must never be aggregated with §2.1.

### 2.3 Rights comparison (the "rights strip" — the practical test)

| Feature | Class A | Class B | Preference class | Ordinary |
|---|---|---|---|---|
| Votes per share | `[ ]` | `[ ]` (*proposal: 1,000 — `UNAPPROVED`, `Q-H-01`*) | `[ ]` | `[ ]` |
| Dividend rights | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Liquidation preference | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Conversion / redemption | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Transfer restrictions | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| Class-consent (veto) matters | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

**2.3.1 The economic-rights rule (`D22`).** If the design is dual-class, **the classes must have equal
economic rights per share**; the only difference intended is voting. **A class that takes more money per
share for the same contribution is not a governance design, it is a transfer of value** — and it has tax,
trust and fairness consequences the family must decide on purpose (`Q-H-01(c)`).

### 2.4 Options, convertibles and the pool (not shares)

| Instrument | Holder | Shares under option | Exercise price | Vesting | Grant date | Plan ref | Vested / unvested | Status |
|---|---|---|---|---|---|---|---|---|
| *— NONE GRANTED —* | | | | | | `ESOP-01` | | |

**2.4.1** An option is **not** a share, gives **no** voting rights unless the instrument says so, and enters
the fully-diluted figure only when validly granted under an approved plan with a signed grant instrument.

### 2.5 Convertibles

| Instrument | Holder | Principal | Conversion basis | Cap/floor | Maturity | Status |
|---|---|---|---|---|---|---|
| *— NONE —* | | | | | | |

**2.5.1** `[COUNSEL TO CONFIRM]` whether any convertible constitutes a **security** requiring a filing, a
disclosure document or an exemption — **and whether the family may lawfully issue it at all.**

### 2.6 Fully diluted (the three-figure discipline)

| Figure | Definition | Value | Evidence required |
|---|---|---|---|
| **A. Issued and outstanding (verified)** | Shares actually issued and registered | **0** | §2.1 rows |
| **B. Reserved but unissued** | Shares authorised for the ESOP pool and other reservations | **0** | An approved plan + a shareholder resolution |
| **C. Committed but not issued** | Options granted, convertibles, warrants | **0** | Signed grant/convertible instruments |
| **A + B + C — fully diluted** | The denominator a fundraise uses | **0** | All of the above |

**2.6.1 Prohibited arithmetic.** Do **not** compute, state or circulate a fully-diluted total, a post-money
percentage, or a dilution figure unless A, B and C are each evidenced. **`[BLANK]` is the only honest value
while `D21` is `BLOCKED`.**

## 3. Where the numbers come from (and where they must not)

| Source | May it populate the cap table? | Why |
|---|---|---|
| **The register of members** (`D64`), written up from a valid issue | **YES — the primary source** | It is the statutory record of membership |
| The share certificates/statements | **YES — corroborating** | Evidence of the entry |
| The board/shareholder resolution authorising the issue | **YES — the authority** | Links authority to entry (`D73`) |
| The accounting records / consideration evidence | **YES — the consideration** | `D69` |
| Any registry filing the entity has made | **YES — corroborating** | But a filing is not the register |
| **`equity_positions` / `share_classes` / `cap_table_snapshots` rows** | **NO — a system record only** | Software never creates title (`DEFINED_TERMS` §2) |
| A **spreadsheet** maintained by anyone | **NO — never the source** | Spreadsheets drift; they may be a *check*, not the record |
| A **seeded/demo** row, fixture, demo ID or scenario | **NO — never** | `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6 |
| **Anyone's recollection** ("we agreed he had 20%") | **NO — evidence required** | The classic origin of a shareholder dispute |
| An **AI output** | **NO — never** | `D31` §6; `DEFINED_TERMS` §2 |

## 4. Evidence standard for a single holding

For **each** holding, the following must exist before the row is treated as verified:

| # | Item | Where it lives | Present? |
|---|---|---|---|
| 4.1 | Constitutional document showing the class and its rights | `D74` | ☐ |
| 4.2 | The **resolution** authorising the issue/allotment | `D28`, `D73` | ☐ |
| 4.3 | Evidence the **consideration** was received or otherwise dealt with | `D69` | ☐ |
| 4.4 | The **register of members** entry, dated | `D64` | ☐ |
| 4.5 | The **share certificate/statement** (or the reason none was issued) | `D64` | ☐ |
| 4.6 | Any **statutory filing** made in respect of the issue | `D68` | ☐ |
| 4.7 | The **transfer instrument** for any transferred share, duly executed and stamped (if stamping applies) | `D74` | ☐ |
| 4.8 | The **beneficial-ownership** analysis for the holder (where relevant) | `D65` | ☐ |
| 4.9 | Confirmation the holder is **not a sanctioned person / a prohibited holder** where the law imposes restrictions | `CMP-01` | ☐ |

**4.10 The finding rule.** Where a holding is asserted but 4.1–4.5 cannot be produced, the correct entry is
**`OWNERSHIP UNESTABLISHED`**, not a number with a footnote. **`D68` records the gap; `D74` holds what exists;
the register (`D63`) shows the entity's documents as incomplete.**

## 5. Reconciling the cap table with the control plane

| Control-plane table | What it holds | Reconciliation rule |
|---|---|---|
| `equity_positions` | Holder, class, shares, vested/unvested, evidence references | **Every row must resolve to a `D64` register entry.** Rows without one are `UNSUPPORTED` and are flagged in `CAP-01` §4 |
| `share_classes` | `authorized_shares`, `issued_shares`, `votes_per_share`, `approval_ref` | Compare with the constitutional document **clause by clause**; any mismatch is a finding (`X-7`) |
| `vesting_schedules` / `vesting_events` | Vesting terms and events | Must match `FA-01` Schedule D and `ESOP-01`; a schedule with no instrument is `UNSUPPORTED` |
| `esop_plans` / `esop_grants` | Pool, grants, exercise price, events | Must resolve to an executed grant instrument and a shareholder resolution |
| `cap_table_snapshots` | A computed snapshot with `reconstruction_basis` | **A snapshot is an output, never a source.** Any snapshot whose totals cannot be rebuilt from §2.1, §2.4 and §2.5 **must not be relied on** |
| `dilution_scenarios` | Scenario modelling | **Illustrative only** — must never be presented as a cap table or a forecast of ownership |
| `founder_profiles` | `founder_status`, transfer restrictions, voting/economic summaries | Descriptive fields, **not title**; populated from the constitutional documents |
| `change_of_control_events`, `leaver_cases` | Event records | Must resolve to an instrument; a leaver case without a decision and a register update is unresolved |

**5.1 The snapshot discipline.** `cap_table_snapshots` carries `authorized_shares`, `issued_shares`,
`outstanding_shares`, `vested_shares`, `unvested_shares`, `esop_pool_shares`, `esop_granted_shares`,
`options_outstanding`, `treasury_shares`, `cancelled_shares`, `fully_diluted_shares`, `breakdown`,
`reconstruction_basis` and `computed_by`. **A snapshot may be produced only when (a) the register is current;
(b) each component resolves to an instrument; and (c) `reconstruction_basis` states how it was rebuilt.**
A snapshot labelled from seed data is **void for any legal, tax, filing or fundraising purpose**.

## 6. The register of members (`D64`) — the legal record

| # | Rule |
|---|---|
| 6.1 | The **register of members is the record of who holds what.** The cap table is a **presentation** of it (`D64`) |
| 6.2 | The register must show name, address, class, number, amount paid, date of entry and date of cessation |
| 6.3 | Where the law requires rectification or a court order to correct an entry, **that is the route** — never a silent edit |
| 6.4 | The register is kept at the registered office or where the law requires, and is **open to inspection** to the extent the law provides |
| 6.5 | **A discrepancy between the register and the cap table is resolved in favour of the register**, and the cap table is corrected and the correction recorded |
| 6.6 | The register is **never edited to reflect an intention.** An entry follows an issue/transfer that has actually occurred |

## 7. Valuation (only when a real transaction requires it)

| # | Rule |
|---|---|
| 7.1 | No valuation exists in this pack. **No valuation figure may be inserted** without a valuation report or a documented transaction price |
| 7.2 | A **methodology** is not a valuation. If a director needs a *view* for a purpose, it is labelled **`MANAGEMENT ESTIMATE`** with the basis, the date and the author, and it may not be used for tax, filings or a share issue |
| 7.3 | The choice of methodology and the discount applied `[COUNSEL/ACCOUNTANT TO CONFIRM]` |
| 7.4 | An **issue below fair value** raises duties questions for the directors and tax questions for the recipient |
| 7.5 | A valuation prepared for a **regulatory filing** may need a **qualified valuer** — `[COUNSEL TO CONFIRM]` |

## 8. Decisions required from the user / family / governing bodies

1. **The structure** (`INC-01` §1) — the gate.
2. The **classes and rights**, including whether the dual-class proposal is adopted (`Q-H-01`).
3. Whether the **Trust** holds shares, directly or through a holding company, and how beneficial ownership is
   declared (`D65`).
4. The **ESOP pool** size and whether it dilutes the founders (`ESOP-01`).
5. Whether any **founder holds shares that are not fully paid**, and the consequences.
6. The **transfer restrictions** to be recorded (`D23` §5).
7. Who maintains the register, and who **audits** it (`D26`).
8. Whether any **shareholder is a minor** or a person without capacity, and the representation arrangements.

## 9. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether any **share has been validly issued**, and whether the consideration was adequate (the family
   should be prepared to be told that **some or all of what it believes to be a holding is not one**).
2. Whether share classes with differential **voting** are lawful, and whether equal **economic** rights are
   required (`Q-H-01`).
3. Whether **equal economic rights per share** is satisfied by the intended design.
4. Whether any class-consent/veto right is enforceable, and against whom.
5. Whether a **transfer restriction** is enforceable, and its interaction with the register (`D22` §6).
6. The **stamp duty** and filing consequences of an issue or transfer `[ACCOUNTANT TO CONFIRM]`.
7. Whether any **minority holder** has a statutory remedy that the structure may trigger.

**The cap table is blank. Zero shares are verified. No entity in this group has a verified owner.**