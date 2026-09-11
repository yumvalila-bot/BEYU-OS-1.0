# BEYU OS — Family Office · Protection & Insurance (life insurance)

**Status:** implemented (additive, backward-compatible). Migration `0038_family_office_protection_insurance`.
**Statement that governs everything below:** *Insurance is a BEYU OS Family Office capability, not a separate OS.*
There is no Insurance OS. The whole of this domain lives inside `BEYU OS → Family Office → Protection & Insurance`
and consumes the existing shared infrastructure; it replaces nothing.

---

## 1. Family Office architecture placement

```
BEYU OS (Constitutional Control Plane + Enterprise Operating Kernel + Governed Intelligence Layer)
├── Identity · Organization · Governance · Compliance · Risk · Audit · Documents
├── Workflow · Notifications · Events · Security
├── HCM · Finance · Legal & Liability
├── Family Office                                  ← people.ts · family-office.ts · family-office-capital.ts
│   ├── Family            (members · relationships · vaults)         [people.ts — untouched]
│   ├── Wealth            (capital · investments · real estate)      [family-office-capital.ts — untouched]
│   ├── Protection & Insurance                                        [family-office-protection.ts — THIS]
│   ├── Succession        (generational plans; policies link, never mutate)
│   ├── Liquidity         (capital cash-flow + this domain's contingent/received split)
│   └── Governance/Review (ratification mechanism unchanged)
└── Noelia / HIVE
```

## 2. Domain model (reused vs new)

**Reused, unmodified:** `tenants`, `legal_entities` (isolation spine); `parties`/`users` (identity);
`family_members` and `beneficiaries` (Family registry & TRUST beneficiary register — see §5);
`family_generational_plans` (succession links point at it, nothing writes to it from here);
`documents` (evidence references); `audit_log` + `enterprise_events` (tamper-evident ledgers);
`risks` (Risk remains canonical); `employees` (HCM remains canonical — group life stores a ref, never a copy);
Finance OS (`capital_requests`/journal/periods — untouched; CAP_POSTING not referenced by any file in this domain).

**New tables (migration 0038, all RLS-enabled, all `tenant_id`-scoped, money as `numeric(18,2)`):**

| Table | Purpose |
|---|---|
| `family_insurance_policies` | The contract record: number/type, the five roles, coverage & death benefit (contingent), optional cash/surrender value, premium posture, review dates, assignment posture, links (succession plan, liquidity objective, risk ref, HCM ref), documents, review-state columns, provenance, epistemic class, `authoritative_owner='FINANCE_OS'`. |
| `family_insurance_beneficiary_designations` | Insurance-contract designations — §5 below. |
| `family_insurance_premiums` | Per-period premium obligations: due date, amount, currency, frequency, status; PAID requires paidDate + evidence ref; optional `finance_record_ref`. |
| `family_insurance_assignments` | Collateral/absolute assignments; the policy's assignment posture is a projection maintained in the same transaction. |
| `family_insurance_policy_loans` | Recorded loans against cash-value contracts. |
| `family_insurance_reviews` | Human review records (kind, outcome, exceptions, evidence, next-review date, optional governed stage move). |
| `family_insurance_claims` | Claim ledger: lifecycle status + monotonic proceeds state + insurer-reported amounts with evidence refs. |
| `family_insurance_claim_events` | Append-only per-claim event log (`OPENED`, `INSURER_DECISION`, `PROCEEDS_NOTED`, …). No update path exists. |
| `family_protection_assessments` | Deterministic protection-gap runs: the six labeled components in, the full explained result out, methodology versioned, disclaimer stored on the row. |

## 3. Authorization model

* Every API route runs through the existing `guarded()` chain: session → RBAC/ABAC (`can()`) → rate limit
  → idempotency (mutations) → error envelope → audit. Deep links re-check; **URLs never authorize**.
* New permissions (`src/lib/constants.ts`): `familyoffice:protection.read`, `familyoffice:protection.manage`,
  `familyoffice:beneficiary.manage` (HIGH_RISK → MFA step-up, same footing as `family:beneficiary.manage`),
  `familyoffice:claim.read`, `familyoffice:claim.manage`.
* Role grants are explicit (no `Object.keys(PERMISSIONS)` inheritance): Principal & Director hold the domain;
  Analyst/Risk/Treasury/Legal/Tax reviewers hold read-only subsets; `INVESTMENT_COMMITTEE_MEMBER`/
  `INVESTMENT_OFFICER` hold `protection.read`; **GROUP_CEO holds nothing** and the HTTP suite proves the 403
  on every route. Roles resolve at runtime from the constants catalogue; `role_permissions` stays the
  parity-checked mirror rebuilt by `npm run seed`.
