# Ujenzi Frontend Integration Reality Audit

**Reconciliation date:** 2026-09-18 (Africa/Nairobi)
**Authoritative baseline:** `origin/main` at `498d4b16725a46ae9dd9bab926cdbdd377ddb5c0`
**Reconciliation branch:** `arena/01a0adfa-beyu-os-1-0`

## Corrected executive finding

Ujenzi is **implemented in current canonical main**. The earlier version of this document audited commit `51f50b8` before Ujenzi was merged and is superseded by this reconciliation.

Canonical provenance is PR [#69](https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/69), merged as `498d4b1`. Its implementation commits are `eccfd17` through `152f71f`. Open PR #61 (`94abed5`) is a different historical Digital Twin candidate and is **SUPERSEDED**; none of it was copied or merged here.

Current main provides one Ujenzi Sector OS beneath the BEYU control plane—never separate BOQ, procurement, site, HSE, or handover operating systems.

## PR #68 reconciliation classification

| PR #68 artifact | Old assertion | Classification | Current treatment |
|---|---|---|---|
| This audit | Ujenzi absent at `51f50b8` | REWORK | Rewritten against merged PR #69 and executed gates |
| Ujenzi report | Implementation blocked | REWORK | Rewritten as current integration report |
| Agriculture audit | Agriculture already integrated | KEEP + REWORK | Preserve matrix; refresh baseline, cross-sector boundary, and evidence |
| Agriculture report | Existing implementation preserved | KEEP + REWORK | Refresh tests, dependency result, and provenance |
| PR #61 candidate | Possible future source | SUPERSEDED | Do not merge or import |
| PR #69 implementation | Not visible to old audit | KEEP / canonical | Current source of truth; no duplicate implementation |

## Canonical integration inventory

| Layer | Evidence | Result |
|---|---|---|
| Framework | Next.js 16.3.3 App Router, React 19.2.6, TypeScript 5.9.3 | Existing BEYU stack reused |
| Launcher/shell | `src/lib/operating-systems.ts`, `src/app/launcher/page.tsx`, `src/app/os/layout.tsx` | One control plane + five Sector OS destinations |
| Deep-link boundary | `src/app/os/ujenzi/layout.tsx` | Principal, canonical `BEYU-UJENZI` target, classification, and entity-scope fail-closed checks |
| Frontend | 14 `page.tsx` files under `src/app/os/ujenzi` | Server-rendered Ujenzi workspace at `/os/ujenzi` |
| HTTP API | 32 `route.ts` files under `src/app/api/v1/ujenzi` | `/api/v1/ujenzi/*`, all routed through `guarded()` or Ujenzi guarded helpers |
| Domain | `src/lib/ujenzi/index.ts`, `http.ts`, `schemas.ts` | Tenant-owned construction operations and governed transitions |
| Schema | `src/db/schema/ujenzi.ts` | 23 Ujenzi tables |
| Migration | `drizzle/0043_ujenzi_os.sql` | Additive Ujenzi schema, constraints, grants, ENABLE + FORCE RLS |
| Permissions | `ujenzi:data.read`, `ujenzi:data.manage` in `src/lib/constants.ts` | Named grants plus RBAC/ABAC checks |
| Tenant/entity | `BEYU-UJENZI`, `TEN_BEYU_UJENZI`, `LEN_BEYU_UJENZI_LTD` | Canonical target and construction legal entity |
| Noelia | `src/lib/noelia/tools/ujenzi-operations.ts` | Governed observation only; no self-authorization |
| Finance boundary | Ujenzi events and dashboard declarations | Journals remain `FINANCE_OS_ONLY`; `CAP_POSTING` remains `LOCKED` |
| Mobile | Existing `mobile/flutter/` inspected | No duplicate identity or business-logic implementation added by this reconciliation |

## Route / capability matrix

All routes inherit the Ujenzi layout and each page independently calls `requireAccess("ujenzi:data.read")`.

| Capability | Web route | Principal API families | Data/services | Status |
|---|---|---|---|---|
| Command center | `/os/ujenzi` | `/dashboard` | project/site/cost/HSE/quality summaries | FULLY_INTEGRATED |
| Projects and phases | `/os/ujenzi/projects`, `/projects/[id]` | `/projects`, `/phases`, `/milestones` | project lifecycle and scoped detail | FULLY_INTEGRATED |
| BOQ and cost control | `/os/ujenzi/boq-cost` | `/boqs`, `/boqs/[id]/items`, `/boqs/[id]/approve`, `/cost-records` | immutable BOQ versions and five cost kinds | FULLY_INTEGRATED |
| Site operations | `/os/ujenzi/site` | `/sites`, `/site-diaries`, `/toolbox-talks` | site records and diaries | FULLY_INTEGRATED |
| Procurement | `/os/ujenzi/procurement` | `/requisitions`, approvals, `/purchase-orders`, approvals | governed procurement transitions | FULLY_INTEGRATED |
| Materials | `/os/ujenzi/materials` | `/materials`, `/material-movements` | catalogue and movement events | FULLY_INTEGRATED |
| Equipment | `/os/ujenzi/equipment` | `/equipment`, `/equipment/allocations` | plant/equipment allocation | FULLY_INTEGRATED |
| Quality | `/os/ujenzi/quality` | `/inspection-requests`, results, `/ncrs`, close | QA/QC and NCR lifecycle | FULLY_INTEGRATED |
| HSE | `/os/ujenzi/hse` | `/hazards`, `/hse-incidents` | safety observations/incidents | FULLY_INTEGRATED |
| Variations | `/os/ujenzi/variations` | `/variations`, `/variations/[id]/decision` | request and governed decision | FULLY_INTEGRATED |
| Claims | `/os/ujenzi/claims` | `/claims` | claim submission | FULLY_INTEGRATED |
| Payment certification | `/os/ujenzi/payments` | `/payment-certificates` | event handoff only; no sector journal | FULLY_INTEGRATED |
| Handover | `/os/ujenzi/handover` | `/punch-items`, close, `/projects/[id]/handover` | punch-list gate and handover | FULLY_INTEGRATED |

No dedicated BIM/digital-twin or Ujenzi mobile workflow is claimed merely because PR #61 advertised one.

## Authorization and isolation findings

The effective chain is:

`BEYU session / GlobalUserID → requirePrincipal or guarded → permission RBAC → tenant/entity/classification ABAC → canonical BEYU-UJENZI target recheck → withTenantDatabaseContext → PostgreSQL RLS → audit/events`

Reconciliation hardening closes a gap found while replaying current main: generic `SECTOR_OPERATOR` grants could previously reach another sector's read API within the caller's own tenant. `src/lib/api.ts` now rechecks canonical Agriculture/Ujenzi target scope for every corresponding API permission. `src/lib/authz.ts` also binds `ujenzi:data.manage` to `BEYU-UJENZI`. URL changes are therefore not cross-sector authority.

Executed negative paths include unauthenticated page/API denial, missing permission, Agriculture→Ujenzi page/API denial, read-only write denial, foreign tenant/entity/country/project denial, malformed input, no-RLS-context denial, forged tenant insert rejection, and child-table isolation.

## Database and test evidence

A fresh disposable PostgreSQL 16.14 cluster replayed migrations `0000`–`0043`; the second migration run produced the same schema fingerprint. Runtime-role catalogue evidence found **23/23 Ujenzi tables RLS-enabled, 23/23 FORCE RLS, and 23/23 canonical `beyu_tenant_ids()` policies**.

Executed focused gates:

- Ujenzi domain + runtime RLS + ABAC: **48 passed**.
- Ujenzi live production-server HTTP: **11 passed**.
- Full root suite against PostgreSQL and `next start`: **3,732 passed, 28 skipped, 0 failed** across 198 files.
- Deployment-parity production build without runtime secrets: PASS; 146 pages and all Ujenzi routes emitted.
- Typecheck: PASS. Lint: PASS with one pre-existing `<img>` optimization warning.
- Root secret scan: PASS (1,859 tracked files).
- Root `npm audit --audit-level=high`: PASS after lock-only `js-yaml` `4.3.1 → 4.3.2`; six moderate development-tool findings remain and require breaking upgrades.

The 28 skips are repository-defined environment/owner-gated cases, not missing-server skips: `BEYU_TEST_BASE_URL` was explicitly set and the health probe was UP.

## Remaining truthful gaps

- Flutter SDK is not installed and no `mobile/flutter/test` suite exists; Flutter execution is BLOCKED.
- The first ten Agriculture tables remain non-FORCE RLS (documented in the Agriculture audit); this is not an Ujenzi migration defect.
- Browser automation/accessibility tooling beyond the server-rendered HTTP suites remains absent.
- Authenticated production verification requires controlled credentials and database/audit evidence and is not claimed here.

**Audit result:** canonical Ujenzi integration is present and verified locally; PR #61 is superseded; PR #68 documentation is reconciled without duplicating PR #69.
