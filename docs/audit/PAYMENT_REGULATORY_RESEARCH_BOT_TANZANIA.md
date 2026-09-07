# Payment Regulatory Research — Bank of Tanzania (BEYU OS 2.0 payments programme)

**Date of research:** 2026-09-06 (Africa/Dar_es_Salaam).
**Researcher:** Arena agent, working only from public sources reachable from this sandbox.
**Status of this document:** RESEARCH, not legal advice, not a compliance opinion, not a filing.
Nothing here has been read or approved by Tanzanian counsel. Every line that turns on legal
effect carries `LEGAL_REVIEW_REQUIRED`.

## 0. Source discipline and what was and was not read

Two Bank of Tanzania primary instruments were read in full text through the BoT publications
URLs (the PDFs served from `bot.go.tz/Publications/NPS/`):

- **The Payment Systems (Licensing and Approval) Regulations, 2015** —
  `https://www.bot.go.tz/Publications/NPS/GN-THE%20PAYMENT%20SYSTEMS%20LICENSING%20AND%20APPROVAL%20REGULATIONS%202015.pdf`
- **The Payment Systems (Electronic Money) Regulations, 2015** —
  `https://www.bot.go.tz/Publications/NPS/GN-THE%20ELECTRONIC%20MONEY%20REGULATIONS%202015.pdf` (structure and
  Form C located through the same publication index; the licensing PDF's table of contents was read directly)

Everything else below is a **secondary source** (law firm summaries, regulator-news
summaries, developer guides). Secondary sources are labelled, and none of them is treated
as authority. Not read at all in this session: the National Payment Systems Act 2015
itself (only its reported sections), the 2021 licensing regulations some secondary sources
reference alongside the 2015 text (see §5 — unresolved conflict), BoT circulars in image or
PDF form beyond the two above, the FIU/KYC directives, TCRA licence conditions, and the
Bank Supervision Act provisions on outsourcing.

The BoT site's *navigational* pages could not be retrieved from this sandbox: the guessed
path `https://www.bot.go.tz/Payment-Systems` returned a 404 page. So this document quotes
the published regulation text where it could be fetched, and says "not read" where it could
not be. No page was paraphrased into certainty.

## 1. The three-way separation, stated up front

This is the distinction the programme is not allowed to collapse:

| Layer | What it means | Current state | Basis |
|---|---|---|---|
| **TECHNICAL READINESS** | Can BEYU hold a provider credential, verify a signature, ingest, match, escalate, reconcile, and post without breaking a control? | **PARTIAL** — the controls exist and are machine-tested against a mock provider; **no real provider credential exists in this deployment** | `tests/payments` (70 tests), `scripts/payments-demo.ts` self-test, `docs/audit/evidence/PAYMENT_PERF_PROBE.json` |
| **REGULATORY AUTHORIZATION** | Has the Bank of Tanzania licensed or approved *this entity* to operate a payment system / issue a payment instrument / issue electronic money? | **NONE — NOT APPLIED FOR.** `license.status = NOT_APPLIED` | Reg. 3 of the 2015 Licensing Regulations: "A person shall not operate a payment system without a valid licence issued by the Bank" |
| **LEGAL LICENSING** | The corporate facts a licence application requires: Tanzanian body corporate, capital, fit-and-proper declarations, TCRA licence, AML/CFT manual, agent agreements, outsourcing agreements, data-centre placement | **NOT ESTABLISHED, and outside engineering's authority to establish** | Regs. 4, 5, 6, 38, 39, 40, 41, 42, 44, 45, 46, 47, 48; `LEGAL_REVIEW_REQUIRED` on every one |

`REAL_PROVIDER_E2E = BLOCKED_NOT_ATTEMPTED` follows from the middle row, not from the first.
No amount of engineering moves the middle row, and this document does not pretend otherwise.

## 2. Reg-by-reg mapping of what BEYU already does against what the regulation asks

Verdict vocabulary: **SATISFIED** (machine-checked here and only here), **PARTIAL**,
**NOT_SATISFIED**, **OUT_OF_SCOPE_FOR_SOFTWARE** (a corporate/legal act, not a code change).
None of these verdicts is a compliance conclusion — they say where the engineering sits
relative to the text, and what the next non-engineering act is.

| Instrument | Requirement as written | Verdict | Evidence | Gap / owner / next action |
|---|---|---|---|---|
| Licensing Regs **r.3, r.4** | No payment system without a BoT licence; applicant must be a Tanzanian-incorporated body corporate | **OUT_OF_SCOPE_FOR_SOFTWARE** | none in repo | Legal/entity counsel: confirm which BEYU entity applies and under which category. **`LEGAL_REVIEW_REQUIRED`** |
| **r.5, r.6(m), r.6(m) incl. "disaster recovery plans and business continuity arrangements"** | The application must contain governance arrangements, internal controls, risk management, accounting procedures, administrative controls, operational risk management **with DR plans and BCA** | **PARTIAL** | `scripts/dr-drill.ts --payments` (restore into a scratch database, replay through the real webhook path, compare invariants); `docs/audit/*` | A real BCA document with named humans and call trees does not exist. Owner: Operations + CFO. Next: write BCA from the drill's phase structure, then have it adopted outside this repo |
| **r.6(j)** | Certified copy of a valid **TCRA** network and/or application services licence | **NOT_SATISFIED**, and it is not a code gap | — | Owner: Legal. Note for architecture: the *channels* (USSD push, SMS) that every TZ provider's flow depends on are TCRA-regulated; an integration that asks customers over SMS inherits this question. **`LEGAL_REVIEW_REQUIRED`** |
| **r.6(l), r.45** | Documented AML/CFT detection-and-reporting procedures; customer identification procedures; internal controls for identifying and reporting **suspicious transactions** | **NOT_SATISFIED as a regime; one real substrate table** | measured: `payment_risk_signals` (`signal`, `severity`, `score`, `evidence`, `disposition`, `rule_version`, `reviewed_by`, `reviewed_at`) is append-only and never auto-suppressed; the compliance domain holds only `compliance_assessments` and `compliance_obligations` | **There is no suspicious-activity report table, no sanctions-screening table and no case management anywhere in this database** — checked against `information_schema`. So there is no place to record the "identifying and reporting suspicious transactions" step that r.45(b) requires, no screening source, no FIU filing path, and no named compliance officer. The one honest strength: `payment_exceptions` already escalates structural risks a fraud team cares about (replay suspected, duplicate-id conflict, counterparty gap, fee/net disagreement, ambiguous routing) with `CRITICAL` severity and an open state. Owner: Compliance. **`LEGAL_REVIEW_REQUIRED`** |
| **r.38** | Agents only under an agency agreement (non-exclusive use, AML compliance, consumer protection); the provider is **liable for its agents' acts and omissions** | **OUT_OF_SCOPE_FOR_SOFTWARE** | — | If BEYU ever models agents/merchants, the liability rule is a reason to keep agent settlement in the same ledger as everything else rather than in a side spreadsheet. Owner: Legal |
| **r.39** | Display and disclose charges and fees, and **notify customers before imposing** new charges, in writing and at outlets | **NOT_SATISFIED** | measured schema: `payment_transactions` carries `fee_minor`, `tax_minor`, `net_minor`, `net_basis` per transaction, and `payment_exceptions` records `FEE_ABSENT` / `REPORTED_NET_DISAGREES_WITH_COMPONENTS` when a provider's own numbers do not tie | **There is no fee-plan, rate-card, invoice or customer-billing table in this database** (checked against `information_schema` on 2026-09-06: the only `payment_*` tables are the 14 from migration `0028`). What exists is *detection* of a provider's fee inconsistency, not disclosure to a customer. Owner: Product + Compliance |
| **r.40(1)** | Maintain a sound MIS that (a) collects and processes information efficiently and (b) **is capable of providing an audit trail for its own use, for internal and external auditors, and for the Bank** | **SATISFIED for (b) in the payment domain**, PARTIAL for (a) | measured columns: `payment_transaction_states` (axis, from/to state, reason, `actor_type`, `actor_user_id`, `control_role`, `evidence`, `policy_version`, `correlation_id`, `trace_id`) and `payment_corrections` (requester vs decider, approval reference, own accounting status) are append-only for the runtime role; `payment_webhook_events` keeps `payload_digest`, `payload_size_bytes`, `signature_valid`, `timestamp_valid`, `replay_detected`, `verification_detail`, `attempt_count`, `last_error_code`, `source_ip`, `correlation_id`, `trace_id`; `audit_log` carries `actor_user_id`, `actor_type`, `authority`, `approval_ref`, `policy_version`, `trace_id`, `ip_address` and is **hash-chained** (`prev_hash`, `hash`, `hash_version`); `tests/payments/payment-controls-db.test.ts` | "Provision to the Bank" means a supervisory reporting channel (returns), which does **not** exist in this repo. Owner: Compliance + Engineering. Next: build the return extract as a read-only projection, never as a second ledger |
| **r.41** | Keep **records of all transactions for not less than ten years** from the transaction date | **NOT_SATISFIED — F-P2-12 ELEVATED IN IMPORTANCE** | measured: `payment_transactions` has **no retention column of any kind** (48 columns enumerated), nor does `payment_webhook_events` (23 columns, no `retention_until`, no `raw_payload`) | Three concrete defects. (i) No ten-year floor is enforced anywhere — there is no field to enforce it on. (ii) The fixture-reset and purge tooling in this repo deletes payment rows by cascade, correct for `SD-` demo data and a **records-destruction hazard if run against production**. (iii) Because the inbox stores **only a SHA-256 digest**, the retained record cannot be re-verified against the original message later: a dispute about what the provider actually sent is answerable only from the provider's own archive. Privacy and evidential completeness pull in opposite directions here and the trade-off is undocumented. Owner: Engineering (add retention, or record why not) + Records/Compliance (the policy) + Legal (what "records of all transactions" must contain). **`LEGAL_REVIEW_REQUIRED`** |
| **r.42** | "**A payment system provider shall place its primary data center in relation to payment system services in Tanzania**" | **NOT_SATISFIED by the current deployment posture** | the app accepts any `DATABASE_URL`; nothing in Git pins or checks residency | This turns an internal rule into a licensing condition: the primary data centre must be in Tanzania. Owner: Infrastructure + Legal. Next: a deploy-time residency attestation check and a documented DR-site arrangement, since a Tanzanian-primary posture and offshore DR pull in r.42 and PDPA §§31–32 together. **`LEGAL_REVIEW_REQUIRED`** |
| **r.44** | Written BoT approval **before** any merger/acquisition or change in shareholding | OUT_OF_SCOPE_FOR_SOFTWARE | — | Legal. Recorded because it constrains financing rounds, not code |
| **r.46** | No **cross-border payment system services** without written BoT approval | NOT_SATISFIED (nothing built for cross-border) | — | Product scope decision + licence condition. `LEGAL_REVIEW_REQUIRED` |
| **r.47** | No branch or subsidiary in or outside Tanzania without written approval | OUT_OF_SCOPE_FOR_SOFTWARE | — | Legal |
| **r.48** | A licence/approval may not be transferred, assigned or encumbered | recorded | — | Relevant to any "white-label BEYU Payments" idea: the licence is not the software's to lend |
| **r.31(2)** (instrument approval review criteria) | Bank reviews the applicant's capability to operate **securely and efficiently**, AML/CFT risk mitigation, financial soundness, and that the system does **not impair the Bank's ability to monitor compliance** | **PARTIAL** | security tests (`tests/security`), perf probe artifact, audit trail above | The "does not impair the Bank's monitoring" test is a reason the audit trail and inbox must stay append-only **and** exportable. Owner: Engineering |
| **First Schedule** | Licence fees (TZS): inter-institutional 5,000,000; intra-institutional 1,000,000; payment system data management 5,000,000; remittance 1,000,000 (renewal same). "A licence shall be issued with conditions… conditions shall limit provision of services only for the category of the licence" | recorded for planning | primary text above | Budget/sequencing input for Legal & Finance. **The scope of a licence is capped by its category — an aggregator that behaves like a switch is a licence-category question, `LEGAL_REVIEW_REQUIRED`** |
| Electronic Money Regs 2015 (**Form C**) | Application for approval/licence to issue electronic money | NOT_APPLIED | — | **And see §3: issuance is restricted. BEYU's posture must be non-issuing** |
| BoT Circular of 18 Dec 2020 (reported by a secondary source) | Issuance of **electronic money licences restricted to licensed mobile network operators** | recorded, not read in primary form | secondary | Decisive for product scope: BEYU must not structure anything as an e-money *issuance*. Owner: Legal. **`LEGAL_REVIEW_REQUIRED`** |
| Personal Data Protection Act 2022 (in force 1 May 2023) | Registration of **every** controller and processor with the Personal Data Protection Commission; DPO appointment; breach notification; **sensitive data** (which the reported definitions include "financial transactions of the individual") generally needs prior written consent; **cross-border transfers need adequacy/appropriate safeguards and a prior Commission permit** (Reg. 20 application contents); penalties reported up to TZS 100m administrative and TZS 5bn criminal for corporations; enforcement of registration reported as beginning **9 April 2026** | **NOT_SATISFIED — and this programme makes the exposure larger, not smaller** | measured: `payment_transactions` stores `counterparty_name`, `counterparty_ref`, `counterparty_digest`, `party_id`, `customer_user_id`, `invoice_reference`, `description` and `provider_metadata`; provider messages carrying MSISDNs are parsed and projected into those columns. The inbox stores **only a SHA-256 digest**, never the payload, which is the one design decision here that already reduces personal-data exposure | Owner: Legal + a DPO (none named in this repo). Next: PDPC registration, a named DPO, the consent basis for payer fields, a written minimisation decision for `counterparty_name` / `description` / `provider_metadata` (free-text columns are where personal data escapes a schema), and a residency decision that reconciles Licensing Reg. 42 with the transfer permit. **`LEGAL_REVIEW_REQUIRED`** on every item, including whether payment transaction records are "sensitive data" as defined |
| NPS Act 2015 s.6(1) (reported) | Prohibition on operating without licence; providers report needing **three** licences together (payment system, payment instrument, electronic money) | recorded | secondary | Legal to confirm which are actually required for a **non-issuing aggregation/gateway** posture. **`LEGAL_REVIEW_REQUIRED`** |

## 3. What the research rules out (stated so nobody re-litigates it)

1. **BEYU cannot be an electronic money issuer** on the reported restriction of e-money
   licences to licensed MNOs. Any design that holds customer float in a BEYU-controlled
   wallet is therefore out, independent of engineering effort.
2. **A partner integration is not a private matter between two companies**: a reported BoT
   notice prohibits payment system providers from engaging or partnering with other entities
   *before* BoT approval. So "we signed Airtel first and applied later" is not an available
   sequence, and the programme's `REAL_PROVIDER_E2E = BLOCKED_NOT_ATTEMPTED` is the correct
   posture rather than a delay.
3. **Data residency is a licensing condition (r.42), not a preference**, and it collides with
   the PDPA permit regime for anything sent abroad — including a cloud DR replica.
4. **A ten-year records obligation (r.41) is not satisfied by a database that also offers a
   cascade delete tool and has no retention field at all.** Both facts are true of this repo
   today, which is why F-P2-12 is recorded as a defect with an owner rather than as a policy
   document.
5. **Machine evidence is submission input, not a licence.** The DR drill, the audit trail and
   the perf probe are exactly the artifacts reg. 5(c)/6(m) asks an applicant to describe — and
   an applicant still has to be a Tanzanian body corporate with capital and a TCRA licence.

## 4. Concrete engineering actions this research generated (none taken here)

| # | Action | Why the research demands it | Priority as filed |
|---|---|---|---|
| R1 | Add a retention column with an enforced **ten-year floor** on `payment_transactions` (and decide whether `payment_webhook_events` needs one, given it keeps no payload), and make it impossible for the fixture-reset/purge tooling to run outside a sandbox guard | r.41 | new **P2**, propose **P1 before any production tenant** |
| R2 | Add a **deployment residency assertion** (primary data centre in Tanzania) to the self-test, failing loudly when `DATABASE_URL`/replica URLs point abroad without a recorded permit | r.42 + PDPA §§31–32 | new **P2** |
| R3 | Build the **supervisory return extract** as a read-only projection over `payment_transactions`/`journal_entries`, with its own access scope | r.40(1)(b), r.31(2)(d) | new **P2**, dependency of the licensing workstream |
| R4 | Record a **data-minimisation decision for the free-text columns** (`counterparty_name`, `description`, `provider_metadata`) — what may be stored, from which provider field, for whom, for how long | PDPA sensitive-data treatment; the digest-only inbox already limits payload retention | new **P2** |
| R5 | Keep an **AML/CFT signal bridge** as a separate workstream with Compliance named as owner; do not let the existing tables be read as AML capability | r.45, r.6(l) | already F-P3-10 ("tables exist, nothing reads them") — **re-scope upward to P2 with Compliance owner** |

## 5. Open conflicts, recorded rather than resolved

- Secondary sources disagree on **minimum capital**: one summary reports TZS 2 billion paid-up
  for mobile money/e-money providers, another gives TZS 500m "indicative" for a full EMI and a
  case-by-case figure for a PSP that holds no float. Neither matches a number in this repo, and
  the difference is material to a fundraising plan. **`LEGAL_REVIEW_REQUIRED`.**
- One secondary source cites "**Payment Systems Licensing and Approval Regulations, 2021**"
  while the PDF served by BoT in this session is the **2015** instrument. Whether 2015 has been
  superseded or supplemented was **not determined** here; a practitioner must check, because a
  mapping built on the wrong version of a regulation is worse than no mapping.
  **`LEGAL_REVIEW_REQUIRED`.**
- Whether a **non-issuing aggregator/gateway** needs all three licences or one, and whether
  connecting to an already-licensed **aggregator** (Selcom-class) shifts any obligation, is
  unresolved. This is the single most consequential open question for product shape.

## 6. What this document must not be used to say

Not "compliant". Not "ready to apply". Not "licensed". Not "the software satisfies the Bank".
It may be used to say: the primary regulation text has been read; these are the clauses that
touch this system; these are the engineering consequences; and these are the questions a
Tanzanian practitioner must answer first.
