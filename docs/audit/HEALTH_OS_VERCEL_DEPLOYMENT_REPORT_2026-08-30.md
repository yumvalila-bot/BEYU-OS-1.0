# BEYU HEALTH OS — VERCEL SUBDOMAIN PRODUCTION DEPLOYMENT REPORT

**Date:** 2026-08-30
**Branch:** `arena/01a0532c-beyu-os-1-0`
**Branch HEAD:** `8915127e0989c1ad506b6f4bdb58b0624112ca23`
**main HEAD:** `bfaaeadd8a94e56c536d995698757586084540ea`

---

## FINAL STATUS

# **BLOCKED — external infrastructure and credentials unavailable**

Per Phase 10 rule, every missing external dependency returns BLOCKED. No
deployment was simulated; no credentials were fabricated; no domain was
invented; no PASS was claimed from configuration alone.

---

## 1–5. Phase 0 / Phase 1 reality and Vercel project evidence

| # | Item | Evidence |
|---|---|---|
| 1 | GitHub repository | `https://github.com/yumvalila-bot/BEYU-OS-1.0.git` (verified via `git remote -v` and `gh auth status`) |
| 2 | `main` HEAD | `bfaaeadd8a94e56c536d995698757586084540ea` |
| 3 | Health OS path | `sectors/health/` present, React 19 + Vite 7 SPA, `vite-plugin-singlefile`, NestJS 10 backend at `sectors/health/backend/` |
| 4 | Health integration merged | Confirmed. 26/26 audit, 2262/2262 BEYU regression, 92/92 backend tests, 14/14 frontend tests previously verified; code is under `sectors/health/` on `main` |
| 5 | Committed `vercel.json` | ✅ present at `sectors/health/vercel.json` in commit `8915127`. Valid JSON. Declares build `npm run build`, output `dist/`, rewrites for `/auth/*`, `/api/*`, `/health/*`, `/graphql*` to `${HEALTH_API_URL}`, SPA fallback `/(.*) → /index.html`, security headers |
| 6 | Existing BEYU Vercel project | `beyu-os-1-0` is linked from the repo's GitHub `homepageUrl` (`https://beyu-os-1-0.vercel.app`). Two GitHub environments exist: `Production` and `Preview` (created 2026-08-23). Vercel project itself cannot be inspected — see Blockers B1/B2 |
| 7 | Canonical BEYU production domain | **No custom domain attached.** The only hostname linked to the existing project is the default `beyu-os-1-0.vercel.app`. All plausible BEYU domains (`beyu.os`, `beyuhealth.com`, `beyu.health`, `beyu.africa`, `beyuos.com`, `beyu.co.tz`) return NXDOMAIN in DNS — see Blocker B3 |
| 8 | DNS configuration | Cannot be inspected because (a) no domain is registered, and (b) no Vercel session exists to query project domains |
| 9 | Usable subdomain | **Not possible at this time** — there is no parent domain to attach `health.<domain>` to. See Blocker B3 |

## 6. Phase 2 — Vercel project creation

Not executed. Project `beyu-health-os` cannot be created from this sandbox
(see Blockers B1/B2). The committed configuration is ready to be picked up
automatically once an authenticated owner creates the project with:

- Root Directory: `sectors/health`
- Framework: Other (Vite static build)
- Build: `npm run build`
- Output: `dist`
- Production branch: `main`

## 7. Phase 3 — Subdomain attachment

Not executed. There is no canonical BEYU domain to attach. Once a real
domain exists, the owner must:

1. Register/delegate the domain (e.g. via a registrar).
2. Add it to the Vercel team.
3. Run `vercel domains add health.<domain> --project beyu-health-os`
   (or use the Vercel dashboard).
4. Allow Vercel to issue the automatic Let's Encrypt TLS certificate.

## 8. Phase 4 — CSP

