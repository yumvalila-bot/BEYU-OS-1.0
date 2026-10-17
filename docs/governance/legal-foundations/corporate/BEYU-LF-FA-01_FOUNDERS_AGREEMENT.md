# BEYU-LF-FA-01 — Founders Agreement

Document ID: `BEYU-LF-FA-01`
Title: Founders Agreement
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — **blank and unexecuted. No founder is named, no share is issued, no
vesting applies, and no obligation exists.**
Owner (proposed): Company Secretary function · Approving authority (proposed): the board and the shareholders,
on counsel's advice
Next review date: On counsel's markup; then annually
Classification: `HIGHLY_RESTRICTED`
Related: `D22`, `D23`, `D24`, `D27`, `D28`, `D41`, `D43`, `D64`, `D66`, `D72`, `D73`, `D74`, `CX-01`, `ESOP-01`,
`CAP-01`, `NDA-01`, `RC-01`, `INC-01`
Depends on: **the jurisdiction and structure decisions** (`DAA-ARCH-005/006`); counsel on company law, share
mechanics and security/regulatory compliance; the accounting framework for share-based payments

> **⚠ WHAT THIS DOCUMENT IS AND IS NOT.**
> **It is the agreement between the people who *intend* to build and own the enterprise — setting out what each
> contributes, what they receive, what happens when one leaves, and how disputes end.** In practice it is the
> document that prevents the two most common founder disasters: **a founder leaving early with an unvested
> shareholding**, and **two founders deadlocked with no exit**.
> **It is not a substitute for the constitutional documents or the shareholders' agreement.** A founders'
> agreement that says "the founder shall be a director" does **not** appoint a director; that requires the
> Articles and a shareholder resolution (`D27` H-01, `D28` M-01).
> **And: no founder named in this template exists. `founder_profiles` in the control plane is a schema, and
> seeded rows are demonstration data — `GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6.**

---

## 1. Parties and status of the agreement

| # | Provision |
|---|---|
| 1.1 | **Parties.** Each founder personally; and, where the company is incorporated, **the company as a party** to the extent it gives undertakings (adherence to transfer restrictions, board recommendation, register discipline) `[COUNSEL TO CONFIRM the company's capacity to contract]` |
| 1.2 | **Order of instruments.** The **Articles** bind the company and its members as a matter of company law; the **shareholders' agreement** (`D23`) governs contractual relations among shareholders; **this agreement** governs the founders' relationship inter se and their personal obligations. **Where they conflict, the law and the Articles prevail**, and the founders must correct the conflict (`D23` clause 2.3; `D27` §8) |
| 1.3 | **Conditional effectiveness.** This agreement may be expressed to take effect: (a) on signature; (b) on incorporation of the company; or (c) on the first share issue. **The choice matters and must be recorded** `[COUNSEL TO CONFIRM]` |
| 1.4 | **No representation of incorporation.** Nothing here states that any company exists. **`D21` remains `BLOCKED`** — no constitutional document has been inspected |

## 2. Founder identity, contributions and roles

| # | Field (per founder) | `[USER TO SUPPLY]` |
|---|---|---|
| 2.1 | Legal name, identification details, contact address | — |
| 2.2 | **Contribution type**: cash / assets / intellectual property / domain / customer contracts / know-how / time | — |
| 2.3 | **Contribution valuation and basis** (and who valued it) | — |
| 2.4 | **IP assignment**: whether the founder's pre-existing and future work-product is assigned to the company — **by schedule, asset by asset** (`D41`; the trap: a "blanket" assignment of unnamed IP) | — |
| 2.5 | **Time commitment**: full-time / part-time / hours per week; exclusivity (or expressly not) | — |
| 2.6 | **Role and title** (with the express statement that a title confers no authority — authority comes from the delegation, `D27`) | — |
| 2.7 | **Reporting line** and decision rights | — |
| 2.8 | **Remuneration**: salary, deferred remuneration, expenses; who decides increases (`D27` H-04/H-05) | — |
| 2.9 | **Other engagements**: competing businesses, directorships, consultancies — disclosed and permitted or prohibited | — |
| 2.10 | **Founder's own advisers** (and who pays) | — |

**2.1 The "sweat equity" trap.** Where a founder's contribution is **time rather than money**, the agreement
must state (a) whether the shares are issued **now** or on milestones; (b) whether they are **paid up** and how
consideration is dealt with (`D24` S1–S5 — a share exists only when validly issued and the consideration is
dealt with); and (c) what happens if the work stops. **An agreement that issues shares for future work without
mechanism is a dispute waiting to happen.** `[COUNSEL TO CONFIRM]` whether an unperformed promise is adequate
consideration.

## 3. Equity: classes, rights, vesting and leavers

| # | Provision | Note |
|---|---|---|
| 3.1 | **Share classes and rights** | Cross-reference `D22`. **The dual-class proposal (1:1,000) is an unapproved proposal** pending `Q-H-01(a)`–`(h)`; this agreement must not adopt it |
| 3.2 | **Founders' allocations** | By **schedule**, with the number, class and consideration. **Never a percentage alone** — percentages move with dilution |
| 3.3 | **Vesting** | Total period `[MONTHS]`; cliff `[MONTHS]`; monthly/quarterly tranches; commencement date; **treatment of the pre-incorporation period** |
| 3.4 | **Acceleration** | On a change of control? On a termination? On death or incapacity? Single- or double-trigger? **Each is a real decision** |
| 3.5 | **Good leaver / bad leaver definitions** | Must be **objective and precisely drafted** (`CX-01` §3); a vague definition is unenforceable and litigated |
| 3.6 | **Leaver consequences** | Vested shares retained; unvested shares repurchased or forfeited; repurchase price basis (`[FAIR VALUE / NOMINAL / INDEPENDENT VALUATION]`); payment terms; **solvency constraint on any repurchase** (`D24` §6) |
| 3.7 | **Transfer restrictions, pre-emption, tag/drag** | Governed by the Articles and `D23` §5; repeated here only by cross-reference (**not restated**, to avoid divergence) |
| 3.8 | **Dilution and anti-dilution** | Whether any founder has a pre-emptive right or a protection on future issues (`D24` §5); **down-round protections are a negotiation, not a default** |
| 3.9 | **Death / incapacity** | Cross-reference `D57`, `D59`; the treatment of the founder's shares on death (`D22` §4.2 T-2) |
| 3.10 | **ESOP pool** | Whether a pool is reserved from the founders' holdings, its size, and its dilution effect (`ESOP-01`; `CAP-01`) |

**3.1 The control plane mapping.** Each founder's holding is represented in `equity_positions`
(`holder_type`, `holder_name`, `total_shares`, `vested_shares`, `unvested_shares`, `ownership_record_id`,
`supporting_document_id`, `resolution_ref`, `approval_ref`, `provenance`), and vesting in `vesting_schedules`
(`schedule_type`, `cliff_months`, `vesting_months`, `acceleration_policy`, `legal_review_status`) and
`vesting_events`. **A row in these tables is a record, not title.** `equity_positions.ownership_record_id` must
point to the **register of members** (`D64`); where it points to nothing, the row is unsupported
(`CAP-01` §4).

## 4. Decision rights, board and reserved matters

| # | Provision |
|---|---|
| 4.1 | **Board composition**: the founders' agreed nominations, subject to the Articles and `D27` H-01. **An agreement to appoint a director binds the founders as shareholders, not the board** `[COUNSEL TO CONFIRM that a shareholders' agreement may bind the exercise of the shareholders' votes]` |
| 4.2 | **Reserved matters**: whether the founders agree to reserve any matter to the founders themselves (a "founders' consent" right). **This must be coordinated with `D27`** — a second, informal veto list is the classic source of deadlock |
| 4.3 | **Deadlock**: cross-reference `D23` §6 and `D29` §2 (the escalation ladder). **Do not create a second ladder** |
| 4.4 | **Information rights**: what each founder receives (financials, board papers) and the confidentiality that goes with it (`NDA-01`) |
| 4.5 | **Prohibited unilateral acts**: e.g. promising equity verbally, hiring beyond the budget, opening accounts, making representations to investors — **each named explicitly**, because these are the acts that create liability |

## 5. Confidentiality, IP and restrictive covenants

| # | Provision |
|---|---|
| 5.1 | **Confidentiality** — cross-reference `NDA-01` (the founders' mutual NDA variant); expressly survives departure |
| 5.2 | **IP assignment** — a **separate executed assignment** per founder (`D41`), with a schedule listing pre-existing works; **this agreement records the obligation, and the assignment does the transferring** |
| 5.3 | **Moral rights** — to the extent waivable `[COUNSEL TO CONFIRM]` |
| 5.4 | **Restrictive covenants** — cross-reference `RC-01`; **enforceability is not assumed**; the narrower alternatives (confidentiality, non-solicitation, trade secrets, IP) are the primary protections |
| 5.5 | **No misuse of company information or opportunity** — including customer lists, pricing, data and the company's plans |
| 5.6 | **Departure obligations**: return of property and credentials; a certificate of no retention (`D43` §C5); knowledge transfer |

## 6. Exit, dispute resolution and general

| # | Provision |
|---|---|
| 6.1 | **Exit routes**: sale of shares (per the Articles and `D23`); a buy-out by the company or the remaining founders (subject to the solvency test, `D24` §6); a trade sale; an IPO (**stated as a possibility, not a plan**) |
| 6.2 | **Founder separation**: governed by `CX-01` — this agreement cross-references it rather than duplicating it |
| 6.3 | **Dispute resolution**: the **escalation ladder** (discussion → mediation → arbitration/court as counsel advises), **with the prohibition on self-help** and the preservation of legal rights (`D29` §4) |
| 6.4 | **Governing law, forum and execution formalities** `[COUNSEL TO CONFIRM]` (`Q-R-02`) |
| 6.5 | **Amendment**: by written instrument signed by all parties; **no oral variation** |
| 6.6 | **Entire agreement, severability, counterparts, notices** |
| 6.7 | **Binding vs non-binding**: any "commercial intentions" (e.g. a future funding plan, a future role) are marked **NON-BINDING** in a separate section. **A term sheet is not an agreement and this agreement is not a term sheet** |
| 6.8 | **Securities/regulatory**: whether an offer of shares to a founder requires any disclosure, filing or exemption `[COUNSEL TO CONFIRM]` |
| 6.9 | **Tax**: the treatment of shares issued for services, of vesting, and of a repurchase `[ACCOUNTANT/TAX TO CONFIRM]` |

## 7. Execution block (blank — not executed)

```
FOUNDERS AGREEMENT — Ref [   ] — Date [   ]
COMPANY: [NAME OR "TO BE INCORPORATED"] | FOUNDERS: [1] [2] [3]
FOUNDER 1: [NAME] ______________________  Date: ______
FOUNDER 2: [NAME] ______________________  Date: ______
FOUNDER 3: [NAME] ______________________  Date: ______
WITNESS (if required by Q-R-02): ______________________
FOR THE COMPANY (once incorporated): Director ____________ / Secretary ____________
SCHEDULES: A Contributions · B IP schedules (per D41) · C Allocations · D Vesting · E Leavers ·
           F Advisers · G Non-binding intentions
```

## 8. Decisions required from the user / family / governing bodies

1. **Who the founders are**, and whether any family member, the Trust, or the Foundation is among them (each
   raises a distinct conflict and authority question — `D14`, `D51`).
2. The **allocations, classes and consideration**.
3. The **vesting terms**, cliffs and acceleration events.
4. The **good/bad leaver definitions** (`CX-01`).
5. Whether a **founders' reserved-matter list** is created (and how it interacts with `D27`).
6. The **ESOP pool size** and whether it dilutes the founders (`ESOP-01`, `CAP-01`).
7. Whether any founder's **pre-existing IP** is excluded, licensed or assigned (`D41` Schedule A).
8. The **dispute route** and forum.

## 9. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether each obligation is enforceable, and **what consideration** supports it.
2. Whether a **founders' agreement that limits a director's freedom to act** is valid, and how to draft the
   founders' voting undertaking without fettering the board (`D23`; `Q-H-03(c)`).
3. **Vesting and leaver** enforceability, including whether a repurchase at a formula price is a penalty.
4. Whether an **unperformed promise** constitutes adequate consideration for a share issue.
5. **Tax** on issue-for-services, on vesting, and on repurchase (`Q-TAX-03`).
6. **Securities/regulatory**: whether a founder offer needs a disclosure document or an exemption.
7. **Restrictive covenants** (`RC-01`) and the narrower alternatives.
8. Whether the **company should be a party**, and the consequences.
9. Whether any **cross-border** element (a non-resident founder, an offshore holding company) requires
   exchange-control, tax or regulatory analysis (`Q-LEG-03`).

**No founder is named. No share exists. Nothing in this template is executed, and nothing in it is in force.**