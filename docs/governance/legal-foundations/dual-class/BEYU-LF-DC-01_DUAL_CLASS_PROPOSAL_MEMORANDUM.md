# BEYU-LF-DC-01 — Dual-Class Share Arrangement — Proposal, Lawful Options and Trade-off Memorandum

Document ID: `BEYU-LF-DC-01`
Title: Dual-Class Share Arrangement — Proposal, Lawful Options and Trade-off Memorandum
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`INFORMATIONAL`** — the arrangement below **does not exist in any instrument. It is a proposal
only.** No share has been issued; no class has been created; no right has been conferred.
Document owner: Company Secretary function (proposed) with counsel
Approving authority (proposed): Founder + the board + the shareholders/classes as the constitutional
documents require + counsel + tax adviser
Next review date: On receipt of counsel's opinion (GATE 2); then annually
Classification: `INTERNAL` — the executed equivalent will be `HIGHLY_RESTRICTED`
Related documents: `D20`, `D21` (BLOCKED), `D22`, `D23`, `D24`, `D27`, `D29`, `D59`, `D64`, `D65`, `D70`,
`D74`
Depends on: `DAA-DC-001`…`DAA-DC-006`; counsel's answers to `Q-H-01`, `Q-H-03`, `Q-H-04`, `Q-H-05`,
`Q-S-05`

> **⚠ STATUS BANNER — READ BEFORE ANYTHING ELSE.**
> The arrangement described in this memorandum — **Class A shares carrying one vote per share and Class B
> shares carrying 1,000 votes per share, with economic rights equal per share** — is a **commercial
> intention**, proposed by the family.
> **Nothing in this memorandum establishes that such an arrangement is lawful, valid, enforceable,
> advisable, tax-efficient, acceptable to a regulator, or consistent with the rights of any person.** Every
> one of those questions is a question for counsel, and every one of them is `[COUNSEL TO CONFIRM]`.
> **No document in this repository may state that the dual-class arrangement exists or that the 1,000-vote
> ratio is lawful.** The control plane's software support for multiple share classes
> (`votes_per_share` and related fields in the migration set) is **mechanism, not authority**.

---

## 1. Purpose and scope

**1.1 Purpose.** To (a) preserve the family's proposal accurately for professional review; (b) set out the
lawful alternatives and the protections the family may need if a dual-class structure is not available or
not advisable; (c) list precisely what must be verified; and (d) state the boundaries that the arrangement
must never cross.

**1.2 Scope.** Concerns the **holding tier's** share capital (see `D20`), and the share rights that would
be created in the constitutional documents (`D21`/`D22`) and any shareholders' agreement (`D23`). It does
not concern the Trust's own distribution rules (`D05`) or the operating-tier governance (`D30`).

**1.3 The repository evidence relied on.** The control-plane schema models multiple share classes with a
per-class `votes_per_share` value, and governance models for class consents. This is a **functional
capability**. It is not a legal opinion, not a registration, and not evidence that any share exists.

## 2. The proposal, stated precisely

