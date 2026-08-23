# Changelog

## [Unreleased] — Phase 9: canonical architecture completion & integration audit — 2026-08-23

### Added — genuine gaps only
- **Reserved-matter enforcement at the proposal and capital-authorization boundaries.**
  `proposeResolution()` now runs `requiresReservedMatterTreatment` + `checkBodyCompetence`.
  A `CAPITAL` proposal of USD 5,000,000 is refused as miscategorisation; routing a reserved
  capital allocation to the Tax Committee is refused as `RESERVED_MATTER_BYPASS`. The only
  inferred trigger is `CAPITAL → CAPITAL_ALLOCATION`; other mappings would invent law.
  Capital authorization is unchanged (Board vs IC competence at USD 250k is the
  reserved-matter engine's existing rule, not a new one).
- **Constitution constraint engine** (`src/lib/governance/constitution.ts`) — evaluates
  article *hierarchy* (Art. 1 supreme). Article prose is not compiled into rules.
- **Enterprise completeness matrix** (`src/lib/architecture/completeness.ts`) — machine-derived,
  cannot self-flatter. Composes Finance OS and Governance registries.
- **HCM consumption API** `GET /api/v1/hcm/employees` — the declared Sector-OS read path.
  Compensation stripped below RESTRICTED. Read-only.
- Tax specialist exports `assertLiabilityUncomputed` and `relianceOf` for independent FI.

### Not implemented (deliberately)
- No Sector OS, no AR/AP/FA/Inventory, no Docker/Supabase, no CI workflow activation,
  no P1–P11 ratification, no financial mutation.

### Verified
- Migration fingerprint unchanged: `611865f1aca2f81eeb72a6c418b49732`.
- Financial and authority state: BEFORE == AFTER.

## [Unreleased] — Phase 5A: ledger integrity invariants (substrate BLOCKED) — 2026-08-21

### Added — enforced by PostgreSQL, not application code (migration `0005_ledger_integrity_invariants`)
- **`sum(debit) = sum(credit)` per journal entry** — deferred `CONSTRAINT TRIGGER`, validated at
  COMMIT so multi-line entries build correctly and the invariant holds against raw SQL.
- At least two lines per entry; no zero-value entry.
- `journal_line_single_sided` — exactly one strictly positive side per line (the existing
  `journal_line_non_negative` still permitted a `0/0` line).
- **Journal immutability** — posted entries and lines reject UPDATE and DELETE. The reversal path
  (`journal_entries.reversal_of_id`) is preserved and tested.
- No overlapping financial periods per entity (`EXCLUDE USING gist`); period dates ordered.
- 18 behavioural tests (`tests/finance/ledger-integrity.test.ts`) driving raw SQL.

### Fixed — two real integrity defects demonstrated against the live database
- An **unbalanced journal was accepted** (debit `100.00` vs credit `7.00`).
- A **posted journal entry was mutated** via UPDATE, despite the schema declaring it immutable.

### Not implemented (deliberately) — accounting policy is missing
- **Chart of accounts, financial-period lifecycle and the posting service remain BLOCKED.** Five of
  the eleven §2 accounting questions have no authoritative answer: capital drawdown treatment,
  intercompany, tax/VAT accounts, FX accounting, and what capital execution creates.
  `capital_requests.request_type` spans `CAPEX | OPEX | INVESTMENT | FINANCING | RESERVE` — five
  materially different double-entry treatments, none specified — and `ledger_accounts` is empty.
- Resolved from evidence: accounting basis (IFRS, per `legal_entities.accounting_standard`),
  currencies (per-entity functional currency), and policy ownership (GROUP_CFO).
- Decision document: `docs/governance/ACCOUNTING_SUBSTRATE_DECISIONS.md`.
- `finance:ledger.post` was **not** granted to any additional role; the CEO wildcard exclusion and
  the CFO-only grant are preserved.

### Verified
- 311/311 tests pass twice (293 baseline + 18 new); typecheck, lint, build clean.
- Migration fingerprint `8bafa4b0f09c62a918933158789df01c`, identical on clean install, upgrade and
  re-run; no drizzle drift.
- Governance → capital gate lifecycle re-verified end to end; ledger remains empty (0 entries,
  0 lines, 0 accounts, 0 periods) and treasury unchanged — no fabricated financial truth.

## [Unreleased] — Capital execution: BLOCKED pending financial substrate — 2026-08-21

### Not implemented (deliberately)
- **Governed capital execution / funding was NOT implemented.** Stop conditions
  §31.4, §31.5 and §31.6 were reached: the finance layer is schema-only.
  - `ledger_accounts` = 0 rows — no chart of accounts, so no debit/credit target exists.
  - `financial_periods` = 0 rows — the "period must be open" invariant cannot be evaluated.
  - No posting service anywhere in `src/`; `journal_entries` / `journal_lines` have never been written.
  - `treasury_positions` is a dated balance snapshot (`as_of 2025-12-31`), not a transaction ledger;
    no cash-movement, bank-instruction or settlement table exists.
  - The constitution (Art. 5) names the Group CFO as financial authority but defines no execution
    mechanism, and no `capital:execute` / `capital:fund` capability exists. `finance:ledger.post` is
    high-risk, CFO-only, and one of just three permissions excluded from the GROUP_CEO wildcard.
  - Implementing execution would have required inventing a chart of accounts and decrementing a
    balance snapshot to simulate cash movement — fabricated financial truth.
- Findings, evidence, risk, options and the recommended decision are recorded in
  `docs/governance/CAPITAL_EXECUTION_BLOCKED.md`.

### Verified (baseline re-established after a fourth sandbox re-clone)
- Working tree recovered to the Phase-4 state; 293/293 tests pass, typecheck, lint and build clean,
  migration fingerprint `28ceb656ed7c4ab1211558f9ea107d20` reproduced.
- Bypass audit: no direct journal insertion, no direct treasury mutation, no server actions, and the
  only capital status mutation is inside the governed transaction. Nothing in the system can move
  money — which is the correct state.

## [0.7.0] — Capital governance authorization: the first governed domain gate — 2026-08-20

### Added
- **`POST /api/v1/finance/capital/:id/governance-authorization`** — records that a capital request
  has satisfied its governance prerequisite, transitioning
  `SUBMITTED | UNDER_REVIEW → GOVERNANCE_AUTHORIZED`.
- `src/lib/capital-governance-service.ts` — `authorizeCapitalRequestGovernance()` and the
  `capitalRequestsAwaitingGovernance()` read model. Delegates the governance question wholly to
  `getGovernanceDecisionAuthorization()`; no second authorization algorithm.
- `CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED` durable event, appended inside the transaction.
- Governance authorization control and status on the existing capital workbench, labelled
  "Prerequisite only — does not execute capital" and "Execution not performed."
- Error codes `GOVERNANCE_NOT_SATISFIED` (422) and `INVALID_CAPITAL_STATE` (422).
- 40 behavioural tests (`tests/finance/capital-governance.test.ts`, `capital-governance-http.test.ts`).

### Invariant established
> **GOVERNANCE AUTHORIZED ≠ CAPITAL APPROVED ≠ EXECUTED ≠ FUNDED.**
> A capital request may become governance-authorized only when a GOVERNED, APPROVED resolution
> within the correct tenant and entity reach authorises it. Governance authorization is a
> prerequisite, not execution. No money moves, no journal is posted, no treasury is invoked.

### Notes
- **Only `GOVERNED` provenance authorises.** Seeded `REFERENCE_DATA` resolutions are refused, so
  unaudited fixture data cannot move the enterprise.
- **Entity reach is ancestry, not equality.** Governance bodies sit at holding/trust entities while
  capital is raised at operating subsidiaries; requiring equality would reject the canonical seeded
  example (Investment Committee at `LEN_BEYU_HOLDINGS` authorising `LEN_BEYU_HEALTH_LTD`).
- No migration: `capital_requests.status` is free text, so `GOVERNANCE_AUTHORIZED` needed no schema
  change. Fingerprint unchanged at `28ceb656ed7c4ab1211558f9ea107d20`.
- The four-body constitutional appointment gap is untouched and remains open.

## [0.6.0] — Governance authorization signal: the first decision consumer — 2026-08-20

### Added
- **`GET /api/v1/governance/authorization`** — read-only endpoint answering whether a governed
  object is authorised by an APPROVED resolution, and on whose authority.
- `src/lib/governance-authorization.ts` — `getGovernanceDecisionAuthorization()` and the batch
  `capitalGovernanceAuthorizations()` read model. Derives authority solely from the canonical
  `resolutions` record and existing audit provenance; no new event, table, broker or state machine.
- Governance-authority column on the existing capital workbench showing GOVERNED / NOT AUTHORISED,
  the governing resolution, deciding body and decision date. Server-resolved; no optimistic state.
- `apiGetJson` test helper for JSON GET routes.
- 43 behavioural tests across `decision-authority.test.ts`, `authorization-signal.test.ts` and
  `authorization-http.test.ts`.

### Documented — unresolved constitutional question
- **Four seeded bodies have no eligible decision authority** (TRUSTEE_BOARD,
  INVESTMENT_COMMITTEE, RISK_AUDIT_COMMITTEE, TAX_GOVERNANCE_COMMITTEE). Root cause: only
  `CHIEF_GOVERNANCE_OFFICER` explicitly holds `governance:resolution.approve` (GROUP_CEO holds it
  incidentally through a wildcard), and the CGO is seated as SECRETARY only on GROUP_BOARD and
  FAMILY_COUNCIL. The Constitution, the ADRs and the body records define no rule for who must hold
  closure authority, so **no permission or seat was changed** — the appointment is a human
  governance decision. Recorded in `docs/governance/DECISION_AUTHORITY_MODEL.md` with the failure
  proven safe by regression tests.

### Notes
- No migration was required: `resolutions.linked_object_type/id` and
  `capital_requests.resolution_id` already existed. Fingerprint unchanged at
  `28ceb656ed7c4ab1211558f9ea107d20`, identical on clean install and upgrade.
- No downstream side effect: the signal is read-only and triggers no financial execution.

## [0.5.0] — Governance decision: the third governed transaction — 2026-08-20

### Added
- **`POST /api/v1/governance/resolutions/:id/decision`** — closes a resolution and records the
  constitutional decision. The third canonical governed transaction, completing
  PROPOSAL → TABLE → VOTE → DECISION.
- `decideResolutionClosure()` in `src/lib/governance-vote-service.ts` — recomputes the outcome
  inside the transaction from the authoritative ballots using the existing pure rules engine.
  The caller supplies only an optional `decisionNote`; the outcome is never client-controlled.
- `canDecideResolutions()` read model and minimal decision controls in the governance workbench,
  showing the projected outcome, decision authority, final outcome, actor and timestamp.
- `resolutions.decided_by_member_id` (migration `0004_governance_decision`) — decision provenance
  was previously unattributable from the domain row, which recorded only `decision_date`.
- `GOVERNANCE_ERROR_STATUS` — one canonical transport mapping for the governance failure taxonomy,
  replacing four per-route copies, with new codes `NOT_READY_FOR_DECISION` (422) and
  `ALREADY_DECIDED` (409).
- 42 behavioural tests (`tests/governance/decision-service.test.ts`, `decision-http.test.ts`)
  covering authority, computed outcomes, quorum, recusal, expiry, terminal immutability,
  idempotency, concurrency, the vote/decision race, provenance and transactional rollback.

### Changed — security
- **Voting no longer finalises a resolution.** `castVote` now concludes to `VOTED` and never
  produces `APPROVED`, `REJECTED` or `DEADLOCKED`. Previously the last member to vote implicitly
  exercised decision authority, collapsing the separation between voting and deciding — contrary
  to the `beyu_decision_status` contract, which already reserved `VOTED` for a separate flow.
- The vote path emits `GOVERNANCE_RESOLUTION_VOTING_CONCLUDED` (carrying the *provisional* outcome);
  `GOVERNANCE_RESOLUTION_DECIDED` is now emitted only by the decision transaction.
- Terminal states are immutable: vote, table and decide are all refused once decided.

### Notes
- Decision + audit + durable event remain atomic; a decision-event failure rolls the decision back.
- No downstream integration: the decision event triggers no Finance, Capital, Waterfall, Ledger or
  Sector OS side effect. Establishing the primitive is the whole of this phase.
- Four of six seeded bodies have no eligible decision authority — an appointment question, not a
  code defect. Documented in `docs/governance/VOTING_OPEN_DECISIONS.md` §4.

## [0.4.0] — Governance voting: the second governed transaction — 2026-08-19

### Added
- **`POST /api/v1/governance/resolutions/:id/votes`** — real ballots with quorum, majority and
  decision computed from the eligible votes. Follows the same canonical pipeline as the proposal
  mutation and reuses the identical kernel services.
- **`POST /api/v1/governance/resolutions/:id/table`** — `DRAFT → TABLED`, opening the voting
  window. Tabling is a distinct governed action; only the body's presiding officer (`CHAIR` or
  `SECRETARY`) may table, and proposing confers no tabling authority.
