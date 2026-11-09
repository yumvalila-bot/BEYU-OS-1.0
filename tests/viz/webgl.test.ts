/**
 * Holograph WebGL 3D foundation — pure certification (no DOM, no database).
 *
 * Proves the phone-first 3D layer's load-bearing properties:
 *   • the render-scene projection reads ONLY allowlisted manifest fields
 *     (leak prevention by construction, exact output key set);
 *   • determinism, finite numbers, honest located/unlocated/cap counts;
 *   • camera math clamps (NaN/flip-proof) and renderer resolution degrades
 *     deterministically (WebGL → SPATIAL_PROJECTION → HTML_TABLE);
 *   • capability detection fails closed on this (non-browser) runtime;
 *   • the renderer capability matrix reports WEBGL_3D truthfully now that the
 *     dependency-free renderer exists, while WebGPU/XR stay honest.
 */
import { describe, expect, it } from "vitest";
import {
  buildSceneManifest,
  LOW_BANDWIDTH_OBJECT_LIMIT,
  type SceneObjectInput,
} from "@/lib/viz/scene-model";
import { ACCESSIBLE_SERIES_PALETTE, BEYU_BRAND } from "@/lib/viz/accessibility";
import { buildWebGLScene, WEBGL_SCENE_NODE_LIMIT } from "@/lib/viz/webgl/scene";
import {
  clamp,
  createOrbitCamera,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  orbitBy,
  panBy,
  zoomBy,
} from "@/lib/viz/webgl/math";
import { hexToRgba } from "@/lib/viz/webgl/renderer";
import { detectDeviceProfile, deviceProfileFrom, probeBrowserCapabilities } from "@/lib/viz/capability";
import {
  CONSERVATIVE_DEVICE,
  rendererCapabilityMatrix,
  resolveForDimensions,
  resolveRenderer,
  type DeviceProfile,
} from "@/lib/viz/renderers";

const WEBGL_PROFILE: DeviceProfile = {
  webgl: true,
  webgpu: false,
  mobile: true,
  lowBandwidth: false,
  reducedMotion: false,
};
const NO_WEBGL_PROFILE: DeviceProfile = { ...CONSERVATIVE_DEVICE, webgl: false };

const LAYERS = [
  { id: "layer-a", dimensionId: "3D", kind: "SPATIAL" as const, label: "Alpha", visible: true },
  { id: "layer-b", dimensionId: "2D", kind: "MAP" as const, label: "Beta", visible: true },
];

function object(i: number, overrides: Partial<SceneObjectInput> = {}): SceneObjectInput {
  return {
    id: `OBJ_${i}`,
    label: `Object ${i}`,
    layerId: LAYERS[i % LAYERS.length].id,
    classification: "INTERNAL",
    geometry: { crs: "EPSG:4326", latitude: -6.8 + i * 0.001, longitude: 39.2 + i * 0.001 },
    dimensionValues: { "5D": { value: 100, status: "OBSERVED", unit: "TZS", observedAt: null } },
    accessibleText: `SECRET_TEXT_MARKER_${i} full object description`,
    timeAnchor: null,
    status: "ACTIVE",
    ...overrides,
  };
}

function manifest(objects: SceneObjectInput[], layers = LAYERS) {
  return buildSceneManifest({
    sceneId: null,
    name: "WebGL test scene",
    sector: "UJENZI",
    dimensions: ["2D", "3D", "5D"],
    layers,
    objects,
    principal: { clearance: "INTERNAL" },
    sourceAdapter: "test-adapter",
    systemOfRecord: "Test SoR",
  });
}

