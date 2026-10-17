# BEYU-LF-D24 — Share Issuance, Subscription, Transfer, Pre-emption, Dilution and Buyback Procedures

Document ID: `BEYU-LF-D24`
Title: Share Issuance, Subscription, Transfer, Pre-emption, Dilution and Buyback Procedures
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — every procedure below is **unverified**. **No share has been issued,
transferred, subdivided, bought back or cancelled. The register is empty.**
Document owner: Company Secretary function (proposed) with Finance OS authority
Approving authority (proposed): the board and the shareholders as the Articles and the law require
Next review date: Annually, and on any capital event
Classification: `HIGHLY_RESTRICTED` when populated
Related documents: `DC-01`, `D20`, `D21` (BLOCKED), `D22`, `D23`, `D27`, `D28`, `D29`, `D33`, `D59`,
`D64`, `D65`, `D66`, `D68`, `D72`, `D74`
Depends on: counsel's answers to `Q-H-01`, `Q-H-04`, `Q-H-05`, `Q-H-06`, `Q-TAX-03`, `Q-R-01`

> **⚠ THE ANTI-FABRICATION RULE.**
> **A share exists when — and only when — it has been validly created and issued under the company's
> constitution and the applicable law, the consideration has been dealt with as the law requires, and the
> share register reflects it.**
> **A register entry, a certificate, a spreadsheet, a cap-table screenshot, a control-plane row, a
> dashboard total, an approval workflow, a "simulation", or an AI output CANNOT create a share, transfer a
> share, or evidence that a share exists.** Software records **follow** the legal act; they never produce it.
> The repository's seeded ownership percentages (96% / 85% / 81.6% and similar) are **demonstration data
> and must never be entered into any register** (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6).

---

## 1. Purpose, scope and the five-step share protocol

**1.1 Purpose.** To define the **only** lawful routes by which the company's share capital may change or a
share may move, with the evidence required at each step, so that no share is ever recorded as existing
without the underlying acts.

**1.2 Scope.** Applies to the holding company (see `D20`) and, adapted, to any group company, including the
country holdings and the sector operating companies (`D30`), and to any ESOP shares.

**1.3 The five-step share protocol (identical structure to the asset protocol in `D06`).**

| Step | Name | What must happen | Evidence |
|---|---|---|---|
| **S1** | **Authority** | Confirm the power exists: the Articles, the applicable law, and (where relevant) the shareholders' agreement, the Trust instrument, and `D27`. Confirm the required resolutions and consents. | Counsel's confirmation of the power; the resolution; the consents |
| **S2** | **Approval** | Pass the **resolutions** (board and/or shareholders and/or class) with the required majorities, and obtain any Reserved Matter or class consent. | Signed resolutions (`D28` templates) → `D73`, `D74` |
| **S3** | **Consideration / terms** | Establish and document the consideration (money, property, services — `[COUNSEL TO CONFIRM]` what is permitted), the payment evidence, the price basis, and any valuation. **For an issue to a related party, comply with `D72`.** | Subscription agreement; bank confirmation / valuation; the `D72` entry |
| **S4** | **Execution and filing** | Execute the documents (subscription, transfer instrument, buyback agreement); deal with any stamp duty; make every **filing** (registry, beneficial ownership, tax) within the statutory period. | Executed instruments → `D74`; filed forms + acknowledgements → `D68` |
| **S5** | **Register and certificate** | Update the **share register** and the shareholders' register; issue/cancel/replace the certificate; record the event in `D64`, `D65` (beneficial ownership), `D66` (if an office changes as a result) and the accounting records. **Only then is the event complete.** | Updated register; certificate; `D64`/`D65` entries; accounting entries |

**1.4 Sequencing is mandatory.** S1 → S2 → S3 → S4 → S5. **No step may be back-dated. A step that was not
taken is recorded as an open exception, not as completed.**

