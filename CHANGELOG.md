# Changelog

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
