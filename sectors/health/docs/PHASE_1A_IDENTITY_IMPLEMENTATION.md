# BEYU Health OS — Phase 1A: Production Identity Completion

**Status:** Implemented → Tested → Verified → Documented (persistence + authn/authz/session/audit), with documented external-dependency limits.

**Starting HEAD:** `f3d2898` · **Final HEAD:** see git log at end of this phase.

This phase converts the Phase 1 security foundation into a **persistent, production-grade identity, authentication, authorization and tenant foundation**, and wires the frontend to real backend authentication.

---

## 1. Architecture

Preserves the canonical BEYU identity chain:

```
IdentityProvider (persistent store)
   → BEYU Identity Layer (beyu_identity schema)
   → Authentication (bcrypt + JWT + refresh rotation)
   → Authorization (RBAC + tenant scope, deny-by-default)
   → GlobalUserID (tenant-independent canonical id)
   → Tenant Context (request-scoped, server-derived)
   → Entity Context
   → Sector OS → Domain Operations
```

No independent identity authority is invented. AI (Noelia/HIVE) remains subject to the same identity/authn/authz/tenant/audit controls as every human actor.

## 2. Identity data model

Schema: `beyu_identity` (PostgreSQL). Source of truth: `backend/src/modules/identity/identity-schema.ts`. Migrations are generated from it (`backend/database/migrations/001_identity_foundation.{up,down}.sql`) plus a ledger-based runner (`backend/src/database/migration-runner.ts`).

| Table | Purpose |
|---|---|
| `users` | Global user: `global_user_id` (uuid, canonical, NOT email), `email` (unique login identifier), `display_name`, `password_hash` (bcrypt), `account_status`, `auth_status`, `last_authenticated_at` |
| `tenants` | `tenant_id`, `tenant_code` (unique), `name`, `status`, `metadata` |
| `tenant_memberships` | `(global_user_id, tenant_id)` **unique** — a user's role per tenant |
| `roles` | central role catalog (seeded) |
| `permissions` | central permission catalog (seeded) |
| `role_permissions` | explicit role→permission assignments (seeded, persistent mirror of the canonical catalog) |
| `sessions` | `session_id`, `refresh_token_hash` (**SHA-256 of the raw token — never raw**), `jti`, `status` (active/rotated/revoked/expired), `expires_at`, `rotated_from` (rotation chain) |
| `auth_events` | WHO/WHAT/WHEN/TENANT/RESULT/REASON audit trail |

## 3. GlobalUserID
`global_user_id` is a stable uuid independent of tenant, sector, country, role, email and phone. Email is a login identifier, not the identity key. `sub` of the JWT = `global_user_id`.

## 4. Authentication flow
1. `POST /auth/login` → verify bcrypt password, check `account_status === 'active'`, resolve tenant + role **server-side** from membership, issue access token (15m, `jti` unique) + create a session (hashed refresh token).
2. Refresh token is set as an **httpOnly, SameSite=Lax cookie** (`beyu_refresh`) — browser JS never sees it.
3. `POST /auth/refresh` → **rotate** (mark old session `rotated`, create chained session + new token). **Reuse detection**: replaying an already-rotated token revokes the family and denies.
4. `POST /auth/restore` → session restoration from the cookie (app load).
5. `POST /auth/logout` → revoke the session and clear the cookie; `POST /auth/logout-all` → revoke all sessions.

## 5. Authorization flow
- `JwtAuthGuard` authenticates and enters the actor's `TenantContext`.
- Global `PermissionsGuard` (deny-by-default) enforces `@RequirePermission(...)` from the canonical catalog.
- `TenantScopeGuard` enforces tenant isolation: cross-tenant scope is denied unless the actor holds `tenant:switch`.
- Failure at any stage (authn → account status → membership → role → permission → tenant scope) denies access.

## 6. Tenant isolation model
Server derives tenant context from authenticated identity + persistent membership. `tenant_id` from request body/query/frontend state is **never trusted**. Cross-tenant reads/writes/operations fail closed. Negative integration tests prove Tenant A cannot act in Tenant B.