describe("buildWebGLScene — allowlist projection (leak prevention)", () => {
  it("emits nodes with EXACTLY the client-safe keys", () => {
    const scene = buildWebGLScene(manifest([object(1), object(2)]));
    expect(scene.nodes.length).toBeGreaterThan(0);
    for (const node of scene.nodes) {
      expect(Object.keys(node).sort()).toEqual(["color", "id", "label", "layerId", "position", "size"]);
    }
  });

  it("never carries manifest values, accessible text or provenance into the render scene", () => {
    const scene = buildWebGLScene(manifest([object(1), object(2), object(3)]));
    const json = JSON.stringify(scene);
    expect(json).not.toContain("SECRET_TEXT_MARKER");
    expect(json).not.toContain("TZS");
    expect(json).not.toContain("OBSERVED");
    expect(json).not.toContain("Test SoR");
    expect(json).not.toContain("test-adapter");
    expect(json).not.toContain("withheldByClassification");
    expect(json).not.toContain("sourceRef");
  });

  it("is deterministic: the same manifest produces the identical scene", () => {
    const m = manifest([object(1), object(2), object(3)]);
    expect(buildWebGLScene(m)).toEqual(buildWebGLScene(m));
  });

  it("honors the node cap honestly (capped objects are counted, never silently lost)", () => {
    const many = Array.from({ length: WEBGL_SCENE_NODE_LIMIT + 20 }, (_, i) => object(i));
    const scene = buildWebGLScene(manifest(many));
    expect(scene.nodes.length).toBe(WEBGL_SCENE_NODE_LIMIT);
    expect(scene.locatedCount).toBe(WEBGL_SCENE_NODE_LIMIT + 20);
    expect(scene.cappedCount).toBe(20);
    const small = buildWebGLScene(manifest(many), { nodeLimit: 5 });
    expect(small.nodes.length).toBe(5);
    expect(small.cappedCount).toBe(WEBGL_SCENE_NODE_LIMIT + 20 - 5);
  });
});

