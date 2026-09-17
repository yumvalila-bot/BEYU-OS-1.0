# UJENZI OS — Architecture

**Status:** IMPLEMENTED and VERIFIED (unit + RLS adversarial + live-server HTTP suites green; see
`UJENZI_OS_PRODUCTION_READINESS.md` for the verification matrix).
**Position:** UJENZI OS is a **Sector OS inside BEYU OS 1.0** — the single operating system, single
repo, single control plane. It is *not* a second OS product and creates no second authority for
identity, finance, HCM, governance, audit, compliance, AI, documents or workflow.

---

## 1. Position in the BEYU hierarchy

```
BEYU Family Trust
└── BEYU Holding
    └── Country Holdings (e.g. BEYU Tanzania Holding)
        └── Sector LLCs
            └── BEYU Construction Ltd (legal entity BEYU-UJZ, sector CONSTRUCTION)
                └── served by UJENZI OS (tenant BEYU-UJENZI, type SECTOR)
```

- The **tenant** `BEYU-UJENZI` (id `TEN_BEYU_UJENZI`, parent `TEN_BEYU_TZ`, country `TZ`) is the
  row-level isolation boundary for every Ujenzi table.
- The **legal entity** `BEYU-UJZ` (`LEN_BEYU_UJENZI_LTD`, operating company, parent
  `LEN_BEYU_TZ_HOLDING`, functional currency TZS) is the entity-ABAC boundary: every project,
  and every entity-carrying record, must reference an entity the tenant owns.
- The **OS registry** entry `UJENZI_OS` (`SECTOR_OS`, ACTIVE) is the canonical registration — no
  second registry was invented.
- BEYU Foundation remains a separate nonprofit sister outside this chain and outside Ujenzi.

## 2. Layered design (all layers live in the existing repo)

| Layer | Location | Responsibility |
|---|---|---|
| Schema | `src/db/schema/ujenzi.ts` (23 `pgTable`s, 735 lines) | Table definitions, check constraints, indexes; exported through the canonical `src/db/schema.ts` barrel |
| Migration | `drizzle/0043_ujenzi_os.sql` (652 lines, 28 statements) | Additive DDL + RLS enable/force + one policy per table; recorded in `beyu_migrations` (44 applied) |
| Domain services | `src/lib/ujenzi/index.ts` (1,561 lines) | All business rules: lifecycle transitions, BOQ versioning/supersession, punch-list handover gate, finance boundary, event emission |
| Errors | `src/lib/ujenzi/errors.ts` | `UjenziDomainError` codes → HTTP statuses |
| HTTP | `src/lib/ujenzi/http.ts` (95 lines) + 32 route files under `src/app/api/v1/ujenzi/**` | `guarded()` wrappers, Zod validation, classification filtering of list rows |
| Frontend | `src/app/os/ujenzi/**` (14 pages + guarded layout + shared `sections.tsx`) | Server-rendered workspace; no client-side authz |
| AI | `src/lib/noelia/read-services.ts` + `default-tools.ts` | One governed read tool `ujenzi.operations.observe` |
| Interop | `src/lib/interoperability/domains.ts` (`DOM-UJENZI`) + `connectivity.ts` | Honest PARTIAL domain status, event contract, no new bus |

## 3. Data model (23 tenant-owned tables)

**Projects:** `ujenzi_projects`, `ujenzi_project_sites`, `ujenzi_project_phases`, `ujenzi_milestones`
**Commercial:** `ujenzi_boqs`, `ujenzi_boq_items`, `ujenzi_cost_records`, `ujenzi_variations`,
`ujenzi_claims`, `ujenzi_payment_certificates`
**Procurement/materials:** `ujenzi_requisitions`, `ujenzi_purchase_orders`,
`ujenzi_material_catalog`, `ujenzi_material_movements`
**Equipment:** `ujenzi_equipment`, `ujenzi_equipment_allocations`
**Site:** `ujenzi_site_diaries`
**Quality:** `ujenzi_inspection_requests`, `ujenzi_ncrs`, `ujenzi_punch_items`
**HSE:** `ujenzi_hse_incidents`, `ujenzi_hazard_register`, `ujenzi_toolbox_talks`