* RLS is the final boundary: every 0038 table gets
  `USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (…)` (same function, same verification block as
  0036/0037); the migration FAILS if any table's policy is missing. Out-of-scope ids read as 404 (no existence
  oracle). Reads go through `tenantScopeIds(principal)`; entity/country columns carry the cross-entity
  posture; `legalEntityId` links are validated against the caller's resolved entity scope.
* Noelia/HIVE: two read-only tools (`family.protection.policies`, `family.protection.review-package`) bound to
  `familyoffice:protection.read`, `sideEffects: NONE`; the family Noelia context endpoint adds topic `PROTECTION`
  behind an in-handler `can()` check. **No tool is (or can be) bound to any protection write permission** —
  asserted mechanically in `tests/family/office/protection-insurance/noelia-boundary.test.ts`.

## 4. Data flow

```
insurer documents/statements (human-cited evidence refs)
   → guarded API (zod strict; integer minor units; server-derived tenant/status/provenance)
   → engine validation (src/lib/family/office/protection-insurance/*)  ← refuse before write
   → row insert/update + audit_log append + enterprise_events publish  ← ONE transaction
   → reads re-derive flags/allocations/overdue state at asOf (nothing auto-mutates)
   → dashboard/UI and Noelia consume the same scoped read functions a human uses
Finance OS ← pointers only (finance_record_ref). No postings, no shadow ledger.
```

## 5. The three beneficiary registers stay distinct (§6 of the mandate)

| Register | Legal relationship | Owned by |
|---|---|---|
| `beneficiaries` (people.ts) | TRUST entitlement under ratified family policy | Trust instrument + governance |
| `family_insurance_beneficiary_designations` | Designation under an insurer contract | The policy owner, per contract |
| policy **owner** / **insured** / **payer** / **assignee** | Ownership & obligation roles of the contract | Recorded fields, never derived |

The same `parties`/person may appear in several registers; that is identity coincidence, not shared
entitlement. No route, trigger, migration or job converts between them. Insurance beneficiary activation is
blocked ONLY on impossible resulting states (over-100%, double residuary, mixed bases); incomplete allocation
(60%) records and flags — §14: the system flags, humans amend.

## 6. Policy lifecycle (contract status) and the review lifecycle (§15 governance stage)

Two independent machines; both are transition-validated, evidence-gated, recorded-only:

* status: `DRAFT → PENDING_UNDERWRITING → IN_FORCE → {LAPSED | SURRENDERED | MATURED | TERMINATED}`
  (`LAPSED → IN_FORCE` requires insurer reinstatement evidence; terminal states never reopen).
* stage: `DRAFT → ASSESSED → REVIEW_REQUIRED → LEGAL_REVIEW → TAX_REVIEW → FINANCE_REVIEW →
  GOVERNANCE_APPROVAL → ACTIVE → REVIEW_DUE → {RENEWED | AMENDED}`; `TERMINATED` reachable from any
  pre-terminal stage with an authority reference. The only chain shortcut is
  `ASSESSED|REVIEW_REQUIRED → GOVERNANCE_APPROVAL` and requires BOTH a recorded `isHighValue=false` AND a
  `thresholdSourceRef` citing the ratified policy that decided it — the engine holds no thresholds of its own,
  so the low-risk fast path is a proven human decision, never a default. AI actors are refused at every stage.
* Nothing ever advances either machine by itself: no scheduler, no job, no trigger.

## 7. Claims lifecycle (§16)

`CLAIM_OPENED → DOCUMENTATION_PENDING → UNDER_REVIEW → SUBMITTED → INSURER_REVIEW → {APPROVED | DENIED | DISPUTED}`
→ `PROCEEDS_PENDING → PROCEEDS_RECEIVED → ALLOCATED → CLOSED` (DISPUTED may return to INSURER_REVIEW or settle).
Insurer decisions require the decision-document ref and, for APPROVED, the insurer's amount — the engine
refuses to record a decision without its source (no fabricated insurer data). Proceeds move on their own
monotonic machine: `NONE → EXPECTED → CLAIMED → APPROVED → RECEIVED → ALLOCATED`. Every step appends a row to
`family_insurance_claim_events` in the same transaction.

## 8. Protection-gap methodology (§11)

`gap = (economic/family exposure + succession liquidity need + debt/obligation exposure + business dependency)
     − (qualifying resources + qualifying in-force protection)`, all components integer minor units within ONE