## 7. Session model
Persistent sessions with hashed refresh tokens, rotation chains, reuse detection, per-session access-token `jti`, per-session revocation, and global (invalidate-all) logout.

## 8. MFA / step-up model
`MfaService` provides an explicit state model (`none | mfa_enrolled | mfa_verified | step_up_required`) and a `MfaProvider` abstraction. **Honest status: no external MFA provider is connected**, so the provider is `UnavailableMfaProvider` and step-up **fails closed** — verification is always denied until a real provider is wired. Sensitive actions can call `requireStepUp`, which will not weaken authorization while unconnected.

## 9. Frontend auth
`src/services/auth.ts` (real API client) + `src/auth/AuthContext.tsx` (`AuthProvider`, `useAuth`).
- Login/logout/session-restoration/loading/unauthorized/expired-session handling, protected app gating.
- Access token in **memory only** (never localStorage); refresh token in httpOnly cookie.
- Authenticated API requests attach the bearer token; 401 triggers a single silent refresh then retry.
- `Login.tsx` is now a real email/password form (no demo role-switcher).

## 10. Supabase/database security
- Supabase proxy requires `JwtAuthGuard` + `TenantScopeGuard` + permission checks.
- `tenant_id` is bound server-side; client-supplied tenant is never trusted.
- Service credentials never reach the browser (supabase client uses anon/publishable key only; proxy uses service key server-side).
- **Honest note:** Postgres **RLS is not** asserted as protecting identity data in this phase — isolation is enforced at the application/guard layer and proven by negative tests. RLS policy wiring is listed as remaining work.

## 11. Security audit events
Persisted in `beyu_identity.auth_events` for: login success/failure, logout, token refresh/rotation, reuse detection, revocation, global logout, registration, MFA events, step-up denial, session-create failures. Records carry WHO (global_user_id), WHAT (event_type), WHEN, tenant, RESULT, REASON (context). Never stores plaintext passwords or raw tokens.

## 12. Password security
bcrypt (bcryptjs) hashing cost 12; passwords never stored/logged in plaintext; server-side verification; generic errors (no account enumeration); account status checked.

## 13. Database migrations
- `backend/database/migrations/001_identity_foundation.up.sql` / `.down.sql` (generated from the single source of truth).
- `backend/src/database/migration-runner.ts` — deterministic, transactional, idempotent (ledger `beyu_migrations`), reversible.
- Commands: `npm run migration:identity:up` / `:down`.

