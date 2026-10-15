# BEYU-LF-REG-RTM — Request-to-Document Matrix

Document ID: `BEYU-LF-REG-RTM`
Title: Request-to-Document Matrix — every item requested, the document that answers it, its status, and what is
still missing
Version: 1.0 · Date 2026-10-15
Status: `INFORMATIONAL`
Owner: CGO (proposed) · Approving authority (proposed): CGO
Next review date: On any change to the expansion
Classification: `INTERNAL`

> **WHAT THIS IS.** The expansion brief asked for a long list of things. **This matrix takes every requested
> item, names the document that answers it, states its status, and — most importantly — states what is still
> missing.** It is the honest index: **a document existing is not the same as the thing it describes existing.**
> **A row marked "Delivered" means a document was drafted and placed under version control. It does not mean the
> underlying legal position, entity, registration, filing, consent or transaction exists — in most cases it
> explicitly does not.** The column **"What is still missing"** is the operative one.

**Status codes used below** (mapped 1:1 onto the pack vocabulary in `README.md` §3.1; see `README.md` §11.3 for
the full extended taxonomy):
`COMPLETE_DRAFT` · `CONDITIONAL_DRAFT` (drafted, but conditional on counsel/decisions) · `TEMPLATE` (blank,
unexecuted) · `PRELIMINARY_FRAMEWORK` (structure only, substantive content unresolved) · `BLOCKED` ·
`INFORMATIONAL`

---

## 1. Gate 1 — Trust clauses

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 1.1 | Spendthrift clause | `TC-01` §2 → **operative at `D02` §11A.1–11A.10** | `CONDITIONAL_DRAFT` | Counsel's view on enforceability, on creditors' rights and on the interaction with insolvency/matrimonial/family-provision law (`Q-TC-01`, `Q-TC-02`) |
| 1.2 | No-contest clause | `TC-01` §3 → **operative at `D02` §20A.1–20A.9** | `CONDITIONAL_DRAFT` | **Counsel must settle whether 20A.5 (consequences) can be drafted lawfully at all**; the carve-outs and the preservation clause are drafted as non-negotiable (`Q-TC-03`, `Q-TC-04`) |
| 1.3 | Discretionary distribution clause | `TC-01` §4 → **operative at `D02` §10.8–10.20** | `CONDITIONAL_DRAFT` | Counsel on the duty of impartiality, on the tax treatment of distributions, and on the affordability/liquidity discipline; the thresholds are `[USER TO SUPPLY]` |
| 1.4 | Trustee removal and replacement | `TC-01` §5 → **operative at `D02` §16.4–16.15**, mirrored in `D03` §5 | `CONDITIONAL_DRAFT` | **The allocation of the removal decision must be reconciled with `D04` RM-04 (consistency item P-17)**; counsel on temporary suspension, on the minimum-trustee rules and on statutory notification steps (`Q-TC-07`, `Q-TC-08`) |
| 1.5 | Per-clause purpose, text, plain language, risks, related clauses, law assumptions, counsel questions, decisions, approval status | Delivered in `TC-01` §2–§6 for all four clauses | `CONDITIONAL_DRAFT` | **Approval status: none. All four are `PENDING_COUNSEL`** |
| 1.6 | Deed marked not execution-ready | `D02` header + integration note; `TC-01` §1 | Delivered | **The trust jurisdiction and legal form remain unresolved (`DAA-ARCH-006`)** |
| 1.7 | Counsel questions filed | `Q-TC-01`…`Q-TC-08` → brief sub-section + priority rows | Delivered | **Counsel's answers — none obtained** |

