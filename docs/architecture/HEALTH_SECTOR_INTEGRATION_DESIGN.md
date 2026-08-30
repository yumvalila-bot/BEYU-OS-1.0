# BEYU OS — Health Sector Integration Design (Phases 3 & 4)

- **Date:** 2026-08-30 (run 2 — source unblocked)
- **Branch:** `arena/01a0529f-beyu-os-1-0`
- **Health OS source (freshly verified this run):** `https://github.com/yumvalila-bot/HEALTH-OS-1.0`
  - branch `arena/01a05116-health-os-1-0` and `main` both = **`06053179fa48098d3c6e7e36350325ae309a1c8b`** (verified identical; SHA pinned for the import)
  - 13 commits, 158 files, ~2.6 MiB pack
- **BEYU baseline (preserved):** `422499a` — 2262/2262 tests, 105/105 files, real PostgreSQL 18.4.0-beta, build PASS.

## 1. What Health OS actually is (Phase 2 finding)

- **Root:** React 19 + Vite 7 + Tailwind 4 SPA (`vite-plugin-singlefile`). Mock-driven views
  (clinical, EMR, NABH, tax, orchestration…) + real auth service wiring to the backend API.
- **`backend/`:** NestJS 10 — JWT auth (access + rotating refresh, hashed in DB), TOTP-capable
  MFA service, tenant-context middleware, RBAC permissions guard, CSRF origin guard, helmet,
  rate limiting, fail-closed production config guard (strong JWT secret, issuer/audience,
  non-wildcard CORS).
- **Implemented core:** the **identity module** (`beyu_identity` schema: users/tenants/
  memberships/roles/permissions/sessions/auth_events + 4 RLS policies on GUC
  `app.tenant_id`) and its adversarial test suite (10 jest specs; real-PG or PGlite engine).
- **Stubs (empty `@Module({})`):** patients, clinical, appointments, laboratory, pharmacy,
  billing, ai, and all other domain modules. **No TypeORM entities exist.**
- **AI:** no backend AI runtime; `AICoPilot` is frontend mock UI. No competing HIVE/Noelia
  identity in code (doc references only).
- **Extras:** Supabase schema dumps + remote migration (reference for a Supabase deployment),
  Dockerfile + docker-compose (backend), a legacy SQL-Server `.sqlproj` artifact (inert),
  14 docs including self-reported "live production gates BLOCKED".

## 2. PHASE 3 — CONFLICT / DUPLICATION MATRIX

