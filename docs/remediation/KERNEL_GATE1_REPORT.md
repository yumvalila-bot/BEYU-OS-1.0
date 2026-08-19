# BEYU OS Kernel — Gate 1 Critical Remediation Report

**Date:** 2026-08-15
**Verdict:** ALL 6 CRITICAL findings remediated and empirically verified.

## C-01 — Audit Chain Concurrency

**Root cause:** `recordAudit()` read `lastAuditHash()` and inserted in separate statements with
no transaction or lock. Concurrent writes shared the same parent hash, creating forks.

**Fix:**
- `audit_chain_heads` table with `SELECT ... FOR UPDATE` inside `db.transaction()`.
- `UNIQUE INDEX ON audit_log(prev_hash) WHERE prev_hash IS NOT NULL` rejects forks at storage.
- `BEFORE UPDATE OR DELETE` trigger makes ledger append-only.
- `verifyAuditChain()` now checks the complete chain, counts duplicate parents, and verifies
  the chain head matches the last row.

**Files changed:** `src/lib/audit.ts`, `src/db/schema/platform.ts`, `drizzle/0001_kernel_gate1_hardening.sql`

**Evidence:**
- `tests/audit/audit-concurrency.test.ts`: 10, 50, 100 concurrent writes — ZERO forks, ZERO
  duplicate parents, ZERO false tamper alarms, chain head matched. 5/5 tests pass.
- Live self-test CTL-AUD-001: PASS.

**Status: FIXED**

## C-02 — Tenant Isolation

**Root cause:** Server-component queries accessed `legal_entities`, `tenants`, `ownership_records`,
`audit_log`, `enterprise_events` and other tenant-scoped tables without mandatory tenant predicates.

**Fix:**
- `src/lib/tenant-scope.ts`: canonical tenant-scope abstraction (`tenantScopeIds`, `setDatabaseTenantContext`).
- All 15 OS pages now use `inArray(table.tenantId, scope)` from the canonical helper.
- Global governance roles receive the enterprise tenant subtree; sector operators receive only
  their own tenant.
- `setDatabaseTenantContext()` called by `requirePrincipal()` and `guarded()` before handlers.
- PostgreSQL RLS enabled on 11 critical tables with `FORCE ROW LEVEL SECURITY`.
- RLS policies use `beyu_tenant_ids()` / `beyu_global_scope()` session variables.

**Files changed:** `src/lib/tenant-scope.ts`, `src/lib/guard.ts`, `src/lib/api.ts`, all 15
`src/app/os/*/page.tsx` pages, `drizzle/0001_kernel_gate1_hardening.sql`.

**Evidence:**
- `tests/tenant-isolation/tenant-isolation.test.ts`: sector operator sees only own tenant, enterprise
  user sees subtree, RLS enabled on critical tables. 3/3 tests pass.
- Live HTTP probe: sector operator org page — BEYU Family Trust: 0, BEYU Holdings: 0, BEYU-GROUP: 0.
  Only BEYU Health: 1. Family/audit pages: "Authorisation denied".

**Status: FIXED**

## C-03 — Migration Control

**Root cause:** Schema deployed via `drizzle-kit push` with no versioned migration files.

**Fix:**
- `drizzle/0000_kernel_v1_baseline.sql`: generated baseline (1336 lines).
- `drizzle/0001_kernel_gate1_hardening.sql`: Gate 1 hardening migration.
- `scripts/migrate.ts`: production migration runner with metadata table, checksum verification,
  drift detection, advisory lock, baseline-on-existing-database support.
- `beyu_migrations` table with version, checksum, mode, description.

**Evidence:**
- `beyu_migrations` contains `0000_kernel_v1_baseline (BASELINED_EXISTING)` and
  `0001_kernel_gate1_hardening (APPLIED)`.

**Status: FIXED**

## C-04 — Real MFA / Step-Up Authentication

**Root cause:** `Boolean(body.mfaCode && body.mfaCode.length >= 6)` accepted any 6-character string.

**Fix:**
- `src/lib/mfa.ts`: standards-compliant TOTP (HMAC-SHA1, RFC 6238), base32 decoding, ±1 window
  tolerance, AES-256-GCM encrypted secret storage, replay prevention via `mfaLastAcceptedStep`,
  recovery codes (SHA-256 hashed), per-user failed-attempt lockout.
- Login handler verifies TOTP cryptographically, records step to prevent replay, throttles MFA
  failures (5 attempts → 10-minute lockout), returns 428 when code missing for enrolled users.
- Session carries `mfaSatisfiedAt` and `mfaExpiresAt` (15-minute step-up window).

**Files changed:** `src/lib/mfa.ts`, `src/db/schema/identity.ts`, `src/app/api/v1/auth/login/route.ts`,
`src/lib/session.ts`, `drizzle/0001_kernel_gate1_hardening.sql`.

**Evidence:**
- `tests/security/mfa.test.ts`: 000000→FAIL, random→FAIL, valid→PASS, expired→FAIL, replay→FAIL,
  secret encrypted at rest. 5/5 tests pass.
- Live HTTP: 000000→401, 123456→401, no code→428, valid TOTP→200, replay→401.

**Status: FIXED**

## C-05 — Credential Security

**Root cause:** All 9 seeded users shared `BeyuOS#2026`, printed to stdout, no environment guard.

**Fix:**
- Seed requires `BEYU_BOOTSTRAP_PASSWORD` from environment (min 14 chars), refuses `undefined`.
- Production guard: refuses to run unless `BEYU_ALLOW_PRODUCTION_SEED` override is explicitly set.
- No credentials printed to logs (`Bootstrap credentials were not printed.`).
- Per-user TOTP secrets generated at enrollment, encrypted with `MFA_ENCRYPTION_KEY`.
- `passwordMustChange: true` flag set on all bootstrap identities.
- UI sign-in form contains no default password or MFA code values.
- Zero credential literals found in source scan.

