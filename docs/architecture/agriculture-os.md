# BEYU Agriculture OS — Sector Architecture

- **Date:** 2026-09-08
- **Status:** Implemented as a first-class Sector OS inside the BEYU kernel
- **Path lock:** `src/lib/agriculture/` (never `src/lib/agriculture-os/`)
- **Schema:** `src/db/schema/agriculture.ts` barrelled from `src/db/schema.ts`
- **Migrations:** `drizzle/0031_*` foundation (10 tables) + `drizzle/0034_agriculture_os.sql` production (67 tables). FORCE RLS on every `agriculture_%` table (77 total).

## 1. What Agriculture OS is

Agriculture OS is the Tanzania-first, globally portable **operational** system of record for:

- land, farms, fields, parcels, trees
- crop types, crop cycles, inputs, harvests, yield records
- livestock types, herds, animals, veterinary events
- aquaculture, water, weather, IoT
- inventory, work orders, observations, traceability
- marketplace (listings/orders — commercial ops, not a ledger)
- projects, hazards, permits, insurance
- capital **cases** (handoff only)
- offline sync envelopes
- what-if **simulations**

It is **not** a competing control plane. It reuses, and must never replace:

| Capability | Owner | Agriculture OS may |
| --- | --- | --- |
| Identity / GlobalUserID | BEYU OS | consume the resolved principal |
| HCM / employee master | Shared HCM | consume workforce identity; never copy it |
| Journals / treasury / capital execution | Finance OS | emit events and hand off cases |
| Audit + enterprise events | BEYU OS (`src/lib/audit.ts`) | append via `withAuditTransaction` |
| Authorization | BEYU OS RBAC+ABAC | `agriculture:data.read` / `agriculture:data.manage` |
| Noelia / HIVE | BEYU OS | observe via `agriculture.operations.observe` |
| CAP_POSTING | Finance OS, LOCKED | never unlock, never call the posting engine |

## 2. Authority and grants

Named grants only (A-06-1). Agriculture permissions are **not** granted via `Object.keys(PERMISSIONS)`.

| Role | `agriculture:data.read` | `agriculture:data.manage` |
| --- | --- | --- |
| GROUP_CEO | yes | no |
| GROUP_CFO | yes | no |
| CHIEF_RISK_COMPLIANCE | yes | no |
| AUDITOR | yes | no |
| SECTOR_OPERATOR | yes | yes |
| HCM_DIRECTOR | no | no |
| CHIEF_GOVERNANCE_OFFICER | no | no |
| FAMILY_OFFICE_PRINCIPAL | no | no |
| PLATFORM_ADMIN | no | no |

HTTP: GET requires read; POST requires manage (except what-if, which is a read-side SIMULATION).

Canonical Agriculture identity (BEYU OS, not a second identity system):

| Principal | Tenant | Entity | Agriculture write |
| --- | --- | --- | --- |
| `agri.ops@beyu.os` (`SECTOR_OPERATOR`) | `BEYU-AGRI` / `TEN_BEYU_AGRI` | `LEN_BEYU_AGRI_LTD` (`BEYU-AGR`, sector `AGRICULTURE`, country `TZ`) | ALLOW |
| `health.ops@beyu.os` (`SECTOR_OPERATOR`) | `BEYU-HEALTH` | Health entity | DENY (`can()` ABAC + domain SCOPE) |
| Unauthenticated | — | — | DENY (401) |
| Tenant A → tenant B / entity A → entity B / country A → country B | | | DENY |

`agriActor` is always `ctx.principal` (GlobalUserID → session tenant → entity). Production routes never hardcode Health emails or `LEN_BEYU_HEALTH_LTD`.

Web: `/os/agriculture` is a BEYU kernel module (`agriculture:data.read`), listed in OS nav. It is **not** a federated launcher OS sibling of Health. `tests/authorization/os-authorization.test.ts` stays BEYU+HEALTH only.

## 3. Finance boundary

```
Harvest recorded
  → insert agriculture_harvests + agriculture_yield_records
  → audit agriculture.harvests.record
  → enterprise event HARVEST_RECORDED (domain AGRICULTURE)
  → journalsPosted: false
  → Finance OS remains the only journal writer

Capital case submitted
  → insert agriculture_capital_cases
  → financeHandoff = SUBMITTED_PENDING_FINANCE
  → capPosting = LOCKED
  → no row in capital_requests
```

