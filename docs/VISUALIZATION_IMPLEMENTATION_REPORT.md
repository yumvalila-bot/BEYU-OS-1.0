# BEYU OS — Universal Dimensional Graphics, Visualization, Simulation, Digital Twin & Future XR Foundation

## Implementation Evidence Report

Date: 2026-09-22 · Branch: `arena/01a0c61c-beyu-os-1-0` · Base: `main` @ `2384764`
Companion architecture document: [`docs/VISUALIZATION_FOUNDATION.md`](./VISUALIZATION_FOUNDATION.md)

This report records **what was actually built and what was actually verified**, with the
commands and numbers as executed. Nothing here is aspirational: unimplemented capability is
labelled `PLANNED` / `NOT_IMPLEMENTED` exactly as the code, the API and the UI label it.

---

## 1. Constitutional position (non-negotiables, honoured)

| Constraint | Status | Evidence |
|---|---|---|
| ONE shared capability — never a new OS | IMPLEMENTED | No `*_OS` entry added; the capability IA entry is `Dimensional Graphics & Twins` inside the **shared** group; `tests/frontend/control-plane-ia.test.ts` still asserts no shared label ends in `" OS"` and exactly five Sector OSs exist |
| Ujenzi OS remains a canonical Sector OS — never downgraded | IMPLEMENTED | `operating-system-catalog.ts` untouched for UJENZI (`level: "SECTOR_OS"`); `tests/viz/ujenzi-regression.test.ts` green; existing `tests/ujenzi/*` untouched and green |
| No BIM OS / Digital Twin OS / GIS OS / XR OS / Construction-Graphics OS created | IMPLEMENTED | `git status` shows no new OS surface; twins/XR live inside the shared `viz` capability |
| CAP_POSTING stays LOCKED; visualization never posts | IMPLEMENTED | `tests/viz/cap-posting.test.ts`: the only `@/lib/finance/*` import in the whole viz tree is the **read-only reporting engine**; no posting permission string appears anywhere in `src/lib/viz`, the viz API routes or the viz UI; posting-engine tests green |
| Foundation is the sister nonprofit, not a Sector LLC/OS | IMPLEMENTED | FOUNDATION is a viz *sector adapter* over Foundation OS data (scope-checked), never an OS entry |
| Fail-closed security; ids are references, never grants | IMPLEMENTED | Every route re-authorizes via `guarded()` → `src/lib/viz/authorization.ts` → adapter scope checks → PostgreSQL RLS; cross-tenant scene/twin reads return 404 (proved over HTTP below) |

## 2. What was built

**~8,600 new lines** (4,919 in `src/lib/viz`, 1,643 in `tests/viz`, plus migration, API routes, UI, docs).

### 2.1 Dimensional core (`src/lib/viz/`)

- `dimensions.ts` — the Universal Dimension Registry: canonical **1D–8D + XD** built in
  (code-registry based, no DB dependency for the canonical ladder); **9D+ are governed
  DB extensions** (`viz_dimension_extensions`, HIGH-RISK `viz:dimension.manage`, MFA
  step-up, extension-code grammar `^(9|[1-9][0-9]+)D(_[A-Z0-9]+)*$` enforced in 3 places).
- `scene-model.ts` — `SceneManifest` with layers, objects, epistemic statuses
  (`OBSERVED`/`DERIVED`/`FORECAST`/`UNAVAILABLE`), an **always-present accessible table**
  equivalent (§26), honest `withheldByClassification` counts (count disclosed, rows never),
  and a server-side object ceiling (progressive loading / low-bandwidth safety, §27–28).
- `digital-twin.ts` — twin abstraction: identity (`sector:subjectType:subjectId` key),
  facets, state, measurements, lifecycle, risk posture, provenance; absent facets are
  declared *not applicable*, never fabricated.
- `provenance.ts` — every manifest/twin/export carries `sourceAdapter`, `systemOfRecord`,
  `collectedAt`, `systemVersion`, worst-case `epistemicStatus`.
- `renderers.ts` — renderer abstraction + capability matrix (TABLE, CHART, MAP, SPATIAL,
  TIMELINE, METRIC_RAIL, RISK_OVERLAY, …) with explicit `fallback` and `requirements`;
  XR renderer kinds are registered as **PLANNED** capabilities, never as working ones.
