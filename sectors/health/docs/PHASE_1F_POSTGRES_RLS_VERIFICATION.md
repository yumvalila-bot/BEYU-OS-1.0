# Phase 1F-A — Real PostgreSQL + Row-Level Security Verification

**Status: COMPLETE** (local, real-PostgreSQL evidence) — production live gates remain **BLOCKED**.
**Branch:** `arena/01a05116-health-os-1-0` (= `main`). Applies on top of Phase 1E (`d982ca4`).

---

## 1. Objective

The earlier phases ran identity/migrations/RLS tests against **PGlite** — a genuine
in-process PostgreSQL engine — but not against a **standalone real PostgreSQL server**.
Phase 1F-A provisions a real PostgreSQL 18.4 server in this environment and verifies that
the existing BEYU Health OS identity database, migrations, transactions, and Row-Level
Security (RLS) behave identically and correctly on it.

Deliverable scope (this phase): **local real PostgreSQL = PASS**, **local migrations =
PASS**, **local RLS = PASS**. This does **NOT** establish a production database, Supabase,
Vercel, deployment, MFA, or live production end-to-end environment — those remain
**BLOCKED/FAIL** until a real external environment is provisioned.

---

## 2. Environment

| Item | Value |
|---|---|
| Real PostgreSQL version | **18.4** (via `@embedded-postgres` Linux binaries: real `initdb`/`pg_ctl`/`postgres`) |
| Listener | `127.0.0.1:55432` (loopback only) |
| Test database | `beyu_health_os_test` (manual) + per-spec scratch databases (automated suite) |
| Application role | `beyu_app` (`LOGIN`, `CREATEDB`, **no** `SUPERUSER`, **no** `BYPASSRLS`, owner of identity tables) |
| Non-owner RLS role | `rls_app` (`NOLOGIN`, **no** `SUPERUSER`, **no** `BYPASSRLS`) |
| RLS harness | superuser session using `SET ROLE rls_app` (mirrors the Phase 1F-A manual harness) |

No production/Supabase/Vercel credentials were used or fabricated. All scratch state is
local and outside the repository.

---

## 3. Result Summary (deliverable gates)

| Gate | Result | Evidence |
|---|---|---|
| `POSTGRESQL` | **PASS** | Real PostgreSQL 18.4 server; real engine features exercised (UUID, JSONB, UNIQUE, transactions, RLS, `CREATE POLICY`, `SET ROLE`, `CREATE DATABASE`). |
| `MIGRATIONS` | **PASS** | Migration `001_identity_foundation` applied cleanly to a fresh real-PostgreSQL database; re-application is idempotent; catalog matches schema. |
| `TRANSACTIONS` | **PASS** | 6/6 manual transaction tests on real PG (commit persists, rollback discards, atomicity, constraint rollback, audit-event atomicity). |
| `RLS` | **PASS** | RLS enabled on 4 tenant-scoped tables with 4 isolation policies; enforced for non-owner roles. |
| `TENANT ISOLATION` | **PASS** | 15/15 live non-owner isolation checks (fail-closed on NULL tenant, cross-tenant reads/writes denied, sessions & audit events isolated). |
| `APPLICATION DATABASE ROLE` | **PASS** | `beyu_app` is table owner (RLS bypass by design) but `rolsuper=false`, `rolbypassrls=false`; real isolation boundary = active-membership + tenant-context at the app layer. 6/6 boundary checks. |
| `HEALTH` | **PASS** | Live boot + `/health/live` (200) and `/health/ready` (200, `database:"up"`) against real PG. |
| Automated backend suite vs real PG | **PASS** | 61 tests / 10 suites (real PG) and 61 tests / 10 suites (PGlite fallback). |
| Secret scan | **PASS** | No secrets committed (details §10). |
| `PHASE 1F-A` | **COMPLETE** | Local real-PG verification complete. |
| `PHASE 3` | **MUST REMAIN BLOCKED** | No production deployment was performed. |

