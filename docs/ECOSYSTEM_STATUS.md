# BEYU OS — Canonical Ecosystem Status

**Status vocabulary used in this document (no other meaning is implied):**

| Label | Meaning |
|---|---|
| CURRENT IMPLEMENTATION | Verified against current `main` source on the audit date below |
| HISTORICAL STATE | True at the time it was written; not re-verified, not current proof |
| UNRESOLVED GAP | Real gap on current `main`, fix designed but not yet implemented |
| EXTERNAL DEPENDENCY | Requires human-controlled credentials, platforms or DNS outside the repo |
| PRODUCTION VERIFIED | Observed against the running production system with evidence |
| PRODUCTION UNVERIFIED | Claimed nowhere; runtime evidence unavailable from this environment |

**Audit date:** 2026-09-24 (UTC)
**Audited commit (initial `main` SHA):** `e4b05e30aca36c61a677a6d6fc7fe56371e678bf`
**Implementation branch:** `arena/01a0d497-beyu-os-1-0`
**Auditor position:** autonomous implementation session; every claim below traces
to a file, a test, or a command run in this session — not to prior reports.

> HISTORICAL REPORTS. The repository carries many `*_REPORT.md`,
> `*_CERTIFICATION*.md` and `PHASE_*.md` files at root and under `docs/`.
> They are HISTORICAL STATE: preserved evidence of what was true when each was
> written. They are not proof of current state. This document is the ONE
> canonical current ecosystem status; where it conflicts with an older report,
> this document (and the source it cites) governs.

---

## 1. Identity — CURRENT IMPLEMENTATION

- ONE canonical human identity: `GlobalUserID = users.id`, resolved through
  the graph Party → User → Tenant → Entity (`src/lib/identity.ts`,
  `IDENTITY_VERSION = identity-graph-1.0.0`).
- Two login identities for one party is `DATA_CONFLICT`
  (`assertSingleGlobalUser`); email is a lookup key, never the authorization
  identity.
- Federation endpoints CURRENT IMPLEMENTATION:
  `POST /api/v1/internal/identity/register` (idempotent by email, issuer-bound
  to its own sector, canonical account has a random never-disclosed
  credential) and `POST /api/v1/internal/identity/lookup` (email or
  GlobalUserID, lifecycle status, 404 otherwise).
- **Fixed in this branch:** `UJENZI_OS` was missing from the federation
  surface while being a canonical Sector OS everywhere else. Added to
  `INTERNAL_SERVICE_ISSUERS` (`src/lib/internal/service-auth.ts`), the
  register `sector` enum, the events `source` enum, plus migration `0070`
  (explicit `service_principals` row so per-issuer SUSPEND/REVOKE governs
  Ujenzi). Proven by `tests/internal/identity-internal.test.ts`:
  SAME human + SAME tenant across HEALTH_OS → FINANCE_OS → UJENZI_OS resolves
  to ONE GlobalUserID with exactly one `users` row.

## 2. Authorization — CURRENT IMPLEMENTATION

- ONE authoritative runtime model: static `ROLES`/`PERMISSIONS` in
  `src/lib/constants.ts`, evaluated by `can()` in `src/lib/authz.ts`
  (RBAC grant AND ABAC chain: classification ceiling, tenant/entity scope,
  high-risk MFA step-up, delegation bounds).
- The database `role_permissions` table is a **generated mirror** (seeded from
  `ROLES` in `src/db/seed.ts`), parity-validated by
  `assertPermissionCatalogParity()` and executed in
  `tests/identity/identity-graph.test.ts`. Static catalogue = canonical;
  DB table = derived representation. No silent drift path.
- UI visibility is not authorization: every `/os/*` sector entry re-runs
  server-side checks (`requirePrincipal`/`requireAccess` + tenant-scope
  resolution); deep links cannot authorize.

## 3. Tenant / Entity / Country / OS context — CURRENT IMPLEMENTATION

- Server-side resolution only: `tenantScopeIds` / `withTenantDatabaseContext`
  (`src/lib/tenant-scope.ts`), `resolveOperatingSystemTenant`
  (`src/lib/operating-systems.ts`). Hostname/subdomain is routing input and
  can only ever NARROW (refuse); it never grants.