## 2. Gate 2 — Founders and corporate

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 2.1 | Founders Agreement | `FA-01` | `TEMPLATE_NOT_EXECUTED` | **No founder named, no allocation, no vesting terms, no leaver definitions, no consideration. Counsel on consideration, vesting enforceability, tax and securities** |
| 2.2 | Incorporation documents + formation checklist + resolutions/consents | `INC-01` | `PRELIMINARY_FRAMEWORK`, in part `BLOCKED` | **The jurisdiction and structure decisions; the registry's requirements, forms, fees and periods; counsel (`Q-R-01`). `D21` remains `BLOCKED`** |
| 2.3 | Co-founder exit clause + separation agreement template | `CX-01` (exit clause X.1–X.8 + agreement §5) | `TEMPLATE_NOT_EXECUTED` | **The good/neutral/bad leaver definitions; the price basis; counsel on penalty, on statutory repurchase limits and on what a release cannot cover** |
| 2.4 | Shareholders' Agreement | `D23` **extended** with §5A (founder equity/vesting/leaver interface) | `COMPLETE_DRAFT` | **Counsel on the order of precedence between the Articles, `D23`, `FA-01` and `CX-01` (`Q-H-03(a)`) — flagged as the real risk in `D23` §5A.11** |
| 2.5 | Cap table + share-ownership register | `CAP-01` + `D64` | `TEMPLATE` | **EVERYTHING: zero verified shares, no entity, no register, no consideration. The cap table is blank by design** |
| 2.6 | ESOP plan + grant/vesting/exercise/leaver rules | `ESOP-01` | `TEMPLATE_NOT_EXECUTED` | **No plan adopted, no pool, no grant. Counsel on lawfulness, tax and withholding (`Q-TAX-03`); accountant on the accounting treatment** |
| 2.7 | Term sheet (conditional on a real transaction) | `FIN-03` | `TEMPLATE_NOT_EXECUTED` | **No transaction, no investor, no valuation. Every figure blank by design** |
| 2.8 | Required coverage: contributions, roles, decision rights, classes, vesting, good/bad leaver, transfer restrictions, pre-emption, tag/drag, dilution, deadlock, disputes, confidentiality, IP assignment, exit, death/incapacity, restrictive covenants, tax, securities, amendment, governing law | All mapped in `FA-01` §1–§6, `D23` §5A, `CX-01` §2–§5 | Delivered as structure | **Substance depends on decisions and counsel — see the individual rows** |
| 2.9 | Separate binding from non-binding | `FA-01` §6.7; `FIN-03` §14 (clause 14 marks the binding clauses) | Delivered | **Counsel to settle which term-sheet clauses bind** |
| 2.10 | Dual-class preserved as an unapproved proposal | `D22`; `CAP-01` §2.3; `INC-01` §3.2 | Delivered | **`Q-H-01(a)`–`(h)` unanswered: the 1:1,000 design is NOT adopted and no constitutional document contains it** |
| 2.11 | Never invent ownership; blank template if nothing verified | `CAP-01` §1–§2 | Delivered | **Nothing verified — the blank is the correct output** |

