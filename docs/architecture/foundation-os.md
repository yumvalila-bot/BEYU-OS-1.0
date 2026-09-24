# BEYU Foundation OS — Sector Architecture

- **Date:** 2026-09-08
- **Status:** Implemented as a first-class Sector OS inside the BEYU kernel
- **Path lock:** `src/lib/foundation/` (public alias `src/lib/foundation-os/` removed at merge — one canonical home)
- **Schema:** `src/db/schema/foundation.ts` barrelled from `src/db/schema.ts`
- **Migrations:** `drizzle/0035_foundation_os.sql` production (39 tables). `drizzle/0069_foundation_programs_rls.sql` enables RLS on the kernel-era `foundation_programs` table (see §2.1). RLS on **every** Foundation OS table — all 40 substrates now carry `ENABLE ROW LEVEL SECURITY` plus a `beyu_tenant_ids()` `<table>_tenant_isolation` policy; `foundation_suppliers` was renamed from `suppliers` at merge to avoid the kernel-asset registry collision.

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

## 2.1 Row Level Security

Every Foundation OS substrate is RLS-bound. The policy is identical on all 40
tables and is the **canonical kernel primitive**, not a Foundation-specific one:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_tenant_isolation ON <table>
  USING      (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
```

Because both clauses call `beyu_tenant_ids()`, a change to that primitive changes
the Foundation tables and their 39 siblings at once — there is one tenant
authorization model, and Foundation OS does not define a second one.

**The `foundation_programs` gap (migration 0069).** `foundation_programs` is the
canonical program substrate and is created by the **0000 kernel baseline**, not
by 0035. Migration 0035 enabled RLS on the 39 tables *it* created and enumerated
them by name in its verification block, so the pre-existing program table was
never covered. Until 0069 it was the one Foundation substrate with no RLS at
all. Measured on a freshly migrated database, as the non-superuser,
`NOBYPASSRLS` runtime role:

| Tenant context | `foundation_programs` rows | `foundations` rows |
| --- | --- | --- |
| `TEN_BEYU_FOUNDATION` (owner) | **3** | 1 |
| `TEN_BEYU_TZ` (foreign) | **3** ← should be 0 | 0 |
| `TEN_FOREIGN_XYZ` (nonexistent) | **3** ← should be 0 | 0 |
| `""` (empty, fail-closed) | **3** ← should be 0 | 0 |

`foundations` correctly closed to 0 for every foreign and empty context;
`foundation_programs` returned every row for every context. The application
layer filters on `tenant_id` (`service-operations.ts`), so this was not a live
cross-tenant read through the API — it was the **loss of the defence in depth**
the other 39 tables have. RLS exists so that one missing `WHERE` clause in a
future Foundation query cannot become a cross-tenant disclosure.

0069 closes it: `ENABLE ROW LEVEL SECURITY` + the canonical policy + a
supporting `foundation_programs_tenant_idx` (the table had only its primary key
while every sibling carries a `*_tenant_idx`) + a runtime-role grant assertion
for fresh installs where migrations precede `scripts/setup-db-role.ts`.

`FORCE ROW LEVEL SECURITY` is deliberately **not** applied, matching all 39
siblings: `src/db/seed.ts` writes Foundation program rows through the admin
connection without a tenant GUC, and forcing RLS on the owner would break
`npm run seed`.

Post-0069 measurement (same probe, same role): foreign and empty contexts return
**0** rows; the owner context still returns 3.

The executable proof is `tests/security/foundation-rls-isolation.test.ts`, which
asserts the structural coverage of all 40 substrates *and* the behavioural
isolation (cross-tenant read, cross-tenant insert under `WITH CHECK`, cross-tenant
update, cross-tenant delete, join traversal, and `SET LOCAL` non-leakage across
transactions). Reverting the policy makes 11 of its 12 assertions fail.

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

- `tests/security/foundation-rls-isolation.test.ts` — runtime-role RLS: structural coverage of all 40 Foundation substrates, plus cross-tenant read / insert / update / delete, join traversal, `SET LOCAL` non-leakage (12)
- `tests/foundation/engines.test.ts` — lifecycle, formation, jurisdiction, deadline, escalation, i18n, evidence, simulator (27)
- `tests/foundation/domain.test.ts` — service CRUD, tenant isolation, finance boundary, audit (12)
- `tests/foundation/target-scope.test.ts` — the canonical Foundation target-tenant/classification boundary (21)
- `tests/security/foundation-api-target-scope.test.ts` — the same boundary independently at the API edge (10)
- `tests/foundation/http.test.ts` — transport, RBAC matrix, wrong-tenant denial, forgery attempts, UI parity (18; requires a running server)
- Merge-hardening: bootstrap enrollment suites restore the seeded admin in `afterAll`; specialist migration-count pins attribute both `0034_agriculture_os` and `0035_foundation_os`

## 9. Operations

Outage containment is paper + queue. Never unlock CAP_POSTING to "recover" grants or disbursements.

## 10. Explicit non-goals

- No competing ledger, GlobalUserID, HCM master, or Noelia identity
- No `authorizeCapitalRequestGovernance` / posting-engine calls from foundation code
- No FOUNDATION as web launcher federated OS
- No fabricated TRA/TCRA/registry integrations — jurisdiction data is versioned reference data, not an integration
- Risk register is operational, not `%risk%` enterprise risk
