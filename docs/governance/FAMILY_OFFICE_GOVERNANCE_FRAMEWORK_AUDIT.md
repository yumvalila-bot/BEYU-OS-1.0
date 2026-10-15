# BEYU Family Office Governance Framework — Phase 4A/4B Audit, Gap Matrix and Plan

Document ID: `BEYU-FO-AUD-01`
Title: Family Office Governance Framework — current-state audit, 12-domain gap matrix, architecture and implementation plan
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Related documents: `BEYU-SCG-16`, `BEYU-SCG-18`, `PHASE_8_GOVERNANCE_CONTROL_PLANE.md`, `BEYU-LF-D31`, `BEYU-LF-D32`, `BEYU-LF-D34`, `BEYU-LF-D35`, `BEYU-LF-D76`
Depends on: the Phase 4 audit commit; nothing else

> **CONTROL BLOCK.**
> **This is** a current-state audit, a 12-domain gap matrix, an architecture plan, a responsibility
> matrix and a blocker register — every status backed by a file, table or command that was actually run.
> **This is not** an implementation, an approval, an authorization, a legal opinion, a compliance
> statement, or the adoption of any policy named in it. **Nothing was implemented.** Per the Phase 4
> instruction, the audit and a safe non-destructive plan are reported first and the work stops for review.
> **Family Office membership, UI visibility, database rows, seed data and status flags grant no legal or
> financial authority.** `CAP_POSTING` remains `LOCKED`, `A7` remains prohibited, `grants_authority`
> remains `false`, and every execution path remains simulated/disabled.

---

## 1. Verified current state (Phase 4A)

### 1.1 Repository, PR and worktree

