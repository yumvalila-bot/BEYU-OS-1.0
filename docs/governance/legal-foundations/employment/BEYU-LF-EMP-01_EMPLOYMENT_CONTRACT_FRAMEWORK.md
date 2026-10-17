# BEYU-LF-EMP-01 — Employment Contract Framework (Modular by Entity and Worker Category)

Document ID: `BEYU-LF-EMP-01`
Title: Employment Contract Framework — modular contracts, employer identification and worker categories
Version: 1.0 (draft) · Date 2026-10-15
Status: **`CONDITIONAL_DRAFT` / `PENDING_COUNSEL`** — **no employment contract is in force, no person is
employed by any entity in this group, and no offer exists.**
Owner (proposed): the HR function with the Company Secretary function · Approving authority (proposed): the
board (the framework and the standard terms); the named officer for individual offers within limits (`D27`)
Next review date: On counsel's markup; then annually, and on every employment-law change
Classification: `HIGHLY_RESTRICTED` (contains personal data — `PRIV-01`)
Related: `D15` (family-employment policy — **incorporated by reference, not restated**), `D43` §4, `D41`,
`NDA-01`, `RC-01`, `EMP-02`, `EMP-03`, `EMP-04`, `PRIV-01`, `CMP-01`, `D69`, `D68`, `D72`, `D74`, `ESOP-01`
Depends on: **employment law research — WHICH HAS NOT BEEN DONE in this pack.** No employment statute,
regulation, minimum wage, leave entitlement, probation rule, notice period, severance rule, working-time limit,
statutory contribution or dismissal procedure is cited in this document, **because none was verified.**
Every such item is `[COUNSEL TO CONFIRM]` and is a placeholder.

> **⚠⚠ THE EMPLOYMENT CONTROL — READ BEFORE DRAFTING ANYTHING.**
> **1. THIS PACK HAS NOT RESEARCHED EMPLOYMENT LAW. Employment law in this jurisdiction has not been
> retrieved, read or verified.** No minimum wage, no leave entitlement, no notice period, no probation limit,
> no working-hours cap, no social-security rate, no payroll-tax rule, no dismissal procedure, no
> unfair-dismissal remedy. **Therefore every such term in this document is a blank `[COUNSEL TO CONFIRM]`
> placeholder, and no contract may be issued, offered or signed until counsel has supplied the mandatory terms
> for the jurisdiction.** A contract that omits a mandatory term is defective; a contract that contains a term
> the law does not permit is worse.
> **2. THE EMPLOYER MUST BE IDENTIFIED BEFORE ANY CONTRACT IS DRAFTED.** The pack's assumption — that the
> holding company employs everyone — **is not verified and is likely wrong.** Different workers may be employed
> by different entities (a sector operating company, a family office, a Foundation, a service company), and the
> employer determines liability, tax, pension, immigration, workplace-safety duties, dismissals and the identity
> of the respondent in a dispute. **`§2` must be completed for every engagement before a contract is created.**
> **3. NO PERSON MAY BE INVENTED.** There is no staff list, no verified headcount, no salary figure, no
> signature and no offer anywhere in this pack or in the software. The repository's `seed.ts` contains
> **synthetic** employee and payroll demonstration rows (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6) —
> **they are not staff and must never be presented as such.** A fabricated list of employees, of salaries or of
> an org chart with names is a serious harm — **especially where family members and their personal financial
> information are involved.**
> **4. NEVER USE AN EMPLOYMENT DOCUMENT TO MOVE A NON-TRANSFERABLE RIGHT.** A right the law gives a worker
> cannot be waived, assigned, novated or contracted away by a clause in this framework. Where drafting tempts
> it, the correct instruction to counsel is a question, not a clause.

---

## 1. The framework's structure (modular by entity × worker category)

```
BEYU EMPLOYMENT FRAMEWORK
│
├── PART A — THE EMPLOYER DETERMINATION (§2)         ← must be completed FIRST, per worker
├── PART B — THE WORKER CATEGORY (§3)                ← determines which schedule applies
├── PART C — THE CONTRACT SHELL (§4)                 ← the clauses common to every category
├── PART D — SCHEDULES BY CATEGORY                   ← the category-specific terms
│      ├── S1 Permanent, full-time — senior/managerial
│      ├── S2 Permanent, full-time — non-managerial
│      ├── S3 Fixed-term / project
│      ├── S4 Probation supplement
│      ├── S5 Part-time
│      ├── S6 Casual / daily (where lawful — [COUNSEL TO CONFIRM])
│      ├── S7 Internship / trainee (with the prohibition on using it to avoid employment)
│      ├── S8 Remote / hybrid (place of work, data, equipment, health and safety)
│      ├── S9 Employee seconded to another group entity (which entity is the employer; who bears liability)
│      └── S10 Non-executive / advisory role (not an employment relationship — see §3.4)
├── PART E — ANNEXES: confidentiality (NDA-01 EMP variant) · IP assignment (D41) ·
│            restrictive covenants (RC-01) · data-protection notice (PRIV-01) · ESOP (ESOP-01, if applicable)
└── PART F — COUNSEL'S MANDATORY-TERMS SCHEDULE   ← EMPTY UNTIL COUNSEL SUPPLIES IT (this is the blocker)
```

