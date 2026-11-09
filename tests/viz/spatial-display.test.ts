/**
 * Holograph spatial display adapter seam — fail-closed certification (pure).
 *
 * Proves the §9/§3-C presentation contract:
 *   • the browser adapter initializes and presents the already-governed
 *     manifest without requiring sensor consent, and never mutates it;
 *   • presentation fails closed before initialization and after terminate;
 *   • EVERY hardware-class adapter is UNVERIFIED_NO_HARDWARE and can never
 *     return GRANTED — even with all consents supplied (honesty floor);
 *   • the shared decision function enforces declared consent flags;
 *   • the registry rejects duplicate/unknown adapters and reports an honest
 *     verified-vs-unverified inventory.
 */
import { describe, expect, it } from "vitest";
import { buildSceneManifest, type SceneManifest, type SceneObjectInput } from "@/lib/viz/scene-model";
import {
  SPATIAL_CONSENT_FLAGS,
  SPATIAL_DISPLAY_CLASSES,
  createBrowserSpatialDisplayAdapter,
  evaluateSpatialRequest,
  registerSpatialDisplayAdapter,
  resolveSpatialDisplay,
  spatialDisplayAdapters,
  spatialDisplayInventory,
  unverifiedHardwareDisplayAdapters,
  type SpatialConsent,
  type SpatialDisplayAdapter,
  type SpatialDisplayCapabilityReport,
} from "@/lib/viz/spatial-display";
import { CONSERVATIVE_DEVICE, type DeviceProfile } from "@/lib/viz/renderers";

const WEBGL_PROFILE: DeviceProfile = {
  webgl: true,
  webgpu: false,
  mobile: true,
  lowBandwidth: false,
  reducedMotion: true,
};

function testManifest(): SceneManifest {
  const object: SceneObjectInput = {
    id: "OBJ_1",
    label: "Pump station",
    layerId: "layer-a",
    classification: "INTERNAL",
    geometry: { crs: "EPSG:4326", latitude: -6.8, longitude: 39.2 },
    dimensionValues: {},
    accessibleText: "Authorized spatial object.",
    timeAnchor: null,
    status: "ACTIVE",
  };
  return buildSceneManifest({
    sceneId: null,
    name: "Spatial adapter scene",
    sector: "UJENZI",
    dimensions: ["3D"],
    layers: [{ id: "layer-a", dimensionId: "3D", kind: "SPATIAL", label: "Alpha", visible: true }],
    objects: [object],
    principal: { clearance: "INTERNAL" },
    sourceAdapter: "test-adapter",
    systemOfRecord: "Test SoR",
  });
}

describe("browser spatial adapter — the implemented channel", () => {
  it("initializes and presents with no sensor consent (screen rendering only)", async () => {
    const adapter = createBrowserSpatialDisplayAdapter(WEBGL_PROFILE);
    expect(adapter.verification).toBe("VERIFIED_IN_SOFTWARE");
    const init = await adapter.initialize();
    expect(init.status).toBe("GRANTED");
    const present = await adapter.present({ manifest: testManifest(), consents: [] });
    expect(present.status).toBe("GRANTED");
    if (present.status === "GRANTED") expect(present.renderMode).toBe("WEBGL_3D");
    const report = adapter.capabilities();
    expect(report.requiredConsents).toEqual([]);
    expect(report.presentsGovernedManifestOnly).toBe(true);
    expect(report.supportedRenderModes).toContain("WEBGL_3D");
    adapter.terminate();
    adapter.dispose();
  });

  it("degrades to SPATIAL_PROJECTION on a device without WebGL", async () => {
    const adapter = createBrowserSpatialDisplayAdapter(CONSERVATIVE_DEVICE);
    await adapter.initialize();
    const present = await adapter.present({ manifest: testManifest(), consents: [] });
    expect(present.status).toBe("GRANTED");
    if (present.status === "GRANTED") expect(present.renderMode).toBe("SPATIAL_PROJECTION");
  });

  it("fails closed before initialize and after terminate", async () => {
    const adapter = createBrowserSpatialDisplayAdapter(WEBGL_PROFILE);
    const early = await adapter.present({ manifest: testManifest(), consents: [] });
    expect(early.status).toBe("UNAVAILABLE");
    if (early.status === "UNAVAILABLE") expect(early.reason).toMatch(/not initialized/i);
    await adapter.initialize();
    adapter.terminate();
    const late = await adapter.present({ manifest: testManifest(), consents: [] });
    expect(late.status).toBe("UNAVAILABLE");
    expect(adapter.lastError()).toMatch(/not initialized/i);
  });

  it("never mutates the governed manifest it presents", async () => {
    const adapter = createBrowserSpatialDisplayAdapter(WEBGL_PROFILE);
    await adapter.initialize();
    const m = testManifest();
    const before = structuredClone(m);
    await adapter.present({ manifest: m, consents: [] });
    expect(m).toEqual(before);
  });

  it("resolveSpatialDisplay returns the browser adapter for any probed profile", () => {
    const adapter = resolveSpatialDisplay(WEBGL_PROFILE);
    expect(adapter.id).toBe("beyu-spatial-browser");
    expect(resolveSpatialDisplay({ ...CONSERVATIVE_DEVICE, mobile: false }).deviceClass).toBe("BROWSER_SCREEN");
    expect(resolveSpatialDisplay(WEBGL_PROFILE).deviceClass).toBe("MOBILE_SCREEN");
  });
});

