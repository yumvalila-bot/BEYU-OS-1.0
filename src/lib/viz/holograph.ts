/**
 * BEYU OS — HOLOGRAPH CANON (shared capability).
 *
 * "BEYU OS Holograph is the governed spatial visualization and interaction
 * capability of BEYU OS, providing a hardware-independent interface for
 * representing BEYU entities, assets, digital twins, workflows, intelligence
 * and events in three-dimensional and spatial environments while remaining
 * subject to BEYU OS identity, authorization, policy, tenant isolation, RLS,
 * audit, governance and human-approval controls."
 *
 * IDENTITY
 * ────────
 * Holograph is the canonical NAME of the BEYU OS spatial visualization and
 * interaction capability. Its code namespace is the existing, RLS-bound
 * `viz` namespace (`src/lib/viz`, `viz_*` tables, `viz:*` permissions,
 * `/api/v1/viz`, `/os/viz`); renaming those namespaces would rewrite tested
 * security boundaries without adding security, so the canon is codified here
 * and the namespaces are preserved (Phase 2 of the Holograph mission:
 * extend the existing capability, never create a parallel one).
 *
 * WHAT HOLOGRAPH IS
 * ─────────────────
 *   • spatial visualization and spatial navigation;
 *   • governed spatial interaction (the interaction ledger, ./interactions.ts);
 *   • digital-twin presentation (./digital-twin.ts — live projection only);
 *   • 3D/spatial asset presentation (./assets.ts — governed registry);
 *   • hardware-independent device abstraction (./devices.ts, ./xr.ts);
 *   • renderer-agnostic rendering (./renderers.ts, ./render-profiles.ts);
 *   • the Family Office spatial view (./family-office-view.ts);
 *   • an accessible 2D/structured-data fallback in every scene.
 *
 * WHAT HOLOGRAPH IS NOT (constitutional negatives)
 * ────────────────────────────────────────────────
 *   • NOT an operating system (not in the OS catalogue, never will be);
 *   • NOT an authorization system (can() is the only authorization model);
 *   • NOT a database authority (sector truth never moves here);
 *   • NOT a transaction engine (no journal, treasury, posting column or code
 *     path exists in this capability; CAP_POSTING stays LOCKED);
 *   • NOT a replacement for Governance, Finance, Health, Ujenzi, Foundation
 *     or Agriculture (each keeps its own boundary and adapters re-check it);
 *   • NOT a replacement for Noelia (Noelia is the governed AI identity;
 *     Holograph is one possible spatial manifestation of it, never an
 *     independent AI authority);
 *   • NOT an independent approval authority (human approval boundaries are
 *     preserved; spatial gestures delegate to governed workflows).
 *
 * THE ORDER THAT HOLDS (never reversed)
 * ────────────────────────────────────
 *   AUTHENTICATION → AUTHORIZATION → TENANT/ENTITY/COUNTRY SCOPE →
 *   CLASSIFICATION → POLICY → RLS → PERMITTED DATASET → SCENE → RENDERER
 *
 * Never: DATABASE → FULL DATASET → CLIENT FILTERING.
 * The renderer, the device and the URL are presentation, never authority.
 */

export const HOLOGRAPH_CAPABILITY_NAME = "Holograph" as const;

export const HOLOGRAPH_CANONICAL_DEFINITION =
  "BEYU OS Holograph is the governed spatial visualization and interaction capability of BEYU OS, providing a hardware-independent interface for representing BEYU entities, assets, digital twins, workflows, intelligence, and events in three-dimensional and spatial environments while remaining subject to BEYU OS identity, authorization, policy, tenant isolation, RLS, audit, governance, and human-approval controls.";

export const HOLOGRAPH_IS_NOT = [
  "an operating system (not registered in the BEYU OS catalogue; it is a shared capability)",
  "an authorization system (the canonical can() RBAC/ABAC kernel is the only authorization model)",
  "a database authority (sector truth remains in each Sector OS; adapters re-check the sector boundary on every request)",
  "a transaction engine (no journal, treasury, ledger or posting state exists in this capability; CAP_POSTING remains LOCKED)",
  "a replacement for Governance, Finance OS, Health OS, Ujenzi OS, Foundation OS or Agriculture OS",
  "a replacement for Noelia (Noelia is the governed AI identity; Holograph is one possible spatial manifestation, never an independent AI authority)",
  "an independent approval authority (spatial interactions delegate to existing governed workflows; human approval is preserved)",
  "a lending platform, an insurance underwriter or a legal decision-maker",
] as const;

