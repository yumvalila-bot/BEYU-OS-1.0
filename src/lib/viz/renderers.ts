/**
 * BEYU OS — RENDERER ABSTRACTION (shared capability, §7).
 *
 * BEYU OS is not permanently tied to one graphics technology. This module is
 * the renderer CONTRACT layer: it declares which renderer kinds exist, which
 * dimensions each can express, their honest implementation status, and the
 * deterministic resolution/degradation rules (3D → 2D projection when WebGL
 * is unavailable, low-bandwidth and reduced-motion modes, mobile caps).
 *
 * DEPENDENCY DISCIPLINE
 * ─────────────────────
 * The repository ships no graphics stack (no three.js, no D3, no maplibre).
 * None is added: the implemented renderers are dependency-free (server-side
 * manifest + client-side inline SVG/HTML). WEBGL_3D and XR are declared as
 * PLANNED/NOT_IMPLEMENTED adapter points — the abstraction exists so a future
 * WebGL/WebGPU/XR renderer can be registered WITHOUT changing the scene model,
 * the adapters or the authorization pipeline. No vendor lock-in is introduced.
 *
 * The renderer is NEVER an authorization boundary (§19): it receives an
 * already-governed SceneManifest and decides only HOW to draw it.
 */
import type { VizFeatureStatus } from "./dimensions";

export const RENDERER_KINDS = [
  "HTML_TABLE",
  "SVG_2D",
  "CANVAS_2D",
  "CHART",
  "MAP",
  "DIAGRAM",
  "TIMELINE",
  "SPATIAL_PROJECTION",
  "WEBGL_3D",
  "WEBGPU_3D",
  "XR",
] as const;
export type RendererKind = (typeof RENDERER_KINDS)[number];

export type RendererDescriptor = {
  kind: RendererKind;
  /** Human-readable technology contract (what a concrete renderer must do). */
  contract: string;
  /** Dimension ids this renderer can express. */
  dimensions: string[];
  /** Honest status — never aspirational (§16/§45). */
  status: VizFeatureStatus;
  /** Runtime requirements probed on the client (fail-closed when unknown). */
  requirements: {
    webgl?: boolean;
    webgpu?: boolean;
    /** Minimum presentation tier: LOW_BANDWIDTH renders reduced LOD. */
    lowBandwidthCapable: boolean;
    reducedMotionCapable: boolean;
    mobileCapable: boolean;
  };
  /** Deterministic fallback when this renderer cannot run. */
  fallback: RendererKind | null;
  /** Extra runtime dependencies a concrete implementation would need.
   * Empty for every IMPLEMENTED renderer — the foundation bundles none. */
  futureDependencies: string[];
};