| Element | The family's proposal | Status |
|---|---|---|
| Class A | Carries **one (1) vote per share**; equal economic rights per share | Proposed |
| Class B | Carries **one thousand (1,000) votes per share**; equal economic rights per share | Proposed |
| Economic parity | Both classes share **equally, per share**, in dividends and in any surplus on winding up | Proposed |
| Proposed Class B holders | The Founder and the **BEYU Family Trust** (as trustee), **subject to legal validation and documented approvals** — no holder may be named until confirmed (`DAA-DC-005`) | Proposed, **unnamed** |
| Proposed Class A holders | `[TO BE DETERMINED — no holder may be named until confirmed]` | Proposed, **unnamed** |
| Conversion | Automatic conversion of Class B into Class A on defined events (transfer, death, incapacity, insolvency, cessation of a defined relationship) | Proposed — see §4 |
| Sunset | `[NOT YET DECIDED — none / time-based / event-based / vote-based]` | Open |
| Board appointment rights | `[NOT YET DECIDED]` — a separate right from voting | Open |
| Class consents / vetoes | `[NOT YET DECIDED]` — a separate right from voting | Open |
| Reserved matters | Company-level list in `D27` (**distinct from the Trust's list in `D04` §7**) | Open |
| Umbrella protection | An express clause that nothing in the arrangement defeats mandatory law, creditors' rights, court orders, statutory director duties or statutory minority protections | Mandatory in any drafting |

**2.1 What the proposal is *not*.** It is not: a claim that disproportionate voting is permitted by the
Companies Act; a claim that 1,000:1 is a lawful ratio; a claim that a class of shares has been created; a
claim that anyone holds shares; a claim that the Trust owns anything; or a claim about tax.

**2.2 The four assumptions the pack explicitly refuses to make** (`DAA-DC-002`, `DAA-DC-003`,
`DAA-ARCH-005`, `DAA-HOLD-002`): (1) that the Trust owns or will own shares; (2) that the Founder already
holds any share; (3) that the law permits the ratio or the mechanism; (4) that any transfer or conversion
would be recognised.

---

## 3. Why the family wants it, and what a dual-class structure actually delivers and costs

**3.1 Stated purpose (to be confirmed by the family in writing).** To preserve the Founder's and the
family's ability to protect the group's long-term direction — including resisting a change of control that
would displace the family's stewardship of the enterprise and the Foundation's relationship to it — while
allowing economic participation by others.

**3.2 What it delivers (if lawful and adopted).** Separation of **control** from **economic ownership**;
resistance to hostile or opportunistic acquisition; a mechanism for transferring economic value without
transferring control; and continuity of stewardship across generations (subject to the conversion events).

**3.3 What it costs (the trade-offs, stated honestly).**

| Cost | Detail |
|---|---|
| **Validity risk** | If the ratio, the mechanism, or the class-rights drafting is not permitted, the arrangement fails — and may fail **partially**, leaving a structure that is neither what was intended nor clean. |
| **Governance quality risk** | Concentrated voting power reduces the corrective pressure that shareholders normally apply. Empirical research in other jurisdictions finds dual-class firms can underperform and can entrench poor management. **That research is not decisive for a private family company, but it must be considered rather than ignored.** |
| **Minority risk** | A Class A holder may hold real economic value with effectively no voice. If the family ever admits an external investor, that person must be told plainly what they are buying — or the arrangement becomes a source of dispute and, potentially, of a claim. |
| **Financing risk** | Some institutional investors, lenders and development-finance institutions will not invest where control is decoupled; some will price for it. |
| **Fiduciary tension** | Directors' duties run to the **company**. A structure that lets a controlling class direct the company does not remove the directors' duties or the risk that a direction, if followed, breaches them (`Q-H-03(a)`). |
| **Succession risk** | If Class B passes by inheritance without a conversion mechanism, control fragments or concentrates unpredictably. **This is the most common way a dual-class family structure fails.** See `D59`. |
| **Tax cost** | Different rights can affect valuation, share-for-share exchanges, gift and estate consequences, and the treatment of a conversion. `[TAX TO CONFIRM]` |
| **Complexity cost** | Every subsequent capital event (issuance, buyback, reduction, subdivision, conversion) must consider the classes and their consents. |
| **Disclosure cost** | Beneficial-ownership filings, and any later public-market disclosure, must explain the classes accurately. |

**3.4 The honest question the family should answer.** *Is the protection being sought actually achieved by
a voting ratio, or better achieved by a written long-term arrangement (a shareholders' agreement, a
reserved-matters list, a protector-style role, or the trust's own controls)?* Where a family's real concern
is "the enterprise must not be sold out from under us", a **class consent right over a sale of control**
may achieve the objective with far less complexity and less risk than a 1,000:1 voting ratio. **This
memorandum does not choose — it puts the question squarely on the table.**

---

## 4. Design decisions that must be made if the structure is pursued

| # | Decision | Options | Consequence |
|---|---|---|---|
| D-1 | **Ratio** | 1:10 / 1:100 / 1:1,000 / other | Higher ratios increase both the protection and the validity and financing risk |
| D-2 | **Economic rights** | Equal per share (proposed) / different | Unequal economics plus unequal votes compounds both risks; equal economics is the cleaner design |
| D-3 | **Who holds Class B** | The Founder / the Trust / both / others | Determines whether the protection survives the Founder's death, and how (see `D59`) |
| D-4 | **Conversion triggers** | Transfer / death / incapacity / insolvency / divorce / cessation of role / loss of family membership / sunset | Each trigger must be **legally effective**; an ineffective trigger means control escapes |
| D-5 | **Conversion ratio** | 1 Class B → 1 Class A (proposed) | A different ratio creates an economic shift, which is a **value transfer** and needs advice |
| D-6 | **Sunset** | None / date / listing / share of external ownership / holding a vote | A structure with no sunset can entrench indefinitely; a short sunset may defeat the purpose |
| D-7 | **Board appointment rights** | Single class appoints / each class appoints a number / none | A **separate right** from voting; must be in the articles |
| D-8 | **Class consent (veto) matters** | The company-level reserved matters in `D27` | Must be drafted to avoid a **shadow-director** problem (`Q-H-03(b)`) |
| D-9 | **Transfer restrictions** | Pre-emption / permitted transfers / board approval | A private company's articles must restrict transfer (as read); the drafting must be consistent between the articles and the shareholders' agreement |
| D-10 | **Where the rights live** | **Articles** (constitutive) and/or **shareholders' agreement** (contractual) | A right that must bind the company and all shareholders **must** be in the articles; a shareholders' agreement binds only its parties. **Drafting the same right in both, inconsistently, is a defect** (see `CROSS_DOCUMENT_CONSISTENCY_REPORT`) |
| D-11 | **Anti-dilution** | None / pre-emption / protective issuance rights | Protect against control dilution by design rather than by litigation |
| D-12 | **Dispute forum** | Court / arbitration / deadlock mechanics in `D29` | Must be lawful and consistent across articles and the agreement |
| D-13 | **Disclosure** | How the arrangement is explained to any future investor, lender or regulator | Prevents misrepresentation claims |
| D-14 | **Exit mechanism** | Buyback / redemption / drag-along / tag-along / buy-sell (`D29`) | Redemption and buyback have statutory preconditions (as read: solvency/creditor protections) — `Q-H-04(b)` |

---

## 5. Lawful alternatives (if the ratio, or the mechanism, is not permitted — or if the family prefers a
different tool)

| # | Alternative | What it achieves | Trade-offs | Where |
|---|---|---|---|---|
| A-1 | **Single class of shares + a shareholders' agreement** with reserved matters and consent rights | Control over defined decisions without altering share rights | Binds only the parties; does not bind the company or a future shareholder who is not a party; needs assignment/joinder machinery | `D23` |
| A-2 | **Class consent rights only** (no disproportionate voting) | A veto over sale-of-control and other fundamental matters, with equal voting otherwise | Narrower; does not deliver positive control | `D22`, `D27` |
| A-3 | **Board composition rights** (each class or the Trust appoints directors) | Influence at board level | Directors still owe duties to the company; a small board can be changed | `D22`, `D25` |
| A-4 | **Golden share / special right** vested in a class or in the Trust | A specific, disclosed control right | Must be lawful; may be seen as extraordinary; must be drafted precisely | `D22` |
| A-5 | **The Trust as shareholder**, with the Trust instrument's own controls | Control at the ownership tier through trust law | Depends on the Trust being lawfully constituted (`D01`) and on the trustee's duties | `D02`, `D03` |
| A-6 | **Constitutional "purpose lock" or consent requirement for a change of control** | Prevents a sale without the family's consent | Enforceability depends on the drafting and on whether a future majority can amend the articles | `D22` |
| A-7 | **Weighted voting for a defined period only** | Protects during the founder's lifetime or until a milestone | Sunset reduces entrenchment; must be drafted as a time-bound right | `D22` |
| A-8 | **Voting caps** (limit any holder's votes regardless of shares held) | Prevents concentration | May be invalid or may conflict with the presumption of one vote per share; `[COUNSEL TO CONFIRM]` | — |

**5.1 How to use this table.** Ask counsel: **which of these is available in the intended jurisdiction, and
which combination achieves the family's stated purpose at the lowest legal risk and cost?** The family's
purpose (not its preferred mechanism) should drive the choice.

---

## 6. The lawful limits — what no arrangement may do (absolute)

**Draft any version of this arrangement so that it expressly does not, and cannot, do the following.**

1. **Defeat mandatory law.** A share right cannot override a mandatory statutory rule, a licence condition
   or a regulator's requirement.
2. **Defeat creditors.** Enhanced voting cannot shield assets from lawful claims, or defeat a creditor's
   statutory right, or survive an insolvency in a way that prejudices creditors.
3. **Defeat a court order.** A right in the articles does not prevail over a court order.
4. **Nullify statutory minority protections.** The statutory remedies for unfair prejudice/oppression, any
   statutory right to apply to a court on a variation of class rights (as read, a dissentient minority may
   petition within a short period, with the variation requiring court confirmation — `Q-H-01(f)`), the
   statutory pre-emption position (if any), and any statutory right to information or to requisition a
   meeting, **cannot be removed by a share right.** The drafting must say so.
5. **Immunise bad faith or breach of fiduciary duty.** A director who follows an unlawful instruction
   because the articles told them to is not protected. Nothing in the arrangement may be drafted as an
   exculpation.
6. **Defeat the Trust's own duties.** Where the Trust is a shareholder, the Trustees must decide how to
   exercise the vote under the Trust instrument and their duties (`D02`, `D03`, `D04`). **A share right
   cannot direct the Trustees.**
7. **Bind a future shareholder who has not agreed**, unless the mechanism lawfully binds them (which,
   for company-law rights, requires the articles).
8. **Misrepresent the arrangement.** Every version of the arrangement that is shown to an investor, a
   lender, a regulator or a new shareholder must state the classes, the votes and the conversion triggers
   plainly. **A "one class in appearance, two in substance" presentation is not permitted.**
9. **Be recorded as existing.** No register, dashboard, software record, or document in this pack may state
   that the classes exist until they are validly created.

---

## 7. Verification plan (what must be confirmed, and by whom)

| # | Item | Who | Question ref |
|---|---|---|---|
| V-1 | That the Companies Act permits shares with different voting rights, and the exact section in the **current** consolidated revision | Counsel | `Q-H-01(a)` |
| V-2 | Whether any statutory cap on voting rights, weighted voting or voting caps exists | Counsel | `Q-H-01(b)` |
| V-3 | Whether the ratio **1,000:1** is lawful, and whether any ratio is more likely to be upheld | Counsel | `Q-H-01` |
| V-4 | Where the rights must be set out (articles vs agreement) and the amendment procedure | Counsel | `Q-H-01(c)`, `D-10` |
| V-5 | Whether the arrangement triggers any filing, approval, capital-markets or competition consequence | Counsel | `Q-H-01(d)` |
| V-6 | The mandatory minority protections that cannot be excluded (enumerate them) | Counsel | `Q-H-01(e)` |
| V-7 | The statutory class-variation procedure and the court application route | Counsel | `Q-H-01(f)` |
| V-8 | The validity and enforceability of each **conversion trigger**, including on death, incapacity, insolvency and divorce | Counsel | `Q-H-01(g)`, `Q-S-05` |
| V-9 | Whether a **sunset** is enforceable and how to draft it | Counsel | `Q-H-01(h)` |
| V-10 | The tax treatment of the classes, of a conversion, of a transfer, and of unequal economics (if adopted) | Tax adviser | `Q-TAX-03` |
| V-11 | The beneficial-ownership treatment of enhanced-voting shares | Counsel | `Q-H-05` |
| V-12 | The shadow-director risk of class consent rights | Counsel | `Q-H-03(b)` |
| V-13 | Whether a **foreign** holding company's law permits the arrangement, if a foreign tier is chosen | Foreign counsel | `Q-H-02` |
| V-14 | Whether any **regulator** (sector, competition, exchange control) must approve the arrangement | Counsel | `Q-LEG-03`, `Q-LEG-04` |

**7.1 The pack's rule.** **Until V-1…V-9 are answered in writing, no version of this arrangement may be
placed in any constitutional document, any shareholders' agreement, or any register** — because drafting it
is a representation that it may lawfully exist.

---

## 8. Control-plane and register interaction

**8.1** The control plane supports multiple share classes with a per-class `votes_per_share`. That capability
**must be used as a record**, if and when classes are validly created.

**8.2 Required discipline.**

| Rule | Reason |
|---|---|
| A share-class configuration is a **record**, not the creation of a class | The creation is the constitutional document + the issue/allotment resolution + the share register + (where required) the filing |
| `votes_per_share` may only be populated to reflect an **executed** instrument | Prevents a configuration from being mistaken for a right |
| `D64` must record, for each class: the authority creating it, the resolution, the filing, and the certificate | Evidence chain |
| `D65` must record the beneficial ownership of the enhanced-voting class correctly | Disclosure obligations |
| Any simulation, modelling or "what-if" on dilution must be labelled **`SIMULATION — NOT AN ISSUE OF SHARES`** | Prevents a scenario from being read as a fact |
| No dashboard may show a class as "active" without the executed instrument referenced | Prevents the fixture/seed hazard |

**8.3 Forbidden.** (a) Creating a share class by configuration and treating it as created; (b) naming a
Class B holder in a register without a resolution and a certificate; (c) presenting the 1,000:1 ratio in any
UI as though it were lawful; (d) importing the seeded ownership percentages as a cap table.

---

## 9. Decisions required from the user / family / governing bodies

1. **Confirm the purpose** the arrangement is meant to serve, in one paragraph (this drives the design).
2. Confirm the family's **intention on the ratio**, understanding that the ratio is a counsel question.
3. Decide **who is to hold the Class B shares** (and note that no holder may be named until confirmed).
4. Decide the **conversion triggers** the family wants (with counsel's advice on effectiveness).
5. Decide **whether to have a sunset**, and which kind.
6. Decide whether the family also wants **board appointment rights** and **class consents** (separate
   rights, separate drafting).
7. Decide whether a **shareholders' agreement** will sit alongside the articles, and how the two will be
   kept consistent (`D23`).
8. Decide the **disclosure position** for any future investor or lender: what they will be told, in
   writing, before they subscribe.
9. **Instruct counsel** to answer `V-1`…`V-9` before any drafting is finalised.

## 10. Counsel review note — `[COUNSEL TO CONFIRM]`

The full question set is in `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` §3 (`Q-H-01(a)`–`(h)`, `Q-H-03(b)`,
`Q-H-04`). In summary, the four answers that unblock everything else are:

1. **Is the ratio lawful?** (`V-3`)
2. **Where must the rights live, and how are they amended?** (`V-4`)
3. **What minority protections cannot be excluded?** (`V-6`)
4. **Will the conversion triggers actually work on death, incapacity and insolvency?** (`V-8`)

**Until those four answers are in writing, this arrangement remains a proposal and nothing more. No
document, register, dashboard or software configuration may state otherwise.**
