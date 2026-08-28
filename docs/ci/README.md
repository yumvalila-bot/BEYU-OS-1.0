# CI workflow — complete and ready, pending one permission

`docs/ci/ci.yml` is the CI pipeline for this repository. It is **not active yet**,
and the only thing standing between it and running is a single GitHub App
permission.

## The exact blocker

The automation account that pushes to this repository authenticates as a GitHub
App installation without the `workflows` permission. GitHub rejects any push that
creates or updates a file under `.github/workflows/`. Attempted and refused on
branch `arena/01a04722-beyu-os-1-0` at commit `f0f3ff1`:

```
remote: refusing to allow a GitHub App to create or update workflow
        `.github/workflows/ci.yml` without `workflows` permission
 ! [remote rejected] arena/01a04722-beyu-os-1-0 -> arena/01a04722-beyu-os-1-0
error: failed to push some refs to 'https://github.com/yumvalila-bot/BEYU-OS-1.0.git'
```

The same installation is also refused administrative access, which is why branch
protection on `main` cannot be enabled by it either:

```
GET /repos/yumvalila-bot/BEYU-OS-1.0/branches/main/protection
-> 403 {"message":"Resource not accessible by integration"}
```

This is a permission boundary, not a defect, and it is deliberately not worked
around. Rather than drop the pipeline, it is committed here for review. Nothing
else in the change depends on it.

## Who must grant it, and how

A **repository or organisation owner** — a human maintainer with admin rights on
`yumvalila-bot/BEYU-OS-1.0`, not the automation account.

1. GitHub → **Settings → Applications → GitHub Apps** → the app installed on this
   repository (or org) → **Configure**.
2. Under **Repository permissions**, set **Workflows** to **Read and write**.
   To enable branch protection as well, set **Administration** to
   **Read and write**.
3. Save. If the app is org-level, accept the new permission grant on the
   organisation.

## Exact action required to activate

Once the permission is granted, a maintainer with write access runs:

```bash
mkdir -p .github/workflows
git mv docs/ci/ci.yml .github/workflows/ci.yml
git rm docs/ci/README.md
git commit -m "Activate CI workflow"
git push
```

No edits to the file are required — it is complete as written, and it was
executed step-for-step locally against a real PostgreSQL 17 instance before being
committed.

## What it enforces

Every gate fails the build. A PostgreSQL 16 service container is included because
the tenant-isolation, audit-chain concurrency, transaction-atomicity and
governed-mutation suites assert against real database state; mocking them would
invalidate the guarantees they exist to prove.

1. `npm ci` — reproducible install from the committed lockfile
2. `npm run typecheck`
3. `npm run lint`
4. `npm run migrate` — versioned migrations via `scripts/migrate.ts`
5. **Migration drift check** — fails if `drizzle-kit generate` produces a new
   migration, i.e. if the committed migrations no longer describe `src/db/schema`
6. **Provision the non-superuser runtime role** — `scripts/setup-db-role.ts`
7. **Assert the runtime role's attributes** — must be `NOSUPERUSER`,
   `NOBYPASSRLS`, `NOCREATEROLE`, `NOCREATEDB`
8. `npm run seed`
9. `npm run build`
10. **Build without any runtime secret** — fails if a module regresses to
    requiring `DATABASE_URL` at build time
11. Start the application and **assert `/api/health` reports `database: UP`**
12. `npm test` — the full suite, with the end-to-end suites driving the running
    server over real HTTP
13. **Credential literal scan** — fails on committed secrets
14. **Committed-secret filename scan** — fails if a `.env`, `.pem`, `.key` or
    `id_rsa` file is tracked
15. **Production dependency audit** — critical severity, production deps only

## Why step 6 is not optional

This is the single most important line in the file, and its absence was a real
defect in the earlier draft.

The security suites must connect as the **runtime** role to prove anything. If
`scripts/setup-db-role.ts` has not run, that role does not exist, `DATABASE_URL`
falls back to the `postgres` superuser, and:

- `tests/security/runtime-privilege-audit.test.ts` **fails** — a superuser can
  legitimately `SET ROLE` to a superuser, so "runtime role cannot SET ROLE to a
  superuser" cannot hold;
- `tests/security/rls-isolation.test.ts` **skips** — it asserts
  `current_user = 'beyu_runtime'`.

Reproduced locally with a CI-parity environment (admin DSN only, no runtime
role): **2 failed, 4 passed, 13 skipped**. A pipeline in that state reports red
for the wrong reason or, once someone "fixes" it by relaxing the assertion, green
having proved nothing about the role production actually runs as.

The job environment therefore separates three credentials deliberately:

| Variable | Role | Used by |
| --- | --- | --- |
| `DATABASE_URL` | `beyu_runtime` — non-superuser, RLS-bound | the application server under test |
| `BEYU_ADMIN_DATABASE_URL` | `postgres` — superuser | migrations, seeding, drizzle-kit |
| `BEYU_TEST_DATABASE_URL` | `postgres` — privileged | suites that call domain services directly, without the `guarded()` RLS wrapper |
| `BEYU_RUNTIME_DATABASE_URL` | `beyu_runtime` | the RLS and privilege-audit suites |

Running the server on the runtime role is what makes the end-to-end suite a test
of Row Level Security rather than a test of the superuser.