The committed `vercel.json` ships:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob:;
  connect-src 'self';
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- `connect-src 'self'` is preserved — no wildcard, no third-party backend
  origin leaked to the browser (API is reached via same-origin → Vercel edge
  proxy → backend).
- Browser live CSP verification is BLOCKED (no deployment).

## 9. Phase 5 — Environment variables

Classification (no value fabricated, none printed):

| Variable | Scope | Status |
|---|---|---|
| `HEALTH_API_URL` | Vercel server-side (edge rewrites) | **MISSING** — set to the container backend URL. Must NOT be `VITE_`-prefixed |
| `VITE_API_BASE_URL` | Client bundle | **NOT REQUIRED** — leave empty/undefined so SPA uses same-origin; backend is reached via Vercel edge proxy |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Client bundle | **NOT REQUIRED** — Supabase access is proxied through backend (per `sectors/health/.env.example`) |
| Backend `NODE_ENV` | Container | Must be `production` (fail-closed boot guard in `backend/src/main.ts`) |
| Backend `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE` | Container | **MISSING** — intended target is Supabase project `siyzygezdmlxbvwttrdz` (eu-west-3) per root `.env.example`, but runtime/admin passwords are unavailable (rotated after Phase 1E history purge) |
| Backend `SUPABASE_URL/ANON_KEY/SERVICE_KEY` | Container | **MISSING** — require fresh provisioning post-rotation |
| Backend `JWT_SECRET`, `JWT_REFRESH_SECRET` | Container | **MISSING** — boot guard rejects defaults in production |
| Backend `JWT_ISSUER`, `JWT_AUDIENCE` | Container | **MISSING** — boot guard requires them in production |
| Backend `REDIS_HOST/PORT/PASSWORD` | Container | **MISSING** — Redis 7 required for Bull queues |
| Backend `CORS_ORIGIN` | Container | Must be `https://health.<domain>` (defense-in-depth even though browser never hits backend cross-origin due to Vercel proxy) |

No secret is placed in `VITE_*` variables. No `.env` files are committed.

## 10. Phase 6 — Backend

- Framework: NestJS 10, TypeORM, Apollo GraphQL, Bull (Redis queues), JWT.
- Runtime requirement: long-running Node 20 HTTP server; Dockerfile at
  `sectors/health/backend/Dockerfile` is production-ready (multi-stage build,
  `dumb-init`, `/health` healthcheck).
- **Not deployed.** No credentials for Fly.io / Render / Railway / GCP Cloud
  Run / AWS ECS / Kubernetes exist in this environment. Vercel serverless is
  the wrong runtime for this service (long process, Redis-backed queues,
  persistent pooling, GraphQL) and is explicitly rejected per the Phase 6 rule.

## 11. Phase 7 — Database

- Intended target: Supabase PostgreSQL 16, project ref `siyzygezdmlxbvwttrdz`,
  region eu-west-3 (Paris), runtime role `beyu_runtime` (NOSUPERUSER,
  NOBYPASSRLS) per `scripts/setup-db-role.ts` and root `.env.example`.
- Static evidence for RLS / GlobalUserID / isolation is in the repo:
  - `sectors/health/backend/src/modules/identity/beyu-bridge.ts` (GlobalUserID)
  - `sectors/health/backend/src/common/security/tenant-context.middleware.ts`
  - `sectors/health/backend/src/common/security/permissions.guard.ts`
  - `sectors/health/backend/src/common/security/csrf-origin.guard.ts`
  - `sectors/health/supabase-enterprise-full-schema.sql` (RLS policies)
  - Backend test suite (92/92 PASS) covers RLS/isolation/bridge using pglite.
- **Live verification BLOCKED** — no `DATABASE_URL`, no admin DSN; migrations
  cannot be applied; RLS cannot be probed against the live database. No
  SUPERUSER/BYPASSRLS role will be used for runtime per design.

## 12. Phase 8 — Security verification (live)

