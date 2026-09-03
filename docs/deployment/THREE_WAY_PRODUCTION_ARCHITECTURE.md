# BEYU OS — Three-Way Production Architecture (GitHub · Vercel · Supabase)

**Status:** Pipeline IMPLEMENTED and functionally verified; production wiring PARTIALLY_IMPLEMENTED with EXTERNAL_BLOCKED items (see §11 — the owner must add two repository secrets and complete the Vercel environment).
**Date:** 2026-09-03 · **Pipeline:** `.github/workflows/db-release.yml` + `scripts/db-release.ts`

---

## 1. Mandated architecture

```
                    GITHUB  (source of truth · CI/CD control plane)
                   /       \
                  /         \    (two INDEPENDENT relationships — never chained)
                 ▼           ▼
             VERCEL       SUPABASE
           application    PostgreSQL
             runtime      persistence + RLS
                 \           /
                  \         /   (runtime DSN, runtime role, TLS)
                   ▼       ▼
                     BEYU OS
                constitutional control plane
                          │
                   canonical identity (GlobalUserID)
                          │
                   service federation
                          ▼
                      HEALTH OS
```

**Authority laws enforced by this repository:**

| Authority | Owner | Enforcement |
| --- | --- | --- |
| Application source, builds, release provenance, promotion | **GitHub** | all changes via PR; CI gates; `db-release.yml` is the only path that may mutate production schema |
| Database schema | **GitHub (via CI/CD)** — never Vercel, never a developer laptop | migrations live in `drizzle/` (root, 0000–0018) and `sectors/health/backend/database/migrations/` (001–021); production DDL only through `scripts/migrate.ts` executed by `db-release.yml` |
| Application runtime | **Vercel** | Vercel GitHub App builds every push; production = `main` |
| Data persistence, RLS, tenant isolation | **Supabase PostgreSQL** | `beyu_runtime` NOSUPERUSER/NOBYPASSRLS role; RLS policies on all tenant-scoped tables |
| Enterprise governance, canonical identity | **BEYU OS** | constitution, governance, identity register, audit ledger — no sector may compete (Phase 7: `docs/security/IDENTITY_FEDERATION.md`) |

## 2. The three relationships — evidence and status

### A. GitHub → Vercel — VERIFIED (existing)

* Vercel GitHub App installed on `yumvalila-bot/BEYU-OS-1.0`; project `beyu-os-1-0` (`prj_2lwDKNVHO6TUxkLYCA4m7wR5elrj`, team `yumvalila-1204s-projects`).
* Every push gets a SHA-tied deployment: commit status context `Vercel` (e.g. `5baCxa9pYj8EKXMpA5TZpdvRARCj` READY on `main`@`8e74e96`, 2026-09-02; preview `6t84aZuHQ7YCPc1v9Sf9PZhoh2NY` READY on `1b4f656`).
* Production default domain: `https://beyu-os-1-0.vercel.app` (live, public). Preview aliases: SSO-protected (Vercel "Protected Deployment") — previews are not publicly reachable.
* GitHub environments `Preview` and `Production` exist (created by the Vercel app).

### B. GitHub → Supabase — PIPELINE IMPLEMENTED; execution EXTERNAL_BLOCKED (secrets)

* `.github/workflows/db-release.yml` is the direct relationship: pull_request migration validation (scratch PostgreSQL, no secrets) → live preflight → deploy → verify → provenance record → runtime verification. Weekly scheduled drift detection.
* Target: Supabase project `siyzygezdmlxbvwttrdz` (eu-west-3; PostgREST gateway confirmed alive). Admin DSN = `postgres.<ref>` on the session pooler (`:5432`, `sslmode=require`) — DDL-safe; NEVER the transaction pooler (`:6543`).
* **Blocked on:** repository secrets `BEYU_ADMIN_DATABASE_URL` and `BEYU_RUNTIME_DB_PASSWORD` (owner action; the workflow fails closed with an EXTERNAL_BLOCKED annotation until they exist — it never silently skips).

### C. Vercel ↔ Supabase — PARTIALLY_IMPLEMENTED; currently BROKEN at runtime

* The deployed application reaches PostgreSQL through `DATABASE_URL` = Supavisor runtime DSN for the `beyu_runtime` role (`:6543`, `pgbouncer=true`, `sslmode=require`).
* **Live finding (2026-09-03):** `https://beyu-os-1-0.vercel.app/api/health` → `{"ok":false,"checks":{"database":"DOWN"}}`. The Vercel production environment's database connection is unset or invalid. The `runtime-verify` job in `db-release.yml` turns exactly this into a fail-closed deployment gate.
* **Owner action:** set the Vercel production `DATABASE_URL` (and the auth secrets — §6) once the DB pipeline has provisioned the schema + runtime role.

## 3. Release sequence (deterministic, expand/contract)

Standard release (the runbook the pipeline encodes):