---

## 4. Real PostgreSQL provisioning

Debian package mirrors were unreachable in this environment, so PostgreSQL 18.4 was
provisioned from the **same npm registry the project already uses**
(`@embedded-postgres@18.4.0-beta.17`). It ships real server binaries:

- `/home/user/pgscratch/node_modules/@embedded-postgres/linux-x64/native/bin/{initdb,pg_ctl,postgres}`
- Data directory `/home/user/pgdata` (mode 700), unix socket dir `/home/user/pgsock/`, loopback listener on port 55432.

This is a real, standalone PostgreSQL server — not PGlite, not SQLite.

---

## 5. Migrations (PASS)

Migration `backend/database/migrations/001_identity_foundation` is generated from
`identity-schema.ts` (single source of truth) plus the role/permission seed. Applied to a
fresh real-PostgreSQL database:

- 8 identity tables created under `beyu_identity`.
- `users.security_version integer NOT NULL DEFAULT 0` (authorization-freshness guard) present.
- RLS enabled on `tenants`, `tenant_memberships`, `sessions`, `auth_events`; 4 isolation policies present.
- Unique constraints verified: `users.email`, `tenants.tenant_code`, `sessions.refresh_token_hash`, `tenant_memberships(global_user_id, tenant_id)`.
- Foreign keys and indexes verified.
- **Idempotent:** a second application is a no-op; the `.up.sql` and `ensureSchema()` both succeed on repeat application.

### Fix surfaced by the real-PostgreSQL run

Repeated `ensureSchema()` against a **shared** real database previously failed with
`CREATE POLICY … already exists` — a genuine idempotency defect that PGlite had masked
because it gives every spec a fresh in-memory database. Fixed in `identity-schema.ts`
(and regenerated into the migration) by adding `DROP POLICY IF EXISTS …` before each of the
4 `CREATE POLICY` statements. This does not weaken RLS — it makes policy creation
idempotent while keeping the exact same policy definitions.

---

## 6. Transactions (PASS)

Manual 6/6 on real PG 18.4:

1. Commit persists across sessions.
2. Rollback discards writes.
3. Multi-statement batch is atomic.
4. Constraint failure aborts and rolls back the whole transaction.
5. Audit-event write is atomic with the causing operation.
6. (Idempotency/ledger) migration ledger records exactly one applied row per run.

---

## 7. Row-Level Security & tenant isolation (PASS)

Verified live as a **non-owner** role (`rls_app`, `rolbypassrls=false`) via a superuser
`SET ROLE` harness.

- **T1/T2** Tenant A reads Tenant A rows; Tenant A cannot read Tenant B rows.
- **T3/T4** Tenant B reads Tenant B rows; Tenant B cannot read Tenant A rows.
- **T5** With `app.tenant_id` NULL, the non-owner sees **nothing** (deny-by-default / fail closed).
- **T6** Cross-tenant `INSERT` is denied by policy.
- **T7/T8** Cross-tenant `UPDATE`/`DELETE` affect 0 rows.
- **T9a–d** A revoked membership is tenant-isolated at the data layer; the app-layer
  active-membership gate also denies access.
- **T10** Sessions table is tenant-isolated.
- **T11** Audit-events table is tenant-isolated.

**Application database role boundary (PASS):** the application role `beyu_app` is the
table owner (owner bypasses RLS **by design** — authorization is enforced in middleware
before the privileged connection is used). `rolsuper=false` and `rolbypassrls=false` were
confirmed. 6/6 boundary checks passed.

---

## 8. Live boot + health (PASS)

The compiled backend was started against the real PostgreSQL server
(`NODE_ENV=production`, strong JWT secrets, explicit non-localhost `CORS_ORIGIN`,
`JWT_ISSUER`/`JWT_AUDIENCE`).

