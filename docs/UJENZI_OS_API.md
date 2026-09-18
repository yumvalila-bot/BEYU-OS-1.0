# UJENZI OS — API Reference

**Base path:** `/api/v1/ujenzi` · **32 endpoints** · All endpoints go through the canonical
`guarded()` wrapper (session authentication, permission check, rate limiting, audit trail).
There are no unauthenticated routes and no privileged bypass routes.

**Permissions**

| Permission | Grants | Used by |
|---|---|---|
| `ujenzi:data.read` | Read all Ujenzi operational records | Every `GET` |
| `ujenzi:data.manage` | Create/amend Ujenzi operational records | Every `POST` |

**Status codes**

| Code | Meaning |
|---|---|
| 200 | Success (reads; state-transition posts) |
| 201 | Created (register posts) |
| 401 | No session |
| 403 | Permission denied, wrong OS scope (e.g. agriculture operator writing), entity/country mismatch, or finance-boundary violation (`FINANCE_BOUNDARY`) |
| 404 | Resource does not exist (also returned for cross-entity references that must not be enumerable) |
| 409 | Domain rule violation (invalid lifecycle transition, e.g. closing an already-closed NCR, approving a superseded BOQ) |
| 422 | Body failed Zod validation (missing/invalid fields) |

## Endpoints

### Workspace
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ujenzi/dashboard` | Executive aggregation over real tables only; `financeBoundary` object states that money truth lives in Finance OS |

### Projects & delivery structure
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/ujenzi/projects` | POST requires `legalEntityId`, `code`, `name`, `countryCode`; returns 201 with `PLANNED` default status |
| GET / POST | `/api/v1/ujenzi/sites` | Project sites (project, name, location) |
| GET / POST | `/api/v1/ujenzi/phases` | Project phases (project, name, window, status) |
| GET / POST | `/api/v1/ujenzi/milestones` | Milestones (project, name, due date, status) |
| POST | `/api/v1/ujenzi/projects/[id]/handover` | Punch-gated: 409 `PUNCH_ITEMS_OPEN` while any punch item is OPEN; success sets `HANDED_OVER` and emits `PROJECT_HANDED_OVER` |

### Commercial (BOQ, cost, variations, claims, payments)
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/ujenzi/boqs` | BOQ header per project (version, status `DRAFT→SUBMITTED→APPROVED→SUPERSEDED`) |
| POST | `/api/v1/ujenzi/boqs/[id]/items` | Append BOQ line items (code, unit, qty, rate, cost code) |
| POST | `/api/v1/ujenzi/boqs/[id]/approve` | Approves and supersedes the prior approved version; 409 on invalid state |
| GET / POST | `/api/v1/ujenzi/cost-records` | `kind ∈ BUDGET\|FORECAST\|COMMITMENT\|ACTUAL`; informational only — never a journal |
| GET / POST | `/api/v1/ujenzi/variations` | Variation request (cost/schedule impact, status `SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED`) |
| POST | `/api/v1/ujenzi/variations/[id]/decision` | APPROVE/REJECT decision; audited; no automatic financial mutation |
| GET / POST | `/api/v1/ujenzi/claims` | Claims (notice, amount, status lifecycle, evidence ref) |
| GET / POST | `/api/v1/ujenzi/payment-certificates` | Valuation certificates (gross, retention, net; `DRAFT→CERTIFIED`); certification outcome `CERTIFIED_PENDING_FINANCE_INTEGRATION` — **never posts to Finance OS** |

### Procurement & materials
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/ujenzi/requisitions` | Purchase requisitions (`SUBMITTED→APPROVED→ISSUED`) |
| POST | `/api/v1/ujenzi/requisitions/[id]/approve` | Audited approval transition |
| GET / POST | `/api/v1/ujenzi/purchase-orders` | POs against requisitions; committed amounts tracked |
| POST | `/api/v1/ujenzi/purchase-orders/[id]/approve` | Audited approval; emits `PURCHASE_ORDER_APPROVED` |
| GET / POST | `/api/v1/ujenzi/materials` | Material catalog (project-scoped master items) |
| GET / POST | `/api/v1/ujenzi/material-movements` | `RECEIPT\|ISSUE\|RETURN\|WASTAGE` with project/site attribution; emits `MATERIAL_RECEIVED` |

### Equipment & site operations
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/ujenzi/equipment` | Equipment register |
| GET / POST | `/api/v1/ujenzi/equipment/allocations` | Equipment→project/site allocations |
| GET / POST | `/api/v1/ujenzi/site-diaries` | Append-only daily site diary (date, weather, labour, work done) |

### Quality & HSE
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/ujenzi/inspection-requests` | Inspection requests |
| POST | `/api/v1/ujenzi/inspection-requests/[id]/result` | Record inspection outcome |
| GET / POST | `/api/v1/ujenzi/ncrs` | Non-conformance reports; emits `NCR_CREATED` |
| POST | `/api/v1/ujenzi/ncrs/[id]/close` | Close with corrective action; 409 if already closed |
| GET / POST | `/api/v1/ujenzi/punch-items` | Punch list items (`OPEN→CLOSED`) |
| POST | `/api/v1/ujenzi/punch-items/[id]/close` | Close a punch item (feeds the handover gate) |
| GET / POST | `/api/v1/ujenzi/hse-incidents` | `INCIDENT\|NEAR_MISS` + severity; emits `HSE_INCIDENT_RECORDED` |
| GET / POST | `/api/v1/ujenzi/hazards` | Hazard register |
| GET / POST | `/api/v1/ujenzi/toolbox-talks` | Toolbox talk records (workers reference canonical users) |

## Response envelope & errors

Success: the resource object (201 for creates) or `{ items: [...] }` for lists.
Errors: canonical `{ error: { code, message, status, traceId, details? } }` via `apiError`.
Domain error mapping (`src/lib/ujenzi/http.ts`): `NOT_FOUND→404`,
`FINANCE_BOUNDARY|SCOPE→403`, everything else→409. Zod failures surface as 422 through
`guarded()`.

## Verification

`tests/ujenzi/http.test.ts` (11 tests) runs against a live production server
(`next start`) and proves: 401 unauthenticated GET/POST; 403 for HCM (no Ujenzi grant);
agriculture operator GET→**200 with zero construction rows** (RLS-bounded read, not a 403 —
cross-sector operators legitimately see an empty list); agriculture operator POST→403/404;
GROUP_CEO POST→403 (read-only oversight); missing fields→422; sector operator create→201
`PLANNED`; project list contains the created row; dashboard `financeBoundary` shape.