- `engines/` — time (4D), quantity (5D), performance (6D), lifecycle (7D), risk (8D)
  projection engines over adapter datasets.
- `adapters/` — sector adapters: **AGRICULTURE, FINANCE, FOUNDATION, UJENZI =
  IMPLEMENTED; HEALTH, BEYU control-plane = PARTIALLY_IMPLEMENTED** (honest descriptors,
  exposed verbatim by the registry API). Unauthorized sectors answer with **honest-EMPTY
  datasets** (`status: NOT_AVAILABLE` + reason) — never a throw, never a leak.
- `authorization.ts` — scene/twin re-authorization (`reauthorizeDeepLink`): tenant,
  classification ceiling, sector RBAC and entity scope re-resolved **per request**.
- `exports.ts` — governed export artifacts (JSON/CSV server-side; SVG/PNG client-side from
  the identical manifest; **PDF/IFC = NOT_IMPLEMENTED, honestly refused**), sha256 of the
  exact bytes, ASCII-safe Content-Disposition (no header-injection surface).
- `xr.ts` — future-XR foundation: session-negotiation types and honest
  `NOT_IMPLEMENTED` capability declarations only.
- `events.ts` — VISUALIZATION interoperability domain with 5 emitted `VIZ_*` event types
  (every string verified against actual emit sites).
- `noelia-tools.ts` — governed Noelia/HIVE tools (`summarizeScene`, `explainDimensions`,
  registry-aware); `summarizeScene` explicitly calls `assertSectorAccess` so sector refusal
  is explicit, not silently empty.
- `accessibility.ts`, `errors.ts`, `service.ts`, `index.ts`.

### 2.2 Database — migration `0062_universal_dimensional_visualization.sql`

- 4 tables: `viz_dimension_extensions`, `viz_scenes`, `viz_digital_twins`, `viz_exports`
  (+ 9 indexes), all `IF NOT EXISTS`, additive-only.
- **ENABLE + FORCE ROW LEVEL SECURITY** on every table with a `beyu_tenant_ids()`
  isolation policy (`USING` + `WITH CHECK`); DML granted to the runtime role only.
- A verification `DO` block that **raises** unless each table has ENABLE+FORCE RLS and a
  `beyu_tenant_ids()` policy — the migration cannot half-apply silently.
- Applied on PostgreSQL 16; recorded fingerprint `b2f268bda065633eb37d408e2d383e48`;
  fully reconciled (SQL + journal + hand-synthesized snapshot) in
  `src/lib/migration/integrity.ts`; historical migrations untouched (byte-exact).
- Drizzle schema: `src/db/schema/visualization.ts`; ledger ordering preserved.

