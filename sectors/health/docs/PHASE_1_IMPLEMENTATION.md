# Phase 1 — Identity, Authentication, Authorization & Tenant Foundation

**Status:** Partial — core security layer implemented, built, and tested. Persistence/integration wiring is deferred to deployment (see "Remaining work").

Implements Master Prompt Phase 1 (identity/authn/authz/tenant foundation) at the **backend service boundary**, fixing the two critical audit findings that the previous state was vulnerable to:

- **No real authentication** — `auth.service.ts` returned a canned JWT for a hardcoded user.
- **Unauthenticated, service-key Supabase proxy bypassing RLS** — anyone could read/write every tenant's data.

## What was implemented

### 1. Canonical server-side permission & role model
`backend/src/common/security/permissions.ts`
- `Permission` / `RoleId` / `RoleDefinition` types and a single authoritative `ROLE_DEFINITIONS` matrix (trustee…moh-official).
- Helpers: `permissionsForRole`, `hasPermission`, `effectivePermissions` (role + explicit grants for break-glass).

### 2. Tenant context (request-scoped actor)
`backend/src/common/security/tenant-context.ts` + `tenant-context.middleware.ts`
- `AsyncLocalStorage`-based `ActorContext` (userId, email, role, permissions, tenantId, organizationId, licenceNumber).
- A global middleware establishes a store per request; `JwtAuthGuard` enters the authenticated actor.

### 3. RBAC/ABAC enforcement guards
`backend/src/common/security/`
- `require-permission.decorator.ts` — `@RequirePermission('phi:read', …)`.
- `permissions.guard.ts` — registered as a **global `APP_GUARD`**; denies by default when the actor lacks a required permission.
- `tenant-scope.guard.ts` — tenant isolation: resolves target tenant from header/path/query and denies cross-tenant access unless the actor holds `tenant:switch`.

### 4. Real authentication
`backend/src/modules/auth/`
- `auth.service.ts` — real register/login/refresh with **bcryptjs** password hashing (no native build issues on Node 22), real user lookup via `UserRepository`, and JWT access/refresh tokens carrying `role`, `tenantId`, and a unique `jti` (enables rotation/revocation).
- `jwt.strategy.ts` / `jwt.guard.ts` (`JwtAuthGuard`) — parses the token and enters the actor context.
- `users/user.repository.ts` — `UserRepository` abstraction with an `InMemoryUserRepository` (tests/dev); swap for a TypeORM/Supabase implementation at deploy time.

### 5. Hardened, authenticated Supabase proxy
`backend/src/modules/supabase/`
- Every route now requires `JwtAuthGuard` + `TenantScopeGuard` and declares permission requirements.
- Tenant-scoped reads/writes (defence-in-depth): rows on tenant tables are filtered to the actor's tenant, and `tenant_id` is bound server-side (never trusted from the client).

### 6. Backend made buildable
- Fixed the broken dependency tree: `@nestjs/typeorm` 9→10 (NestJS-10 compatible), legacy `apollo-server-express` → `@apollo/server`, `short-uuid` 4.2.3→5.2, `bcrypt` → `bcryptjs`, added `passport-jwt`.
- Fixed 5 compile errors; `npm run build` PASSES.

## Quality gates
| Gate | Result |
|---|---|
| Backend build (`npm run build`) | ✅ PASS |
| Backend unit tests (`npm test`) | ✅ 19 tests PASS (permissions, guards, auth service) |
| Frontend typecheck (`npm run typecheck`) | ✅ PASS (baseline) |
| Frontend build (`npm run build`) | ✅ PASS (baseline) |
| Frontend unit tests (`npm test`) | ✅ 9 tests PASS (baseline) |

## Remaining work (Phase 1 completion)
- **Persistence**: replace `InMemoryUserRepository` with a Supabase Auth / TypeORM-backed user store (requires valid, rotated credentials).
- **RLS via user-context**: when identity is Supabase-backed, switch the proxy client to the user-context (anon key + user token) so Postgres RLS applies directly (currently app-layer tenant scoping is the isolation mechanism).
- **MFA, session revocation list, rate limiting, break-glass audit** (next increments).
- **Frontend login wiring**: connect the demo login screen to `/auth/login` and store the returned tokens.
- Version the schema migration for the new tenant/auth tables.

> No requirement here is marked complete without evidence — the tables above and the passing test suites are the evidence for what is genuinely implemented.