export const RENDERER_REGISTRY: readonly RendererDescriptor[] = Object.freeze([
  {
    kind: "HTML_TABLE",
    contract: "Accessible tabular rendering of the governed manifest; the non-visual equivalent that must exist for every scene (§26).",
    dimensions: ["1D", "2D", "4D", "5D", "6D", "7D", "8D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: null,
    futureDependencies: [],
  },
  {
    kind: "SVG_2D",
    contract: "Dependency-free inline SVG rendering of charts, maps, diagrams, plans and schematics from the governed manifest.",
    dimensions: ["1D", "2D", "4D", "5D", "6D", "7D", "8D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "HTML_TABLE",
    futureDependencies: [],
  },
  {
    kind: "CANVAS_2D",
    contract: "2D canvas rendering for large point sets; an optional client optimization over SVG_2D.",
    dimensions: ["2D", "3D"],
    status: "PLANNED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "SVG_2D",
    futureDependencies: [],
  },
  {
    kind: "CHART",
    contract: "Chart composition (bar/line/stack) over 1D/5D/6D series from the manifest; rendered through SVG_2D primitives.",
    dimensions: ["1D", "5D", "6D", "8D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "HTML_TABLE",
    futureDependencies: [],
  },
  {
    kind: "MAP",
    contract: "Coordinate projection (explicit CRS) of located objects; rendered through SVG_2D primitives. No third-party map tiles are requested — tiles would be a data-egress channel requiring its own governance.",
    dimensions: ["2D", "3D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "HTML_TABLE",
    futureDependencies: [],
  },
  {
    kind: "DIAGRAM",
    contract: "Relationship/structure diagrams (org structures, financial flows, twin relationships) from manifest edges; rendered through SVG_2D primitives.",
    dimensions: ["2D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "HTML_TABLE",
    futureDependencies: [],
  },
  {
    kind: "TIMELINE",
    contract: "4D time axis with playback cursor, time filters and state-at-time rendering from the manifest time anchors.",
    dimensions: ["4D", "7D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "HTML_TABLE",
    futureDependencies: [],
  },
  {
    kind: "SPATIAL_PROJECTION",
    contract: "Deterministic isometric/planar projection of 3D-positioned objects into SVG — the IMPLEMENTED 3D foundation renderer. It carries no geometry engine: BIM/IFC geometry parsing is NOT_IMPLEMENTED (see adapters).",
    dimensions: ["3D", "4D"],
    status: "IMPLEMENTED",
    requirements: { lowBandwidthCapable: true, reducedMotionCapable: true, mobileCapable: true },
    fallback: "SVG_2D",
    futureDependencies: [],
  },
  {
    kind: "WEBGL_3D",
    contract: "Full 3D scene rendering (WebGL). The abstraction point exists; NO WebGL renderer dependency is bundled and none may be added without a governed dependency decision.",
    dimensions: ["3D", "4D", "6D"],
    status: "PLANNED",
    requirements: { webgl: true, lowBandwidthCapable: false, reducedMotionCapable: true, mobileCapable: false },
    fallback: "SPATIAL_PROJECTION",
    futureDependencies: ["a governed WebGL/WebGPU scene library (NOT selected, NOT bundled)"],
  },
  {
    kind: "WEBGPU_3D",
    contract: "Future compute-accelerated rendering. Declared so the abstraction never hard-codes WebGL.",
    dimensions: ["3D", "4D"],
    status: "NOT_IMPLEMENTED",
    requirements: { webgpu: true, lowBandwidthCapable: false, reducedMotionCapable: true, mobileCapable: false },
    fallback: "SPATIAL_PROJECTION",
    futureDependencies: ["a governed WebGPU renderer (NOT selected, NOT bundled)"],
  },
  {
    kind: "XR",
    contract: "AR/VR/MR/spatial-computing presentation of governed manifests through the XR adapter foundation (./xr.ts). No XR runtime exists in this repository.",
    dimensions: ["XD"],
    status: "NOT_IMPLEMENTED",
    requirements: { lowBandwidthCapable: false, reducedMotionCapable: false, mobileCapable: false },
    fallback: "SPATIAL_PROJECTION",
    futureDependencies: ["a governed XR runtime (NOT selected, NOT bundled)"],
  },
] as const);

export type DeviceProfile = {
  webgl: boolean;
  webgpu: boolean;
  mobile: boolean;
  /** Client-declared bandwidth tier. A DECLARATION, not authorization: it can
   * only reduce fidelity, never widen data access. */
  lowBandwidth: boolean;
  reducedMotion: boolean;
};

export const CONSERVATIVE_DEVICE: DeviceProfile = {
  webgl: false,
  webgpu: false,
  mobile: true,
  lowBandwidth: true,
  reducedMotion: true,
};

export type RendererResolution = {
  primary: RendererDescriptor;
  /** Full fallback chain actually walked (for honest reporting in UI/audit). */
  chain: RendererKind[];
  reason: string;
};

function find(kind: RendererKind): RendererDescriptor | undefined {
  return RENDERER_REGISTRY.find((r) => r.kind === kind);
}

function canRun(descriptor: RendererDescriptor, device: DeviceProfile): boolean {
  if (descriptor.status === "NOT_IMPLEMENTED" || descriptor.status === "PLANNED") return false;
  if (descriptor.requirements.webgl && !device.webgl) return false;
  if (descriptor.requirements.webgpu && !device.webgpu) return false;
  return true;
}

/**
 * Resolve the renderer for a requested kind on a device profile.
 *
 * Deterministic and fail-safe: an unavailable/unsupported renderer degrades
 * along its declared fallback chain and always terminates at HTML_TABLE (the
 * accessible equivalent), so every scene remains usable on ordinary mobile and
 * desktop devices (§8, §27). Degradation NEVER changes what data was
 * authorized — only how it is drawn.
 */
export function resolveRenderer(requested: RendererKind, device: DeviceProfile): RendererResolution {
  const chain: RendererKind[] = [];
  let current = find(requested);
  const start = requested;
  while (current) {
    chain.push(current.kind);
    if (canRun(current, device)) {
      return {
        primary: current,
        chain,
        reason:
          current.kind === start
            ? `${start} is available on this device.`
            : `${start} is unavailable on this device (${statusReason(start, device)}); degraded to ${current.kind}. Data access is unchanged — degradation affects presentation only.`,
      };
    }
    current = current.fallback ? find(current.fallback) : undefined;
  }
  const table = find("HTML_TABLE")!;
  chain.push(table.kind);
  return {
    primary: table,
    chain,
    reason: `${start} could not run on this device; the accessible table equivalent is always available.`,
  };
}

function statusReason(kind: RendererKind, device: DeviceProfile): string {
  const descriptor = find(kind);
  if (!descriptor) return "unknown renderer";
  if (descriptor.status === "PLANNED") return "renderer is PLANNED — no dependency is bundled";
  if (descriptor.status === "NOT_IMPLEMENTED") return "renderer is NOT_IMPLEMENTED";
  if (descriptor.requirements.webgl && !device.webgl) return "WebGL unavailable";
  if (descriptor.requirements.webgpu && !device.webgpu) return "WebGPU unavailable";
  return "device capability missing";
}

/**
 * Choose the best renderer for a dimension combination + layer kinds on a
 * device. 3D content prefers SPATIAL_PROJECTION (the implemented foundation)
 * and only a future governed WebGL renderer would upgrade it; 2D content uses
 * SVG_2D; pure 1D uses HTML_TABLE.
 */
export function resolveForDimensions(dimensions: string[], device: DeviceProfile): RendererResolution[] {
  const wants = new Set<RendererKind>();
  const has3D = dimensions.includes("3D");
  const hasTime = dimensions.includes("4D") || dimensions.includes("7D");
  const hasChartable = dimensions.some((d) => ["5D", "6D", "8D"].includes(d));
  if (has3D) wants.add(device.webgl ? "WEBGL_3D" : "SPATIAL_PROJECTION");
  if (hasTime) wants.add("TIMELINE");
  if (hasChartable) wants.add("CHART");
  if (!has3D) wants.add("SVG_2D");
  if (wants.size === 0) wants.add("HTML_TABLE");
  return [...wants].map((kind) => resolveRenderer(kind, device));
}

/** The honest renderer capability matrix served by GET /api/v1/viz/renderers. */
export function rendererCapabilityMatrix() {
  return RENDERER_REGISTRY.map((r) => ({
    kind: r.kind,
    contract: r.contract,
    dimensions: r.dimensions,
    status: r.status,
    fallback: r.fallback,
    requirements: r.requirements,
    futureDependencies: r.futureDependencies,
  }));
}
