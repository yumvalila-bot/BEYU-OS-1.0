/**
 * BEYU OS — GOVERNED MANIFEST → RENDER SCENE projection (shared capability).
 *
 * The pure bridge between the allowlisted `SceneManifest` (already fully
 * governed: authentication → authorization → classification → policy → RLS →
 * permitted dataset → scene) and the dependency-free WebGL renderer.
 *
 * LEAK PREVENTION (§22, same invariant as buildSceneManifest)
 * ───────────────────────────────────────────────────────────
 * `buildWebGLScene()` reads EXACTLY five client-safe fields per object —
 * `id`, `label`, `layerId`, `geometry` and the layer's position in the
 * manifest — and emits nodes carrying EXACTLY `id`, `label`, `layerId`,
 * `position`, `size`, `color`. It never reads `values`, `accessibleText`,
 * provenance, tenant/entity keys or anything outside the manifest allowlist,
 * and unit tests assert the exact output key set. The renderer is still never
 * an authorization boundary: it receives an already-governed manifest and
 * decides only HOW to draw it.
 *
 * HONESTY RULES
 * ──────────────
 *   • Geometry is OPTIONAL and never fabricated: objects without located
 *     geometry are COUNTED and excluded (the accessible table remains the
 *     complete representation).
 *   • Non-finite coordinates are dropped and counted — NaN/Infinity never
 *     reaches the GPU.
 *   • Deterministic: the same manifest always produces the same scene
 *     (stable camera framing, stable colors), so re-renders cannot flicker
 *     between layouts.
 *   • Colors come only from the canonical accessible palette (fixed constant,
 *     never user input).
 */
import type { SceneManifest } from "../scene-model";
import { ACCESSIBLE_SERIES_PALETTE } from "../accessibility";

export type WebGLSceneNode = {
  id: string;
  label: string;
  layerId: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};

export type WebGLSceneBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type WebGLScene = {
  nodes: WebGLSceneNode[];
  bounds: WebGLSceneBounds;
  /** Radius of the bounding sphere around `center` — camera framing input. */
  radius: number;
  center: [number, number, number];
  /** How many manifest objects carried located geometry (pre-cap). */
  locatedCount: number;
  /** How many manifest objects had no geometry (count only — never faked). */
  unlocatedCount: number;
  /** How many coordinates were dropped as non-finite. */
  omittedNonFinite: number;
  /** How many located objects exceeded the node cap (server caps exist too). */
  cappedCount: number;
  /** Layer id → palette color (stable for the accessible legend). */
  layerColors: Record<string, string>;
};

/** Client-side safety cap on rendered nodes (independent of the manifest's
 * server-side cap; the lower of the two effectively bounds GPU work). */
export const WEBGL_SCENE_NODE_LIMIT = 400;

/** Minimum rendered footprint in normalized units (always visible). */
const MIN_FOOTPRINT = 0.03;
/** Minimum rendered thickness when source geometry is planar (2D only). */
const MIN_THICKNESS = 0.03;
/** Default point size for single-coordinate objects. */
const POINT_SIZE = 0.055;
/** Labels are surfaced in the object list/inspector; truncate defensively. */
const MAX_LABEL_LENGTH = 120;

type RawBox = {
  id: string;
  label: string;
  layerId: string;
  /** Axis-aligned corners in SOURCE units (pre-normalization). */
  min: [number, number, number];
  max: [number, number, number];
  single: boolean;
};

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function sanitizeLabel(label: string): string {
  const clean = typeof label === "string" ? label.replace(/[\u0000-\u001f]/g, " ").trim() : "";
  if (!clean) return "Object";
  return clean.length > MAX_LABEL_LENGTH ? `${clean.slice(0, MAX_LABEL_LENGTH - 1)}…` : clean;
}

function layerColorMap(manifest: SceneManifest): Record<string, string> {
  const colors: Record<string, string> = {};
  manifest.layers.forEach((layer, index) => {
    colors[layer.id] = ACCESSIBLE_SERIES_PALETTE[index % ACCESSIBLE_SERIES_PALETTE.length];
  });
  return colors;
}

/** Read the located geometry of one manifest object into a source-space box.
 * Returns null for unlocated or fully non-finite geometry (counted, never
 * faked with invented coordinates). */
function objectBox(
  object: SceneManifest["objects"][number],
): { box: RawBox | null; nonFinite: number } {
  const geometry = object.geometry;
  if (!geometry) return { box: null, nonFinite: 0 };

  let nonFinite = 0;
  const coords: Array<[number, number, number]> = [];

  const lat = geometry.latitude;
  const lon = geometry.longitude;
  if (finite(lat) && finite(lon)) {
    // Parity with the 2D projection: geographic anchors enter the same planar
    // fit as scene-unit points (equirectangular degrees; explicit CRS comes
    // from the manifest geometry metadata).
    coords.push([lon, lat, 0]);
  }

  for (const p of geometry.points ?? []) {
    if (!Array.isArray(p)) continue;
    const [x, y, z] = p;
    if (!finite(x) || !finite(y)) {
      nonFinite += 1;
      continue;
    }
    coords.push([x, y, finite(z) ? z : 0]);
  }

  if (coords.length === 0) return { box: null, nonFinite };

  let min: [number, number, number] = [Infinity, Infinity, Infinity];
  let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of coords) {
    min = [Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z)];
    max = [Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z)];
  }

  return {
    box: {
      id: object.id,
      label: sanitizeLabel(object.label),
      layerId: object.layerId,
      min,
      max,
      single: coords.length === 1,
    },
    nonFinite,
  };
}

