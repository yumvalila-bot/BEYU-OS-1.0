# BEYU Health OS backend — governed deployment contract

> **Status:** NOT DEPLOYED. No hosting target, hostname, production database or
> production secret exists for the Health backend. This document authorizes
> nothing. It defines what a human-authorized deployment must satisfy.
> Supersedes `sectors/health/docs/DEPLOYMENT_GUIDE.md`, a legacy generic guide
> (TypeORM/Kubernetes) that does not describe this codebase.

## 1. Canonical components (single instances — do not duplicate)

| Component | Canonical location |
|---|---|
| Frontend | `sectors/health` (Vite/React SPA). Embedded into the BEYU root build by `scripts/build-health-spa.mjs` and served only at `/os/health` (alias `/health/os`) behind the BEYU gates: session → tenant domain → active identity link. |
| Backend | `sectors/health/backend` (NestJS 10) — this package. |
| Registry entry | `src/lib/operating-system-catalog.ts`, code `HEALTH`, href `/os/health`. |
| Root authorization gate | `src/lib/health-os-authorization.ts`. Only an **active** `beyu_identity.beyu_identity_links` row authorizes. |
| Identity authority | BEYU OS, `POST /api/v1/internal/identity/{register,lookup}`. |
| Migrations | `database/migrations/001–032`, applied only by `src/database/migration-runner.ts`. |

Request path once deployed:

```
Browser → BEYU /os/health (root gates) → embedded SPA
        → same-origin /health-os/auth/*  → BEYU Next.js rewrite (HEALTH_API_URL, build time)
        → Health backend /auth/*          → Health database
Health backend → BEYU /api/v1/internal/identity/{register,lookup} (HS256 service token)
```

The backend is a long-running NestJS server. It is **not** a Vercel
function. Host it on a container platform, using the `Dockerfile` in this
directory.

## 2. Build and run

| Step | Command |
|---|---|
| Build the image | `docker build -t beyu-health-backend sectors/health/backend` |
| Serve | image default: `node dist/main`. Runs as the `node` user, listens on `PORT` (default 3000). |
| Liveness | `GET /health/live` → 200 whenever the process is alive. |
| Readiness | `GET /health/ready` → 200 only when all of these hold: the DB is reachable; the ledger holds **every** committed migration with matching checksums and nothing unknown (`ledger_fingerprint == expected_fingerprint`); critical config is present. Otherwise 503 with a reason code (`LEDGER_ABSENT`, `MIGRATIONS_PENDING`, `CHECKSUM_DRIFT`, `CHECKSUM_MISSING`, `LEDGER_AHEAD_OF_SOURCE`, `LEDGER_FOREIGN`, `MIGRATION_SOURCE_UNAVAILABLE`). |
| Migration status (read-only) | `docker run --rm -e DATABASE_URL=<migration DSN> <image> node dist/database/migration-runner.js status` |
| Migration apply | `… node dist/database/migration-runner.js up`. This is a **separate, human-authorized release step** and never runs at start-up. |
| Post-deploy probe (read-only) | `node scripts/verify-deployment.mjs --backend https://<health-host> --beyu https://<beyu-host>` |

Committed-source fingerprint for 001–032:
`01d7618f85e852c7ed792602ff3c24680941605e2b08d302ead9e8d465de7994`.
Recompute it with `node dist/database/migration-runner.js status` or with the probe.

## 3. Environment contract (production)

The process refuses to boot if a **required** value is missing or insecure.
Three validators enforce this (`src/main.ts`, `src/common/config/production-boot.guard.ts`,
`src/common/security/boot-validation.ts`), plus `MfaService` at construction.

| Variable | Required | Secret | Rule |
|---|---|---|---|
| `NODE_ENV` | yes | no | `production` |
| `DATABASE_URL` | yes | **yes** | Runtime-role DSN. Non-local hosts are TLS-verified (`rejectUnauthorized`); `sslmode=disable`/`ssl=false` is refused. No `DB_*` fallback in production. |
| `JWT_SECRET` | yes | **yes** | ≥32 chars, random, not a default |
| `JWT_REFRESH_SECRET` | yes | **yes** | random, not a default |
| `REFRESH_TOKEN_SECRET` | yes | **yes** | ≥32 chars, random |
| `CSRF_SECRET` | yes | **yes** | ≥32 chars, random |
| `JWT_ISSUER`, `JWT_AUDIENCE` | yes | no | explicit, non-default |
| `COOKIE_SECURE` | yes | no | `true` |
| `CORS_ORIGIN` | yes | no | explicit allow-list; no `*`, no localhost |
| `ENCRYPTION_KEY` | yes | **yes** | random |
| `MFA_ENCRYPTION_KEY` | yes | **yes** | exactly 64 hex chars |
| `BEYU_IDENTITY_ENDPOINT` | yes | no | BEYU **base** URL (https) |
| `BEYU_IDENTITY_TOKEN` | yes | **yes** | must **equal** BEYU's `BEYU_INTERNAL_SERVICE_TOKEN` |
| `QUEUE_BACKEND` | yes | no | `redis` (`memory` is refused) |
| `REDIS_URL` (or `REDIS_HOST`) | yes | **yes** if it embeds credentials | |
| `PORT` | no | no | default 3000 |
| `BEYU_IDENTITY_STATUS_TTL_MS` / `…_MAX_STALE_MS` | no | no | defaults 30 s / 300 s; caps 300 s / 900 s |
| `DB_SKIP_RLS_CHECK`, `BEYU_HCM_BYPASS_FOR_TEST`, `BEYU_IDENTITY_TEST_HARNESS` | **must be unset** | — | boot refuses them |