**1.5 Fail-closed rule.** Where counsel has not confirmed the mechanic (the power, the form, the filing,
the tax), the transaction **must not proceed**, and no register may be opened for it.

---

## 2. Issue and subscription (`DAA-HOLD-002` applies: no share exists)

**2.1 Preconditions.**

| # | Precondition | Who confirms |
|---|---|---|
| 1 | The company is validly incorporated and its constitution is in force | Counsel / Company Secretary |
| 2 | The Articles authorise the class and the number of shares | Counsel (`Q-H-01(a)`) |
| 3 | The board is validly constituted and quorate for the decision | Board / Secretary |
| 4 | Any shareholder resolution required has been passed | Shareholders |
| 5 | Any class consent required has been given | The class |
| 6 | Any Reserved Matter approval has been given (`D27`) | Per `D27` |
| 7 | If the subscriber is the **Trust**: the Trustees have taken a written decision under the Trust
 instrument, recorded their reasons, and confirmed the source of funds is lawfully available | Trustees (`D04`, `D08`) |
| 8 | If the subscriber is a **related party**: the `D72` process is complete | Board (disinterested) |
| 9 | The consideration is lawful and evidenced; any valuation is documented | Counsel / Finance |
| 10 | Tax advice on the issue (including for the subscriber) is in hand | Tax adviser (`Q-TAX-03`) |
| 11 | Beneficial ownership information for the subscriber is obtained | Secretary (`D65`) |

**2.2 Procedure.**

1. **Board resolution** approving the issue (purpose; class; number; price; subscriber; terms; authority to
   execute). Record in `D28`/`D73`.
2. **Shareholder/class approval** where required by the Articles, by `D27`, or by the law.
3. **Subscription agreement / application** executed by the subscriber (template: `D37` §Shares or a
   purpose-drafted agreement). **Never accept an unwritten subscription.**
4. **Consideration** received and evidenced — for a cash subscription, the actual funds into the company's
   bank account (not a journal entry, not an inter-company set-off unless lawfully agreed and documented).
   For a non-cash subscription, a documented valuation and the transfer of the asset (using `D06`).
5. **Filing** — registry return of allotment/issue where required, plus beneficial-ownership filings.
6. **Register** — the share register and certificates updated; the cap table updated **from the register,
   never independently**.
7. **Accounting** — the share capital and premium recorded in the **sole accounting authority**.
8. **Post-completion** — record in `D64`, `D65`, `D68`, `D74`; confirm the next obligation dates.

**2.3 Anti-dilution notice.** Before approving an issue, the board must confirm: (a) whether the issue
triggers **pre-emption**; (b) whether any class consent is required; and (c) that the effect on each
existing holder has been calculated **and disclosed to the members**. **An issue that dilutes a member
without the required process is a breach, and the members must be told what has happened.**

**2.4 ESOP and employee shares.** Under `D27`, employee equity is a distinct matter:

| Item | Requirement |
|---|---|
| Plan adopted | A written plan approved by the required resolutions (`[COUNSEL TO CONFIRM]` which), and by any class consent |
| Pool created | Either new shares (issue route, §2) or existing shares transferred (transfer route, §3) — **the choice changes the accounting, the tax and the dilution** |
| Grant instrument | A written grant/option deed per participant (with `D41` IP assignment where the participant is a worker) |
| Vesting and leaver terms | In the plan and the grant deed — **`[COUNSEL TO CONFIRM]` enforceability of leaver provisions** |
| Tax | `[TAX TO CONFIRM]` for the company and the participant, at grant, vest and exercise/sale |
| Register discipline | **No share is issued until exercised/allotted lawfully**; option holders are **not** members; an option is not a share and must never appear as one in a register or a cap table (**only in a separate option register**) |
| Related party | A grant to a family member, director or the Trust's trustees is a `D72` matter |

---

## 3. Transfer