```
 1. GitHub commit on a feature branch
 2. PR → ci.yml (builds, full test matrices, secret scan, dependency audit)
          + db-release.yml preflight-repo (clean install of THIS revision's
            migrations on scratch PostgreSQL 16; captures expected fingerprint)
 3. Pre-merge database deploy (EXPAND phase — optional, for schema-changing
    releases): dispatch db-release.yml [mode=deploy] on the release branch.
    Migrations MUST be backward compatible with the currently deployed app
    (expand-only: add columns/tables/policies; never drop in the same release
    that stops using them).
 4. Merge to main (production promotion — human decision)
 5. Vercel builds + deploys main (automatic, SHA-tied)
 6. db-release.yml push pipeline: live-preflight → deploy (idempotent —
    normally zero pending) → verify → release record → runtime-verify
 7. runtime-verify polls the production /api/health until database UP
 8. Release certification = green pipeline + provenance record published
```

Contract-phase (destructive/contracting) changes require **two releases**: release N expands + migrates the app off the old shape; release N+1 contracts the schema after release N is verified in production. The pipeline's destructive gate (`--allow-destructive` for TRUNCATE/DROP against an existing schema) enforces the human checkpoint.

## 4. Migration safety (Phase 5 gates, all in `db-release.ts`)

| Gate | Mechanism |
| --- | --- |
| Current version + pending list | `beyu_migrations` table vs `drizzle/*.sql` (preflight, read-only) |
| Modified migration detection | sha256 checksum per recorded version — any mismatch fails the pipeline |
| Unexpected migration detection | recorded-but-not-in-repo versions fail drift/preflight |
| Schema drift detection | md5 fingerprint over tables/columns/constraints/indexes; production must equal the scratch-install fingerprint of the exact revision |
| Destructive-operation scan | pending migrations matching `DROP DATABASE/SCHEMA/TABLE/COLUMN`, `TRUNCATE`, `GRANT … SUPERUSER/BYPASSRLS`, `ALTER SYSTEM`, `DROP OWNED` → pipeline STOPS with REQUIRES_HUMAN_APPROVAL unless `--allow-destructive` (destructive against an EMPTY database is informational — mirrors `migrate.ts` semantics) |
| Transaction behavior | every migration applied inside one transaction with its own `beyu_migrations` row (atomic version + schema) |
| Locking behavior | `pg_advisory_xact_lock('BEYU_OS_MIGRATION')` per migration — concurrent pipelines serialize |
| Rollback | see §8 — forward-fix policy; down-migrations exist for Health (001–021) but production database rollback is NEVER automatic |
| Historical guard | migration `0001` contains candidate-sandbox TRUNCATEs; `migrate.ts` refuses it against any existing schema |

## 5. Environment mapping and separation

| Code path | Environment | Database |
| --- | --- | --- |
| feature branch | local + CI scratch | ephemeral (PGlite / CI service container) |
| pull request | validation; Vercel preview (SSO-protected) | **NO production access**: `db-release.yml` live jobs are conditioned to `push`/`workflow_dispatch` and structurally cannot run from `pull_request` |
| `main` | production | Supabase `siyzygezdmlxbvwttrdz`, schema deployed only by `db-release.yml` |

Preview deployments receive **no** `DATABASE_URL` (owner must keep it unset in the Vercel Preview environment) — DB-dependent routes fail closed rather than touching production data. A staging Supabase project can be added later for full preview fidelity (decision pending — the pipeline supports it by pointing a second dispatch at a staging DSN).

## 6. Secrets contract (where every credential lives)

**GitHub repository secrets (Actions):**

| Secret | Purpose |
| --- | --- |
| `BEYU_ADMIN_DATABASE_URL` | Supabase admin/migration DSN — used ONLY by `db-release.yml` (DDL) |
| `BEYU_RUNTIME_DB_PASSWORD` | password for the `beyu_runtime` role (provisioned idempotently by `scripts/setup-db-role.ts`, NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION) |

**Vercel environment variables (Production only):**

| Variable | Value shape |
| --- | --- |
| `DATABASE_URL` | `postgresql://beyu_runtime.<ref>:<pw>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true` (runtime role, transaction pooler) |
| `AUTH_SECRET` | ≥32 random chars (app auth) |
| `MFA_ENCRYPTION_KEY` | TOTP secret encryption key |
| `BEYU_BOOTSTRAP_PASSWORD` | governed bootstrap account password |
| `BEYU_INTERNAL_SERVICE_TOKEN` | shared HS256 secret for the internal identity API (Phase 7 sector federation) — set identically on the Health backend when it is deployed |

**Never anywhere:** in git, in frontend bundles, in logs, in the Health SPA (its `vercel.json` rewrites keep the backend origin server-side; `HEALTH_API_URL` is not `VITE_`-prefixed). The committed-secret scan job gates every PR.

## 7. Release provenance (Phase 10)

Every production push produces a release record (JSON artifact + GitHub Release with tag `db-release-<sha8>-<run>`):

```json
{
  "git":        { "sha": "…", "ref": "refs/heads/main" },
  "database":   { "latestMigration": "0018_…", "schemaFingerprint": "…",
                  "expectedFingerprint": "…", "migrationSource": "github:…@drizzle/" },
  "application":{ "runtime": "vercel", "vercelDeployment": "https://vercel.com/…/…",
                  "productionUrl": "https://beyu-os-1-0.vercel.app" },
  "environment":"production",
  "timestamp":  "…",
  "provenance": { "workflowRun": "…/actions/runs/…" }
}
```

