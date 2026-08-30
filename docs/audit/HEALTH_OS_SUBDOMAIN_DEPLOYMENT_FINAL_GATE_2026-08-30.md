# HEALTH OS PRODUCTION SUBDOMAIN DEPLOYMENT — FINAL GATE REPORT

**Date:** 2026-08-30
**Branch:** `arena/01a0532c-beyu-os-1-0`
**Baseline commit:** `bfaaeadd8a94e56c536d995698757586084540ea` (HEAD of `main`)
**Commit being prepared:** `chore(health): add production deployment topology and vercel configuration`

---

## FINAL GATE: `BLOCKED`

**Reason stack (all must be resolved by an owner with credentials before deployment can proceed):**

1. **No Vercel CLI / token / authenticated session** — cannot create the second Vercel project, attach a domain, or set production env vars. API egress to `api.vercel.com:443` is TLS-blocked from this sandbox and `VERCEL_TOKEN` / `~/.vercel/` are absent.
2. **No registered BEYU production domain in DNS** — `beyu.os` (TLD `.os` not in IANA root), `beyuhealth.com`, and `beyu.health` do not resolve. The existing `beyu-os-1-0` Vercel project uses only the default `*.vercel.app` host and has no custom domain. Per Phase 3 rule: domain is not invented; subdomain `health.<domain>` cannot be configured until a real domain exists.
3. **Health NestJS backend cannot run on Vercel serverless** — it is a long-running Node 20 HTTP service with Redis-backed Bull queues, TypeORM connection pooling, Apollo GraphQL, helmet/compression/cookie-parser middleware, and a production boot guard that expects a stable process. It requires a container runtime (Fly.io, Cloud Run, ECS, Kubernetes, Render, Railway). Dockerfile is production-ready but no container platform credentials are available.
4. **Production PostgreSQL credentials MISSING** — root `.env.example` references Supabase project `siyzygezdmlxbvwttrdz` (eu-west-3, Paris) but no runtime/admin password is present; Phase 1E confirmed prior credentials were purged after leak; new credentials must be provisioned.
5. **Production Redis MISSING** — required for Bull queues (billing, notifications, AI jobs).
6. **JWT secrets, Supabase keys, integration credentials MISSING** — production boot guard in `src/main.ts` fail-closes on default dev secrets.

Per the controlling rule, **MISSING CREDENTIAL / UNAVAILABLE DOMAIN / UNVERIFIED PRODUCTION STATE is never converted to PASS.**

---

## What was completed (auditable, no fabrication)

### Phase 0 — Reality Audit — COMPLETE

| Finding | Value |
|---|---|
| HEAD commit | `bfaaead` (matches specification) |
| Health source | `sectors/health/` (already merged, not re-imported) |
| Health frontend | React 19 + Vite 7 + `vite-plugin-singlefile` → single-file static SPA |
| Health backend | NestJS 10 + TypeORM + Apollo GraphQL + Bull (Redis) |
| Root framework | Next.js 16 (App Router) |
| Existing Vercel project | `beyu-os-1-0` at `beyu-os-1-0.vercel.app` (root app), no custom domain |
| Existing `vercel.json` | None (added for Health frontend only) |
| Next/Vite/Nest configs | Audited, no drift |

### Phase 1 — Deployment topology — DEFINED

- **Frontend:** Vercel, static (Vite single-file build), `sectors/health/` as root directory. The Vercel edge reverse-proxies API paths to the container backend so the browser sees a single origin (mirrors the Vite dev proxy).
- **Backend:** Container platform (Dockerfile-provided), not Vercel serverless.
- **Database:** Supabase PostgreSQL 16 (`siyzygezdmlxbvwttrdz`, eu-west-3), RLS fail-closed, `beyu_runtime` role NOSUPERUSER/NOBYPASSRLS.
- **Redis:** Required for Bull queues.
- **Constitutional relationship:** BEYU OS governs → Health OS executes (unchanged).

### Phase 2 — Vercel project plan — DEFINED

Option A chosen: **separate Vercel project**, same repo, root directory `sectors/health`, framework preset Other (static). No changes to the existing `beyu-os-1-0` project. Committed `sectors/health/vercel.json` providing:

- Edge rewrites: `/auth/*`, `/api/*`, `/health/*`, `/graphql*` → `${HEALTH_API_URL}` (server-side env var, never exposed to the browser bundle).
- SPA fallback: all other paths → `/index.html`.
- Security headers aligned with BEYU main (CSP with `connect-src 'self'`, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, X-Content-Type-Options nosniff).

