# Agriculture Frontend Integration Reality Audit

**Audit date:** 2026-09-17 (Africa/Nairobi)  
**Audited branch / HEAD:** `arena/01a0adfa-beyu-os-1-0` / `51f50b82ec236fa638dd2af619fa563a6a81903b`  
**Framework:** Next.js 16.3.3 App Router, React 19.2.6, TypeScript 5.9.3, Drizzle ORM/PostgreSQL; Flutter client under `mobile/flutter`

## Executive finding

The existing Agriculture frontend is already mounted in the authenticated BEYU shell and launcher. Its canonical web entry is **`/os/agriculture`**, with a capability directory at **`/os/agriculture/capabilities`**. The API surface is **`/api/v1/agriculture/*`**. The audit found 90 route files, all using `guarded` directly or the governed Agriculture list/create helpers. There is no standalone Agriculture repository, authentication system, ledger, HCM, Noelia, HIVE, or launcher.

The dashboard is a real SSR operational frontend. Most of the broader 90-route API surface is discoverable through the capability-directory UI but does not have dedicated web CRUD forms; those capabilities are `PARTIALLY_INTEGRATED` or `BACKEND_ONLY`, not fabricated as complete UIs.

## Entry points and deployment assumptions

| Layer | Evidence |
|---|---|
| Authenticated shell | `src/app/os/layout.tsx`, `src/app/os/os-navigation.tsx` |
| Existing launcher | `src/app/launcher/page.tsx`, `src/lib/operating-systems.ts` |
| Agriculture deep-link layout | `src/app/os/agriculture/layout.tsx` |
| Dashboard | `src/app/os/agriculture/page.tsx` |
| Capability directory | `src/app/os/agriculture/capabilities/page.tsx` |
| API | 90 route files under `src/app/api/v1/agriculture` |
| Services | `src/lib/agriculture/index.ts`, `export.ts`, `http.ts`, `errors.ts` |
| Schema | `src/db/schema/agriculture.ts` (84 exported tables) |
| Migrations | `0031`, `0032`, `0034`, `0039` |
| Mobile | `mobile/flutter/lib/screens/os_screens/agriculture_os_screen.dart`; API and secure offline queue in `mobile/flutter/lib/services/api_client.dart` and secure-storage service |
| Deployment | One Next/Vercel application; browser-facing calls are same-origin `/api/v1/agriculture/*` |

## Authorization, role, scope, RLS, audit

1. `requirePrincipal()` resolves the canonical BEYU principal and redirects unauthenticated pages to sign-in.
2. Agriculture layout resolves active `BEYU-AGRI` through `operatingSystemTenantInScope`, constrained by `tenantScopeIds` and classification.
3. Both pages call `requireAccess("agriculture:data.read")`; both refuse tenant-wide relational reads when `entityScope` is non-empty because not every Agriculture relation has a canonical legal-entity key.
4. API routes use `guarded`, which resolves the principal, applies `can`, rate limits, tenant DB context, sanitized errors and audit.
5. Reads require `agriculture:data.read`; writes require `agriculture:data.manage`. `can()` additionally binds Agriculture writes to tenant code `BEYU-AGRI`, preventing a generic Health `SECTOR_OPERATOR` from mutating Agriculture.
6. Service writes derive actor tenant/user/trace metadata from `HandlerContext` via `agriActor`; client-supplied tenant identity is not trusted.
7. Application queries include tenant predicates. Classification-bearing rows are filtered with known classifications at/below principal clearance.
8. Migrations enable RLS on all 84 Agriculture tables. `0032` corrects the first 10 policies to canonical `beyu_tenant_ids()`; `0034` and `0039` use `ENABLE` + `FORCE RLS`. The first 10 tables were created with `ENABLE RLS` but not `FORCE RLS`; runtime protection relies on the non-owner runtime role plus canonical policy. This is recorded as a remaining hardening gap rather than overstated.
9. Writes use canonical `withAuditTransaction` and enterprise events where the domain defines an event. Route-level `guarded` audit records accesses/actions.
10. Offline envelopes are bound client-side to cached GlobalUserID+tenant, those fields are removed before upload, and `/sync` re-resolves the current server principal and requires `agriculture:data.manage`. `acceptSyncEnvelope` receives the server-derived actor; offline state is not authority.

### Named role evidence