What-if (`POST /api/v1/agriculture/whatif`) persists `agriculture_whatif_runs` with `basis = SIMULATION` and epistemic status `SCENARIO`. It is not a forecast and not financial truth.

Interop: `DOM-AGRICULTURE` is PARTIAL. Connectivity edge `AGRICULTURE → FINANCE` is EVENT (`HARVEST_RECORDED` + capital-case handoff). Failure mode `DATA_NOT_AVAILABLE`. Continuity: no sector-side financial truth.

## 4. Data model (unique keys)

| Table | Unique |
| --- | --- |
| `agriculture_farms` | `(tenant_id, code)` |
| `agriculture_fields` | `(farm_id, code)` |
| `agriculture_crop_cycles` | `(tenant_id, code)` |
| `agriculture_harvests` | `(tenant_id, code)` |
| `agriculture_capital_cases` | `(tenant_id, code)` |
| `agriculture_sync_envelopes` | `(tenant_id, envelope_id)` |

Default timezone `Africa/Dar_es_Salaam`, default country `TZ`. Tenant isolation is FORCE RLS plus application `tenantId` predicates.

## 5. API

Base: `/api/v1/agriculture/*`. Guarded (`src/lib/api.ts`) with `agriculture:data.read` / `agriculture:data.manage`.

Special routes:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/dashboard` | operational counts + financeBoundary |
| GET/POST | `/harvests` | POST never journals |
| GET/POST | `/capital-cases` | GET returns `{ items, capPosting: "LOCKED" }` |
| POST | `/whatif` | SIMULATION only |
| POST | `/sync` | idempotent envelope; replay 200 else 201 |

Plus 67 generated list/create routes for the 0034 tables.

Actor mapping (`agriActor`): `principal.userId` / `tenantId` / `traceId` / `ip` / `userAgent`. Harvest events with a human actor set `actorType = HUMAN`. Harvest without an actor skips the event (write-only).

Interop IDs: `/^[A-Za-z0-9_-]{8,128}$/` for `traceId` / `globalUserId` / `principalId` / `messageId`.

## 6. Noelia / HIVE

- Tool: `agriculture.operations.observe` → `BeyuNoeliaReadService.agriculture` → `agricultureDashboard`
- Permission: `agriculture:data.read`
- Side effects: NONE
- Cross-OS dispatcher includes AGRICULTURE (not UNAVAILABLE)
- Noelia does **not** gain an `"AGRICULTURE"` engine identity
- Noelia cannot post, fund, diagnose, or accept risk

## 7. Clients

| Surface | How |
| --- | --- |
| Web | `src/app/os/agriculture/page.tsx` — SSR, `requireAccess("agriculture:data.read")`, tenant context |
| Phone / tablet / desktop Flutter | `AgricultureOSScreen` (Card/module). Reached from BEYU OS modules and from `OSCode.agriculture` in the OS shell. Not a federated launcher OS. |
| Offline | `flutter_secure_storage` envelope queue → `POST /api/v1/agriculture/sync` |

## 8. Tests

- `tests/agriculture/foundation.test.ts` — schema + RLS 77
- `tests/agriculture/os.test.ts` — harvest event, journals 0, no `capital_requests`, what-if SIMULATION, grants, Noelia observe, CAP_POSTING LOCKED, interop
- `tests/agriculture/http.test.ts` — transport (skipIf no server), pattern from `tests/hcm/hcm-http.test.ts`
- Frontend integration unauthenticated list includes `/os/agriculture`

## 9. Operations

- Runbook: [RB-019](../runbooks/RB-019-agriculture-os-outage.md)
- Outage containment is paper + idempotent envelopes. Never unlock CAP_POSTING to “recover” harvests.

## 10. Explicit non-goals

- No competing ledger, GlobalUserID, HCM master, or Noelia identity
- No `authorizeCapitalRequestGovernance` / posting-engine calls from agri
- No AGRICULTURE as web launcher federated OS
- No sqflite/Hive — queue is `flutter_secure_storage`
- No fabricated NHIF/TRA/weather integrations
- Hazard register is operational, not `%risk%` enterprise risk
