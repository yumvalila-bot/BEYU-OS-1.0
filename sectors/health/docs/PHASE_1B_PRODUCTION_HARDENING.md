# BEYU Health OS — Phase 1B: Production Hardening

> **Follow-up:** Phase 1C (production acceptance) supersedes this phase's status
> for the overall readiness gate. See `docs/PHASE_1C_PRODUCTION_ACCEPTANCE.md`.
> In Phase 1C the leaked DB **hostname** referenced in this document was redacted
> to `<REDACTED_DB_HOST>`.

**Status:** Implemented → Tested → Verified, with honestly-scoped external/owner limits.
**Branch:** `arena/01a05116-health-os-1-0` (off `main` @ `69883d6`).
**Overall Phase 1B status:** `GREEN WITH EXTERNAL DEPENDENCIES` (core hardening is
implemented and verified on a real PostgreSQL engine in-process; live-DB boot,
MFA provider, and live-browser E2E remain `BLOCKED` and are owned outside this
environment).

Every claim below was verified by direct execution (build / lint / tests on a
genuine PostgreSQL 16 engine via PGlite). Nothing is asserted from assumption.

---

## 1. Live-Database Boot — `BLOCKED` (no infrastructure)

A fresh audit of the environment found **no live database to connect to**:

- No `DATABASE_URL` / `DB_*` / Supabase env vars in the shell; no `.env` file.
- No Docker, no local PostgreSQL packages/binaries, no listener on `:5432`.
- `<REDACTED_DB_HOST>` does not resolve (DNS failure).

**Implication:** a true "boot the API against a deployed Supabase/Postgres and
run live E2E" gate cannot be executed here. This is **not** converted to a pass;
it is an explicit `BLOCKED` external item.

To keep the identity work verifiable against a *real* PostgreSQL engine, tests
run against **PGlite** — a WASM build of PostgreSQL 16.4 — through the same
`DbConnection` abstraction and the **same parameterized SQL** used in
production. PGlite is a genuine Postgres engine and is used strictly as the
deterministic SQL test bed; it is **not** presented as deployed-Supabase proof.

## 2. Migration verification — `GREEN`

- Migration `001_identity_foundation.{up,down}.sql` is **regenerated from the
  single source of truth** (`identity-schema.ts`) and now includes:
  - `users.security_version integer NOT NULL DEFAULT 0` (authorization-freshness
    guard),
  - Row-Level Security enable + policies on `tenants`, `tenant_memberships`,
    `sessions`, `auth_events`.
- A `migration-consistency.spec.ts` re-applies the **exact committed `.up.sql`**
  to a fresh PostgreSQL 16 engine and asserts `security_version` and all four RLS
  policies are present — so the migration and the schema source cannot drift.
- A ledger-based runner (`migration-runner.ts`, `beyu_migrations`) applies it
  exactly once, in a transaction.

## 3. Supabase / Row-Level Security — `GREEN` (assessment + implementation)

**Assessment:** RLS is defense-in-depth, not the primary boundary. The
application performs tenant authorization in middleware **before** it uses a
privileged (table-owner) connection; as table owner, PostgreSQL bypasses RLS by
design. This is the **"authorization before privileged access"** pattern.

**Implementation (added):**
```
ALTER TABLE ...tenants / tenant_memberships / sessions / auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_isolation USING (current_setting('app.tenant_id', true) = tenant_id::text);
-- tenant_memberships also has WITH CHECK (same predicate).
```
- A NON-OWNER database role can only read/write rows whose tenant matches the
  server-set session variable `app.tenant_id`.
- `users`, `roles`, `permissions`, `role_permissions` intentionally have **no**
  tenant RLS (users are global identity; roles/permissions are platform
  reference data) — governed by the application authorization layer only.
- **Verified** (`rls-isolation.spec.ts`) by running as a freshly-created
  non-owner role via `SET ROLE` on a real PG16 engine:
  - with `app.tenant_id=A` → sees only tenant A rows,
  - with `app.tenant_id=B` → sees only tenant B rows,
  - with **no** `app.tenant_id` → sees **nothing** (deny-by-default / fail-closed),
  - the owner connection still sees all rows (documented RLS bypass).