`src/lib/constants.ts` explicitly grants Agriculture read to selected enterprise roles and read/manage to `SECTOR_OPERATOR`. Exact role behavior is tested in `tests/agriculture/os.test.ts` and cross-sector write denial is tested in `tests/authorization/abac-decision.test.ts`.

## Capability matrix

All API paths below are relative to `/api/v1/agriculture`. Shared frontend components are BEYU `Metric`, `Panel`, `Badge`, `EmptyState`, `Denied`, `Icon`, and normal Next `Link`.

| Capability | Source / service | Frontend component and route | API | Database | Migration | Permission / scope | RLS / audit / tests | Status |
|---|---|---|---|---|---|---|---|---|
| Executive dashboard | `agricultureDashboard`, `exportDashboard` | SSR metrics/tables, `/os/agriculture` | `/dashboard` | farms, crop cycles, harvests, herds, work, hazards, capital, export tables | 0031/0034/0039 | read; tenant target; classification; entity-scoped grants refused | RLS + guarded audit; agriculture/frontend tests | FULLY_INTEGRATED |
| Farms / land / fields | `index.ts` + generated services | Farm table on dashboard; directory at `/capabilities` | farmers, farms, land-parcels, fields, field-zones | corresponding Agriculture tables | 0031/0034 | read/manage; farm creation validates Agriculture legal entity and country | RLS + audit; foundation/os/http tests | PARTIALLY_INTEGRATED |
| Crops / planting / production | `index.ts` + generated services | crop-cycle table + directory | crop-types, crop-cycles, inputs, input-applications, irrigation, soil-tests, pest-observations, yield-outlook | crop/input/irrigation/soil/pest/yield tables | 0031/0034 | read/manage; tenant/classification | RLS + audit; agriculture tests | PARTIALLY_INTEGRATED |
| Harvest | `recordHarvest`, `listHarvests` | harvest table | harvests | harvests, yield records, enterprise events | 0031/0034 | read/manage | RLS + audit; verifies `HARVEST_RECORDED`, no journals | FULLY_INTEGRATED (read UI; write API/mobile) |
| Livestock / veterinary | `createHerd`, `recordLivestockEvent`, generated services | herd metric/table + directory | livestock-types, livestock, livestock/events, animals, veterinary | livestock/animal/veterinary tables | 0031/0034 | read/manage | RLS + audit; agriculture tests | PARTIALLY_INTEGRATED |
| Aquaculture | generated services | directory | aqua-units, aqua-stockings, aqua-harvests, water-quality | aqua/water tables | 0034 | read/manage | RLS + guarded audit | BACKEND_ONLY |
| Environment / trees / IoT | generated services | directory | water-sources, env-metrics, weather, measurements, tree-species, trees, tree-plantings, iot-devices, iot-readings | corresponding tables | 0034 | read/manage | RLS + guarded audit | BACKEND_ONLY |
| Work / equipment / assets | generated services | work-order metrics/table + directory | field-tasks, task-assignments, work-orders, equipment, equipment-service, assets | corresponding tables | 0034 | read/manage; HCM remains shared truth | RLS + guarded audit | PARTIALLY_INTEGRATED |
| Inventory / lots / storage / processing | generated services | directory | inventory-items, inventory-lots, inventory-moves, warehouses, storage-records, process-runs | corresponding tables | 0034 | read/manage | RLS + guarded audit | BACKEND_ONLY |
| Quality / safety / compliance | generated services | hazard metric/table + directory | inspections, lab-results, certificates, licenses, permits, violations, hazards, hazard-mitigations, corrective-actions, safety-incidents | corresponding tables | 0034 | read/manage; operational, not duplicate enterprise risk/compliance | RLS + guarded audit | PARTIALLY_INTEGRATED |
| Projects / capital / insurance | generated services + `createCapitalCase` | capital table + directory | projects, project-milestones, project-budgets, capital-cases, insurance-policies, insurance-claims | corresponding tables | 0034 | read/manage | RLS + audit; capital is handoff only | PARTIALLY_INTEGRATED |
| Commercial / orders / logistics | generated services | directory | suppliers, buyers, products, listings, orders, order-items, shipments, shipment-items | corresponding tables | 0034 | read/manage; not Finance truth | RLS + guarded audit | BACKEND_ONLY |
| Food export orders | `export.ts` | export metrics/order table + directory | export-orders and parameterized order routes | export orders | 0039 | read/manage; tenant/classification | FORCE RLS + audit; `export.test.ts` | FULLY_INTEGRATED (read UI; workflow APIs) |
| Lot allocation / traceability | `export.ts` | directory | export-allocations, order allocate/traceability, trace-batches, trace-links | inventory lots, trace batches/links, export allocations | 0034/0039 | read/manage | FORCE RLS + audit; export tests | PARTIALLY_INTEGRATED |
| Export compliance / documents / holds | `export.ts` | active-hold metrics/table + directory | compliance requirements/checks, documents, holds and order subroutes | export compliance/check/document/hold tables + canonical Agriculture documents | 0039 | read/manage; Noelia cannot release holds | FORCE RLS + audit; export/Noelia tests | PARTIALLY_INTEGRATED |
| Export shipments | `export.ts` | shipment metric/table + directory | export-shipments | shipments and export shipments | 0034/0039 | read/manage | FORCE RLS + audit; export tests | PARTIALLY_INTEGRATED |
| Agreements / documents / observations / advice | generated services | directory | agreements, documents, observations, ai-advice | corresponding tables | 0034 | read/manage; canonical Noelia remains owner of AI identity | RLS + guarded audit | BACKEND_ONLY |
| What-if | `runWhatIf` | route listed as mutation code, no form | whatif | what-if runs | 0034 | read; simulation only | RLS + audit; os tests | BACKEND_ONLY |
| Offline queue / sync | `acceptSyncEnvelope`; Flutter API/secure storage | Flutter operations; web directory marks route non-navigable | sync | sync envelopes | 0034 | manage, revalidated server-side | FORCE RLS + audit; os/http tests | FULLY_INTEGRATED (mobile/API) |
| Noelia | canonical tool registry + Agriculture export tools/read service | canonical Noelia UI, contextual tools | canonical Noelia API | canonical AI/audit + Agriculture reads | existing canonical migrations | `agriculture:data.read`, side effects NONE | tool registry/governance/export tests | FULLY_INTEGRATED |

