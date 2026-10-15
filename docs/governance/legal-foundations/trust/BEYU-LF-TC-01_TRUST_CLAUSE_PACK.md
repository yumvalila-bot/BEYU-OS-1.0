# BEYU-LF-TC-01 — Trust Clause Pack: Spendthrift, No-Contest, Discretionary Distribution and Trustee Removal

Document ID: `BEYU-LF-TC-01`
Title: Trust Clause Pack — Spendthrift, No-Contest, Discretionary Distribution, Trustee Removal and Replacement
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`CONDITIONAL_DRAFT` / `PENDING_COUNSEL`** — the four clauses below are **drafted conditionally**.
**None is in force, none has been inserted into an executed instrument, and none may be relied upon until
counsel has settled it against the law of the chosen trust jurisdiction.**
Document owner: Chief Governance Officer (proposed) with counsel
Approving authority (proposed): the Settlor, on counsel's advice; then the Trustees for adoption
Next review date: On counsel's return; then on any change of governing law
Classification: `HIGHLY_RESTRICTED`
Related documents: `D01`, `D02` (the operative deed — these clauses are integrated there), `D03`, `D04`, `D05`,
`D06`, `D07`, `D08`, `D09`, `D10`, `D11` §10, `D62`, `D71`
Depends on: **`DAA-ARCH-006` (the trust jurisdiction remains undecided)**; counsel's answers to
`Q-T-02`, `Q-T-03`, `Q-T-04`, `Q-T-05`, `Q-T-06`, and the new questions `Q-TC-01`–`Q-TC-08` (§6 below)

> **⚠ READ THIS BEFORE ANYTHING ELSE.**
> **1. These four clauses are CONDITIONAL DRAFTS.** They are written to be settled by a qualified
> practitioner — not to be copied into an instrument by a non-lawyer.
> **2. The governing law is not determined.** `D01` presents the formation routes as **options**; the pack
> asserts **no** jurisdiction as chosen. **A spendthrift clause, a no-contest clause and a removal clause are
> all creatures of a specific legal system, and their effect differs materially between systems.** Every
> clause below therefore carries a governing-law assumption and a counsel question.
> **3. The general rule that governs all four clauses:** **no provision in this pack may remove, penalise the
> exercise of, or appear to remove any person's legal rights, their access to a court or a regulator, or their
> ability to report unlawful conduct.** The clauses are drafted with that rule as a hard boundary, and where
> the boundary and the drafting intention conflict, **the boundary wins.**
> **4. Integration, not addition.** The clause text is integrated into `D02` (the deed) at the clauses named
> in each section below, and cross-referenced from `D03`, `D04`, `D05` and `D09`. **`D02` governs if the two
> ever diverge.**
> **5. No software effect.** `drizzle/0041_*.sql` models trust provisions (`trust_provisions`) with
> `legal_effect_status` defaulting to **`INERT`** and `enforceability_assumed` defaulting to **`false`**.
> **These clauses must not be loaded into the control plane in any way that implies enforceability** — see
> `MASTER_DOCUMENT_REGISTER.md` standing warning **W4**.

---

## 1. Clause map, status and integration points

| # | Clause | Purpose in one line | Deed location | Status | Counsel questions |
|---|---|---|---|---|---|
| **TC-1** | **Spendthrift / alienation and creditors** | Set out, conditionally, the extent to which a beneficiary may alienate an interest and creditors may reach it | **`D02` §11A** (new, after §11) | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | `Q-TC-01`, `Q-TC-02`; `Q-T-04` |
| **TC-2** | **No-contest / challenge procedure** | Define the intended scope of a challenge and permissible consequences, **without penalising lawful recourse** | **`D02` §20A** (new, in Part 8) | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | `Q-TC-03`, `Q-TC-04`; `Q-T-06` |
| **TC-3** | **Discretionary distribution** | Define the scope and discipline of the distribution discretion and its controls | **`D02` §10** (extended, new sub-clauses 10.9–10.18) | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | `Q-TC-05`, `Q-TC-06`; `Q-T-04` |
| **TC-4** | **Trustee removal and replacement** | Define grounds, process, evidence, transition and continuity | **`D02` §16** (extended, new sub-clauses 16.4–16.12) + **`D03` §6** | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | `Q-TC-07`, `Q-TC-08`; `Q-T-03` |

**1.1 The status rule.** Until counsel settles them and the deed is executed, these clauses are
**`CONDITIONAL_DRAFT`** and the deed as a whole remains **`DRAFT — NOT EXECUTED`**. **The deed must not be
described as execution-ready while the trust jurisdiction or legal form remains unresolved** (`D01`;
`IMPLEMENTATION_ROADMAP_AND_EXECUTION_CHECKLIST.md` GATE 2).

---

## 2. TC-1 — Spendthrift / alienation and creditors clause

### 2.1 Drafting purpose

To state, **conditionally and without over-promising**, (a) the extent to which a Beneficiary may assign,
pledge, encumber, anticipate or otherwise deal with an interest, (b) the extent to which a creditor may reach
an interest, and (c) **the distinction between a discretionary interest and a vested, mandatory or
already-distributed entitlement** — which is the distinction on which the whole clause's usefulness depends.

### 2.2 Proposed clause text (`CONDITIONAL_DRAFT`)