- `src/lib/governance-voting.ts` — pure, deterministic quorum/majority/tie engine, independently
  testable so every decision is mathematically reproducible.
- `src/lib/governance-vote-service.ts` — transactional vote and table services.
- Vote controls in the existing governance page, rendered from server-computed eligibility.
- 73 new tests (27 rules, 32 service, 14 HTTP). Suite: **82 → 155**.

### Governance rules implemented (as decided)
- **Tie ⇒ `DEADLOCKED`.** No automatic tie-break, no chair casting vote, no implicit approval.
- **Quorum** = eligible members **minus recusals**, never the number of votes cast. A member who
  has not voted remains in the denominator.
- **Abstention** counts as participation but never as FOR or AGAINST.
- **Recusal** is resolution-specific: excluded from the denominator, cannot vote, keeps the seat
  and global role.
- **Vote changes** are permitted while the window is open; the superseded vote is preserved in the
  immutable ledger. After close, no change is accepted.
- **Voting window** is server-enforced and half-open: `opensAt <= now < closesAt`.
- **Proposer** may vote if and only if independently an eligible member.
- **Two authorisation layers**: the `governance:resolution.vote` capability AND an active voting
  seat on the owning body.
- A decision is only reached when voting concludes (window closed or all eligible members voted);
  a single arriving vote never decides a resolution.