**3.1 Preconditions.** (a) the transferor owns the share (verify against the register); (b) the transfer
complies with the Articles' restriction on transfer (a private-company characteristic as read);
(c) pre-emption has been completed or waived as the Articles require; (d) any board consent has been given;
(e) any class consent required has been given; (f) the transferee has executed an **adherence deed**
(`D23` clause 12.7) if the shareholders' agreement applies; (g) the transferee's beneficial-ownership
information is obtained; (h) the transferee is not a person to whom transfer is prohibited (including by a
sanctions or licence restriction, or by the class-conversion mechanics for Class B — `D22` §4.2 T-1).

**3.2 Procedure.**

1. Transferor's written notice of intention (and, where required, the pre-emption offer to the other
   members, with a deadline).
2. Waiver, expiry, or acceptance of pre-emption, recorded.
3. **Transfer instrument** executed (share transfer form or equivalent; `[COUNSEL TO CONFIRM]` the form,
   the stamp duty and the witnessing requirements).
4. **Board approval** recorded (and the resolution must show the class and the conversion consequence for
   Class B, if any).
5. If required, **conversion of Class B into Class A** effected under the Articles and reflected in the
   register (`D22` §4).
6. **Filing** where required; **beneficial-ownership filings** for both the transferor (ceasing) and the
   transferee (becoming) — within the statutory period (`D65`, `D68`).
7. **Register** updated; the old certificate cancelled; a new certificate issued to the transferee.
8. Accounting (if the company is involved, e.g. a buyback) and register updates (`D64`, `D65`).

**3.3 Prohibited practices.** (a) Registering a transfer without the executed instrument; (b) registering a
transfer to a person who has not adhered; (c) treating a "transfer" in the control plane as effective;
(d) ignoring pre-emption because the parties "agreed informally"; (e) allowing a Class B share to be
transferred without effecting the conversion.

---

## 4. Pre-emption and permitted transfers

**4.1 Pre-emption mechanics (transfer).** Notice of intention → offer to the other members pro rata, on the
**same terms**, with `[NUMBER]` days to accept → if not taken, offer to the others in proportion → if not
taken, the transfer to a third party is permitted on terms **no more favourable** than those offered, within
`[NUMBER]` days, subject to board consent and to the Articles.

**4.2 Price determination (`[USER TO SUPPLY]`).** If the terms are not arm's length (e.g. a proposed
transfer to a family member at a discount), the Articles/agreement must provide a **price-determination
mechanism** (an independent expert under `D29`; a formula; or a fair-value determination). **Without a
mechanism, pre-emption becomes a source of litigation rather than a protection.**

**4.3 Permitted transfers (no pre-emption)** — to be defined precisely: `[to the Trust; to a wholly-owned
family vehicle approved by the board; on death to personal representatives (subject to the conversion
rule); as required by law or a court order]`.

**4.4 Pre-emption on issue.** §2.3 and `D23` clause 3.4. **Waiver requires the required majority and any
class consent, and must be recorded — an unrecorded waiver does not exist.**

---

## 5. Dilution, capital alteration, subdivision and consolidation

**5.1 Dilution — the disclosure duty.** Before any issue that would dilute a holder, the board must
prepare and give the members a **dilution statement**: the pre- and post-issue holdings (shares and votes,
not only percentages); the effect on each class; the price and the price basis; the reason for the issue;
and the alternatives considered. **The dilution statement must state the effect on the enhanced-voting
class separately** (a small economic dilution can be a large voting dilution, and vice versa).

**5.2 Simulations.** A "what-if" model may be produced for the board's consideration **only if** every
output is watermarked **`SIMULATION — NOT AN ISSUE OF SHARES`**, is not entered in `D64`, and cannot be
exported into any register. **A simulation must never be presented to a member as a statement of their
actual holding.**

**5.3 Alteration of capital.** Any increase, consolidation, subdivision, conversion of shares into stock,
or similar step requires: the authority in the Articles; the correct **resolution type** (as the law
requires); any class consent; and the **filing** with the registry, plus the register and certificate
updates. `[COUNSEL TO CONFIRM the permitted alterations, the resolution type and the filings.]`