- **Owner-bypass limitation is documented, not hidden:** RLS is verified for the
  non-owner boundary; the privileged app role bypasses it by design and must
  rely on the middleware/guard authz (Section 4).

## 4. DB-driven authorization freshness — `GREEN`

Authorization data is now resolved **server-side from the database on every
request** — token claims are never trusted for role/permissions.

New global middleware `AuthContextMiddleware` (runs before all guards, so guard
order is irrelevant) for each request with a Bearer token:

1. Verifies signature + expiry (`JwtService`).
2. Loads the user **from the DB** (`findUserById`).
3. `account_status !== 'active'` → **401 `ACCOUNT_DISABLED`** (audited).
4. `token.sv !== users.security_version` → **401 `AUTHORIZATION_CHANGED`**
   (audited). `security_version` is bumped by every `setMembershipRole`,
   `revokeMembership`, `bumpSecurityVersion` (disable / role / membership /
   permission change) **in the same transaction**.
5. Loads `findActiveMembership` — none → **401 `NO_TENANT_MEMBERSHIP`** (audited).
6. Loads role/permissions **from the DB** (`permissionsForRole`), then enters the
   request-scoped `TenantContext` via `run(...)` (scoped — no cross-request leak).

**AsyncLocalStorage correctness:** the context is established with `run(actor,
() => next())`, not the leak-prone `enterWith`. Verified in tests that the actor
does not leak outside the request chain, and that a disabled / role-changed /
membership-revoked account is denied on the **next** request.

**Tests** (`auth-context.middleware.spec.ts`, real PG16): valid+current token
allowed with DB-derived role/permissions; stale-sv → denied; disabled →
`ACCOUNT_DISABLED`; membership revoked → `NO_TENANT_MEMBERSHIP`; no token → no
actor. DI wiring verified (`auth-wiring.spec.ts`).

## 5. Session hardening + CSRF — `GREEN`

- Refresh token lives in an **`httpOnly`, `SameSite=Lax`** cookie (`Secure` in
  production), `path=/`, rotated on each refresh with reuse detection, stored as
  a **SHA-256 hash only** (never raw). Access token is held in memory, not a
  cookie.
- `SameSite=Lax` already prevents the cookie from being attached to cross-site
  POST requests. **Defense-in-depth added:** `CsrfOriginGuard` on the
  cookie-consuming endpoints (`refresh`, `restore`, `logout`) rejects
  disallowed `Origin` and any `Sec-Fetch-Site: cross-site` request.
  Allow-list from `CSRF_ALLOWED_ORIGINS` (fallback `CORS_ORIGIN`); a wildcard or
  missing allow-list fails closed. Native clients (no Origin / body-carried
  refresh token) are unaffected.
- **Tests** (`csrf-origin.guard.spec.ts`): matching origin allowed; disallowed
  origin rejected; cross-site rejected regardless of origin; no-header native
  request allowed; wildcard/missing allow-list fail closed.

## 6. MFA — fail-closed interface documented (provider `BLOCKED`)

The MFA abstraction (`MfaService`) is fail-closed: without a configured provider,
MFA is **not** claimed as implemented. Enrolling/verifying without a real
provider returns denial; the interface is documented so a provider (TOTP/WebAuthn)
can be plugged in. **No provider is asserted as wired** — that is an external
item.

## 7. Frontend live E2E — `BLOCKED`

There is no deployed backend/database to run live browser E2E against (see §1).
Frontend unit tests remain green from Phase 1A; live E2E is an external item.

## 8. Security matrix — `GREEN` (documented)

Threat/control matrix updated in `BEYU_HEALTH_OS_AUDIT_AND_GAP_MATRIX.md`
(Phase 1B section) covering: token-theft revocation (sv guard + session
revocation), disabled-account enforcement, tenant isolation (RBAC + RLS),
CSRF, cookie flags, secret handling, and fail-closed readiness.

## 9. Backend lint — `GREEN`

A standard NestJS-style `.eslintrc.js` (TypeScript + Prettier) was added (the
deps were present but no config). `npm run lint` is clean (0 errors). Prettier
formatting was applied repo-wide for consistency.

