# PHASE 04 — INFRASTRUCTURE RECOVERY

Date: 2026-09-05
Status: **RECOVERED (real PostgreSQL 16)**

## Goal

Provision the disposable PostgreSQL environment required to execute the blocked DB-backed verification gates, without weakening or mocking tests.

## Why previous session was blocked

- No `psql` / `postgres` binaries.
- `apt` mirrors (`deb.debian.org`) unreachable.
- `binaries.prisma.sh` unreachable (only affects source Prisma postinstall).
- No Docker/Podman.

## Recovery mechanism

Used the `embedded-postgres` npm package (devDependency) which ships a prebuilt PostgreSQL 16.14 binary and runs it as a normal local server.

## Evidence

```bash
node scripts/infra/pg16-server.mjs start
```

Result (measured):
- `PostgreSQL 16.14` on x86_64-pc-linux-gnu.
- Listening on `127.0.0.1:5432`.

The harness provisions the canonical CI model:
- Databases: `beyu_os`, `beyu_health`.
- Roles: `postgres` (superuser/admin), `beyu_runtime` (root runtime, `NOSUPERUSER NOBYPASSRLS`), `beyu_health_runtime` (Health runtime, `NOSUPERUSER NOBYPASSRLS`, `CREATEDB` for scratch test DBs).
- Grants on `public` schema.

No real secret is used; all passwords are ephemeral CI-style literals (`*_not_secret`).

## Key evidence runs

| Command | Result |
|---|---|
| `npm run migrate` | PASS 23/23, idempotent, no drift |
| `npx tsx scripts/dr-drill.ts` | PASSED |
| `npm run seed` | PASS |
| `npm test` with `BEYU_TEST_BASE_URL` | 2375/2375 PASS |
| Health `npm run migration:identity:up` | PASS 24/24, idempotent |
| Health real-PG security subset | 89/89 PASS |
| `flutter --version` | **BLOCKED** — no Flutter SDK |
| Production secrets / provider | **BLOCKED** — none present |

## Remaining infra blockers

| Dependency | Status |
|---|---|
| Flutter SDK | BLOCKED |
| Real AI provider runtime | BLOCKED (no provider credentials) |
| Real production environment / secrets | BLOCKED |
| Rollback / disaster recovery production drill | DOCUMENTED (DR drill passes locally; production PITR is owner-gated) |

Status: **PARTIALLY VERIFIED**. The database-backed gates are now executable; the deployment/mobile/provider gates remain blocked.
