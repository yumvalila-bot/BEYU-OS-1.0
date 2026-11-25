# NOELIA — Command Centre

**Status:** IMPLEMENTED
**Route:** `/os/noelia/command-centre`
**Files:** `src/app/os/noelia/command-centre/page.tsx` (server, 12 modules), `command-centre/command-console.tsx` (client, Queen Bee console)
**Navigation:** `src/app/os/capabilities.ts` → "NOELIA Command Centre"

---

## 1. What it is

A single governed surface where the Queen Bee, the eight brains, institutional memory, the
Council, the digital twin and the governance boundary are visible together — and where every
control performs a real action against a real endpoint.

**No decorative UI.** If a control exists, it calls a route. If a mode is not permitted, it is
disabled *with the reason stated on screen*.

---

## 2. Modules

| # | Module | Source of truth | Empty/degraded behaviour |
|---|---|---|---|
| 1 | Queen Bee Command | `command-console.tsx` → 5 cognitive routes | Disabled modes show authorization reason |
| 2 | Hive Workforce | `HIVE_WORKFORCE_PROFILES` + `resolveWorkforceReach` | Per-specialist `reach/declared`, `NO POSTING` badge |
| 3 | Cognitive Brain Centre | `NOELIA_BRAINS` + `effectiveBrainReach` | Per-brain authorized count, DEGRADED when < declared |
| 4 | Institutional Brain | `noelia_decision_records` | Explicit "no decisions recorded in your scope" |
| 5 | Intelligence Council | `noelia_council_sessions` / `_findings` | Empty state; dissent rendered when present |
| 6 | Digital Twin | `noelia_digital_twins` | Empty state; `asOf` and basis shown |
| 7 | Model Centre | `model_registry` | Shows the registered model and its status; the caption states registry state ≠ runtime state |
| 8 | Governance Centre | links + control counts | Denials surfaced as prominently as allows |
| 9 | Research Centre | `knowledge_sources` in scope | Empty state; no fabricated citations |
| 10 | Predictive Intelligence | `noelia_simulations` + `noelia_risk_register` | `SIMULATION` framing; risk posture from the register |
| 11 | Performance Centre | `noelia_evaluations` | Empty state; no invented scores |
| 12 | Workflow Command | `workflow_instances` | Real state/step; links to `/os/workflow`; no fake run state |

---

## 3. The Queen Bee console (real controls)

Four modes, each mapped to exactly one implemented route:

| Mode | Route | Permission |
|---|---|---|
| World Model | `POST /api/v1/ai/noelia/cognitive/world-model` | `ai:noelia.query` |
| Knowledge Graph | `POST .../knowledge-graph` | `ai:noelia.query` |
| Decision Memory | `POST .../decision-memory` | `ai:noelia.query` |
| Simulation | `POST .../simulation` | `ai:analytics.read` |
| Council | `POST .../council` | `ai:executive.read` |

If the caller lacks the permission, the mode is **disabled and labelled** with the missing
permission code — the button does not fire and fail silently.

Every response renders:
- the epistemic label of each claim,
- the confidence and its basis,
- `whatIsMissing` when evidence is incomplete,
- a `SIMULATION` visual frame for simulation results,
- `humanReviewRequired` where applicable.

---

## 4. Responsiveness

Implemented with a mobile-first Tailwind grid:

- `grid-cols-1` base, `md:grid-cols-2`, `lg:grid-cols-4` for metric strips
- `min-w-0` + `truncate` on every variable-length label
- `flex-wrap` on all badge rows
- `overflow-hidden` on panels, never on the page body (no `overflow-x-hidden` hack)
- tables are replaced by stacked cards below `md`

Verified structurally in the rendered HTML (a full browser run was not possible in this sandbox —
Playwright Chromium is unavailable and cannot be downloaded on the permitted network): no
`overflow-x-hidden` concealment hack, responsive grid classes present (`grid-cols-1`,
`md:grid-cols-2`, `lg:grid-cols-4`, `xl:grid-cols-3`), `min-w-0` + `truncate` on variable-width
labels, `flex-wrap` on badge rows, no fixed pixel widths, and the `.beyu-scroll` container on
`<main>` is the only scroll owner, so the page cannot widen beyond the viewport.

**Honest limitation:** this is a structural audit, not a pixel rendering at each breakpoint.

---

## 5. Accessibility

- `<main id="beyu-main">` with a skip link (inherited from the OS layout).
- The console uses `role="tablist"` / `role="tab"` / `aria-selected` and the panel is labelled.
- Status is conveyed by **text**, not colour alone (`DEGRADED`, `SIMULATION`, `UNAVAILABLE`).
- Focus styles come from the shared design system; no `outline: none`.
- Disabled controls carry `aria-disabled` and a visible reason.

---

## 6. No fabricated metrics

The page computes every number from a real query:

| Displayed | Derived from |
|---|---|
| "N/8 active brains" | Count of brains whose authorized reach is non-empty |
| "X/Y capabilities" per brain | `effectiveBrainReach(brain, context)` |
| Entity list | `legal_entities` in authorized scope |
| Decision counts | `noelia_decision_records` where `status = EFFECTIVE` |
| Council/simulation history | respective tables |
| Workflow state | workflow tables |

There is **no** placeholder number, no sample data and no `€0.00`:

> "Financial values, asset valuations and performance indicators are Finance OS records and
> are never estimated here." — rendered footer on the page.

---

## 7. Evidence

- Server render with a real session: `200`, 197,866 bytes, **all 12 modules present**, all eight
  brain titles, and real authorized counts read at request time — observed Executive `10/15` →
  `DEGRADED`, Institutional `6/6` → `ACTIVE`, 12 workforce specialists each showing
  `reach/declared` with a `NO POSTING` badge, and the real model registry row
  `MOD_NOELIA_DET`.
- `tests/noelia/cognitive-http.test.ts` (11 tests) asserts:
  - all twelve module kickers are present,
  - the workforce roster renders `NO POSTING` and **never** the string `MAY POST`,
  - all eight brain titles are present,
  - no `lorem ipsum` and no `€ 0.00` placeholder value.