> **Clause 11A — Dealings with interests; creditors**
>
> **11A.1 Scope.** This clause applies to an interest in the Trust Fund arising under this deed. It does not
> apply to property that has already been **distributed** and is no longer held by the Trustees, and it does
> not purport to bind a person who is not a party to this deed.
>
> **11A.2 Discretionary interests. [COUNSEL TO CONFIRM the legal description.]** An interest that is subject
> to the Trustees' discretion, and in respect of which no decision to distribute has been made, confers a
> right to be **considered** and not a right to any particular amount. Within the limits of applicable law,
> such an interest is **not transferable** by the Beneficiary and the Trustees shall not be obliged to
> recognise any purported assignment, charge, pledge, mortgage, anticipation, sale or other dealing with it.
>
> **11A.3 Vested and mandatory interests. [COUNSEL TO CONFIRM.]** Where this deed creates an interest that is
> vested, or a right to a **fixed or ascertainable** amount, or where the Trustees have **decided** to make a
> distribution, the preceding sub-clause does not apply to that interest or amount. It may be dealt with as
> the law allows, and the Trustees shall act in accordance with the law and this deed.
>
> **11A.4 Distributions once made.** A distribution that has been made **belongs to the recipient absolutely**
> and is not subject to any restriction in this deed.
>
> **11A.5 Creditors. [COUNSEL TO CONFIRM — this sub-clause must not overstate the position.]** Nothing in
> this deed is intended to defeat the lawful claims of any person, and nothing in it shall be construed as
> depriving any court of any jurisdiction it has, or as limiting the operation of any applicable law relating
> to insolvency, bankruptcy, the enforcement of judgments, the rights of dependants or the maintenance of
> spouses or children, or any obligation to pay tax. **The Trustees shall comply with any court order, and
> shall not assist any person to defeat a lawful claim.**
>
> **11A.6 Trustee response to a purported dealing.** The Trustees may: (a) decline to recognise a purported
> dealing; (b) require evidence of the dealing and of its legal effect; (c) withhold a distribution in the
> circumstances permitted by sub-clause 11A.8; and (d) take advice at the Trust's expense within the approved
> budget.
>
> **11A.7 Beneficiary's own dealings.** A Beneficiary may not create an interest in the Trust Fund in favour
> of a third party by way of security or investment arrangement without the Trustees' prior written consent.
>
> **11A.8 Mandatory legal obligations. [COUNSEL TO CONFIRM.]** Where a Beneficiary is subject to a court
> order, a statutory obligation or a lawful claim, the Trustees shall apply this clause in accordance with
> the law and shall not treat this clause as a defence to a legal obligation.
>
> **11A.9 Personal choice preserved.** A Beneficiary's **right to seek the assistance of a court, to apply for
> the administration of the Trust, to complain to a regulator, or to obtain advice** is not restricted by
> this clause.
>
> **11A.10 Review.** The Trustees shall review this clause if the Trust's governing law changes or if counsel
> advises that its effect has changed.

### 2.3 Plain-language explanation

**What this clause tries to do.** It says that, while the Trustees have not yet decided to give a beneficiary
anything, the beneficiary cannot sell, promise or mortgage their "share" to anyone, and the Trustees are not
obliged to pay attention if someone claims to have taken such a promise as security. Where a beneficiary has a
firm right to a particular amount — or has already been given it — the clause explicitly gets out of the way.

**What it cannot do.** It cannot stop a court. It cannot defeat a bankruptcy, a dependant's claim, a tax
liability, or a spouse's or child's maintenance claim. It does not "protect assets" against those things, and
this pack **does not claim that it does**. It also does not bind a person who never agreed to the deed.

### 2.4 Risks and limitations

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **Over-statement to the family.** A family that believes the clause makes the Trust "judgment-proof" may make bad decisions | **High** | The plain-language explanation above exists to prevent exactly this; it must be given orally as well as in writing |
| 2 | **Legal ineffectiveness.** The clause may be unenforceable, void, or simply ignored in the chosen jurisdiction | **High** | `[COUNSEL TO CONFIRM]`; the clause is drafted to fail *harmlessly* (it does not attempt to oust the court) |
| 3 | **Potential inference of intent to defraud creditors** if assets were settled at a time when liabilities existed | **High** | A spendthrift clause adopted while a claim is foreseeable can worsen a position (`Q-TC-02`); counsel must be told the facts |
| 4 | **Public-policy limits** in the chosen jurisdiction (some systems restrict self-settled protection entirely) | **High** | `Q-TC-01` |
| 5 | **Interaction with the Beneficiary Register and the distribution record** (`D08`) | Medium | The record must show whether an interest is discretionary or vested **at each point in time** |
| 6 | **Trustee duty conflict**: refusing to recognise a dealing may disadvantage one beneficiary and advantage others | Medium | `D05` impartiality rules; record the reasoning (`TC-3` §14.5) |

### 2.5 Related clauses and documents

`D02` §9 (classes), §10 (distributions), §11 (distribution on death), §11A (this clause), §14 (conflicts),
`D03` §9, `D05` (beneficiary framework; §5.2 no-entitlement list), `D07` (investment), `D08` (records),
`D09` (amendment/disputes), `D67` (asset register), `D71` (claims).

### 2.6 Governing-law assumptions `[COUNSEL TO CONFIRM]`

1. That the chosen law permits a settlor to restrict voluntary alienation of a discretionary interest.
2. That the chosen law permits — or at least does not penalise — the trustee's refusal to recognise a
   purported dealing.
3. That the chosen law's insolvency and creditor statutes **override** the clause to the extent they apply.
4. That mandatory succession and family-provision rules are unaffected.
5. That the clause does **not** oust or limit the court's supervisory jurisdiction over trusts.

### 2.7 Counsel questions

**`Q-TC-01`** — Is a restraint on alienation of a discretionary interest valid, partially valid, or void in
the chosen jurisdiction? What wording is customary and effective? What are the public-policy limits?
**`Q-TC-02`** — May such a clause be challenged as a fraud on creditors, a sham, or an instrument of asset
protection; what facts would trigger that; and does the timing of settlement matter?
**`Q-T-04(a)`–`(e)`** (existing) — beneficiary rights, information rights and enforceability.

### 2.8 Required decisions