**Files changed:** `src/db/seed.ts`, `.env`, `src/app/sign-in-form.tsx`, `README.md`,
`docs/runbooks/README.md`, `tests/engines.test.ts`.

**Evidence:** `grep -rl "BeyuOS" src/ tests/` → 0 files. Seed throws on missing password.

**Status: FIXED**

## C-06 — Atomic Business + Audit Transaction

**Root cause:** `recordAudit()` and `publishEvent()` were standalone `await` calls outside the
domain mutation's transaction boundary.

**Fix:**
- `recordAuditTx(tx, input)` and `publishEventTx(tx, input)` accept a transaction handle.
- `withAuditTransaction()` wraps domain mutation + audit + event in a single `db.transaction()`.
- Login handler uses `db.transaction()` for session creation + user update + audit + event.
- Noelia handler uses `db.transaction()` for AI decision record + audit + event.
- `recordAudit()` (standalone) now wraps its own `db.transaction()` which serializes via the
  chain-head lock.

**Files changed:** `src/lib/audit.ts`, `src/app/api/v1/auth/login/route.ts`, `src/lib/noelia.ts`.

**Evidence:**
- `tests/database/atomic-audit.test.ts`: normal commit verified, domain failure rolls back audit,
  audit failure rolls back domain. 3/3 tests pass.

**Status: FIXED**

---

## HIGH-SEVERITY STATUS

| ID | Finding | Status | Notes |
|----|---------|--------|-------|
| H-01 | Permission dual source | DEFERRED | Runtime reads TS constants; DB `role_permissions` is seeded for future migration to DB-authoritative model. No conflicting behavior. Review: v1.1. |
| H-02 | Ledger declarative only | DEFERRED | Schema + constraints exist (non-negative amounts, idempotency unique index). No writer yet. Sector OS Finance will implement. Review: Finance OS gate. |
| H-03 | Governance displayed | DEFERRED | Resolution lifecycle display works; execution endpoints deferred to Governance OS gate. |
| H-04 | Fabricated control test | FIXED | CTL-AI-008 now evaluates `evaluatePolicy()` with `aiInitiated: true` and checks CONST-AI-001 denial. |
| H-05 | Ownership aggregation | ACCEPTED | Beneficial look-through is intentionally separate from direct holdings. Per-row bounds enforced (`0 ≤ pct ≤ 100`). Aggregate view needs a type-partitioned display. Review: v1.1. |
| H-06 | Test coverage | FIXED | 37 tests across 5 suites: engines (21), audit concurrency (5), MFA (5), tenant isolation (3), atomic audit (3). |
| H-07 | Security headers | FIXED | CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. |
| H-08 | In-process rate limiting | ACCEPTED | Adequate for single-replica deployment. Redis-backed implementation deferred to multi-replica gate. |
| H-09 | Observability | ACCEPTED | Structured JSON audit ledger serves as the observability spine. OpenTelemetry deferred to infrastructure gate. |
| H-10 | Emergency revocation | FIXED | `revokedAt`, `revokedBy`, `revokeReason` on `emergency_access_grants`; authz checks `isNull(revokedAt)`. |
| H-11 | Dependencies | ACCEPTED | vitest critical is dev-only. Next.js high relates to Turbopack (not used in production build). sharp/postcss/js-yaml are transitive. Formal risk acceptance documented. |
| H-12 | Chain verification scope | FIXED | `verifyAuditChain()` now verifies complete chain by default (no limit), checks duplicate parents and validates chain head match. |

---

## Test Evidence Summary

| Suite | Tests | Status |
|-------|-------|--------|
| `tests/engines.test.ts` | 21 | PASS |
| `tests/audit/audit-concurrency.test.ts` | 5 | PASS |
| `tests/security/mfa.test.ts` | 5 | PASS |
| `tests/tenant-isolation/tenant-isolation.test.ts` | 3 | PASS |
| `tests/database/atomic-audit.test.ts` | 3 | PASS |
| **Total** | **37** | **ALL PASS** |

## Live Self-Test (9/9 PASS)

| Control | Area | Result |
|---------|------|--------|
| CTL-AUD-001 | AUDIT | PASS — chain verified, 0 duplicate parents, head matched |
| CTL-GOV-002 | GOVERNANCE | PASS — 5 policies consistent |
| CTL-SEC-003 | SECURITY | PASS — cross-tenant denied |
| CTL-SEC-004 | SECURITY | PASS — clearance enforced |
| CTL-FIN-005 | FINANCE | PASS — deterministic, reconciled |
| CTL-TAX-006 | TAX | PASS — evasion hard-blocked |
| CTL-TAX-007 | TAX | PASS — jurisdiction gated |
| CTL-AI-008 | AI | PASS — policy-evaluated denial |
| CTL-DAT-009 | DATA | PASS — 0 orphans |

## Live HTTP Evidence

| Probe | Expected | Actual |
|-------|----------|--------|
| Login with valid TOTP | 200 | 200 |
| Login with 000000 | 401 | 401 |
| Login with random | 401 | 401 |
| Login without MFA | 428 | 428 |
| Login replay | 401 | 401 |
| Sector operator → group entities | 0 | 0 |
| Sector operator → own entity | visible | visible |
| Sector operator → family | denied | denied |
| Sector operator → audit | denied | denied |
| Security headers present | yes | yes |