**1.1 Part F is the gate.** **No document in Parts C–E may be issued to any person until Part F is populated
by counsel with the mandatory terms for the jurisdiction** — leave, notice, working time, wages, statutory
deductions, probation, dismissal, and the mandatory particulars a written statement must contain.

## 2. Part A — The employer determination (complete one row per worker before drafting)

| # | Question | Answer `[USER TO SUPPLY]` | Why it matters |
|---|---|---|---|
| 2.1 | **Which legal entity will be the employer?** (name it) | — | Determines **everything**: liability, tax, pension, immigration, dismissals, and who is sued |
| 2.2 | Does that entity **exist** (a certificate inspected)? | — | **If not: nothing can be issued** (`INC-01`) |
| 2.3 | Does the entity have a **registered address, tax registration and any required employer registration**? | — | A payroll cannot lawfully be run without them |
| 2.4 | Is the entity **able to comply** with employer obligations (statutory contributions, insurance, workplace safety)? | — | A new entity with no infrastructure is a compliance risk, not a convenience |
| 2.5 | Where will the **work be performed**, and does that create a **permanent establishment, registration or withholding** obligation for a *different* entity? | — | **Remote work across borders creates tax and registration exposure** (`Q-TAX-01`, `Q-LEG-03`) |
| 2.6 | Is the worker a **family member** of the founder/Trust beneficiaries? | — | Trigger: conflicts, related-party treatment, arm's-length assessment, `D72` |
| 2.7 | Would the arrangement **create a conflict** (a manager related to the person they manage; a family member approving a family member's pay)? | — | `D14`, `D25` §6; the **interested person must not vote** |
| 2.8 | Does the role involve **money movement, signing authority or system administration**? | — | Requires second-person control (`D35`), segregation of duties, and a **bond/insurance** check where appropriate |
| 2.9 | Will the worker have **access to personal data** (patients, customers, employees, family)? | — | `PRIV-01` §5: role-based access, a confidentiality duty, and the DPO's involvement |
| 2.10 | Will the worker be **seconded** to, or work under the direction of, another group entity? | — | **The direction-test can create a dual or different employer** `[COUNSEL TO CONFIRM]` — S9 |
| 2.11 | Is the worker a **foreign national** or working outside the country? | — | Work permits, tax, social security, and the legality of the arrangement **before** work starts (`Q-LEG-03`) |
| 2.12 | Who **manages, pays, evaluates and can dismiss** this worker? | — | The four functions must point at the same employer, or the structure is a mismatch |

**2.13 The rule.** **Where 2.1, 2.2, 2.4 or 2.5 cannot be answered, no contract, offer or engagement document
may be created for that worker.** The pack's answer to "we need someone urgently" is: *then the entity and its
registrations come first — the urgency does not create the compliance, it only reveals its absence.*

## 3. Part B — Worker category (classification is a legal conclusion, not a preference)

| # | Category | Who decides the category | Risk if wrong |
|---|---|---|---|
| 3.1 | **Employee** | **The law**, on the facts of control, integration, economic dependence and the contract taken as a whole — **not the label the parties choose** | Misclassifying an employee as a contractor exposes the group to arrears, penalties, statutory contributions and a discrimination/dismissal claim |
| 3.2 | **Worker / dependent contractor** (a category that exists in some systems) | The law | Same |
| 3.3 | **Independent contractor / consultant** | The law — **and only if the relationship genuinely is one**: own business, own tools, multiple clients, control of how the work is done, economic independence, an invoice and a business registration | **The label alone proves nothing.** `[COUNSEL TO CONFIRM the governing test and the consequences of misclassification]` |
| 3.4 | **Office holder** (director, trustee, protector, secretary) | Company/trust law, and the instrument appointing them | **An office is not an employment.** An office holder's duties, remuneration and liabilities are separate; do not issue an employment contract to disguise an office — and do not issue an office to disguise employment |
| 3.5 | **Agent / distributor / reseller** | The commercial instrument | Not workers; do not use employment documents |
| 3.6 | **Volunteer** | The law, and the reality of the arrangement | **An unpaid "volunteer" doing a job's work is likely an employee** — and a Foundation cannot lawfully be used to obtain free labour for a commercial group (`D48`, `D55`) |
| 3.7 | **Adviser / professional** | The engagement letter | Not an employment relationship; **conflicts and independence rules apply** (`D36`) |
| 3.8 | **Intern / trainee** | The law and the programme's design | Interns are workers in many systems; **a "trainee" used as cheap labour is a misclassification** |

**3.9 The classification test (record it for each engagement).** Control; integration into the organisation;
who provides the tools and the place of work; who bears the commercial risk and the chance of profit; whether
the person works exclusively for the group; whether they can send a substitute; whether they invoice; whether
they hold a business registration; the duration and continuity; and how the parties describe the arrangement.
**Apply the facts first and the label last** — the reverse is what regulators look for.
**3.10 The control-plane rule.** `hcm_employee_ref` and any employee or payroll row in the software is a
**record**, not a legal status (`DEFINED_TERMS` §2). **A row in an HR module does not make a person an
employee, does not establish an entitlement, and does not create or vary a contract.**

## 4. Part C — The contract shell (clause index; the mandatory-terms blocker is marked `[F]`)

| # | Clause | Note |
|---|---|---|
| 4.1 | **Title, parties, date, effective date** — the **employer's full legal name** and the worker's name | The employer question (§2) precedes this |
| 4.2 | **Position, duties, reporting line, place of work** | Duties may be attached as a schedule; a role description is not a guarantee of duties |
| 4.3 | `[F]` **Remuneration, pay period, pay method, deductions, statutory contributions, overtime/allowances** | **The terms must match counsel's Part F and the actual payroll records** — not a template |
| 4.4 | `[F]` **Working hours, days, rest, and any shift or on-call arrangement** | Subject to the statutory maximum |
| 4.5 | `[F]` **Leave**: annual, sick, maternity/paternity, public holidays, compassionate; accrual and carry-over | **Never state an entitlement that is below the statutory minimum** |
| 4.6 | `[F]` **Probation** — period, notice during and after, the basis of confirmation | Subject to any statutory cap |
| 4.7 | `[F]` **Termination** — notice, pay in lieu (if lawful), the grounds, and the **dismissal procedure** | A contract that permits summary dismissal for reasons the law disallows is unenforceable; **and the procedure must be one the group can actually follow** |
| 4.8 | **Disciplinary and grievance procedures** (see `EMP-03`) | Cross-reference; do not restate inconsistently |
| 4.9 | **Duties of fidelity, no competing engagement, compliance with policies** | Reasonable during employment; coordinate with `D15` |
| 4.10 | **Confidentiality** — the `NDA-01` employee variant, incorporated | Survives termination |
| 4.11 | **Intellectual property** — incorporated from `D41`; **the obligation to execute an assignment if required** | A contract clause is not always enough (`D43` §4) |
| 4.12 | **Restrictive covenants** — incorporated from `RC-01`, **with enforceability not assumed and the narrower alternatives used by default** | |
| 4.13 | **Data protection** — the worker's personal data (`PRIV-01`), and the worker's duty over others' data | Two directions |
| 4.14 | **Use of equipment, systems, email and devices; acceptable use and monitoring** — **with transparency about monitoring** `[COUNSEL TO CONFIRM the lawfulness and the notice required]` | Monitoring without notice creates a data-protection and employment exposure |
| 4.15 | **Health and safety duties** `[F]` | Statutory — do not invent |
| 4.16 | **Anti-bribery, sanctions and conflicts**; the duty to declare a conflict | `D14`, `CMP-01` |
| 4.17 | **Equity/ESOP participation (if any)** — **cross-reference `ESOP-01`; never promise equity in a contract** | A contract that promises equity the plan does not grant is a claim |
| 4.18 | **Collective/representative arrangements, if any** `[COUNSEL TO CONFIRM]` | |
| 4.19 | **Governing law, forum, notices, amendments (in writing), entire agreement, severability** | `[COUNSEL TO CONFIRM]` the **governing language** question — see `EMP-04` §5 |
| 4.20 | **Acknowledgment of receipt** of the policies and handbook (`EMP-03`) — **signed** | The evidence that the policies were communicated |

## 5. Offers, and the rule about promises

| # | Rule |
|---|---|
| 5.1 | **An offer letter is a document that can create a contract.** It must therefore contain only terms the group can honour, and it must be issued **by, or with the authority of, the identified employer** |
| 5.2 | Every offer states that it is **conditional on** the usual checks the law permits (identity, references, qualifications, right to work, and any sector-specific clearance), **named expressly** — not a general "satisfactory checks" |
| 5.3 | **No promise of equity, bonus, promotion, permanent status or a role that does not exist.** Where a discretionary bonus is mentioned, it must state that it is discretionary and not contractual |
| 5.4 | **No offer is issued, and no candidate is told they have an offer, before the authority limit and the budget are confirmed** (`D27`, `D68`) |
| 5.5 | **A withdrawn offer** must follow counsel's advice on the lawfulness of the withdrawal, and the reason is recorded |
| 5.6 | **Never back-date** an offer or a contract. A start date is a date; if the paperwork is late, record the actual dates |
| 5.7 | **Nothing in this pack constitutes an offer to any person**, and no offer may be created by editing this template without the employer determination and the authority check |

## 6. Files, records and personal data

| # | Rule |
|---|---|
| 6.1 | **One personnel file per worker**, in one place, with the index in `D74` and the retention period in the schedule |
| 6.2 | The file holds: the contract and its annexes; the signed acknowledgment of policies; the IP assignment; the identification and right-to-work evidence (as the law requires and only as long as necessary); payroll and leave records; appraisal and disciplinary records; and the termination record |
| 6.3 | **Access is role-based and logged**; the file is **not** in a shared drive, a personal cloud account or an email folder (`PRIV-01` §5) |
| 6.4 | **Family members' files** (and any worker's financial or health information) are `HIGHLY_RESTRICTED`: access on a need-to-know basis, with the access list reviewed |
| 6.5 | **Retention**: per the schedule; **a legal hold overrides expiry**; eligibility is never destruction without a human decision |
| 6.6 | **No sensitive data beyond need.** Do not collect a worker's medical details, family circumstances or biometric data unless the law requires it and counsel has advised |
| 6.7 | **A termination file** records the reason, the process, the payments and the correspondence — the evidence that the group can rely on later |