**5.4 Reduction of capital `[COUNSEL TO CONFIRM]`.** As read, a reduction of share capital requires a
resolution, a **director's certificate of solvency**, and gives a **creditor a right to apply to court**
within a stated period. **The pack asserts no period and no procedure as verified.** The following
therefore applies in this pack:
(a) no reduction may proceed on an unverified understanding of the procedure;
(b) the solvency assessment must be **documented** (assets, liabilities, cash flow) and approved by the
board, not merely asserted;
(c) the creditor notification and any court step must be completed and evidenced; and
(d) the accounting must reflect the reduction correctly.

**5.5 "Dilution by omission" — the silent risk.** A holder's percentage also falls if new shares are issued
to **others**. Every issue therefore triggers §5.1. **There is no such thing as a dilution that is nobody's
decision.**

---

## 6. Buyback and redemption

**6.1 Preconditions `[ALL COUNSEL TO CONFIRM]`.**

| # | Precondition |
|---|---|
| 1 | Express authority for the buyback/redemption (in the Articles and/or the law) — **`[COUNSEL TO CONFIRM]` the source** |
| 2 | The shares are **fully paid**; any requirement that they be paid out of distributable profits or a fresh issue is satisfied |
| 3 | A **solvency assessment**: the company can pay its debts as they fall due immediately and for the following `[PERIOD]` |
| 4 | Any **director's certificate of solvency** signed (as the law requires) |
| 5 | Any **creditor notification / objection / court step** completed |
| 6 | Any **class consent** and any **Reserved Matter** approval obtained |
| 7 | For the **Trust as seller**: a trustee decision under the Trust instrument, with reasons, and confirmation that the price is fair and that the proceeds are dealt with lawfully (`D04`, `D07`) |
| 8 | **Related-party** compliance if the seller is a related party (`D72`) |
| 9 | Tax advice on the buyback (company and seller) `[TAX TO CONFIRM]` |
| 10 | Any **filing** identified and made |

**6.2 Procedure.** Board resolution (with the solvency assessment attached) → any shareholder/class
approval → any creditor step → agreements executed → consideration paid **from a lawful source** (not from
capital where the law prohibits it) → shares **cancelled or held as treasury as the law permits**
(`[COUNSEL TO CONFIRM]` whether treasury shares are permitted) → register and certificates updated →
filings completed → accounting entries → `D64`/`D65` updated.

**6.3 Prohibited.** (a) A buyback funded out of capital where the law prohibits it; (b) a buyback that
leaves the company unable to pay its debts; (c) a buyback at a price that has not been assessed and
recorded (because it is a transfer of value between shareholders); (d) a buyback effected by a software
entry, a journal, or an agreement to "treat" the shares as cancelled; (e) a redemption of shares that were
never validly issued.

**6.4 Why this matters for the family's exit design.** The exit mechanisms in `D29` (buy-sell, drag, tag,
leaver provisions) ultimately require **someone to buy** — and a buyback is constrained by solvency and
statute. **A family exit mechanism that assumes the company can always buy the shares is a mechanism that
will fail in a downturn, exactly when a family needs it.** `D29` addresses the alternatives.

---

## 7. Register discipline, evidence and controls

**7.1 The share register is the record of title within the company.** It must record, per share: the
number/class; the holder; the date of registration; the certificate reference; and any transfer/transmission
with its date. **It must be updated within `[NUMBER]` days of an event and be capable of being produced on
demand.** `[COUNSEL TO CONFIRM]` the statutory form, the place of keeping and whether an inspection right
exists.

**7.2 Certificates.** `[COUNSEL TO CONFIRM]` whether certificates are required, their form, whether a
seal/signature is needed, and what happens on replacement of a lost certificate.

