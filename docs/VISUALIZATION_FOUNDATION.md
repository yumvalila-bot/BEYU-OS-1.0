# BEYU OS — Universal Dimensional Graphics, Visualization, Simulation, Digital Twin & Future XR Foundation

**Status: IMPLEMENTED as ONE shared BEYU capability (with honestly declared PLANNED / NOT_IMPLEMENTED edges).**
Date: 2026-09-22 · Migration: `0062_universal_dimensional_visualization.sql` · Module root: `src/lib/viz/` · UI: `/os/viz` · API: `/api/v1/viz/*`

---

## 1. Constitutional position

This is **one shared capability inside BEYU OS — not an operating system, not a sector, and not a
Ujenzi subsystem**. The canonical consumers are:

| Consumer | Relationship to this capability |
| --- | --- |
| **UJENZI OS** | Full Sector OS (non-negotiable). Consumes the foundation through the Ujenzi adapter. Construction truth stays in `ujenzi_*` tables. No BIM OS, Engineering OS, GIS OS, Digital-Twin OS or XR OS was created — the OS registry test forbids them. |
| **Health OS** | Federated sector. Visualization reaches Health **only** through the existing federation identity bridge (`checkHealthOSAuthorization`) and the OS-registry lifecycle. **No PHI is reachable** through this layer; clinical/facility/epidemiology datasets are PLANNED behind a governed non-PHI data contract that does not exist yet. |
| **Finance OS** | **READ-GOVERNED.** The only money surface is the existing `trialBalance()` reporting engine. Visualization never posts, never alters balances, never bypasses Finance authorization. **CAP_POSTING remains LOCKED** — proven by a static import-graph test and a live journal-count test. |
| **Agriculture OS** | Full adapter over the existing agriculture service tables (farms/fields, crop cycles, harvests, weather/env metrics with preserved `epistemicStatus`, equipment/service, hazard register with deterministic likelihood×impact severity). |
| **BEYU Foundation** | Sister nonprofit (not a Sector LLC/OS). Scoped through `foundationScopeIds`; grants/funds inherit the parent foundation's classification fail-closed. No safeguarding/beneficiary data is visualized. |
| **BEYU control plane** | Honest empty dataset today (`PARTIALLY_IMPLEMENTED` descriptor) — the control-plane scene exists as governed plumbing, not as fabricated dashboards. |

Nothing here duplicates existing functionality: authorization reuses `can()`/`guarded()`, audits and
events reuse `withAuditTransaction` + `enterprise_events`, tenancy reuses `beyu_tenant_ids()` RLS,
epistemics reuse the canonical Noelia status vocabulary.

## 2. The dimensional model (1D → 8D, 9D+, XD)

Single source of truth: `src/lib/viz/dimensions.ts` (code registry) + `viz_dimension_extensions`
(governed tenant extensions).

| Dimension | Meaning | Machinery status |
| --- | --- | --- |
| 1D | Information / document dimension | IMPLEMENTED |
| 2D | Flat graphics (plans, maps, diagrams, charts) | IMPLEMENTED |
| 3D | Spatial/geometry foundation (points, polygons, CRS-tagged) | IMPLEMENTED as governed 2D/3D **foundation** — WebGL/WebGPU renderers are PLANNED (contract + honest fallbacks exist; no 3D runtime dependency is bundled) |
| 4D | Time (occurred / planned / forecast anchors) | IMPLEMENTED (`engines/time.ts`) |
| 5D | Quantity / cost / resource — **read-governed** | IMPLEMENTED (`engines/quantity.ts`); never posts; UNAVAILABLE is never rendered as 0 |
| 6D | Environment / performance / sustainability | IMPLEMENTED (`engines/performance.ts`); preserves sector `epistemicStatus` |
| 7D | Lifecycle / operations / maintenance | IMPLEMENTED (`engines/lifecycle.ts`); unmapped sector statuses map to NO stage (fail-closed) |
| 8D | Safety / risk / compliance | IMPLEMENTED (`engines/risk.ts`); unknown severity vocabularies map to null, never guessed |
| 9D+ | Governed tenant extensions (e.g. `9D`, `10D_SIMULATION`, `12D_ORG_ECOSYSTEM`) | IMPLEMENTED mechanism — registration is HIGH-RISK (`viz:dimension.manage`, MFA step-up), audited (`VIZ_DIMENSION_REGISTERED`), and can never shadow a canonical dimension or carry posting authority |
| XD | Extensibility seam — new dimensions never redesign the database | IMPLEMENTED |

