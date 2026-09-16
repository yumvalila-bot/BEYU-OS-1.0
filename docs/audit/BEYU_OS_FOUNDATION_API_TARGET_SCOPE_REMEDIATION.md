# BEYU OS — Foundation API Target-Scope Remediation

**Date:** 2026-09-16
**Scope:** BEYU Foundation OS — protected API execution (`src/app/api/v1/foundation/**`)
**Baseline:** `main` @ `d6f03e4` (merge of PR #63)
**Change:** `fix(security): enforce Foundation target scope at API boundary`
**Status:** implemented, regression-verified against a real PostgreSQL cluster and a real production build. Production deployment verification was **not** executed and is not claimed.

---

## 1. The gap

PR #63's capability matrix (rows 71–77, hardening statements 93–94 and 101) records the residual
gap this remediation closes:

* the Foundation **deep-link layer** proved the canonical Foundation target-tenant and
  classification boundary before rendering anything —
  `src/app/os/foundation/layout.tsx` resolves `operatingSystemTenantInScope(principal, "BEYU-FOUNDATION")`
  and additionally refuses a grant limited to named legal entities
  (`principal.entityScope.length > 0` → *"tenant-wide reads are refused"*);
* the Foundation **API routes** proved only RBAC/ABAC + tenant-subtree scoping through
  `guarded()`. No route re-resolved the canonical Foundation target. A caller that never
  rendered a page — a raw HTTP client with a valid session — therefore held Foundation
  capabilities on the strength of its **own** tenant scope rather than the canonical
  Foundation boundary. Two concrete consequences:

  1. a principal whose resolved scope contains the canonical Foundation tenant only through a
     **tenant subtree** (enterprise governance seats) reached Foundation rows without ever
     passing the deep-link boundary, and
  2. an **entity-scoped** grant reached tenant-wide Foundation records through the AI/analytics
     surface even though the UI refuses it outright.

## 2. The canonical boundary (one rule, no second authorization model)

The authoritative target is resolved from the authenticated principal **only**, by the existing
canonical Sector OS resolver — never from a URL, query parameter, body field, navigation state,
hidden UI element or other client-supplied value:

```
src/lib/foundation/target-scope.ts
  resolveFoundationTargetScope(principal)
    ├─ principal.entityScope.length > 0        → { ok: false, ENTITY_SCOPED }
    └─ resolveOperatingSystemTenant(principal, "BEYU-FOUNDATION")
         (src/lib/operating-systems.ts — ACTIVE tenant, matching code,
          id ∈ tenantScopeIds(principal), classification ≤ clearance ceiling,
          unknown/malformed clearance ⇒ classificationsAtOrBelow() = ∅ ⇒ null)
       null                                    → { ok: false, UNRESOLVED }
       tenant                                  → { ok: true, { tenantId, classification } }

  foundationTargetScopeDenial(principal) → reason | null   (API/page boundary)
  foundationTargetTenantId(principal)    → tenantId | throws FoundationError("FORBIDDEN")
  foundationScopeIds(principal)          → [tenantId]       (single-tenant query predicate)
```

Everything fails closed. There is no fallback to all tenants, a default tenant, the first tenant,
the caller's own tenant, a client-supplied tenant or public data, and an unknown/malformed
classification resolves to nothing.

## 3. Enforcement points

| # | Boundary | Location | Behaviour |
|---|----------|----------|-----------|
| 1 | API guard | `src/lib/api.ts` (`guarded()`) | For every `permission.startsWith("foundation:")` route the canonical target is resolved after `can()` allows and before the handler runs; denial joins the same audited `DENIED` branch as RBAC/ABAC and returns `403 {code:"FORBIDDEN"}` with the target-scope reason. Current **and future** `foundation:*` routes inherit it. |
| 2 | Domain services | `src/lib/foundation/{service,service-operations,compliance,reports,knowledge-graph}.ts` | Every Foundation read and write resolves `foundationTargetTenantId` / `foundationScopeIds` before touching a row; mutations are stamped with the resolved target tenant, never the caller's tenant or a client-supplied one. |
| 3 | Page guard | `src/lib/guard.ts` (`requireAccess`) | `foundation:*` pages deny on the same reason *before* the page loads data, so a page that renders outside its layout still fails closed with the governed denial panel. |
| 4 | AI surface | `src/lib/foundation/noelia-service.ts` | The registered `foundation:*` HIVE tools (exposed through `/api/v1/ai/noelia/*`) resolve the same boundary and read only the canonical target tenant; a principal the boundary cannot place reads nothing. |

The UI deep-link layer (`src/app/os/foundation/layout.tsx`) is **unchanged** — the remediation adds
enforcement, it does not weaken or replace what was already there.

## 4. Endpoint matrix

Pre-fix columns were uniform across all 39 route files, verified per endpoint by the structural
audit (`tests/security/foundation-api-target-scope.test.ts`):

* **CURRENT AUTHORIZATION (pre-fix):** `guarded()` → RBAC/ABAC via `can()` + rate limit + audit
  trail; permission per method as listed. No Foundation-specific capability check existed beyond
  this.
* **CURRENT TENANT CHECK (pre-fix):** every query narrowed by `tenantScopeIds(principal)` — the
  principal's own tenant, or the *whole tenant subtree* for enterprise governance roles. RLS
  (`beyu_tenant_ids()`) was the final boundary. **Not** the canonical Foundation target.
* **CURRENT CLASSIFICATION CHECK (pre-fix):** `permissionClassificationFloor` (safeguarding
  `HIGHLY_RESTRICTED`; governance/tax/donor/fund/grant/beneficiary/investment `RESTRICTED`; all
  other `foundation:*` `CONFIDENTIAL`) enforced by `can()`, plus `filterByClearance` on row reads.
* **ACTIVE TARGET RESOLUTION (pre-fix):** none at the API. Only the UI layout resolved it.
* **GAP:** identical for all 39 routes — protected API execution did not independently prove the
  canonical Foundation target, so a raw HTTP caller was authorized on tenant-subtree scope alone
  (and entity-scoped grants reached tenant-wide rows through the AI surface).
* **FIX:** identical for all 39 routes — guard-level canonical target gate (enforcement point 1)
  plus target-pinned domain queries (enforcement point 2). Table rows therefore differ only in
  endpoint, dataset and declared capability.

| # | ENDPOINT (METHOD) | DATASET (tables) | AUTHORIZATION (declared capability) | PRE-FIX TENANT | PRE-FIX TARGET RESOLUTION | GAP | FIX |
|---|-------------------|------------------|-------------------------------------|----------------|---------------------------|-----|-----|
| 1 | GET/POST/PATCH `/assets` | `foundation_assets` | `foundation:asset.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 2 | GET/POST `/assignments` | `foundation_workforce_assignments` (validates canonical HCM `employees`) | `foundation:assignment.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned assignment; worker read stays on the caller's canonical HCM scope |
| 3 | GET/POST/PUT `/beneficiaries` | `foundation_beneficiaries`, `beneficiary_services` | `foundation:beneficiary.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 4 | GET `/compliance/dashboard` | `foundation_obligations`, `foundation_deadlines`, `foundation_compliance_tasks`, `foundation_escalations`, `foundation_evidence` | `foundation:compliance.read` | subtree | none | no API target gate | guard gate + target-pinned aggregation |
| 5 | POST `/compliance/deadlines/[id]/complete` | `foundation_deadlines`, `foundation_evidence` | `foundation:compliance.manage` | subtree | none | no API target gate | guard gate + target-pinned read/transition |
| 6 | GET/POST `/compliance/deadlines` | `foundation_deadlines` | `foundation:compliance.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 7 | GET/PATCH `/compliance/escalations` | `foundation_escalations` | `foundation:compliance.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned read/acknowledge |
| 8 | POST/PATCH `/compliance/evidence` | `foundation_evidence` | `foundation:compliance.manage` | subtree | none | no API target gate | guard gate + target-pinned submit/verify |
| 9 | GET/POST `/compliance/obligations` | `foundation_obligations` | `foundation:compliance.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 10 | POST `/compliance/sweep` | `foundation_deadlines`, `foundation_escalations`, `foundation_notification_log` | `foundation:compliance.manage` | subtree | none | no API target gate | guard gate + target-pinned sweep and escalation writes |
| 11 | GET/PATCH `/compliance/tasks` | `foundation_compliance_tasks` | `foundation:compliance.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/transitions |
| 12 | GET/POST `/donations` | `donations` | `foundation:donor.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 13 | GET/POST `/donors` | `donors` | `foundation:donor.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 14 | GET/POST `/finance/capital` | `capital_requests` (FINANCE-owned, bridged) | `foundation:fund.read` · `.manage` | subtree | none | no API target gate | guard gate first; FINANCE-owned rows keep the resolved tenant scope (documented exception) |
| 15 | GET/PATCH `/formation/[id]` | `formation_cases` | `foundation:formation.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned read/transition |
| 16 | GET/POST `/formation` | `formation_cases` | `foundation:formation.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 17 | GET/PATCH `/foundations/[id]` | `foundations` | `foundation:registry.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned read/transition |
| 18 | GET/POST `/foundations` | `foundations` | `foundation:registry.read` · `.manage` | subtree | none | no API target gate | guard gate + target-stamped create |
| 19 | POST/PUT `/funds/allocate` | `funds`, `fund_allocations`, `fund_restrictions` | `foundation:fund.manage` | subtree | none | no API target gate | guard gate + target-pinned allocation/restriction |
| 20 | GET/POST `/funds` | `funds` | `foundation:fund.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 21 | GET/POST `/governance/conflicts` | `foundation_conflicts` | `foundation:governance.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 22 | GET/POST `/governance/meetings` | `foundation_meetings` | `foundation:governance.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 23 | POST `/grants/[id]/disbursements` | `grant_disbursements` | `foundation:grant.manage` | subtree | none | no API target gate | guard gate + target-pinned schedule |
| 24 | GET/POST `/grants/[id]/milestones` | `grant_milestones` | `foundation:grant.read` · `.manage` | subtree | none | no API target gate | guard gate + parent grant re-resolved in target scope |
| 25 | GET/PATCH `/grants/[id]` | `grants` | `foundation:grant.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned read/transition |
| 26 | GET/POST/PUT `/grants` | `grants`, `grantees` | `foundation:grant.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 27 | GET `/graph` | `foundations`, `funds`, `grants`, `foundation_programs`, proposals, meetings, conflicts | `foundation:registry.read` | subtree | none | client `foundationId` reached a graph built over the caller's subtree | guard gate + target-pinned node/edge resolution before traversal |
| 28 | GET/POST/PUT `/impact` | `foundation_impact_metrics`, `foundation_impact_measurements` | `foundation:impact.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 29 | POST `/investments/[id]/approve` | `foundation_investments` | `foundation:investment.approve` | subtree | none | no API target gate | guard gate + target-pinned read/approve |
| 30 | GET/POST/PUT `/investments` | `foundation_investments`, `foundation_investment_policies` | `foundation:investment.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 31 | GET/POST/PATCH/PUT `/procurement` | `procurements`, `foundation_suppliers` | `foundation:procurement.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 32 | GET/POST `/programs` | `foundation_programs` | `foundation:program.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 33 | GET/POST `/projects` | `foundation_projects` | `foundation:program.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 34 | GET `/reports` | aggregations over `foundations`, `funds`, `donations`, `grants`, `foundation_programs`, `foundation_impact_metrics`, `foundation_tax_*` | `type` → `foundation:registry.read` / `.donor.read` / `.grant.read` / `.impact.read` / `.tax.read` (unknown `type` → 422) | subtree | none | client `type`/`foundationId` selected a report over the caller's subtree | guard gate + target-pinned aggregation, one permission per report type |
| 35 | GET/POST/PATCH `/safeguarding` | `safeguarding_cases` | `foundation:safeguarding.read` · `.manage` (floor `HIGHLY_RESTRICTED`, unchanged) | subtree | none | no API target gate | guard gate + target-pinned reads/writes; clearance requirements preserved, never broadened |
| 36 | GET/POST `/structures` | `structure_proposals` | `foundation:structure.read` · `.manage` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 37 | GET/POST `/structures/simulate` | `structure_scenarios`, `structure_proposals` | `foundation:structure.read` · `.simulate` | subtree | none | no API target gate | guard gate + baseline/candidate re-resolved in target scope |
| 38 | GET/POST `/tax/assessments` | `foundation_tax_assessments`, `foundation_tax_rules` | `foundation:tax.read` · `.assess` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |
| 39 | GET/POST `/tax/rules` | `foundation_tax_rules` | `foundation:tax.read` · `.assess` | subtree | none | no API target gate | guard gate + target-pinned reads/writes |

## 5. Non-HTTP Foundation data surfaces

| Surface | Pre-fix | Post-fix |
|---------|---------|----------|
| `/api/v1/ai/noelia/*` → registered `foundation:*` HIVE tools (`foundation.registry.summary`, `foundation.compliance.posture`, `foundation.grants.pipeline`, `foundation.fund.position`) | read every Foundation table through the *Noelia tool scope* (tenant subtree + clearance), refusing only an unknown clearance — so an entity-scoped grant received tenant-wide Foundation aggregates that the UI refuses | resolve the canonical Foundation target first and read only that tenant; a principal the boundary cannot place reads nothing (`findings: []`), the same fail-closed idiom already used for an unknown clearance |
| `/api/v1/ai/noelia/*` drafts (`foundation.formation.draft`, structure simulation) | pure engines over caller-supplied intake; no authoritative row read | unchanged, and documented as reading no Foundation row |
| Foundation capital bridge (`finance-bridge.ts`) | FINANCE-owned `capital_requests` / `journal_entries` read inside the caller's tenant scope, without any Foundation target gate | canonical target gate runs first; the FINANCE-owned rows keep the resolved tenant scope so enterprise-owned capital requests are not re-homed; Foundation-owned `donations` / `grant_disbursements` linkage is pinned to the target tenant |

## 6. Per-endpoint control coverage

Verified for all 39 endpoints by the structural audit test and, on the HTTP boundary, by the
executed specs:

1. **Authenticated principal** — `guarded()` rejects an unauthenticated caller with 401 before any
   resolution (`tests/foundation/http.test.ts`, first spec).
2. **Permission** — declared per method (matrix column 4); absent capability → 403 with the RBAC
   reason (spec G).
3. **Active Foundation target** — resolved per request through
   `resolveOperatingSystemTenant(principal, "BEYU-FOUNDATION")`; an unresolvable target → 403
   (spec C).
4. **Target tenant** — the resolved tenant, never the caller's; reads are narrowed to it and
   writes are stamped with it (specs A, C, D).
5. **Classification ceiling** — `permissionClassificationFloor` per dataset plus row-level
   clearances; the Foundation floors are asserted directly for every `foundation:*` capability
   (`tests/foundation/target-scope.test.ts`, "classification ceiling for Foundation datasets").
6. **Entity scope** — an entity-scoped grant is refused at the API guard (`scopeShapeUnsupported`)
   and again by the boundary (`ENTITY_SCOPED`) for services and the AI surface.
7. **Country/jurisdiction scope** — unchanged: enforced by existing jurisdiction/ABAC controls and
   not bypassed by this change (no route gained scope).
8. **RLS** — unchanged and still the final boundary (`drizzle/0035_foundation_os.sql`,
   `beyu_tenant_ids()` per-table policies); the narrowed queries reduce, never widen, the row set
   RLS already admits.
9. **Audit** — a target-scope denial writes the same `DENIED` audit record as an RBAC denial,
   carrying `options.action` and the trace id; mutations continue to write audit + domain events
   inside the same transaction.

## 7. Test coverage (A–J)

| Case | Where | Assertion |
|------|-------|-----------|
| A. correct active target → allowed | `tests/foundation/http.test.ts`, `tests/foundation/target-scope.test.ts` | authorised read 200 and create 201; the stored `tenant_id` is the canonical Foundation tenant |
| B. wrong target tenant → denied | `http.test.ts` ("wrong Foundation target tenant is denied on every dataset") | 403 + `FORBIDDEN` + `/Foundation OS target scope/` on programs / compliance dashboard / impact, for a caller holding those capabilities |
| C. missing target tenant → denied | `target-scope.test.ts` | `UNRESOLVED` is returned and services throw `FoundationError("FORBIDDEN")`; no fallback tenant or empty-success |
| D. forged client target tenant → denied | `http.test.ts` ("a forged client target never changes the resolved scope") | query-string and body forgery do not move the resolved scope; the created row keeps the target tenant |
| E. wrong classification → denied | `target-scope.test.ts` (classification-ceiling describe) | a principal holding the grant but below the dataset floor is refused; an unknown clearance ("SECRET") is refused |
| F. insufficient clearance → denied | `target-scope.test.ts`, `http.test.ts` (safeguarding vs. governance/director) | `HIGHLY_RESTRICTED` safeguarding rows stay refused for `CONFIDENTIAL`/`RESTRICTED` seats; the boundary never widens the ceiling |
| G. unauthorised role → denied | `http.test.ts` | group CFO 403 on registry; sector operator 403 on a dataset it does not hold |
| H. cross-tenant access → denied | `target-scope.test.ts`, `http.test.ts` | a Foundation-shaped row in another tenant is 404 for the target principal, absent from listings, and 403 on the owner side |
| I. direct API request bypassing the UI → denied | `http.test.ts` ("raw API without a page") | a raw HTTP call with forged tenant input is refused and leaks no dataset name or count |
| J. authorised request → succeeds | `http.test.ts` | director 200/201; governance seat 200 — the boundary is a scope check, not a blanket denial |

Structural audit (`tests/security/foundation-api-target-scope.test.ts`): every Foundation route is
discovered from the repository and asserted to sit behind `guarded()` with a declared `foundation:*`
capability; the guard is asserted to contain the canonical target gate; no route may read a tenant
from the request; no Foundation domain module may scope rows by the tenant subtree or the caller's
tenant; the page guard and AI surface gates are pinned; the UI deep-link protection is asserted
still intact.

## 8. Regression evidence (this branch, real PostgreSQL 16 + production build)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` | pass (0 errors) |
| Lint | `npm run lint` | 0 errors, 1 pre-existing warning (`src/components/noelia-cross-os-visual.tsx:33`) |
| Build | `npm run build` | pass |
| Database | embedded PostgreSQL 16.14 on 127.0.0.1:5432, migrations 0000–0042, constrained `beyu_runtime` role, seed | pass |
| Runtime | `npx next start -H 0.0.0.0 -p 3100` → `GET /api/health` | `{"ok":true,...,"database":"UP"}` |
| Foundation + security suites | `BEYU_TEST_BASE_URL=http://127.0.0.1:3100 npx vitest run tests/foundation/http.test.ts tests/foundation/target-scope.test.ts tests/security/foundation-api-target-scope.test.ts` | 49/49 pass |
| Full suite | `BEYU_TEST_BASE_URL=http://127.0.0.1:3100 npm test` | 190 files passed / 3 skipped; 3689 tests passed / 11 skipped (CI skip tolerance: ≤ 15) |

Falsification: reverting `src/lib/foundation/noelia-service.ts` to its pre-fix form makes the
entity-scoped AI spec fail with the leaked aggregate (`Foundations in scope: 1`, `Status ACTIVE`),
confirming the spec detects the defect rather than restating the implementation.

## 9. Deliberate non-changes and residual observations

* **UI layer untouched.** `src/app/os/foundation/layout.tsx` and the Foundation pages keep their
  existing checks and strings; the remediation only adds enforcement.
* **HCM worker read in `/assignments`.** The canonical employee lookup stays inside the caller's
  canonical HCM tenant scope (the worker is an HCM row, not a Foundation row); the assignment itself
  is stamped with and read from the resolved Foundation target tenant. Only `FOUNDATION_DIRECTOR`
  holds `foundation:assignment.manage`, so this is not a behavioural change for any seeded seat.
* **FINANCE-owned rows** (`capital_requests`, `journal_entries`) intentionally keep the resolved
  tenant scope, after the Foundation target gate has passed — documented and pinned by test.
* **Discarded page renders.** Foundation pages that gate on `can()` directly (rather than
  `requireAccess`) can begin a data load while the layout is already returning the denial panel;
  the load now throws `FORBIDDEN` before reading a row, the response remains the governed denial
  (HTTP 200 + denial panel, asserted by "UI parity"), and no data is returned. This is fail-closed
  but noisy in server logs; it is pre-existing behaviour and was deliberately left out of scope to
  avoid redesigning the Foundation UI.
* **No production claims.** No deployment, post-merge CI, or production database verification was
  executed for this change.