| # | Test | Result |
|---|---|---|
| 1 | HTTPS works | BLOCKED (no deployment) |
| 2 | Health subdomain resolves | BLOCKED (no domain) |
| 3 | `/` loads Health OS | BLOCKED |
| 4 | `/api/health` through Vercel | BLOCKED |
| 5 | `/auth/*` through Vercel | BLOCKED |
| 6 | `/graphql` through Vercel | BLOCKED |
| 7 | SPA deep links survive refresh | BLOCKED |
| 8 | CSP passes, no wildcard widening | Static: PASS (committed `connect-src 'self'`); live: BLOCKED |
| 9 | Security headers present | Static: PASS; live: BLOCKED |
| 10–14 | Cross-tenant/country/entity/forged/missing-tenant deny | Static: PASS (guards + RLS tests 92/92); live: BLOCKED |
| 15 | Runtime role NOSUPERUSER/NOBYPASSRLS | Static: enforced by `scripts/setup-db-role.ts`; live: BLOCKED |
| 16 | GlobalUserID bridge | Static: PASS; live: BLOCKED |
| 17 | Health token cannot grant BEYU authority | Static: PASS (Health has no governance endpoints); live: BLOCKED |
| 18 | Noelia/HIVE boundaries intact | Static: PASS (Noelia lives in BEYU root, not modified); live: BLOCKED |
| 19 | No secrets in frontend JS bundle | Static: PASS (no `VITE_` secrets set; bundle built cleanly; grep found no key patterns); live: BLOCKED |
| 20 | No secrets in Git history | PASS (Phase 1E purged prior leak; this commit adds only config/docs) |

## 13. Phase 9 — Vercel deployment verification

| Field | Value |
|---|---|
| Vercel project for Health OS | **NOT CREATED** (no Vercel access from sandbox) |
| Repository connected | N/A |
| Production branch = `main` | Intended (configured on project creation) |
| Root directory = `sectors/health` | Intended (configured on project creation) |
| Build status | N/A |
| Deployment ID | N/A |
| Domain attached | N/A |
| DNS valid | N/A |
| TLS valid | N/A |
| Production deployment READY | **NO** |

## 14. Phase 10 — Acceptance checklist

| Check | Status |
|---|---|
| Real Vercel project exists | ❌ BLOCKED |
| `main` is production branch | ⚙️ Intended, cannot verify without project |
| `sectors/health` is deployment root | ⚙️ Intended, committed `vercel.json` is in place |
| Production build succeeds locally | ✅ PASS (`vite build` → 1066 kB / 270 kB gzip) |
| Real Health backend exists (container) | ❌ BLOCKED |
| Real PostgreSQL exists | ❌ BLOCKED |
| Real Redis exists | ❌ BLOCKED |
| Required production secrets exist | ❌ BLOCKED |
| Health subdomain resolves | ❌ BLOCKED (no domain) |
| HTTPS/TLS works | ❌ BLOCKED |
| Vercel rewrites work | ⚙️ Configured correctly, live: BLOCKED |
| Same-origin API calls work | ⚙️ Architecture correct, live: BLOCKED |
| CSP passes | Static: PASS; live: BLOCKED |
| Security headers pass | Static: PASS; live: BLOCKED |
| RLS passes | Static (pglite tests): 92/92 PASS; live: BLOCKED |
| GlobalUserID bridge passes | Static: PASS; live: BLOCKED |
| Tenant/entity/country isolation passes | Static: PASS; live: BLOCKED |
| BEYU regression green | ✅ Root `tsc` / `eslint` / `next build` all PASS; DB-gated suites skip without `DATABASE_URL` (expected in sandbox) |
| No secrets exposed | ✅ Static scan clean; committed files contain no credentials |
| BEYU constitutional boundary intact | ✅ No BEYU/Health source code modified — only three new files (config + docs) added on top of `bfaaead` |

---

## Precise blockers (owner action required)