Unknown dimension codes are **rejected, never assumed**. Combinations (`2D+3D`, `3D+4D+5D`, `9D+`, …)
normalize deterministically (de-duplicated, ordinal-ordered).

## 3. Security model (fail-closed, three stages + the database)

1. **Capability RBAC/ABAC** — `viz:registry.read`, `viz:scene.read`, `viz:scene.manage`,
   `viz:export`, `viz:dimension.manage` through the canonical `can()` and `guarded()` boundary
   (classification ceilings, HIGH-RISK MFA step-up, rate limits, audit). Entity-scoped principals are
   **refused** for `viz:*` (same fail-closed rule as agriculture/ujenzi/foundation — the capability
   aggregates rows without complete legal-entity keys).
2. **Sector conjunction** — holding a viz permission is **never** sector access. Every scene, twin,
   manifest and export re-checks the sector's OWN boundary (`ujenzi:data.read` + BEYU-UJENZI scope;
   `agriculture:data.read` + BEYU-AGRI scope; a Finance OS read path; the Health federation link;
   Foundation scope) exactly as the OS launcher does.
3. **Deep-link re-authorization** — scene/twin ids, URLs and stored configs are REFERENCES. Every
   access reloads tenant-scoped, re-checks classification + sector, and rebuilds data LIVE through
   the adapter. Out-of-scope references resolve **NOT_FOUND** (existence is itself protected).
4. **PostgreSQL RLS** — all four `viz_*` tables: `ENABLE` + `FORCE ROW LEVEL SECURITY` with
   `tenant_id = ANY (beyu_tenant_ids())` USING+WITH CHECK policies; `beyu_runtime` is
   NOSUPERUSER NOBYPASSRLS with DML-only grants; migration 0062 verification blocks abort the
   migration if any table lacks its policy or CHECK floor.

**Leak prevention** is structural: the manifest projection is an exact allowlist
(`id,label,layerId,accessibleText,geometry,values{value,status,unit},timeAnchor,status`); classification,
source refs, tenant ids and user ids never cross the projection; withheld-by-classification **counts**
are disclosed but rows are not; exports are the SAME governed projection as the screen (one allowlist —
an export can never be wider), every export is ledgered with a sha256 content hash
(`viz_exports`), and export requires `viz:export` *in addition* to viewing.

## 4. Data & persistence (what is stored — and what never is)

| Table | Stores | Never stores |
| --- | --- | --- |
| `viz_dimension_extensions` | Governed 9D+ registrations (code CHECK `^(9\|[1-9][0-9]+)D(_[A-Z0-9]+)*$`, lifecycle state CHECK, provenance) | Canonical dimensions (code-only) |
| `viz_scenes` | Scene CONFIGURATIONS (sector, dimensions, layers, subject reference) | Sector data copies — manifests are always rebuilt live |
| `viz_digital_twins` | Twin IDENTITY bindings (`sector:subjectType:subjectId`) | Twin state — projected live per request; twins cannot go stale into a leak |
| `viz_exports` | Export ledger evidence (format, sha256, byte size, row count, requester) | Export payloads |

No journal, ledger, treasury or posting column exists anywhere in this schema. Finance OS remains the
only journal writer.

## 5. Events & audit (the EXISTING chains)

Every viz act runs through `withAuditTransaction` — domain row + audit ledger row + hashed enterprise
event commit atomically. Closed vocabulary (grep-verified, the only VIZ_* types emitted):
`VIZ_DIMENSION_REGISTERED`, `VIZ_SCENE_CREATED`, `VIZ_SCENE_ARCHIVED`, `VIZ_TWIN_REGISTERED`,
`VIZ_EXPORT_CREATED` — published under interop domain `VISUALIZATION` (`DOM-VISUALIZATION`, status
PARTIAL) with the common envelope. `REFRESH_TRIGGERS` maps **verified, actually-emitted** sector event
types to a staleness hint only; a missed or spoofed hint can never widen access.

