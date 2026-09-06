# PHASE 05 — DATABASE VERIFICATION

Date: 2026-09-05
Status: **VERIFIED (fresh PostgreSQL 16.14, clean databases)**

## Environment

- Server: PostgreSQL 16.14 (embedded local instance).
- Databases: `beyu_os` (root control plane), `beyu_health` (Health sector).
- Admin role: `postgres` (superuser, migrations/seeding only).
- Runtime role: `beyu_runtime` / `beyu_health_runtime` (NOSUPERUSER, NOBYPASSRLS).

## 5.1 Root migrations

COMMAND:
`npm run migrate`

RESULT:
Applied 0000–0022 (23 migrations) with ledger entries and checksums.
- Re-run: applied nothing; `fingerprintBefore == fingerprintAfter`.
- Migration ledger: `23` rows, all `APPLIED`.

STATUS: PASS

## 5.2 Schema drift

COMMAND:
`npx drizzle-kit generate --name=ci_drift_check`

RESULT:
`No schema changes, nothing to migrate`. File count unchanged (23).

STATUS: PASS

## 5.3 Disaster-recovery drill

COMMAND:
`npx tsx scripts/dr-drill.ts`

RESULT:
`[dr-drill] PASSED: 85 tables restored with count parity, RLS set preserved (25 tables), enterprise-event chain intact, audit heads 2, service principals 5`.

STATUS: PASS

## 5.4 Runtime role separation

COMMAND:
`npx tsx scripts/setup-db-role.ts`

RESULT:
`rolsuper=false rolbypassrls=false rolcreaterole=false rolcreatedb=false`

STATUS: PASS

## 5.5 Health migrations

COMMAND:
`npm run migration:identity:up`

RESULT:
Applied 001–024 (24 migrations).
- Re-run: all `already applied`.
- Migration ledger: 24 rows.

STATUS: PASS

## 5.6 Health real-PostgreSQL security subset

COMMAND:
`node --experimental-vm-modules …/jest.js --runInBand rls-isolation isolation-boundaries identity.integration migration-consistency beyu-bridge auth-wiring auth-context.middleware audit-chain-integrity outbound-audit-integrity`

RESULT:
9 suites, 89 tests, 0 failures.

STATUS: PASS

## Conclusion

The canonical schema is reproducible from nothing but the committed migrations, with the expected RLS set, audit chains, service principals, and role separation. This is a **VERIFIED** database baseline.