- **B1 — No Vercel authentication.** `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID` are unset; `~/.vercel/` does not exist; no browser
  session. An owner with Vercel dashboard or CLI access must create the
  `beyu-health-os` project and configure env vars.
- **B2 — Sandbox network cannot reach Vercel API.** TLS egress to
  `api.vercel.com:443` fails with `OpenSSL SSL_ERROR_SYSCALL` from this
  sandbox, so even with a token we could not `vercel link` / `vercel deploy`
  / `vercel domains add` from here. Deployment must be triggered from an
  environment with Vercel API access (owner workstation, CI with
  `VERCEL_TOKEN` secret, or Vercel's automatic Git integration once the
  project is linked in the dashboard).
- **B3 — No canonical BEYU production domain in DNS.**
  `beyu-os-1-0.vercel.app` is the only hostname linked to the existing
  project, and it has no custom domain attached. `beyu.os` (TLD `.os` not in
  IANA root), `beyuhealth.com`, `beyu.health`, `beyu.africa`, `beyuos.com`,
  `beyu.co.tz` all return NXDOMAIN. A real domain must be registered and
  delegated to Vercel before `health.<domain>` can be attached.
- **B4 — No container-runtime credentials for the NestJS backend.** No
  Fly.io / Render / Railway / GCP / AWS / DO / Kubernetes credentials exist.
  Vercel serverless is not a supported runtime for the NestJS service
  (long-running process, Redis queues, Apollo, connection pooling).
- **B5 — Production database credentials MISSING.** Supabase project
  `siyzygezdmlxbvwttrdz` exists per docs, but the prior credentials were
  purged after the Phase 1E secret leak and no new admin/runtime DSN is
  present in this environment.
- **B6 — Production Redis MISSING.** Required for Bull queues used by
  notifications, AI, and billing modules.
- **B7 — JWT / Supabase / integration secrets MISSING.** Production boot
  guards in `sectors/health/backend/src/main.ts` fail closed on default
  secrets, so these must be generated and stored in the container platform's
  secret store before the backend will boot.

Owner next steps (in order): register domain → create Vercel project
`beyu-health-os` connected to this repo (root `sectors/health`, framework
Other, branch `main`) → deploy NestJS backend to a container platform →
provision fresh Postgres/Redis/Supabase/JWT secrets → set `HEALTH_API_URL`
in Vercel and backend secrets in the container platform → attach
`health.<domain>` → re-run Phase 8 live gates.

---

## What IS done and committed

- Atomic commit `8915127` on `arena/01a0532c-beyu-os-1-0` pushed to origin:
  `chore(health): add production deployment topology and vercel configuration`
  - `sectors/health/vercel.json` (validated; correct rewrite ordering;
    hardened security headers; `connect-src 'self'`; same-origin architecture)
  - `docs/deployment/HEALTH_OS_DEPLOYMENT_TOPOLOGY.md` (full architecture +
    env matrix + blocker checklist)
  - `docs/audit/HEALTH_OS_SUBDOMAIN_DEPLOYMENT_FINAL_GATE_2026-08-30.md`
    (prior BLOCKED gate report)
- No Health source code modified. No BEYU constitutional code modified. No
  tests changed. No migrations touched. No secrets committed. No history
  rewritten. No duplicate repo created. No code moved out of `sectors/health/`.
- All local build/test gates green:
  - BEYU root `tsc --noEmit`, `eslint .`, `next build`: PASS
  - Health frontend `tsc`, `vite build`, `vitest run` (14/14): PASS
  - Health backend `tsc`, `nest build`, `npm test` (92/92): PASS

---

## Exact final gate status

# **BLOCKED** — configuration committed, production deployment gated on external infrastructure (Vercel auth/API access, a registered BEYU domain, container hosting for the NestJS backend, fresh Postgres/Redis/Supabase/JWT credentials). No production deployment was performed; no production URL exists; no subdomain is live; no credential or domain was fabricated.