### Phase 3 — Subdomain — BLOCKED (no domain)

No invented domain. `health.<ACTUAL_BEYU_DOMAIN>` cannot be created until owner provisions the parent domain.

### Phase 4 — Production env — CLASSIFIED (all secrets MISSING, none fabricated)

See `docs/deployment/HEALTH_OS_DEPLOYMENT_TOPOLOGY.md` §5 for per-variable classification. Key points:

- `HEALTH_API_URL` (server-side Vercel env var): MISSING — set to backend URL, never prefixed `VITE_`.
- `VITE_API_BASE_URL` (client bundle): NOT REQUIRED — leave empty so SPA uses same-origin fetches.
- All backend secrets (DB, JWT, Supabase, Redis): MISSING.

### Phase 5 — Security gates (static) — ALL 20 PASS (code-level)

No middleware removed, no auth bypass added, no CORS wildcard, no dev secrets promoted, no migration modified, no constitutional code touched.

### Phase 6 — Build & test — ALL PASS

| Suite | Result |
|---|---|
| BEYU root `tsc --noEmit` | PASS |
| BEYU root `eslint .` | PASS |
| BEYU root `next build` | PASS (all routes compiled) |
| BEYU root tests — in-memory suites | PASS; DB suites skip correctly without DATABASE_URL |
| Health frontend `tsc --noEmit` | PASS |
| Health frontend `vite build` | PASS (1066 kB / 270 kB gzip single-file) |
| Health frontend `vitest run` | **14/14 PASS** |
| Health backend `tsc --noEmit` | PASS |
| Health backend `nest build` | PASS |
| Health backend `npm test` | **92/92 PASS** (12 suites, real pglite RLS verification) |

No tests were modified, weakened or deleted.

### Phase 7–9 — Deployment / Live verification / Regression — BLOCKED

No deployment performed (no credentials, no domain). No production URL exists. No fabricated "deploy success".

### Phase 10 — Git safety — COMPLIANT

- BEYU constitutional code: **untouched** (no files under `src/`, `drizzle/`, root `next.config.ts`, root scripts changed).
- Health source code: **untouched** (only `vercel.json` added; no `.ts`/`.tsx` under `sectors/health/src` or `sectors/health/backend/src` modified).
- Health history: **not rewritten**.
- Force push: **not performed** on this branch.
- Duplicate repo: **not created**.
- Files added (minimal, auditable):
  - `sectors/health/vercel.json` — Vercel SPA + edge-proxy configuration + security headers.
  - `docs/deployment/HEALTH_OS_DEPLOYMENT_TOPOLOGY.md` — deployment architecture, env-var matrix, blocker checklist.
  - `docs/audit/HEALTH_OS_SUBDOMAIN_DEPLOYMENT_FINAL_GATE_2026-08-30.md` — this final gate report.

---

## Deliverables committed for reviewer/owner

1. **`sectors/health/vercel.json`** — Ready-to-use Vercel configuration. When the Health Vercel project is created with root directory `sectors/health`, this file is picked up automatically. It configures:
   - Install command `npm ci`, build command `npm run build`, output directory `dist/`.
   - Edge reverse-proxy rewrites from `/auth`, `/api`, `/health`, `/graphql` to `${HEALTH_API_URL}` (server-side only; backend origin never sent to the browser).
   - SPA fallback rewrite → `/index.html` for deep links.
   - Security headers matching BEYU main: CSP (connect-src 'self'), X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, X-Content-Type-Options nosniff.
2. **`docs/deployment/HEALTH_OS_DEPLOYMENT_TOPOLOGY.md`** — Full deployment architecture diagram, env-var classification matrix, blocker list, and owner action checklist.
3. **`docs/audit/HEALTH_OS_SUBDOMAIN_DEPLOYMENT_FINAL_GATE_2026-08-30.md`** — This final gate report.

---

## Pre-commit verification checklist

| Check | Result |
|---|---|
| No secrets/API keys/passwords/keys/PEM blocks in any added file | PASS (grep for common patterns returned nothing) |
| No fabricated credentials | PASS |
| No claim that infrastructure is live | PASS (final gate = BLOCKED) |
| `vercel.json` valid JSON | PASS (parsed by Python JSON parser) |
| SPA rewrites correct | PASS (`/(.*)` → `/index.html` last; API/auth/health/graphql routes proxied first) |
| Security headers present and aligned with BEYU `next.config.ts` | PASS |
| Frontend → Vercel (static) architecture | PASS |
| Backend → container runtime (Docker) architecture | PASS |
| PostgreSQL → Supabase | PASS |
| Redis → production Redis (Bull) | PASS |
| BEYU remains constitutional control plane | PASS (asserted in topology doc) |
| Health remains a Sector OS | PASS (asserted in topology doc) |
| No BEYU security/constitutional code modified | PASS (`git diff --stat` shows zero changes outside the three new files) |
| Health frontend typecheck | PASS |
| Health frontend build | PASS |
| Health frontend tests 14/14 | PASS |
| Health backend typecheck | PASS |
| Health backend build | PASS |
| Health backend tests 92/92 | PASS |
| BEYU root typecheck | PASS |
| BEYU root build | PASS |