- Sector OS catalogue (presentation + authorization agree):
  `src/lib/operating-system-catalog.ts` → BEYU control plane + FINANCE,
  HEALTH, AGRICULTURE, FOUNDATION, UJENZI sector destinations; DB
  `os_registry` carries BEYU_OS, the four sector OSs plus UJENZI_OS
  (ACTIVE), SHARED_HCM / SHARED_FAMILY_OFFICE / SHARED_SEARCH (shared
  capabilities, never OSs), HIVE_RUNTIME, and MINING_OS (DRAFT).
- Family Office = `SHARED_FAMILY_OFFICE` capability; HCM = `SHARED_HCM`
  capability; Foundation = nonprofit sister organization surfaced through
  governed Foundation routes (`/os/foundation/*`, `/api/v1/foundation/*`).
  No `FAMILY_OFFICE_OS`, no `HCM_OS` exists.

## 4. Tenant-domain registry — CURRENT IMPLEMENTATION (code) / EXTERNAL DEPENDENCY (platform)

- Canonical registry `tenant_domains` (migrations 0063–0065), governed
  lifecycle service, DNS TXT challenge verification
  (`src/lib/tenant-domain/*`), exact-hostname resolution through RLS.
- Seeded namespaces: `health.beyuos.co.tz` (OS_BASE) and
  `familyoffice.beyuos.co.tz` (CAPABILITY_BASE), both honestly recorded as
  `DOCUMENTED` + `PLATFORM_DEPLOYMENT_CONFIG` — application recognition, not
  runtime-verified DNS fact.
- **Namespace note (CURRENT IMPLEMENTATION — configuration state, NOT
  permanent identity):** the current repository/deployment configuration uses
  `beyuos.co.tz` as the active domain namespace (seed rows, code examples,
  docs, test fixtures). This is configuration state and is replaceable when
  BEYU acquires and governs a different production domain. It is NOT a
  permanent architectural identity, NOT an immutable constitutional value, and
  NOT the permanent BEYU OS canonical domain. BEYU OS identity
  (GlobalUserID, tenant, entity, OS, authorization, governance, Noelia) is
  domain-independent and never rewrites on a domain change; tenant
  reachability resolves through governed `tenant_domains` registry rows,
  which is what makes a future domain migration a controlled
  configuration/governance operation. No future domain is assumed or named
  here. DNS records, certificates and Vercel domain mappings remain
  EXTERNAL DEPENDENCY (human-controlled platform steps).
- Custom-domain status: CODE SUPPORT only. DNS CONFIGURED / VERCEL DOMAIN
  CONFIGURED / ROUTING VERIFIED / PRODUCTION VERIFIED are all
  PRODUCTION UNVERIFIED (no Vercel/DNS access from this environment).

## 5. API federation — CURRENT IMPLEMENTATION

- There is no class named `BeyuBaseAdapter` in current `main`, and none is
  introduced (no parallel architecture). The canonical service-to-service
  fabric is: `guardedInternal` envelope (`src/lib/internal/api.ts`) +
  HS256 service tokens with allowlisted issuers and 300s lifetime
  (`src/lib/internal/service-auth.ts`) + per-issuer status registry with
  fail-closed checks on every internal endpoint
  (`src/lib/internal/service-principals.ts`) + correlation/causation/
  idempotency-key contract on the events envelope + the Health sector
  transactional outbox + dispatcher (`sectors/health/backend/src/modules/events/`).
- **Fixed in this branch:** `POST /api/v1/internal/events` accepted any
  allowlisted issuer token with any `source` (cross-sector attribution
  spoof). It now enforces `token.iss === body.source` with an audited
  `ISSUER_SOURCE_MISMATCH` 403 denial, mirroring the register endpoint's
  `ISSUER_SECTOR_MISMATCH`. Proven in `tests/internal/events-internal.test.ts`
  (spoof denied + audited + no receipt claimed; UJENZI_OS publish accepted
  with exactly-once semantics).
