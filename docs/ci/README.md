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
2. **Migration integrity** — `scripts/migration/integrity.ts`. DB-free, so an
   incoherent migration set fails in seconds rather than after a 46-migration apply
3. `pg_isready` readiness wait and PostgreSQL 16 version assertion
4. `npm run typecheck`
5. `npm run lint`
6. `npm run migrate` — the canonical migrations under `drizzle/` via `scripts/migrate.ts`
7. Assert every migration is recorded in `beyu_migrations`
8. Assert a re-run applies nothing (idempotent, no ledger drift)
9. **Migration integrity reconciliation** — `scripts/migration/integrity.ts
   --with-ledger` reconciles SQL vs journal vs snapshots vs the real
   `beyu_migrations` ledger (see "Schema drift gate integrity" below)
10. **Schema drift check** — `scripts/migration/schema-drift.ts` compares the schema
    the migrations actually produced (`drizzle-kit pull` against the migrated
    database) with the schema `src/db/schema.ts` declares (`drizzle-kit generate`),
    both written to a throwaway directory
11. **Provision the non-superuser runtime role** — `scripts/setup-db-role.ts`
12. **Assert the runtime role's attributes** — `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`
13. `npm run seed`
14. `npm run build`, then **build again with every runtime secret cleared** — fails
    if a module regresses to requiring `DATABASE_URL` at build time
15. Start the application and **assert `/api/health` reports `database: UP`**
16. Full regression with `BEYU_TEST_BASE_URL` set
17. **Assert the skip count is near zero** — an unreachable server must fail, never
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

## Schema drift gate integrity (P2 resolution, 2026-09-18)

P1 recorded that the repo-side drift gate was not proving anything. P2 reproduced
that from current `main` (`ae09d53`) and replaced the gate. Full evidence, the
reconciliation matrix and the remaining governance boundary are in
`docs/migration/P2_MIGRATION_INTEGRITY.md`; this section is the pipeline summary.

**What was actually wrong.** `npx drizzle-kit generate --name=ci_drift_check`
prints

```
Error: [drizzle/meta/0038_snapshot.json, drizzle/meta/0039_snapshot.json] are
pointing to a parent snapshot: … which is a collision.
```

and then **exits 0** having written nothing. The old gate compared
`ls drizzle/*.sql | wc -l` before and after, saw no change, and printed "No schema
drift." It never ran a comparison — failure mode *reports an error but exits
successfully*, compounded by *depends on invalid metadata*.

**That blindness had a real cost.** `payment_webhook_events_tenant_idx` is declared
in `src/db/schema/payments.ts` and is present in `drizzle/meta/0028_snapshot.json`,
but migration `0028` creates only two of the table's three indexes. The index has
never existed in any database. The replacement gate reports it immediately; it is
fixed by the additive, idempotent migration `0045`.

**The replacement.** `scripts/migration/schema-drift.ts` measures two snapshots and
compares them: `drizzle-kit pull` for the schema the migrations actually produced,
`drizzle-kit generate` for the schema `src/db/schema.ts` declares. Both go to a
throwaway directory under `os.tmpdir()`, so `drizzle/meta` is neither read nor
trusted and cannot be edited to make the gate green. A run that exits 0 while
reporting an error, or that produces no snapshot, **fails**. Ambiguity fails closed.

**What it compares** (deliberately): tables, columns (name/type/nullability),
enums, unique constraints and composite primary keys symmetrically; indexes,
foreign keys and check constraints asymmetrically, where "declared in schema but
absent from the database" is drift and the reverse is informational — BEYU's
integrity migrations legitimately add database-side objects the ORM does not
model, such as `audit_log_prev_hash_uidx`. RLS enablement, policies, foreign-key
names and check-constraint expressions are excluded with reasons documented in
`src/lib/migration/drift.ts`; RLS itself is verified directly against real
PostgreSQL by the isolation suites.

**Migration integrity** (`scripts/migration/integrity.ts`) is a separate, DB-free
stage that runs before anything touches the database. It shares its logic with
`tests/migration/*.test.ts`, so the pipeline and the suite cannot disagree.

**What P2 deliberately did NOT do.** The historical `drizzle/meta` journal and
snapshots were left untouched. Snapshots for `0018`, `0021`, `0029` and
`0040`–`0045` were never generated, and `0039_snapshot.json` is a byte-identical
copy of `0038_snapshot.json`. Synthesising the missing snapshots now would assert
schema states that were never captured — fabricated migration metadata. The gap is
therefore recorded in `KNOWN_METADATA_DEBT`, reported on every run, and blocked
from growing: a new migration without metadata fails the build unless it is added
to that register explicitly. This is safe because nothing in the repository
consumes `drizzle/meta` at runtime — `scripts/migrate.ts` reads `drizzle/*.sql`
directly and keeps its own `beyu_migrations` ledger.

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