export const HOLOGRAPH_IS = [
  "spatial visualization and spatial navigation",
  "governed spatial interaction (request ledger with audited denials)",
  "digital-twin presentation (live projection — never cached sector truth)",
  "3D/spatial asset presentation (governed asset registry with provenance and integrity)",
  "hardware-independent device abstraction (WEB/DESKTOP/MOBILE/AR/VR/SPATIAL_DISPLAY/VOLUMETRIC_DISPLAY/FUTURE_HOLOGRAPHIC_DEVICE)",
  "renderer-agnostic rendering (capability matrix + governed render profiles)",
  "the governed Family Office spatial view (structure, ownership, trust — visibility only)",
  "an accessible 2D/structured-data fallback in every scene",
] as const;

/** The canonical authorization order. Documented, greppable, asserted in
 * tests (holograph-canon.test.ts). It is NEVER reversed: no code path in this
 * capability reads a full dataset and filters client-side. */
export const HOLOGRAPH_AUTHORIZATION_ORDER = [
  "AUTHENTICATION",
  "AUTHORIZATION",
  "TENANT/ENTITY/COUNTRY SCOPE",
  "CLASSIFICATION",
  "POLICY",
  "RLS",
  "PERMITTED DATASET",
  "SCENE",
  "RENDERER",
] as const;

/** The canonical Sector OS set Holograph may consume governed views from.
 * Mirrors VIZ_SECTOR_CODES: the five Sector OSs plus the BEYU control plane.
 * Holograph and Family Office themselves are NOT in this set — they are
 * capabilities. */
export const HOLOGRAPH_SECTOR_CONSUMERS = [
  "Health OS",
  "Finance OS",
  "Agriculture OS",
  "Ujenzi OS",
  "Foundation OS",
] as const;

/**
 * Holograph-specific capability status matrix (honest).
 *
 *   IMPLEMENTED            — governed, tested, shipped in this repository;
 *   PARTIALLY_IMPLEMENTED  — the governed seam exists; a concrete implementation
 *                            of part of the declared surface is missing;
 *   NOT_IMPLEMENTED        — declared, no implementation exists;
 *   PLANNED                — architecturally reserved, explicitly not started.
 *
 * Physical holographic hardware support is NOT claimed anywhere in this
 * capability. FUTURE_HOLOGRAPHIC_DEVICE is a registry class that can only
 * ever carry the NOT_IMPLEMENTED lifecycle state until a real, tested device
 * integration exists.
 */
export type HolographStatus =
  | "IMPLEMENTED"
  | "PARTIALLY_IMPLEMENTED"
  | "NOT_IMPLEMENTED"
  | "PLANNED";

export type HolographSubsystemStatus = {
  subsystem: string;
  status: HolographStatus;
  where: string;
};