## 7. Decisions required from the user / family / governing bodies

1. **The employing entity per worker** (§2) — the first decision.
2. Whether the group has **any employment relationships at all** today, or whether the existing arrangements
   are contracts of service, offices, or informal engagements that must be regularised.
3. The **standard terms** — probation, notice, leave above the statutory minimum, and any benefits.
4. The **classification** of each existing engagement (§3), with counsel.
5. Whether any **family member** is employed, by which entity, at what remuneration, and how the conflict is
   managed (`D72`).
6. Whether to use **fixed-term or casual** arrangements, and counsel's view of their lawfulness.
7. The **remote-work** position, and whether it creates exposure in another jurisdiction.
8. Who holds the **authority to make an offer**, up to what limit (`D27`).

## 8. Counsel review note — `[COUNSEL TO CONFIRM]` — **this list is the work that has NOT been done**

1. **The mandatory terms** for a written statement/contract (Part F) — **the blocker**.
2. **Leave entitlements** (annual, sick, maternity/paternity, public holidays).
3. **Working time limits**, rest periods, and overtime treatment.
4. **Minimum wage and its scope**, and the lawful treatment of allowances.
5. **Probation** — permitted length and the notice position.
6. **Notice periods** on termination by either side, and pay in lieu.
7. **Dismissal** — the required grounds and procedure, and the remedies for unfair dismissal.
8. **Redundancy/severance** — when it is payable and how it is calculated.
9. **Statutory contributions** (social security, workers' compensation, training levy, payroll taxes).
10. **The worker-classification test** and the consequences of misclassification.
11. **Collective rights**, works councils, and any union recognition threshold.
12. **Restrictive covenants** — enforceability, and any requirement to pay during a restraint (`RC-01`).
13. **Monitoring and surveillance** in the workplace, and the notice it requires.
14. **Permanent establishment / cross-border remote work** exposure.
15. **Work permits and the right to work** for foreign nationals.
16. **Governing language** where the contract is bilingual (`EMP-04` §5).
17. **Family-member employment**: any special rule, and the arm's-length evidence required.

**No employment contract exists. No offer has been made. No person is identified as an employee of any entity
in this group. Employment law has NOT been researched in this pack — Part F is empty and this framework may
not be used to hire anyone until counsel supplies it.**