# Changelog

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