export const HOLOGRAPH_SUBSYSTEM_STATUS: HolographSubsystemStatus[] = [
  { subsystem: "Canonical canon + boundaries", status: "IMPLEMENTED", where: "src/lib/viz/holograph.ts" },
  { subsystem: "Scene model (governed manifest, allowlist, accessible fallback)", status: "IMPLEMENTED", where: "src/lib/viz/scene-model.ts" },
  { subsystem: "Dimension registry (1D–8D + XD + governed 9D+ extensions)", status: "IMPLEMENTED", where: "src/lib/viz/dimensions.ts + viz_dimension_extensions" },
  { subsystem: "Digital twin layer (identity binding + live projection)", status: "IMPLEMENTED", where: "src/lib/viz/digital-twin.ts + viz_digital_twins" },
  { subsystem: "Sector adapters (Health/Finance/Agriculture/Ujenzi/Foundation)", status: "IMPLEMENTED", where: "src/lib/viz/adapters/*" },
  { subsystem: "Spatial asset registry (provenance, integrity, classification)", status: "IMPLEMENTED", where: "src/lib/viz/assets.ts + viz_assets (metadata registry; no binary store)" },
  { subsystem: "Object identity (stable, tenant/entity/country scoped)", status: "IMPLEMENTED", where: "scene manifest objects + viz_assets/viz_digital_twins identity bindings (reuses GlobalUserID/tenant/entity/country)" },
  { subsystem: "Spatial relationships (ownership, governance, sector edges)", status: "IMPLEMENTED", where: "live projection from canonical registries (ownership_records, governance, family trust) — never duplicated" },
  { subsystem: "Spatial layers (per-dimension layer sets, visibility)", status: "IMPLEMENTED", where: "src/lib/viz/scene-model.ts + viz_scenes.layers" },
  { subsystem: "Interaction ledger (governed request types, audited denials)", status: "IMPLEMENTED", where: "src/lib/viz/interactions.ts + viz_interactions" },
  { subsystem: "Device registry (hardware-independent classes + lifecycle)", status: "IMPLEMENTED", where: "src/lib/viz/devices.ts + viz_devices (registry only; no physical device driver)" },
  { subsystem: "Render profiles (renderer × device-class × quality)", status: "IMPLEMENTED", where: "src/lib/viz/render-profiles.ts + viz_render_profiles" },
  { subsystem: "Renderer abstraction (SVG/table/2D projection)", status: "IMPLEMENTED", where: "src/lib/viz/renderers.ts" },
  { subsystem: "WebGL/WebGPU 3D rendering", status: "PLANNED", where: "declared in the renderer capability matrix; no dependency bundled" },
  { subsystem: "GLTF/GLB binary parsing", status: "NOT_IMPLEMENTED", where: "asset registry stores provenance + integrity metadata; no parser bundled" },
  { subsystem: "IFC/BIM geometry parsing", status: "NOT_IMPLEMENTED", where: "declared in the Ujenzi adapter descriptor; no parser exists" },
  { subsystem: "XR runtime (AR/VR/MR/immersive web sessions)", status: "NOT_IMPLEMENTED", where: "src/lib/viz/xr.ts — contract + fail-closed null adapter only" },
  { subsystem: "Physical holographic hardware support", status: "NOT_IMPLEMENTED", where: "not claimed; FUTURE_HOLOGRAPHIC_DEVICE devices can only ever be NOT_IMPLEMENTED" },
  { subsystem: "Family Office spatial view (structure/ownership/trust)", status: "IMPLEMENTED", where: "src/lib/viz/family-office-view.ts (read projection over canonical tables)" },
  { subsystem: "Offline spatial workflows (authorized offline data)", status: "NOT_IMPLEMENTED", where: "declared only; offline data would remain subject to classification and authorization" },
  { subsystem: "Spatial analytics (density/proximity/coverage/clusters/flows)", status: "PLANNED", where: "abstraction reserved in scene manifest dimensions; no analytical engine" },
  { subsystem: "Noelia holographic manifestation (read-only tools)", status: "IMPLEMENTED", where: "src/lib/viz/noelia-tools.ts (sideEffects NONE)" },
  { subsystem: "Export ledger (hash-led, audited)", status: "PARTIALLY_IMPLEMENTED", where: "JSON/CSV server-side; SVG/PNG client-side; PDF/IFC NOT_IMPLEMENTED" },
  { subsystem: "Audit/event integration (denials included)", status: "IMPLEMENTED", where: "withAuditTransaction + enterprise_events (VIZ_* closed vocabulary)" },
];

/** Clean accessor used by UI/API/docs/tests. */
export function holographSubsystemStatus(): HolographSubsystemStatus[] {
  return HOLOGRAPH_SUBSYSTEM_STATUS.filter((row) => row.subsystem.length > 0);
}

/** The capability's canonical description for registries and navigation. */
export const HOLOGRAPH_CAPABILITY_DESCRIPTION =
  "Holograph — the governed spatial visualization and interaction capability of BEYU OS (a shared capability, not an OS): spatial scenes, governed assets, live digital twins, device and render-profile registries, audited spatial interactions and the Family Office spatial view, over each Sector OS's own authorized data.";