On the BEYU root (Vercel) deployment:

| Variable | Rule |
|---|---|
| `HEALTH_API_URL` | `https://<health-host>`, no trailing slash. Read at **build** time by `next.config.ts`, so a redeploy is required after setting it. Without it, `/health-os/auth/*` returns 404 and Health sign-in fails closed. This is the current production state. |
| `BEYU_INTERNAL_SERVICE_TOKEN` | ≥32 chars. The same value as the Health `BEYU_IDENTITY_TOKEN`. |

Secrets inventory (Health side, 9–10 values): `DATABASE_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `REFRESH_TOKEN_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`,
`MFA_ENCRYPTION_KEY`, `BEYU_IDENTITY_TOKEN` (shared with BEYU), `REDIS_URL`,
plus the separate privileged **migration** DSN used only by the release step.
None of these exist in the repository, and none may be committed.

## 4. Hostname

None is provisioned. `health.beyuos.co.tz`, `beyuos.co.tz`, `api.health.*` and
`health-api.*` do not resolve (checked 2026-09-28). Choosing a hostname and a
TLS certificate is a human action. The host must serve HTTPS only.

## 5. Database contract

- PostgreSQL 16. Migrations 001–032 are applied **only** through the governed
  runner. Never use `drizzle-kit push`, and never hand-run DDL.
- Ledger: `beyu_migrations` in the connection's current schema, with columns
  `id, checksum, owner='health', sector='HEALTH_OS', mode, provenance`.
- Roles:
  - **Migration channel** (release step only): owns the schema. It needs `CREATEROLE`
    (or equivalent) because 032 creates `beyu_health_federation_read`. It is never
    the runtime DSN.
  - **Runtime** (`DATABASE_URL`): `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE`.
    Readiness needs `SELECT` on the ledger. The application grants it needs are
    **not** defined by any migration yet (open item L-2).
  - `beyu_health_federation_read`: `NOLOGIN`, no members (032).

### Topology is an open human decision (T-1 / T-2), and both options are blocked today

| Option | What breaks with the current code |
|---|---|
| **Shared** canonical BEYU database | **T-2 ledger collision.** The root migrator's `public.beyu_migrations` (`version, checksum NOT NULL, mode NOT NULL, description`) has the same name as the Health ledger. The unmodified Health runner would `ALTER` the root ledger before failing; this was reproduced on PostgreSQL 16. The runner now refuses (`ForeignLedgerError`) before any statement. Deciding where the Health ledger lives is required. Separately, the BEYU runtime role would need `SELECT` on `beyu_identity.beyu_identity_links`, and no root migration grants it. |
| **Separate** Health database | The root gate reads `beyu_identity.beyu_identity_links` through **BEYU's** `DATABASE_URL`, so with a separate DB it always returns `AUTHORIZATION_SERVICE_UNAVAILABLE` (fail closed) and nobody is authorized. A governed cross-DB read path would be needed (for example the 032 federation role plus a new, reviewed interface). |

`docs/security/IDENTITY_FEDERATION.md` (separate DB) and
`docs/architecture/HEALTH_SECTOR_INTEGRATION_DESIGN.md` (canonical DB)
contradict each other. Resolving that is a governance decision, not a code fix.

## 6. Federation contract (existing; nothing here activates it)

- Health → BEYU: `POST {BEYU_IDENTITY_ENDPOINT}/api/v1/internal/identity/register` and `/lookup`.
- Token: HS256 JWT signed with `BEYU_IDENTITY_TOKEN`. Claims: `iss=HEALTH_OS`,
  `aud=BEYU_OS`, `sub=service:HEALTH_OS`, `iat`, `exp` (Health issues 60 s;
  BEYU rejects >300 s), `jti`.
- BEYU verifies these against `BEYU_INTERNAL_SERVICE_TOKEN`, an issuer allowlist,
  and the `service_principals` row `HEALTH_OS` (must be `ACTIVE`).
- Revocation: a link's `status` moves to `revoked`/`expired` (031). **Both** the
  Health bridge and the root gate deny non-active links.
- Status cache: TTL 30 s, maximum staleness 300 s (capped).

## 7. Rollback

- Application: redeploy the previous image. Readiness reports
  `LEDGER_AHEAD_OF_SOURCE` if the database is newer than the image. That is
  intentional: it fails closed until a human decides.
- Schema: `migration-runner.js down [N]` via the migration channel, by human
  authorization only, after a verified backup.
- Proxy: unset `HEALTH_API_URL` and redeploy BEYU. `/health-os/auth/*` then
  returns 404 and sign-in fails closed.

## 8. Human actions required, in order

1. Decide the database topology (T-1) and the Health ledger location (T-2).
2. Author and review migration 033+ for runtime grants (L-2) and for
   column-level restriction of the 032 federation role, which can currently read
   `users.password_hash` (L-1). Never edit 032.
3. Choose and authorize a container host, hostname and TLS.
4. Provision the Health PostgreSQL database, the migration role and the runtime role.
5. Generate secrets in the host's secret store (§3). Set BEYU
   `BEYU_INTERNAL_SERVICE_TOKEN` and Health `BEYU_IDENTITY_TOKEN` to the same value.
6. Run `migration-runner.js status`, then `up`, through the governed release process.
7. Deploy the image, then run `scripts/verify-deployment.mjs --backend …`.
8. Set `HEALTH_API_URL` on BEYU, redeploy, and re-run the probe with `--beyu …`.
9. Identity registration, linking, tenant binding and federation activation
   are **Phase 9**. Each needs explicit per-item human authorization.