/**
 * Project an already-governed SceneManifest into the deterministic render
 * scene consumed by the WebGL renderer (pure — no DOM, no I/O).
 */
export function buildWebGLScene(
  manifest: SceneManifest,
  opts: { nodeLimit?: number } = {},
): WebGLScene {
  const layerColors = layerColorMap(manifest);
  const limit = Math.max(
    1,
    Math.min(
      Number.isInteger(opts.nodeLimit) ? (opts.nodeLimit as number) : WEBGL_SCENE_NODE_LIMIT,
      WEBGL_SCENE_NODE_LIMIT,
    ),
  );

  const rawBoxes: RawBox[] = [];
  let unlocatedCount = 0;
  let omittedNonFinite = 0;

  for (const object of manifest.objects) {
    const { box, nonFinite } = objectBox(object);
    omittedNonFinite += nonFinite;
    if (!box) {
      unlocatedCount += 1;
      continue;
    }
    rawBoxes.push(box);
  }

  const locatedCount = rawBoxes.length;
  const cappedCount = Math.max(0, locatedCount - limit);
  const boxes = rawBoxes.slice(0, limit);

  if (boxes.length === 0) {
    return {
      nodes: [],
      bounds: { min: [0, 0, 0], max: [0, 0, 0] },
      radius: 1,
      center: [0, 0, 0],
      locatedCount,
      unlocatedCount,
      omittedNonFinite,
      cappedCount,
      layerColors,
    };
  }

  // Global normalization: uniform scale keeps proportions honest across
  // degrees-vs-meters mixes; the scene always lands inside ±0.5 per axis.
  let gMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let gMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    gMin = [Math.min(gMin[0], b.min[0]), Math.min(gMin[1], b.min[1]), Math.min(gMin[2], b.min[2])];
    gMax = [Math.max(gMax[0], b.max[0]), Math.max(gMax[1], b.max[1]), Math.max(gMax[2], b.max[2])];
  }

  const center: [number, number, number] = [
    (gMin[0] + gMax[0]) / 2,
    (gMin[1] + gMax[1]) / 2,
    (gMin[2] + gMax[2]) / 2,
  ];
  const span = Math.max(gMax[0] - gMin[0], gMax[1] - gMin[1], gMax[2] - gMin[2], 1e-6);

  // World axes: source (x, y) is the ground plane (world X/Z) and source z
  // is height (world Y) — so maps/footprints lie flat like a tabletop model
  // and any source elevation raises the node. Uniform span keeps the swap
  // isometric.
  const nodes: WebGLSceneNode[] = boxes.map((b) => {
    const c: [number, number, number] = [
      (b.min[0] + b.max[0]) / 2,
      (b.min[1] + b.max[1]) / 2,
      (b.min[2] + b.max[2]) / 2,
    ];
    const position: [number, number, number] = [
      (c[0] - center[0]) / span,
      (c[2] - center[2]) / span,
      (c[1] - center[1]) / span,
    ];

    const extent = (sourceSpan: number): number => Math.max(sourceSpan / span, MIN_FOOTPRINT);
    const heightSource = b.max[2] - b.min[2];
    const size: [number, number, number] = b.single
      ? [POINT_SIZE, POINT_SIZE, POINT_SIZE]
      : [
          extent(b.max[0] - b.min[0]),
          // Planar source geometry (z span 0) gets a fixed visible thickness —
          // presentation depth, never a value derived from source data.
          heightSource > 1e-9 ? extent(heightSource) : MIN_THICKNESS,
          extent(b.max[1] - b.min[1]),
        ];

    const color = layerColors[b.layerId] ?? ACCESSIBLE_SERIES_PALETTE[0];

    return {
      id: b.id,
      label: b.label,
      layerId: b.layerId,
      position: position.map((v) => (Number.isFinite(v) ? v : 0)) as [number, number, number],
      size: size.map((v) => (Number.isFinite(v) && v > 0 ? v : MIN_FOOTPRINT)) as [number, number, number],
      color,
    };
  });

  // Normalized bounds are computed from the actual node extents so camera
  // framing is tight (fit-to-content), and every value is finite by the
  // per-node guard above.
  let nMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let nMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    nMin = [
      Math.min(nMin[0], n.position[0] - n.size[0] / 2),
      Math.min(nMin[1], n.position[1] - n.size[1] / 2),
      Math.min(nMin[2], n.position[2] - n.size[2] / 2),
    ];
    nMax = [
      Math.max(nMax[0], n.position[0] + n.size[0] / 2),
      Math.max(nMax[1], n.position[1] + n.size[1] / 2),
      Math.max(nMax[2], n.position[2] + n.size[2] / 2),
    ];
  }
  const bounds: WebGLSceneBounds = { min: nMin, max: nMax };
  const centerWorld: [number, number, number] = [
    (nMin[0] + nMax[0]) / 2,
    (nMin[1] + nMax[1]) / 2,
    (nMin[2] + nMax[2]) / 2,
  ];
  const radius = Math.max(
    Math.hypot(nMax[0] - nMin[0], nMax[1] - nMin[1], nMax[2] - nMin[2]) / 2,
    1e-3,
  );

  return {
    nodes,
    bounds,
    radius,
    center: centerWorld,
    locatedCount,
    unlocatedCount,
    omittedNonFinite,
    cappedCount,
    layerColors,
  };
}