## 10. Secret scan (git history + tree, incl. `origin/main`) — `GREEN` (with critical owner action)

- **Working tree:** clean — only safe `.env.example` present; no live secrets.
- **Active-branch history:** **clean.** The active branch was rewritten in Phase 0
  so that the secret blobs are **not reachable from `HEAD`** (`69883d6` is not an
  ancestor; `git log HEAD -- .env .env.local …` returns nothing).
- **`origin/main` (default remote branch @ `69883d6`):** **still contains live
  credentials** that were committed in that base commit:
  - `.env` → `postgresql://postgres:<password>@<REDACTED_DB_HOST>:5432/postgres`
  - `.env.local` → Supabase URL + publishable key
  - `NEXT_PUBLIC_SUPABASE_URL=httpssiyzy.txt` and
    `VITE_SUPABASE_URL=httpstxcqhrhmredi.txt` → Supabase URL + publishable/anon key,
    including a password-like value.

**Owner action required (not performable from this sandbox without destructive
force-push to the default branch):**
1. **Rotate** the leaked database password and all Supabase keys immediately,
   even though the DB host currently does not resolve.
2. **Purge history** on `origin/main` (e.g., `filter-repo` / BFG) and force-push;
   keep the secret file names in `.gitignore` (done in Phase 0 for the active
   branch's tree).
See `docs/SECRETS_REMEDIATION.md`.

## 11. Deployment-config audit — `GREEN` (with production notes)

- `backend/Dockerfile`: multi-stage build, `node:20-alpine`, `dumb-init`,
  `npm ci`, production-only deps, `HEALTHCHECK` → `/health`. Good baseline.
- `backend/docker-compose.yml`: local **dev** only — placeholder
  `POSTGRES_PASSWORD: changeme`, `NODE_ENV: development`, live `src` mount,
  `start:dev`. **Production must:** inject real secrets via a secrets manager
  (never commit or hardcode), set `NODE_ENV=production`, build the image (no
  src mount), and gate readiness on `/health/ready` (which reflects the DB).
- The new `/health/ready` endpoint reflects the database dependency and returns
  **503 on failure**; `/health/live` is dependency-free (liveness must not be
  killed by a downstream outage). No secrets in any health response.

## 12. Liveness / readiness — `GREEN`

- `/health/live` → `200 {status:"alive"}` always (process liveness).
- `/health/ready` → reflects DB connectivity (`SELECT 1`); `503` when the DB is
  unreachable (fail-closed). No secrets/PII returned.
- **Tests** (`health.service.spec.ts`): liveness independent of DB; ready when
  DB reachable; 503 when DB unreachable; no secret leakage in output.

## 13. Structured observability — `GREEN`

`JsonLogger` emits JSON-lines (timestamp, level, message, optional context) and
**redacts known secret keys** (`password`, `token`, `secret`, `api_key`,
`authorization`, …) before anything reaches the log stream. Wired as the Nest
application logger. No raw tokens/PII are logged; security-relevant events are
already persisted in `auth_events` (WHO/WHAT/WHEN/TENANT/RESULT/REASON).
**Test** (`json-logger.spec.ts`): JSON shape, stderr for errors, secret redaction.

---

## Final verification (executed)

| Gate | Result |
|---|---|
| Backend build (`nest build`) | `GREEN` |
| Backend lint (`npm run lint`) | `GREEN` (0 errors) |
| Backend tests (real PG16 via PGlite) | `GREEN` — 60 tests / 10 suites |
| Migration regenerated + applies on fresh PG16 | `GREEN` |
| RLS non-owner enforcement | `GREEN` |
| DB-driven authz freshness | `GREEN` |
| CSRF Origin guard | `GREEN` |
| Health liveness/readiness | `GREEN` |
| Structured logging + redaction | `GREEN` |
| Live-DB boot | `BLOCKED` (no infra) |
| MFA provider | `BLOCKED` (interface only, fail-closed) |
| Frontend live E2E | `BLOCKED` (no backend/DB) |
| Secret rotation + history purge | `BLOCKED` (owner action) |

**Overall:** `GREEN WITH EXTERNAL DEPENDENCIES`.
