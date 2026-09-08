# BEYU Foundation OS — Sector Architecture

- **Date:** 2026-09-08
- **Status:** Implemented as a first-class Sector OS inside the BEYU kernel
- **Path lock:** `src/lib/foundation/` (public alias `src/lib/foundation-os/` removed at merge — one canonical home)
- **Schema:** `src/db/schema/foundation.ts` barrelled from `src/db/schema.ts`
- **Migrations:** `drizzle/0032_*` foundation (10 tables) + `drizzle/0035_foundation_os.sql` production (39 tables). RLS on every Foundation OS table; `suppliers` renamed to `foundation_suppliers` at merge to avoid the kernel-asset registry collision.

## 1. What Foundation OS is

Foundation OS is the Tanzania-first, globally portable **operational** system of record for:

- foundation registry + lifecycle (IDEA → DRAFT → REVIEW → APPROVED → ACTIVE → SUSPENDED → CLOSED → ARCHIVED)
- formation engine + legal-entity formation cases
- governance (board/trustee members, meetings, resolutions)
- endowment + funds + grants + scholarships + fellowships
- donors + fundraising campaigns + pledges + donations
- programs + projects + beneficiaries + outcomes
- procurement (suppliers, purchase orders) + assets + investments
- compliance obligations/tasks/deadlines + tax positions/filings + safeguarding + risk + policies
- knowledge + what-if structure scenarios (SIMULATION, never persisted)
- capital **cases** (handoff only)

It is **not** a competing control plane. It reuses, and must never replace:

| Capability | Owner | Foundation OS may |
| --- | --- | --- |
| Identity / GlobalUserID | BEYU OS | consume the resolved principal |
| HCM / employee master | Shared HCM | consume workforce identity; never copy it |
| Journals / treasury / capital execution | Finance OS | emit events and hand off cases |
| Audit + enterprise events | BEYU OS (`src/lib/audit.ts`) | append via `withAuditTransaction` |
| Authorization | BEYU OS RBAC+ABAC | named `foundation:*` capabilities only |
| Noelia / HIVE | BEYU OS | observe via gated foundation tools |
| CAP_POSTING | Finance OS, LOCKED | never unlock, never call the posting engine |

## 2. Authority and grants

Named grants only (A-06-1). Foundation permissions are **not** granted via `Object.keys(PERMISSIONS)`.

| Role | `foundation:*.read`-class | `foundation:*.manage`-class |
| --- | --- | --- |
| GROUP_CEO | yes (registry, governance) | no |
| GROUP_CFO | yes (fund, grant, finance) | no |
| CHIEF_RISK_COMPLIANCE | yes (risk, compliance, safeguarding) | no |
| AUDITOR | yes (all read) | no |
| FOUNDATION_DIRECTOR | yes (all) | yes (registry, governance, program, grant, fund, donor, compliance, safeguarding, operations, formation, structure, tax, finance) |
| FOUNDATION_PROGRAM_OFFICER | yes (registry, program, grant, donor, compliance-scoped) | yes (program, grant) |
| CHIEF_GOVERNANCE_OFFICER | yes (governance, compliance) | no |
| FAMILY_OFFICE_PRINCIPAL | yes (registry, fund, grant) | no |
| PLATFORM_ADMIN | no | no |
| SECTOR_OPERATOR (other sectors) | no | no |

HTTP: GET requires the domain read capability; POST/PATCH/DELETE require the domain manage capability.

Canonical Foundation identity (BEYU OS, not a second identity system):

| Principal | Tenant | Entity | Foundation write |
| --- | --- | --- | --- |
| `foundation.director@beyu.os` (`FOUNDATION_DIRECTOR`) | `BEYU-FOUNDATION` / `TEN_BEYU_FOUNDATION` | `LEN_BEYU_FOUNDATION` (`BEYU-FDN`, sector `NONPROFIT`, country `TZ`) | ALLOW |
| `foundation.programs@beyu.os` (`FOUNDATION_PROGRAM_OFFICER`) | `BEYU-FOUNDATION` | Foundation entity | ALLOW (program/grant scope) |
| `health.ops@beyu.os` (`SECTOR_OPERATOR`) | `BEYU-HEALTH` | Health entity | DENY (capability + domain SCOPE) |
| Unauthenticated | — | — | DENY (401) |
| Tenant A → tenant B / entity A → entity B | | | DENY |

`foundationActor` is always `ctx.principal` (GlobalUserID → session tenant → entity). Production routes never hardcode sector emails or non-foundation entity IDs.

Web: `/os/foundation` is a BEYU kernel module (`foundation:registry.read`), listed in OS nav. It is **not** a federated launcher OS. `tests/authorization/os-authorization.test.ts` remains the BEYU+HEALTH launcher contract.

