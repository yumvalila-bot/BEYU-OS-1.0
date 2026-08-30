# BEYU Health OS — Sector Integration Boundary

**Status:** integrated into BEYU-OS-1.0 under the Sector OS boundary (2026-08-30).
**Import:** `git subtree add --prefix=sectors/health` from
`yumvalila-bot/HEALTH-OS-1.0` @ `06053179fa48098d3c6e7e36350325ae309a1c8b`
(full history preserved; all 13 source commits in BEYU history).

## Position in the BEYU architecture

```
BEYU OS (constitutional control plane: identity, governance, audit, authorization)
        ↓  governs
BEYU Health OS (this sector: execution layer for healthcare operations)
        ↓  executes
Clinical / operational domain
```

- **BEYU OS governs. This sector executes.** Nothing in this sector is a
  competing constitutional authority.
- **One canonical GlobalUserID** (BEYU `public.users` / `public.parties`).
  This sector's `beyu_identity.users.global_user_id` is a **domain identifier**
  that acts only under a 1:1 link in `beyu_identity.beyu_identity_links`.
- **Isolation:** tenant + entity + country boundaries. Linked tenants are
  RLS-enforced against their canonical country/entity (migration 003);
  unlinked legacy tenants keep tenant-only isolation.
- **AI:** no sector AI runtime exists. Future Health AI capabilities must
  operate as governed HIVE tools through the unified Noelia identity.
  Noelia cannot approve its own actions (BEYU constitutional invariants 2/3).

## Canonical boundaries enforced in this sector

| Boundary | Enforcement | Evidence |
| --- | --- | --- |
| One GlobalUserID | `beyu_identity_links` 1:1 (PK + UNIQUE), fail-closed `requireCanonicalLink` | `backend/src/modules/identity/beyu-bridge.spec.ts` (15 tests, real PostgreSQL) |
| Tenant isolation | RLS `app.tenant_id` (imported migration 001) | imported `rls-isolation.spec.ts` (real PostgreSQL) |
| Country isolation | RLS via `tenant_matches_boundary` (migration 003) | `isolation-boundaries.spec.ts` (cross-country denial, real PostgreSQL) |
| Entity isolation | RLS via `tenant_matches_boundary` (migration 003) | `isolation-boundaries.spec.ts` (cross-entity denial, real PostgreSQL) |
| Constitutional authority | `assertSectorGrantAllowed` refuses trustee/board/general-counsel + constitutional permissions via the sector path | `beyu-bridge.spec.ts` |
| Canonical tenant linkage | set-once `linkTenant`; conflicts are hard errors | `beyu-bridge.spec.ts` |

## Database topology (canonical)

- One PostgreSQL database (the canonical BEYU database).
- `public` schema: BEYU OS (untouched by this sector).
- `beyu_identity` schema: this sector (migrations 001 imported; 002/003
  additive, this integration).
- Sector runtime role: `beyu_health_runtime` — non-owner grantee,
  NOSUPERUSER NOBYPASSRLS, DML on `beyu_identity.*`, SELECT on
  `public.tenants|countries|legal_entities` (control-plane catalogs are
  authority-gated at the BEYU app layer by design; tenant *data* tables
  remain RLS-gated).
- GUC namespaces are disjoint: BEYU `beyu.*`, sector `app.*` — they coexist.

## Build & test (standalone sector package — root BEYU toolchain does not compile it)

```bash
# frontend (React/Vite SPA)
cd sectors/health && npm ci && npm run typecheck && npm test && npm run build

# backend (NestJS)
cd sectors/health/backend && npm ci && npx tsc --noEmit
TEST_DATABASE_URL=postgresql://<role>@<host>:5432/<db> npm test   # real PG (or PGlite fallback)
```

## Deliberately NOT done (requires architectural decision / approval)

- Runtime auth-flow integration (sector accepting BEYU-asserted identity vs.
  bridged JWT) — architectural decision.
- Sector API exposure through BEYU governed APIs — architectural decision.
- Supabase/Redis/Vercel deployment wiring — BLOCKED (no real credentials).
- Removing constitutional roles from the sector's *reference catalog* — the
  catalog is preserved (no destructive change); the grants path refuses them.