- Service credentials never reach browser code: the Health SPA's only network
  surface is same-origin `/health-os/auth/*`, proxied only when
  `HEALTH_API_URL` is configured, otherwise 404 fail-closed
  (`next.config.ts`, `scripts/build-health-spa.mjs`).

## 6. Governance — CURRENT IMPLEMENTATION

- Governed actions flow through the governance services
  (`src/lib/governance/*`, voting/decision/appointment/charter contracts);
  high-risk permissions require MFA step-up (`HIGH_RISK_PERMISSIONS` in
  `can()`); unavailable governance fails closed (denial, never fabricated
  approval). Self-recusal and conflict controls are implemented in the voting
  service. No change required in this branch.

## 7. Finance — CURRENT IMPLEMENTATION

- FINANCE_OS is the sole accounting authority; every posting passes
  `requireCapability("CAP_POSTING")` (`src/lib/finance/posting-engine.ts`).
  **CAP_POSTING remains LOCKED** — no unlock, no fake posting state, no
  sector ledger. Sector financial consequences travel as governed events to
  Finance authorization. No change required in this branch.

## 8. Tax — CURRENT IMPLEMENTATION (code) / EXTERNAL DEPENDENCY (authority)

- Centralized Tax Engine (`src/lib/tax.ts`; TRA/VFD adapter behind the
  government gateway, `src/lib/government/*`) with `PENDING_EXTERNAL` /
  `EXTERNAL_BLOCKED` fail-closed states. No fabricated TRA submission or
  clearance exists in code. Live TRA connectivity is PRODUCTION UNVERIFIED
  (EXTERNAL DEPENDENCY: authority credentials and endpoints).

## 9. NOELIA / HIVE — CURRENT IMPLEMENTATION (code) / EXTERNAL DEPENDENCY (model backends)

- ONE canonical AI identity `NOELIA_AI`
  (`src/lib/noelia/canonical-identity.ts`, identity v2.0.0); contextual
  manifestations (BEYU/FINANCE/HEALTH/AGRICULTURE/UJENZI_OS) change tools and
  wording, never identity. No sector AI identities exist.
- Canonical appearance asset `/NOELIA.png` — single source of truth
  (`src/components/brand-assets.ts`, SHA-256 pinned, byte-equality tested).
- Noelia cannot self-authorize: the HIVE runtime boundary requires canonical
  transaction-scoped tenant context and re-checks authorization
  (`src/lib/noelia/hive-runtime.ts`); invocation carries principal, tenant,
  entity, classification and audit context. Live model-backend connectivity
  is PRODUCTION UNVERIFIED (EXTERNAL DEPENDENCY).

## 10. Events / Outbox / Audit — CURRENT IMPLEMENTATION

- ONE governed cross-system event model: sector transactional outbox →
  `POST /api/v1/internal/events` (atomic idempotency claim, exactly-once
  acceptance, 409 collision on cross-tenant/source key reuse) → immutable
  hash-chained `enterprise_events` ledger → reconciliation via
  `POST /api/v1/internal/events/status`.
- Audit covers authorization/governance decisions, inbound/outbound calls,
  failures, retries, blocks, approvals, AI invocations, financial events and
  provisioning, with GlobalUserID/service-principal/tenant/correlation/
  idempotency context. No passwords, tokens, secrets or MFA codes are logged.

## 11. Database / Supabase — CURRENT IMPLEMENTATION (code+local) / PRODUCTION UNVERIFIED (Supabase)

- ONE database authority: PostgreSQL; Supabase is the managed production
  host, not a second system (`pg` + Drizzle only; no Supabase Auth/client
  libraries by documented rule).
- 71 canonical migrations `0000–0070` (this branch adds `0070`), applied and
  checksummed in `beyu_migrations`; RLS is the final boundary; the runtime
  role is `beyu_runtime` (NOSUPERUSER, NOBYPASSRLS), provisioned by
  `scripts/setup-db-role.ts`; migrate/seed run only as the admin role.
- Migration integrity (`scripts/migration/integrity.ts`), deterministic
  re-runs, and RLS isolation suites all pass locally against real
  PostgreSQL 16.14 in this session.