| # | Area | BEYU OS | Health OS | Class | Resolution |
|---|------|---------|-----------|-------|------------|
| 1 | package.json | single root pkg `beyu` | root `react-vite-tailwind` + `backend/` pkg | duplicate (independent) | **Do not merge.** Sector keeps both manifests under `sectors/health/`. |
| 2 | lockfiles | root `package-lock.json` | root + backend lockfiles | duplicate | **Do not merge.** Each lockfile stays with its package; root lockfile untouched. |
| 3 | TypeScript | 5.9.3 strict | 5.9.3 (root), ^5.2.2 (backend) | mergeable | Sector tsconfigs stay under the sector; BEYU root tsconfig untouched. |
| 4 | build tooling | Next.js 16 | Vite 7 + Nest CLI | contradictory | Sector builds stand-alone; no shared build pipeline. |
| 5 | frontend framework | Next.js App Router | React SPA (Vite) | contradictory | SPA stays a sector artifact; NOT merged into the Next.js app. |
| 6 | backend framework | Next.js API routes | NestJS 10 | contradictory | NestJS stays the sector runtime; sector surface is internal, exposed only via BEYU (governed) boundary. |
| 7 | routing | Next App Router | NestJS REST + GraphQL | compatible (disjoint) | none. |
| 8 | env vars | `DATABASE_URL`, `BEYU_*_DATABASE_URL`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY` | `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE`, `JWT_*`, `CORS_ORIGIN`, `REDIS_*`, `SUPABASE_*` | contradictory (naming) | Sector keeps its contract; deployment-time mapping documented. No renaming (would modify source). |
| 9 | authentication | BEYU sessions + TOTP MFA | sector JWT access/refresh + MFA service | **security-critical** | Sector JWT = internal sector mechanism only. Canonical auth = BEYU. Linkage mandatory (§3.2); full runtime auth flow = **architectural decision requiring human approval** (not silently merged). |
| 10 | GlobalUserID | `users.id` (text) + `parties` MDM | `beyu_identity.users.global_user_id` (uuid) | **security-critical / contradictory** | ONE canonical (BEYU). Sector id becomes a **domain id** linked 1:1 via `beyu_identity_links`. Never merged, never destroyed. |
| 11 | tenant model | `tenants` (text id, `country_code`, `isolation_tier`) | `beyu_identity.tenants` (uuid; no country/entity) | **security-critical** | Upgrade sector: `beyu_tenant_id` link + `country_code` + `entity_code`; strict boundaries for linked tenants (§3.4). BEYU model unchanged. |
| 12 | entity model | `legal_entities` per tenant | absent | **security-critical** | Sector inherits entity boundary via canonical link, enforced in RLS. |
| 13 | country model | `countries` + tenant `country_code` | absent | **security-critical** | Same as #12. |
| 14 | RBAC | roles/permissions/grants + authority engine | 23 roles / 42 permissions | **security-critical** | Sector catalog includes **constitutional roles** (trustee, board, general-counsel) — a sector must not hold constitutional authority. Guard: sector path refuses constitutional-role grants; only a BEYU governance resolution can authorize them (§3.5). |
| 15 | ABAC | decisions + country scope | tenant context only | **security-critical** | Upgraded by migration 003 (country/entity context enforcement). |
| 16 | audit | hash-chained audit (public) | `auth_events` (plain) | contradictory (two logs) | `auth_events` = sector domain log only; canonical audit remains the BEYU chain. No sector claim on constitutional audit (documented). |
| 17 | PostgreSQL | one canonical DB; admin/runtime/test roles | raw-SQL migrations; own-DB env contract | contradictory | Sector joins the **canonical database** as schema `beyu_identity` (its migrations already `CREATE SCHEMA`); sector runtime role = non-owner RLS-bound grantee (`beyu_health_runtime`), canonical pattern. |
| 18 | ORM | Drizzle | TypeORM configured but **zero entities** (raw SQL) | duplicate-absent | No schema merge. Sector raw-SQL migrations run under the admin role. |
| 19 | migrations | `drizzle/0000–0018` + checksum ledger | `backend/database/migrations/001` (no ledger) | mergeable | Sector migrations stay under the sector; executed by the canonical admin role; BEYU ledger untouched. |
| 20 | RLS | 20 policies; GUCs `beyu.current_tenant_ids`/`beyu.global_scope` | 4 policies; GUC `app.tenant_id` | mergeable | **GUC namespaces are disjoint → coexist safely in one DB.** Additive sector policies (003). |
| 21 | DB roles | `user` (admin), `beyu_runtime`, `beyu_test` | none (tests assume superuser) | **security-critical** | New `beyu_health_runtime` (NOSUPERUSER NOBYPASSRLS). Sector test suite uses existing `beyu_test` superuser with per-spec scratch databases (its own isolation model). |
| 22 | governance | constitution engine, resolutions, quorum | role catalog w/ trustee/board + `board:vote`, `trustee:veto`, `contract:*` | **security-critical** | Sector executes; constitutional authority stays in BEYU. Enforced guard (§3.5) + tests. |
| 23 | HIVE | Noelia runtime (`/api/v1/ai/noelia`, schema 0014–0016) | empty `AiModule` stub + mock UI | compatible (no code conflict) | No competing runtime exists. Future Health AI capabilities must register as governed HIVE tools via Noelia (documented). |
| 24 | Noelia | unified AI identity | doc/mock references only | compatible | none in code. |
| 25 | APIs | `/api/v1/*` guarded | NestJS REST + GraphQL + Swagger | mergeable | Sector APIs internal; external exposure only through BEYU (documented; no proxy implemented this run). |
| 26 | deployment | docs-only (no infra in repo) | Dockerfile + docker-compose | compatible | Preserved under sector; production deployment remains **BLOCKED** (no real credentials). |
| 27 | CI/CD | none in repo | none | compatible | none. |
| 28 | tests | vitest 3 (105 files / 2262 tests) | vitest 3 (3 files) + jest 29 (10 specs) | compatible (disjoint) | Both suites run; BEYU suite untouched. |
| 29 | shared libs | — | react 19.2.6/tailwind 4.1.17 (same), minor @types drift | compatible | No shared package introduced. |

**Latent risks noted (documented, not code-changed this run):**
- `TypeOrmModule` `synchronize: NODE_ENV === development` — inert (no entities) but dangerous
  if entities are ever added; sector must use migrations only.
- Frontend imports `@supabase/supabase-js`/`@supabase/ssr` directly in browser code while
  `.env.example` says Supabase must be proxied through the backend — no keys are committed, so
  no secret exposure; the contradiction is recorded for the sector team.
- Legacy `beyu health os/*.sqlproj` (SQL Server) — inert artifact; preserved (no destructive removal).

## 3. PHASE 4 — TARGET ARCHITECTURE

### 3.1 Structure (adapted to the real BEYU repo — it is NOT an apps/packages monorepo)

```
BEYU-OS-1.0/
├── (BEYU root — UNCHANGED: Next.js app, drizzle/, tests/, docs/)
├── docs/architecture/HEALTH_SECTOR_INTEGRATION_DESIGN.md   (this file)
└── sectors/
    └── health/                          ← subtree import of HEALTH-OS-1.0 @ 06053179 (history preserved)
        ├── … (imported Health OS exactly as committed: SPA, backend/, docs/, supabase/, …)
        ├── backend/database/migrations/002_beyu_identity_bridge.up.sql
        ├── backend/database/migrations/002_beyu_identity_bridge.down.sql
        ├── backend/database/migrations/003_health_isolation_boundaries.up.sql
        ├── backend/database/migrations/003_health_isolation_boundaries.down.sql
        ├── backend/src/modules/identity/beyu-bridge.ts          (new: canonical identity bridge + guards)
        ├── backend/src/modules/identity/beyu-bridge.spec.ts     (new: bridge integrity tests)
        ├── backend/src/modules/identity/isolation-boundaries.spec.ts (new: adversarial RLS tests)
        └── INTEGRATION.md                                       (new: sector boundary documentation)
```

- **Rule 4 (history):** `git subtree add --prefix=sectors/health <url> 06053179fa…` — all 13
  Health OS commits land in BEYU history.
- **Root isolation:** no BEYU root file is modified by the import (subtree touches only
  `sectors/health/**` + the merge commit).

### 3.2 Identity (Phase 7)

- **Canonical:** BEYU `parties`/`users` — one GlobalUserID, unchanged.
- **Sector:** `beyu_identity.users.global_user_id` becomes a **domain identifier**.
- **Bridge table** (sector schema, additive migration 002):
  `beyu_identity.beyu_identity_links (global_user_id uuid PK→users, beyu_user_id text UNIQUE,
  beyu_party_id text, linked_at, linked_by)` — 1:1 enforced both directions.
- **Fail-closed rule:** a sector session for a user without an active link is denied
  (bridge service + tests).
- **No silent merge, no identifier destruction** — sector ids keep living; the link maps.
- Runtime authentication flow (sector accepting BEYU-asserted identity vs. bridged JWT) is an
  **architectural decision requiring human approval** — recorded, not silently chosen.

### 3.3 Database (Phase 9) — decision: **Option A/B hybrid, evidence-based**

- Health joins the **canonical PostgreSQL database** (one audit boundary, one admin role) but
  keeps its **dedicated schema `beyu_identity`** (its migrations already create a separate
  schema; RLS GUC namespaces are disjoint from BEYU's).
- Sector production connection role: `beyu_health_runtime` — non-owner grantee,
  NOSUPERUSER NOBYPASSRLS, DML on `beyu_identity.*` only (canonical C-02 pattern).
- Migration ordering: BEYU 0000–0018 first (canonical), then sector 001 (imported), then
  002/003 (this integration) — additive only; down-migrations provided for both new migrations.
- No cross-merge of Drizzle schema with sector SQL; BEYU root schema directory untouched.

### 3.4 Isolation upgrade (Phase 8) — migration 003

- `beyu_identity.tenants` gains `country_code`, `entity_code`, `beyu_tenant_id` (UNIQUE).
- **Strict boundary for LINKED tenants:** RLS policies (additive) require the context
  (`app.tenant_id`, `app.country_code`, `app.entity_code`) to match the tenant's canonical
  country/entity (resolved via the `beyu_tenant_id` link against `public.tenants`).
  A linked tenant whose canonical country/entity does not match the context is invisible —
  fail-closed.
- **Unlinked legacy tenants** keep the existing tenant-only policy (tested sector behavior is
  preserved; nothing weakened — linked tenants get a STRICTER boundary).
- Adversarial regression tests (new spec, real PostgreSQL): cross-tenant, cross-country,
  cross-entity denials; no-context fail-closed; unlinked-tenant legacy behavior intact.

### 3.5 Governance boundary (Phase 11)

- Constitutional roles (`trustee`, `board`, `general-counsel`) and constitutional permissions
  (`trustee:veto`, `board:vote`, `contract:sign/anchor`) may only be held via a **BEYU
  governance resolution** — the sector link/assign path refuses them outright (bridge guard +
  tests). The sector's reference catalog is preserved (no deletion) but is inert for
  constitutional authority.
- **AI boundary (Phase 12):** no sector AI runtime exists to remap; the guardrail is recorded
  in `sectors/health/INTEGRATION.md`: any future Health AI capability is a governed HIVE tool
  invoked through Noelia; Noelia cannot approve its own actions (BEYU invariants 2/3 already
  enforced and re-tested by the BEYU suite).

### 3.6 What is explicitly NOT done this run (recorded for approval/follow-up)

- No runtime auth-flow integration (sector↔BEYU session assertion) — architectural decision.
- No sector API proxy through BEYU — architectural decision.
- No Supabase/Redis/Vercel deployment wiring — BLOCKED (no real credentials).
- No modifications to imported sector source files except `identity.module.ts` registration of
  the new bridge provider (deliberate, documented, test-covered).
