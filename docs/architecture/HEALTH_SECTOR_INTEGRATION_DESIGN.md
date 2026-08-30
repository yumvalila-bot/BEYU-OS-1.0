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

## 4. IMPLEMENTATION & VERIFICATION RECORD (this run)

### 4.1 Import (Phase 5) — PASS

- `git subtree add --prefix=sectors/health <HEALTH-OS-1.0 URL> 06053179fa48098d3c6e7e36350325ae309a1c8b`
- All 13 source commits verified present in branch history (`git merge-base --is-ancestor`).
- All 158 imported blobs byte-identical to source (`git ls-tree` blob comparison).
- BEYU root files untouched by the import itself (verified by diff).

### 4.2 Deliberate root tooling adjustments (Phase 6) — evidence-driven, not blind merges

1. `tsconfig.json`: `exclude: ["sectors/**"]` — without it, the root
   `tsc --noEmit` compiles sector code under the BEYU project (171 errors, all
   in `sectors/health/...`: missing jest/Nest types). The sector is a
   self-contained package with its own tsconfig (verified standalone).
2. `eslint.config.mjs`: `globalIgnores("sectors/**")` — the sector ships its
   own ESLint 8 configuration; the root flat config must not lint it.
3. No `package.json` / lockfile / CI merges at the root (no workspaces
   introduced). Sector keeps its own manifests.

### 4.3 Findings in the imported source (recorded, not silently "fixed")

- **Stale backend lockfile (pre-existing defect):** `backend/package-lock.json`
  was out of sync with `backend/package.json` (`npm ci` failed: missing
  axios@1.20.0, passport@0.7.0, ajv mismatches…). Repaired with `npm install`
  (lockfile resync only). Verified: **all direct dependencies still satisfy
  their original `package.json` ranges — no version upgrades introduced.**
- Sector backend `TypeOrmModule.synchronize: NODE_ENV === 'development'` —
  inert (zero TypeORM entities exist) but recorded as a risk: sector must use
  migrations only if entities are ever added.
- Frontend browser code imports `@supabase/supabase-js` directly while
  `.env.example` mandates backend proxying — recorded for the sector team
  (no keys committed; no secret exposure).
- Legacy `beyu health os/*.sqlproj` (SQL Server) — inert artifact, preserved.

### 4.4 Identity + isolation integration (Phases 7–8) — implemented & verified

- `backend/database/migrations/002_beyu_identity_bridge.{up,down}.sql` —
  `beyu_identity_links` (1:1 both directions) + tenant `beyu_tenant_id`
  (UNIQUE) / `country_code` / `entity_code`.
- `backend/database/migrations/003_health_isolation_boundaries.{up,down}.sql`
  — `tenant_matches_boundary()` SECURITY DEFINER helper + upgraded RLS
  policies: linked tenants require tenant+country+entity context match
  (fail-closed); unlinked legacy tenants keep the imported tenant-only
  boundary (nothing weakened). Down-migrations restore the original policies.
