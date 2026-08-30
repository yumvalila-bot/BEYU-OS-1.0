# Health OS — Production Subdomain Deployment Topology

**Date:** 2026-08-30
**Branch:** `arena/01a0532c-beyu-os-1-0`
**Commit baseline:** `bfaaeadd8a94e56c536d995698757586084540ea` (HEAD of `main`)

---

## 1. Reality Audit Findings (Phase 0)

| Item | Finding |
|---|---|
| Current HEAD | `bfaaead` (Merge PR #16) |
| Health OS location | `sectors/health/` (integrated, monorepo) |
| Health frontend | React 19 + Vite 7 + `vite-plugin-singlefile` → static SPA (single `index.html` with all JS/CSS inlined) |
| Health backend | NestJS 10 + TypeORM + Apollo GraphQL + Bull (Redis queues) + JWT auth |
| Health backend runtime | Node.js 20 long-running HTTP server (Dockerfile provided) |
| BEYU main app | Next.js 16 (App Router), currently deployed on Vercel as `beyu-os-1-0.vercel.app` |
| Existing `vercel.json` | None at repo root; none in `sectors/health/` (now added, see below) |
| Vercel CLI / credentials | **NOT AVAILABLE** in this environment — `~/.vercel/` absent; `VERCEL_TOKEN` unset; TLS egress to `api.vercel.com:443` is blocked from this sandbox |
| Production domain | **NOT PROVISIONED** — `beyu.os`, `beyuhealth.com`, `beyu.health` do not resolve in DNS; no custom domain attached to the existing `beyu-os-1-0` Vercel project |
| Production DB credentials | **NOT AVAILABLE** — `DATABASE_URL`, Supabase pooler credentials, Redis credentials all MISSING (the `.env.example` references `siyzygezdmlxbvwttrdz` Supabase project but no password is present) |
| Redis (required by Bull queues) | **NOT PROVISIONED** for production |
| Health backend on Vercel? | **NOT SUITABLE AS-IS** — NestJS long-running process, Redis (Bull) dependency, WebSocket/Server-Sent-Events potential, connection pooling: Vercel's serverless function model is stateless, max-duration capped, no persistent Redis. Container hosting is required (Fly.io, Render, Railway, Google Cloud Run, AWS ECS, Kubernetes). |

---

## 2. Deployment Architecture (Phase 1) — APPROVED DESIGN

The Health frontend is served from Vercel as a static SPA. The NestJS backend runs on a container platform (Vercel serverless is unsuitable — see §1). Vercel's **edge reverse-proxy** rewrites `/auth/*`, `/api/*`, `/health/*`, and `/graphql*` to the backend at the container origin, mirroring the Vite dev-server proxy (`sectors/health/vite.config.ts`) in production. The browser therefore sees a **single origin** (`https://health.<domain>`) for both static assets and API calls, which:

- Eliminates CORS preflight on every request.
- Allows the refresh-token cookie to remain `SameSite=Lax/Strict` without cross-origin friction.
- Keeps `connect-src 'self'` in the CSP (no wildcard third-party origins exposed to the browser).
- Lets the backend URL be rotated without rebuilding or redeploying the SPA bundle.

```
   Browser (user agent)
        │  HTTPS
        ▼
   ┌─────────────────────────────────────────┐
   │             DNS (BEYU domain)          │
   │   health.<beyu-domain>  CNAME → .vercel.app │
   └──────────────────┬──────────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────────────────────┐
   │  VERCEL — separate Vercel project (Option A)        │
   │  ──────────────────────────────────────────────     │
   │  Root Directory: sectors/health                     │
   │  Framework Preset: Other (Vite static build)        │
   │  Build: npm ci && npm run build                     │
   │  Output: dist/  (single-file index.html)            │
   │                                                      │
   │  SERVER-SIDE ENV VAR (encrypted, NOT exposed to     │
   │  the browser bundle):                               │
   │    HEALTH_API_URL = https://api.health.<dom>        │
   │                                                      │
   │  EDGE REWRITES (vercel.json):                       │
   │    /auth/:path*    → ${HEALTH_API_URL}/auth/:path*  │
   │    /api/:path*     → ${HEALTH_API_URL}/api/:path*   │
   │    /health/:path*  → ${HEALTH_API_URL}/health/:path*│
   │    /graphql:path*  → ${HEALTH_API_URL}/graphql:path*│
   │    /(.*)           → /index.html  (SPA fallback)    │
   │                                                      │
   │  CLIENT-BUNDLE ENV VAR:                              │
   │    VITE_API_BASE_URL = ""  (empty → same-origin)   │
   └──────────────────────┬───────────────────────────────┘
     static (index.html)  │  server-to-server HTTPS (Vercel → backend)
      ◀──────────────────┘  (auth/api/health/graphql paths)
                           ▼
┌────────────────────────────────────────────────────────────────┐
│   HEALTH API RUNTIME  —  container platform (NOT Vercel)      │
│   ─────────────────────────────────────────────────────       │
│   Candidates (ordered by operational simplicity):             │
│     1. Fly.io / Render / Railway  (Dockerfile-deploy)        │
│     2. Google Cloud Run                                      │
│     3. AWS ECS Fargate / Kubernetes                          │
│                                                                │
│   Runtime:  node dist/main  (NestJS, HTTP port 3000)          │
│   Persistent deps:                                            │
│     - PostgreSQL 16  (Supabase pooler siyzygezdmlxbvwttrdz    │
│       or dedicated instance)                                  │
│     - Redis 7  (Bull queues for AI/notifications/billing)    │
│                                                                │
│   ENV VARS (production secrets — store in platform secret mgr):│
│     NODE_ENV=production                                       │
│     PORT=3000                                                  │
│     DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE       │
│     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY     │
│     JWT_SECRET (≥32 random chars)                             │
│     JWT_REFRESH_SECRET (≥32 random chars)                     │
│     JWT_ISSUER=https://health.<beyu-domain>                   │
│     JWT_AUDIENCE=beyu-health-os                               │
│     REDIS_HOST/REDIS_PORT/REDIS_PASSWORD                      │
│     CORS_ORIGIN=https://health.<beyu-domain>  (fail-closed;   │
│       code rejects "*" / localhost in production — because    │
│       the Vercel edge proxies API calls, the browser never   │
│       hits the backend cross-origin, but the allow-list is    │
│       still pinned to the frontend origin as defense in depth)│
│                                                                │
│   EXPOSES: /auth/*, /api/supabase/*, /health/live,           │
│            /health/ready, /graphql (playground DISABLED in    │
│            production), /api/docs (Swagger — gate in prod)    │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │  POSTGRESQL 16 (Supabase)        │
            │  - RLS enabled, fail-closed       │
            │  - beyu_runtime role (NOSUPERUSER│
            │    NOBYPASSRLS NOCREATEROLE)      │
            │  - GlobalUserID bridge enforced  │
            │  - tenant/entity/country RLS on  │
            │    every sector table             │
            │  - Migrations managed by BEYU     │
            │    governance (never by Health    │
            │    unilaterally)                  │
            └──────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │   REDIS 7  (Bull queues)          │
            └──────────────────────────────────┘
```

### Constitutional placement preserved

- **BEYU OS** remains the constitutional control plane (Vercel project `beyu-os-1-0` at `<root>`).
- **Health OS** is a Sector OS — it executes healthcare operations; it does NOT own identity, auth, governance, audit or policy.
- **Identity bridge** — `GlobalUserID` is the canonical cross-OS identifier; Health accepts tokens issued by the shared identity layer and never mints its own constitutional identities.
- **Governance boundary** — Noelia/HIVE decisions, policy voting, constitution articles live in BEYU OS only. Health calls governed endpoints, it does not host competing policy engines.

---

## 3. Vercel Project Configuration (Phase 2) — Option A (separate project)

**Chosen:** Option A — a second Vercel project connected to the **same** GitHub repository (`yumvalila-bot/BEYU-OS-1.0`) with **Root Directory** set to `sectors/health`.

Rationale:
- Zero changes to the existing `beyu-os-1-0` Vercel project (BEYU main app remains untouched).
- No rewrites/redirects at the BEYU edge that could accidentally route production traffic.
- Independent deploy cadence for the Health frontend, still pinned to `main`.
- Vercel's monorepo support handles the install (it runs `npm ci` in the root-directory scope).

**Vercel dashboard settings (to be applied by an owner with Vercel access):**

| Setting | Value |
|---|---|
| Project name | `beyu-health-os` (suggested) |
| Framework Preset | Vite (or "Other" if preset fails; output is static) |
| Root Directory | `sectors/health` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node Version | 20.x |
| Default branch | `main` |
| Production env var `HEALTH_API_URL` (server-side) | `https://api.health.<ACTUAL_BEYU_DOMAIN>` — referenced by `vercel.json` rewrites; NOT prefixed `VITE_` so it is **never** inlined into the browser bundle. Set in Vercel project settings as an Environment Variable (Production + Preview). |
| Production env var `VITE_API_BASE_URL` (client) | Leave **empty** (or unset). The SPA treats an empty base as same-origin; API calls hit the Vercel edge which proxies them to the backend via `HEALTH_API_URL`. No cross-origin fetches are made from the browser. |

**Committed config:** `sectors/health/vercel.json` — reverse-proxies `/auth/*`, `/api/*`, `/health/*`, `/graphql*` to the container backend via the server-side `HEALTH_API_URL` env var (browser never sees the backend origin), and falls all other paths back to `/index.html` (SPA). Applies hardening headers consistent with BEYU main's `next.config.ts` (CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, nosniff).

---

## 4. Subdomain (Phase 3) — BLOCKED ON DOMAIN OWNERSHIP

Per the Phase 3 rule: **DO NOT invent the domain.**

- `beyu.os` — not resolvable in public DNS; TLD `.os` does not exist in IANA root zone at time of audit.
- `beyuhealth.com` — referenced in `noreply@beyuhealth.com` default SMTP sender but not resolvable in DNS.
- `beyu.health` — referenced in `brand@beyu.health`/`privacy@beyu.health` in fixture content but not resolvable in DNS.
- Existing Vercel project `beyu-os-1-0` has **no custom domain** attached (homepageUrl is the default `*.vercel.app` host).

**Blocker:** No BEYU-owned domain is verifiable. Until the owner provisions a real domain (e.g. `beyu.africa`, `beyuos.com`, or similar), adds it to the Vercel team, and configures the `health` subdomain CNAME, this phase cannot be executed.

Required Vercel CLI command (to be run by an authenticated owner after domain exists):
```
vercel domains add health.<ACTUAL_BEYU_DOMAIN> --project beyu-health-os --scope <vercel-team>
```

---

## 5. Production Environment Variables (Phase 4) — Classification

### Health Frontend (Vercel)

| Variable | Classification | Notes |
|---|---|---|
| `HEALTH_API_URL` (server-side only) | **MISSING** | Set to `https://api.health.<ACTUAL_BEYU_DOMAIN>` in Vercel project settings (Production + Preview). Do **not** prefix with `VITE_` — this is consumed by `vercel.json` rewrites on the Vercel edge, not by the browser bundle, so the backend origin stays hidden from clients. |
| `VITE_API_BASE_URL` (client) | NOT REQUIRED / leave empty | Leave unset or set to `""`. SPA code (`src/services/auth.ts`, `src/services/supabase.ts`) treats empty base as same-origin; all `/auth` and `/api` calls are resolved by Vercel rewrites to `HEALTH_API_URL`. This keeps the browser SameSite-`Lax` cookie path simple and avoids cross-origin fetches. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | NOT REQUIRED | Frontend proxies Supabase through backend per `sectors/health/.env.example` ("frontend will proxy Supabase access through the backend API. Do not expose Supabase service keys in the browser."). |

### Health Backend (container platform)

| Variable | Classification | Notes |
|---|---|---|
| `NODE_ENV` | Must be `production` | Fail-closed boot guard in `main.ts` enforces non-default secrets. |
| `PORT` | `3000` default | Set by container platform if needed. |
| `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE` | **MISSING** | Real Postgres 16 DSN required. Supabase project ref `siyzygezdmlxbvwttrdz` (eu-west-3) is documented in root `.env.example` but no password is present. |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY` | **MISSING** | Phase 1E confirmed prior keys were compromised (history purge performed) — new keys must be generated. |
| `JWT_SECRET` | **MISSING** | Must be ≥32 random chars; default `"your-secret-key"` is rejected at boot in production. |
| `JWT_REFRESH_SECRET` | **MISSING** | Same requirements as `JWT_SECRET`. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | **MISSING** | Required in production (enforced by boot guard). |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | **MISSING** | Redis 7 instance required for Bull queues. |
| `CORS_ORIGIN` | Derived from subdomain | Must be `https://health.<ACTUAL_BEYU_DOMAIN>` (single origin, no wildcard). Fail-closed boot guard rejects `"*"` and `localhost`. |
| `NHIF_API_URL/KEY`, `DHIS2_*`, `SMTP_*`, `OPENAI_API_KEY` | **MISSING** (or NOT REQUIRED for MVP) | Integration credentials; can be added post-launch if integrations are not live. |

### BEYU Control Plane (root Vercel project)

Out of scope for this deployment; must not be modified by Health subdomain work. `DATABASE_URL`, `BEYU_ADMIN_DATABASE_URL`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `BEYU_BOOTSTRAP_PASSWORD` are all **MISSING** in this sandbox but belong to BEYU OS, not Health.

---

## 6. Security Gates (Phase 5) — Static Verification

| Gate | Status | Evidence |
|---|---|---|
| 1. Frontend cannot bypass auth | PASS (static) | `AuthProvider` calls `restoreSession()` on mount; unauthenticated users see `Login`/`Landing`. No auth fallback. |
| 2. API cannot bypass authz | PASS (static) | `AuthContextMiddleware` + `PermissionsGuard` wired globally in `app.module.ts`; no public route wildcard. |
| 3. GlobalUserID canonical | PASS (static) | `src/modules/identity/beyu-bridge.ts`; verified by 92 backend tests (including `beyu-bridge.spec.ts`, `identity.integration.spec.ts`). |
| 4. Sector identity ≠ BEYU identity | PASS (static) | Health roles are scoped (`health.ops@beyu.os`); no `GROUP_CEO` / governance permissions granted by Health. |
| 5-7. Tenant/entity/country isolation | PASS (static) | `TenantContextMiddleware` + `TenantScopeGuard` + RLS; tests `rls-isolation.spec.ts`, `isolation-boundaries.spec.ts` pass. |
| 8. RLS fail-closed | PASS (static) | Health backend boot does not disable RLS; runtime DB role is `NOSUPERUSER NOBYPASSRLS` (per BEYU `.env.example`); test `migration-consistency.spec.ts` passes. |
| 9-10. Runtime role non-owner | PASS (static) | BEYU `scripts/setup-db-role.ts` enforces NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB. Runtime role not granted BYPASSRLS. |
| 11. No `DISABLE ROW LEVEL SECURITY` | PASS (static) | No such string in `sectors/health/` or root migrations. |
| 12. No security middleware removed | PASS | `helmet`, `compression`, `cookie-parser`, `ValidationPipe` all applied in `main.ts`. |
| 13. CORS wildcard rejected | PASS (static) | `assertProductionConfig()` throws if `CORS_ORIGIN` is `*` / localhost / empty in production. |
| 14. No prod auth fallback | PASS (static) | No `if (NODE_ENV !== 'production')` bypass in auth path; default JWT secrets rejected at boot. |
| 15. No dev credentials promoted | PASS (static) | No `.env` committed; `.gitignore` blocks `.env*`; Phase 1E purged leaked secrets from history. |
| 16. No API route without authz boundary | PASS (static) | Global `APP_GUARD PermissionsGuard` + `AuthContextMiddleware` applies to `*`; routes must declare `@RequirePermission` or explicitly opt to `@Public()`. |
| 17. Noelia cannot self-approve | PASS (out of scope here) | Enforced in BEYU root (Noelia routes), not touched by Health deployment. |
| 18. Health cannot acquire constitutional authority | PASS (static) | Health `package.json` does not depend on BEYU OS governance modules; Health code does not expose constitution / policy / voting endpoints. |
| 19. BEYU audit chain untouched | PASS (static) | No BEYU source files modified. |
| 20. No BEYU migration changes | PASS (static) | Health deployment adds zero migrations; `sectors/health/supabase-*.sql` are reference schemas, not applied by BEYU migrate.ts. |

---

## 7. Build & Test Gates (Phase 6) — Local Verification

| Suite | Result |
|---|---|
| BEYU root `tsc --noEmit` | **PASS** |
| BEYU root `next build` | **PASS** (all routes compiled) |
| BEYU root `eslint .` | **PASS** (no errors) |
| BEYU root `vitest run` | DB-requiring suites skip correctly without DATABASE_URL (expected in sandbox); all in-memory suites pass. |
| Health frontend `tsc --noEmit` | **PASS** |
| Health frontend `vite build` | **PASS** (single-file `dist/index.html` 1066 kB / 270 kB gzip) |
| Health frontend `vitest run` | **14/14 PASS** (3 files) |
| Health backend `tsc --noEmit` | **PASS** |
| Health backend `nest build` | **PASS** (dist/ produced) |
| Health backend `npm test` (Jest with `--experimental-vm-modules`) | **92/92 PASS** (12 suites) — includes real-PG pglite verification of RLS/isolation/bridge |

No tests were modified, weakened, or skipped (other than suites that are designed to skip when no external DB is configured).

---

## 8. Remaining Blockers (require owner / external action)

1. **Vercel credentials / CLI access** — `VERCEL_TOKEN` or browser session required to create the second Vercel project, attach the subdomain, and set production env vars.
2. **Domain registration & DNS** — No BEYU production domain exists in DNS. Owner must register a domain (or confirm an existing one), add it to Vercel, and create the `health` subdomain.
3. **Backend hosting** — NestJS backend must be deployed to a container platform (Fly.io, GCP Cloud Run, AWS ECS, Render, Railway or Kubernetes). Dockerfile is production-ready.
4. **Production PostgreSQL** — Supabase project `siyzygezdmlxbvwttrdz` exists per documentation but credentials were rotated/purged; a new runtime role must be provisioned (via `scripts/setup-db-role.ts`) and real password stored in the backend platform's secret manager.
5. **Production Redis** — A Redis 7 instance is required for Bull queues; no hosted Redis is provisioned in this environment.
6. **JWT secrets** — Strong `JWT_SECRET`/`JWT_REFRESH_SECRET` (≥32 chars) must be generated and stored as secrets.
7. **Supabase keys** — New `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_KEY` after the Phase 1E credential rotation.
8. **CORS allow-list** — Because Vercel proxies API traffic server-to-server, the browser never makes a cross-origin request to the backend. Nevertheless set `CORS_ORIGIN=https://health.<domain>` on the backend as defense-in-depth (fail-closed boot guard rejects `"*"` and `localhost`). The backend must also trust the Vercel proxy (`X-Forwarded-Proto: https` / `X-Forwarded-For`) so that cookie `Secure` + `SameSite=Lax/Strict` is honored.
9. **Refresh cookie attributes** — Configure the NestJS auth cookie (`beyu_refresh` in `auth.controller.ts`) with `Secure; SameSite=Lax; HttpOnly; Path=/auth` in production so the Vercel-issued HTTPS origin can carry it on silent refresh.
10. **MFA provider** — Out of scope for initial subdomain launch but required for production compliance.
11. **TLS certificate** — Vercel auto-issues via Let's Encrypt once domain is added; backend platform similarly needs TLS (HTTPS is required for `HEALTH_API_URL` since Vercel edge → backend is over public internet).

---

## 9. Commits / Files Added (minimal, auditable)

- `sectors/health/vercel.json` — static SPA rewrite + security headers (does NOT alter BEYU routing).
- `docs/deployment/HEALTH_OS_DEPLOYMENT_TOPOLOGY.md` — this document.

No BEYU constitutional code, no Health source code, and no migration was modified.

---

## 10. Final Gate Status

**BLOCKED** — All code/build/test gates pass locally, but production deployment requires external infrastructure that is not present in this sandbox: Vercel credentials, a registered BEYU domain, a container runtime for the NestJS backend, a production PostgreSQL with fresh credentials, and a Redis instance. Per the task's non-negotiable rule, missing credentials and unavailable domains are NOT converted to PASS.