## Route → component → API → database summary

| Web route | Component | APIs/services used | Database |
|---|---|---|---|
| `/launcher` | existing `DestinationCard` launcher | `authorizedOperatingSystems` checks `BEYU-AGRI` + read grant | tenants + identity/role grants |
| `/os/agriculture` | `AgriculturePage` with BEYU design components | server-side `agricultureDashboard`, `exportDashboard`, scoped Drizzle reads | operational and export tables listed above |
| `/os/agriculture/capabilities` | `AgricultureCapabilitiesPage` | links to actual governed APIs; does not proxy or duplicate | no business read during directory render |
| `/api/v1/agriculture/*` | Next route handlers | `guarded` → Agriculture service | 84 Agriculture tables + canonical audit/events |
| Flutter Agriculture shell | `AgricultureOSScreen` | dashboard, harvests, capital cases, what-if, sync | same governed server APIs |

## Tests identified

- `tests/agriculture/{foundation,os,http,export}.test.ts`
- `tests/frontend/{integration,control-plane-ia,capability-completeness,accessibility-nav-gating}.test.ts`
- `tests/authorization/abac-decision.test.ts`
- tenant/database/security suites covering canonical guard/RLS primitives
- Flutter tests are not present in `mobile/flutter/test`; the sandbox also has no Flutter executable.

## Verified gaps

1. Dedicated web CRUD/workflow screens do not exist for most API domains; the directory exposes governed JSON endpoints rather than pretending complete UI workflows.
2. Entity/country scope is complete for farm creation and parent-derived paths, but many relational rows lack direct `legal_entity_id` / `country_code`; web pages safely deny any non-empty entity scope rather than risk leakage.
3. The first 10 Agriculture tables are RLS-enabled and use canonical policies, but are not `FORCE RLS`; runtime role separation is therefore material.
4. No E2E browser harness or automated accessibility runner is configured.
5. Flutter toolchain/tests are unavailable in this environment.
6. Production authenticated, cross-tenant, entity, country, RLS and audit behavior cannot be claimed without controlled production principals and database evidence.

## Audit decision / implementation gate

The requested frontend federation is already present for the verified Agriculture frontend. No additional launcher, sidebar, authentication, API, schema, migration, finance path, Noelia, or HIVE implementation is justified. Creating conceptual pages for backend-only capabilities would violate the “only expose verified existing functionality” requirement. The implementation phase is therefore limited to documenting the existing integration and preserving its route (`/os/agriculture`).