**7.3 The option register.** Options, warrants and convertible instruments are recorded in a **separate
register** (`D64` §distinct schedules) and **never** as issued shares. **A cap table that shows options as
shares is misleading and is prohibited.**

**7.4 Evidence standard.** Every register entry must cite: the authority (Articles/law), the resolution,
the instrument, the filing, the certificate and the accounting entry. **An entry without its evidence chain
must be flagged as `UNSUPPORTED` and must not be relied on for a decision.**

**7.5 Separation of duties.** The person who prepares a share transaction must not be the sole person who
approves it, and the person who approves it must not be the sole person who updates the register.

**7.6 Retention.** Share registers, certificates and transfer instruments are retained **permanently**
(subject to a legal hold); the accounting records per `D08` §8.

**7.7 Access.** `HIGHLY_RESTRICTED`. **Never in a public or open repository.**

---

## 8. Control-plane interaction

| Event | Suggested record | Caution |
|---|---|---|
| Class/rights | Share class configuration from the **Articles** | A configuration is a record, not the creation of a class (`DC-01` §8) |
| Issue | Share record + resolution ref + filing ref + certificate ref | Only after S1–S4 are done |
| Transfer | Holding change + instrument ref + register-confirmation ref | The register is the record of title within the company |
| Conversion | Class change + Articles ref | Must reflect the executed/automatic conversion, not a manual edit |
| Option/warrant | Entry in a **separate** instrument register | **Never** as an issued share |
| Dilution model | Watermarked simulation, excluded from `D64` | Never presentable to a member as their holding |
| Buyback/reduction | Cancellation record + solvency-cert ref + creditor-step ref + filing ref | Never represented by a software cancellation alone |

**8.1 Forbidden.** (a) Importing the seeded cap table or ownership percentages; (b) treating a "share
issued" workflow approval as an issue; (c) showing a member an "effective holding" figure computed from
drafts; (d) any UI that states a class exists before it does; (e) any AI-generated cap table presented as a
record.

---

## 9. Decisions required from the user / family / governing bodies

1. The **initial share capital plan**: who subscribes, how many shares, of which class, at what price, and
   with what consideration (a decision with tax and dilution consequences).
2. Whether the **Trust** will subscribe, and whether the Trustees are empowered to do so (counsel).
3. The **pre-emption periods** and the **price-determination mechanism**.
4. The **permitted transferee** list (`D23` Schedule 7).
5. Whether an **ESOP** is adopted, the pool size, and whether the pool is created by issue or by transfer.
6. Whether any **buyback or redemption** right is created, and its funding constraint.
7. Whether the company may hold **treasury shares** (counsel).
8. The **dividend policy** (interacts with `D33`).

## 10. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **power to issue** shares of different classes, and the resolution type required (`Q-H-01(a)`).
2. What **consideration** is lawful, and the consequences of an issue for services or for an asset
   (`Q-TAX-03`).
3. The **stamp duty, registration and filing** requirements for an issue, a transfer, a subdivision, a
   reduction and a buyback — and the periods and penalties.
4. The **share register** obligations: form, contents, custody, inspection rights and the consequence of a
   failure to update.
5. Whether **share certificates** are required, and their form and execution.
6. The **reduction of capital** procedure in the current revision, including the solvency certification and
   the creditor's court application period (`Q-H-04(b)`).
7. Whether **redeemable shares** may be issued and on what conditions (`Q-H-04(c)`).
8. Whether **treasury shares** are permitted.
9. The **pre-emption** default position (statutory or article-based) and whether it can be disapplied.
10. The **beneficial-ownership** filing triggered by each event, the form, the period and the penalty
    (`Q-H-05`).
11. Whether a **trust** may be registered as a member, and in what name (`Q-H-05(b)`; `Q-T-02`).
12. The **ESOP** requirements: plan approval, tax at grant/vest/exercise, and leaver provisions
    (`Q-H-06`).

**No share exists. No register entry, certificate or cap table in this pack describes a real holding. This
document defines a procedure, not an event.**