- Production Supabase state (schema fingerprint, migration ledger, RLS,
  roles) is PRODUCTION UNVERIFIED — EXTERNAL DEPENDENCY (no Supabase
  credentials in this environment; nothing was connected, nothing assumed).

## 12. Production (Vercel) — PRODUCTION UNVERIFIED

- The repository builds (`npm run build`: brand check, identity build,
  Health SPA build, Next.js production build) and serves `/api/health`
  (`database: UP`) plus the `/os` surface locally in this session.
- GitHub `main` SHA → Vercel deployment SHA → running-app correspondence,
  production env, production migration state, and production RLS posture
  are PRODUCTION UNVERIFIED — EXTERNAL DEPENDENCY. Egress from this
  environment to `beyu-os-1-0.vercel.app` fails at TLS handshake, and no
  Vercel credentials exist here; no production claim is made.

## 13. Remaining UNRESOLVED GAPs — none found in executable scope

All gaps found during the current-`main` audit that could be fixed safely in
the repository were fixed in this branch (federation issuer coverage §1,
event attribution binding §5, migration + CI labels + count assertions).
Everything else is CURRENT IMPLEMENTATION or EXTERNAL DEPENDENCY.

## 14. Remaining EXTERNAL DEPENDENCIES (human action required)

| # | Dependency | Why required | Exact action required |
|---|---|---|---|
| 1 | Supabase access (`siyzygezdmlxbvwttrdz`) | Apply/verify migrations 0000–0070, RLS, runtime role on production PostgreSQL | Human runs `npm run migrate` with `BEYU_ADMIN_DATABASE_URL` (session pooler) and `scripts/setup-db-role.ts`, then `npm run certify` |
| 2 | Vercel project access (`beyu-os-1-0`) | Confirm deployment SHA tracks `main`, set production env (`DATABASE_URL` runtime pooler, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `BEYU_INTERNAL_SERVICE_TOKEN`, `HEALTH_API_URL` if the sector backend is deployed) | Human verifies deployment + env in Vercel dashboard |
| 3 | DNS control for the active configuration namespace (`beyuos.co.tz` today; replaceable, no future domain assumed) | Custom OS-base and tenant-subdomain routing | Human creates DNS records + wildcard certificate + Vercel domain mappings; any future namespace replacement is a governed configuration operation (§4) |
| 4 | Sector backend deployments (Health NestJS API; any Agriculture/Finance/Ujenzi remote backends) | End-to-end sector sign-in and event dispatch beyond the mounted SPA | Human deploys sector backends, sets `HEALTH_API_URL`, provisions sector secrets |
| 5 | External authority credentials (TRA, NIDA, NHIF, DHIS2, model backends) | Live Tax/government/HIVE verification | Human provisions credentials in the deployment secret store; until then the code correctly reports PENDING/BLOCKED |
| 6 | Production promotion decision | Merge + deploy | HUMAN PRODUCTION GATE — explicitly not taken by this session |

## 15. Verification evidence (this session)

- `npx tsx scripts/migration/integrity.ts` → MIGRATION INTEGRITY PASSED
- `npm run migrate` → 71/71 applied; re-run deterministic (fingerprint stable)
- `npm run typecheck` → PASS; `npm run lint` → PASS (1 pre-existing warning)
- `npm run build` → PASS (Next.js production build, all `/os/*` routes)
- `npm test` with live server (`BEYU_TEST_BASE_URL=http://127.0.0.1:3100`,
  `/api/health` = `database: UP`, CI-complete env) → **4949 passed,
  11 skipped, 0 failed (4960 total; 300 files: 297 passed, 3 skipped)**.
  The 11 skips are the CI-expected bootstrap skips (enrollment needs
  `BEYU_BOOTSTRAP_SECRET`; foundation/preparation need
  `BEYU_FOUNDATION_TEST_DATABASE_URL` — neither is set in CI either), within
  the CI skip tolerance of 15. Includes the 5 new federation tests and the 17
  runtime-role tests, all passing.
- Production runtime checks → NOT RUN (no access); recorded as
  PRODUCTION UNVERIFIED, never as success.
