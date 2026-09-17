# Agriculture Frontend Integration Report

**Date:** 2026-09-17  
**Branch:** `arena/01a0adfa-beyu-os-1-0` (Arena-pinned)  
**Baseline HEAD:** `51f50b82ec236fa638dd2af619fa563a6a81903b`

## Baseline and implementation decision

The forensic audit established that Agriculture is already integrated into the existing authenticated BEYU Next.js shell and launcher. The verified routes are `/os/agriculture` and `/os/agriculture/capabilities`, backed by `/api/v1/agriculture/*`. The task therefore made no application or schema changes: adding another launcher/sidebar/auth system, aliasing an assumed route, or inventing missing CRUD pages would duplicate or overstate the existing implementation.

Full evidence and the feature matrix are in `docs/AGRICULTURE_FRONTEND_INTEGRATION_AUDIT.md`.

## Feature matrix summary

| Feature | Integration status |
|---|---|
| Authenticated BEYU launcher entry | FULLY_INTEGRATED |
| Deep-link target + permission check | FULLY_INTEGRATED |
| Executive operational dashboard | FULLY_INTEGRATED |
| Farms/crops/harvest/livestock read UI | FULLY/PARTIALLY_INTEGRATED by capability |
| Food export metrics/orders/holds/shipments read UI | FULLY/PARTIALLY_INTEGRATED |
| Full API capability discovery | FULLY_INTEGRATED through capability directory |
| Dedicated web forms for all 90 API routes | NOT_IMPLEMENTED; not fabricated |
| Flutter Agriculture screen/API/offline queue | FULLY/PARTIALLY_INTEGRATED |
| Canonical Noelia Agriculture tools | FULLY_INTEGRATED, read-only/governed |
| Separate Agriculture ledger/HCM/auth/Noelia/HIVE | correctly absent |

## Route → component → API → database

| Route | Component | Service/API | Database |
|---|---|---|---|
| `/launcher` | existing BEYU destination card | `authorizedOperatingSystems` | canonical tenant + identity grants |
| `/os/agriculture` | `AgriculturePage` + BEYU design components | `agricultureDashboard`, `exportDashboard`, scoped Drizzle reads | Agriculture operational/export tables |
| `/os/agriculture/capabilities` | `AgricultureCapabilitiesPage` | links to actual `/api/v1/agriculture/*` handlers | directory itself loads no business rows |
| `/api/v1/agriculture/*` | 90 Next route files | canonical `guarded` + Agriculture services | 84 Agriculture tables + canonical audit/events |
| Flutter Agriculture shell | `AgricultureOSScreen` | same-origin governed API client and secure queue | same server/database truth |

## Authorization chain

`GlobalUserID/session → requirePrincipal or guarded → BEYU RBAC+ABAC → BEYU-AGRI target/tenant scope → entity/classification fail-closed checks → withTenantDatabaseContext → PostgreSQL RLS → canonical audit/events`

Specific executed negative evidence:

- unauthenticated Agriculture dashboard API: 401;
- unauthenticated Agriculture farm POST: 401;
- unauthenticated `/os/agriculture`: 307 to sign-in;
- Health identity attempting Agriculture write: 403;
- HCM principal without Agriculture read: 403;
- CEO read-only principal attempting Agriculture write: 403;
- Agriculture principal binding Health entity: denied (403 in executed HTTP test);
- Agriculture principal using a foreign country for the TZ entity: 403;
- domain test for cross-tenant actor: denied;
- valid Agriculture write/read flows: allowed.

There is no canonical Ujenzi principal/permission/route, so Agriculture→Ujenzi denial cannot be truthfully claimed as an executed authorization decision. Ujenzi URLs currently do not exist.

## RLS / tenant / entity / country verification

A disposable PostgreSQL 16.14 cluster was initialized, all migrations `0000`–`0042` applied, and the canonical development seed executed with ephemeral local-only credentials (not printed or committed).

Database catalogue query result:

- 84/84 `agriculture_%` tables have RLS enabled;
- 84/84 have a policy using canonical `beyu_tenant_ids()`;
- 74/84 have FORCE RLS;
- the 10 foundation tables from migration `0031` are not FORCE RLS: farms, fields, crop types/cycles, inputs/applications, harvests, livestock types/herds/events.