### Schema
- `beyu_decision_status` gains `DEADLOCKED` (absent, and required by the tie rule).
- `resolutions` gains `voting_opens_at`, `voting_closes_at`, `tabled_by_member_id`, `tabled_at` —
  no voting-window concept existed. Migration `0003_governance_voting.sql`.
- The pre-existing `UNIQUE(resolution_id, member_id)` on `resolution_votes` is reused as the
  one-effective-ballot invariant; no duplicate constraint was added.

### Changed
- `audit.ts` `Tx` now exposes `select`/`update`/`delete` so domain services can read and transition
  state inside the audit transaction, rather than opening a second one.
- CI workflow moved from `docs/ci/` to `.github/workflows/ci.yml` and is now active.

## [0.3.1] — Post-audit remediation: placeholders completed — 2026-08-19

Closes the findings raised by the independent audit of `9605774`, moving the
repository from YELLOW to GREEN for the next governed mutation.

### Fixed (Security)
- **A-01 (HIGH) Idempotency was unsafe.** The in-process `Map` was keyed only on
  the raw `Idempotency-Key` header, so a different actor reusing a key received
  the first actor's response body, a different payload silently replayed the old
  result, and concurrent duplicates both committed. Replaced with
  `src/lib/idempotency.ts` + the `idempotency_records` table: scoped to
  `(tenant, actor, endpoint)`, pinned to a canonical payload hash, claimed
  atomically so concurrent callers serialise, released on failure, durable across
  restarts and replicas.
