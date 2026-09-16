# BEYU OS — Frontend Integration Reality Audit

**Audit date:** 2026-09-17
**Auditor:** Arena Agent (forensic repository + production audit)
**Mandate:** Forensic audit of the existing GitHub ↔ Vercel frontend integration and safe exposure of every already-implemented shared capability into the authenticated frontend. No rebuilds, no duplicate OSs, no invented APIs.

---

## 1. Repository baseline

| Item | Observed value | Evidence |
|---|---|---|
| Remote | `https://github.com/yumvalila-bot/BEYU-OS-1.0` | `git remote -v` |
| Audit branch | `arena/01a0ac1c-beyu-os-1-0` (branched from `main`) | `git branch -vv` |
| HEAD / `origin/main` | `113acd51745f42b729da5e0149af86e673853a4f` — "fix(security): enforce Foundation target scope at API boundary (#64)" | `git rev-parse`, `git ls-remote` |
| Working tree at audit start | clean | `git status` |
| Framework | Next.js `16.3.3` (App Router, server components), React `19.2.6`, TypeScript `5.9.3` | `package.json` |
| Data layer | drizzle-orm `0.45.2` + `pg` `8.20.0`; migrations `drizzle/0000`–`0042` (43 SQL files) | `package.json`, `ls drizzle/*.sql` |
| Tests | vitest `3.2.7`; 193 test files under `tests/` | `find tests -name '*.test.ts'` |
| Source size | 627 `.ts`/`.tsx` files under `src/` | `find src` |
| Page routes | 56 (`src/app/**/page.tsx`), of which 52 under `/os` | `find src/app -name page.tsx` |
| API route handlers | 237 (`src/app/api/**/route.ts`) | `find src/app/api -name route.ts` |
| Canonical permissions | 170 | `src/lib/constants.ts` (PERMISSIONS) |
| Canonical roles | 20 | `src/lib/constants.ts` (ROLES) |
| Schema modules | 23 in `src/db/schema/` | `ls src/db/schema` |
| Prior capability matrix | `docs/audit/BEYU_OS_FRONTEND_CAPABILITY_MATRIX_2026-09-16.md` (baseline `833c837`, pre-#64) | file present |

Constitutional topology (code, not docs): `src/lib/operating-systems.ts` declares exactly one control plane (`BEYU`, `CONTROL_PLANE`) and exactly four Sector OSs — `FINANCE`, `HEALTH`, `AGRICULTURE`, `FOUNDATION`. There is no HCM OS, no Family Office OS, no duplicate Identity/Governance/Risk/Compliance/Audit/Noelia OS in the code. Family Office, contracting, blockchain evidence, government integration, HCM, documents and Noelia/HIVE exist as shared capabilities under `/os/*`.

## 2. Production baseline (observed, no production credentials used)

| Route | Observed result |
|---|---|
| `https://beyu-os-1-0.vercel.app/` | 200 — sign-in page "BEYU OS — Global Enterprise Control Plane": Identity / Password / Step-up code (MFA) form; MFA help text; link to `/enroll`. **No bootstrap identities rendered** (production suppression works — they exist in `src/app/page.tsx` but are only rendered under the development server per `isProductionDeployment()`). |
| `/api/health` | 200 — `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"},"latencyMs":636}` |
| `/os` (unauthenticated) | Redirected to `/` — fail closed |
| `/launcher` (unauthenticated) | Redirected to `/` — fail closed |
| `/health` (unauthenticated) | Redirected to `/` — fail closed |
| `/os/identity` (unauthenticated deep link) | Redirected to `/` — deep links cannot bypass guards |
| `/enroll` | 200 — "Administrator already enrolled … permanently sealed" (server-resolved bootstrap state; no credential material disclosed) |

## 3. Frontend architecture (what exists — reused, not replaced)

1. **One authenticated shell.** `src/app/os/layout.tsx`: `requirePrincipal()` → `checkBeyuOSAuthorization()` (principals without any control-plane grant are redirected to `/launcher`; typing `/os` or any deep link cannot bypass it) → `withTenantDatabaseContext()` (transaction-local PostgreSQL RLS context). One desktop sidebar + one responsive mobile drawer (`DesktopNavigation`/`ResponsiveNavigation`), one header, one footer, one alert strip.
2. **One information-architecture catalogue.** `src/app/os/capabilities.ts` (`CAPABILITY_IA`, 471 lines) is the single source for the sidebar, the mobile drawer, the Executive Control Centre capability map and the launcher. Items carry `visibility` metadata (`open` | exact `permission` | `any(permissions)` | `health-federation`). The file's own contract: it is *discovery, not authorization* — every destination re-resolves the principal and re-runs server-side authorization.
3. **One page guard.** `src/lib/guard.ts`: `requirePrincipal()` (unauthenticated → sign-in) and `requireAccess(permission, {classification, tenantId, entityId})` → `can()` RBAC+ABAC decision → for `foundation:*` permissions the PR #64 `foundationTargetScopeDenial()` boundary runs before any Foundation row is read.
4. **One authorization decision primitive.** `src/lib/authz.ts` `can()`: RBAC (role grants, effective-dated, tenant-ancestry contained) + ABAC (clearance ceiling, tenant isolation, entity scope, Agriculture write tenant binding, high-risk ⇒ MFA step-up) with explicit fail-closed behavior for unknown clearances.
5. **One API boundary.** `src/lib/api.ts` `guarded()`: authentication → authorization → validation (zod) → rate limiting → idempotency → structured error envelope → audit. All 237 route handlers go through it (verified by import census).
6. **One RLS boundary.** `src/lib/tenant-scope.ts` sets `beyu.current_tenant_ids` / `beyu.global_scope` as transaction-local `set_config` values on a connection-pinned transaction; row-level policies are defined in migrations (e.g. `0001_kernel_gate1_hardening.sql` — 11 `CREATE POLICY`; `0018_employees_rls_entity_scope.sql`; `0021_financial_ledger_rls.sql`; `0032_agriculture_rls_policy_fix.sql`). PostgreSQL is the final boundary.
7. **Server-component-first UI.** Only 12 `use client` files in the app tree (sign-in form, enrollment form, MFA-gated action buttons, vote panel, Noelia console, tax/waterfall workbenches, nav/link primitives, sign-out, audit self-test). No parallel API client, no second navigation, no duplicate dashboard.

## 4. Route inventory (all 56 page routes)

Legend: guard = the server-side check the page performs; data = how it reads; status = integration state.

| Route | Page file | Guard (permission / logic) | Data source | Status |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | `resolvePrincipal()`; sign-in form; dev-only bootstrap hints | DB (bootstrap identities under dev only) | Integrated (landing + auth entry) |
| `/enroll` | `src/app/enroll/page.tsx` | Server-rendered bootstrap status; API `/api/v1/auth/bootstrap/*` | `getBootstrapStatus()` | Integrated (production: sealed) |
| `/launcher` | `src/app/launcher/page.tsx` | `resolvePrincipal()`; `authorizedOperatingSystems()` | DB tenants + Health federation check | Integrated (OS launcher) |
| `/health` | `src/app/health/page.tsx` | `checkHealthOSAuthorization()` (federation; fails closed when service unavailable) | Health authorization service | Integrated (truthful federation state; no production federation URL yet — human-gated) |
| `/os` | `src/app/os/page.tsx` | `requirePrincipal()` + per-metric `can()` gates (11 capabilities) | 14 governed SQL reads, capability-gated (`gated()`) | Integrated (Executive Control Centre) |
| `/os/registry` | `…/registry/page.tsx` | `requireAccess("platform:registry.read")` | `osRegistry`, `governanceCapabilityRegistry`, `sourceOfTruth`, `integrations`, `architectureDecisions`, `metricDefinitions`, `dataAssets` | Integrated (OS & source-of-truth registry, ADRs, data assets, metrics, integrations) |
| `/os/organization-ownership` | `…/organization-ownership/page.tsx` | `requirePrincipal()` + union `can()` over `organization:entity.read` / `organization:ownership.read` / `equity:cap-table.read` | DB | Integrated (governed route into hierarchy) |
| `/os/organization` | `…/organization/page.tsx` | `requireAccess("organization:entity.read")` | DB (tenants, entities, jurisdictions) | Integrated |
| `/os/ownership` | `…/ownership/page.tsx` | `requirePrincipal()` + ownership/equity union | DB (ownership + instrument-level equity) | Integrated |
| `/os/identity` | `…/identity/page.tsx` | `requireAccess("identity:user.read")` | users, roles, assignments, sessions, `emergencyAccessGrants` | Integrated (incl. break-glass panel) |
| `/os/governance` | `…/governance/page.tsx` | `requireAccess("governance:resolution.read")` | bodies, resolutions, votes (server-computed quorum/tally) + client vote/propose panels | Integrated |
| `/os/assurance` | `…/assurance/page.tsx` | `requirePrincipal()` + risk/compliance union `can()` | risks, controls, obligations, assessments | Integrated (combined Risk & Compliance surface) |
| `/os/risk` | `…/risk/page.tsx` | `requireAccess("risk:register.read")` | `risks`, `controls` | Integrated (risk register + control library) |
| `/os/compliance` | `…/compliance/page.tsx` | `requireAccess("compliance:obligation.read")` | obligations, assessments | Integrated |
| `/os/hcm` | `…/hcm/page.tsx` | `requireAccess("hcm:employee.read")` | `listWorkforce/listEmploymentHistory/listEstablishment` (pay suppressed unless gated) | Integrated |
| `/os/documents` | `…/documents/page.tsx` | `requireAccess("documents:registry.read")` | documents, knowledge, retention schedules, `regulatoryChanges` | Integrated (incl. regulatory-change-adoption surface) |
| `/os/audit` | `…/audit/page.tsx` | `requireAccess("audit:log.read")` | audit chain + `aiDecisions` + self-test panel | Integrated (hash chain, integrity self-test, Noelia decision register) |
| `/os/audit-events` | `…/audit-events/page.tsx` | `requirePrincipal()` + `can("audit:log.read")` / `can("audit:event.read")` | directory over the two stores | Integrated (aggregate entry point) |
| `/os/events` | `…/events/page.tsx` | `requireAccess("audit:event.read")` | event stream | Integrated |
| `/os/registries` | `…/registries/page.tsx` | `requirePrincipal()` + `REGISTRY_READ` union (15 permissions) | authorization-filtered directory | Integrated |
| `/os/family` | `…/family/page.tsx` | `requireAccess("family:member.read")` | members, beneficiaries, vaults, Family Council/Trustees bodies, reserved matters | Integrated |
| `/os/family/capital` | `…/family/capital/page.tsx` | `requireAccess("familyoffice:capital.read")` | family capital/wealth services (6 governed reads) | Integrated |
| `/os/family/protection` | `…/family/protection/page.tsx` + `[policyId]` | `requireAccess("familyoffice:protection.read")` | protection services (policies, premiums, beneficiaries, claims) | Integrated (incl. policy detail) |
| `/os/noelia` | `…/noelia/page.tsx` | `requireAccess("ai:noelia.query")` | Noelia governed query surface + `aiDecisions` | Integrated (console client component) |
| `/os/noelia/governance` | `…/noelia/governance/page.tsx` | `requirePrincipal()` + 9-permission AI union; per-dataset `can()` | 8 governed AI-dataset reads | Integrated (models, providers, identity, evals, risk, incidents, kill-switch, compliance) |
| `/os/legal` | `…/legal/page.tsx` | `requireAccess("legal:matter.read")` | legal matters/obligations | Integrated |
| `/os/contracts` | `…/contracts/page.tsx` | `requireAccess("contracts:read", {classification: "RESTRICTED"})` | `contractRecords` (tenant/entity/classification predicates) | Integrated |
| `/os/government-integrations` | `…/government-integrations/page.tsx` | `requireAccess("government:integration.read")` | agency registry, submissions | Integrated |
| `/os/blockchain` | `…/blockchain/page.tsx` | `requireAccess("blockchain:read")` | anchors, events, smart-contract registry, reconciliation | Integrated (never authoritative) |
| `/os/capital` | `…/capital/page.tsx` | `requireAccess("finance:capital.read")` | capital requests, treasury positions, governance-authorization button | Integrated |
| `/os/waterfall` | `…/waterfall/page.tsx` | `requireAccess("finance:waterfall.read")` | configs, runs, deterministic simulation workbench (cannot commit cash) | Integrated |
| `/os/tax` | `…/tax/page.tsx` | `requireAccess("finance:tax.read")` | strategies, entity-scoped assessments, workbench | Integrated |
| `/os/finance` | `…/finance/page.tsx` | `requireAccess("finance:ledger.read")` | accounts, periods, journals, reports, reconciliation | Integrated (CAP_POSTING remains locked) |
| `/os/finance/payments` | `…/finance/payments/page.tsx` | `requireAccess("finance:payments.read")` | providers, transactions, exceptions, settlements | Integrated (no payment creation on page) |
| `/os/workflow` | `…/workflow/page.tsx` | `requirePrincipal()` + union (`platform:dashboard.read`/`ai:workflow.run`/`ai:workflow.approve`) | definitions, instances, approvals, tasks, governed HIVE workflows | Integrated |
| `/os/notifications` | `…/notifications/page.tsx` | `requirePrincipal()` + recipient predicates | `notifications` | Integrated (also shell alert strip) |
| `/os/security` | `…/security/page.tsx` | `requireAccess("identity:user.read")` | sessions, service principals, MFA coverage, classification standard | Integrated (security posture/monitoring) |
| `/os/settings` | `…/settings/page.tsx` | `requirePrincipal()`; admin links permission-filtered | session/account; device prefs (browser-local) | Integrated |
| `/os/agriculture` | `…/agriculture/page.tsx` | `requireAccess("agriculture:data.read")` | 9 governed reads | Integrated (sector dashboard) |
| `/os/agriculture/capabilities` | `…/agriculture/capabilities/page.tsx` | `requireAccess("agriculture:data.read")` | directory over all 90 agriculture API endpoints | Integrated |
| `/os/foundation` + 11 nested | `…/foundation/**/page.tsx` | `requireAccess("foundation:*")` per page (+ PR #64 target-scope denial in guard) | `src/lib/foundation/*` services | Integrated (formation, registry, structures, governance, tax, compliance, donors, funds, grants, programs, beneficiaries, operations, safeguarding) |
| `/os/constitution` | `…/constitution/page.tsx` | `requireAccess("governance:policy.read")` | constitution, policies, amendments | Integrated |

API routes (237) are grouped by domain under `src/app/api/v1/`: agriculture (90+), ai/noelia (15), auth (9, incl. bootstrap + mobile), authorization (2), blockchain (6), contracts (4), equity (5), family-office (28, incl. protection), finance (10), foundation (34), governance (5), government (2), hcm (2), internal (3), payments (10, incl. webhook), system (3) — all through `guarded()`. Full listing: `find src/app/api -name route.ts`.

## 5. Component inventory

| Component | Kind | Role |
|---|---|---|
| `src/components/brand.tsx` | server | `Badge`, `Panel`, `Metric`, `EmptyState`, `Denied`, `money`, `stateTone` — shared design system |
| `src/components/icons.tsx` | server | semantic icon set used by every catalogue item |
| `src/components/beyu-logo.tsx`, `beyu-os-logo.tsx`, `family-trust-logo.tsx`, `brand-assets.ts` | server | canonical brand presenters (authoritative assets in `public/brand/`) |
| `src/components/capability-directory.tsx` | server | governed directory card (used by `/os/audit-events`, registries) |
| `src/components/noelia-panel.tsx`, `noelia-avatar.tsx`, `noelia-cross-os-visual.tsx` | server | Noelia identity surface |
| `src/components/device-preferences.tsx` | client | browser-local appearance prefs only (no authority) |
| `src/app/os/os-navigation.tsx` | client | single navigation (desktop sidebar + mobile drawer) |
| `src/app/os/nav-link.tsx`, `sign-out-button.tsx` | client | primitives |
| `src/app/sign-in-form.tsx` | client | sign-in incl. MFA step-up field (posts to `/api/v1/auth/login`) |
| `src/app/enroll/enrollment-form.tsx` | client | bootstrap enrollment ceremony (all credential work server-side) |
| `src/app/os/governance/vote-panel.tsx`, `propose.tsx` | client | governed vote/propose forms |
| `src/app/os/capital/governance-authorize-button.tsx` | client | capital governance authorization (not execution) |
| `src/app/os/waterfall/workbench.tsx`, `tax/workbench.tsx` | client | simulation workbenches (audit-logged; no cash commit) |
| `src/app/os/noelia/console.tsx` | client | Noelia console (calls governed `/api/v1/ai/noelia/*`) |
| `src/app/os/audit/self-test.tsx` | client | audit quality-gate self-test trigger |

## 6. Shared-capability forensic matrix (mandated 82 items)

Statuses: `FULLY_INTEGRATED` · `PARTIALLY_INTEGRATED` · `BACKEND_ONLY` · `UI_PLACEHOLDER` · `BLOCKED` · `NOT_IMPLEMENTED`.
Every row is evidence-based: file paths are repository files observed on `113acd5`.

### 6.1 Identity & Access (1–10)

| # | Capability | Backend implementation | DB | API | Frontend | Authorization boundary | Status | Gap / reuse path |
|---|---|---|---|---|---|---|---|---|
| 1 | Identity & Access | `src/lib/identity.ts`, `src/lib/authz.ts` | `identity.ts` (users, parties, sessions, role assignments) | `/api/v1/internal/identity/*`, `/api/v1/auth/*` | `/os/identity` | `identity:user.read`; entity/user/session containment | FULLY_INTEGRATED | — |
| 2 | Authentication | `src/lib/session.ts` (cookie sessions, rate limiting via `auth-limits.ts`) | `sessions`, `users` | `/api/v1/auth/login`, `/logout`, `/mobile/*` | `/` sign-in form | server-side only; client never authorizes | FULLY_INTEGRATED | — |
| 3 | MFA / step-up | `src/lib/mfa.ts` (TOTP; `MFA_ENCRYPTION_KEY` at rest; 15-min step-up window `session.ts`) | MFA state on `users` | login carries `mfaCode`; bootstrap `verify-mfa` | sign-in MFA field; session risk banner in shell | `can()`: high-risk permission ⇒ `requiresMfa` | FULLY_INTEGRATED | — |
| 4 | RBAC | `authz.ts` `loadGrants`/`permissionsForRoles` (20 roles, effective-dated) | `roles`, `roleAssignments` | `/api/v1/governance/authorization` | role/grant tables on `/os/identity` | RBAC half of `can()` | FULLY_INTEGRATED | — |
| 5 | ABAC | `authz.ts` `can()` (clearance, tenant, entity, jurisdiction-adjacent) | tenant/entity/classification columns | — | clearance shown in shell | ABAC half of `can()` | FULLY_INTEGRATED | — |
| 6 | Tenant isolation | `tenant-scope.ts` + PG RLS policies (`0001`, `0021`, `0032`…) | `tenants` + per-table policies | every `guarded()` route | tenant-context chip in shell | `SET LOCAL` tenant ids + `CREATE POLICY` | FULLY_INTEGRATED | — |
| 7 | Classification ceilings | `constants.ts` ranks; `filterByClearance`; `classificationsAtOrBelow` | `classification` columns | `guarded()` context | clearance displayed; `Denied` panels | `can()` ceiling + SQL allow-lists | FULLY_INTEGRATED | — |
| 8 | Emergency / break-glass | `authz.ts` `activeEmergencyPermissions`; `emergencyAccessGrants` | `emergencyAccessGrants` | identity APIs | `/os/identity` break-glass panel (time-bound, approver, review) | activation requires `identity:emergency.activate` (HIGH_RISK ⇒ MFA) | FULLY_INTEGRATED (view); activation is API-governed | — |
| 9 | Delegation | decision-level authority via `src/lib/authority/service.ts` (6C engine); governance delegation in `src/lib/family/decision-gate.ts` | governance/authority tables | `/api/v1/governance/authorization` | shown within Governance/authority surfaces | delegated authority re-checked server-side | PARTIALLY_INTEGRATED | No standalone "delegation registry" exists in the backend; creating one would be new domain work (out of scope). Existing delegation semantics remain governed by the authority engine. |
| 10 | Consent | Foundation beneficiary consent (`consentStatus`/`consentRef`); family decision-gate consent | `foundation.ts`, family schema | foundation beneficiaries API | `/os/foundation/beneficiaries` (consent column) | `foundation:beneficiary.read` (RESTRICTED) | PARTIALLY_INTEGRATED | Consent is capability-scoped (foundation beneficiaries; family gates). A cross-cutting consent register does not exist in the backend; not invented here. |

### 6.2 Organization (11–17)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 11 | Organization | `src/lib/organization*` via db reads | `tenants`, `legalEntities`, jurisdictions | organization endpoints | `/os/organization` | `organization:entity.read` | FULLY_INTEGRATED | — |
| 12 | Ownership | `src/lib/family/…`, equity libs | `ownership`/equity tables | `/api/v1/equity/*` (5) | `/os/organization-ownership`, `/os/ownership` | `organization:ownership.*`, `equity:cap-table.read` | FULLY_INTEGRATED | — |
| 13 | Family Trust | `src/lib/family/*` (constitution, institution, decision-gate); `family-trust.ts` schema | `trustInstruments/Provisions/Decisions/Distributions`, family bodies | family APIs | `/os/family` (trust logo, council/trustees, reserved matters) | `family:member.read` + HIGHLY_RESTRICTED panels | FULLY_INTEGRATED | — |
| 14 | Holding companies | tenant hierarchy (parent chain) | `tenants` | — | `/os/organization`, `/os/organization-ownership` | entity read + tenant scope | FULLY_INTEGRATED | — |
| 15 | Country holdings | tenant hierarchy + jurisdiction codes | `tenants`, jurisdiction fields | — | same | same | FULLY_INTEGRATED | — |
| 16 | Operating companies | `legalEntities` (effective-dated) | `legalEntities` | — | same | same | FULLY_INTEGRATED | — |
| 17 | Tenants | `tenant-scope.ts` (ancestry + global governance roles) | `tenants` | — | tenant chip; scope resolution | `tenantScopeIds()` | FULLY_INTEGRATED | — |

### 6.3 Constitution & Governance (18–28)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 18 | Constitution | `src/lib/governance.ts`, `scripts/prepare-constitutional-foundation.ts` | constitution/policy tables | governance APIs | `/os/constitution` | `governance:policy.read` | FULLY_INTEGRATED | — |
| 19 | Policy engine | `src/lib/policy.ts` (8-level hierarchy; DENY final; approvals accumulate) | `policies` | `guarded()` policy evaluation | policies on `/os/constitution` | policy + RBAC/ABAC both must pass | FULLY_INTEGRATED | — |
| 20 | Governance | `src/lib/governance*.ts` (voting, decision contracts) | `governance.ts` (bodies, resolutions, votes) | `/api/v1/governance/*` (5) | `/os/governance` (quorum/tally server-computed) | `governance:resolution.read` + MFA on high-risk decisions | FULLY_INTEGRATED | — |
| 21 | Boards | governance bodies (`bodyType` incl. boards) | `governanceBodies` | same | `/os/governance` "Boards, committees, councils & decisions" | same | FULLY_INTEGRATED | — |
| 22 | Committees | same | same | same | same (incl. investment committee in Family capital) | same | FULLY_INTEGRATED | — |
| 23 | Family Council | `family_council` bodies; `src/lib/family/institution.ts` | governance + family schema | family APIs | `/os/family` "Council, trustees & reserved matters" | `family:member.read` | FULLY_INTEGRATED | — |
| 24 | Trustees | trustees body type; `trustDecisions` | family-trust schema | family APIs | `/os/family` | same | FULLY_INTEGRATED | — |
| 25 | Reserved matters | `src/lib/governance/reserved-matters.ts` | governance schema | governance APIs | `/os/family` reserved-matters panel + governance | `governance:policy.read` / family grants | FULLY_INTEGRATED | — |
| 26 | Quorum | `src/lib/governance-voting.ts` | `quorumMinimum` on bodies | votes APIs | quorum state on `/os/governance` | server-computed | FULLY_INTEGRATED | — |
| 27 | Votes | voting service + contracts | `votes` | `/api/v1/governance/resolutions/[id]/votes` | vote panel (client) + tally | MFA step-up where high-risk | FULLY_INTEGRATED | — |
| 28 | Resolutions | resolution lifecycle + decision record | `resolutions` | `/api/v1/governance/resolutions/*` | `/os/governance` | same | FULLY_INTEGRATED | — |

### 6.4 Risk / Compliance / Legal (29–34)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 29 | Risk | `src/lib/specialist/risk` + assurance services | `risks` | — | `/os/assurance`, `/os/risk` | `risk:register.read` | FULLY_INTEGRATED | — |
| 30 | Compliance | `src/lib/specialist/compliance` | `complianceObligations/Assessments` | — | `/os/assurance`, `/os/compliance` | `compliance:obligation.read` | FULLY_INTEGRATED | — |
| 31 | Legal | `src/lib/…` legal matters | legal tables | — | `/os/legal` | `legal:matter.read` | FULLY_INTEGRATED | — |
| 32 | Business continuity | **no application implementation** — runbook `docs/runbooks/RB-021-business-continuity.md` only | — | — | — | — | NOT_IMPLEMENTED (runbook-level only) | Creating a BCP module would be new backend work; explicitly not done (no backend/domain support to expose). |
| 33 | Control library | `assurance.controls` | `controls` | — | `/os/risk` (controls per risk + assessed effectiveness) | `risk:register.read` | FULLY_INTEGRATED | — |
| 34 | Regulatory obligations | obligations with `jurisdictionCode`; regulatory-change table + Noelia action | `regulatoryChanges`, obligations | Noelia compliance actions | `/os/compliance`, `/os/documents` ("Detected changes awaiting governed adoption") | compliance/documents permissions | FULLY_INTEGRATED | — |

### 6.5 Finance (35–41)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 35 | Finance governance | `src/lib/capital-governance-service.ts`, `governance-authorization.ts` | capital/governance tables | `/api/v1/finance/capital/[id]/governance-authorization` | `/os/capital` governance-authorization button | `finance:capital.*`; authorization ≠ execution | FULLY_INTEGRATED | — |
| 36 | Treasury | treasury positions (specialist/treasury) | `treasuryPositions` | `/api/v1/finance/*` | dashboard metric + `/os/capital` | `finance:treasury.read` | FULLY_INTEGRATED | — |
| 37 | Capital pipeline | capital requests lifecycle | `capitalRequests` | `/api/v1/finance/capital*` | `/os/capital` | `finance:capital.read` | FULLY_INTEGRATED | — |
| 38 | Approval authority | `src/lib/decision-authority.ts` (`requireCapability`) | capability registry | governance/capital APIs | capital governance button; governance approvals | `requireCapability` + MFA | FULLY_INTEGRATED | — |
| 39 | Waterfall | `src/lib/waterfall.ts`, `waterfall-engine-v2.ts` | `waterfallConfigs/Runs/RunLines` | `/api/v1/finance/waterfall/simulate` | `/os/waterfall` (deterministic simulation; commit requires `finance:waterfall.commit`, HIGH_RISK) | board authority checks; simulation never commits cash | FULLY_INTEGRATED | — |
| 40 | Financial controls | journal/period/reconciliation/report services; **CAP_POSTING LOCKED** (`posting-engine.ts` `requireCapability("CAP_POSTING")`; `domains.ts` "CAP_POSTING locked (P1, P6, P7, P9 unratified)") | finance schema | `/api/v1/finance/journal`, `periods`, `reconciliation`, `reports` | `/os/finance` | `finance:ledger.read`; posting path locked | FULLY_INTEGRATED | CAP_POSTING remains locked — no unlock UI added, none exists |
| 41 | Tax strategy | `src/lib/tax.ts` + tax assess | tax tables | `/api/v1/finance/tax/assess` | `/os/tax` (jurisdiction-gated; human review) | `finance:tax.read` | FULLY_INTEGRATED | — |

### 6.6 HCM (42–46)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 42 | HCM (shared) | `src/lib/hcm.ts` | `people.ts` (employees, org units, positions) | `/api/v1/hcm/employees` (+`[id]`) | `/os/hcm` | `hcm:employee.read` | FULLY_INTEGRATED | — |
| 43 | Employee master | `hcm.ts` `listWorkforce` | `employees` | same | `/os/hcm` (360° record) | entity/clearance gates | FULLY_INTEGRATED | — |
| 44 | Positions | `listEstablishment` | positions/establishment tables | same | `/os/hcm` (budgeted establishment) | same | FULLY_INTEGRATED | — |
| 45 | Employment events | `listEmploymentHistory` | employment events | same | `/os/hcm` history panel | same | FULLY_INTEGRATED | — |
| 46 | Clearance-gated pay data | `hcm.ts` `compensationVisible()` + `suppressedCompensation` (row is RESTRICTED; pay suppressed when not entitled) | `employees.classification` | same | pay column rendered only when `showCompensation` | clearance + capability gate | FULLY_INTEGRATED | — |

### 6.7 Family Office (47–51)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 47 | Family Office (shared) | `src/lib/family/office/*`, `family-office.ts` schema | family-office tables | `/api/v1/family-office/*` (28) | `/os/family` + domains | `family:member.read` / `familyoffice:*` (highly restricted) | FULLY_INTEGRATED | — |
| 48 | Beneficiary eligibility | family + foundation beneficiary registers | beneficiaries tables | family/foundation APIs | `/os/family` (eligibility/entitlement), `/os/foundation/beneficiaries` | restricted grants | FULLY_INTEGRATED | — |
| 49 | Lineage | family member/model data | family schema | family APIs | `/os/family` | same | FULLY_INTEGRATED | — |
| 50 | Vaults | family vault records | family vault table | family APIs | `/os/family` "Family · member · trust · emergency · credential · legacy" vault panel | same | FULLY_INTEGRATED | — |
| 51 | Family governance | family constitution/institution/decision-gate | family + trust schema | family APIs | `/os/family` council/trustees/reserved matters | same + MFA on `familyoffice:committee.decide` | FULLY_INTEGRATED | — |

### 6.8 Documents & Knowledge (52–57)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 52 | Documents | `src/lib/contracts/documents.ts`, data-governance services | documents tables | documents endpoints | `/os/documents` | `documents:registry.read`; malformed scope arrays fail closed | FULLY_INTEGRATED | — |
| 53 | Knowledge governance | authoritative-knowledge with review windows | knowledge tables | — | `/os/documents` "Authoritative knowledge with review windows" | same | FULLY_INTEGRATED | — |
| 54 | Retention | `src/lib/data-governance/retention-service.ts` | retention schedules | — | `/os/documents` "Retention schedule by record type & jurisdiction" | same | FULLY_INTEGRATED | — |
| 55 | Legal hold | documents legal-hold state | documents tables | — | `/os/documents` (metadata panel) | same | FULLY_INTEGRATED | — |
| 56 | Provenance | `src/lib/audit.ts` provenance; authority engines provenance | provenance columns | — | provenance in audit/documents panels | audit read | FULLY_INTEGRATED | — |
| 57 | Supersession | document supersession state in documents model | documents tables | — | `/os/documents` | same | FULLY_INTEGRATED | — |

### 6.9 Workflow & Notifications (58–62)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 58 | Workflow | workflow definitions/instances services | workflow tables | noelia workflows APIs | `/os/workflow` | requester/enterprise partition; HIVE human authorization | FULLY_INTEGRATED | — |
| 59 | Tasks | tasks register | `tasks` | — | `/os/workflow`, dashboard "Pending approvals & tasks" | `platform:dashboard.read` etc. | FULLY_INTEGRATED | — |
| 60 | Approvals | approvals service (SLA-tracked instances) | approvals tables | noelia `workflows/[id]/authorize` | `/os/workflow` "only a human with authority can close these" | MFA where high-risk | FULLY_INTEGRATED | — |
| 61 | Notifications | notifications register | `notifications` | — | `/os/notifications` + shell alert strip | recipient predicates (user/role) + classification | FULLY_INTEGRATED | — |
| 62 | Events | event stream (CloudEvents-aligned, hash-chained) | events tables | `/api/v1/internal/events` (+status) | `/os/events` | `audit:event.read` | FULLY_INTEGRATED | — |

### 6.10 Audit & Security (63–66)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 63 | Audit | `src/lib/audit.ts` (append-only, hash-chained) | audit tables | — | `/os/audit`, `/os/audit-events` | `audit:log.read` | FULLY_INTEGRATED | — |
| 64 | Hash-chained audit | chain-head lock + checksums | audit chain columns | — | `/os/audit` chain panel | same | FULLY_INTEGRATED | — |
| 65 | Integrity verification | audit self-test | — | self-test trigger | `/os/audit` "Quality gate self-test" | `audit:log.read` | FULLY_INTEGRATED | — |
| 66 | Security monitoring | security posture (`src/lib/command/posture.ts`), session risk, MFA coverage, service principals | identity/audit tables | `/api/v1/system/posture` | `/os/security` | `identity:user.read`; sensitive token/IP payloads omitted | FULLY_INTEGRATED | — |

### 6.11 Registries (67–75)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 67 | Registries (shared surface) | registry services | platform schema | — | `/os/registry`, `/os/registries` | `platform:registry.read` + union directory | FULLY_INTEGRATED | — |
| 68 | OS registry | `osRegistry` | `os_registry` | — | `/os/registry` | same | FULLY_INTEGRATED | — |
| 69 | Source-of-truth matrix | `sourceOfTruth` | `source_of_truth` | — | `/os/registry` | same | FULLY_INTEGRATED | — |
| 70 | ADR registry | `architectureDecisions` | `architecture_decisions` | — | `/os/registry` | same | FULLY_INTEGRATED | — |
| 71 | Integration registry | `integrations` | `integrations` | — | `/os/registry` | same | FULLY_INTEGRATED | — |
| 72 | Data assets | `dataAssets` | `data_assets` | — | `/os/registry` | same | FULLY_INTEGRATED | — |
| 73 | Metric definitions | `metricDefinitions` | `metric_definitions` | — | `/os/registry` | same | FULLY_INTEGRATED | — |
| 74 | Feature flags | **schema + seed only** (`src/db/schema/platform.ts` `featureFlags`; `src/db/seed.ts`) | `feature_flags` | no API route | no route | — | BACKEND_ONLY | Genuine UI gap — see remediation map R-1 (minimum: permission-gated read panel on `/os/registry`) |
| 75 | Regulatory change watch | `regulatoryChanges` + Noelia `registerRegulatoryChange` action | `regulatory_changes` | Noelia compliance actions | `/os/documents` "Detected changes awaiting governed adoption" | documents/Noelia permissions | FULLY_INTEGRATED | — |

### 6.12 Noelia / HIVE (76–82)

| # | Capability | Backend | DB | API | Frontend | Boundary | Status | Gap |
|---|---|---|---|---|---|---|---|---|
| 76 | Noelia (single governed AI identity) | `src/lib/noelia/*` (runtime, tool registry, scope service; **no db handle in the facade — services are authority**) | ai schema | `/api/v1/ai/noelia/*` (15) | `/os/noelia` | principal-derived scope; inherits identity/tenant/classification/audit | FULLY_INTEGRATED | — |
| 77 | HIVE (governed tool/workflow runtime) | `BeyuNoeliaWorkflowService`, scheduler service | workflows/schedules tables | `ai/noelia/workflows/*`, `schedules/*` | `/os/workflow` (governed agentic workflows), `/os/noelia` | human authorization is constitutional; Noelia never self-authorizes | FULLY_INTEGRATED | — |
| 78 | AI governance | `BeyuNoeliaAiPlatformService`, compliance service | `ai.ts`, `ai-compliance.ts`, `ai-phase5.ts` | `/api/v1/ai/noelia/compliance*`, `phase5*` | `/os/noelia/governance` (9-permission union) | per-dataset AI permissions | FULLY_INTEGRATED | — |
| 79 | Human review | `aiDecisions` (`humanReviewRequired`, `reviewedBy`) | `aiDecisions` | — | dashboard "AI awaiting human review" + `/os/audit` Noelia decision register | `ai:decision.review` | FULLY_INTEGRATED | — |
| 80 | AI output classification | answer classification in Noelia types/compliance | ai-compliance | — | `/os/noelia/governance` compliance evidence | same | FULLY_INTEGRATED | — |
| 81 | Source citation | citations on Noelia answers (`NoeliaAnswer`) | evidence service | `ai/noelia/analyze|brief` | `/os/noelia` console | same | FULLY_INTEGRATED | — |
| 82 | AI audit | AI decision register + compliance telemetry | `aiDecisions`, compliance tables | compliance actions | `/os/audit` + `/os/noelia/governance` | audit + AI permissions | FULLY_INTEGRATED | — |

## 7. Shared-features information architecture — target vs actual

The target tree in the mandate maps 1:1 onto the existing catalogue (`CAPABILITY_IA`), with the existing valid routes reused:

| Target group | Existing group / routes |
|---|---|
| Executive Dashboard | Executive → `/os` (+ `/os/registry`, `/os/organization-ownership`) |
| Shared Features | Shared capabilities → `/os/identity`, `/os/organization`, `/os/ownership`, `/os/governance`, `/os/assurance`, `/os/hcm`, `/os/documents`, `/os/audit-events`, `/os/registries`, `/os/family`, `/os/noelia` + workspaces → `/os/constitution`, `/os/risk`, `/os/compliance`, `/os/audit`, `/os/events`, `/os/workflow`, `/os/notifications`, `/os/security`, `/os/noelia/governance`, `/os/legal`, `/os/contracts`, `/os/government-integrations`, `/os/blockchain` |
| Sector OS | Sector operating systems → `/os/finance`, `/health`, `/os/agriculture`, `/os/foundation` (launch via `/launcher` + `authorizedOperatingSystems()`) |
| Administration | System → `/os/settings`; registries/registries cover policy/integration/configuration discovery; no hidden admin route exists |

No rename, no second navigation, no parallel dashboard was required: the target IA is already the shipped IA.

## 8. Gap register (honest)

| ID | Gap | Evidence | Disposition |
|---|---|---|---|
| G-1 | Feature flags: table + seed existed with no API route and no frontend surface | `featureFlags` consumed only by `src/db/schema/platform.ts`, `src/db/seed.ts` | **Closed by R-1** (implemented in this work): permission-gated read-only panel on `/os/registry` — see implementation report |
| G-2 | Business continuity: runbook only, no application backend | no `business continuity` code in `src/` | No UI — would be new domain work (constitutionally excluded) |
| G-3 | Delegation: no standalone delegation registry | delegation semantics live in authority/governance services | No UI — covered by existing governed authority model |
| G-4 | Consent: capability-scoped, no cross-cutting register | foundation beneficiary consent + family gates only | No UI — no backend register to expose |
| G-5 | Health OS production federation URL / identity-link deployment | `checkHealthOSAuthorization` fails closed; repo holds no production target | Human-controlled (deployment + Health security owner); UI already truthful |
| G-6 | Payment provider credentials / live provider activation | provider registry is evidence-only | Human-controlled; page creates no payments |
| G-7 | Government integration credentials / sandbox evidence | registry-driven, blocked adapters stay blocked | Human-controlled |
| G-8 | Blockchain deployment keys / multisig | deliberately not held by the app | Human-controlled |
| G-9 | CAP_POSTING activation | LOCKED by unratified accounting policy | Constitutional process only — no unlock UI added |
| G-10 | Dependency advisories | `npm audit` (see prior matrix: 6 moderate, 1 high as of 2026-09-16; re-check in CI) | Maintainer-approved upgrade cycle |

## 9. Exact remediation map (minimum, reuse-first)

| ID | Change | Files | New APIs | New permissions | Schema change | Risk |
|---|---|---|---|---|---|---|
| R-1 (DONE) | Added "Feature flags — read-only effective state" panel to the OS & Source-of-Truth Registry page: renders `featureFlags` rows (key, state, scope, owner, last-updated) under the page's existing `platform:registry.read` guard inside the existing `withTenantDatabaseContext`; honest empty state; **no mutations** (flag changes remain a governed provisioning concern); catalogue description updated to keep navigation truthful | `src/app/os/registry/page.tsx` (extended), `src/app/os/capabilities.ts` (description text), `tests/frontend/registry-feature-flags.test.ts` (new source-gate) | none | none | none | Low — read-only panel reusing the page's existing guard/RLS context; zero authorization change |
| — | G-2…G-10: no code changes (human-controlled or constitutionally excluded) | — | — | — | — | — |

## 10. Security analysis

- **Frontend is not an authority.** Every page resolves the principal server-side (`requirePrincipal`/`requireAccess`); navigation and the capability map are presentation derived from the same `can()` decisions; URL paths grant nothing. Unauthenticated deep links redirect to sign-in (verified in production).
- **Authorization chain per request:** session cookie → `resolvePrincipal()` (identity, tenant, roles, clearance, entity scope, MFA state, risk score) → `can()` (RBAC + ABAC + MFA step-up) → page-level `foundation:*` target-scope denial (PR #64) → `withTenantDatabaseContext` (transaction-local RLS ids) → PostgreSQL `CREATE POLICY` final boundary.
- **API chain per route (237 handlers):** `guarded()` = auth → authz → zod validation → rate limit → idempotency → structured errors (no secrets/stacks/DB internals) → audit.
- **CAP_POSTING remains locked** (`posting-engine.ts:184` `requireCapability("CAP_POSTING")`; no unlock UI exists or is added).
- **No client-side secrets.** The 12 client components post only to governed `/api/v1/*` endpoints under the session cookie; no DSN, key or token in client code; committed-tree secret scanning runs in CI (`committed-secret-scan` job).
- **Bootstrap identities are dev-only** and verified suppressed on the production deployment.
- **PR #64 Foundation target-scope remediation intact** on this baseline: `src/lib/foundation/target-scope.ts`, `guard.ts` foundation branch, `api.ts` foundation route guard, foundation layout — all present and unmodified by this audit.

## 11. Test evidence

Local CI-equivalent baseline on `arena/01a0ac1c-beyu-os-1-0` (embedded PostgreSQL 16 via the repository harness, mirroring `.github/workflows/ci.yml`), executed after the R-1 change:

- `npm run typecheck` — pass
- `npm run lint` — pass (1 pre-existing warning, `noelia-cross-os-visual.tsx`)
- `npm run migrate` — 43/43 applied; re-run idempotent; drizzle-kit drift check generated nothing
- `scripts/setup-db-role.ts` — pass; `npm run seed` — pass
- `npm run build` (production) — pass
- `next start` + `/api/health` — `{"ok":true,"checks":{"database":"UP"}}`
- `npm test` (PG-backed + HTTP/E2E with `BEYU_TEST_BASE_URL` set) — **191/194 files passed, 3 skipped; 3694/3705 tests passed, 11 skipped; exit 0** (includes all 6 frontend suites, the new `registry-feature-flags` gate, and the HTTP 401/422/429/idempotency suites against the running server)
- `npm run scan:secrets` — clean (1782 tracked files)

The canonical gate is the GitHub CI run on the PR (see implementation report §9).

## 12. Production verification

Observed at audit time (Section 2). Post-implementation production verification requires a Vercel deployment of the merged commit — recorded in the implementation report with commit/deployment/route/HTTP results.

## 13. Human-controlled items

1. Push of evidence commit `34445d7` (separate follow-up, awaiting the machine that holds it).
2. Health OS production federation URL + identity-link deployment (G-5).
3. Payment provider activation evidence (G-6); government credentials (G-7); blockchain key custody (G-8).
4. CAP_POSTING ratification/activation (G-9).
5. Dependency upgrade approval (G-10).
