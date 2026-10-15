# BEYU-LF — GATE 0B: Expansion Coverage Inventory and Conflict Record

Document ID: `BEYU-LF-REG-GATE0B` · Version 1.0 · Date 2026-10-15
Status: **`INFORMATIONAL`** — audit and inventory. **Nothing in this document is an instrument, and no
expansion document is executed, approved or in force.**
Owner: Chief Governance Officer (proposed) · Classification: `INTERNAL`

Purpose: record the **actual** state of the repository at the start of the expansion work (Gate 0A–0F of the
expansion brief), inventory existing coverage so that nothing is duplicated or contradicted, and record every
conflict found **before** drafting.

---

## 1. Gate 0A — repository and PR state (audited, not assumed)

| Item | Finding | Evidence |
|---|---|---|
| Repository | `yumvalila-bot/BEYU-OS-1.0` | `git remote -v` |
| Base branch | `main` at `05e2fba` ("fix(health): make the post-sign-in load failure diagnosable…" #106) | `git log origin/main` |
| **PR #108** | **`OPEN`**, not merged, `mergeable: MERGEABLE`, `mergeStateStatus: UNSTABLE`, base `main`, head `arena/8fbc8030-beyu-os-1-0`, **head OID `e1f6b4a`**, 88 files, +17,948/−0 | `gh pr view 108 --json …` |
| Working branch | `arena/8fbc8030-beyu-os-1-0`. **The local checkout had been restored to `main` while the untracked pack files persisted**; all 88 files were verified **byte-identical** to the remote commit (`git show <oid>:<path>` vs disk), and the branch was then re-attached with `git reset --hard origin/arena/8fbc8030-beyu-os-1-0`. **No work was lost and no work was rewritten.** | hash comparison of all 88 files; 0 differences |
| Decision taken | **Continue on the existing PR #108 branch.** The brief's preference ("continue its branch when practical") is satisfied: the branch is open, unmerged, and this expansion is a continuation of the same deliverable. | — |
| Ambiguity recorded | PR #108's `mergeStateStatus` is `UNSTABLE` (a status-check state, not a conflict). **No merge conflict is present.** This expansion does **not** merge, and does not change that state deliberately. | — |

**Consequence for this work:** all new documents are added on the same branch and therefore appear **in PR
#108's diff**. The PR description is updated (Gate 10) to describe the expansion rather than to open a second
PR — a second PR from the same branch is not possible.

## 2. Gate 0B — what the existing pack already covers

The pack (written in revision 1.0) already covers a substantial part of the expansion brief. **The rule
applied to everything below: extend the existing document where it is the natural home; create a new document
only where the subject is genuinely distinct; never duplicate; never contradict.**

| Expansion requirement | Existing coverage | Decision |
|---|---|---|
| Trust clauses (spendthrift, no-contest, discretionary distribution, trustee removal) | `D02` (deed, clause architecture), `D03` §6 (incapacity/vacancy), `D04` §7 (reserved matters), `D05` (beneficiaries/distributions), `D09` (amendment/dispute/termination), `D10` (trustee resolutions) | **New `TC-01` clause pack + edits into `D02`'s schedules and cross-references into `D03`–`D05`, `D09`** — the clauses must be operative in the deed, not parallel files |
| Founders Agreement | **None** | New `FA-01` |
| Incorporation / constitutional documents | `D21` (**`BLOCKED`**), `D20`, `D22` (class rights), `D23` (SHA) | New `INC-01` formation pack; **`D21` remains `BLOCKED`** |
| Co-founder exit / separation | **None** (only `D29` leaver/drag-tag at shareholder level) | New `CX-01` |
| Shareholders' agreement | **`D23` exists** (parties, articles relationship, transfers, deadlock, restrictive covenants §8, execution block) | **Extend `D23`** only where the new documents create a cross-reference; no rewrite |
| Cap table | **`D64`** (blank register: classes, holders, options-as-separate, capital events) + `drizzle/0040_*` schema (`share_classes.authorized_shares`/`issued_shares`/`votes_per_share`, `equity_positions`, `dilution_scenarios`, `cap_table_snapshots`) | **New `CAP-01`** (verified-vs-authorised control + a **separately labelled ILLUSTRATIVE** scenario file); `D64` remains the register |
| ESOP | `D24` §2.4 (a **paragraph** of requirements, plan→grant→vest→exercise discipline) + `drizzle/0040_*` (`esop_plans`, `esop_grants`, `esop_grant_events`, `vesting_schedules`, `leaver_cases`) | **New `ESOP-01`** (plan + grant + vesting + leaver + exercise + termination); `D24` §2.4 cross-referenced from it |
| Term sheet | **None** | New `FIN-03` (coordinated with `D23`/`D64`/`ESOP-01` — not a parallel set of terms) |
| NDA / confidentiality | `D19` §7 (AI/confidentiality), `D36` §4, `D43` §C, `D15` (employment confidentiality) | **New `NDA-01`** with party variants |
| Non-compete / restrictive covenants | `D23` §8 (`[P]` `[COUNSEL TO CONFIRM ENFORCEABILITY]`), `D43` §E4 | **New `RC-01`** (including the narrower alternatives the brief requires) |
| IP assignment | **`D41` exists** (full template + traps + remediation workflow) | **Extend `D41`'s cross-reference set only**; no duplicate template |
| Trademark / IP pack | `D39`, `D40`, `D44`, `D46`, `D47`, `D45` | **New `IP-TM-01`** (search/filing/renewal tracker) and **`IP-EV-01`** (evidence archive + contributor attestations) |
| Employee contracts | **None** as documents (`D15` is the *policy*; `D43` §4 is the employment-IP hook) | New `EMP-01` |
| Offer letters / Barua za Ajira | **None** | New `EMP-02` (**EN + Kiswahili**) |
| HR policies / handbook | `D15` (family-employment policy and 15-item contract checklist) | **New `EMP-03`** handbook, **incorporating `D15` by reference** rather than restating it |
| Bilingual glossary | **None** | New `EMP-04` |
| Terms of Service | **None** (only UI mock fixtures in `sectors/health/src/data/*`, which are **fictional**) | New `TOS-01` |
| Privacy policy | `D70` (PDPA compliance **checklist**, obligation-oriented) | **New `PRIV-01`** (policy, EN + Kiswahili) + **`PRIV-02`** (data inventory/mapping — must be completed from the **actual** system, not from this pack) |
| Compliance register | `D63`–`D75` (13 registers) + `D55` (Foundation) | **New `CMP-01`** consolidating the *trackers the brief names* and **cross-referencing** `D63`–`D75` rather than duplicating them |
| Pitch deck | **None** | New `FIN-01` |
| Financial model | **None** (Finance OS architecture docs describe systems, not a model) | New `FIN-02` + controlled CSV templates |
| Five financial statements + notes | **None** (`docs/finance/*` are accounting-**policy** ratification documents, a different subject) | **New `FIN-04`–`FIN-08`** + `FIN-09` reconciliation controls |
| Accountant questions | **None** (only counsel questions) | New `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md` |
| Request-to-document matrix | **None** | New `REQUEST_TO_DOCUMENT_MATRIX.md` |

## 3. Gate 0C — repository search for existing material (and what it is)

| Area searched | Found | Verdict |
|---|---|---|
| Founder / ESOP / cap table **documents** | Nothing in `docs/`, root, or `sectors/` | **No duplication risk** |
| Founder / equity / ESOP **schema** | `drizzle/0040_founder_equity_cap_table_esop.sql` — `founder_profiles`, `share_classes`, `equity_positions`, `vesting_schedules`, `vesting_events`, `change_of_control_events`, `leaver_cases`, `esop_plans`, `esop_grants`, `esop_grant_events`, `cap_table_snapshots`, `dilution_scenarios` | **Software mechanism.** New documents must **map to these fields** and must state that a software record is **not** legal title (`DEFINED_TERMS.md` §2) |
| Trust **schema** | `drizzle/0041_*.sql` — `trust_instruments`, `trust_provisions` (`provision_type`, `jurisdiction_code`, `legal_effect_status` default **`INERT`**, `enforceability_assumed` default **`false`**), `trust_decisions`, `trust_distributions` | **The four new clauses must map to `provision_type` values and must not be loaded in a way that implies enforceability** (standing warning W4) |
| Employment / HR material | `sectors/health` UI components and fixture data (`documents.ts`, `mock.ts`, `spa-content.ts`) containing **fictional** offer letters, contracts and HR widgets | **Fiction.** Never a template source; never cited as evidence |
| Terms of service / privacy material | `sectors/health/src/data/*` fixtures and mobile README mentions | **Fiction / incomplete.** New documents drafted from the actual system, with `[USER TO CONFIRM]` where the practice is unverified |
| Pitch deck / investor material | `sectors/health/src/data/*` fixtures | **Fiction.** Never carried into a real deck |
| Financial statements / model | `docs/finance/*` (accounting **policy** ratification: approval matrix, evidence matrix, CFO decision registers), `FINANCE_OS_*` architecture docs, `src/lib/accounting*` | **Different subject** (policy/architecture). No statement templates exist |
| Legal-basis registry in code | `src/db/federation-data/tz-legal-bases.ts` (`FDLB_TZ_*` codes; explicitly "references to verify, **NOT** compliance claims"; PDPA, NIDA, BRELA registration framework, Tax Administration Act) | **Adopt as a cross-reference** in the Legal Sources Register so the pack and the software agree; **the pack does not upgrade these to verified facts** |
| Retention / data lifecycle in code | `src/lib/data-governance/retention-service.ts` (retention from document creation date, **legal holds block deletion regardless of expiry**, eligibility ≠ destruction, destruction requires human approval) | **The privacy retention schedule must align with this**, and must not promise deletion behaviour the system cannot perform |
| Integrations registry | `src/db/schema/platform.ts` → `integrations` (provider, category `BANK｜TAX_AUTHORITY｜REGULATOR｜HEALTH｜IDP｜AI_PROVIDER｜PAYROLL`, `secretRef` only — never the secret) | **Source for the privacy "recipients/processors" section**; the seeded provider rows are demonstration data and **do not** evidence a live integration |
| Public routes | `src/app/os/legal/page.tsx` ("no AI-generated legal conclusion is binding without authorised human legal governance"), `/enroll`, `/launcher`, sign-in | Used to bound the ToS/privacy scope; **the contracting entity remains unverified** |

## 4. Gate 0E — numbering, IDs and preservation

| Rule applied | Detail |
|---|---|
| **`D01`–`D75` and `DC-01` are not renumbered** | All existing IDs, filenames and cross-references are preserved exactly |
| **New IDs follow the existing register convention** | The pack's established pattern is a lettered series for subjects that are not part of the `D`-sequence (`DC-01` was the precedent). New series: `TC` (trust clause), `FA`, `INC`, `CX`, `CAP`, `ESOP`, `NDA`, `RC`, `IP-TM`, `IP-EV`, `EMP`, `TOS`, `PRIV`, `CMP`, `FIN` — each as `BEYU-LF-<SERIES>-<NN>_<NAME>.md`, placed in the folder that owns the subject |
| **No numbering change is proposed** | Nothing in this expansion requires renumbering anything. If a future revision does, it is recorded here first with its justification, per the brief |
| **New register sections** | `J — Employment and HR`, `K — Product terms, privacy and compliance`, `L — Finance, fundraising and reporting` are added to the master register; the `D`-sections A–I are unchanged |
| **Statuses** | The expanded status taxonomy (`README` §3.1, extended in this revision) is applied; the new documents are `CONDITIONAL_DRAFT`, `TEMPLATE_NOT_EXECUTED`, `PRELIMINARY_FRAMEWORK` or `BLOCKED`. **No new document is `APPROVED`, `EXECUTED`, `FILED` or `REGISTERED` — no evidence exists for any of those** |

## 5. Gate 0F — conflicts found before drafting (and their disposition)

| # | Conflict | Severity | Disposition |
|---|---|---|---|
| X-1 | **The expansion's "Terms of Service" and "Privacy Policy" presuppose a live product, a contracting entity and actual data flows — none of which is verified.** The repository contains a working platform and **fictional** fixture drafts | **S1** | Draft both as **`PRELIMINARY_FRAMEWORK`** with an explicit `[USER TO CONFIRM]` fact-base and a **data inventory that must be completed from the system**. **Not publishable** until the facts are confirmed |
| X-2 | **The pitch deck and financial model presuppose verified traction, revenue, customers and financial records. None exists** (the seed data is synthetic; the fixture "documents" are fiction; there is no ledger) | **S1** | Deliver a **deck structure with an evidence checklist** and **model templates with an assumptions register**; **no actuals, no fabricated traction**. Any illustrative figure is labelled `ILLUSTRATIVE` and physically separated from any record |
| X-3 | **The five financial statements presuppose a reporting entity, framework and ledger.** `docs/finance/*` shows the accounting **policy** is itself **unratified** (`C-1`) | **S1** | Deliver **blank controlled templates** + a **data-request checklist** + the `FIN-09` reconciliation controls. **`C-1` remains open** and is restated in every finance document |
| X-4 | **Employment documents presuppose jurisdiction-specific employment law, which this pack has not researched** (flagged in `D15` §10 and `D43` §4) | **S1** | Every employment document carries an explicit `[COUNSEL TO CONFIRM — employment law NOT researched]` banner, and the Kiswahili documents carry a **governing-language** question |
| X-5 | **`D21` (constitutional document review) is `BLOCKED` because no constitutional documents exist.** The expansion's "incorporation documents" request could be read as an invitation to complete `D21` by invention | **S1** | **`D21` remains `BLOCKED`.** `INC-01` supplies **formation checklists and resolutions**, and states explicitly that nothing has been incorporated |
| X-6 | **The dual-class proposal (1:1,000)** must not be treated as lawful or adopted by any new document | **S1** | Every document that touches share classes repeats that it is an **unapproved proposal** pending `Q-H-01(a)`–`(h)`; `CAP-01`'s illustrative scenario is labelled and is **not** a cap table |
| X-7 | **Software records (cap table snapshots, trust provisions, retention service) could be mistaken for legal effect** | **S1** | New documents map to the schema but state the standing rule: a software record creates **no** right, title, office or authority; `trust_provisions` stays `INERT`; retention eligibility ≠ deletion |
| X-8 | **Fictional fixture documents (offer letters, ToS, privacy policy, deck, IP assignment) exist in the same repository** | **S2** | Named again in each relevant new document as **fiction, not a source** |
| X-9 | **The pack and `src/db/federation-data/tz-legal-bases.ts` both list Tanzanian legal bases** | **S3** | The Legal Sources Register now **cross-references the `FDLB_TZ_*` codes** and records that the code-side list is itself labelled "verify, not a compliance claim" |

**All nine conflicts were identified before drafting. None was silently resolved, and none was resolved by
choosing a convenient reading.**

## 6. What this expansion does not do

1. It does **not** incorporate, register, file, execute, sign, issue, transfer, hire, fundraise or pay.
2. It does **not** resolve any `FIR-*`, `C-1`–`C-7`, `DAA-ARCH-005`, `DAA-ARCH-006`, `DAA-FO-*` or
   `DAA-FDN-*` item.
3. It does **not** create a cap table, a trust, a company, a fund, a policy that is in force, or a
   financial statement.
4. It does **not** touch application code, schema, migrations, seed data, fixtures or production settings.