### 2.3 Governed API — `src/app/api/v1/viz/` (canonical `guarded()` boundary)

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /registry` | `viz:registry.read` | dimension ladder, extension counts, sectors, honest adapter descriptors |
| `POST /registry` | `viz:dimension.manage` | governed 9D+ extension registration (HIGH-RISK, MFA step-up) |
| `GET/POST /scenes` | `viz:scene.read` / `viz:scene.manage` | creation additionally requires the sector's OWN read boundary — you cannot pre-configure into data you cannot read |
| `GET /scenes/{id}` | `viz:scene.read` | scene manifest (deep links re-authorize) |
| `POST /scenes/{id}` | `viz:scene.manage` | archive (`INVALID_STATE` if already archived) |
| `GET/POST /twins`, `GET /twins/{id}` | `viz:scene.read` / `viz:scene.manage` | twin registration + live projection |
| `GET /manifest` | `viz:scene.read` | ad-hoc governed manifest (`sector`, `dimensions`, presentation hints resolved server-side) |
| `GET/POST /exports` | `viz:export` | **viewing is not exporting**; ledger + attachment + `X-BEYU-Export-Hash` |

Rate-limited, audited (`recordAudit`), tenant/entity-scoped; domain refusals map onto the
canonical error envelope (`_shared.ts`) so governed refusals are **never 500s**.

### 2.4 Shared frontend — `src/app/os/viz/`

- Server page re-checks authorization (`can(principal, …)`) and renders the governed
  `Denied` panel when not authorized; workspace exposes sector scenes, dimension controls,
  object inspector, provenance panel, accessible table, export actions (permission-aware).
- Capability IA entry `Dimensional Graphics & Twins` (shared group), new `dimensional`
  brand icon; existing design system/branding untouched (Navy/Gold preserved).
- Client components import **only pure viz modules** (no server service graph).

### 2.5 Permission & role map (`src/lib/constants.ts`)

5 permissions: `viz:registry.read`, `viz:scene.read`, `viz:scene.manage`, `viz:export`
(separate from viewing), `viz:dimension.manage` (HIGH-RISK list). Granted to
PLATFORM_ADMIN (all), GROUP_CEO/GROUP_CFO/CHIEF_RISK_COMPLIANCE/AUDITOR (read+export as
mapped), CHIEF_GOVERNANCE_OFFICER (read), HCM_DIRECTOR (read), SECTOR_OPERATOR
(read+manage+export within own sector/tenant), FOUNDATION_DIRECTOR/OFFICER (read).
FAMILY_MEMBER_VIEW intentionally holds **none** (proved 403 over HTTP).

## 3. Verification evidence (as executed)

Environment: PostgreSQL 16 (embedded harness `scripts/infra/pg16-server.mjs`), migrations
applied through 0062, seeded dev data, Node 22, Next.js 16.3.3.

### 3.1 Static gates

- `npx tsc --noEmit` → **0 errors**.
- `npx eslint` over all viz sources + tests → **0 problems**.
- `npm run build` → **success**; `/os/viz` and all `/api/v1/viz/*` routes compiled
  (dynamic, server-rendered). Generated `src/app/health/os/spa-content.ts` restored to
  HEAD afterwards per repo convention (build artifact, never committed).

### 3.2 Visualization test suite — `tests/viz/` (10 files, **95 tests, all green**)

| File | Proves |
|---|---|
| `dimensions.test.ts` | registry ladder 1D–8D+XD, extension grammar, governed 9D+ flow |
| `scene-model.test.ts` | manifest projection, epistemic statuses, accessible table (exact column contract), object ceiling |
| `authorization.test.ts` | RBAC per permission, sector-access re-authorization, classification ceilings (HCM RESTRICTED vs HIGHLY_RESTRICTED records), honest-empty sector answers |
| `cap-posting.test.ts` | CAP_POSTING lock: only `@/lib/finance/reporting` (read-only) is imported; no posting permission strings; posting engine untouched |
| `ujenzi-regression.test.ts` | Ujenzi OS unchanged as Sector OS; adapter reads never mutate; permissions intact |
| `leak-prevention.test.ts` | no hidden-layer/tooltip/metadata leaks; withheld counts without withheld rows; export bytes == governed manifest |
| `rls-isolation.test.ts` | **real pg16 runtime role**: with `beyu.current_tenant_ids` pinned, cross-tenant rows are invisible at the database even for a valid app-level query |
| `service.test.ts` | scene/twin/export lifecycle, audit + event emission, INVALID_STATE/CONFLICT paths |
| `noelia-tools.test.ts` | tool registry contract (schema validated before handler), explicit sector refusal |
| `http.test.ts` | **end-to-end transport** (below) |

### 3.3 HTTP end-to-end — against a live production server

`npx next start -p 3100` on the built artifact, then `npx vitest run tests/viz/http.test.ts`
→ **12/12 green**, proving by execution (not grep):

- unauthenticated registry/scene calls → **401**;
- FAMILY_MEMBER_VIEW → **403 FORBIDDEN** on registry; HCM reads registry but cannot
  manage scenes (403); governance can read scenes but **cannot export** (403 — viewing is
  not exporting);
- registry exposes the canonical ladder (1D–8D+XD, `canonicalCount: 9`), all 6 sectors and
  honest adapter statuses (HEALTH + BEYU `PARTIALLY_IMPLEMENTED`, rest `IMPLEMENTED`);
- invalid sector / invalid dimension → **422 VALIDATION_FAILED**, never 500;
- Ujenzi operator: governed UJENZI manifest with provenance + accessible table;
  FOUNDATION reads **honestly empty** (0 objects, adapter provenance, no error);
- scene lifecycle create → list → manifest → archive; **cross-tenant scene and twin reads
  → 404 NOT_FOUND** (ids are references, never grants);
- twin registration (`VZT_…`) + live projection (identity/state/provenance);
- export: 201 attachment, `Content-Disposition: attachment`, `X-BEYU-Export-Hash`
  (`sha256` hex of the exact bytes) and a **matching ledger row**;
- malformed body → 422; unknown id → 404; missing permission → 403 — **no 500s**;
- `/os/viz` SSR: authorized principal sees `Dimensional Graphics & Digital Twins`;
  unauthorized principal sees the governed **denial panel**, never a partial workspace.

(The suite self-skips when no server is running and hard-fails if `BEYU_TEST_BASE_URL` is
explicitly set but unreachable — the canonical harness contract.)

### 3.4 Full regression suite

- Migration 0062 changes three repo-wide pinned invariants; each pin was updated
  **following the existing repo convention** (attributed comment + bump), never weakened:
  - 5 specialist pinned inventory tests (`treasury`, `risk`, `forecast`, `compliance`,
    `audit-intel`): `beyu_migrations` count 62 → 63 with
    `// + 0062: shared Universal Dimensional Graphics capability tables (viz_*); …` —
    re-run: **all green** (341 + 115 tests across the touched files);
  - `tests/release/expand-contract.test.ts`: exact inventory 62 → 63, stale-baseline
    rejection list extended with 62 — **green**;
  - `.github/workflows/ci.yml`: migration-range step labels `0000-0061` → `0000-0062`
    (the count itself is computed at run time by the workflow, per
    `p1-migration-labels.test.ts`) — file re-run: **7/7 green**;
  - `tests/frontend/control-plane-ia.test.ts`: shared-capability label pin extended with
    `Dimensional Graphics & Twins` (still asserts *no shared label is an OS*) — **green**.
- First post-integration full run: **4,380 passed / 247 skipped, 1 failed** — the single
  failure was the CI label pin above (fixed and verified in isolation).
- Definitive full run (after all fixes, server stopped so HTTP suites self-skip):
  **`npx vitest run` → 250 files passed | 31 skipped (281); 4,381 tests passed |
  259 skipped (4,640); 0 failed** (duration 651s). Baseline before this work: 241 files /
  4,298 passed — the delta is exactly the new viz suite (+10 files; +95 tests, of which
  the 12 HTTP tests are skip-guarded without a live server and were proven green against
  one in §3.3).

### 3.5 Not verified / out of scope (honest disclosure)

- **NOT VERIFIED**: XR runtime behaviour on real devices (WebGPU/AR/VR headsets) — the XR
  surface is a declared `NOT_IMPLEMENTED`/`PLANNED` foundation (types + honest capability
  negotiation), by design.
- **NOT VERIFIED**: PDF/IFC server-side export (declared `NOT_IMPLEMENTED`, honestly
  refused at the API), real BIM/IFC streaming, GPU/LOD performance under production load,
  multi-node behaviour. The single-node dev/CI environment cannot evidence these; they are
  labelled accordingly in code, docs and UI.
- Simulation beyond the 4D–8D projection engines (what-if modelling) is `PLANNED`.

## 4. Changed-file inventory (git)

Modified (12): `CHANGELOG.md`, `drizzle/meta/_journal.json`, `.github/workflows/ci.yml`,
`src/app/os/capabilities.ts`, `src/components/icons.tsx`, `src/db/schema.ts`,
`src/lib/api.ts` (domain wiring), `src/lib/constants.ts`, `src/lib/ids.ts`,
`src/lib/interoperability/domains.ts`, `src/lib/noelia/default-tools.ts`,
plus the 8 pinned-count test files listed in §3.4.

New: `drizzle/0062_universal_dimensional_visualization.sql`, `drizzle/meta/0062_snapshot.json`,
`src/db/schema/visualization.ts`, `src/lib/viz/` (16 modules + adapters + engines),
`src/app/api/v1/viz/` (8 route modules + `_shared.ts`), `src/app/os/viz/` (page + workspace),
`tests/viz/` (10 suites), `docs/VISUALIZATION_FOUNDATION.md`, this report.

No secrets in code/tests/commits; no force-push; no historical migration touched; ledger
ordering preserved.