- **A-02 (MEDIUM) Registry leaked HIGHLY_RESTRICTED metadata.** The data-asset
  catalogue rendered every row regardless of clearance — a RESTRICTED principal
  could see the HIGHLY_RESTRICTED family registry entry. Now filtered through the
  kernel's `filterByClearance()` with a suppression notice.
- **A-03 (MEDIUM) `TRUSTEE_BOARD` was unsatisfiable** — quorum 2, UNANIMOUS, zero
  seated members. Trustees are now seated (2 voting members).
- **J-7 No role granted `governance:resolution.vote`**, so a vote endpoint would
  have been unreachable. Granted to the four roles that actually hold governance
  seats, consistent with `governance_members`.

### Fixed (Correctness)
- `auditTrailFor()` filtered `objectType` **after** `limit(50)`, so a busy ledger
  could return an empty trail for an object that had audit records. The predicate
  is now part of the query; added `auditTrailsFor()` for batch lookup.
- `createSession()` was dead code duplicating the login handler's session insert.
  Replaced by `newSessionValues()`, now the single definition of a session row,
  consumed by both the transactional login path and the standalone helper.
- `assertSameTenant()` was never called. It now throws a typed
  `TenantIsolationError`, and the new `assertWithinScope()` is enforced on the
  governance write path as a last-line invariant (mapped to 403, not 500).

