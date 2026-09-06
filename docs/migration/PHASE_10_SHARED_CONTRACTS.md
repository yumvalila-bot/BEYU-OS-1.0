# PHASE 10 — SHARED CONTRACTS AUDIT

Date: 2026-09-06
Source: `BEYU-OS-` @ `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Destination: `BEYU-OS-1.0`
Status: **AUDITED AND DECIDED — no duplicate identity authority introduced**

Categories: `KEEP_1_0`, `ADOPT_SOURCE`, `MERGE`, `REFACTOR`, `DEPRECATE`, `DEFER`

## 10.1 Identity / GlobalUserID

| Term | Destination (1.0) | Source (NEW) | Decision | Rationale |
|---|---|---|---|---|
| GlobalUserID | `users.id`, `src/lib/identity.ts` `GlobalUserID` | `SecurityContext.identityId`/`userId` | **KEEP_1_0** | Destination already has ONE canonical login identity and a single-graph resolver (`resolveByEmployeeId`, `resolveByPartyId`, `assertSingleGlobalUser`). No second identity authority was created. |
| Identity hierarchy | `parties` → `users` → `employees` | `identityId` + memberships in `SecurityContext` | **KEEP_1_0** (hierarchy), **DEFER** (source context shape) | Destination hierarchy is DB-backed and tested. The source `SecurityContext` shape is a useful future refinement, but adopting it now would create a parallel context model without a parity gain. |

## 10.2 Security/authorization context

| Term | Destination | Source | Decision | Rationale |
|---|---|---|---|---|
| Principal/context | `Principal` in `src/lib/authz.ts` (`userId, tenantId, tenantCode, roles, permissions, clearance, entityScope, mfaSatisfied, sessionId, riskScore`) | `SecurityContext` (`userId, identityId, roles, permissions, tenantIds, organizationIds, osIds, countryCodes, maxClassification, mfaSatisfied, requestId, issuedAt, expiresAt`) | **MERGE (concept), KEEP_1_0 (runtime)** | The runtime context should stay `Principal`; source fields `osIds`, `countryCodes`, `requestId`, `expiresAt` are recorded as future optional additions (deferred). No duplicate authorization decision layer was added. |
| Roles / permissions | `ROLES` + `PermissionCode` in `src/lib/constants.ts` | `Role`/`Permission` enums | **KEEP_1_0** | Destination's permission catalogue is the authoritative control-plane RBAC. |
| Classification / purpose | `Classification` + clearance ceiling | `DataClassification` | **KEEP_1_0** | Destination already enforces a clearance ceiling; source adds `SECTOR_SENSITIVE`, deferred but not contradictory. |

## 10.3 Money / amounts / currency

| Term | Destination | Source | Decision | Rationale |
|---|---|---|---|---|
| Amount | integer minor units in finance/ledger models | `*Minor: number` | **KEEP_1_0** + **ADOPT_SOURCE (waterfall only)** | Finance/ledger already uses integer minor units. The adopted waterfall engine (`src/lib/waterfall-engine-v2.ts`) uses integer minor units + integer basis points + `BigInt` multiplication, removing the legacy float-rate path for the "what should happen" engine. |
| Currency | `currency` string | `currency` string | **KEEP_1_0** | Same primitive. |
| Basis points | absent as first-class | `percentageBps` | **ADOPT_SOURCE** | Adopted engine uses integer bps; this is the canonical money-arithmetic contract for waterfall. |

## 10.4 Events / audit

| Term | Destination | Source | Decision | Rationale |
|---|---|---|---|---|
| Audit event | hash-chained BEYU audit tables + `src/lib/audit.ts` | `AuditEvent` type | **KEEP_1_0** | Destination audit chain is authoritative and verified. |
| Domain event envelope | internal events/outbox + receipt/event contracts | `packages/types/src/events.ts` | **MERGE (future), KEEP_1_0 (runtime)** | Source event envelope is a good reference; destination event/outbox implementation is already tested. Physical adoption deferred to a contract-reconciliation phase. |
| Correlation/causation ID | `src/lib/ids.ts` + request meta | `requestId` | **KEEP_1_0** | Same primitive with destination naming. |

## 10.5 OS registry / routing

| Term | Destination | Source | Decision | Rationale |
|---|---|---|---|---|
| OS registry | `osRegistry` table in `src/db/schema.ts` + `/os/registry` | `packages/types/src/os-registry.ts` | **KEEP_1_0** | Destination already has a registered OS/source-of-truth model. |
| OS authorization | `Principal.permissions` + `requireAccess` | `SecurityContext.osIds` | **KEEP_1_0** + **NEW** `src/lib/os-authorization.ts` | BEYU OS reachability is now authorization-driven (control-plane permission required); Health remains bridge-authorized. Backend still authoritative. |

## 10.6 Waterfall

| Term | Decision |
|---|---|
| Pure calculation engine (`calculateWaterfallV2`) | **ADOPT_SOURCE** |
| Finance/ledger execution authority | **KEEP_1_0** |
| Money arithmetic | **integer minor units + integer bps + BigInt** |
| Authn/authz gate before calculation | caller contract; no engine-level side effects |
| Posting / ledger / audit | outside engine; Finance OS path remains authoritative |

## 10.7 Outcome

- **One canonical identity**: destination GlobalUserID. No new identity store.
- **One runtime authorization context**: destination `Principal`. No duplicate authorization layer.
- **One money representation**: integer minor units + integer basis points in the adopted waterfall engine; floating-point rates are explicitly excluded from the new engine (the legacy `runWaterfall` wrapper remains for compatibility/parity and is still used by the existing Finance execution path until a controlled switchover is authorized).
- **New tests**: `tests/waterfall-parity.test.ts` (10), `tests/waterfall-boundary.test.ts` (3), `tests/authorization/os-authorization.test.ts` (6).