| Item | Observed |
|---|---|
| Working branch | `arena/8fbc8030-beyu-os-1-0` (this session's branch — the only branch worked on) |
| `main` | `05e2fba` |
| HEAD | `27ce281` — **14 commits over `main`** |
| Working tree | clean |
| PR #108 | **OPEN, not draft, not merged** — 155 files, +32,267 / −14 at `27ce281`; CI run `38798739595` **SUCCESS**, 8/8 jobs |
| Other open PRs | **25** (e.g. #107 NOELIA Ollama adapter, #103 canonical-hosts, #68 Ujenzi/Agriculture reconciliation, #61 Ujenzi OS). **None was closed, modified or merged** |
| Branches | `main` and this session's branch locally; `origin/main` + `origin/arena/8fbc8030-beyu-os-1-0` |
| Production/deployment | **no deployment, no production migration, no live transaction** performed |

**Provenance note (audit hygiene).** This sandbox again arrived at `main` (`05e2fba`) with branch content
present as uncommitted local modifications. Before trusting or discarding anything, all **155**
branch-only paths were byte-compared against `origin/arena/8fbc8030-beyu-os-1-0`: **155 identical, 0
differing, 0 missing** — only then was the local branch restored. The Phase 3 work (BLK-08 fix, SCG-16
reconciliation, SCG-18) is intact and is not weakened here.

### 1.2 Database and migration state (isolated, disposable)

| Item | Observed |
|---|---|
| Environment | PostgreSQL 16.14, cluster at gitignored `pgdata/`, `:5432` — **isolated and disposable**; nothing shared or production |
| Migrations | **76** `.sql` files; `npx tsx scripts/migrate.ts` → **exit 0**, `fingerprintAfter eebc66981c8f176dbd8ef9ba0a43a58b` |
| Roles | `beyu_runtime` (non-superuser, **`NOBYPASSRLS`**), `beyu_governance` (**`NOBYPASSRLS`**, 11 tables), `beyu_health_runtime` |
| Tables | **464** public tables live (**466** Drizzle `pgTable` declarations — see §8 `FO-BLK-02`) |
| RLS coverage | **387 have RLS, 77 do not** |

### 1.3 The Family Office capability that already exists

This is a **shared capability**, not a sector OS — and it is already large. The audit found:

* **`src/lib/family/` — 60 modules.** Nine pure engines (alignment, capital, constitution, decision-gate,
  eligibility, institution, lineage, loan, policy-decisions) and `src/lib/family/office/` (26 modules,
  ~7,600 lines) including `trust-governance-service.ts` (1,366 lines), capital-wealth (13 files),
  protection-insurance (10 files), and `src/lib/family/phase3/` (authority slots, fail-closed gate,
  contracts, errors, events).
* **`src/app/os/family/` — 6 pages** (dashboard, families, family detail, capital, protection, policy
  detail) and **`src/app/api/v1/family-office/` — 31 route files**.
* **`src/lib/contracts/`** (10 modules), **`src/lib/governance/`** (25 modules), **`src/lib/authority/`**,
  **`src/lib/execution/simulate.ts`**, **`src/lib/decision-authority.ts`**.
* **347 test files**, of which **37** are `tests/family/**`, **41** `tests/governance/**`, **45**
  `tests/security/**`.

**The decisive finding is positive.** The existing engines already implement the invariants Phase 4 asks
for, and they do it by design rather than by accident:

* `office/delegation.ts`: "Delegation is a **REFERENCE** mechanism… a delegation record alone proves
  nothing; the authority framework verifies the full chain (delegator's own authority, period,
  revocation, scope containment)." Delegation **limits** are unresolved → `POLICY_DECISION_REQUIRED`.
  This is Domain 7's requirement, already implemented.
* `office/policy.ts`: "policy VALUES exist only inside a **RATIFIED** policy version; a key with no ACTIVE
  ratified version resolves to `POLICY_DECISION_REQUIRED` — UNRESOLVED never behaves like a default."
  This is Domain 11's requirement, already implemented.
* `decision-gate.ts`: four invariants — no material decision without auditability; **an AI actor stops at
  `CHECK_RISK`** and "may never APPROVE or EXECUTE"; materiality is **never defaulted**; **the chain
  halts** (a step after a failure is `NOT_REACHED`, never `PASSED`). This is the NOELIA boundary and the
  fail-closed requirement, already implemented.
* `family/phase3/authorization-slots.ts`: separation-of-duties rule pairs (proposer ≠ verifier,
  verifier ≠ decider, requester ≠ approver, delegator ≠ delegate, **AI in no slot**) as structural
  invariants, with *which role fills which slot* explicitly `POLICY DECISION REQUIRED (FIR-023)`.
* `execution/simulate.ts`: classifies every output `SIMULATION`, sets `mutatedProductionState: false`
  structurally, never imports `db`, and "never returns the words RATIFIED, APPROVED, or EFFECTIVE as a
  result status."
* All **31/31** family-office API routes are wrapped in `guarded(...)`, which requires a resolved
  principal (401 otherwise), applies per-principal rate limits and permission checks, and supports
  idempotency.

**Therefore the correct Phase 4 posture is composition, not construction.** Four domains need new
registries; eight need extension of mechanisms that already exist. Any parallel governance engine would
be a defect.

---

## 2. 12-domain gap matrix

Status vocabulary: **IMPLEMENTED** (mechanism exists, tested) · **PARTIAL** (mechanism exists, named
capability missing) · **MISSING** (no mechanism found) · **BLOCKED** (cannot be completed without an
authority the repository does not hold). Every `MISSING` claim was checked against schema, services, UI,
API and tests.

| # | Domain | Status | Existing mechanism (evidence) | Gap |
|---|---|---|---|---|
| 1 | **Software licensing & IP** | **MISSING (registry)** | `INTELLECTUAL_PROPERTY` exists as a capital **asset class** (`family-office-capital-service.ts` route enum); `agriculture_licenses` covers farm permits only; IP appears only as legal-foundation documents | No registry for software, IP, licences, permitted scope, obligations, renewal or assignment. **Ownership vs permission-to-use is not modelled at all** |
| 2 | **Arm's-length commercial contracts** | **PARTIAL** | `contracts.ts` (11 tables: `contract_records`, `contract_parties`, `contract_authority_checks`, `contract_obligations`, `contract_signatures`, `contract_disputes`, `legal_document_lifecycle`…), `src/lib/contracts/` (10 modules), `contract_records` RLS=YES, `tests/contracts/service.test.ts` | No **related-party disclosure** registry; no market-comparison/fairness evidence record. Related-party interest appears only incidentally (`decision-gate` CHECK_CONFLICT, `family/loan.ts`) |
| 3 | **Structural walls & liability isolation** | **PARTIAL** | `legal_entities`, `ownership_records` (RLS=YES), `tenants`, `org_units`, `os_registry`, `source_of_truth`; entity scope in `authz.ts`; `tests/security/entity-isolation.test.ts`, `foundation-api-target-scope.test.ts` | `entity_appointments` has **no RLS**; core identity tables have no RLS (§3). Intercompany services/loans/guarantees are not a unified registry. **Software must never be claimed to create legal liability protection** |
| 4 | **Investment approvals** | **PARTIAL (strong)** | `family_investments`, `family_investment_theses`, `family_investment_valuations`, `family_committee_decisions`, `family_post_investment_reviews` (**all RLS=YES**); `capital-allocation.ts`, `investment.ts`, `noelia-intelligence.ts`; 12 API routes | Thresholds are **unconfigured** (correctly fail-closed); proposal/approval/execution/custody/reconciliation are **not** separated as distinct governed stages; mandate/restricted-fund provenance is not a first-class record |
| 5 | **Distribution procedures** | **PARTIAL** | `trust_distributions` (RLS=YES) with `paymentStatus: NOT_DUE → PENDING` and `authoritativeOwner: FINANCE_OS`; `trust-governance-service.ts:1128` refuses non-`ELIGIBLE` beneficiaries; `beneficiaries.eligibility` defaults `UNDER_REVIEW`; eligibility "never presumed" (`family/capital.ts`); `computeDistribution` in `capital-wealth`; `CAP_POSTING` LOCKED (`finance/journal/route.ts:96,126`) | `beneficiaries` and `family_vault_items` have **no RLS** (§3). **Minor/protected-beneficiary safeguards are not modelled** — no DOB, age, guardian (SCG-16 `BLK-06`/`BLK-07`) → **BLOCKED** |
| 6 | **Voting & decision rules** | **IMPLEMENTED** | `governance_meetings`, `_agenda_items`, `_attendance`, `_conflicts`, `_motions`, `_actions`; `governance-vote-service.ts` (quorum `{eligible, recused, required, participated, met}`, `majorityRule`, recusal, and "an ended/suspended seat is not authority"); `resolutions`, `resolution_votes` (RLS=YES); `reserved-matters.ts`; `governance-voting.ts`; 41 governance + 45 security tests | Distinguishing **advisory family consultation** from **binding corporate/statutory** decisions is not a first-class type. Unknown authority/quorum/threshold already → blocked |
| 7 | **Delegation of authority** | **PARTIAL** | `office/delegation.ts` (reference-not-authority; scope containment; revocation; limits unresolved → `POLICY_DECISION_REQUIRED`), `governance/delegation.ts`, `identity.delegations`, `admin_authority_delegations`, `authority/engines.ts`, `tests/family/office/authority-delegation.test.ts` | **`delegations` and `admin_authority_delegations` both have NO RLS with 0 policies** (§3). No acceptance step. Sub-delegation rules not modelled |
| 8 | **Conflict of interest** | **PARTIAL** | `governance_meeting_conflicts` (meeting-level, RLS=YES), `foundation_conflicts`, `decision-gate` `CHECK_CONFLICT` step, `trust-governance-service` §16 recusal + conflicted-party bar (`tests/family/office/trust-governance.test.ts`), `contract_authority_checks` | No general **declaration registry** covering actual/potential/perceived conflicts with disclosure date, mitigation and resolution evidence. Cross-surface enforcement (exports/jobs) not demonstrated |
| 9 | **Succession & continuity** | **PARTIAL** | `family_generational_plans` (RLS=YES), `equity.founder_profiles.succession_document_ref`, protection-insurance `SUCCESSION_LIQUIDITY` + `succession_plan_id` links, `assurance.continuity_plans` | No succession-plan registry with review status/activation conditions; **`continuity_plans` has NO RLS**; no activation model; **no transfer-of-authority guard** because minors/incapacity are unmodelled → **BLOCKED** (`BLK-06`) |
| 10 | **Accountability & assurance** | **PARTIAL (strong)** | `risks` (RLS=YES), `controls`, `compliance_obligations`, `compliance_assessments`, `legal_matters`, `anomaly_signals`, `continuity_plans`; `audit_log` (**RLS=YES, FORCE RLS**) + `audit_chain_heads` (hash chain, `src/lib/audit.ts`); `documents` (RLS+FORCE); `retention_policies`; `idempotency_records` | `controls` and `continuity_plans` have **NO RLS**; append-only/tamper-evidence claims must be stated only as demonstrated |
| 11 | **Policy adoption & amendment** | **PARTIAL + migration defect** | `office/policy.ts` engine (keys, versions, states, RATIFIED-only values), `ratification.ts`, `governance.policies`, `family_policy_*` in Drizzle schema | **`family_policy_definitions`, `family_policy_versions`, `family_policy_ratifications` are declared in `src/db/schema/family-office.ts` and present in `drizzle/meta/0074_snapshot.json` & `0075_snapshot.json`, but NO migration `.sql` ever creates them — they do not exist in the migrated database.** See §8 `FO-BLK-01`. `policies` has no RLS |
| 12 | **Responsibility assignment (RACI)** | **MISSING** | Adjacent only: `governance/competency-*`, `governance_appointments`, `entity_appointments`, `positions` | **No RACI model.** `grep -riE '\braci\b' src/lib/` returns **0** hits. Roles remain unassigned by design (`FIR-023`) |

### 2.1 Dashboard / UX readiness

The existing `src/app/os/family/page.tsx` (298 lines) is **permission-gated** (`canVault`,
`canBeneficiary`, `canGovernance`) and **classification-filtered** (`allowedClassifications`), and already
surfaces members, beneficiaries, vault, governance bodies, resolutions and entities. **PARTIAL** for the
12-domain requirement: registers, pending-review queue, conflict declarations, delegations, succession
plans and a responsibility matrix are absent; the domain-status vocabulary (`DRAFT`, `SYNTHETIC_TEST_ONLY`,
`PENDING_AUTHORITY`, `BLOCKED`, `EXPIRED`, `REVOKED`, `SUPERSEDED`…) is not yet used as a visible contract.
Extension should reuse this page's existing gate pattern, not a new dashboard.

---

## 3. Security finding — RLS is absent on the oldest identity and family tables

**This is the most consequential finding of the audit. It is a defence-in-depth gap, not a demonstrated
exploit** — every family-office API route is wrapped in `guarded(...)` and the services apply tenant
scoping — but the database is not the backstop it is everywhere else.

Measured authoritatively against the migrated database (`pg_class.relrowsecurity`):

| Table | RLS | Policies | Why it matters |
|---|---|---|---|
| `family_members` | **NO** | 0 | Family membership |
| `beneficiaries` | **NO** | 0 | Beneficiary entitlement |
| `family_vault_items` | **NO** | 0 | Vault holdings |
| `delegations` | **NO** | 0 | Delegated authority |
| `policies` | **NO** | 0 | Policy records |
| `consents` | **NO** | 0 | Consent records |
| `role_assignments` | **NO** | 0 | Role assignments |
| `parties` | **NO** | 0 | Identity records |
| `users` | **NO** | 0 | Identity records |
| `entity_appointments` | **NO** | 0 | Appointment records |
| `governance_decision_registry` | **NO** | 0 | Decision registry |
| `controls`, `continuity_plans` | **NO** | 0 | Assurance |

`beyu_runtime` — the application role, `rolsuper=false`, `rolbypassrls=false` — nonetheless holds
**`DELETE`** on `beneficiaries`, `consents`, `family_members`, `family_vault_items`, `parties` and
`users`, and holds grants on all of the tables above. With RLS disabled and no policy, **RLS provides
zero protection on these tables**; isolation depends entirely on application-layer tenant filtering.

**Consistency of the diagnosis:** 387 of 464 tables **do** have RLS, and the newer family tables
(`family_investments`, `family_generational_plans`, `family_insurance_policies`, `family_committee_decisions`,
`trust_*`, `contract_*`, `resolutions`, `audit_log` with FORCE) are properly covered. The uncovered set is
the **kernel-era identity/people tables** — the oldest migrations, predating the RLS convention. That is
a bounded, explainable gap, which is why the remediation below is small and additive.

### 3.1 This is a documented scope boundary, not a hidden bug — and that is the finding

The audit is careful here, because the repository is not unaware of the gap. An **existing coverage guard
already exists and works**: `tests/security/family-office-rls-isolation.test.ts` asserts that every
`family\_%` table has RLS enabled *and* a `%tenant_isolation` policy, and it passes. It **deliberately
excludes two tables by exact name**, with this justification recorded in the test itself:

> "`family_members` and `family_vault_items` are excluded by exact name — they come from the 0000 kernel
> baseline and are governed by their own (pre-existing) controls, not by this migration."

So the two kernel-era tables are a **known, reasoned exclusion**, not an oversight. What the audit adds is
the measurement of what that scope leaves unexamined:

* The guard's `family\_%` filter means it **cannot** assert anything about `beneficiaries`, `delegations`,
  `policies`, `consents`, `role_assignments`, `parties`, `users`, `entity_appointments`,
  `governance_decision_registry`, `controls` or `continuity_plans` — none of which carry the `family_`
  prefix. Those tables are **not excluded; they are simply outside the guard's scope**.
* Verified: `beneficiaries`, `delegations` and `governance_decision_registry` appear in **0** of the 15
  test files that reference `relrowsecurity`.
* The stated justification for the two exclusions — "governed by their own (pre-existing) controls" — is
  the assertion this audit could not confirm at the database layer, where those two tables have **no RLS
  and no policy at all**.

The recommended remediation remains small and additive, and is now more precisely stated: **either enable
RLS on the uncovered tables, or record an explicit, reasoned exclusion for each — as was done for the two
kernel tables.** A deliberate exclusion with a stated control is defensible; a table that is merely
outside every guard's scope is not.

**Not yet proven:** whether any *specific* read/write path leaks across tenants. The passing
`family-office-rls-isolation`, `entity-isolation` and `appointment-rls` suites demonstrate that
**application-layer** tenant scoping works for the paths they exercise (services reference `tenantId` in
21 of 26 office modules). **A targeted cross-tenant probe of the uncovered tables is required before any
claim either way** (§6 `FO-BLK-03`), and no such claim is made here.

---

## 4. Architecture and data flow (proposed — using existing boundaries)

```
Constitutional Control Plane            Enterprise Operating Kernel           Governed Intelligence
  constitution_articles                   tenants / legal_entities              NOELIA (analysis, drafts,
  governance_bodies / _members            ownership_records / appointments      summaries, flags only)
  policies / resolutions / votes          entities-scoped services              → stops at CHECK_RISK
  governance_decision_registry            RLS + tenant/entity filters           (decision-gate invariant 2)
        │                                        │                                      │
        └────────────── AUTHORITY ───────────────┴────────────── EVIDENCE ──────────────┘
                     decision-authority.ts                 documents / audit_log
                     (provenance = GOVERNED)               (hash chain)
                     authority/engines.ts
                     family/decision-gate.ts
```

**Authority flow (unchanged, and the whole point):** an act is reachable only through
`evaluateAuthority → can() → checkCanonicalWriter → checkSegregationOfDuties →
evaluateWorkflowTransition`, with `decision-authority.ts` requiring `provenance = GOVERNED` and an
`APPROVED` resolution. Seeded, synthetic or unverified rows never authorise. Unknown authority resolves to
`POLICY_DECISION_REQUIRED` or a denial — never a default.

**Where Phase 4 features would attach (composition, not new engines):**

| New registry | Reuses | Does **not** create |
|---|---|---|
| IP/licence register (D1) | `documents` (evidence), `legal_entities` (owner), `contract_records` (licence terms), `workflow` + `resolutions` (approval), `audit_log` | Ownership. **Registry entries establish nothing legally** |
| Related-party disclosure (D2) | `contract_parties`, `decision-gate` CHECK_CONFLICT, `governance_meeting_conflicts`, `trust_governance §16` | Fairness, prices or legal opinions |
| COI declaration registry (D8) | conflicts above + `governance_meeting_conflicts` | Conflict "resolution" without evidence |
| Succession plan register (D9) | `family_generational_plans`, `continuity_plans`, `documents`, `appointments` | **Any transfer of trusteeship, signing, custody or payment authority** |
| RACI model (D12) | `positions`, `entity_appointments`, `governance_members`, `PERMISSIONS` | Legal powers. RACI is operational guidance only |
| Intercompany register (D3) | `legal_entities`, `ownership_records`, `contract_records`, `journal_lines` (reference only) | Legal liability protection |

Every one of these is **additive**, entity-scoped, RLS-enabled from the first migration, and fail-closed by
construction. **No new authentication, no new authorization, no parallel governance engine, no hostname
authorization.**

---

## 5. Proposed specifications (clearly marked PROPOSED — none is adopted)

These are written as specifications **for review**, and each is explicitly **PROPOSED, NOT ADOPTED, NOT
EFFECTIVE**. Adopting any of them requires a legally authorized body acting on recorded authority; the
platform cannot adopt its own policy.

| ID | Proposal | Status | Adoption authority required |
|---|---|---|---|
| `FO-P-01` | IP & Software Licence Registry (ownership ≠ permission to use; missing/expired/unreviewed flagged) | **PROPOSED** | Legal owner + authorized body for material assignments |
| `FO-P-02` | Related-Party Disclosure & Arm's-Length Review procedure (disclosure before deliberation; independent review) | **PROPOSED** | Board + counsel |
| `FO-P-03` | Structural-Walls & Intercompany Agreement policy (separate accounts/books/records/approvals) | **PROPOSED** | Board + counsel + tax adviser |
| `FO-P-04` | Investment Approval & Stage-Separation standard (mandate, restrictions, thresholds **unconfigured until evidenced**) | **PROPOSED** | Board; thresholds only on evidenced mandate |
| `FO-P-05` | Distribution Procedure (source, instrument, eligibility, unrestricted funds, tax/legal review, reconciliation) | **PROPOSED** | Trustees + counsel |
| `FO-P-06` | Decision-Rights & Voting-Rules Charter (binding vs advisory distinction; quorum/threshold from instruments) | **PROPOSED** | Trustees / board / shareholders per matter |
| `FO-P-07` | Delegation of Authority standard (scope, period, revocation, acceptance, no sub-delegation by default) | **PROPOSED** | Board, within its own authority |
| `FO-P-08` | Conflict-of-Interest Declaration & Recusal policy | **PROPOSED** | Board + counsel |
| `FO-P-09` | Succession & Continuity standard (**activation transfers nothing automatically**) | **PROPOSED** | Trustees + board + counsel (Tanzanian succession law) |
| `FO-P-10` | Accountability, Assurance & Audit-Correction standard (superseding entries; no silent alteration) | **PROPOSED** | Board + audit owner |
| `FO-P-11` | Policy Adoption & Amendment lifecycle (DRAFT → … → EFFECTIVE → SUPERSEDED) | **PROPOSED** | The body competent for each policy |
| `FO-P-12` | Responsibility (RACI) Assignment model (**operational guidance; no legal powers**) | **PROPOSED** | Board / delegating authority |
| `FO-P-13` | RLS Coverage & Least-Privilege Remediation (§3) | **PROPOSED — technical** | Engineering under review; no authority transfer |

**No proposal in this table may be described as adopted, effective, or binding.** Where a proposal touches
an operative instrument, it goes through the legal pack's `AM-*` route and counsel — never by editing an
instrument (D02 §1.2 single `[SETTLOR NAME]` slot; `[BENEFICIARY CLASS]` undefined).

---

## 6. Implementation plan (Phase 4C — proposed, not started)

Ordered, minimal and reversible. **Nothing here starts before review.**

| Step | Change | Type | Why it is safe |
|---|---|---|---|
| `FO-IMP-01` | Additive migration enabling **RLS + FORCE RLS + tenant policy** on the §3 tables | Migration (additive) | Closes the defence-in-depth gap; touches no data; **must be proven against the existing suites first**, because a wrong policy can make legitimate reads fail closed |
| `FO-IMP-02` | Additive migration creating `family_policy_*` (§8 `FO-BLK-01`) | Migration (additive) | Schema already declared and snapshotted; SQL was simply never generated. Additive only |
| `FO-IMP-03` | **Cross-tenant probe** for the §3 tables (read + write, API and service) | Test | Converts "unproven" into evidence. Prerequisite for any isolation claim |
| `FO-IMP-04` | IP/licence registry (schema + service + API + UI), `UNVERIFIED`/`PROPOSED` by default | Feature (additive) | Domain 1 is genuinely missing; registry asserts no ownership |
| `FO-IMP-05` | Related-party disclosure + COI declaration records | Feature (additive) | Reuses conflicts/recusal machinery |
| `FO-IMP-06` | RACI model with `UNASSIGNED` default and blocked dependents | Feature (additive) | Domain 12 missing; grants nothing |
| `FO-IMP-07` | Dashboard extension of `src/app/os/family/page.tsx` with the status vocabulary | UI | Reuses existing `can*` gates and classification filter |
| `FO-IMP-08` | Succession plan **register** (review status, activation conditions) — **no activation path** | Feature (additive) | Records plans only; transfers nothing |

### 6.1 Verification performed during this audit (exact commands and results)

No production code was changed, so these runs establish the baseline the plan builds on. Every figure
below was observed in this session; nothing is inferred from a prior run.

| Check | Command | Result |
|---|---|---|
| Migrations (isolated, disposable DB) | `npx tsx scripts/migrate.ts` | **exit 0** — `fingerprintAfter eebc66981c8f176dbd8ef9ba0a43a58b` |
| Runtime role | `npx tsx scripts/setup-db-role.ts` | **exit 0** |
| Governance role | `npm run db:setup-governance-role` | **exit 0** — "reconciled: NOBYPASSRLS, non-owner, finite privileges" |
| Seed | `npx tsx src/db/seed.ts` | **exit 0** — "BEYU OS bootstrap complete. Bootstrap credentials were not printed." |
| **Focused suite** | `npx vitest run tests/family tests/security/family-office-rls-isolation.test.ts tests/security/entity-isolation.test.ts tests/security/synthetic-fixture-integrity.test.ts` | **exit 0** — **40 files passed, 944 tests passed, 0 failed** (16.2 s) |
| SCG gate | `npm run verify:scg` | **exit 0** — 4 checks, 0 blocking, 0 advisory |
| Secret scan | `npm run scan:secrets` | **exit 0** — 2,786 tracked files, no literal credentials |
| RLS enumeration | `pg_class.relrowsecurity` + `pg_policy` via the isolated DB | 464 public tables; **387 with RLS / 77 without**; the 12 tables in §3 with RLS=false and 0 policies |
| Route coverage | `find src/app/api/v1/family-office -name 'route.ts'` + `grep -l 'guarded('` | **31/31** wrapped in `guarded(...)` |

**Not run in this audit, and therefore not claimed:** the full regression suite, `tsc --noEmit`, `npm run
lint`, the production build, the browser specs and the HTTP suites (which require a live server). The
Phase 3 record (`BEYU-SCG-18` §5) carries the last full-suite and typecheck results, including the
reported environment limit that `tsc` **OOM-aborts at the default Node heap** and must be run with a
raised `--max-old-space-size` — an OOM crash is a failure, not a pass.

**A caveat that cuts both ways:** the `-http.test.ts` suites skip without a server. A green focused run
therefore does **not** demonstrate API-level behaviour for the domains marked `IMPLEMENTED`.

**Explicitly NOT planned in this phase:** any execution/custody/payment/DLT capability; any threshold,
mandate or voting value; any beneficiary or identity record; any minor/guardian model; any change to
operative instruments; any production migration.

---

## 7. Responsibility matrix (deliverable 7)

**Owner is `UNASSIGNED` wherever the repository does not evidence an appointment.** An `UNASSIGNED`
owner means dependent workflow is **blocked**, never silently defaulted.

| Domain | Owner (role) | Owner status | Authority dependency | Coverage | Activation |
|---|---|---|---|---|---|
| 1 IP & licensing | Legal owner + IT asset owner | **UNASSIGNED** | Board for material assignment | **MISSING** | **BLOCKED** |
| 2 Arm's-length contracts | Commercial owner | **UNASSIGNED** | Board + counsel | PARTIAL | Blocked on `FO-P-02` |
| 3 Structural walls | Group Finance + Legal | **UNASSIGNED** | Board + counsel + tax | PARTIAL | Blocked |
| 4 Investment approvals | Investment Committee — **body not evidenced as constituted** | **UNASSIGNED** | Board mandate | PARTIAL | **BLOCKED** (`BLK-01`) |
| 5 Distributions | Trustees | **UNASSIGNED** | Trust instrument + counsel | PARTIAL | **BLOCKED** (`BLK-06`/`BLK-07`) |
| 6 Voting & decision rules | Body secretary | **UNASSIGNED** | Constituent instrument | IMPLEMENTED | Blocked on constitution |
| 7 Delegation | Delegating authority | **UNASSIGNED** | Board | PARTIAL | Blocked on `FO-P-07` |
| 8 Conflict of interest | Governance officer | **UNASSIGNED** | Board + counsel | PARTIAL | Blocked on `FO-P-08` |
| 9 Succession & continuity | Trustees + HR owner | **UNASSIGNED** | Counsel (TZ succession law) | PARTIAL | **BLOCKED** |
| 10 Accountability & assurance | Audit/assurance owner | **UNASSIGNED** | Board | PARTIAL | Blocked |
| 11 Policy adoption | Chief Governance Officer | **UNASSIGNED** (`[TO BE APPOINTED]`) | Competent body per policy | PARTIAL + migration defect | **BLOCKED** |
| 12 Responsibility (RACI) | Chief Operating Officer | **UNASSIGNED** | Board | **MISSING** | **BLOCKED** |
| Security/RLS remediation | Engineering under review | Assigned (engineering) | None | §3 gap | Ready for review |

**NOELIA_AI holds no row in this matrix by design** — not trustee, director, signatory, custodian, payment
approver, investment decision-maker or legal authority. It may analyse, draft, summarise, remind, flag
risk and coordinate; the decision gate stops it at `CHECK_RISK`.

---

## 8. Blocker register (deliverable 8)

Namespace **`FO-BLK-*`** is deliberately distinct from the smart-contract pack's `BLK-*` (`BEYU-SCG-16`)
to avoid ID collision across packs. Cross-pack blockers are **referenced, never renumbered**.

| ID | Severity | Blocker | Evidence | Remediation | Owner | Clearance criteria |
|---|---|---|---|---|---|---|
| `FO-BLK-01` | **HIGH** | **`family_policy_*` tables are declared in Drizzle and snapshotted but never migrated**, so policy definitions/versions/ratifications cannot persist | `src/db/schema/family-office.ts:23,41,73`; `drizzle/meta/0074_snapshot.json`, `0075_snapshot.json`; **no `.sql` creates them**; `information_schema` → 0 rows | Additive migration (`FO-IMP-02`) | Engineering under review | Migration applied in an isolated DB; `family_policy_*` exist; full suite green |
| `FO-BLK-02` | LOW | **Declaration/table count mismatch** — 466 Drizzle declarations vs 464 live tables | `pgTable("…")` count vs `pg_class` count | Identify the 2 and close the gap | Engineering | Counts reconciled with a named explanation |
| `FO-BLK-03` | **HIGH** | **RLS absent, 0 policies, on 12 identity/family/authority tables** (§3). The existing coverage guard is scoped to `family\_%` and **deliberately excludes** `family_members`/`family_vault_items` with a recorded justification; the remaining uncovered tables are **outside its scope entirely** and have no coverage assertion. `beyu_runtime` holds `DELETE` on six of them | `pg_class.relrowsecurity=false`; `pg_policy` count 0; `information_schema.role_table_grants`; `tests/security/family-office-rls-isolation.test.ts` scope; 0/15 RLS-test files reference `beneficiaries`, `delegations` or `governance_decision_registry` | `FO-IMP-01` + `FO-IMP-03` probe — **enable RLS, or record a reasoned exclusion per table** as was done for the two kernel tables | Engineering under review | Every uncovered table is either RLS+FORCE+policy protected, or carries a documented exclusion naming the control that replaces RLS; cross-tenant probe proves isolation without breaking legitimate reads |
| `FO-BLK-04` | **HIGH** | **Domain 1 (IP/software licensing) has no registry at all**; ownership is indistinguishable from permission to use | §2 row 1 (0 schema/service hits) | `FO-IMP-04` | **UNASSIGNED** | Registry exists; ownership/permission separated; entries assert no ownership |
| `FO-BLK-05` | MEDIUM | **No related-party disclosure registry**; no market-comparison/fairness evidence record | §2 row 2 | `FO-IMP-05` + `FO-P-02` | **UNASSIGNED** | Disclosure captured before deliberation; independent review recorded |
| `FO-BLK-06` | MEDIUM | **No general conflict-of-interest declaration registry** (only meeting-level conflicts and decision-gate checks) | `governance_meeting_conflicts`, `foundation_conflicts` only | `FO-IMP-05` + `FO-P-08` | **UNASSIGNED** | Actual/potential/perceived declarations with recusal and resolution evidence |
| `FO-BLK-07` | MEDIUM | **No RACI model** — responsibility is not assignable or auditable | `grep '\braci\b' src/lib/` → 0 | `FO-IMP-06` | **UNASSIGNED** | RACI with `UNASSIGNED` default; no legal power inferred |
| `FO-BLK-08` | **HIGH** | **Succession/continuity cannot be completed safely:** minors, incapacity and DOB are unmodelled, so any activation could transfer authority without a guardian safeguard | SCG-16 `BLK-06`/`BLK-07`; no DOB/age/guardian in schema | Privacy decision, then additive schema change | **UNASSIGNED** | Minority modelled; activation transfers nothing automatically |
| `FO-BLK-09` | **HIGH (keystone)** | **No approving body is evidenced as constituted** — every domain that needs an authorization is blocked on this | `BEYU-SCG-16` `BLK-01`; `authorizeAutomation()` denies with `GOVERNANCE_BODY_NOT_CONSTITUTED` | The ten-item evidence checklist in `BEYU-SCG-18` §3.1 | **UNASSIGNED** | Items 1–10 supplied by an authorized human process |
| `FO-BLK-10` | MEDIUM | **Investment thresholds/mandate values are unconfigured** — correctly fail-closed, but Domain 4 cannot complete | §2 row 4 | Configure only on evidenced mandate | **UNASSIGNED** | Evidenced mandate + governed decision |
| `FO-BLK-11` | LOW | **Distinguishing binding corporate/statutory decisions from advisory family consultation is not a first-class type** | §2 row 6 | Model the distinction in the decision contract | **UNASSIGNED** | Type exists; advisory decisions can never bind |
| `FO-BLK-12` | LOW | **Append-only/tamper-evident claims are only partially demonstrated**; must be asserted only as evidenced | `audit_log` FORCE RLS + `audit_chain_heads`; `verifyAuditChain()` | Keep the claim scoped to what the chain proves | Engineering | Claim narrowed to demonstrated properties |

**No blocker above is cleared.** Severity describes impact if unaddressed, not urgency to act without
authority.

---

## 9. PR summary (deliverable 9)

**Change:** one new documentation file (`docs/governance/FAMILY_OFFICE_GOVERNANCE_FRAMEWORK_AUDIT.md`) on
the existing reviewable PR #108 / this session's branch.

**Non-changes (deliberate):** no schema change, **no migration**, no service, no API, no UI, no seed, no
test change, no policy adoption, no instrument edit. **No existing Phase 3 work was replaced, weakened or
reverted** — the BLK-08 fix, the SCG-16 reconciliation and the SCG-18 record stand.

**Migration impact:** **none applied.** `FO-IMP-01`/`FO-IMP-02` are proposed and would be additive; run
only in an isolated disposable database.

**Risks:** (a) the RLS remediation (`FO-IMP-01`) could fail legitimate reads closed if a policy is wrong —
hence `FO-IMP-03` must land and the full suite must pass first; (b) adding registries without adopted
policies risks recording structure that reads as governance — every new status defaults to
`PROPOSED`/`UNVERIFIED`/`UNASSIGNED`; (c) the audit itself must not be read as a compliance statement.

**Required human decisions:** whether to proceed with `FO-IMP-01`–`08`; whether to authorise the Phase 4D
PR split (Phase 3's plan stands unchanged, path totals now 156 with this document); the `BLK-01` evidence
checklist (`FO-BLK-09`); and the privacy decision gating `FO-BLK-08`.

**Phase 4D note:** this document is a **new path in unit A/B territory by path prefix**
(`docs/governance/*`, unclassified by the Phase 3 plan). **The Phase 3 PR-separation plan is not altered
here**, and re-validating path classifications is explicitly Phase 4D work awaiting approval.

---

## 10. Explicitly disabled capabilities (deliverable 10)

All of the following remain **unavailable by design** and none was activated, simulated-as-real, or
implied. Each is blocked on legal advice, a valid governing-body decision and human approval that do not
yet exist.

| Capability | State | Blocked on |
|---|---|---|
| Live investment execution / trade placement | **DISABLED** (simulation only) | Mandate + constituted body + providers |
| Live distribution / dividend / grant payment | **DISABLED**; `CAP_POSTING` **LOCKED** | Trustees + counsel |
| Signing, key custody, on-chain execution (`A7`) | **PROHIBITED** | Custody decision (`BLK-09`), counsel |
| Custody / asset transfer | **DISABLED** | Custodian appointment |
| Equity assignment or share transfer | **DISABLED** | Board + counsel |
| Constituting any governance body / appointing members | **NOT PERFORMED** | Authorized founders/board |
| Adopting or amending any binding policy | **NOT PERFORMED** — all policies `PROPOSED` | Competent body per policy |
| Beneficiary eligibility determinations | **NOT MADE** — default `UNDER_REVIEW` | Trustees + counsel |
| Identity/KYC verification | **NOT PERFORMED** — default `UNVERIFIED` | Authorised verifier |
| Succession activation / authority transfer | **DISABLED** | Counsel + minority safeguards |
| External execution of any kind | **PROHIBITED** (`A7`) | Remains prohibited |

The mission's identity safeguards hold unchanged: both intended parents remain **intended settlors** in the
drafting context; the child remains **one of several intended beneficiaries**, not the sole beneficiary,
and an intended Family Office member; **no** other beneficiary, birth date, identity number, trustee,
guardian, evidence or signed instrument is invented; membership grants **no** trusteeship, signing,
unrestricted records access, financial authority or voting rights; and **a minor receives no login, admin,
signing, payment, investment or unrestricted personal-data access through membership alone.** Seed values
such as `FAMILY_COUNCIL`, `DOCUMENTARY_AND_COUNSEL_REVIEW`, `VERIFIED` KYC or `NIDA_DOCUMENT_VERIFICATION`
are **not** evidence, and the Phase 3 `BLK-08` corrections and their regression suite are preserved.

---

## 11. What this document does not establish

* It is **not** a compliance, assurance or legal opinion, and it certifies no domain as operational.
* It does **not** clear any blocker, adopt any policy, appoint any owner, constitute any body, or populate
  any register.
* `IMPLEMENTED`/`PARTIAL` describe **mechanism existence**, not operational readiness or legal validity.
* It does **not** prove or disprove cross-tenant leakage — `FO-BLK-03` stands until `FO-IMP-03` runs.
* It authorizes no execution, migration, deployment, payment, investment, signing or transfer.
* A capability that has never been exercised is not a capability that works, and a control that has never
  run is not a control that passed.

**Status: audit and plan reported. Implementation has not begun. Stopping at the review gate.**