### Fixed (Test quality)
- **A-04/A-05** Five tests asserted on **source text** rather than behaviour, and
  there were **no HTTP-level tests**. `TEST 1` claimed to prove unauthenticated
  access was blocked but only grepped for `guarded(`. Replaced with tests that
  execute the real route, the real Zod contract and the real running server.
- Added `tests/governance/resolution-http.test.ts` (14 end-to-end tests) and
  `tests/security/idempotency.test.ts` (10 tests). Suite: **58 → 82**.
- Extracted `src/lib/governance-contract.ts` so the request contract is directly
  testable instead of grep-asserted.
- CI now starts the application and runs the end-to-end suite against it.

### Fixed (Hygiene)
- `package-lock.json` still declared `nextjs-postgresql-template`; regenerated.

### Verified, not changed
The `DRAFT` initial lifecycle state was challenged during the audit and confirmed
correct: `beyu_decision_status` is `DRAFT → TABLED → VOTED → APPROVED | REJECTED |
WITHDRAWN | DEFERRED`, the column default is `DRAFT`, and `PROPOSED` appears
nowhere in the schema, seed, application or documentation. No lifecycle change was
made. Reference allocation was stress-tested (30 concurrent across 3 bodies): no
duplicates, contiguous numbering, no gaps after rollback.

## [0.3.0] — Phase 1 Hardening + First Governed Mutation — 2026-08-19

### Added
- **Governance resolution proposal** — the first real governed domain mutation and the canonical
  pattern for all future BEYU OS writes:
  VALIDATE → AUTHENTICATE → SCOPE → RBAC → ABAC/classification → POLICY → BUSINESS RULES →
  MUTATE → AUDIT → EVENT → ATOMIC COMMIT
- `src/lib/governance.ts` — governance domain service reusing the existing kernel (authz,
  tenant-scope, policy engine, hash-chained audit). No new kernel services were introduced.
- `POST /api/v1/governance/resolutions` — creates a real, persisted resolution in the initial
  lifecycle state; emits `GOVERNANCE_RESOLUTION_PROPOSED`
- `src/app/os/governance/propose.tsx` — proposal UI that re-reads the database after success
  (no optimistic local state)
- `tests/governance/resolution-propose.test.ts` — 19 tests covering authentication, validation,
  tenant isolation, RBAC, ABAC, classification, persistence, audit, event, atomic rollback,
  actor/tenant/status forgery
- `.github/workflows/ci.yml` — typecheck, lint, migrate, drift check, seed, tests, build and a
  credential scan, with a PostgreSQL service container
- `package-lock.json` — reproducible installs (previously uncommitted)
- `test`, `migrate`, `migrate:generate`, `seed` and `evidence:gate1` npm scripts

