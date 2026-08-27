# Phase 3 — Ratified Engineering Allowlist Matrix

**Status:** ENGINEERING GATE — defines the exact scope of implementation authorized by the Phase 3A/3B authorization. This document authorizes **policy-neutral infrastructure and ratified-boundary enforcement only**. It authorizes **no business functionality**.

**Baseline verified:** `HEAD = 622d5d1` on `arena/01a03aec-beyu-os-1-0` (PR #8); `main = da1ef20`; working tree clean; Phase 1–2 engines byte-identical to `da1ef20`; no migration `0018` exists; `node_modules` installed for test execution (verification only — no production dependency added).

**Governing rule (unchanged):**

```text
EXPLICIT RATIFICATION → IMPLEMENT WITHIN THE EXACT RATIFIED SCOPE
NO RATIFICATION       → FAIL CLOSED → DO NOT IMPLEMENT
POLICY-NEUTRAL        → IMPLEMENT AS NEUTRAL CONTRACT / ADAPTER / VALIDATION BOUNDARY
```

## 1. Ratification state (authoritative, from the Phase 2.5 matrix)

| Classification | Count | FIRs |
|---|---:|---|
| RATIFIED (boundary-only) | 3 | FIR-017 (Noelia/HIVE), FIR-018 (Finance OS truth), FIR-019 (canonical ownership) |
| PARTIAL | 5 | FIR-004, FIR-011, FIR-016, FIR-023, FIR-027 |
| UNRESOLVED | 6 | FIR-020, FIR-021, FIR-022, FIR-024, FIR-025, FIR-026 |
| REQUIRES LEGAL/POLICY RATIFICATION | 13 | FIR-001…003, 005…010, 012…015 |
| BLOCKING PHASE 3 business implementation | 24 | all except FIR-017/018/019 |

The three RATIFIED decisions are **prohibitions/boundaries**. They authorize boundary-enforcement infrastructure (validation, refusal, audit, invariant tests). They authorize **no** business functionality.

## 2. Engineering allowlist matrix (FIR-001 → FIR-027)

Legend for "Implementation allowed?":
- `NONE` — no implementation for this FIR's business behavior.
- `BOUNDARY-INFRA` — only the boundary-enforcing, policy-neutral infrastructure named in "Exact allowed scope".
- Every `NONE` row may still be touched by **shared** policy-neutral infrastructure (Section 3) provided that infrastructure does not select, infer, or encode any of that FIR's policy values.

| FIR | Ratification status | Architectural dependency (Phase 3A §) | Engineering dependency (component) | Implementation allowed? | Exact allowed scope | Prohibited behavior | Tests required |
|---|---|---|---|---|---|---|---|
| FIR-001 | NOT RATIFIED | §9, §49 (T1), W-A | institution scope root | NONE | Neutral only: nullable `institutionScopeRef` in typed instruction contracts (KDD-1 tenant-scope default) | No institution record/table; no scope semantics; no W-A | contracts (ref structure), spec-validation |
| FIR-002 | NOT RATIFIED | §8–9, §7.2 | membership uniqueness; cross-tenant workflow | NONE | Neutral only: none new (kernel tenant isolation is canonical, unchanged) | No uniqueness change; no cross-tenant family workflow | boundaries (kernel invariants untouched), T-01 (future) |
| FIR-003 | NOT RATIFIED | §12, §17 | relationship effects; eligibility inputs | NONE | Neutral only: none (engine vocabulary exists; effects inert) | No relationship-effect behavior; no automatic conferment | eligibility regression |
| FIR-004 | NOT RATIFIED (PARTIAL) | §13–14, W-B, W2/W3 | evidence binding; verification workflow | NONE | Neutral only: `FamilyEvidenceRef` (documentId + checksum reference structure) | No verification writes; no evidence persistence; no verifier authority | contracts |
| FIR-005 | NOT RATIFIED | §13, W-B | parent-edge integrity model | NONE | Neutral only: none | No FK/temporal model; no tenant-consistency rule | lineage regression |
| FIR-006 | NOT RATIFIED | §15, W-C, W5 | constitution authority/electorate matrix | NONE | Neutral only: `FamilyPolicyRef` / `FamilyAuthorityRef` reference structures | No propose/amend workflow; no electorate values | spec-validation, contracts |
| FIR-007 | NOT RATIFIED | §15, §23 | quorum/threshold/effectivity/emergency | NONE | Neutral only: emergency absence = fail-closed (`FC1_CONSEQUENCES`, gate) | No quorum/threshold/supermajority/effective-date/emergency values | fail-closed |
| FIR-008 | NOT RATIFIED | §16, W-D, W6 | body mandates/role authority | NONE | Neutral only: none | No mandate/membership persistence; no role-linked grants | boundaries (TRUSTEE_RESERVED_MATTERS invariant) |
| FIR-009 | NOT RATIFIED | §17–18, W-E/W-F, W4 | eligibility/beneficiary behavior | NONE | Neutral only: none | No eligibility conferment; no beneficiary writes; no entitlement logic | eligibility regression |
| FIR-010 | NOT RATIFIED | §18, W-F | beneficiary uniqueness/overlap | NONE | Neutral only: `EFFECTIVE_PERIOD_CONFLICT` error name (no enforcement rule encoded) | No uniqueness/overlap constraints; no dedup | errors |
| FIR-011 | NOT RATIFIED (PARTIAL) | §19 | delegation adapter | NONE | Neutral only: `DELEGATOR`/`DELEGATE` SoD slot rule (delegator ≠ delegate) | No family delegation store; no scope/limit values; no delegation creation | authorization-slots |
| FIR-012 | NOT RATIFIED | §20, W-G, W7/W8 | capital instruction + Finance hand-off | NONE (business) | Neutral only: typed `FamilyCapitalInstruction` contract; forbidden financial-state keys; write-once Finance reference check; idempotent submission contract; `FINANCE_BOUNDARY_VIOLATION` enforcement | No instruction persistence/table; no Finance submission; no amount authority; no allocation | contracts, boundaries |
| FIR-013 | NOT RATIFIED | §21, W-G, W9/W10 | loan instruction + Finance/legal hand-off | NONE (business) | Neutral only: typed `FamilyLoanInstruction` contract; forbidden loan-terms keys; submission contract | No loan persistence/table; no interest/repayment/tax/accounting values; no hand-off execution | contracts, boundaries |
| FIR-014 | NOT RATIFIED | §11 | jurisdiction gate | NONE | Neutral only: nullable `jurisdictionRef` in contracts | No governing-law determination; no conflict-of-laws values | contracts |
| FIR-015 | NOT RATIFIED | §34–35, §22 | privacy/retention/sealed rules | NONE | Neutral only: none (conservative classification defaults remain, unchanged) | No retention periods; no lawful bases; no sealed-release rules | boundaries (defaults unchanged) |
| FIR-016 | NOT RATIFIED (PARTIAL) | §28–29 | per-object event/evidence profiles | NONE (profiles) | Neutral only: event-type catalog constants; `EventInput`-shaped denial-event builder (canonical envelope, pure) | No per-object profile; no emission wiring; no family-owned log | events |
| FIR-020 | NOT RATIFIED (UNRESOLVED) | §12, §25 | member lifecycle states/effects | NONE | Neutral only: none | No lifecycle transitions; no effect-bearing states | boundaries (schema untouched) |
| FIR-021 | NOT RATIFIED (UNRESOLVED) | §16, W-D | body persistence | NONE | Neutral only: none | No body/membership tables or links | boundaries (governance schema untouched) |
| FIR-022 | NOT RATIFIED (UNRESOLVED) | §15, W-C | provision/version registry | NONE | Neutral only: none (document-first KDD-5 requires no new table) | No provision/version tables | boundaries |
| FIR-023 | NOT RATIFIED (PARTIAL) | §26–27 | permission/SoD/step-up matrix | NONE (permissions) | Neutral only: SoD slot structure + validator (rule pairs are structural invariants; role→slot assignment remains unratified) | No new permissions; no risk classes; no step-up values | authorization-slots, boundaries |
| FIR-024 | NOT RATIFIED (UNRESOLVED) | §22, W-H, W11 | vault/document linkage; sealed model | NONE | Neutral only: none | No vault/document linkage; no seal/unseal/succession behavior | boundaries (vault schema untouched) |
| FIR-025 | NOT RATIFIED (UNRESOLVED) | §20, W-G | capital instruction persistence shape | NONE | Neutral only: shape exists ONLY as a typed contract (no table) | No instruction table/index/FK | contracts |
| FIR-026 | NOT RATIFIED (UNRESOLVED) | §21, W-G | loan instruction persistence shape | NONE | Neutral only: shape exists ONLY as a typed contract (no table) | No instruction table/index/FK | contracts |
| FIR-027 | NOT RATIFIED (PARTIAL) | §24, W12, R10 | policy-decision register operation | NONE | Neutral only: `POLICY_DECISION_RAISED`/`POLICY_DECISION_RESOLVED` event names; denial event records the unratified state | No register persistence; no resolution workflow; no owner assignment | events, fail-closed |
| FIR-017 | RATIFIED (boundary) | §31 | Noelia/HIVE advisory boundary | BOUNDARY-INFRA | `AdvisoryOutput` contract (`requiresHumanApproval: true`); `assertNoAuthorityClaim`; `AI_NEQ_ANY_SLOT` SoD rule; invariant tests locking `NOELIA_MAY_NOT` coverage; AI-actor refusal regression | Any AI authority; any AI business functionality; silent resolution of POLICY DECISION REQUIRED | boundaries, authorization-slots, contracts |
| FIR-018 | RATIFIED (boundary) | §30 | Finance OS financial-truth boundary | BOUNDARY-INFRA | Forbidden financial-state key lists; `assertNoFinancialState`; write-once Finance reference check; `FINANCE_BOUNDARY_VIOLATION` code; schema-lint invariant (no financial fields in family tables); one-way hand-off contract types | Shadow ledger/journal/treasury/loan book/balances/postings/waterfalls/financial lineage | boundaries, contracts |
| FIR-019 | RATIFIED (boundary) | §8–11, §28–29 | canonical identity/entity/audit ownership | BOUNDARY-INFRA | Reuse-only invariants: canonical references in all contracts; denial event on the canonical `EventInput` envelope; family permission inventory invariant (existing five, unchanged); no duplicate-master lint | Duplicate party/user/tenant/entity/delegation/audit/event systems | boundaries |

## 3. Policy-neutral infrastructure implemented by this phase

All of the following is new, additive, pure (no database, no network, no side effects), and dormant (imported only by its own tests — no production path wires it until Phase 3C/3D authorization):

| Module | Content | Neutrality proof |
|---|---|---|
| `src/lib/family/phase3/errors.ts` | 20-code error taxonomy (§37 names + metadata), `FamilyError`, `PolicyDecisionRequiredError` | Technical names/HTTP/retry/audit flags only; no policy values |
| `src/lib/family/phase3/contracts.ts` | `FamilyPolicyRef`, `FamilyEvidenceRef`, `FamilyAuthorityRef`, `HumanActorRef`, `FamilyCapitalInstruction`, `FamilyLoanInstruction`, `FinanceHandoffSubmission`, `AdvisoryOutput`; validators; forbidden-key enforcement; write-once reference check | Structures carry references + non-financial metadata; every financial-state key is rejected; human actor structurally required; no defaults |
| `src/lib/family/phase3/fail-closed.ts` | `ALL_FIR_REFS`, `RATIFIED_FIR_REFS` (= ∅ for business), `RATIFIED_BOUNDARY_FIR_REFS`, `FC1_CONSEQUENCES`, `evaluatePolicyGate` (pure), `assertPolicyGate` | The ratification set is an explicit input with an empty business default; missing refs ⇒ FC-1, never a default |
| `src/lib/family/phase3/events.ts` | Event-type catalog (28 names, §28.2), ungated event list (only `FAMILY_POLICY_GATE_DENIED`), metric names, `buildPolicyGateDeniedEvent` (pure, canonical envelope), `summariseDenials` (pure) | Names + envelope shape; no emission; no profile values |
| `src/lib/family/phase3/authorization-slots.ts` | `AuthoritySlot` vocabulary, structural SoD rule pairs, `evaluateAuthoritySlots` (pure), `assertSeparationOfDuties` | Rule pairs are architectural invariants (§26.3); which roles fill slots is NOT decided |

**Not implemented (and why):**

- No production API routes (Section 5).
- No permission additions (Section 6).
- No schema/migration (Section 4).
- No Noelia/HIVE code (the boundary is enforced by tests + contracts, not by new AI surfaces).
- No modifications to any Phase 1–2 engine file.

## 4. Database engineering determination (Step 4)

Every Phase 3A candidate table/field was classified:

| Class | Items | Disposition |
|---|---|---|
| A — already canonical, safe to reuse | `parties`, `users`, `tenants`, `legal_entities`, `countries`, `jurisdictions`, `family_members`, `beneficiaries`, `family_vault_items`, `documents`, `policies`, `constitutionArticles`, `governance_bodies`, `governance_members`, `resolutions`, `resolutionVotes`, `approvals`, `delegations`, `consents`, `audit_log`, `enterprise_events`, `audit_chain_heads`, `ai_decisions`, `noelia_action_requests`, `idempotencyRecords`, `featureFlags`, Finance tables | Reuse = read/reference only; **no modification**. No engineering action taken. |
| B — additive neutral infrastructure requirement | **None identified.** Every additive candidate in Phase 3A §49 requires at least one FIR policy value (scope model, evidence authority, mandate, rule, profile) to be given meaning. | Nothing implemented. |
| C — dependent on an unresolved FIR | `family_institutions` (001), `family_lineage_evidence` (004/016), `family_relationship_history` (005), `family_constitution_versions` (006/007/022), `family_constitution_provisions` (022), `family_forum_memberships` (008/021), `family_participation_grants` (008/003), `family_eligibility_determinations` (009), `family_capital_instructions` (012/025/016), `family_loan_instructions` (013/026/016), `family_policy_decision_records` (027) | **DO NOT IMPLEMENT.** |

**Field/constraint neutrality check:** no uniqueness rule, cardinality, parent-child legal meaning, beneficiary eligibility, effective-period semantics, membership semantics, jurisdiction default, constitutional authority, or governance threshold is introduced anywhere. **Migration 0018 remains untouched (does not exist).**

## 5. API engineering determination (Step 5)

**No production API routes are created.**

Rationale (no guessing): every draft endpoint in Phase 3A §32 carries (a) policy dependencies (FIR refs in its "Policy dependencies" column) and/or (b) draft permissions that are `PROPOSED — NOT AUTHORIZED`. The Phase 3A architecture explicitly marks **all** endpoints `DESIGN ONLY — NOT IMPLEMENTATION AUTHORIZED` and its gate G-3D requires explicit implementation authorization per increment. The authorization permits endpoints for unratified operations only "as a clearly non-executable proposal/draft/evaluation boundary if the architecture explicitly permits it" — the architecture explicitly **does not** permit any endpoint creation before ratification + G-3C spec + G-3D authorization.

No authority endpoints exist or are created: no `POST /approve`, `/amend`, `/appoint`, `/remove`, `/disburse`, `/post`, or equivalent.

The only API-adjacent artifact is the **contract types** (request/response shapes) in `contracts.ts` — inert TypeScript interfaces with pure validators, no routes, no handlers.

## 6. Permission engineering determination (Step 6)

**No permissions are added or changed.** The existing five family permissions (`family:member.read`, `family:member.manage`, `family:beneficiary.read`, `family:beneficiary.manage`, `family:vault.read`) remain exactly as in `src/lib/constants.ts` (verified by invariant test).

Rationale: per the authorization, any new permission requires object, action, actor, scope, tenant boundary, entity boundary, jurisdiction boundary, classification, SoD rule, MFA/step-up requirement, and audit requirement to be determinable **without** an unratified FIR. FIR-023 (the permission/SoD matrix) is unratified → the SoD slot→role assignment and risk classes cannot be determined → **DO NOT CREATE THE PERMISSION**. The SoD *rule pairs* (proposer ≠ verifier, etc.) are structural and are implemented as a validator; which roles fill slots is not.

No broad `family:*` wildcards; nothing grants constitutional, trustee, beneficiary, Finance posting, payment, or AI authority.

## 7. Verification requirements and tests added

Tests added (all under `tests/family/phase3/`, pure, no database):

| Suite | Proves |
|---|---|
| `errors.test.ts` | Taxonomy integrity: 20 unique codes, metadata complete, `PolicyDecisionRequiredError` carries FIR refs + FC-1 semantics |
| `contracts.test.ts` | Instruction contracts validate; **financial-state keys rejected** (FIR-018); human-actor requirement; write-once Finance reference; advisory contract refuses authority claims (FIR-017) |
| `fail-closed.test.ts` | Gate returns `POLICY_DECISION_REQUIRED` + FC-1 consequences for every unratified FIR combination; deterministic; no silent defaults; AI actor never clears the gate |
| `events.test.ts` | Catalog integrity (28 names; exactly one ungated); denial event matches the canonical `EventInput` envelope; denial summarizer pure/deterministic |
| `authorization-slots.test.ts` | SoD rule pairs enforced; AI cannot fill any slot; violations precise |
| `boundaries.test.ts` | Architecture invariants against the **real** repository: family schema tables contain no financial-state fields (FIR-018 schema lint); family permission inventory is exactly the existing five (FIR-019); `NOELIA_MAY_NOT` covers all ratified prohibitions (FIR-017); engine vocabulary intact (I-08/I-10); Phase 1–2 engines deterministic (regression); AI write refusal (regression); decision gate fails closed (regression) |
| `spec-validation.test.ts` | T-18 documentation validation: Phase 3A spec completeness (46 sections, 27×6-field FIR records, status lines), allowlist still "None", denylist 24 rows, CFG register has no filled values, this engineering matrix has 27 rows |

Step 16 verification gate (run before commit): git status / diff --check / diff --stat, protected-path verification, 0018 check, engine-unchanged check, Finance/Noelia/no-unratified-policy checks, family test suite, full test suite, typecheck, lint, build, invariants. Results reported in the phase report.

## 8. Explicit non-actions (this phase)

- No migration 0018; no schema change; no migration file of any kind.
- No production API route; no handler; no route file.
- No permission, role, or constant change.
- No UI.
- No Finance OS change; no Noelia/HIVE change; no Phase 1–2 engine change.
- No policy value chosen, inferred, or defaulted; no unresolved FIR resolved by inference.
- No Vercel/Supabase/production configuration change.