This answers, for the running system: which GitHub revision produced it (Vercel commit status is queried per SHA), which migration state it expects (`drizzle/` at that SHA), and whether the production database matches (fingerprint equality, enforced by the verify job).

## 8. Rollback (application ≠ database)

* **Application rollback:** Vercel redeploy of the previous deployment (dashboard/CLI) or `git revert` on `main` (preferred — keeps GitHub the authority and produces a new provenance record).
* **Database rollback:** forward-fix policy. Migrations are append-only in production; a bad migration is remediated by a NEW corrective migration, never by editing history (checksummed) and never by automatic down-migration. Supabase PITR exists as the disaster-recovery path for data loss (retention/restore procedure verification: NOT_ATTEMPTED — owner-side, see §11).
* The pipeline NEVER executes `DROP DATABASE/SCHEMA`, `TRUNCATE`, or resets (scanner + `migrate.ts` guards).

## 9. Security posture of the pipeline itself

* Actions pinned by commit SHA (`actions/checkout@11d5960…`, `setup-node@49933ea…`, `upload-artifact@ea165f8…`); no third-party actions.
* Least-privilege tokens: workflow default `contents: read`; only `release-record` gets `contents: write` (to publish the provenance tag), scoped per-job.
* Pull requests can never reach production (event-conditioned jobs + no secrets exposure).
* Production deploys serialize (`concurrency` groups; advisory locks in-database).
* The `deploy` job runs against the GitHub `Production` environment — the owner can add required reviewers there for a human promotion gate (recommended; see §11).

## 10. Health OS production runtime — MISSING (by design, decision pending)

Health OS is a governed sector OS: its backend (NestJS, long-running, queues) requires a container host (Fly/Render/Railway/Cloud Run — see `HEALTH_OS_DEPLOYMENT_TOPOLOGY.md`); its frontend is a Vite SPA deployable as a second Vercel project with edge rewrites to that backend. **No container host is provisioned** and the second Vercel project was never created (no Vercel credentials in-band). The Phase 7 identity federation is fully implemented and CI-certified against real stacks, but its PRODUCTION cross-OS verification is blocked until the Health runtime exists. Health schema deployment to production is intentionally NOT part of `db-release.yml` until that decision is made (one database vs. two, and which host) — REQUIRES_HUMAN_APPROVAL.

## 11. Blocker register (owner actions to reach PRODUCTION_CERTIFIED)

| ID | Blocker | Required action | Impact |
| --- | --- | --- | --- |
| X-1 | `BEYU_ADMIN_DATABASE_URL` secret missing | owner adds Supabase admin DSN as a repository secret | GitHub→Supabase deploy cannot execute (fails closed) |
| X-2 | `BEYU_RUNTIME_DB_PASSWORD` secret missing | owner adds runtime-role password secret | runtime role cannot be provisioned by pipeline |
| X-3 | Vercel production env incomplete (`/api/health` → `database: DOWN`) | owner sets `DATABASE_URL` (+ `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `BEYU_BOOTSTRAP_PASSWORD`, `BEYU_INTERNAL_SERVICE_TOKEN`) in Vercel Production | runtime-verify gate red; Vercel↔Supabase broken at runtime |
| X-4 | Branch protection / required checks unverifiable from the bot token | owner marks ci.yml + db-release.yml checks required for `main`, adds reviewers to the `Production` environment | merge gating is currently convention, not enforcement |
| X-5 | Health OS backend host not provisioned | owner selects/provisions container host + second Vercel project | Phase 14–17 production cross-OS certification blocked |
| X-6 | Backup/PITR restore never tested | owner runs (and documents) a restore drill | DR certification NOT_ATTEMPTED |
| X-7 | PR #22 (Phase 7) not merged | after X-1..X-4: dispatch pre-deploy, then merge | production app still runs pre-Phase-7 code |

## 12. Verification evidence for this pipeline (2026-09-03)

Functional, against real local PostgreSQL 16:

* clean install of 19 migrations → fingerprint `1e5cca74ebd39999c3b1a5df7ec8dc06` (deterministic across databases);
* preflight: empty DB ok (2 destructive-shaped historical migrations reported, informational); applied DB ok (0 pending);
* tamper tests: modified checksum → FAIL; unexpected migration → FAIL; rogue table → fingerprint drift FAIL;
* destructive gate: pending `TRUNCATE`/`DROP TABLE` against existing schema → FAIL without approval, PASS with `--allow-destructive`;
* unreachable database → exit 2 (distinct from check failure);
* verify: 20 RLS-enabled tables, 20 policies, `beyu_runtime` constrained, zero runtime-owned objects, fingerprint equality vs scratch install;
* full steady-state pipeline simulation (preflight → idempotent apply → role provisioning → verify) → PASS;
* workflow YAML parsed; job graph/conditions audited; CI run on PR #22 exercises `preflight-repo` on GitHub-hosted runners.