The runtime path uses a non-owner runtime role and canonical RLS context, but lack of FORCE on those 10 relations remains a documented hardening gap. No migration was created because this task is frontend integration and an RLS alteration requires its own reviewed database change and full-suite evidence.

## Files reused / changed

Reused unchanged:

- `src/app/launcher/page.tsx`
- `src/lib/operating-systems.ts`
- `src/app/os/agriculture/*`
- `src/app/api/v1/agriculture/*`
- `src/lib/agriculture/*`
- `src/db/schema/agriculture.ts`
- migrations `0031`, `0032`, `0034`, `0039`
- canonical BEYU guard/authz/tenant/audit/Noelia/HIVE/Finance code
- Flutter Agriculture screen, API client and secure queue

Changed:

- `docs/AGRICULTURE_FRONTEND_INTEGRATION_AUDIT.md`
- `docs/AGRICULTURE_FRONTEND_INTEGRATION_REPORT.md`

No source, permission, seed, migration, data, deployment or secret file changed.

## Tests

### Passing

- Agriculture + selected frontend/authorization suite against disposable PostgreSQL: **81 passed, 51 skipped, 0 failed**. Skips were HTTP/browser suites because that run did not point at a server.
- Agriculture HTTP suite with the real Next dev server and PostgreSQL: **14 passed, 0 skipped, 0 failed**.
- Included executed checks for grants, tenant/entity/country denial, harvest event/no journal, CAP_POSTING locked, offline idempotency, Noelia permissions, RLS enabled, farm/field creation, API authentication, page redirect and read/write permission separation.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with one pre-existing image optimization warning.
- `npm run scan:secrets`: PASS (1,785 tracked files).

### Not green / blocked

- Initial `npm test` without `DATABASE_URL`: exceeded the 30-minute tool limit while DB-required tests failed with `DATABASE_URL is required`; full repository suite is not claimed green.
- Flutter tests: BLOCKED; Flutter executable is not installed and no `mobile/flutter/test` suite was found.
- `npm audit --audit-level=high`: FAIL, 7 advisories (6 moderate, 1 high). The high `js-yaml` advisory has a non-breaking `npm audit fix` suggestion, while other fixes include breaking tool upgrades. Dependency remediation was not mixed into this integration audit.

## Build

`npm run build`: PASS. Next.js compiled, typechecked, generated 123 pages, and listed both Agriculture web routes plus all Agriculture APIs. The build emitted one existing Turbopack warning about dynamic filesystem access in `src/lib/command/posture.ts`; no build error occurred.

## Finance / Noelia / HIVE security

- Harvest HTTP test verified `HARVEST_RECORDED`, zero journals, and no capital-request creation.
- CAP_POSTING remained LOCKED after Agriculture mutations.
- Export/Noelia tests verify canonical read-only Agriculture export tools; Noelia/HIVE cannot release holds or post Finance truth.
- No second ledger, Noelia identity or HIVE runtime was added.

## Vercel / production verification

No deployment was triggered. Public retrieval against `https://beyu-os-1-0.vercel.app/` on 2026-09-17 established:

- `/` serves the BEYU sign-in surface;
- unauthenticated `/os/agriculture` resolves back to the sign-in surface (fail closed);
- `/api/v1/agriculture/dashboard` returns a structured `UNAUTHENTICATED` error requiring a valid BEYU session;
- `/agriculture` returns 404, confirming it is not the actual route;
- Ujenzi routes return 404.

No production credentials were requested or used. Authorized Agriculture rendering, cross-tenant/entity/country production RLS, database writes, audit rows and cross-sector production denial remain unverified.

## Remaining gaps

1. Remediate dependency audit findings in a focused dependency/security change.
2. Decide and review FORCE RLS hardening for the first 10 Agriculture tables.
3. Add dedicated web workflows only when requested and backed by the existing governed APIs—without duplicating services.
4. Add automated Flutter and browser E2E/accessibility coverage.
5. Complete controlled production verification with authorized and unauthorized principals plus database/audit evidence.
6. Integrate Ujenzi only after its complete canonical source is rebased, merged and security-tested.

**Result:** existing Agriculture integration preserved and fully documented; no duplicate OS, control plane, authorization, ledger, HCM, governance, audit, Noelia or HIVE created.