- `backend/src/modules/identity/boundary-schema.ts` — single source of truth
  for the 002/003 SQL (sector's own pattern), applied by tests.
- `backend/src/modules/identity/beyu-bridge.ts` — bridge service:
  `linkUser` / `requireCanonicalLink` (fail-closed) / `linkTenant` (set-once)
  / `assertContextBoundary` / `assertSectorGrantAllowed` (constitutional
  roles & permissions refused via the sector path).
- `identity.module.ts` — the ONLY imported file modified (provider
  registration, test-covered).
- New adversarial suites (real PostgreSQL):
  - `beyu-bridge.spec.ts` — 15 tests (bridge integrity, fail-closed,
    governance refusals).
  - `isolation-boundaries.spec.ts` — 12 tests (non-owner `SET ROLE`:
    cross-country/entity denial, cross-tenant INSERT/UPDATE/DELETE denial,
    forged-context denial, fail-closed no-context, legacy preserved).

### 4.5 Test & verification results (executable evidence, this run)

| Gate | Command | Result |
| --- | --- | --- |
| BEYU typecheck | `npm run typecheck` (root) | **PASS** (exit 0; after §4.2 adjustment) |
| BEYU lint | `npm run lint` (root) | **PASS** (exit 0) |
| BEYU full suite | fresh canonical DB (migrate 19/19 + seed) + production server on :3100, `BEYU_TEST_BASE_URL=... npm test` | **PASS — 2262/2262 tests, 105/105 files, 0 failed, 0 skipped** (baseline-preserved) |
| BEYU migrations | `npm run migrate` | **PASS — 19/19 APPLIED** (checksummed ledger) |
| BEYU production build | `npm run build` | **PASS** |
| Health frontend typecheck | `sectors/health: npm run typecheck` | **PASS** |
| Health frontend tests | `sectors/health: npm test` | **PASS — 14/14 (3 files)** |
| Health frontend build | `sectors/health: npm run build` | **PASS** (single-file dist) |
| Health backend typecheck | `sectors/health/backend: npx tsc --noEmit` | **PASS** |
| Health backend lint | `npx eslint "{src,apps,libs,test}/**/*.ts"` | **PASS — 0 errors** (1 pre-existing warning in untouched file) |
| Health backend tests | real PostgreSQL 18.4, `TEST_DATABASE_URL` set | **PASS — 92/92 tests, 12/12 suites** (incl. 27 new adversarial tests) |
| Canonical DB migration chain | BEYU 0000–0018 + sector 001/002/003 applied by admin role | **PASS** — 9 `beyu_identity` tables, 4 RLS policies, boundary function present |
| Sector runtime role | `beyu_health_runtime` provisioned | **PASS** — NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB; DML `beyu_identity.*`; SELECT `public.tenants|countries|legal_entities` |
| Live adversarial RLS (canonical DB, `beyu_health_runtime`) | direct non-owner role queries, 8 checks | **PASS 8/8** — no-context fail-closed, matching-context visibility, cross-country denial, cross-entity denial, forged-context denial, cross-tenant INSERT denial, legacy unlinked behavior preserved. (A 9th probe of `public.tenants` visibility was reclassified: `public.tenants`/`countries` are control-plane catalogs with **no RLS by BEYU design** — the 20 RLS-gated tables are tenant-scoped data tables, matching the baseline inventory.) |

### 4.6 Baseline suite state-dependency finding (pre-existing, documented)

`tests/architecture/constitutional-invariants.test.ts` invariant 7 asserts
`count(*) from audit_log > 0`. Audit rows are created only by other suites
during a run (the seed inserts none), and several suites truncate the ledger
via the sanctioned `tests/helpers/ledger-reset.ts` helper. The suite
therefore passes on a fresh environment (baseline run: 2262/2262) and can
fail invariant 7 on a **second consecutive run against the same DB** —
proven by controlled experiment (invariant 7 alone: FAIL on empty audit →
run audit-producing suite → PASS). This is a property of the untouched
baseline suite (file-order/state dependence); the post-integration
regression was therefore re-proven on a fresh canonical DB (2262/2262,
§4.5). Not caused by, and not "fixed" by, this integration (no BEYU test or
source was modified).

### 4.7 Final merge-readiness audit (2026-08-30) — one defect found, fixed, re-verified

Final read-only audit of the complete PR found exactly one genuine defect,
fixed in a dedicated commit (the only code change of that commit):

- **Defect:** `003_health_isolation_boundaries.down.sql` dropped
  `beyu_identity.tenant_matches_boundary(uuid)` *before* replacing the
  upgraded RLS policies that reference it. On real PostgreSQL 18.4 (scratch
  DB with BEYU 0000–0018 + sector 001/002/003 applied) this failed with
  `cannot drop function beyu_identity.tenant_matches_boundary(uuid) because
  other objects depend on it` — the down migration could not reverse its own
  up-state. (Execution is an atomic multi-statement simple query, so the
  failure mode was refuse-to-reverse, never partial state or corruption.)
- **Fix (minimal, end-state unchanged):** reordered 003 down — the four
  policies are replaced with their original (imported) tenant-only
  definitions first; `DROP FUNCTION … tenant_matches_boundary(uuid)` runs
  last, when nothing references it.
- **Re-verification (real PG 18.4.0-beta, scratch DB, admin role):**
  full cycle 001→002→003 up, then 003→002 down restored `beyu_identity`
  exactly to the 001 state (8 tables; original 4 tenant-only policies with
  identical qual text; no leftover function/columns) while the BEYU
  `public` catalog (all columns, indexes, RLS policies, functions) was
  **byte-identical** before and after the entire cycle. Sector backend
  suite re-run post-fix: 92/92 tests, 12/12 suites (real PostgreSQL).
