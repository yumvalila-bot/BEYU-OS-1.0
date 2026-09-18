# CI workflow — ACTIVE

The canonical CI pipeline lives at **`.github/workflows/ci.yml`** and runs on every
push to `main`, every pull request targeting `main`, and on demand via
`workflow_dispatch`.

## History

This file previously held the pipeline itself, parked here because it could not be
published. The automation account that pushes to this repository authenticated as a
GitHub App installation **without the `workflows` permission**, and GitHub rejects
any push that creates or updates a file under `.github/workflows/`. Refused on
branch `arena/01a04722-beyu-os-1-0` at commit `f0f3ff1`:

```
remote: refusing to allow a GitHub App to create or update workflow
        `.github/workflows/ci.yml` without `workflows` permission
 ! [remote rejected] arena/01a04722-beyu-os-1-0 -> arena/01a04722-beyu-os-1-0
```

That permission has since been granted, so the pipeline is now published and the
duplicate copy that lived at `docs/ci/ci.yml` has been removed. Keeping it would
have meant two definitions of one pipeline drifting apart. The root gate in the
published workflow is that file's pipeline, preserved step-for-step, extended with
the Health OS jobs and a real-PostgreSQL Health gate.

## One canonical PostgreSQL architecture

Schema, migrations, tests and the RLS model live in GitHub as the single source of
truth. Arena, CI and Production are isolated environments that each run that one
schema against their own PostgreSQL:

| Environment  | PostgreSQL                        | Lifetime    |
| ------------ | --------------------------------- | ----------- |
| Arena        | temporary instance                | per session |
| CI           | `postgres:16` service container    | per run     |
| Production   | Supabase managed PostgreSQL        | persistent  |

Supabase is **not** a second database. When it hosts production it *is* the
production PostgreSQL (see `docs/runbooks/supabase-production-database.md`). The CI
container is ephemeral run infrastructure — it is destroyed when the job ends and
is never pointed at production, Supabase, an Arena instance or a developer machine.

Canonical version: **PostgreSQL 16**, matching the pin already used by this file's
predecessor and by `sectors/health/backend/docker-compose.yml`.

## What it enforces

Every gate fails the build. There is no `continue-on-error`, no `|| true` masking a
gate, and no `exit 0` short-circuit.

**Committed secret scan** — high-confidence credential patterns across the working
tree and the last 200 commits of history, plus credential-literal and
credential-filename scans. Matched paths are reported; matched secret *values* are
never printed.

**Root BEYU OS**

