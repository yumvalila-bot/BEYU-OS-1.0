# BEYU OS — Holograph Spatial & Physical Display Integration Requirements

**Status: PLANNED / BLOCKED_BY_EXTERNAL_DEPENDENCY — no hardware exists in this
repository, no vendor is selected, no purchase is authorized, and no
compatibility is claimed.**
Date: 2026-11-08 · Seam: `src/lib/viz/spatial-display.ts` · Device registry:
`src/lib/viz/devices.ts` · XR contract: `src/lib/viz/xr.ts`

---

## 1. What exists today (honest inventory)

| Layer | Status | Where |
| --- | --- | --- |
| Phone/desktop screen 3D (WebGL1, dependency-free) | **IMPLEMENTED** | `src/lib/viz/webgl/` + `/os/viz` 3D view (capability-probed; SPATIAL_PROJECTION/HTML_TABLE fallback) |
| 2D projection + accessible table | **IMPLEMENTED** | `src/lib/viz/renderers.ts`, `/os/viz` |
| Spatial display adapter contract (init / consent / present / terminate / capability report / error / cleanup) | **IMPLEMENTED** | `src/lib/viz/spatial-display.ts` |
| Browser presentation adapter | **VERIFIED_IN_SOFTWARE** (automated tests) | `createBrowserSpatialDisplayAdapter` |
| AR glass / VR headset / spatial display / volumetric display / optical holographic projector adapters | **UNVERIFIED_NO_HARDWARE** — registered templates that always fail closed | `unverifiedHardwareDisplayAdapters()` |
| XR immersive sessions (WebXR) | **NOT_IMPLEMENTED** — contract + null adapter only | `src/lib/viz/xr.ts` |
| Vendor SDKs, display protocols, holographic content formats | **NOT_SELECTED / NOT BUNDLED** — no vendor evidence exists in this repository | — |
| Physical holographic hardware support | **NOT_IMPLEMENTED** — `FUTURE_HOLOGRAPHIC_DEVICE` registry rows can only ever be REGISTERED/NOT_IMPLEMENTED | `devices.ts` + SQL CHECK floor |

**A phone-based 3D visualization is NOT an optical hologram.** No software
alone turns a standard smartphone into a free-floating holographic projector;
any surface that suggests otherwise is prohibited by the Holograph canon
(`src/lib/viz/holograph.ts`).

## 2. Device categories are not interchangeable

Per the product architecture (Experiences A/B/C), future integrations must be
evaluated **per category** — a passing test on one says nothing about another:

1. **Standard browsers/phones** — implemented today (Experience A).
2. **AR glasses** — need a documented immersive-ar interface (e.g. WebXR on
   the specific device), camera/spatial-environment consent, and real-device
   testing before any GRANTED session can exist.
3. **VR headsets** — need an immersive-vr interface on the specific headset,
   comfort/safety review, and real-device testing.
4. **Spatial/light-field displays** — need the vendor's documented content
   interface; an ordinary browser scene is not automatically sendable.
5. **Volumetric displays** — need vendor protocol/SDK and volume-specific
   content preparation (depth-sliced or equivalent).
6. **Optical holographic projection systems** — need vendor holographic
   content formats, optical calibration and content authored for the specific
   optical path. Never claimable from a standard browser scene.

## 3. Requirements for any future hardware adapter (the gate)

An `UNVERIFIED_NO_HARDWARE` template may be replaced by a real adapter ONLY
when ALL of the following exist:

- [ ] A **documented technical interface** (vendor SDK docs or an open standard
      actually implemented by the target device) committed to the repo docs.
- [ ] A **compatible test device** physically available to the team.
- [ ] An adapter implementation satisfying the full contract in
      `src/lib/viz/spatial-display.ts` (identification, capability report,
      initialization, user consent, presentation of an already-governed
      `SceneManifest` only, session termination, error reporting, cleanup).
- [ ] **Consent flow** for exactly the flags the channel requires — nothing
      requested speculatively.
- [ ] A **credible test plan executed on the real device**, with results
      recorded (device model, firmware, environment). Until then the adapter's
      `verification` stays `UNVERIFIED_NO_HARDWARE` and every probe/present
      keeps failing closed.
- [ ] Normal human review (PR) — the seam, the renderers, the authorization
      pipeline and the registries do not change to accommodate hardware.
- [ ] Explicit human approval for any purchase, vendor commitment,
      credential or production change. **No purchase is authorized by this
      document.**

## 4. Architectural rules that hardware can never change

- The adapter receives an **already-governed manifest**; presentation widens
  nothing (no data access, no execution, no approvals).
- Authorization stays in `can()`/`guarded()`/RLS — no per-device identity or
  second policy engine.
- Sector truth stays in the Sector OSes; adapters re-check their boundary.
- Fail-closed: any missing dependency, consent, probe or initialization
  results in `UNAVAILABLE` + the deterministic 2D/table fallback — never a
  fabricated session, never a blank indefinite loader.
- Device registry honesty: no device may reach ACTIVE on a non-IMPLEMENTED
  renderer; `FUTURE_HOLOGRAPHIC_DEVICE` can never be ACTIVE.

## 5. Credible hardware test plan (to be executed when hardware exists)

| Step | Gate |
| --- | --- |
| 1. Vendor interface documentation review | interface documented in-repo; no undocumented endpoints |
| 2. Adapter implementation behind the existing contract | unit tests for fail-closed paths pass without hardware |
| 3. Bench setup on real device | device model/firmware recorded |
| 4. Consent + privacy review | only declared flags requested; denial path tested |
| 5. Rendered output verification vs the governed manifest | pixel/content comparison; no data beyond the manifest |
| 6. Degradation drills (disconnect, context loss, denied consent) | UNAVAILABLE + 2D/table fallback every time |
| 7. Audit/event verification | presentation sessions recorded through existing chains where applicable |
| 8. Honest status flip | only after 1–7: `UNVERIFIED_NO_HARDWARE` → verified claim in PR with evidence |

Steps 1–2 can proceed without hardware; steps 3–7 cannot. Until they are
complete, every hardware class remains **UNVERIFIED** and is documented as
such in the status matrices served by `/api/v1/viz/holograph`.