## 3. Gate 3 — Confidentiality, covenants and IP

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 3.1 | NDA | `NDA-01` (7 variants) | `TEMPLATE_NOT_EXECUTED` | **No NDA signed; no counterparty. Counsel on party capacity (trust/trustee), on remedy enforceability and on the data-protection terms** |
| 3.2 | Non-compete / restrictive covenant templates (no enforceability assumption; narrower alternatives) | `RC-01` | `CONDITIONAL_DRAFT` | **The actual law of restraint of trade has NOT been researched. Every covenant is a request for counsel; `§3.12` (counsel's assessment) is empty** |
| 3.3 | IP assignment agreement | **Existing `D41`** (no duplicate template created) | `TEMPLATE_NOT_EXECUTED` | **No assignment signed. Every contributor — including founders — must be documented (`IP-EV-01` §7.2)** |
| 3.4 | Trademark/IP set: inventory, chain of title, search/filing/renewal tracker, brand/domain, copyright/software, contributor attestations, OSS review, enforcement log, evidence archive | `D40`, `D44`, `D45`, `D46`, `D47` (existing) + **`IP-TM-01`** (search/filing/renewal) + **`IP-EV-01`** (attestations, chain, OSS review, enforcement, evidence) | New: `TEMPLATE` | **ZERO verified rights. The trademark TERM IS UNRESOLVED (7 vs 10 years — contradictory sources) so NO renewal date may be derived. Tanzania is not a Madrid route. The fixtures (`DOC-IP-001`, `TZ-2025-4421`) are fiction** |
| 3.5 | Variants for founder / employee / contractor / vendor / adviser / counterparty | `NDA-01` §2; `RC-01` §4 | Delivered | Substance per variant depends on counsel |

## 4. Gate 4 — Employment and HR

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 4.1 | Employee contracts | `EMP-01` | `CONDITIONAL_DRAFT` | **`EMP-01` Part F (the mandatory terms) is EMPTY because EMPLOYMENT LAW HAS NOT BEEN RESEARCHED. No contract may be issued until counsel supplies it** |
| 4.2 | Offer letters / Barua za Ajira | `EMP-02` (EN + Kiswahili) | `TEMPLATE_NOT_EXECUTED` | **No offer made to anyone; no candidate; every term blank. The Kiswahili text is a working translation, not counsel-reviewed** |
| 4.3 | HR policies and employee handbook | `EMP-03` (25 policies) | `CONDITIONAL_DRAFT` | **No policy adopted or communicated. Every threshold blank; the protected-grounds list and the monitoring rules require counsel** |
| 4.4 | Modular by entity and worker category | `EMP-01` §1, §3, Part D schedules S1–S10; `EMP-03` §3 | Delivered as structure | **`EMP-01` §2 (the employer determination) is COMPLETED FOR NOBODY — the employer is unidentified for every worker** |
| 4.5 | Determine the actual employer | `EMP-01` §2 (12 questions, per worker) | **Framework only** | **The pack's assumption that the holding company employs everyone is NOT verified and is likely wrong (`EMP-01` control 2)** |
| 4.6 | English and Kiswahili, with a maintained bilingual glossary | `EMP-02` (both texts); `EMP-04` (glossary, ~120 terms, translation QC, governing-language decision) | `PRELIMINARY_FRAMEWORK` | **Counsel must decide the governing language; borrowed governance terms (trust, trustee, protector, beneficiary, option, vesting) must be settled — never loosely translated** |
| 4.7 | Never fabricate staff, salaries, signatures or offers | Enforced throughout `EMP-01`–`EMP-04`; the seed/payroll rows are labelled synthetic | Delivered | **There is no staff list, no verified headcount and no salary figure anywhere in this pack** |

## 5. Gate 5 — Terms of service, privacy and compliance

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 5.1 | Terms of Service grounded in the actual product and contracting entity | `TOS-01` | `CONDITIONAL_DRAFT`, unpublished | **No entity is verified, the product is not defined, and THERE IS NO `/terms` ROUTE IN THE APPLICATION. Every substantive field is a placeholder** |
| 5.2 | Privacy Policy (Sera ya Faragha) built after a data inventory and data-flow mapping, unknowns `[USER TO CONFIRM]` | `PRIV-02` (inventory, flow map, retention, rights) **then** `PRIV-01` (the notice) | `PRELIMINARY_FRAMEWORK` + `CONDITIONAL_DRAFT` | **`PRIV-02` is substantially unknown; therefore `PRIV-01` is a structured shell and MAY NOT BE PUBLISHED until the gates in `PRIV-01` §1 are met** |
| 5.3 | Compliance pack with source/authority/provision/applicability/owner/evidence/status/reviewer per obligation, covering the named trackers | `CMP-01` (obligations register §1 + 16 trackers §3–§16) | `PRELIMINARY_FRAMEWORK` | **THE OBLIGATIONS REGISTER IS EMPTY. Nothing has been verified against a current authoritative source. `CMP-01` cross-references `D63`–`D75` rather than duplicating them** |
| 5.4 | No implied features or commitments | `TOS-01` §4 (12 prohibitions), `PRIV-01` §4 (12 prohibitions) | Delivered | — |
| 5.5 | No claim of consent, registration, certification, localisation or compliance without evidence | Enforced in `TOS-01`, `PRIV-01`, `CMP-01` §2, §18 | Delivered | **The group holds none of these things — every such claim is currently unavailable** |
| 5.6 | Align English and Kiswahili | `TOS-01` §3, `PRIV-01` §3; the reconciliation procedure in `EMP-04` §3 | Delivered as method | **Neither text has been reconciled or reviewed** |

## 6. Gate 6 — Fundraising

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 6.1 | Pitch deck with an evidence checklist for every claim | `FIN-01` (18-slide structure + the claim checklist + 15 forbidden claims) | `TEMPLATE` | **NO DECK EXISTS. No traction, customer, revenue, partner or investor. The honest version of the deck is stated in `FIN-01` §6** |
| 6.2 | Financial model: assumptions register, drivers, costs, headcount, capex, working capital, tax only with verified assumptions, financing, runway, three scenarios, sensitivity, no hidden hard-codes | `FIN-02` (13 sheets, assumptions register, the no-hard-code rule, the tax-blank rule, the scenario rule) | `TEMPLATE` | **The model is empty. No pricing, no remuneration, no headcount, no capex. The accounting framework is unratified (`C-1`)** |
| 6.3 | Illustrative figures visibly marked and kept from actuals | `FIN-02` control 3; `FIN-04`–`FIN-08` sample-presentation rule | Delivered | **There are no actuals to keep them from — there is no ledger** |
| 6.4 | Conditional term sheet coordinated with the corporate documents and cap table | `FIN-03` (20 clauses + a 12-row coordination table) | `TEMPLATE_NOT_EXECUTED` | **No transaction. `FIN-03` tables the exact consistency failures that would otherwise occur** |

## 7. Gate 7 — The five statements and notes

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 7.1 | Income Statement | `FIN-04` | `TEMPLATE`, **blank** | **No ledger, no opening position, no ratified policy** |
| 7.2 | Cash Flow Statement | `FIN-05` | `TEMPLATE`, **blank** | **No bank reconciliation** |
| 7.3 | Balance Sheet | `FIN-06` | `TEMPLATE`, **blank** | **No opening position; no verified share capital (the equity section cannot be completed)** |
| 7.4 | Statement of Changes in Equity | `FIN-07` | `TEMPLATE`, **blank** | **No verified share issue — `CAP-01` holds zero** |
| 7.5 | Notes to the Financial Statements | `FIN-08` (26 notes) | `TEMPLATE`, **blank** | — |
| 7.6 | Entity/period/currency/framework/consolidation identified first | `FIN-04`–`FIN-07` §0 (12 parameters) | Delivered as the required first step | **Every parameter is undetermined: no entity, no framework, no consolidation basis** |
| 7.7 | Per-entity separation | §0.1–§0.2 in each statement | Delivered as a rule | **No entity exists to separate** |
| 7.8 | Reconciliation controls (A=L+E, cash, equity, profit↔equity, cross-references) | `FIN-09` (22 controls, four bridges, findings discipline) | `PRELIMINARY_FRAMEWORK` | **No control has been run. `NOT_RUN` is the accurate result for all 22** |
| 7.9 | Blank templates + data-request checklist if no verified records | The 15-item data-request checklist is in `FIN-04`–`FIN-07` | Delivered | **Not one item (D1–D15) is held** |
| 7.10 | Any sample separately labelled `ILLUSTRATIVE` | `FIN-04` §"Sample presentation" | Delivered as a prohibition | **No sample with plausible numbers is permitted** |

## 8. Gates 8, 9 and 10 — Registers, checks and deliverables

| # | Requested | Document | Status | What is still missing |
|---|---|---|---|---|
| 8.1 | Master register updated (new documents, new series, new sections J/K/L) | `MASTER_DOCUMENT_REGISTER.md` v1.1 | Delivered | **103 register paths, all resolving on disk** |
| 8.2 | README, defined terms, DAR, counsel brief, sources register, traceability matrix, consistency report, roadmap, change log updated | All updated (see `CHANGE_LOG.md` §6) | Delivered | **`LEGAL_SOURCES_REGISTER.md` gains no new verified source in this expansion — the employment, consumer, sector and restraint-of-trade questions remain UNRESEARCHED and are labelled as such** |
| 8.3 | Comprehensive request-to-document matrix | **This document** | Delivered | — |
| 8.4 | Documented status taxonomy | `README.md` §11.3 (extended taxonomy, mapped 1:1) | Delivered | **Never `APPROVED` merely because drafting finished** |
| 8.5 | Per-document record fields | `README.md` §11.4 | Delivered | — |
| 8.6 | Accountant questions | `ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md` | Delivered | **None answered** |
| 8.7 | 14 named Gate 9 checks with exact commands, no over-claiming | `GATE-9_VERIFICATION_CHECKS.md` | Delivered | **Every check states what it does NOT prove** |
| 8.8 | Gate 10 deliverables A–K | `GATE-10_DELIVERABLES.md` | Delivered | **Including the W/X (conditional items) and M1–M5 merge blockers** |

---

## 9. The three-column honesty test

**For any row above, ask three questions:**
1. **Does the document exist?** (Delivered / Drafted / Not yet.)
2. **Does the thing the document describes exist?** (An entity? A share? A registration? A licence? A filed
   return? A signed contract? A customer?) — **for almost every row in this expansion, the answer is NO, and the
   document says so on its face.**
3. **What single action would move it forward?** — **that action is a decision, an instruction to counsel, an
   instruction to the accountant, or a real transaction. Not more drafting.**

**What this matrix does not do:** it does not claim that any document is approved, executed, filed, registered,
enforceable or effective, and it does not claim that any entity, licence, registration, ownership or transaction
exists. **It maps requests to drafts and names the gaps.**