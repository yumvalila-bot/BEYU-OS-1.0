# Health OS — Frontend Integration Audit

**Mission:** bring the EXISTING Health OS implementation (`sectors/health/`) into the authenticated BEYU OS frontend at `/health` — integration only, no rebuild, no second Health OS, no second authorization model, no RLS bypass.

**Audit basis:** branch `arena/01a0adcf-beyu-os-1-0` @ `51f50b82ec236fa638dd2af619fa563a6a81903b` (== `main` == merged PR #65 state). Every claim below is traced to an actual file, CI workflow, or production URL. No assumption is recorded as fact.

---

## A. Repository baseline

| Fact | Evidence |
| --- | --- |
| Canonical repo | `yumvalila-bot/BEYU-OS-1.0` |
| HEAD | `51f50b82ec236fa638dd2af619fa563a6a81903b` — `feat(frontend): integrate governed BEYU shared features (#65)` (working branch branched from this commit; working tree clean at audit start) |
| PR #65 state present | `git log -n 10 --oneline` → single head commit is PR #65; prior forensic frontend integration audit work (e.g. `docs/FRONTEND_INTEGRATION_REALITY_AUDIT.md`, `docs/FRONTEND_INTEGRATION_IMPLEMENTATION_REPORT.md`) is on `main` |
| CI state on main | `gh run list --branch main` → run 35156738209 (`BEYU OS CI — PostgreSQL-backed security gate`) = **success**, all 7 jobs green: Committed secret scan, Root BEYU OS — PostgreSQL security gate, Health OS backend — real PostgreSQL gate, Health OS frontend verification, 3× Production dependency audit (critical only) |
| Canonical production | `https://beyu-os-1-0.vercel.app/` (Vercel; single Next.js project at repo root — **no** root `vercel.json`) |
| Target route | `https://beyu-os-1-0.vercel.app/health` |
| Root app stack | Next.js 16.3.3 + React 19.2.6 + Tailwind 4 + Drizzle ORM + `pg` (`package.json`, `next.config.ts`, `src/db/`) |
| Root CI contract | `.github/workflows/ci.yml` — PG16 service container; runtime role `beyu_runtime` (NOSUPERUSER NOBYPASSRLS) is the role the HTTP/E2E suite runs against; migrations 0000–0032 via `scripts/migrate.ts` only; `next start` + full vitest regression; skip-count tolerance 15 |
| Session pinning | This Arena session is pinned to `arena/01a0adcf-beyu-os-1-0` (documented per mission §XXII; all commits/PR work happen on this branch) |

## B. Health source tree (`sectors/health/`)

Provenance: `git subtree add --prefix=sectors/health` from `yumvalila-bot/HEALTH-OS-1.0` @ `06053179` — `sectors/health/INTEGRATION.md`.

```
sectors/health/
├── README.md                    # documents the SPA (React 19 + Vite 7 + Tailwind 4, single-file build)
├── INTEGRATION.md               # sector boundary contract (BEYU governs, sector executes)
├── package.json                 # "react-vite-tailwind" — vite 7, vite-plugin-singlefile, vitest
├── vite.config.ts               # alias @→src; dev proxy /auth,/api → localhost:3000 (standalone dev only)
├── vercel.json                  # standalone-deployment config: rewrites /api,/auth,/health,/graphql → ${HEALTH_API_URL}; CSP
├── index.html                   # SPA shell (root div + /src/main.tsx; Google Fonts links)
├── package-lock.json            # audited by CI (production-dependency-audit, critical)
├── .env.example                 # documents VITE_API_BASE_URL=http://localhost:3000 (standalone dev)
├── tsconfig.json                # strict; noUnusedLocals; excludes nothing (own toolchain)
├── vitest.config.ts
├── src/                         # FRONTEND (see §C)
├── backend/                     # BACKEND — NestJS 10 (see §D)
│   ├── package.json             # "beyu-health-os-backend": @nestjs/* 10, typeorm, @apollo/graphql, jest, PGlite
│   ├── database/migrations/     # 001–030 up/down pairs (see §E)
│   └── src/                     # main.ts, app.module.ts, common/, config/, modules/, integrations/, test/e2e/
├── supabase/
│   └── migrations/20260724062158_remote_schema.sql   # LEGACY reference export (see §E)
├── supabase-schema.sql / supabase-enterprise-schema.sql / supabase-enterprise-full-schema.sql
│                                # LEGACY "run in SQL editor" reference files — NOT canonical
├── docs/                        # sector runbooks: DEPLOYMENT_GUIDE, HEALTHCARE_INTEGRATIONS,
│                                # PHASE_1A–1F identity/hardening/RLS verification, SECURITY_COMPLIANCE,
│                                # BEYU_HEALTH_OS_AUDIT_AND_GAP_MATRIX, backend-architecture, supabase-architecture
├── coverage/                    # generated coverage output (present in tree)
├── "beyu health os"/            # stray Visual Studio .sqlproj artifact (non-code)
└── ENGINEERING_READINESS_REPORT.md / IMPLEMENTATION_STRATEGY.md / ENTERPRISE_UPGRADE_GUIDE.md
```

## C. Health frontend inventory

- **Framework:** React 19.2.6 + TypeScript 5.9 + Vite 7.3 + Tailwind CSS 4 + `clsx`/`tailwind-merge`; production bundle via `vite-plugin-singlefile` → one self-contained `dist/index.html` (measured build: **1,035.89 kB**, 263.75 kB gzip). `sectors/health/package.json`, `vite.config.ts`.
- **Entry point:** `sectors/health/index.html` → `src/main.tsx` → `React.StrictMode` + `AuthProvider` (from `src/auth/AuthContext.tsx`) + `App`.
- **No client router:** `src/App.tsx` switches an internal `stage` state (`"landing" | "login" | "app"`) and an `active` nav id. There are no URL routes inside the SPA — all navigation is in-memory. Therefore one document path (`/health/os` in the BEYU mount, see §I) is sufficient.
- **Views** (`src/views/`): `Landing` (marketing), `Login` (real email+password form → `services/auth.ts`), `Dashboards` (role dashboards: trustee/board/ceo/doctor/nurse/admin/pharmacy/lab/finance/patient + Modules + Governance), `Clinical` (dental/oncology/pediatrics/ICU/theatre/ER/radiology/telemedicine dashboards), `EMR` (patient chart), `ExtraScreens` (patient list, registrations, appointments, medical-reports-AI, prescriptions, maternity, HR, DAO governance, sovereign enterprise, **HiveAI**, **HIS/MTUHA**, tenant migration, planning, public health, research), `Final` (billing, inventory, audit/SIEM, notifications, profile, OpCo), `Governance` (trustee/board), `Applications`, `SecurityOps`, `Hierarchy`, `Settings`, `SmartContracts`, `Compliance`, `TaxOrchestration`, `NABH`, `PatientFlow`, `VIPScheme`, `DepartmentTest`, `StandaloneTest`.
- **Components** (`src/components/`): `Chrome` (Sidebar/TopBar), `AICoPilot`, `Charts`, `DocumentViewer`, `Flow`, `HRWidgets`, `Icons`, `Logo`, `Security`, (landing pieces).
- **Hooks/state:** `src/auth/AuthContext.tsx` (loading/authenticated/unauthenticated; restores session on load).
- **Services** (`src/services/`): `auth.ts` is the ONLY network surface — `fetch` with `credentials:"include"`, in-memory access token, silent refresh on 401, endpoints `POST /auth/login`, `POST /auth/refresh`, `POST /auth/restore`, `POST /auth/logout`, `GET /auth/me`. Base = `import.meta.env.VITE_API_BASE_URL ?? ""` (already a documented, existing build-time knob — `sectors/health/.env.example`). `compliance.ts`, `departments.ts`, `flow.ts`, `hr.ts`, `nabh.ts`, `rbac.ts`, `standalone.ts`, `tax.ts`, `vip.ts` are **static reference/mock data modules** (no network calls — verified by grep: the only `fetch`/`XMLHttpRequest`/`EventSource`/`WebSocket` in `src/` is `services/auth.ts`).
- **Mock data:** `src/data/mock.ts` (demo tenants `MUH-DSM-01`…`MOI-REG-05`, role catalog, module catalog), `src/data/documents.ts`.
- **Tests:** `src/services/auth.test.ts` (5), `src/services/rbac.test.ts` (6), `src/utils/cn.test.ts` (3) — **14/14 pass** (measured, §J).
- **Visual language:** navy `#0B1D3A`/gold `#D4AF37` tokens in `src/index.css` `@theme` (`README.md`) — same BEYU navy/gold family as the root app (root uses `#0b1f4d`/`#e7c45c` accents, e.g. `src/app/launcher/page.tsx`), so the sector UI stays visibly inside BEYU OS identity.
- **CSP note (true state):** the SPA `index.html` links Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`). The BEYU root CSP (`next.config.ts`) allows only `'self'`/`data:` for style/font — under the BEYU mount the font stylesheets are blocked and the UI falls back to system fonts. This is fail-closed, cosmetic-only, and **not** a reason to weaken the BEYU CSP.

## D. Health API inventory (NestJS backend)

Entry: `backend/src/main.ts` — helmet, compression, cookie-parser, global validation pipe, `DomainExceptionFilter`, `RateLimitExceptionFilter`, production boot guard (`validateBootEnvironment` + `assertProductionConfig`: refuses boot in production on known/insecure JWT secrets; optional adapters log `CONFIGURED|MISSING` booleans only, never values). No global prefix; controllers declare full paths.

| Controller (`@Controller`) | Files | Purpose |
| --- | --- | --- |
| `auth` | `src/modules/auth/auth.controller.ts` | register/login/refresh/restore/me/logout/logout-all/csrf-token — refresh token = httpOnly SameSite=Lax cookie (line 31/149); access token in body, held client-side in memory |
| `auth/mfa` | `src/modules/auth/mfa.controller.ts` | TOTP enroll/activate/challenge/verify/recovery/redeem/admin/reset |
| `api/patients` | `src/modules/patients/*` | patient register/read |
| `api/encounters` | `src/modules/encounters/*` | encounters |
| `api/clinical` | `src/modules/clinical/*` | clinical chart data |
| `api/lab` | `src/modules/laboratory/*` | LIS orders/results |
| `api/imaging` | `src/modules/radiology/*` | imaging orders/reports |
| `api/pharmacy` | `src/modules/pharmacy/*` | dispensing/stock |
| `api/billing` | `src/modules/billing/*` | billable services |
| `api/appointments` | `src/modules/appointments/*` | appointments |
| `api/eye-exams` | `src/modules/ophthalmology/ophthalmology.controller.ts` | ophthalmology (eye exams, optical devices, ophthalmic prescriptions, dispensing) |
| `api/dialysis`, `api/telehealth`, `api/ambulance` | `src/modules/dialysis|telehealth|ambulance/*` | specialty operations |
| `api/compliance` | `src/modules/compliance/compliance.controller.ts` | compliance controls/evidence, TZ compliance pack, NABH-style matrix |
| `api/events/outbox` | `src/modules/events/*` | BEYU integration outbox ops |
| `api/search` | `src/modules/search/*` | search |
| `api/integrations` | `src/modules/integrations/integrations.controller.ts` | external adapter availability/status |
| `fhir/R4` | `src/modules/fhir/fhir.controller.ts` | FHIR R4 resource endpoints |
| `reporting` | `src/modules/reporting/reporting.controller.ts` | MTUHA reporting (health.mtuha_reports) |
| `health` | `src/modules/health/health.service.ts` | backend status |

Guard/interceptor stack (`src/common/security/`): `auth-context.middleware.ts` (attaches `ActorContext` after JWT verification — `src/modules/auth/guards/jwt.guard.ts` + `strategies/jwt.strategy.ts`), `tenant-scope.guard.ts`, `permissions.guard.ts` + `require-permission.decorator.ts`, `mfa-stepup.guard.ts`, `clinical-safety.guard.ts`, `consent.guard.ts`, `legal-hold.guard.ts`, CSRF double-submit + origin guards, `rate-limiter.ts`/policies, `endpoint-tier.classification.ts` (tiers incl. NHIF/TMDA routes), `idor-matrix.spec.ts`/`idor-phase12-matrix.spec.ts` (adversarial IDOR evidence).

Interop/external adapters (`src/modules/integrations/`, `src/integrations/beyu/`): `adapter-registry.ts` is the ONLY path to external providers and fails closed with `Live integration is BLOCKED until credentials and endpoint are configured.` BEYU-side adapters: `identity.adapter.ts` (service tokens — `service-token.ts`/spec), `noelia.adapter.ts` (HIVE), `finance.adapter.ts`, `governance.adapter.ts`, `hcm.adapter.ts`, `tax.adapter.ts`, cross-domain orchestrator (`events/cross-domain-orchestrator.ts`), transaction envelope (`shared/transaction-envelope.ts`), clinical-safety gates.

**True external-adapter state (no production connectivity is claimed):**
- NHIF: `NHIF_API_BASE_URL`/`NHIF_API_KEY` env surface (`main.ts` boot list) + registry entries → **NOT CONFIGURED** without credentials.
- TMDA: `TMDA_API_BASE_URL` → **NOT CONFIGURED**.
- TRA: `TRA_API_BASE_URL` → **NOT CONFIGURED**.
- PACS/DICOM: `PACS_BASE_URL` → **NOT CONFIGURED** (adapter exists under `src/modules/interop/dicom`).
- HL7v2: engine present (`src/modules/interop/hl7v2`) — internal parsing/interfacing, no external endpoint.
- MTUHA: `MTUHA_API_BASE_URL` → submission adapter **NOT CONFIGURED**; engine + reporting tables exist.
- FHIR endpoint: `FHIR_ENDPOINT_BASE_URL` → **NOT CONFIGURED**; local R4 mapping resources exist.
- **DHIS2: only three env vars exist** (`DHIS2_URL`/`DHIS2_USERNAME`/`DHIS2_PASSWORD` in `backend/src/config/database.config.ts` lines 40–42). **No DHIS2 module, adapter, or engine exists in code** — labelled NOT IMPLEMENTED (config surface only). No DHIS2 claim is made anywhere in this audit.
- HIVE/Noelia: `BEYU_HIVE_ENDPOINT`/`BEYU_HIVE_TOKEN` → **NOT CONFIGURED**; `NoeliaAdapter` fails closed (BLOCKED, no fabricated responses) when unavailable.

## E. Health database inventory

**Canonical engine & topology** (`sectors/health/INTEGRATION.md`, `.github/workflows/ci.yml`): ONE PostgreSQL 16. Root CI runs Health migrations into the `beyu_health` database (ephemeral service container); production is Supabase-managed PostgreSQL (eu-west-3) per the CI header comment. The BEYU root control plane uses the `public` schema; the Health sector uses `beyu_identity` + `health` schemas. GUC namespaces are disjoint: BEYU `beyu.*` vs sector `app.*`.

- **Migrations:** `backend/database/migrations/` — **30 up/down pairs, 001–030**, applied by the sector's own runner (`package.json` → `migration:identity:up` → `src/database/migration-runner.ts`), ledgered in `beyu_migrations`. CI applies all against real PG16 and re-runs to prove idempotence (`.github/workflows/ci.yml`, health-os-backend job).
  - 001 identity foundation (users/tenants/memberships/roles/permissions/sessions/auth_events) + tenant GUC RLS
  - 002 `beyu_identity.beyu_identity_links` (1:1 canonical bridge — PK + UNIQUE)
  - 003 isolation boundaries (`tenant_matches_boundary`: country/entity fail-closed)
  - 004 clinical foundation (departments/providers/patients/appointments/encounters)
  - 005 clinical records (problems/observations/medications/allergies)
  - 006 audit_log + idempotency_ledger
  - 007 operations (pharmacy_*, stock_*, dispenses, lab_*, imaging_*, **eye_exams**, billable_services)
  - 008 mtuha_reports
  - 009 facilities/practitioners/compliance_controls/compliance_evidence/consents/retention_policies/legal_holds/clinical_guidelines/incidents/dialysis_*/public_health_events
  - 010 TZ compliance pack
  - 011 optical_devices/ophthalmic_prescriptions/optical_dispensing/signatures/ai_invocations/adapter_circuits
  - 012 mfa_*/rate_limit_events/queue_jobs
  - 013 login_failures/csrf_tokens
  - 014 beyu_outbox/governance_decisions
  - 015–024 security/session binding, permissions, legal holds, global-reference fail-closed, audit tenant boundary, chain-tip index, BEYU service principal, outbox dispatcher/metrics, search-path pin
  - 025 eye_exam patient-tenant integrity; 026–030 tenant FK referential integrity chain (ophthalmology tenant-FK migrations called out by the mission — present and integrity-triggered)
- **Runtime role:** `beyu_health_runtime` — NOSUPERUSER NOBYPASSRLS (provisioned by CI; mirrored locally by `scripts/infra/pg16-server.mjs`).
- **Legacy artifacts (NOT canonical):** `sectors/health/supabase-schema.sql`, `supabase-enterprise-schema.sql`, `supabase-enterprise-full-schema.sql` ("Run this in the SQL editor" files), `supabase/migrations/20260724062158_remote_schema.sql`. The canonical schema source of truth is `backend/database/migrations/` (CI is the enforced gate). These are reference-only and are not executed by any pipeline in this repository.
- **No new migrations are introduced by this integration** (mission §XXI): the mount consumes zero schema changes.

## F. Health authorization inventory

Two pre-existing, distinct layers — **neither is created or modified by this integration**:

**1. BEYU OS layer (authoritative gate in front of `/health`)** — `src/app/health/page.tsx`:
- `resolvePrincipal()` (`src/lib/session.ts`) — BEYU session cookie → `users`/`sessions`/`tenants` with MFA step-up fields (`mfaSatisfied`, `mfaExpiresAt`), rate-limited login (`src/lib/auth-limits.ts`).
- `checkHealthOSAuthorization(userId)` (`src/lib/health-os-authorization.ts`) — queries `beyu_identity.beyu_identity_links` (1:1 canonical link, migration 002) in an isolated savepoint transaction; **fail-closed** on missing link (`NOT_LINKED`) or missing/unavailable schema (`AUTHORIZATION_SERVICE_UNAVAILABLE`); one sanitized `console.warn`, no query text/identifiers logged.
- Launcher parity: `src/lib/operating-systems.ts` → `authorizedOperatingSystems()` adds HEALTH **iff** `checkHealthOSAuthorization(principal.userId)`; Health is deliberately kept out of local permission inference (asserted by `tests/frontend/control-plane-ia.test.ts` "keeps Health federation out of local permission inference").
- Chain in effect: GlobalUserID + BEYU session (+MFA/step-up where required) + tenant clearance + canonical federation link → `/health`.

**2. Sector (Health) layer — pre-existing, authoritative for sector APIs** — `backend/src/`:
- JWT auth guard/strategy (`src/modules/auth/guards/jwt.guard.ts`, `strategies/jwt.strategy.ts`) + httpOnly SameSite=Lax refresh cookie (`auth.controller.ts`); in-memory access token on the client; silent refresh (`src/services/auth.ts`).
- `ActorContext` (`src/common/security/tenant-context.ts`): canonical `userId` (== `globalUserId`), role, explicit permissions, `tenantId`, `countryCode`, `entityCode`, facility/ward/department, licence fields — attached per request.
- Guards: `permissions.guard.ts`/`require-permission.decorator.ts` (RBAC), `tenant-scope.guard.ts` (ABAC tenant boundary), `mfa-stepup.guard.ts`, `clinical-safety.guard.ts`, `consent.guard.ts`, `legal-hold.guard.ts`, CSRF + origin guards, rate limiting, endpoint-tier classification.
- Canonical link enforcement inside the sector: `src/modules/identity/beyu-bridge.ts` → `requireCanonicalLink()` (fail-closed; `beyu-bridge.spec.ts` 15 tests incl. refusal of trustee/board/general-counsel + constitutional permissions via the sector path, set-once `linkTenant`).
- MFA: TOTP enroll/activate/challenge/verify + recovery + lockouts (`modules/auth/mfa.*`, `modules/identity/mfa.service.ts`).

**Deliberately NOT done (per `sectors/health/INTEGRATION.md`, unchanged by this integration):** runtime auth-flow bridging (sector accepting BEYU-asserted identity vs bridged JWT) remains an architectural decision. The BEYU session gate remains in front of the mounted SPA; the sector login remains the sector's own existing mechanism. No new authorization model is introduced.

## G. Health RLS inventory

- **Tenant isolation (GUC-bound):** migration 001 — `ENABLE ROW LEVEL SECURITY` on `beyu_identity.tenants/tenant_memberships/sessions/auth_events` with `USING (current_setting('app.tenant_id', true) = tenant_id::text)` (memos: "prevents accidental cross-tenant access").
- **Country + entity isolation:** migration 003 — `tenant_matches_boundary(p_tenant)` SECURITY DEFINER function; policies require tenant GUC match **AND** `tenant_matches_boundary` (linked tenants must match canonical country/entity from the control-plane catalogs; unlinked legacy tenants keep tenant-only isolation). Fail-closed: rows invisible on mismatch.
- **Audit chain + tenant boundary:** 006 (`health.audit_log`, idempotency ledger), 019 (audit log tenant boundary), 020 (chain-tip index); chain integrity proven by `audit-chain-integrity.spec.ts` (10 concurrent same-tenant writers cannot collide on `prev_hash`) and `outbound-audit-integrity.spec.ts` (BEYU outbox).
- **Ophthalmology RLS + tenant FK integrity:** `eye_exams` (007), optical tables (011), integrity migrations 025/026–030; dedicated `src/modules/ophthalmology/ophthalmology.rls-isolation.spec.ts`.
- **Adversarial coverage:** `src/modules/identity/rls-isolation.spec.ts`, `isolation-boundaries.spec.ts` (cross-country + cross-entity denial), `rls-adversarial-matrix.spec.ts`, `rls-coverage-matrix.spec.ts`, `rls-phase12-matrix.spec.ts`, `token-matrix.spec.ts`, `idor-matrix.spec.ts`/`idor-phase12-matrix.spec.ts`.
- **CI enforcement:** `.github/workflows/ci.yml` health-os-backend job re-runs `rls-isolation isolation-boundaries identity.integration migration-consistency beyu-bridge auth-wiring auth-context.middleware audit-chain-integrity outbound-audit-integrity` against **real PostgreSQL 16**, plus the full PGlite suite; migration ledger re-run must be a no-op.
- **BEYU root parity:** root suite runs under `beyu_runtime` (NOSUPERUSER NOBYPASSRLS) so HTTP/E2E is a test of RLS, not of a superuser (`ci.yml` root-beyu-os job); `tests/security/runtime-privilege-audit.test.ts` re-verifies role attributes.
- **Not weakened:** this integration adds zero DDL, zero role changes, zero GUC usage, and no service-role browser access. The only new network path is an optional, build-time-configured same-origin rewrite to `${HEALTH_API_URL}` (off by default) — the browser never sees backend credentials (mission §VIII).

## H. BEYU → Health boundary

- **One GlobalUserID:** `public.users`/`public.parties` (BEYU) ↔ `beyu_identity.users.global_user_id` (sector domain identifier) valid only under the 1:1 link `beyu_identity.beyu_identity_links` (migration 002). Enforced both directions: BEYU side `checkHealthOSAuthorization` (fail-closed), sector side `requireCanonicalLink` (fail-closed).
- **Schemas:** BEYU = `public` (untouched by the sector); sector = `beyu_identity` + `health`. Sector runtime role `beyu_health_runtime` has DML on `beyu_identity.*` and SELECT on control-plane catalogs only; tenant *data* tables stay RLS-gated (`INTEGRATION.md`).
- **AI:** no sector AI runtime. `NoeliaAdapter` (`backend/src/integrations/beyu/noelia/noelia.adapter.ts`) is the only AI path — governed HIVE endpoint, fail-closed BLOCKED when unconfigured, outputs classified, never self-authorizes. The SPA's `AICoPilot.tsx` is a **deterministic canned demo** (fixed strings + `setTimeout`; no network) — it is labelled as such in the UI ("advisory… final clinical decision rests with the attending") and is NOT connected to HIVE. Truthful label preserved.
- **Constitutional roles:** the sector *reference catalog* still lists trustee/board/etc. (preserved, non-destructive), but the sector grant path **refuses** trustee/board/general-counsel and constitutional permissions (`beyu-bridge.spec.ts` asserts this).
- **Outbound:** `health.beyu_outbox` + dispatcher (014/022/023) with integrity specs; cross-domain orchestrator + transaction envelope adapters under `backend/src/integrations/beyu/`.
- **CAP_POSTING / Foundation scope:** untouched (separate PR #64 concern; no file in this integration touches `governanceCapabilityRegistry` or Foundation resolvers).

## I. Route inventory

**BEYU frontend (root Next.js app):**

| Route | Current state | Evidence |
| --- | --- | --- |
| `/` | sign-in surface | `src/app/` (session/redirects) |
| `/launcher` | governed OS launcher; Health card → `/health`, authorised iff federation link | `src/app/launcher/page.tsx`, `src/lib/operating-systems.ts` |
| `/os`, `/os/*` | control-plane capabilities (identity, governance, noelia, finance, agriculture, foundation, …) | `src/app/os/**` |
| `/health` | **PLACEHOLDER** — authenticates, checks federation link; authorized users see an information card with a disabled "Launch Health OS (Coming Soon)" button; unlinked/unavailable get truthful denial pages | `src/app/health/page.tsx` |
| `/health/os` | **does not exist yet** — the mount point created by this integration (serves the real Health SPA document after re-running the same gate) | (new, §L) |
| `/api/health`, `/api/health/live` | BEYU liveness/readiness probes (byte-stable contract used by CI/E2E/orchestrators) — **not** Health OS API; must remain untouched | `src/app/api/health/route.ts`, `src/app/api/health/live/route.ts` |
| `/api/v1/**` | BEYU governed APIs (auth at `/api/v1/auth`) — root-level `/auth/*` is unused by BEYU (no route, no API) | `src/app/api/v1/**` |

**Health SPA (single document, in-memory nav):** served standalone at its own origin in dev (`vite dev`, proxy → `localhost:3000`); in the BEYU mount it is served at `/health/os` and its only network calls are `/health-os/auth/*` (build-time `VITE_API_BASE_URL=/health-os`; standalone builds keep `""`).

**Health backend (NestJS):** root paths `auth`, `auth/mfa`, `health`, `reporting`, `fhir/R4`, `api/{patients,encounters,clinical,lab,imaging,pharmacy,billing,appointments,eye-exams,dialysis,telehealth,ambulance,compliance,events/outbox,search,integrations}` (§D). The backend is **not deployed anywhere in this repository's Vercel architecture** — `sectors/health/vercel.json` (standalone project config, rewrites to `${HEALTH_API_URL}`) and `INTEGRATION.md` ("Supabase/Redis/Vercel deployment wiring — BLOCKED (no real credentials)") are the evidence. No `HEALTH_API_URL` exists in the root `.env.example`.

## J. Feature matrix

Status vocabulary per mission: `FULLY_INTEGRATED`, `PARTIALLY_INTEGRATED`, `HEALTH_BACKEND_ONLY`, `HEALTH_UI_EXISTS_BUT_UNMOUNTED`, `MISSING_FRONTEND_ENTRY`, `BLOCKED`, `NOT_IMPLEMENTED`. "API" = sector NestJS controller; "mount" = reachability from the BEYU frontend route.

| # | FEATURE | Source files | Component(s) | BEYU route | Sector API | Sector service | DB tables | Migrations | Authorization | Tenant scope | Entity scope | Country scope | RLS | Audit | Tests | Status (at audit) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Health OS SPA mount at `/health` | `sectors/health/src/**`, `index.html`, `vite.config.ts` | `App.tsx` + all views | `/health` (placeholder only) | — | `services/*` (static) | — | — | BEYU session + federation link (page gate) | n/a | n/a | n/a | n/a | n/a | `tests/frontend/control-plane-ia.test.ts` | **HEALTH_UI_EXISTS_BUT_UNMOUNTED** |
| 2 | Launcher navigation entry (Health card) | `src/lib/operating-systems.ts`, `src/app/launcher/page.tsx`, `src/app/os/capabilities.ts`, `capability-map.tsx` | `DestinationCard` | `/launcher` → `/health` | — | — | `beyu_identity.beyu_identity_links` (check) | 002 | `checkHealthOSAuthorization` fail-closed | via principal | via principal | via principal | n/a | n/a | `control-plane-ia.test.ts`, `integration.test.ts` (launcher HTML), `os-authorization.test.ts` | **FULLY_INTEGRATED** (nav level; target was placeholder) |
| 3 | Canonical identity federation (BEYU ↔ sector) | `src/lib/health-os-authorization.ts`; `backend/src/modules/identity/beyu-bridge.ts`, `identity-federation.service.ts` | — | `/health` gate; sector boot | sector `identity-federation` | `beyu-bridge.ts` | `beyu_identity.beyu_identity_links` | 002 | 1:1 PK+UNIQUE, fail-closed both sides | — | — | — | bridge tables RLS (001/003) | auth_events | `beyu-bridge.spec.ts` (15), `identity.integration.spec.ts` | **FULLY_INTEGRATED** (code+CI); production link population = human-controlled |
| 4 | Sector authn (JWT + httpOnly refresh + MFA) | `backend/src/modules/auth/**` | SPA `Login.tsx`, `AuthContext.tsx`, `services/auth.ts` | (inside mounted SPA) | `auth/*`, `auth/mfa/*` | `auth.service.ts`, `mfa.service.ts` | `sessions`, `mfa_*`, `login_failures`, `csrf_tokens` | 001,012,013 | JWT guard + strategy + CSRF + rate limits | GUC `app.tenant_id` | via tenant boundary | via tenant boundary | 001/003 policies on sessions/auth_events | `auth_events` | `auth-wiring.spec.ts`, `auth-context.middleware.spec.ts`, MFA adversarial specs, `auth.test.ts` (SPA) | **HEALTH_BACKEND_ONLY** (not reachable from BEYU domain yet) |
| 5 | Patients / Persons | `backend/src/modules/patients/**` | SPA `PatientListScreen`, `NewRegistrationsScreen` (reference data) | (mount) | `api/patients` | `patients.service.ts` | `health.patients` | 004 | RBAC + tenant-scope guards | `app.tenant_id` | 003 boundary | 003 boundary | tenant RLS + 025/029–030 FK integrity | `health.audit_log` | `patients.service.spec.ts`, `idor-matrix.spec.ts` | **HEALTH_BACKEND_ONLY** (SPA screens are reference/mock) |
| 6 | Encounters | `backend/src/modules/encounters/**` | SPA clinical dashboards (reference) | (mount) | `api/encounters` | `encounters.service.ts` | `health.encounters` | 004 | same | same | same | same | tenant RLS | audit_log | `encounters` e2e (`clinical-workflow.spec.ts`) | **HEALTH_BACKEND_ONLY** |
| 7 | Observations / problems / meds / allergies | `backend/src/modules/clinical/**`, `modules/records/**` | SPA `EMRPatientChart`, `PrescriptionsScreen` (reference) | (mount) | `api/clinical` | `clinical.service.ts`, `signatures.service.ts`, `legal-holds.service.ts` | `health.problems/observations/medications/allergies/signatures` | 005,011,017 | same | same | same | same | tenant RLS | audit_log + legal holds | `clinical.service.spec.ts` | **HEALTH_BACKEND_ONLY** |
| 8 | Laboratory (LIS) | `backend/src/modules/laboratory/**` | SPA `LabDashboard` (reference) | (mount) | `api/lab` | `laboratory.service.ts` | `health.lab_tests/lab_orders/lab_order_items` | 007 | same | same | same | same | tenant RLS | audit_log | `laboratory.service.spec.ts` | **HEALTH_BACKEND_ONLY** |
| 9 | Imaging / Radiology (+ DICOM adapter) | `backend/src/modules/radiology/**`, `modules/interop/dicom` | SPA `RadiologyDashboard` (reference) | (mount) | `api/imaging` | `radiology.service.ts` + DICOM adapter (`PACS_BASE_URL` unset → NOT CONFIGURED) | `health.imaging_orders/imaging_reports` | 007 | same | same | same | same | tenant RLS | audit_log + adapter_circuits (011) | `radiology.service.spec.ts` | **HEALTH_BACKEND_ONLY** (PACS **NOT CONFIGURED**) |
| 10 | Pharmacy | `backend/src/modules/pharmacy/**` | SPA `PharmacyDashboard` (reference) | (mount) | `api/pharmacy` | pharmacy service | `health.pharmacy_items/batches/stock_ledger/stock_levels/dispenses` | 007 | same | same | same | same | tenant RLS | audit_log | pharmacy specs | **HEALTH_BACKEND_ONLY** |
| 11 | Ophthalmology (specialty, not a separate OS) | `backend/src/modules/ophthalmology/**` | (no dedicated SPA screen; under diagnostics nav) | (mount) | `api/eye-exams` | `ophthalmology.service.ts` | `health.eye_exams`, `optical_devices`, `ophthalmic_prescriptions`, `optical_dispensing` | 007,011,025,026–030 | same | `app.tenant_id` + tenant-FK integrity (025/029–030) | 003 | 003 | tenant RLS + FK integrity triggers | audit_log | `ophthalmology.rls-isolation.spec.ts`, `ophthalmology.service.spec.ts`, `ophthalmology-workflow.spec.ts` (e2e) | **HEALTH_BACKEND_ONLY** |
| 12 | Billing / RCM | `backend/src/modules/billing/**` | SPA `BillingScreen` (reference) | (mount) | `api/billing` | billing service | `health.billable_services` | 007 | same | same | same | same | tenant RLS | audit_log | billing specs | **HEALTH_BACKEND_ONLY** |
| 13 | Appointments / telehealth / ambulance / dialysis | `backend/src/modules/appointments|telehealth|ambulance|dialysis` | SPA `AppointmentsScreen`, `TelemedicineDashboard` (reference) | (mount) | `api/appointments`, `api/telehealth`, `api/ambulance`, `api/dialysis` | respective services | `health.appointments`, `dialysis_machines/sessions` | 004,009 | same | same | same | same | tenant RLS | audit_log | module specs | **HEALTH_BACKEND_ONLY** |
| 14 | FHIR R4 | `backend/src/modules/fhir/**` | — | (mount) | `fhir/R4` | `fhir.service.ts` + `fhir-mapper.ts` | (maps clinical tables) | 004–007 | same | same | same | same | via mapped tables | audit_log + adapter_circuits | `fhir.service.spec.ts` | **HEALTH_BACKEND_ONLY** (external endpoint **NOT CONFIGURED**) |
| 15 | HL7v2 | `backend/src/modules/interop/hl7v2` | — | (mount) | (internal interfacing) | hl7v2 engine | analyzer/lab interfacing | 007 | same | same | same | same | via mapped tables | audit_log | interop specs | **HEALTH_BACKEND_ONLY** |
| 16 | MTUHA | `backend/src/modules/mtuha/mtuha.engine.ts`, `modules/reporting/**` | SPA `HISMTUHAScreen` (reference) | (mount) | `reporting`, `api/events/outbox` | `mtuha.engine.ts`, `reporting.service.ts` | `health.mtuha_reports`, `beyu_outbox` | 008,014,022,023 | same | same | same | same | tenant RLS | audit_log + outbox integrity | `mtuha.engine.spec.ts`, `reporting.service.spec.ts` | **HEALTH_BACKEND_ONLY** (submission **NOT CONFIGURED** — `MTUHA_API_BASE_URL` unset) |
| 17 | NHIF | `backend/src/main.ts` (boot env), `modules/integrations/adapter-registry.ts` | SPA mentions (reference) | (mount) | `api/integrations` (status) | adapter registry (fail-closed) | — | — | endpoint-tier guard | — | — | — | — | adapter_circuits | `adapter-contracts.spec.ts`, `adapter-registry.spec.ts` | **NOT CONFIGURED** (env surface only — `NHIF_API_BASE_URL`/`NHIF_API_KEY`) |
| 18 | TMDA | same pattern as NHIF | SPA `ComplianceScreen` (reference) | (mount) | `api/integrations` | adapter registry | — | — | endpoint-tier guard | — | — | — | — | adapter_circuits | adapter specs | **NOT CONFIGURED** (`TMDA_API_BASE_URL`) |
| 19 | DHIS2 | `backend/src/config/database.config.ts` (L40–42) only | — | — | — | — | — | — | — | — | — | — | — | — | — | **NOT_IMPLEMENTED** (3 env vars only; no module/adapter — no claim made) |
| 20 | Quality / accreditation / compliance | `backend/src/modules/compliance/**` (TZ pack, NABH-style matrix), `modules/consent`, `modules/incidents` | SPA `ComplianceScreen`, `NABHScreen`, `SecurityOpsScreen` (reference data from `services/compliance.ts`, `services/nabh.ts`) | (mount) | `api/compliance` | `compliance.service.ts` | `health.compliance_controls/evidence`, `consents`, `incidents`, `clinical_guidelines` | 009,010,011,017 | same | same | same | same | tenant RLS | audit_log | `compliance.service.spec.ts`, `tz-compliance-pack.spec.ts`, `compliance-matrix.spec.ts`, `consent-guard.adversarial.spec.ts` | **HEALTH_BACKEND_ONLY** (SPA compliance/NABH views are reference data) |
| 21 | Public health | `backend/src/modules/` (public_health_events), SPA `PublicHealthScreen` (reference) | (mount) | (no dedicated controller in inventory — event table + SPA view) | — | — | `health.public_health_events` | 009 | same | same | same | same | tenant RLS | audit_log | (event specs) | **HEALTH_BACKEND_ONLY** (table) / SPA reference |
| 22 | Audit & events / outbox | `backend/src/modules/audit/**`, `modules/events/**` | SPA `AuditScreen` (reference) | (mount) | `api/events/outbox` | `audit.service.ts`, outbox dispatcher | `health.audit_log`, `beyu_outbox`, `queue_jobs` | 006,014,019–023 | same | same | same | same | tenant RLS (019) + chain tip index (020) | the chain itself | `audit-chain-integrity.spec.ts`, `outbound-audit-integrity.spec.ts` | **HEALTH_BACKEND_ONLY** |
| 23 | Noelia / HIVE (governed AI) | `backend/src/integrations/beyu/noelia/noelia.adapter.ts`, `modules/ai/**` | SPA `AICoPilot.tsx` (**deterministic canned demo**, no network) | (mount) | (HIVE endpoint adapter, fail-closed) | `NoeliaAdapter` | `health.ai_invocations`, `adapter_circuits` | 011,014 | HIVE creds + audit; no self-authorization | same | same | same | tenant RLS | ai_invocations + audit_log | `noelia` adapter specs, `clinical-safety.*.spec.ts` | **HEALTH_BACKEND_ONLY** (HIVE **NOT CONFIGURED**; SPA demo labelled truthful) |
| 24 | BEYU-domain proxy to sector API | (none yet) | — | `/health-os/*` (new) | all sector root paths | — | — | — | BEYU session gate at `/health/os`; sector JWT authoritative behind it | n/a | n/a | n/a | n/a | n/a | (new test, §L) | **MISSING_FRONTEND_ENTRY** (config-only, off by default) |
| 25 | Sector backend deployment on BEYU domain | `sectors/health/vercel.json` (standalone config), `INTEGRATION.md` ("BLOCKED (no real credentials)") | — | — | — | — | — | — | — | — | — | — | — | — | — | **BLOCKED** (requires production credentials + deploy decision — human-controlled) |

## K. Integration gaps (true state — nothing "missing" that merely needs mounting is labelled missing)

1. **GAP-1 (the one the mission targets):** the Health SPA exists, builds, and passes its own tests, but is **unmounted** — `/health` is a placeholder with "Coming Soon" (`src/app/health/page.tsx` L135). → mount the existing build at a governed child route.
2. **GAP-2:** no same-origin path from the BEYU domain to the sector API exists. The SPA's network surface is `/auth/*` (standalone origin). → build-time `VITE_API_BASE_URL=/health-os` + optional, off-by-default Next rewrite to `${HEALTH_API_URL}`. No BEYU route currently occupies `/health-os/*` (verified: no such route; root `/auth/*` also unused but is deliberately NOT occupied — namespacing avoids future collisions with BEYU auth).
3. **GAP-3 (BLOCKED, human-controlled):** the NestJS backend is not deployed under this Vercel project and no `HEALTH_API_URL`/backend credentials exist in the repo. Until a human provisions them, the mounted SPA will fail closed at sector sign-in (connection error), exactly as an unconfigured integration should. This integration does **not** claim production connectivity.
4. **GAP-4 (architectural decision, explicitly deferred in `sectors/health/INTEGRATION.md`):** bridging BEYU-asserted identity into the sector session (single sign-on). Out of scope here — doing it would create a new authorization flow, which the mission forbids ("do not create a second authorization model", "backend/API authorization remains authoritative").
5. **GAP-5 (truthful labels):** SPA dashboards/compliance/NABH/flow/vip/tax data are static reference data; `AICoPilot` is a deterministic canned demo; DHIS2 is not implemented; NHIF/TMDA/PACS/MTUHA/FHIR/HIVE are NOT CONFIGURED. The mount preserves these truthful states; it must not dress them up.
6. **GAP-6 (cosmetic, fail-closed):** Google Fonts links in the SPA are blocked by the BEYU CSP → system-font fallback. Not a security issue; BEYU CSP is not weakened.
7. **Non-gaps (verified, left alone):** `/api/health` + `/api/health/live` are BEYU probes (byte-stable CI/E2E contract) — untouched. CAP_POSTING registry, Foundation scope resolvers, Noelia shared features, RBAC/ABAC/MFA/RLS/audit — untouched by this integration.

## L. Exact remediation plan (only missing wiring; no rebuild)

1. **`scripts/build-health-spa.mjs` (new):** during the root build, `npm ci` + `vite build` in `sectors/health` with `VITE_API_BASE_URL=/health-os` (existing, documented knob in `sectors/health/.env.example`/`src/services/auth.ts`), then emit `sectors/health/dist/index.html` (single file, measured ~1 MB) as `src/app/health/os/spa-content.ts` — a JSON-escaped `export const healthSpaHtml = ...` so the module is statically importable and bundled by any Next bundler. Prints a warning that the generated content must not be committed.
2. **`src/app/health/os/spa-content.ts` (new, tracked placeholder):** keeps `typecheck`/`lint` green before the build script runs (root CI typechecks before building). Placeholder HTML is a truthful "Health OS app bundle not compiled yet — run the root build" notice; the build script overwrites it every build. Contains no patient data, no secrets.
3. **`src/app/health/os/route.ts` (new, `force-dynamic` GET):** re-runs the identical gate — `resolvePrincipal()` (unauthenticated → 307 `/`) then `checkHealthOSAuthorization()` (not authorized/unavailable → 307 back to `/health`, which renders the existing truthful denial pages). Authorized → serves `healthSpaHtml` as `text/html; charset=utf-8` with `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` (session-bearing content).
4. **`src/app/health/page.tsx` (edit, minimal):** keep unauthenticated redirect + both denial branches byte-identical (they are pinned by `tests/frontend/control-plane-ia.test.ts`). Replace ONLY the authorized "Coming Soon" information card with `redirect("/health/os")`.
5. **`next.config.ts` (edit, minimal):** when `process.env.HEALTH_API_URL` is set at build time, add rewrites `/health-os/auth/:path* → ${HEALTH_API_URL}/auth/:path*`. Off by default (no env in repo) → `/health-os/auth/*` 404s → SPA fails closed. No other BEYU routes are added or modified. (Sector also serves `/api/*`+`/fhir/*`+`/reporting`; the SPA does not call them, so no proxy is fabricated for unused surfaces — extend via the same pattern if/when the SPA consumes them.)
6. **`.env.example` (edit, minimal):** document `HEALTH_API_URL` as OPTIONAL, commented out, with a truth note (proxying the sector's own API; backend deployment is human-controlled; never a browser-exposed credential).
7. **Root `package.json` (edit, minimal):** `build` → `node scripts/build-health-spa.mjs && next build`; add `build:health-spa` alias. CI needs no changes: the build-parity step runs `npm run build` (same script, no secrets required by the SPA build), and the sector's own `health-os-frontend` job continues to verify the standalone SPA (typecheck/test/build) unchanged.
8. **`sectors/health/INTEGRATION.md` (edit, minimal):** record the mount + optional proxy in the boundary doc (the "Sector API exposure through BEYU governed APIs" bullet is updated to reflect what now exists and what remains an architectural decision).
9. **No schema change, no migration, no new role, no new authorization code, no changes to `src/lib/health-os-authorization.ts`, `src/lib/session.ts`, `src/lib/operating-systems.ts`, RBAC/ABAC/MFA/RLS/audit, CAP_POSTING, Foundation scope, Noelia shared features, HIVE.**
10. **Tests:** new `tests/frontend/health-spa-mount.test.ts` (pure source-level, CI-safe: the mount route re-checks the gate and serves the bundle; page keeps fail-closed strings; rewrite is conditional; probe contract untouched). All existing suites re-run unchanged; no test weakened or deleted.
11. **Verification:** root typecheck/lint/build (with and without secrets)/full vitest against PG16 harness (runtime role), sector frontend typecheck/test/build, sector backend typecheck + real-PG security specs (rls-isolation, isolation-boundaries, beyu-bridge, ophthalmology rls-isolation, migration-consistency, auth-wiring), secret scan, then PR → CI gates → merge gate → unauthenticated production verification of `/health` (authenticated production steps remain human-controlled, §XXVIII).