Every table carries `tenant_id`, `classification` (ABAC ceiling), timestamps, and (where the record
belongs to an entity) `legal_entity_id` + `country_code`. Lifecycle statuses are enforced by CHECK
constraints, not by convention (e.g. project `PLANNED|ACTIVE|ON_HOLD|COMPLETED|HANDED_OVER|CLOSED`;
BOQ `DRAFT|SUBMITTED|APPROVED|SUPERSEDED`; certificate `DRAFT|CERTIFIED`; certification outcome is
locked to `CERTIFIED_PENDING_FINANCE_INTEGRATION`).

### Key invariants (each asserted by tests)

1. **BOQ versioning is append-only history.** Approving a BOQ supersedes the previously approved
   version (`SUPERSEDED`) without mutating or deleting historical rows; `total_value` is preserved.
2. **Payment certification never posts money.** Certifying a certificate computes
   gross/retention/net and sets the outcome `CERTIFIED_PENDING_FINANCE_INTEGRATION`; there is no
   journal entry, no GL touch, no treasury call. CAP_POSTING stays LOCKED fail-closed.
3. **Handover is punch-gated.** A project cannot be handed over while any punch item is OPEN;
   the gate is enforced in the domain service (server-side), not the UI.
4. **Cost records are informational kinds only.** `kind ∈ {BUDGET|FORECAST|COMMITMENT|ACTUAL}`
   — a cost record is never an accounting fact.
5. **Every mutation is audited and evented atomically** via the canonical
   `withAuditTransaction` (audit row + hash-chained `enterprise_events` append in the same
   transaction): `PROJECT_CREATED`, `BOQ_APPROVED`, `PURCHASE_ORDER_APPROVED`,
   `MATERIAL_RECEIVED`, `NCR_CREATED`, `HSE_INCIDENT_RECORDED`, `VARIATION_REQUESTED/APPROVED`,
   `CLAIM_SUBMITTED`, `PAYMENT_CERTIFIED`, `PROJECT_HANDED_OVER`.

## 4. Authorization architecture (no parallel engine)

Ujenzi consumes the ONE BEYU authorization chain:

```
GlobalUserID → session → RBAC + ABAC → OS scope → tenant → entity → country
  → classification ceiling → capability → policy → RLS → operation
```

- Two new permissions only: `ujenzi:data.read` / `ujenzi:data.manage` (defined in
  `src/lib/constants.ts`, granted to sector roles; visible to GROUP_CEO as read-only oversight).
- HTTP: every route goes through the canonical `guarded()` (session, permission, rate limit,
  audit). URL paths are never authorization; deep links re-check server-side on every request.
- Service layer: `assertActorTenant` + `assertUjenziLegalEntity` re-assert tenant/entity/country
  on every write regardless of caller.
- Rows: RLS policy `ujenzi_tenant_isolation` on all 23 tables using the canonical
  `beyu_tenant_ids()` context function, `FORCE ROW LEVEL SECURITY`, single policy per table.
- List endpoints additionally filter rows by the caller's classification ceiling
  (`visibleUjenziItems`) — defense in depth above RLS.

See `UJENZI_OS_SECURITY.md` for the adversarial test evidence.

## 5. No second anything (STOP-rule compliance)

| Shared capability | Ujenzi consumption | Second implementation? |
|---|---|---|
| Identity/auth | Canonical sessions, users, MFA | No |
| Finance | Budgets/estimates/BOQ/commitments/valuations only; canonical money truth stays in Finance OS | No |
| Documents | Existing document storage/linking (no Ujenzi blob store) | No |
| Workflow/approvals | Existing governance decision registry concepts; transitions are audited domain states | No |
| Events | `enterprise_events` via `publishEventTx` | No |
| Audit | `audit_log` via `recordAuditTx` | No |
| AI | Noelia single identity, one governed tool | No |
| Employees | Worker references canonical users/employees | No |
| Registry | `os_registry` entry | No |

## 6. Migration strategy

`0043_ujenzi_os.sql` follows the 0040–0042 hand-written convention (drizzle-kit `generate` is
broken on main by the pre-existing 0038/0039 snapshot collision — documented in
`UJENZI_OS_PRODUCTION_READINESS.md`). The migration is purely additive: `CREATE TABLE`,
constraints, indexes, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, one
`CREATE POLICY` per table. No existing table, policy, or migration was modified. Applied and
recorded through the canonical `npm run migrate` (idempotent re-run verified).
