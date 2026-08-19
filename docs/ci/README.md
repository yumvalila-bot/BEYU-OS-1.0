# CI workflow — pending manual installation

`docs/ci/ci.yml` is the CI pipeline for this repository. It is **not active yet**.

## Why it lives here

The automation account that opened the pull request authenticates as a GitHub App
without the `workflows` permission, so GitHub rejects any push that creates or
updates a file under `.github/workflows/`:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

Rather than drop the pipeline, it is committed here for review. Nothing else in
the change depends on it.

## How to activate it

A maintainer with write access runs:

```bash
mkdir -p .github/workflows
git mv docs/ci/ci.yml .github/workflows/ci.yml
git rm docs/ci/README.md
git commit -m "Activate CI workflow"
git push
```

No edits to the file are required — it is complete as written.

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
6. `npm run seed`
7. Start the application, then `npm test` — 82 tests across 8 suites (the
   end-to-end suite drives the real HTTP surface)
8. `npm run build`
9. **Credential literal scan** — fails on committed secrets