describe("hardware display templates — honest fail-closed behavior", () => {
  it("covers every physical/spatial class from the canonical vocabulary", () => {
    const adapters = unverifiedHardwareDisplayAdapters();
    const classes = adapters.map((a) => a.deviceClass).sort();
    expect(classes).toEqual(
      ["AR_GLASS", "OPTICAL_HOLOGRAPHIC_PROJECTOR", "SPATIAL_DISPLAY", "VOLUMETRIC_DISPLAY", "VR_HEADSET"].sort(),
    );
    for (const cls of classes) expect(SPATIAL_DISPLAY_CLASSES).toContain(cls);
  });

  it("every hardware adapter is UNVERIFIED_NO_HARDWARE and can NEVER grant — even with all consents", async () => {
    const allConsents: SpatialConsent[] = [...SPATIAL_CONSENT_FLAGS];
    for (const adapter of unverifiedHardwareDisplayAdapters()) {
      expect(adapter.verification).toBe("UNVERIFIED_NO_HARDWARE");
      expect(adapter.capabilities().verification).toBe("UNVERIFIED_NO_HARDWARE");

      const init = await adapter.initialize();
      expect(init.status).toBe("UNAVAILABLE");
      if (init.status === "UNAVAILABLE") {
        expect(init.fallbackRenderer).toBe("SPATIAL_PROJECTION");
        expect(init.requiredDependencies?.length).toBeGreaterThan(0);
      }

      const present = await adapter.present({ manifest: testManifest(), consents: allConsents });
      expect(present.status).toBe("UNAVAILABLE");
      if (present.status === "UNAVAILABLE") expect(present.reason).toMatch(/UNVERIFIED_NO_HARDWARE/);

      expect(adapter.lastError()).toBeTruthy();
      adapter.terminate();
      adapter.dispose();
    }
  });

  it("the inventory reports one software-verified channel and five unverified hardware templates", () => {
    const inventory = spatialDisplayInventory();
    expect(inventory.verifiedInSoftware).toEqual(["beyu-spatial-browser"]);
    expect(inventory.unverifiedNoHardware).toHaveLength(5);
  });
});

describe("consent gate — shared decision function", () => {
  function consentMockAdapter(required: SpatialConsent[]): {
    adapter: SpatialDisplayAdapter;
    state: { initialized: boolean; lastError: string | null };
  } {
    const state: { initialized: boolean; lastError: string | null } = {
      initialized: false,
      lastError: null,
    };
    const id = "beyu-spatial-consent-mock";
    const capabilities = (): SpatialDisplayCapabilityReport => ({
      adapterId: id,
      deviceClass: "AR_GLASS",
      verification: "VERIFIED_IN_SOFTWARE",
      supportedRenderModes: ["WEBGL_3D"],
      requiredConsents: required,
      presentsGovernedManifestOnly: true,
      dependencies: ["test-only mock adapter"],
    });
    const adapter: SpatialDisplayAdapter = {
      id,
      deviceClass: "AR_GLASS",
      verification: "VERIFIED_IN_SOFTWARE",
      capabilities,
      async initialize() {
        state.initialized = true;
        state.lastError = null;
        return { status: "GRANTED", adapterId: id, renderMode: "WEBGL_3D" };
      },
      async present(request) {
        return evaluateSpatialRequest(adapter, state, {
          consents: request.consents,
          requestedMode: "WEBGL_3D",
        });
      },
      terminate() {
        state.initialized = false;
      },
      dispose() {
        state.initialized = false;
      },
      lastError() {
        return state.lastError;
      },
    };
    return { adapter, state };
  }

  it("presentation without the declared consent grant fails closed with the missing flag", async () => {
    const { adapter } = consentMockAdapter(["CAMERA", "SPATIAL_ENVIRONMENT"]);
    await adapter.initialize();
    const denied = await adapter.present({ manifest: testManifest(), consents: ["CAMERA"] });
    expect(denied.status).toBe("UNAVAILABLE");
    if (denied.status === "UNAVAILABLE") {
      expect(denied.missingConsents).toEqual(["SPATIAL_ENVIRONMENT"]);
      expect(denied.fallbackRenderer).toBe("SPATIAL_PROJECTION");
    }
    const granted = await adapter.present({
      manifest: testManifest(),
      consents: ["CAMERA", "SPATIAL_ENVIRONMENT"],
    });
    expect(granted.status).toBe("GRANTED");
  });

  it("an unsupported render mode is refused", async () => {
    const { state } = consentMockAdapter([]);
    state.initialized = true;
    const decision = await evaluateSpatialRequest(
      {
        id: "x",
        deviceClass: "VR_HEADSET",
        verification: "VERIFIED_IN_SOFTWARE",
        capabilities: () => ({
          adapterId: "x",
          deviceClass: "VR_HEADSET",
          verification: "VERIFIED_IN_SOFTWARE",
          supportedRenderModes: ["WEBGL_3D"],
          requiredConsents: [],
          presentsGovernedManifestOnly: true,
          dependencies: [],
        }),
      },
      state,
      { consents: [], requestedMode: "HTML_TABLE" },
    );
    expect(decision.status).toBe("UNAVAILABLE");
    if (decision.status === "UNAVAILABLE") expect(decision.reason).toMatch(/not supported/i);
  });
});

describe("registry hygiene", () => {
  it("rejects duplicate ids and unknown device classes", () => {
    const [template] = spatialDisplayAdapters();
    expect(template).toBeDefined();
    expect(() => registerSpatialDisplayAdapter(template)).toThrow(/already registered/i);
    expect(() =>
      registerSpatialDisplayAdapter({
        ...template,
        id: "beyu-spatial-bogus",
        deviceClass: "HOLOGRAM_9000" as never,
      }),
    ).toThrow(/Unknown spatial display class/i);
  });

  it("every registered adapter reports presentsGovernedManifestOnly", () => {
    for (const adapter of spatialDisplayAdapters()) {
      expect(adapter.capabilities().presentsGovernedManifestOnly).toBe(true);
    }
  });
});
