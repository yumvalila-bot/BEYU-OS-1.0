# BEYU OS — Cloud-first development and testing

## Operating model

The repository is the source of truth. Development, validation and review are performed in cloud-hosted environments; local Windows development remains supported but is optional.

| Stage | Service | Database boundary |
|---|---|---|
| Cloud development | GitHub Codespaces | Disposable embedded PostgreSQL 16 inside the Codespace |
| Pull-request validation | GitHub Actions | Ephemeral PostgreSQL 16 service container, destroyed with the job |
| Browser regression | GitHub Actions + Playwright | Runs against the CI app server and ephemeral CI database |
| Visual review | Vercel Preview | Preview deployment; no production database credential |
| Production application | Vercel | Existing Supabase PostgreSQL production project |
| Production schema release | GitHub Actions db-release workflow | Human-gated Production environment; never part of ordinary PR CI |

**Do not connect Codespaces, CI, or Vercel Preview to the production Supabase database.** Vercel Preview must not receive DATABASE_URL. The current Supabase project has its production main branch only; this setup does not create a paid database branch or a second hosted database.

## Start a cloud development workspace

1. Open the repository on GitHub.
2. Select **Code → Codespaces → Create codespace on codex/cloud-first-codespaces** (or on the feature branch you are working on).
3. Choose the smallest suitable machine (2 cores is the recommended starting point).
4. Wait for the Codespaces post-create setup to finish. It installs the lockfile-pinned dependencies and Playwright Chromium, creates a private .env containing random disposable credentials, starts the embedded PostgreSQL 16 instance, applies canonical migrations, provisions the constrained runtime/governance roles, and seeds disposable development data.
5. Start the application:

~~~bash
npm run dev -- --hostname 0.0.0.0 --port 3100
~~~

Open the forwarded 3100 port. The Codespaces port is private by default.

The generated .env is ignored by Git and must remain inside the Codespace. Bootstrap refuses a non-generated environment or any database DSN whose host is not loopback. Do not paste production credentials into Codespaces secrets or this development .env. After pulling a branch that adds migrations or changes the lockfile, rerun the bootstrap with: bash scripts/infra/codespaces-bootstrap.sh. It reuses the generated environment and applies pending migrations.

## Run checks in the Codespace

With the development server running on port 3100:

~~~bash
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run build
~~~

The Playwright config defaults to http://127.0.0.1:3100. The browser suite uses the pinned @playwright/test version and its matching Chromium download.

To stop the disposable database when you are finished:

~~~bash
npm run pg16:stop
~~~

If the Codespace is rebuilt, the bootstrap is safe to rerun against its generated, loopback-only environment. It does not overwrite an unrelated .env.

## Pull-request workflow

1. Create a feature branch in Codespaces; do not commit directly to main.
2. Push the branch and open a pull request.
3. GitHub Actions runs the existing canonical CI pipeline: migration integrity, PostgreSQL 16 migration replay, runtime/governance privilege checks, the root Vitest suite, and Playwright Chromium tests. Its PostgreSQL service is temporary and isolated to that run.
4. Vercel creates a Preview deployment for review. Use it for public UI and responsive visual inspection. Preview is SSO-protected according to the current Vercel project settings.
5. Resolve all failed checks and obtain human review before merge.

The browser regression in GitHub Actions intentionally tests the application against a server started inside the same CI job. This gives it a real PostgreSQL-backed environment without granting the Vercel Preview deployment database access. The Preview is a separate visual-review surface, not a substitute for the full database-backed CI suite.

## Production controls

- The normal CI workflow is read-only with respect to production services and uses only an ephemeral PostgreSQL service.
- The existing db-release workflow is the only governed production database release path. Its production deploy job targets the protected Production GitHub environment.
- Do not add production secrets to Preview, Codespaces, or ordinary PR jobs.
- Do not create or apply production migrations, change Vercel production settings, promote deployments, or merge automatically as part of this cloud-development setup.
- Production deployment and database release remain human-controlled.

## Cost controls

GitHub documents a monthly Codespaces allowance for personal accounts (currently 120 core-hours and 15 GB-month on GitHub Free). A 2-core Codespace consumes two core-hours per running hour. Stop the Codespace when finished; do not enable prebuilds for this setup. If the included quota is exhausted and no billing is configured, Codespaces access is blocked until the quota renews rather than silently creating additional spend.

See the official [Codespaces included-usage guidance](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-included-usage) and [Codespaces billing limits](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces).