| # | Decision | Owner |
|---|---|---|
| 1 | Whether the clause is adopted at all | Settlor, on counsel's advice |
| 2 | Whether vested interests are created anywhere in the deed (if they are, this clause's scope shrinks) | Settlor + counsel |
| 3 | The Trustees' consultation duty before applying 11A.6/11A.8 | Trustees |
| 4 | How the clause is explained to adult beneficiaries (writing and discussion) | Trustees |

### 2.9 Approval status

`CONDITIONAL_DRAFT` / `PENDING_COUNSEL`. **Not adopted. Not executed. Not relied upon.**

---

## 3. TC-2 — No-contest / challenge procedure clause

### 3.1 Drafting purpose

To define (a) the **intended scope** of what the Settlor regards as a "contest", (b) a **process** for
challenges the family does consider legitimate, and (c) **only such consequences as the governing law permits**
— while **expressly preserving** lawful recourse, good-faith proceedings, interpretation and accounting
applications, and the right to report wrongdoing.

### 3.2 Proposed clause text (`CONDITIONAL_DRAFT`)

> **Clause 20A — Challenges, disputes and the family's process**
>
> **20A.1 Interpretation and disputes are not contests.** Nothing in this clause applies to, or may be used
> to penalise: (a) a request for the Trustees' accounts, information or reasons to which a Beneficiary is
> lawfully entitled; (b) an application to a court for the **interpretation** of this deed or for directions;
> (c) an application concerning the administration of the Trust; (d) a claim that this deed is invalid,
> forged, the product of incapacity or undue influence, or improperly amended; (e) an allegation of breach of
> trust, misconduct, dishonesty or unlawful conduct by a Trustee, the Protector or any other person;
> (f) any report or complaint to a regulator, a court, a tax authority or law enforcement; (g) any
> participation in an investigation; (h) the exercise of the family's dispute procedure under `D17`; or
> (i) legal advice obtained by a Beneficiary.
>
> **20A.2 Preservation of rights. [MANDATORY — this sub-clause is not optional and must not be amended
> away.]** **No Beneficiary is deprived by this clause of any right to approach a court, a regulator or any
> other authority, and nothing in this clause may be construed as an attempt to do so.** If any part of this
> clause is found to have that effect, **that part is void and the rest stands** (clause 23.6).
>
> **20A.3 Intended scope — what the Settlor asks the family to treat as a challenge.** The Settlor asks the
> family to treat the following as a matter to be raised **first** under the family procedure (`D17`) and,
> where required, by an application to the court for directions: an attempt (a) to **retrospectively rewrite
> the family's governance** by litigation rather than by amendment under clause 20; (b) to **remove a Trustee
> without cause** otherwise than under clause 16; (c) to **compel a distribution** where the Trustees have
> lawfully exercised a discretion; or (d) to **challenge a decision properly taken** on grounds that are, in
> substance, a disagreement with the decision.
>
> **20A.4 Family procedure first. [PROPOSED]** Where a person intends to raise a matter within 20A.3, the
> Settlor asks that they: (a) give the Trustees and the Protector (if any) **written notice** stating the
> matter and the outcome sought; (b) allow **[NUMBER]** days for a response; (c) participate in the family
> procedure under `D17` in good faith; and (d) inform the other adult Beneficiaries of the matter's
> existence. **Compliance with this sub-clause is a request, not a condition of any legal right**, and never
> delays or prevents the making of an application that any person is entitled to make.
>
> **20A.5 Consequences. [COUNSEL TO DECIDE — see 20A.6.]** **[The Settlor proposes that]** where a
> Beneficiary brings a proceeding within 20A.3, **without first using 20A.4**, and the proceeding fails, the
> Trustees **may** take that into account in the exercise of their discretion as to that Beneficiary, and may
> require their own costs of the proceeding to be borne out of that Beneficiary's prospective share **to the
> extent the governing law permits**.
>
> **20A.6 Legal limits — `[COUNSEL TO CONFIRM]`.** Sub-clause 20A.5 is included **only for counsel to
> settle**. The Settlor acknowledges in this deed that (a) a forfeiture clause may be **invalid, partially
> invalid, unenforceable, void on public-policy grounds, or construed strictly against the person seeking to
> rely on it**; (b) it must **not** operate to penalise a person for a lawful claim, a good-faith application,
> the enforcement of a mandatory right, or a report to an authority; and (c) it must **not** operate so as to
> leave a Beneficiary without reasonable provision where the law requires provision to be made. **If counsel
> advises that 20A.5 cannot be drafted lawfully, it will be deleted, and the clause will operate as a
> procedure only.**
>
> **20A.7 Trustee conduct.** A Trustee may not rely on this clause to avoid scrutiny, to withhold information
> to which a Beneficiary is entitled, or to defend dishonesty, and shall not invoke it in response to a
> good-faith enquiry.
>
> **20A.8 Costs.** The Trustees may fund a Beneficiary's independent advice and the cost of the family
> procedure under `D17` from the Trust Fund where the Trustees judge it appropriate, within the approved
> budget and subject to the conflict rules in clause 14.
>
> **20A.9 Record.** Every notice, response and outcome under this clause is recorded in the Trustees' decision
> register (`D10`, `D73`), with the advice taken.

### 3.3 Plain-language explanation

**What the clause does.** It tells the family that disagreements about the *running of the family's
arrangements* should first be raised with the trustees, in writing, and through the family's own procedure —
and that if someone goes to court to try to undo the trustees' lawful decisions, the trustees may take that
into account when deciding what to give them, and may make them bear the costs.

**What it explicitly does not do.** It does **not** stop anyone going to court. It does **not** penalise
anyone who asks for the accounts, asks what the deed means, reports a trustee for dishonesty, complains to a
regulator or a tax authority, or sues because the deed was forged or signed by someone who lacked capacity.
**Those are not contests, and the clause says so in its first paragraph.**

**The honest caveat.** In several legal systems no-contest clauses are read narrowly, unenforceable, or void;
some courts treat them as contrary to public policy. **This pack does not claim the clause will be
effective.** The clause is drafted so that, if counsel strikes out 20A.5, the remaining procedure still
functions and nothing else breaks.

### 3.4 Risks and limitations

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **Unenforceable or void** in the chosen jurisdiction | **High** | `Q-TC-03`; the clause is severable by design |
| 2 | **Chilling effect** — a beneficiary refrains from a legitimate complaint | **High** | Mitigated by 20A.1 (non-exhaustive carve-outs), 20A.2 (rights preserved), 20A.7 (no reliance to avoid scrutiny), and an express duty to tell beneficiaries that legitimate recourse is unaffected |
| 3 | **Family-relationship damage** from an adversarial process | **High** | The `D17` procedure exists to create a non-litigious path; it must be resourced to work |
| 4 | **A beneficiary left without reasonable provision**, where the law protects that | **High** | `Q-TC-04`; the clause must yield to mandatory family provision |
| 5 | **Use of the clause against a genuinely wronged beneficiary** by a trustee who is at fault | **High** | 20A.7 plus the conflict rules in clause 14; independent advice funded under 20A.8 |
| 6 | **Secrecy pressure** — the clause being used to suppress a report of unlawful conduct | **High** | **Prohibited** by 20A.1(f)–(g); a Trustee doing so breaches duty |

### 3.5 Related clauses and documents

`D02` §14 (conflicts), §15 (trustee decisions), §16 (removal), §20 (amendment), §23.6 (severability),
`D03` §7, `D04` §7 (Reserved Matter RM-13 protects this clause's boundary sub-clauses), `D05` §5.2, `D09` §
(disputes and amendment), `D11` §10 (enforceability map — the family procedure is largely unenforceable as
such), `D17` (family dispute procedure), `D18` (participation), `D71` (claims register).

### 3.6 Governing-law assumptions `[COUNSEL TO CONFIRM]`

1. That a no-contest or forfeiture clause is at least **arguable** — and that counsel will say so if it is not.
2. That any such clause is construed **strictly against the party relying on it**.
3. That a clause purporting to bar access to the courts is **void**, and that severability preserves the rest.
4. That the law of the forum may differ from the Trust's governing law, so a clause effective in one may fail
   in another.
5. That costs consequences are a matter for the court, and that the deed cannot dictate them.

### 3.7 Counsel questions

**`Q-TC-03`** — Is a no-contest/forfeiture clause lawful, and to what extent, in the chosen jurisdiction? How
must it be drafted, and what must be carved out? What is the court's attitude, and is it binding on persons
who are not parties to the deed (including the deceased's personal representatives)?
**`Q-TC-04`** — Does mandatory family provision, dependants' relief or forced heirship override it, and how
must the clause yield? Does a minor's or an incapacitated person's position differ?

### 3.8 Required decisions

| # | Decision | Owner |
|---|---|---|
| 1 | Whether to adopt 20A.5 at all (the pack's recommendation: **only if counsel confirms it adds value**; the procedure in 20A.4 has value on its own) | Settlor + counsel |
| 2 | The response period in 20A.4(b) `[NUMBER]` | Settlor |
| 3 | Whether the Trustees may fund independent advice under 20A.8 and within what budget | Trustees |
| 4 | How the clause is explained to beneficiaries, including the express statement that legitimate recourse is unaffected | Trustees |

### 3.9 Approval status

`CONDITIONAL_DRAFT` / `PENDING_COUNSEL`. **20A.5 is expressly conditional on counsel's confirmation; the
preservation sub-clause 20A.2 is NOT optional and must not be amended away.**

---

## 4. TC-3 — Discretionary distribution clause

### 4.1 Drafting purpose

To define the **scope** of the distribution discretion, the **purposes** for which distributions are made,
the **considerations** the Trustees may take into account, **impartiality** among beneficiaries, **conflicts**,
**recordkeeping and reasons**, the **request and review process**, **emergencies**, **liquidity and
investment** coordination, **tax/accounting** coordination, and — critically — the difference between **a
discretionary interest and an enforceable entitlement**. Protector/adviser consent and reserved powers are
defined **as options only**, pending advice.

### 4.2 Proposed clause text (`CONDITIONAL_DRAFT`) — inserted into `D02` §10 as 10.9–10.18

> **10.9 Nature of the interest. [MANDATORY — definitional.]** No Beneficiary has any interest in the Trust
> Fund other than the right to be **considered** by the Trustees within the Beneficiary Classes, and to have
> that consideration exercised in good faith. **A Beneficiary has no right to any amount, and a decision to
> distribute creates an entitlement only to the amount and on the terms decided.** This sub-clause prevails
> over any other provision of this deed, and over any statement in a family document (`D11`–`D19`), register
> or software record.
>
> **10.10 Scope of discretion. [COUNSEL TO CONFIRM the outer limits.]** Subject to this deed and the law, the
> Trustees may at any time and from time to time (a) add to the capital or income of a Beneficiary's
> entitlement; (b) make payments in instalments or in lump sums; (c) apply funds directly for a Beneficiary's
> benefit rather than paying them to the Beneficiary; (d) distribute in specie; (e) make loans (on terms the
> Trustees decide, with a written record and a repayment schedule); (f) make a distribution subject to
> conditions; and (g) decide **not** to distribute.
>
> **10.11 Permitted purposes.** Distributions are made only for purposes within Schedule 3 (as amended from
> time to time), and shall not be made for any purpose excluded by this deed or by clause 8.
>
> **10.12 Circumstances the Trustees may consider.** Without limiting 10.13, the Trustees may consider:
> age and maturity; education; health and medical need; disability; debt and financial difficulty; the
> effect on the Beneficiary's own initiative; the Beneficiary's other resources (as disclosed); the needs of
> **other** Beneficiaries; the consequences for family relationships; tax consequences to the Trust and the
> Beneficiary; and the Beneficiary's conduct **only** where relevant to a purpose in Schedule 3.
>
> **10.13 Considerations the Trustees must NOT treat as decisive.** The Trustees shall not treat as decisive:
> (a) the fact that a Beneficiary has made a **lawful claim** or brought a **good-faith application**
> concerning the Trust; (b) the fact that a Beneficiary has sought information they are entitled to;
> (c) the fact that a Beneficiary has made a **report to a regulator, a tax authority or law enforcement**;
> (d) a Beneficiary's refusal to accept an improper condition; or (e) a Beneficiary's decision to obtain
> independent advice. **A Trustee who does so acts in breach of this deed.**
>
> **10.14 Impartiality. [COUNSEL TO CONFIRM the duty's content in the chosen law.]** Where two or more
> Beneficiaries are eligible, the Trustees shall act **impartially**, which requires (a) informing themselves
> of each eligible Beneficiary's relevant circumstances; (b) applying consistent criteria; (c) recording the
> reasons for material disparities; and (d) not preferring a Beneficiary because of the Trustees' own
> interest, convenience or relationship.
>
> **10.15 Conflicts and self-dealing.** A Trustee who is also a Beneficiary, or who is connected to a
> Beneficiary, shall comply with clause 14; shall not vote or be counted for the quorum on a distribution to
> themselves or to a connected person; and shall record the recusal.
>
> **10.16 Requests, process and timescales.**
> **(a)** A request for a distribution may be made in writing by an adult Beneficiary, a guardian, or a
> person acting for a Beneficiary under an instrument recognised by law.
> **(b)** The Trustees shall respond within **[NUMBER]** days, in writing, stating the decision and the
> **reasons**, except where clause 19.3 permits withholding information or where the decision is incomplete.
> **(c)** Before deciding a distribution above **[LARGE DISTRIBUTION THRESHOLD]**, the Trustees shall obtain
> the information required by clause 10.17 and, where Schedule 4 requires it, the Protector's consent.
> **(d)** A refusal is recorded with reasons (`D10`), and the Beneficiary is told what evidence would help a
> future request, where it is proper to do so.
>
> **10.17 Before deciding: mandatory checks.** The Trustees shall satisfy themselves, and record, that:
> (a) the Beneficiary is within a class (Schedule 2); (b) the purpose is within Schedule 3; (c) applicable
> limits and caps are observed; (d) any **Reserved Matter** consent required by Schedule 4 has been obtained;
> (e) conflicts have been identified and managed; (f) the **affordability and liquidity** tests in clause 10.18
> are met; (g) any **tax** consequence to the Trust and to the Beneficiary has been considered with the
> Trust's adviser (`[ACCOUNTANT TO CONFIRM]`); (h) the **accounting and distribution records** (`D08`) can be
> completed; and (i) the **dual-control and evidence** requirements of 10.19 are met.
>
> **10.18 Affordability, liquidity and investment coordination.** The Trustees shall not make a distribution
> that would (a) impair the Trust's ability to meet its existing and reasonably foreseeable obligations;
> (b) breach an investment mandate, a covenant or a legal restriction (`D07`); or (c) require a forced sale
> of an asset at a loss where a later distribution would not, **unless they record the reasons for doing so
> notwithstanding**. The Trustees shall consider `D33` §5 (liquidity floor) where the Trust Fund is reported
> together with other assets.
>
> **10.19 Dual control and evidence. [MANDATORY — controls.]**
> **(a)** A distribution requires the decision of the Trustees under clause 15, recorded under clause 15.3.
> **(b)** Above `[DUAL CONTROL THRESHOLD]`, a **second, independent** authorisation is required — either the
> Protector's consent, or an independent Trustee's written approval, or (where Schedule 4 requires) the
> consent of a specified Beneficiary class.
> **(c)** **No distribution may be made, approved, recorded, authorised, executed or paid by any software
> system, workflow or artificial-intelligence output.** `BEYU OS` and `NOELIA_AI` may prepare, calculate,
> record and report; **they may not decide, approve, sign, execute, or release a payment** (clauses 7.3–7.4;
> `D02` Part 5; `D31` §6).
> **(d)** Every distribution is evidenced by: the request or the Trustees' initiative; the checks in 10.17;
> the decision and reasons; the consent (if any); the payment or application record; and the accounting entry
> in the accounting authority of record (`D08` §1.3).
>
> **10.20 Emergencies.** In an emergency within the meaning of `D62` E-01, the Trustees (or a Trustee acting
> alone where the deed permits it) may make **a distribution strictly necessary** for the Beneficiary's
> health, safety or essential maintenance, subject to (a) an amount cap of `[EMERGENCY DISTRIBUTION CAP]`;
> (b) immediate notice to the other Trustees and the Protector (if any); (c) full ratification at the next
> meeting, and reversal or correction if ratification is refused.
>
> **10.21 Protector and adviser involvement — OPTION ONLY. [COUNSEL TO CONFIRM.]** The Settlor leaves open
> (a) whether the Protector must consent to distributions above a threshold; (b) whether an independent
> adviser's certificate is required for any class of distribution; and (c) whether any reserved power is
> retained. **Until counsel advises, none of these is required by this deed except where Schedule 4
> expressly says so.**
>
> **10.22 Register discipline.** The distribution record (`D08`) shall show, for each distribution: the
> Beneficiary; the amount or property; the purpose; the checks performed; the decision reference; the
> consent; the payment evidence; and whether the interest was **discretionary at the time of the decision**.

### 4.3 Plain-language explanation

**The core idea.** Nobody has a "share" of the trust. Beneficiaries are people the trustees **must consider**
— fairly, and for defined purposes — but until the trustees decide to give something, no one is entitled to
anything. Once a distribution is decided and made, the money or property is plainly the recipient's.

**The discipline.** Deciding is not free-form: the trustees must check the class, the purpose, the caps, any
required consents, conflicts, affordability, tax, and the records. Above a threshold, **two people must
authorise**. In an emergency, a limited payment can be made and must be reported and ratified.

**What the trustees may not do.** They may not punish a beneficiary for asserting a right, asking for
accounts, or reporting wrongdoing (§10.13). They may not prefer someone out of self-interest (§10.14–10.15).
They may not decide by software or AI (§10.19(c)) — this is the constitutional boundary the rest of BEYU OS
already enforces, and the deed states it in the operative instrument.

### 4.4 Risks and limitations

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **Discretion versus duty.** In some systems, a trustee's discretion is constrained by a duty to consider, or by a beneficiary's need, more than the drafting implies | **High** | `Q-TC-05` |
| 2 | **Impartiality's content is jurisdiction-specific** and may require equal treatment in some circumstances | **High** | `Q-TC-05`; 10.14 is drafted to state a process, not a result |
| 3 | **Slowness of process** causing hardship | Medium | 10.20 emergency route + 10.16(b) response period |
| 4 | **Reason-giving and privacy tension** — reasons may disclose another beneficiary's circumstances | Medium | `D19` §4.3 access rules; `D08` reporting limits |
| 5 | **Tax consequences not considered before the distribution** | **High** | 10.17(g); a distribution made without tax advice can cost more than it gives |
| 6 | **Emergency route abuse** | Medium | Caps, immediate notice, ratification, and reversal if refused |
| 7 | **Conflict of interest in a family trustee** | **High** | 10.15 + clause 14 + `D14` §5.4; recusal recorded |

### 4.5 Related clauses and documents

`D02` §8 (prohibited acts), §9–§11A, §13 (remuneration), §14 (conflicts), §15 (decisions), §17 (Protector),
§18 (Family Council), §19 (records); `D03`; `D04` §7 (RM-09, RM-11, RM-15, RM-16, RM-19); `D05`; `D07`;
`D08` §1.3; `D10`; `D12`; `D33` §5; `D34`; `D35` §3.3; `D36`; `D62`; `D73`; `D74`.

### 4.6 Governing-law assumptions `[COUNSEL TO CONFIRM]`

1. That the chosen law permits the settlor to define the nature of beneficiaries' interests as discretionary.
2. That the trustee's duty of impartiality is a duty of **process** that the clause may particularise (and
   that it cannot be disapplied where the law makes it mandatory).
3. That a trustee may distribute **in specie**, make loans, or fund a purpose directly (and that any of these
   may require specific powers the deed must grant).
4. That the emergency route does not breach the trustees' duties (i.e. that acting urgently and ratifying is
   acceptable where justified).
5. That tax is not the trustees' only consideration, but must be considered.

### 4.7 Counsel questions

**`Q-TC-05`** — What is the content of the trustee's duty of impartiality in the chosen jurisdiction, and how
far may the deed particularise it? Must "due consideration" be evidenced in a particular way? May the
trustees refuse to give reasons?
**`Q-TC-06`** — May the trustees distribute in specie, make loans, fund purposes directly, and impose
conditions? What powers must the deed expressly grant? What are the limits on an emergency distribution by a
single trustee?

### 4.8 Required decisions

| # | Decision | Owner |
|---|---|---|
| 1 | The distribution purposes and caps (Schedule 3) | Settlor + Trustees |
| 2 | `[LARGE DISTRIBUTION THRESHOLD]`, `[DUAL CONTROL THRESHOLD]`, `[EMERGENCY DISTRIBUTION CAP]` | Settlor |
| 3 | The response period in 10.16(b) | Settlor |
| 4 | Whether the Protector consents to distributions above a threshold (10.21 option) | Settlor + counsel |
| 5 | Whether loans are permitted at all, and on what terms | Settlor + counsel + accountant |
| 6 | Who may act alone in an emergency, and for how long | Settlor + Trustees + `D62` |

### 4.9 Approval status

`CONDITIONAL_DRAFT` / `PENDING_COUNSEL`. **10.9 and 10.19(c) are definitional/control sub-clauses the pack
treats as non-negotiable in substance** (the "no entitlement" position and the "no software or AI decision"
boundary); if counsel advises different wording, the **substance** must be preserved or the divergence
recorded in the consistency report.

---

## 5. TC-4 — Trustee removal and replacement clause

### 5.1 Drafting purpose

To define **grounds** for removal (resignation, incapacity, death, persistent failure, serious breach,
dishonesty, insolvency where relevant, disqualifying conflicts, loss of eligibility), **who may initiate and
approve**, **notice and the right to respond**, **evidence**, **temporary safeguards**, **successor
eligibility**, **appointment**, **acceptance of office**, **handover of records and assets**, **authority
continuity**, **indemnity and accounting handover**, **vacancies**, **deadlock**, and **court or regulator
involvement** — consistently with the chosen legal form and mandatory law.

### 5.2 Proposed clause text (`CONDITIONAL_DRAFT`) — inserted into `D02` §16 as 16.4–16.12, and mirrored in `D03` §6

> **16.4 Grounds for removal. [COUNSEL TO CONFIRM each ground.]** A Trustee may be removed only on one or
> more of the following grounds, established on evidence:
> (a) **persistent failure** to perform the duties of office, including repeated failure to attend, to
> consider, to record decisions, or to comply with this deed or `D03`;
> (b) **serious or repeated breach** of trust or of the duties in Part 5, including a breach of the conflict
> provisions in clause 14;
> (c) **dishonesty, fraud, wilful misconduct or gross negligence**, or the reasonable belief of any of them
> on evidence;
> (d) **conflict of interest** that is disqualifying and cannot be managed (`D14` §5.4);
> (e) **loss of eligibility** or a **disqualification** imposed by law (including the disqualifications
> described in 16.2);
> (f) **insolvency**, bankruptcy or an arrangement with creditors, where the law treats that as disqualifying
> or material;
> (g) **incapacity** as determined under `D03` §6.4;
> (h) the **expiry of a fixed term**, if the deed provides for one;
> (i) **unwillingness or inability** to act for a continuous period exceeding **[NUMBER]** months;
> (j) **refusal to comply** with a lawful order of a court or a regulator; or
> (k) **any other ground** that the governing law permits and that the Protector (or the court) is satisfied
> on evidence justifies removal.
>
> **16.5 Who may initiate and who decides. [COUNSEL TO CONFIRM — this allocation must match the chosen legal
> form.]**
> **(a) Initiation.** The Protector (if appointed); any Trustee; the Settlor while living, in respect of a
> Trustee other than the Settlor; an adult Beneficiary with the written support of **[NUMBER]** adult
> Beneficiaries or of a Beneficiary holding a specified interest; or the court (on application).
> **(b) Decision.** Removal is decided **outside the Trust by the persons the deed designates**, namely:
> (i) where the Protector is appointed, the **Protector**, with the concurrence of a majority of the
> **remaining** Trustees; (ii) where no Protector is appointed, by a **majority of the remaining Trustees**
> **and** the written concurrence of **[NUMBER]** adult Beneficiaries or **[SUPERMAJORITY]** of the
> Beneficiary classes as the Settlor decides; **or** (iii) by the **court**, on application by a person
> entitled under 16.5(a).
> **(c) Prohibitions.** **A Trustee may not participate in the decision to remove themselves**, and may not
> be counted for any quorum for that decision. **No software system, workflow or AI output may initiate,
> approve or effect a removal.**
>
> **16.6 Notice and right to respond. [MANDATORY — procedural fairness.]**
> (a) The Trustee is given **written notice** stating the proposed ground, the facts and the evidence relied
> on; (b) at least **[NUMBER]** days to respond in writing; (c) a reasonable opportunity to make
> representations to the deciding persons; and (d) a written decision with reasons. The notice and the
> response are recorded. **Where the ground is dishonesty, fraud or an imminent risk to Trust assets, the
> deciding persons may act under 16.8 (temporary safeguards) before completion of 16.6, and shall complete it
> afterwards.**
>
> **16.7 Evidence standard.** The deciding persons shall state the ground, identify the evidence, consider
> the Trustee's response, and record the reasons. **Evidence may not be a software flag, a workflow state, a
> dashboard indicator or an AI conclusion.** (See `D03` §6.4: incapacity is never determined by a software
> flag.)
>
> **16.8 Temporary safeguards (suspension pending decision).** Where there is a credible risk to the Trust
> Fund or to a Beneficiary, the remaining Trustees may, by majority: (a) suspend the Trustee's access to
> Trust assets, accounts, systems and information; (b) require a second signature on all transactions;
> (c) appoint an interim co-trustee to hold the office until the decision is complete, subject to
> **[COUNSEL TO CONFIRM whether statute or the deed permits this]**; (d) preserve evidence; and (e) inform
> the Protector and the auditor. **Suspension is time-boxed to [NUMBER] days and must be reviewed.** The
> Trustee's remuneration entitlement continues during suspension unless the law provides otherwise, and a
> malicious suspension is a breach.
>
> **16.9 Successor eligibility and appointment.**
> (a) A successor Trustee must be **eligible** under clause 2.4 and the law (including any minimum number of
> Trustees and any residency or qualification requirement — `[COUNSEL TO CONFIRM]`).
> (b) The appointment is made by **[the Protector / the remaining Trustees / the Settlor while living /
> the Beneficiary classes — USER TO SUPPLY]** as the deed provides.
> (c) No appointment may be made which would leave the Trust without the minimum number of Trustees required
> by law or by clause 2.4.
> (d) **A person may not be appointed if they would be disqualified, if they are a party to a dispute with
> the Trust, or if an unresolved conflict of the kind in 16.4(d) exists.**
> (e) Where fewer than the minimum number of Trustees remain and no appointment is made within
> **[NUMBER]** days, **any of the persons in 16.5(a) may apply to the court**, and the Trustees shall
> cooperate with that application.
>
> **16.10 Acceptance of office and handover. [MANDATORY — continuity.]**
> (a) A successor accepts office in writing, and is given: this deed and its schedules; the Trust asset
> register; the accounts and any audit reports; the decision register; the conflicts register; the
> Beneficiary register; the distribution record; the litigation and claims register; the obligation and
> filing calendar; and the location of every original document (`D74`).
> (b) The outgoing Trustee shall: deliver the Trust property and records to the incoming or continuing
> Trustees; provide a written accounting of their trusteeship to the date of cessation; complete or
> hand over outstanding filings and obligations with dates; and cease to hold themselves out as a Trustee.
> (c) The handover is **recorded and signed** by the outgoing and incoming Trustees, with the date, the
> property transferred and the records delivered.
>
> **16.11 Authority continuity. [MANDATORY — operational.]** Pending handover, the **remaining Trustees**
> retain authority; a sole remaining Trustee may act only as the law permits; **bank mandates, signatory
> cards, filings and system access are updated within [NUMBER] days**, and the update is recorded (this is
> the operational step that most often fails — `D66`, `D68`, `D58` §2.3).
>
> **16.12 Indemnity, accounting and liability on cessation. [COUNSEL TO CONFIRM.]**
> (a) The outgoing Trustee's indemnity for properly performed acts continues as this deed provides
> (clause 13); (b) an outgoing Trustee remains liable for acts and omissions during their trusteeship
> (clause 13.5 — no exoneration for dishonesty, fraud or wilful misconduct); (c) the Trustees shall settle or
> arrange the outgoing Trustee's remuneration and expenses; and (d) the Trustees shall record whether any
> claim, irregularity or unresolved matter was identified at handover, and how it will be addressed.
>
> **16.13 Deadlock and court involvement. [COUNSEL TO CONFIRM.]** Where the deciding persons cannot decide,
> or where the number of Trustees falls below the minimum and cannot be restored under 16.9, **any person in
> 16.5(a) may apply to the court**, and the Trustees shall disclose to the court such information as the
> court directs, subject to any lawful claim of privilege.
>
> **16.14 Regulator and notification steps. [COUNSEL TO CONFIRM — MANDATORY where the Trust is incorporated
> under a statutory route.]** Every notification, return and filing required on the appointment, removal,
> resignation or death of a Trustee (and any requirement to keep the register current, or to lodge the
> instrument) is performed within the statutory period and recorded in `D68` (`D02` §19.4, §22.4).
>
> **16.15 Supervision preserved.** **Nothing in this clause prevents any person from applying to the court,
> or from reporting a Trustee's conduct to a regulator or a law-enforcement authority**, or restricts the
> court's supervisory jurisdiction.

### 5.3 Plain-language explanation

The clause says: a trustee can be removed, but only for a **stated reason**, on **evidence**, after being
**told and given a chance to answer**, and by a person other than the trustee concerned. If a trustee is
suspected of dishonesty, they can be **suspended immediately** with safeguards — a second signature, blocked
access — while the proper process runs. A departing trustee must **hand over everything** and account for
their time in office, and the bank mandates and accesses must be updated quickly, because that is where trusts
and companies are usually left in hands nobody intended. If things go wrong or no one can decide, **the court
is always available**, and the clause says so.

**What it avoids.** It avoids a mechanism that a single trustee could use to remove another for personal
reasons; it avoids removal by a family vote alone; and it avoids anything that looks like a software decision.

### 5.4 Risks and limitations

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **Removal mechanism inconsistent with the chosen legal form** (e.g. where the court's power is exclusive, or where the instrument cannot designate the decider) | **High** | `Q-TC-08`; 16.5 is drafted with alternatives for that reason |
| 2 | **Removal used as a factional weapon** in family conflict | **High** | Grounds must be evidenced; notice and response rights; malicious suspension is itself a breach (16.8) |
| 3 | **A suspended trustee's duties continue**, creating exposure | Medium | Suspension is defined as access-restricting, not duty-removing; time-boxed |
| 4 | **Handover failure** leaving the Trust unadministered | **High** | 16.10–16.11 with recorded handover and mandate updates; `D58` §2 |
| 5 | **Interim co-trustee** appointed without legal authority | **High** | Expressly `[COUNSEL TO CONFIRM]` in 16.8(c) |
| 6 | **Vacancy deadlock** | Medium | 16.9(e), 16.13 — court route plus duty to cooperate |
| 7 | **Under-insurance / indemnity gaps** on a disputed cessation | Medium | `D71`; clause 13; `D03` §9 |

### 5.5 Related clauses and documents

`D02` §2.4 (eligibility), §13 (remuneration/indemnity), §14 (conflicts), §15 (decisions), §16 (this clause),
§17 (Protector), §19 (records), §22 (Cap. 318 route — notifications and common seal), §23.6 (severability);
`D03` §6 (incapacity/vacancy, mirrored), `D03` §7 (Protector), `D04` §7 (**RM-04**: appointment/removal is a
Reserved Matter — the cross-reference must be reconciled so the two clauses do not contradict), `D08`, `D10`,
`D14`, `D58`, `D66`, `D68`, `D71`, `D73`, `D74`.

### 5.6 Governing-law assumptions `[COUNSEL TO CONFIRM]`

1. That the deed may designate who removes a trustee, and that the court retains a supervisory power.
2. That the instrument may prescribe grounds, and that the list is not exhaustive of the court's powers.
3. That an interim/suspended-trustee device is available, or failing that, that the court's appointment
   process must be used instead.
4. That the minimum number of trustees and any eligibility requirements (including residency) are as
   `D01`/`D02` §2.4 assume, and that removal cannot breach them.
5. That procedural fairness (notice and an opportunity to respond) is a requirement in practice, and that a
   removal without it is vulnerable.

### 5.7 Counsel questions

**`Q-TC-07`** — Who may lawfully remove a trustee under the chosen route, and may the deed designate a decider
(the Protector, the remaining trustees, the beneficiary classes) or is the court's involvement mandatory? What
are the minimum trustee numbers, eligibility criteria and any residency or licensing requirement? Must changes
be notified to a registry, and within what period?
**`Q-TC-08`** — Is an interim or suspended trustee permissible? What are the trustee's duties and liabilities
during suspension? Does the removal of a trustee require a deed, a court order or a notice, and what is the
position where the removal is disputed?

### 5.8 Required decisions

| # | Decision | Owner |
|---|---|---|
| 1 | The **decider** in 16.5(b) (Protector / remaining trustees + beneficiary concurrence / court) | Settlor + counsel |
| 2 | Whether a **Protector** is appointed at all (if not, 16.5(b)(ii) applies) | Settlor |
| 3 | `[NUMBER]` thresholds: months of inactivity; notice period; suspension time-box; mandate-update period | Settlor |
| 4 | Whether an interim co-trustee mechanism is adopted | Settlor + counsel |
| 5 | The **successor trustees** to be named (and their consent obtained) | Settlor |
| 6 | Whether the beneficiary-concurrence requirement is workable in this family's circumstances | Settlor + Family Council |

### 5.9 Approval status

`CONDITIONAL_DRAFT` / `PENDING_COUNSEL`. **16.6 (notice and response), 16.10 (handover) and 16.15
(supervision preserved) are treated by the pack as non-negotiable in substance.**

---

## 6. Cross-clause and cross-document effects (Gate 8 hooks)

| # | Effect | Where reconciled |
|---|---|---|
| 1 | **`D04` §7 RM-04** (appointment/removal of a Trustee is a Reserved Matter requiring Protector consent) and **`D02` §16.5** (removal decided by the Protector + remaining Trustees) must not contradict each other | Consistency report item **P-17**; counsel to confirm which instrument governs |
| 2 | **RM-13** protects the non-negotiable boundary clauses (no-delegation, AI prohibition, no-indemnity-for-dishonesty, conflicts). **TC-2's 20A.2 and TC-3's 10.19(c) should be added to that protected set** | `D04` §7 amendment proposal recorded; **not applied without the Trustees/Settlor** |
| 3 | `D05` (beneficiary framework) must be updated to reference **§10.9** (no entitlement) as its deed-side anchor | New sub-reference in `D05`; recorded in the consistency report |
| 4 | `D03` §6 must mirror **16.4–16.15** or expressly defer to the deed | `D03` edit; precedence rule stated |
| 5 | `D09` (disputes) must cross-reference **20A** as the family's first-stage procedure (without affecting legal rights) | `D09` edit |
| 6 | The **control plane** (`trust_provisions.provision_type`, `legal_effect_status = INERT`) may record these clauses as *provisions*, but **must not imply enforceability** | `D02` §"control plane" note; W4 |
| 7 | `D11` §10 (enforceability map) must classify **which parts of 20A are family governance (unenforceable as such) and which are deed provisions** | `D11` cross-reference; consistency item |
| 8 | **Bilingual/plain-language summaries** for family use are a `D19` communication task — **not** a substitute for the deed text | `D19` |

## 7. Consolidated counsel questions added by this pack

| Ref | Question | Priority |
|---|---|---|
| `Q-TC-01` | Validity and limits of the restraint on alienation (spendthrift) | **1 — gates formatting** |
| `Q-TC-02` | Fraud-on-creditors / asset-protection risk, and the effect of settlement timing | **1** |
| `Q-TC-03` | Validity and permissible drafting of the no-contest/forfeiture provision | **1** |
| `Q-TC-04` | Mandatory family provision and dependants' relief — how the clause must yield | **1** |
| `Q-TC-05` | Content of the duty of impartiality; evidence of "due consideration"; may trustees refuse reasons | 2 |
| `Q-TC-06` | Powers to distribute in specie / lend / fund purposes; limits of an emergency distribution | 2 |
| `Q-TC-07` | Who may remove a trustee; minimum numbers; eligibility; notifications and periods | **1** |
| `Q-TC-08` | Interim/suspended trustee; deed vs court order; disputed removal | 2 |

**These are added to `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` §2 as a new sub-section (`Q-TC-*`) and are
ranked in that brief's priority table.**

## 8. Approval status of this pack

| Clause | Status | Effective? |
|---|---|---|
| TC-1 Spendthrift | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | **No** |
| TC-2 No-contest | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` (20A.5 expressly conditional) | **No** |
| TC-3 Discretionary distribution | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | **No** |
| TC-4 Trustee removal/replacement | `CONDITIONAL_DRAFT` / `PENDING_COUNSEL` | **No** |
| Integration into `D02` | Drafted; **the deed remains `NOT EXECUTED`** | **No** |

**No clause in this pack is adopted, executed or enforceable. The deed must not be described as
execution-ready while the trust jurisdiction and legal form remain unresolved (`DAA-ARCH-006`).**