---

## Exact production URL

**NOT DEPLOYED.** No production URL exists. The frontend default preview URL (once the Vercel project is created by an owner) will be `beyu-health-os-<gitsha>-<team>.vercel.app`; the intended production URL is `https://health.<ACTUAL_BEYU_DOMAIN>` once a real domain is registered and attached.

## Backend endpoint

**NOT DEPLOYED.** Intended: `https://api.health.<ACTUAL_BEYU_DOMAIN>` (container platform, TLS); consumed server-side by Vercel via `HEALTH_API_URL` — browsers never see it directly.

## Database target

**NOT PROVISIONED** with credentials in this environment. Intended: Supabase PostgreSQL 16, project ref `siyzygezdmlxbvwttrdz`, region eu-west-3 (Paris), runtime role `beyu_runtime` (NOSUPERUSER, NOBYPASSRLS), connected via Supavisor transaction pooler on port 6543.

## Deployed commit SHA

**NOT DEPLOYED.** The verified codebase base is commit `bfaaeadd8a94e56c536d995698757586084540ea` (HEAD of `main`). This commit adds three new configuration/documentation files on top.

## Environment-variable status

All production secrets are **MISSING** — see topology doc §5. No secrets are printed, no `.env` files are committed, no credentials are hard-coded.

## Live verification

**NOT PERFORMED** (nothing deployed to verify). HTTPS, DNS, authentication, RLS, audit, and regression against a live environment remain BLOCKED pending infrastructure.

---

## Remaining blockers (owner action checklist)

1. Provide / configure `VERCEL_TOKEN` and register a second Vercel project `beyu-health-os` with root directory `sectors/health` connected to this repo's `main` branch, framework preset Other.
2. Register and delegate a real BEYU domain (e.g. via a registrar), add it to the Vercel team, and attach `health.<domain>` to the `beyu-health-os` project (Vercel will issue TLS automatically).
3. Provision a container platform for the NestJS backend (Fly.io, GCP Cloud Run, AWS ECS, Render, Railway, or Kubernetes); deploy `sectors/health/backend/Dockerfile`.
4. Generate fresh credentials:
   - Supabase DB password (runtime role `beyu_runtime` via `scripts/setup-db-role.ts`);
   - New `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY` (post rotation);
   - Strong `JWT_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars);
   - Set `JWT_ISSUER=https://health.<domain>` and `JWT_AUDIENCE=beyu-health-os`;
   - `CORS_ORIGIN=https://health.<domain>` (defense-in-depth; CORS is not actually exercised by browsers due to Vercel proxy, but backend fail-closed boot guard requires an explicit non-wildcard value);
   - Redis 7 instance + credentials.
5. Run backend migrations against the production database via `npm run migration:run` using the admin DSN.
6. Set `HEALTH_API_URL=https://api.health.<domain>` as a server-side (non-`VITE_`) environment variable in the Vercel project and deploy. Leave `VITE_API_BASE_URL` unset/empty.
7. Configure refresh cookie (`beyu_refresh`) in production: `Secure; HttpOnly; SameSite=Lax; Path=/auth` so the Vercel edge can forward it to the backend over HTTPS.
8. Re-run live gates (HTTPS, DNS, auth, GlobalUserID, tenant/entity/country isolation, RLS, audit, CORS, secrets-scan) against the deployed URL.
9. The commit containing these three files is atomic and ready for review/merge via PR.

---

## Constitutional guarantee

Health OS, once deployed at `health.<domain>`, will remain a **Sector OS** executing under BEYU OS governance:
- Identity is bridged through `GlobalUserID` (Health never issues constitutional identities).
- Policy, governance, Noelia, HIVE, audit chain, and family/trust authority remain in BEYU OS only.
- RLS, tenant/entity/country isolation, and non-owner runtime roles are enforced at the database layer regardless of entry point (BEYU or Health).
- The subdomain is an independent **access surface**, not an independent constitutional authority.