## 3. Finance boundary

```
Grant awarded
  → insert foundation_grants (+ installments)
  → audit foundation.grants.award
  → enterprise event GRANT_AWARDED (domain FOUNDATION_OS)
  → journalsPosted: false
  → Finance OS remains the only journal writer

Disbursement requested
  → financeHandoff = SUBMITTED_PENDING_FINANCE
  → capPosting = LOCKED
  → no row in capital_requests, no journal rows
```

Structure simulation (`project()`) persists NOTHING. It is a read-side SIMULATION with epistemic status `SCENARIO`. It is not a forecast and not financial truth.

Interop: `DOM-FOUNDATION` is PARTIAL. Connectivity edge `FOUNDATION → FINANCE` is EVENT. Failure mode `DATA_NOT_AVAILABLE`. Continuity: no sector-side financial truth.

## 4. Data model (unique keys)

| Table | Unique |
| --- | --- |
| `foundations` | `(tenant_id, code)` |
| `foundation_funds` | `(tenant_id, code)` |
| `foundation_grants` | `(foundation_id, code)` |
| `foundation_donors` | `(foundation_id, code)` |
| `foundation_programs` (kernel) | `(tenant_id, code)` |
| `foundation_projects` | `(tenant_id, code)` |
| `foundation_suppliers` | `(tenant_id, code)` |
| `foundation_purchase_orders` | `(foundation_id, code)` |

Default timezone `Africa/Dar_es_Salaam`, default country `TZ`. Tenant isolation is RLS plus application `tenantId` predicates. Tables without `(tenant_id, ...)` uniques scope through their `foundation_id → foundations.tenant_id` ancestry.

## 5. API

Base: `/api/v1/foundation/*`. Guarded (`src/lib/api-guard.ts` + `src/lib/api.ts`) with named foundation capabilities.

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/foundations` | registry list + create |
| GET/PATCH/DELETE | `/foundations/[id]` | lifecycle PATCH (`transition` action) |
| POST | `/foundations/[id]/transition` | explicit lifecycle route (same guard) |
| GET/POST | `/grants`, `/funds`, `/donors`, `/programs` | domain list + create |
| GET | `/dashboard` | counts + financeBoundary `{ journalsPosted: false, capPosting: "LOCKED" }` |

Actor mapping (`foundationActor`): `principal.userId` / `tenantId` / `traceId` / `ip` / `userAgent`. Mutations set human `actorType` and always emit audit + enterprise events; event emission failures fail the mutation (no silent failure).

Interop IDs: `/^[A-Za-z0-9_-]{8,128}$/` for `traceId` / `globalUserId` / `principalId` / `messageId`.

## 6. Noelia / HIVE

- Tools: `foundation.registry.summary`, `foundation.compliance.summary`, `foundation.grants.summary`, `foundation.funds.summary`, `foundation.formation.summary` + structure simulate
- Permission: matching `foundation:<domain>.read` (simulate: `foundation:structure.simulate`)
- Side effects: NONE (all tools read-only or SIMULATION)
- Invocations audited as `NOELIA_TOOL_INVOKED` on `AI_DECISION`
- Noelia does **not** gain a `"FOUNDATION"` engine identity
- Noelia cannot post, fund, disburse, or accept risk

## 7. Clients

| Surface | How |
| --- | --- |
| Web | `src/app/os/foundation/page.tsx` + 12 capability-guarded subpages (SSR, `requireAccess`, tenant context) |
| Phone / tablet / desktop Flutter | `FoundationOSScreen` (Card/module). Reached from BEYU OS modules and from `OSCode.foundation` in the OS shell. Not a federated launcher OS. |

## 8. Tests

- `tests/foundation/engines.test.ts` — lifecycle, formation, jurisdiction, deadline, escalation, i18n, evidence, simulator (27)
- `tests/foundation/domain.test.ts` — service CRUD, tenant isolation, finance boundary, audit (12)
- `tests/foundation/http.test.ts` — transport, RBAC matrix (9)
- Merge-hardening: bootstrap enrollment suites restore the seeded admin in `afterAll`; specialist migration-count pins attribute both `0034_agriculture_os` and `0035_foundation_os`

## 9. Operations

Outage containment is paper + queue. Never unlock CAP_POSTING to "recover" grants or disbursements.

## 10. Explicit non-goals

- No competing ledger, GlobalUserID, HCM master, or Noelia identity
- No `authorizeCapitalRequestGovernance` / posting-engine calls from foundation code
- No FOUNDATION as web launcher federated OS
- No fabricated TRA/TCRA/registry integrations — jurisdiction data is versioned reference data, not an integration
- Risk register is operational, not `%risk%` enterprise risk
