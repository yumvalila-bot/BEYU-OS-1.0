# Agriculture Frontend Integration Reality Audit

**Reconciliation date:** 2026-09-18 (Africa/Nairobi)
**Authoritative baseline:** `origin/main` at `498d4b16725a46ae9dd9bab926cdbdd377ddb5c0`
**Framework:** Next.js 16.3.3 App Router, React 19.2.6, TypeScript 5.9.3, PostgreSQL/Drizzle; Flutter under `mobile/flutter`

## Executive finding

Agriculture remains one canonical Sector OS in the authenticated BEYU shell at `/os/agriculture`, with a capability directory at `/os/agriculture/capabilities` and 90 guarded API routes under `/api/v1/agriculture/*`. Current-main Ujenzi from PR #69 is additive and does not replace or duplicate Agriculture.

The old PR #68 Agriculture finding is **KEEP + REWORK**: its implementation inventory was materially correct, but its `51f50b8` baseline, missing-Ujenzi statement, test totals, dependency result, and production observations were stale.

## Canonical inventory

| Layer | Evidence | Status |
|---|---|---|
| Launcher/shell | `src/app/launcher/page.tsx`, `src/lib/operating-systems.ts`, `src/app/os/layout.tsx` | FULLY_INTEGRATED |
| Page target boundary | `src/app/os/agriculture/layout.tsx` | Principal + canonical `BEYU-AGRI` target recheck |
| Web UI | `src/app/os/agriculture/page.tsx`, `capabilities/page.tsx` | Dashboard + truthful capability discovery |
| APIs | 90 `route.ts` files under `src/app/api/v1/agriculture` | All guarded directly or through Agriculture helpers |
| Domain | `src/lib/agriculture/index.ts`, `export.ts`, `http.ts`, `errors.ts` | Canonical Agriculture services |
| Database | `src/db/schema/agriculture.ts` | 84 Agriculture tables |
| Migrations | `0031`, `0032`, `0034`, `0039` | Foundation, policy fix, full OS, food export |
| Mobile | `mobile/flutter/lib/screens/os_screens/agriculture_os_screen.dart` and shared API/offline services | Existing shared identity/API path; no duplicate business logic added |
| Noelia/HIVE | Canonical Agriculture/export observation tools | Governed, non-authorizing |
| Finance | Agriculture events and handoffs | No sector ledger; CAP_POSTING remains locked |

## Capability matrix

| Capability group | UI evidence | API/data evidence | Status |
|---|---|---|---|
| Executive dashboard | Metrics and operational tables at `/os/agriculture` | `/dashboard`; farms, cycles, harvests, livestock, work, hazards, capital/export summaries | FULLY_INTEGRATED |
| Farms/land/fields | Dashboard farm view + capability directory | farmers, farms, parcels, fields, zones | PARTIALLY_INTEGRATED |
| Crops/inputs/irrigation/soil/pests/yield | Cycle view + directory | corresponding guarded APIs/tables | PARTIALLY_INTEGRATED |
| Harvest | Dashboard table | harvest API/domain; `HARVEST_RECORDED` event | FULLY_INTEGRATED read UI; governed write API/mobile |
| Livestock/veterinary/aquaculture | Metrics/table for herds; directory for remainder | livestock, animal, veterinary, aquaculture APIs/tables | PARTIALLY_INTEGRATED / BACKEND_ONLY by capability |
| Environment/trees/weather/IoT | Capability directory | water, environment, tree, weather, measurement and IoT APIs | BACKEND_ONLY web workflows |
| Work/equipment/assets | Dashboard work view + directory | field task, assignment, work order, equipment, asset APIs | PARTIALLY_INTEGRATED |
| Inventory/storage/processing | Capability directory | items, lots, moves, warehouses, storage, process runs | BACKEND_ONLY web workflows |
| Quality/safety/compliance | Hazard dashboard + directory | inspections, labs, certificates, licenses, permits, violations, corrective actions, incidents | PARTIALLY_INTEGRATED |
| Projects/capital/insurance | Capital dashboard + directory | project/milestone/budget/capital-case/insurance APIs | PARTIALLY_INTEGRATED; Finance handoff only |
| Commercial/logistics | Capability directory | supplier, buyer, product, listing, order and shipment APIs | BACKEND_ONLY web workflows |
| Food export/traceability/compliance | Export order/hold/shipment metrics and tables | export APIs and migration `0039` tables | FULLY/PARTIALLY_INTEGRATED |
| What-if | Discoverable mutation | simulation-only API/table | BACKEND_ONLY |
| Offline sync | Flutter queue | `/sync`; server re-resolves principal and accepts actor-bound envelope | PARTIALLY_INTEGRATED |

No dedicated web form is claimed for every API. A directory link is discovery, not fabricated workflow completeness.

## Authorization and cross-sector boundary

The effective path is:

`BEYU GlobalUserID/session → requirePrincipal or guarded → RBAC → tenant/entity/classification ABAC → BEYU-AGRI target recheck → withTenantDatabaseContext → PostgreSQL RLS → audit/events`

Every Agriculture API now rechecks the canonical Agriculture target through `src/lib/api.ts`, matching the page layout. Generic `SECTOR_OPERATOR` catalogue grants are not cross-sector authority. Live HTTP and page tests prove Health/Ujenzi identities cannot access Agriculture by changing URLs. Agriculture writes remain independently tenant-bound in `src/lib/authz.ts`.

Entity-scoped grants are refused for relational surfaces without complete legal-entity keys rather than widened to tenant scope. Domain operations validate legal entity, country, project/farm relationships, classification, and actor tenant as applicable. Offline identity/tenant hints are never accepted as authority; the server re-resolves the session and permission.

## RLS reality

Executed PostgreSQL 16.14 catalogue evidence:

- 84/84 Agriculture tables have RLS enabled.
- 84/84 use canonical tenant policies through the migration set.
- 74/84 have FORCE RLS.
- Ten migration-`0031` relations remain non-FORCE: crop cycles, crop types, farms, fields, harvests, input applications, inputs, livestock events, livestock herds, and livestock types.

The production runtime role is non-owner, NOSUPERUSER, and NOBYPASSRLS, so those policies enforce runtime isolation. Lack of FORCE remains a documented hardening gap and is not concealed or changed by this frontend reconciliation.

## Executed evidence

- Agriculture complete focused directory: **57 passed, 0 failed**.
- Agriculture live HTTP: **15 passed**, including 401, cross-sector 403, entity/country denial, valid harvest, event/no-journal, CAP_POSTING lock, simulation, sync replay, and no capital-request creation.
- Frontend integration: **24 passed**, including unauthenticated `/os/agriculture` and Agriculture↔Ujenzi page isolation.
- Full root suite: **3,732 passed, 28 repository-defined skips, 0 failed** with PostgreSQL and explicit production server.
- Typecheck/build/secret scan/root HIGH audit gates: PASS.
- Health frontend regression: typecheck/build PASS, 14/14 tests.
- Flutter execution: BLOCKED because the SDK is unavailable and no Flutter test suite exists.

## Decision

The canonical Agriculture frontend, APIs, schema, migrations, Noelia/HIVE, Finance boundary, and mobile integration are preserved. No second Agriculture launcher, auth system, ledger, HCM, Noelia, HIVE, repository, or deployment application was added.