currency (mixed-currency inputs are refused — no FX authority), each with a provenance class
(`VERIFIED | USER_PROVIDED | MODELLED | ESTIMATED | UNVERIFIED`; VERIFIED/MODELLED require a source ref).
Missing inputs are never zero-filled: the result carries `bound ∈ {EXACT, UPPER_BOUND, LOWER_BOUND, NOT_QUANTIFIED}`,
a line-by-line explanation, and the `missingInputs` list. Coverage bps only exist for EXACT results.
The stored row keeps inputs + result + methodology version + the disclaimer **as data**. This is modeled
planning information — not legal, tax, actuarial or financial advice, not a quote, not underwriting.

## 9. Liquidity view (§13) — the bucket rule

`modeled succession liquidity = current liquid + insurance proceeds RECEIVED/ALLOCATED + trust + business − obligations`.
Expected-claim proceeds and in-force death benefits land in a **separate contingent bucket**; cash value is never
cash and surrender value is reported with its trade-off note. `proceedsCountAsCash()` is the single predicate;
unit tests pin that EXPECTED never crosses into the total.

## 10. Finance integration rules (§10, §22, §32)

* No journal, period, balance, reconciliation or posting object exists in this domain.
* Premiums/claims/loans rows are obligations & facts with `authoritative_owner='FINANCE_OS'`,
  `finance_record_ref` pointers, and `epistemic_class` on every amount.
* `CAP_POSTING` stays LOCKED and fail-closed exactly as before. This module never imports, calls or references
  the posting engine — pinned by `noelia-boundary.test.ts` and `service-db.test.ts` source assertions. If a
  premium or receipt must become accounting truth, it flows through Finance OS's existing controlled pathway.

## 11. Legal & tax posture (§23) — records, not conclusions

`legal_review_status` / `tax_review_status` / `jurisdiction_ref` record review POSTURE
(`NOT_STARTED | REQUIRED | IN_PROGRESS | COMPLETED | NOT_APPLICABLE_RECORDED`) and cite professional work.
The system never states that premiums are deductible, proceeds are tax-free, or anything else about outcomes —
treatment varies by jurisdiction, structure, policy type and law; professional advice arrives as a cited record
or it does not exist here.

## 12. Noelia / HIVE boundaries (§27)

May: summarize policies, explain coverage, flag review dates, prepare review packages, report gaps,
summarize claims, prepare management reports — through the two registered read-only tools.
May not: purchase, bind, cancel, amend coverage, change beneficiaries, approve claims, authorize transfers,
bypass RBAC/ABAC/RLS/audit, or self-authorize. No consequential action has a tool path; HIVE workflow
orchestration runs the same permission-gated tools and their same audit appends.

## 13. HCM / corporate integration (§20, §21)

* Group life records `hcm_employee_ref` — a pointer. Eligibility DERIVES from HCM; employment termination
  never auto-cancels a coverage record. A status change reaching this domain arrives as an event a human turns
  into a `REVIEW_REQUIRED` transition with an authority reference — the contract, not this ledger, ends coverage.
* KEY_PERSON / SHAREHOLDER_BUY_SELL / EXECUTIVE_CONTINUITY policies must link their owning `legal_entity_id`;
  the family view is flagged `corporate-viewed` and `isCorporateViewedPolicy()` exists precisely so UIs and
  totals never absorb corporate protection into family wealth.

## 14. API surface (§28)

`/api/v1/family-office/protection/…` — `policies` (GET/POST), `policies/:id` (GET/PATCH — governed field patch;
status & stage are not patchable), `policies/:id/status` (POST), `policies/:id/governance` (POST),
`policies/:id/beneficiaries` (GET/POST — POST permission `beneficiary.manage`, MFA), `policies/:id/premiums`
(GET/POST), `policies/:id/reviews` (GET/POST), `policies/:id/assignments` (GET/POST, `kind:"LOAN"` discriminator),
`claims` (GET/POST), `claims/:id` (GET log / POST transition), `assessments` (GET/POST — the RESULT is
engine-computed; client-supplied results are 422), `dashboard` (GET), `family-view` (GET). All idempotent
mutations honor `Idempotency-Key` via the shared durable ledger; all money is integer minor units; all
`SERVER_CONTROLLED` fields are refused at the boundary.

## 15. Testing evidence

See `FINAL_REPORT §6` of the implementing session and, in-repo:
`tests/family/office/protection-insurance/{engine,service-db,http,noelia-boundary}.test.ts` —
60 pure engine cases, 12 real-database governed-write cases (audit + event assertions), 31 transport cases,
4 AI-boundary cases; all run twice consecutively with identical results; full repository regression unchanged
(see the session's final report).

## 16. Explicit non-goals (§36, §37)

No insurer/broker integrations, no marketplace, no payment gateway, no underwriting, no actuarial engine,
no automatic claims adjudication, no automatic policy modification, no scheduler that mutates records, no new OS.