## 6. Noelia / HIVE tools

Two governed tools extend the canonical Noelia identity (never a second AI system), both
`sideEffects: NONE`, registered in the default registry:

- `viz.dimensions.explain` (`viz:registry.read`) — explains the resolved registry and the honest
  per-sector adapter supply matrix.
- `viz.scene.summarize` (`viz:scene.read`) — summarizes an authorized scene through the SAME adapter
  path as the UI. Output is shape/status metadata only (counts, epistemic mix, declared limitations) —
  never row-level sector values. An unauthorized sector produces an explicit **refusal**, never an
  empty "OK"-looking summary.

Scene creation, twin registration, export and every mutation have **no tool path** — they remain
human-governed.

## 7. Frontend (`/os/viz`)

One shared workspace page for all consumers: sector selector, dimension activation, live manifest
(SVG 2D projection when — and only when — governed geometry exists), the **always-present accessible
table equivalent**, object inspector with per-value epistemic badges, saved scenes + deep links, twin
registration + live projection view, governed export buttons + ledger, the full registry/adapter/
renderer matrices and the honest subsystem status table. Brand-consistent (Navy `#0B1F4D`, Gold
`#D4A017`), keyboard-operable through native controls, `prefers-reduced-motion` honored, low-bandwidth
mode lowers the server-side object ceiling (never security).

## 8. Honest status matrix

Canonical machine-readable copy: `VIZ_SUBSYSTEM_STATUS` in `src/lib/viz/service.ts` (rendered in the
UI "Capability status" tab and asserted by tests).

| Subsystem | Status |
| --- | --- |
| Graphics core, Dimension Registry, Visualization Registry, Scene Model, Adapter Layer, Renderer abstraction (SVG/table/projection), Interaction, 4D–8D engines, Digital Twin layer, Provenance, Accessibility, RBAC/policy enforcement, Audit/event integration | **IMPLEMENTED** |
| Export layer | **PARTIALLY_IMPLEMENTED** — JSON/CSV server-side (ledgered); SVG/PNG client-side from the identical manifest; **PDF/IFC NOT_IMPLEMENTED** |
| XR adapter foundation | **PARTIALLY_IMPLEMENTED** — governed contract + fail-closed null adapter ship today; **no XR runtime is bundled (NOT_IMPLEMENTED)** |
| WebGL/WebGPU 3D rendering | **PLANNED** — declared in the renderer abstraction with deterministic fallbacks; no dependency bundled |
| BIM/IFC geometry parsing (Ujenzi) | **NOT_IMPLEMENTED** — declared in the adapter descriptor, not faked |
| Health clinical/facility/epidemiology datasets | **PLANNED** — behind a governed non-PHI Health federation data contract that does not exist yet |
| BEYU control-plane adapter | **PARTIALLY_IMPLEMENTED** — honest empty dataset |

## 9. Verification

- `tests/viz/` — 9 suites / 83 tests: dimension registry purity, scene-model allowlist + ceilings,
  RBAC + sector conjunction + deep-link re-authorization + entity-scope fail-closed, service lifecycle
  (audit + events atomic), **leak prevention** over a real Ujenzi fixture (forbidden-key deep scan,
  CSV/JSON export equality with the screen), **CAP_POSTING lock** (static import graph + live
  journal-count invariance), **Ujenzi OS regression** (SECTOR_OS destination intact, DOM-UJENZI
  intact, adapter strictly read-only, no BIM/TWIN/XR "OS" in the registry), runtime-role **RLS
  adversarial isolation** (NOSUPERUSER NOBYPASSRLS: cross-tenant SELECT/INSERT/UPDATE/DELETE all
  refused; CHECK floors hold), Noelia tool contracts.
- Migration 0062 self-verifies (RLS enabled+forced, `beyu_tenant_ids()` policies, all 8 CHECK
  constraints) and aborts on failure.
- Typecheck (`tsc --noEmit`) and lint (`eslint --max-warnings=0`) clean for every touched path.

See `docs/VISUALIZATION_IMPLEMENTATION_REPORT.md` for the executed evidence log.