describe("buildWebGLScene — honest geometry handling", () => {
  it("counts unlocated objects and renders only located geometry (never fabricates coordinates)", () => {
    const objects = [
      object(1),
      object(2, { geometry: null }),
      object(3, { geometry: null }),
      object(4),
      object(5, { geometry: { crs: "LOCAL", points: [] } }),
    ];
    const scene = buildWebGLScene(manifest(objects));
    expect(scene.locatedCount).toBe(2);
    expect(scene.unlocatedCount).toBe(3);
    expect(scene.nodes.length).toBe(2);
  });

  it("drops non-finite coordinates with a count — NaN/Infinity never reaches the GPU", () => {
    const objects = [
      object(1, {
        geometry: {
          crs: "LOCAL",
          points: [
            [1, 2, 0],
            [Number.NaN, 3, 0],
            [4, Number.POSITIVE_INFINITY, 0],
            [5, 6, 1],
          ],
        },
      }),
      object(2, { geometry: { crs: "LOCAL", latitude: Number.NaN, longitude: 39.2 } }),
    ];
    const scene = buildWebGLScene(manifest(objects));
    // 2 point coordinates dropped; the NaN-latitude object is treated as
    // unlocated (never rendered from invented coordinates).
    expect(scene.omittedNonFinite).toBe(2);
    expect(scene.locatedCount).toBe(1);
    expect(scene.unlocatedCount).toBe(1);
    for (const node of scene.nodes) {
      for (const v of [...node.position, ...node.size]) expect(Number.isFinite(v)).toBe(true);
    }
    for (const v of [...Object.values(scene.bounds.min), ...Object.values(scene.bounds.max), scene.radius, ...scene.center]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("an empty located set yields an empty scene (the UI falls back to 2D)", () => {
    const scene = buildWebGLScene(manifest([object(1, { geometry: null })]));
    expect(scene.nodes).toEqual([]);
    expect(scene.locatedCount).toBe(0);
    expect(scene.unlocatedCount).toBe(1);
    expect(scene.radius).toBeGreaterThan(0);
  });

  it("colors come only from the canonical accessible palette and are stable per layer", () => {
    const scene = buildWebGLScene(manifest([object(1), object(2), object(3)]));
    const palette = new Set<string>(ACCESSIBLE_SERIES_PALETTE);
    for (const node of scene.nodes) {
      expect(palette.has(node.color)).toBe(true);
    }
    // Same layer → same color (stable legend).
    const byLayer = new Map<string, string>();
    for (const node of scene.nodes) {
      const existing = byLayer.get(node.layerId);
      if (existing) expect(node.color).toBe(existing);
      else byLayer.set(node.layerId, node.color);
    }
    expect(Object.keys(scene.layerColors).sort()).toEqual(["layer-a", "layer-b"]);
  });

  it("keeps nodes inside the normalized bounds and sizes positive", () => {
    const scene = buildWebGLScene(manifest(Array.from({ length: 30 }, (_, i) => object(i))));
    for (const node of scene.nodes) {
      for (const v of node.position) {
        expect(v).toBeGreaterThanOrEqual(-0.5 - 1e-9);
        expect(v).toBeLessThanOrEqual(0.5 + 1e-9);
      }
      for (const v of node.size) expect(v).toBeGreaterThan(0);
    }
  });
});

describe("orbit camera — clamps keep input flip- and NaN-proof", () => {
  it("creates a finite camera framed on the scene", () => {
    const cam = createOrbitCamera({ target: [0.1, 0.2, 0.3], radius: 2 });
    expect(Number.isFinite(cam.distance)).toBe(true);
    expect(cam.minDistance).toBeLessThan(cam.maxDistance);
    const bad = createOrbitCamera({ target: [Number.NaN, 1, 1], radius: Number.NaN });
    expect([bad.target, bad.distance, bad.minDistance, bad.maxDistance].every((v) =>
      Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v),
    )).toBe(true);
  });

  it("pitch is hard-clamped (camera can never flip under the ground)", () => {
    const cam = createOrbitCamera({ target: [0, 0, 0], radius: 1 });
    const up = orbitBy(cam, 0, 1000);
    expect(up.pitch).toBeLessThanOrEqual(cam.maxPitch);
    const down = orbitBy(cam, 0, -1000);
    expect(down.pitch).toBeGreaterThanOrEqual(-cam.maxPitch);
  });

  it("zoom is clamped to [minDistance, maxDistance] and ignores junk factors", () => {
    const cam = createOrbitCamera({ target: [0, 0, 0], radius: 1 });
    expect(zoomBy(cam, 0).distance).toBe(cam.distance); // factor 0 → ignored
    expect(zoomBy(cam, Number.NaN).distance).toBe(cam.distance);
    expect(zoomBy(cam, 1e-9).distance).toBeCloseTo(cam.minDistance, 6);
    expect(zoomBy(cam, 1e9).distance).toBeCloseTo(cam.maxDistance, 6);
  });

  it("pan with non-finite deltas is a no-op (identity)", () => {
    const cam = createOrbitCamera({ target: [0, 0, 0], radius: 1 });
    expect(panBy(cam, Number.NaN, 1)).toEqual(cam);
    expect(panBy(cam, 1, Number.POSITIVE_INFINITY)).toEqual(cam);
  });

  it("projection/view matrices are finite for valid camera inputs", () => {
    const cam = createOrbitCamera({ target: [0, 0, 0], radius: 1.5 });
    const proj = mat4Perspective(Math.PI / 4, 16 / 10, 0.01, 100);
    const view = mat4LookAt([cam.distance, cam.distance, cam.distance], [0, 0, 0], [0, 1, 0]);
    const mvp = mat4Multiply(proj, view);
    expect([...proj, ...view, ...mvp].every(Number.isFinite)).toBe(true);
    expect(mvp.length).toBe(16);
  });

  it("clamp helper never returns NaN", () => {
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});

describe("capability detection — fail-closed", () => {
  it("maps probe inputs to the canonical device profile", () => {
    const profile = deviceProfileFrom({
      webgl: true,
      webgpu: false,
      reducedMotion: true,
      lowBandwidth: true,
      coarsePointer: true,
      compactViewport: false,
    });
    expect(profile).toEqual({
      webgl: true,
      webgpu: false,
      mobile: true,
      lowBandwidth: true,
      reducedMotion: true,
    });
    // compact viewport alone is also mobile; all-false is desktop.
    expect(
      deviceProfileFrom({
        webgl: false, webgpu: false, reducedMotion: false, lowBandwidth: false,
        coarsePointer: false, compactViewport: true,
      }).mobile,
    ).toBe(true);
    expect(
      deviceProfileFrom({
        webgl: false, webgpu: false, reducedMotion: false, lowBandwidth: false,
        coarsePointer: false, compactViewport: false,
      }).mobile,
    ).toBe(false);
  });

  it("on a non-browser runtime the probe returns null and the profile is CONSERVATIVE (fail closed)", () => {
    expect(typeof window).toBe("undefined");
    expect(probeBrowserCapabilities()).toBeNull();
    expect(detectDeviceProfile()).toEqual(CONSERVATIVE_DEVICE);
  });
});

describe("renderer resolution — deterministic degradation", () => {
  it("WEBGL_3D runs on a probed WebGL device", () => {
    const r = resolveRenderer("WEBGL_3D", WEBGL_PROFILE);
    expect(r.primary.kind).toBe("WEBGL_3D");
    expect(r.chain).toEqual(["WEBGL_3D"]);
    expect(r.reason).toMatch(/available/i);
  });

  it("without WebGL it degrades WEBGL_3D → SPATIAL_PROJECTION and reports why", () => {
    const r = resolveRenderer("WEBGL_3D", NO_WEBGL_PROFILE);
    expect(r.primary.kind).toBe("SPATIAL_PROJECTION");
    expect(r.chain).toEqual(["WEBGL_3D", "SPATIAL_PROJECTION"]);
    expect(r.reason).toMatch(/WebGL unavailable/i);
    expect(r.reason).toMatch(/data access is unchanged/i);
  });

  it("3D dimension content prefers WEBGL_3D only when the device has WebGL", () => {
    const withGpu = resolveForDimensions(["3D", "5D"], WEBGL_PROFILE).map((r) => r.primary.kind);
    expect(withGpu).toContain("WEBGL_3D");
    const withoutGpu = resolveForDimensions(["3D", "5D"], NO_WEBGL_PROFILE).map((r) => r.primary.kind);
    expect(withoutGpu).toContain("SPATIAL_PROJECTION");
    expect(withoutGpu).not.toContain("WEBGL_3D");
  });

  it("the capability matrix is honest: WEBGL_3D implemented dependency-free; WebGPU/XR not implemented", () => {
    const matrix = rendererCapabilityMatrix();
    const webgl = matrix.find((r) => r.kind === "WEBGL_3D")!;
    expect(webgl.status).toBe("IMPLEMENTED");
    expect(webgl.futureDependencies).toEqual([]);
    expect(webgl.fallback).toBe("SPATIAL_PROJECTION");
    expect(webgl.requirements.webgl).toBe(true);
    const webgpu = matrix.find((r) => r.kind === "WEBGPU_3D")!;
    expect(webgpu.status).toBe("NOT_IMPLEMENTED");
    const xr = matrix.find((r) => r.kind === "XR")!;
    expect(xr.status).toBe("NOT_IMPLEMENTED");
    // The accessible terminal fallback always exists.
    expect(matrix.find((r) => r.kind === "HTML_TABLE")!.status).toBe("IMPLEMENTED");
  });
});

describe("hex color parsing — palette-bound GPU colors", () => {
  it("parses canonical brand colors", () => {
    const gold = hexToRgba(BEYU_BRAND.gold);
    expect(gold[0]).toBeCloseTo(212 / 255, 5);
    expect(gold[1]).toBeCloseTo(160 / 255, 5);
    expect(gold[2]).toBeCloseTo(23 / 255, 5);
    expect(gold[3]).toBe(1);
  });

  it("any malformed color falls back to BEYU navy — never NaN into the GPU", () => {
    for (const bad of ["", "red", "#GGGGGG", "javascript:alert(1)", "#12345", "rgba(0,0,0,0)"]) {
      const rgba = hexToRgba(bad);
      expect(rgba.every(Number.isFinite)).toBe(true);
      expect(rgba[3]).toBeGreaterThan(0);
    }
  });
});

describe("server-side object caps remain authoritative", () => {
  it("the low-bandwidth manifest cap is below the render-scene cap", () => {
    // Server caps ship first; the client render cap is an additional ceiling.
    expect(LOW_BANDWIDTH_OBJECT_LIMIT).toBeLessThan(WEBGL_SCENE_NODE_LIMIT);
    expect(WEBGL_SCENE_NODE_LIMIT).toBeLessThanOrEqual(500);
  });
});