- `/health/live` → **HTTP 200** `{"status":"alive",…}`.
- `/health/ready` → **HTTP 200** `{"status":"ready","checks":{"database":"up"},…}`.
- `/health` → **HTTP 200** `{"status":"ok",…}`.
- `/graphql` `{ health }` → `{"data":{"health":"ok"}}` (schema generation succeeds).

### Live auth smoke test (against real PG) — all PASS

| Step | Result |
|---|---|
| `POST /auth/register` (with `tenantCode`) | 201 — user + membership created |
| `POST /auth/login` | 200 — `accessToken` + user (role, tenantId) |
| `GET /auth/me` (Bearer) | 200 — profile returned |
| Login with wrong password | **401 INVALID_CREDENTIALS** (fail closed) |
| `/auth/me` with garbage token | **401 Unauthorized** (rejected) |
| Login with a tenant the user has no membership in | **401 NO_TENANT_MEMBERSHIP** (cross-tenant deny) |
| `POST /auth/refresh` (cookie + allowed Origin) | 200 — token rotated |
| `POST /auth/logout` | 200 |
| Refresh after logout | **401 SESSION_REUSE_DETECTED** (reuse detection) |

---

## 9. Backend code changes in this phase

All changes are to the test harness / boot path / idempotency and do **not** alter the
identity security model:

- `src/modules/identity/test-connection.ts` (new) — `createTestDbConnection()` (application
  role) and `createTestSuperuserConnection()` (RLS harness). When
  `TEST_DATABASE_URL`/`TEST_DATABASE_URL_SUPERUSER` are set they create an isolated scratch
  database per connection against a real server (dropped on close); otherwise they fall back
  to PGlite, preserving the default CI engine.
- `identity.integration.spec.ts`, `migration-consistency.spec.ts`, `rls-isolation.spec.ts`,
  `auth-context.middleware.spec.ts`, `health.service.spec.ts`, `auth-wiring.spec.ts` — now use
  the connection factory. `rls-isolation.spec.ts` uses the superuser harness (needed for
  `SET ROLE`).
- `identity-schema.ts` + regenerated migration `001_identity_foundation.{up,down}.sql` —
  `DROP POLICY IF EXISTS` before each `CREATE POLICY` (idempotency fix).
- Boot fixes (pre-existing defects surfaced by a real boot, needed to reach the live
  health/auth smoke test): `json-logger.ts` extends `ConsoleLogger` (Nest v9),
  `mfa.service.ts` marks the MFA provider `@Optional()`, `supabase.module.ts` registers
  `SupabaseConfig`, and a minimal GraphQL `Query` root (`graphql.resolver.ts`) allows
  code-first schema generation.

---

## 10. Test counts & secret scan

| Suite | Result |
|---|---|
| Backend (Jest) vs **real PostgreSQL** | **61 tests / 10 suites — PASS** |
| Backend (Jest) vs **PGlite** (default CI engine) | **61 tests / 10 suites — PASS** |
| Backend lint / build | PASS / PASS |
| Frontend typecheck | PASS |
| Frontend tests (Vitest) | **14 tests — PASS** |
| Frontend build | PASS |

Counts match the known baseline (61/10 backend, 14 frontend). No tests were removed or
weakened.

**Secret scan:** no secret files are tracked; no secret patterns (the raw database
password, `sbp_…` Supabase keys, JWT signatures) in committed source/docs except truncated JWT
**documentation placeholders** in `backend/API_GUIDE.md`. No `.env`, credentials, or the
local `.pgtest.env`/`.pg_super_pw` were committed.

---

## 11. Final classification

**Phase 1F-A status: `COMPLETE`** — local real PostgreSQL, migrations, transactions, RLS,
tenant isolation, application database role, health, and the full automated suite all pass
against a real PostgreSQL 18.4 server.

**Not established by this phase (remain `BLOCKED`):** production database, Supabase,
Vercel, deployment, MFA provider, live production end-to-end. These require a real external
environment/credentials that are absent here and are not fabricated.

**`PHASE 3 MUST REMAIN BLOCKED.`**
