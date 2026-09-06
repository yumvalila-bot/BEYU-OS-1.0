# PHASE 02 — DESTINATION BASELINE (`BEYU-OS-1.0`)

Date: 2026-09-05 (fresh run)
Baseline SHA: `6c2ec2663c4f704fd6ca4054d0f9ddedb8fb3878`
Current branch: `arena/01a072db-beyu-os-1-0`
Migration head at start: `267118b8126dd2c2b91bf06bacd88e1f44c9d4f7`

## Environment

| Component | Value |
|---|---|
| Node | v22.22.3 |
| npm | 10.9.8 |
| PostgreSQL | **recovered** in this session — embedded PostgreSQL 16.14 |
| Flutter | **NOT PRESENT** — BLOCKED |

## Root BEYU OS results (fresh, with real PostgreSQL 16)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run migrate` | PASS — 23/23 applied, idempotent |
| `npx tsx scripts/setup-db-role.ts` | PASS — runtime role NOSUPERUSER NOBYPASSRLS |
| `npm run seed` | PASS |
| `npx tsx scripts/dr-drill.ts` | PASSED — schema parity, 85 tables, RLS set preserved, chain intact |
| `npx drizzle-kit generate --name=ci_drift_check` | No schema drift |
| `npm test` (real PG + live server) | **111 files / 2375 tests / 2375 pass / 0 fail / 0 skip** |
| `npm run build` (no runtime secrets) | PASS |

## Targeted DB-backed security/finance evidence (real PG)

| Suite | Result |
|---|---|
| `tests/finance` + `tests/security` + `tests/tenant-isolation` + `tests/audit` + `tests/authorization` + `tests/database` + `tests/identity/identity-adversarial-http` | 35 files / **585 tests / 585 pass / 0 fail** |

## Health OS backend

| Check | Result |
|---|---|
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | PASS |
| `npm run build` | PASS |
| `npm run migration:identity:up` | PASS — 24/24 applied, idempotent |
| Jest PGlite layer | 88 suites passed / 2 skipped; **488 pass / 15 skip / 0 fail** |
| Jest real-PostgreSQL subset | 9 suites / **89 tests / 89 pass / 0 fail** |

## Health OS frontend

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 3 files / **14 pass / 0 fail** |
| `npm run build` | PASS |

## Status

- **BASELINED** (with real PostgreSQL now available).
- Non-DB gate previously reported 450 root failures; **those failures are now confirmed to be fully resolved** by real PostgreSQL — the fresh full run is green.
- Remaining BLOCKED gates: Flutter SDK, real AI provider, real production deployment/secrets.