### Fixed
- **H-NEW-1** Tax page enumerated all legal entities globally — now scoped via `tenantScopeIds()`
  and narrowed by the principal's ABAC entity scope
- **H-NEW-2** Foundation page bypassed tenant scope through hardcoded `BEYU-FOUNDATION` /
  `BEYU-FDN` codes — the tenant is now resolved inside the principal's scope and out-of-scope
  principals are denied
- **Test suite could not run.** `tests/engines.test.ts` (21 tests) failed to collect because
  kernel modules transitively require `DATABASE_URL`; `dotenv/config` is now a vitest setup file.
  The documented "37/37 pass" was previously not reproducible — it now is (58/58).
- **Migration journal drift.** `drizzle/meta/_journal.json` listed only `0000`; `0001` is now
  journalled with its snapshot, and `drizzle-kit` reports no drift against `src/db/schema`.
- **Committed database credentials.** `drizzle.config.json` hardcoded a connection string; replaced
  by `drizzle.config.ts` reading `DATABASE_URL`.
- Reference allocation bug found by the new tests: `substring(x from $1)` with a bind parameter
  resolves to the SQL-regex overload and silently returns NULL. Replaced with `regexp_match` plus a
  transaction-scoped advisory lock.
- Package renamed from `nextjs-postgresql-template` to `beyu-os`
- Documentation contradictions corrected: `drizzle-kit push` guidance, test counts, and the
  non-existent `develop` branch

### Not changed (deliberately)
Authentication, authorization, policy engine, tenant isolation, audit chain and the migration
runner were reused, not replaced. No new kernel service was created.

## [0.2.0] — Kernel Gate 1 Remediation — 2026-08-16

### Fixed (Critical)
- **C-01** Audit chain concurrency: serialized append via `SELECT FOR UPDATE`, unique prev_hash index, immutability triggers
- **C-02** Tenant isolation: canonical `tenantScopeIds()` helper on all 15 pages, PostgreSQL RLS on 11 tables
- **C-03** Migration control: versioned migration runner with metadata, checksums and drift detection
- **C-04** MFA bypass: standards-compliant TOTP with encrypted secrets, replay prevention, step-up expiry
- **C-05** Credential security: environment-only bootstrap password, production guard, zero credential literals
- **C-06** Atomic audit: `recordAuditTx()`/`publishEventTx()`/`withAuditTransaction()` for transactional coupling

### Fixed (High)
- **H-04** Self-test CTL-AI-008 now evaluates policy engine (no hardcoded pass)
- **H-07** Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **H-10** Emergency access revocation: `revokedAt`/`revokedBy`/`revokeReason` fields + authz enforcement
- **H-12** Chain verification: complete chain check with duplicate-parent detection and head matching

### Added
- `src/lib/mfa.ts` — TOTP generation, verification, encryption, recovery codes
- `src/lib/tenant-scope.ts` — canonical tenant-scoping abstraction
- `scripts/migrate.ts` — production migration runner
- `tests/audit/audit-concurrency.test.ts` — 10/50/100 concurrent writer tests
- `tests/security/mfa.test.ts` — TOTP bypass prevention tests
- `tests/tenant-isolation/tenant-isolation.test.ts` — cross-tenant enumeration tests
- `tests/database/atomic-audit.test.ts` — transaction atomicity tests
- `drizzle/0001_kernel_gate1_hardening.sql` — RLS, triggers, constraints, MFA columns

## [0.1.0] — Kernel v0.1 Candidate — 2026-08-14

### Added
- Constitutional data layer (8 schema modules, ~60 tables)
- Identity, organization, ownership, governance, risk, compliance, finance, HCM, family office
- Waterfall cashflow engine (deterministic, checksum-verified)
- Tax strategy intelligence (jurisdiction-gated, evasion-blocked)
- Noelia AI / HIVE runtime (permission-inheriting, fully audited)
- 15 enterprise UI pages with canonical BEYU visual identity
- 21 deterministic engine tests
