/**
 * BEYU OS — Universal Dimensional Graphics, Visualization, Simulation,
 * Digital Twin & Future XR Foundation.
 *
 * ONE shared BEYU capability (NOT an OS, NOT a sector). Canonical consumers:
 * Health OS, Finance OS, Agriculture OS, UJENZI OS (a full Sector OS — never
 * downgraded) and the BEYU Foundation (sister nonprofit). Sector truth stays
 * in each Sector OS; this layer projects it through governed adapters.
 *
 * Public surface (import from "@/lib/viz"):
 *   • dimensions    — the Universal Dimension Registry (1D–8D, governed 9D+
 *                     extensions, XD) and combination normalization;
 *   • scene-model   — governed SceneManifest projection with the exact
 *                     client allowlist (leak prevention by construction);
 *   • digital-twin  — the twin abstraction: identity bindings + LIVE
 *                     projection (never cached sector truth);
 *   • authorization — the three-stage governed path (viz RBAC → sector
 *                     conjunction → deep-link re-authorization → export);
 *   • service       — scenes, twins, extensions, manifests, exports over the
 *                     canonical audit/event chain (withAuditTransaction);
 *   • adapters      — the sector adapter registry (BEYU/HEALTH/FINANCE/
 *                     AGRICULTURE/UJENZI/FOUNDATION) with honest descriptors;
 *   • engines       — 4D time, 5D quantity (READ-ONLY; CAP_POSTING LOCKED),
 *                     6D performance, 7D lifecycle, 8D risk/compliance;
 *   • renderers / xr / exports / provenance / accessibility / events / errors.
 *
 * HONESTY: subsystem status lives in `VIZ_SUBSYSTEM_STATUS` (service.ts) and
 * every adapter descriptor declares what is NOT_IMPLEMENTED. Nothing here
 * claims capability the repository does not contain.
 */
export * from "./dimensions";
export * from "./errors";
export * from "./holograph";
export * from "./provenance";
export * from "./scene-model";
export * from "./digital-twin";
export * from "./authorization";
export * from "./events";
export * from "./exports";
export * from "./renderers";
export * from "./render-profiles";
export * from "./xr";
export * from "./accessibility";
export * from "./assets";
export * from "./devices";
export * from "./interactions";
export * from "./family-office-view";
export * from "./engines/time";
export * from "./engines/quantity";
export * from "./engines/performance";
export * from "./engines/lifecycle";
export * from "./engines/risk";
export * from "./adapters";
export * from "./service";
export * from "./noelia-tools";