1. `npm ci`
2. `pg_isready` readiness wait and PostgreSQL 16 version assertion
3. `npm run typecheck`
4. `npm run lint`
5. `npm run migrate` — the canonical migrations under `drizzle/` via `scripts/migrate.ts`
6. Assert every migration is recorded in `beyu_migrations`
7. Assert a re-run applies nothing (idempotent, no ledger drift)
8. **Schema drift check** — fails if `drizzle-kit generate` produces a new migration
   (validated relationally against the `drizzle/meta` snapshots; see "Schema drift
   gate integrity" below for its current restoration status as of 2026-09-18)
9. **Provision the non-superuser runtime role** — `scripts/setup-db-role.ts`
10. **Assert the runtime role's attributes** — `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`
11. `npm run seed`
12. `npm run build`, then **build again with every runtime secret cleared** — fails
    if a module regresses to requiring `DATABASE_URL` at build time
13. Start the application and **assert `/api/health` reports `database: UP`**
14. Full regression with `BEYU_TEST_BASE_URL` set
15. **Assert the skip count is near zero** — an unreachable server must fail, never
    silently skip the transport-level suites

**Health OS frontend** — `npm ci`, typecheck, test, build. This package defines no
lint script; none is fabricated and `package.json` is not modified to invent one.

**Health OS backend** — real PostgreSQL 16. `npm ci`, `tsc --noEmit`, non-mutating
ESLint (the package `lint` script carries `--fix` and is deliberately not invoked),
then migrations `001_identity_foundation` → `030_add_tenant_fk_integrity_triggers`
applied against real PostgreSQL with ledger verification and an idempotence re-run.
The Jest suite runs **twice**: once with all database URLs cleared, to prove the
in-process PGlite layer is intact, and once against real PostgreSQL.

No new test code was written to achieve the real-PostgreSQL run. The repository's
own `src/modules/identity/test-connection.ts` already switches on the environment:
`createTestDbConnection()` returns a real `PgConnection` against a fresh scratch
database when `TEST_DATABASE_URL`/`DATABASE_URL` is set, and falls back to PGlite
when neither is. Setting those variables is the supported mechanism. PGlite is
retained as a fast layer; it does not replace the real gate.

**Production dependency audit** — `npm audit --omit=dev --audit-level=critical`
across all three packages. The threshold is the documented policy from
`SECURITY.md`: dev-only advisories in build tooling are triaged deliberately and
must not redden the pipeline on every upstream publication, while a critical
vulnerability in shipped runtime code must.

## Schema drift gate integrity (reality correction, 2026-09-18)

During P1 of the integrated release programme the repo-side CI drift gate was
inspected against current `main` (`ac9b588`). For the canonical root BEYU OS:

- The migration source (`drizzle/*.sql`) contains **45** migrations
  (`0000` → `0044`), but the drizzle meta journal (`_journal.json`) ends at
  `0039`.
- Snapshots are genuinely missing for migrations `0018`, `0021`, `0029`, `0040`,
  `0041`, `0042`, `0043`, `0044`, and file snapshots `0038` and `0039` are the
  **same object** (identical `id`/`prevId`, from the out-of-band authoring
  pattern). `drizzle-kit generate` reports the two snapshots as a parent
  collision.

These are real defects in the schema drift mechanism — drift has occurred in the
meta layer without being detected by the drift step. The step is therefore
currently validated by its *absence* (the CLI errors out before generating) rather
than by a meaningful diff. The runtime/operational consequences are unchanged:
schema authority remains `.github/workflows/db-release.yml` +
`scripts/db-release.ts`, which compare the **real database** against a clean
scratch install (fingerprint, migration checksums, RLS inventory, destructive
scan) — that gate independently detects live drift and is not affected by this
finding.

Restoring the `drizzle/meta` journal and regression-testing it for real
(including the drift-gate health and the one-health-canonical-PG architecture)
is an explicit **Phase 2 (PH2-B)** task. Raising it requires regenerating the
journal from scratch, not inventing copies; that is neither a single-line
relabelling nor something to perform blindly in P1, because it redetermines the
relational guarantee of the drift gate. References for the audit trail: the
historical `0030` journal repair in `POST_MERGE_FORENSIC_AUDIT_REPORT.md`, the
pin-annotation pattern at the end of the specialist domain suites, and the
schema-authority roles in `docs/deployment/THREE_WAY_PRODUCTION_ARCHITECTURE.md`.

## Why the runtime role step is not optional

This is the most important line in the file, and its absence was a real defect in
an earlier draft.

The security suites must connect as the **runtime** role to prove anything. If
`scripts/setup-db-role.ts` has not run, that role does not exist, `DATABASE_URL`
falls back to the `postgres` superuser, and:

- `tests/security/runtime-privilege-audit.test.ts` **fails** — a superuser can
  legitimately `SET ROLE` to a superuser, so "runtime role cannot SET ROLE to a
  superuser" cannot hold;
- `tests/security/rls-isolation.test.ts` **skips** — it asserts
  `current_user = 'beyu_runtime'`.

Reproduced locally with a CI-parity environment (admin DSN only, no runtime role):
**2 failed, 4 passed, 13 skipped**. A pipeline in that state reports red for the
wrong reason or, once someone "fixes" it by relaxing the assertion, green having
proved nothing about the role production actually runs as.

The job environment therefore separates four credentials deliberately:

| Variable                    | Role                                  | Used by                                        |
| --------------------------- | ------------------------------------- | ---------------------------------------------- |
| `DATABASE_URL`              | `beyu_runtime` — non-superuser, RLS-bound | the application server under test          |
| `BEYU_ADMIN_DATABASE_URL`   | `postgres` — superuser                | migrations, seeding, drizzle-kit               |
| `BEYU_TEST_DATABASE_URL`    | `postgres` — privileged               | suites calling domain services directly, without the `guarded()` RLS wrapper |
| `BEYU_RUNTIME_DATABASE_URL` | `beyu_runtime`                        | the RLS and privilege-audit suites             |

Running the server on the runtime role is what makes the end-to-end suite a test of
Row Level Security rather than a test of the superuser.

## Credentials

Every credential in the workflow is a **CI-only literal** with no value outside the
throwaway service container. None is a GitHub secret and none is a production
credential. Steps that talk to PostgreSQL use discrete connection parameters
(`PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE` plus `PGPASSWORD` from the environment)
rather than a DSN in argv, so a failing `psql` cannot echo a password into the log.