## 14. API endpoints
| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /auth/register` | public | register (role restricted to patient unless provisioned) |
| `POST /auth/login` | public | login → sets httpOnly refresh cookie |
| `POST /auth/refresh` | cookie | rotate refresh token |
| `POST /auth/restore` | cookie | session restoration |
| `GET /auth/me` | JWT | profile |
| `POST /auth/logout` | cookie | revoke session |
| `POST /auth/logout-all` | JWT | revoke all sessions |
| `GET /api/supabase/...` | JWT + tenant + permission | tenant-scoped data proxy |

**Intentional public endpoints:** `/health*` (liveness/readiness), `/auth/register`, `/auth/login`. Swagger UI at `/api/docs` is public in dev (documented; gate in prod).

## 15. Test evidence
Backend (`npm test`, 34 passing):
- Unit: canonical permission catalog, PermissionsGuard (allow/deny/no-decl/break-glass).
- **Real PostgreSQL integration** (PGlite, PostgreSQL 16 engine): user/tenant/membership persistence, unique constraints, login, invalid credentials, disabled account, JWT claims + unique jti, expired/malformed/forged token rejection, refresh rotation, reuse detection, session restoration, logout revocation, global logout, cross-tenant login denial, TenantScopeGuard cross-tenant denial + switch allow, audit-event persistence, no raw-token/no-plaintext storage, MFA fail-closed.

Frontend (`npm test`, 14 passing): RBAC client catalog, `cn`, and real auth client (login token-in-memory, no localStorage persistence, restore success/failure, logout clears token, AuthError on 401).

Builds: backend `npm run build` PASS; frontend `npm run build` PASS; `tsc --noEmit` PASS.

## 16. Security assumptions & external dependencies
- Real Postgres connection string comes from env (`DATABASE_URL` or `DB_*`). The backend app boots against a real DB; the sandbox has no standalone Postgres, so PGlite (real Postgres 16 engine) is used for integration tests.
- MFA provider is NOT connected (fails closed).
- Postgres RLS is not asserted; app-layer isolation is enforced and tested.

## 17. Unresolved limitations
- **MFA**: provider integration (TOTP/WebAuthn/SMS) pending — state model and fail-closed gate are in place.
- **Frontend live E2E**: requires a running backend + real DB to exercise the full login flow in a browser; auth client logic is unit-tested.
- **Persistent permission enforcement** currently uses the canonical in-memory catalog (mirrored/seed into `role_permissions`); DB-driven permission lookups per-request are deferred.
- **RLS**: tenant-row policies wiring and a user-context Supabase client are deferred.
- **Lint** is not configured in the backend; only typecheck/build/test are enforced.

## 18. BLOCKED BY / REQUIRED OWNER ACTION / UNVERIFIED
- **BLOCKED BY (external):** no standalone PostgreSQL server or Docker in the build sandbox; no MFA provider configured.
- **REQUIRED OWNER ACTION:** rotate the previously-compromised Postgres password and Supabase keys (see `SECRETS_REMEDIATION.md`); purge `origin/main` history; supply a real `DATABASE_URL` for production boot; connect an MFA provider to enable step-up.
- **UNVERIFIED:** live browser E2E against a real DB; Postgres RLS policy effectiveness; real MFA enrollment/verification.

---

## 19. Phase 1B addendum (2026-08-30)

Phase 1B (production hardening) resolves several items previously deferred here.
Authoritative detail: `docs/PHASE_1B_PRODUCTION_HARDENING.md`. Notable deltas:

- **DB-driven authorization freshness** — the per-request `AuthContextMiddleware`
  now resolves role/permissions **from the database** and enforces a
  `security_version` guard, so disabled accounts, membership revocation, and
  role/permission changes take effect on the **next** request (401
  `ACCOUNT_DISABLED` / `AUTHORIZATION_CHANGED` / `NO_TENANT_MEMBERSHIP`).
  This supersedes the §17 note about in-memory-only permission enforcement.
- **RLS implemented + verified** — policies added on `tenants`,
  `tenant_memberships`, `sessions`, `auth_events` and enforced for a non-owner
  role (`rls-isolation.spec.ts`); owner-bypass documented as the
  authorization-before-privileged-access pattern. Supersedes the §16/§17 RLS notes.
- **Backend lint configured** — `.eslintrc.js` added; `npm run lint` clean.
  Supersedes the §17 lint note.
- **Health liveness/readiness** — `/health/live` (dependency-free) and
  `/health/ready` (reflects DB, 503 on failure).
- **CSRF** — `SameSite=Lax` + `CsrfOriginGuard` on cookie-consuming endpoints.
- **Structured logging** — `JsonLogger` with secret redaction.

Test totals at Phase 1B close: **60 backend tests / 10 suites** (real PG16 via
PGlite), lint clean, build clean.

### 20. Phase 1C addendum (2026-08-30)

Phase 1C (production acceptance) added two hardening items verified offline and
recorded a BLOCKED acceptance status (see `docs/PHASE_1C_PRODUCTION_ACCEPTANCE.md`):

- **JWT `issuer`/`audience`** validation, config-driven via `JWT_ISSUER` /
  `JWT_AUDIENCE`, enforced in `JwtStrategy` and `AuthContextMiddleware`
  (backward-compatible; enforced when configured).
- **Boot-time fail-closed production guard** in `backend/src/main.ts`: refuses to
  start with default/absent `JWT_SECRET`/`JWT_REFRESH_SECRET` or a
  wildcard/localhost `CORS_ORIGIN` when `NODE_ENV=production`.

Acceptance: **BLOCKED** (live deployment gates unverifiable in this environment;
compromised credentials require owner rotation + history purge).
