# UJENZI OS — Frontend

**Status:** IMPLEMENTED and VERIFIED (production build green; live-server integration tests
green; control-plane IA tests green).

## 1. Position in the control plane

Ujenzi OS is the fifth Sector OS in the BEYU OS workspace, alongside Agriculture, Health,
Foundation and Family Office:

- The OS control-plane navigation includes `{ label: "Ujenzi OS", href: "/os/ujenzi" }`
  (asserted by `tests/frontend/control-plane-ia.test.ts`).
- The OS integration landing includes the Ujenzi card with `href="/os/ujenzi"`
  (asserted by `tests/frontend/integration.test.ts`).
- No new top-level chrome, no second navigation system, no fake nav entries.

## 2. Pages (14 routes + guarded layout)

| Route | Content |
|---|---|
| `/os/ujenzi` | Workspace root: executive dashboard from real tables (projects by status, financial position, HSE, procurement, handover pipeline) with explicit `financeBoundary` note |
| `/os/ujenzi/projects` | Projects list (real rows only) |
| `/os/ujenzi/projects/[id]` | Governed project workspace (detail + related records) |
| `/os/ujenzi/boq-cost` | BOQ & cost: BOQs with versions and items, cost records by kind |
| `/os/ujenzi/procurement` | Requisitions → purchase orders with committed amounts |
| `/os/ujenzi/materials` | Material catalog and movements (receipt/issue/return/wastage) |
| `/os/ujenzi/equipment` | Equipment register and allocations |
| `/os/ujenzi/site` | Site diaries (append-only daily log) |
| `/os/ujenzi/quality` | Inspection requests, NCRs, punch items |
| `/os/ujenzi/hse` | Incidents/near-misses, hazard register, toolbox talks |
| `/os/ujenzi/variations` | Variation requests and decisions |
| `/os/ujenzi/claims` | Claims register |
| `/os/ujenzi/payments` | Payment certificates (with the Finance OS boundary stated in-page) |
| `/os/ujenzi/handover` | Punch-gate status and handover records |

Shared section chrome lives in `src/app/os/ujenzi/sections.tsx`; the layout applies the same
deep-link guarded pattern as the other Sector OSs (server-side authorization on every render —
the frontend is never the authorization boundary).

## 3. UX principles applied

- **BEYU brand:** dark navy `#0B1F4D`, gold `#D4A017`, motto "Bridging Care. Building Trust.",
  consistent with the existing Sector OS pages.
- **Responsive and accessible** — same component patterns and semantic markup as the other
  sector workspaces.
- **Every state is real:** loading, empty, error, and unauthorized states render explicit UI;
  lists never fabricate rows.
- **No fabricated KPIs.** The dashboard aggregates only what exists in the Ujenzi tables;
  anything not computable renders an explicit "unavailable" state, and the payments surface
  states that canonical money truth lives in Finance OS.
- **No dead links, no frontend-only authz:** all data shown is fetched through governed
  server-side paths; buttons that require `ujenzi:data.manage` behave according to the
  server's decision, not client-side assumptions.

## 4. Verification

- `npm run build` — all 14 routes compile and are listed in the production build output.
- `tests/frontend/control-plane-ia.test.ts` — five Sector OSs including Ujenzi OS (green).
- `tests/frontend/integration.test.ts` — OS cards include Ujenzi (green, against the live
  production server).
- HTTP behavior that the pages depend on (401/403/404/422/201 semantics, RLS-bounded lists)
  is proven in `tests/ujenzi/http.test.ts` (green, live server).
