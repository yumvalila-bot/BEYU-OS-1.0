/**
 * BEYU OS — SPATIAL DISPLAY ADAPTER SEAM (shared capability, §9/§3 Experience C).
 *
 * The presentation-adapter contract for devices beyond the browser canvas:
 * AR glasses, VR headsets, spatial displays, volumetric displays and future
 * compatible optical holographic projectors — plus the one adapter this
 * repository can honestly implement and verify today, the browser itself.
 *
 * INVARIANTS
 * ──────────
 *   • PRESENTATION ONLY. An adapter receives an already-governed
 *     `SceneManifest` (authentication → authorization → classification →
 *     policy → RLS → permitted dataset → scene happened BEFORE this seam).
 *     Adapters present; they never authorize, never execute, never mutate,
 *     never fetch sector data. Moving pixels to another screen widens nothing.
 *   • CONSENT IS EXPLICIT. Adapters declare the consent flags their channel
 *     needs (e.g. CAMERA for passthrough AR); a presentation request without
 *     those grants fails closed with UNAVAILABLE, never "works anyway".
 *   • HARDWARE HONESTY. `verification` distinguishes what automated software
 *     evidence supports (`VERIFIED_IN_SOFTWARE`) from every hardware class
 *     with no documented interface and no test device in this repository
 *     (`UNVERIFIED_NO_HARDWARE`). Hardware adapters FAIL CLOSED by
 *     construction: they can only report UNAVAILABLE with the precise
 *     dependency list — never GRANTED, never a fabricated session.
 *   • FAIL-CLOSED FALLBACK. Every refusal carries the deterministic fallback
 *     renderer (`SPATIAL_PROJECTION`/`HTML_TABLE`) so the caller degrades to
 *     the accessible channel instead of erroring into a dead end.
 *   • NOT AN XR RUNTIME. This seam does not replace ./xr.ts (which owns the
 *     immersive-session contract); it owns external/spatial display
 *     presentation. Neither fabricates WebXR or vendor SDK support.
 */
import type { DeviceProfile, RendererKind } from "./renderers";
import type { SceneManifest } from "./scene-model";

export const SPATIAL_DISPLAY_CLASSES = [
  "BROWSER_SCREEN",
  "MOBILE_SCREEN",
  "AR_GLASS",
  "VR_HEADSET",
  "SPATIAL_DISPLAY",
  "VOLUMETRIC_DISPLAY",
  "OPTICAL_HOLOGRAPHIC_PROJECTOR",
] as const;
export type SpatialDisplayClass = (typeof SPATIAL_DISPLAY_CLASSES)[number];

/** Consent vocabulary a spatial channel may require. Requested only when the
 * adapter declares them; none is implied by opening a scene. */
export const SPATIAL_CONSENT_FLAGS = ["CAMERA", "MICROPHONE", "MOTION", "LOCATION", "SPATIAL_ENVIRONMENT"] as const;
export type SpatialConsent = (typeof SPATIAL_CONSENT_FLAGS)[number];

export type SpatialVerification = "VERIFIED_IN_SOFTWARE" | "UNVERIFIED_NO_HARDWARE";

export type SpatialDisplayCapabilityReport = {
  adapterId: string;
  deviceClass: SpatialDisplayClass;
  verification: SpatialVerification;
  supportedRenderModes: RendererKind[];
  requiredConsents: SpatialConsent[];
  /** True for every adapter in this seam (contract marker, not a claim). */
  presentsGovernedManifestOnly: true;
  /** Concrete hardware/software dependencies an integration would need. */
  dependencies: string[];
};

export type SpatialSessionRequest = {
  manifest: SceneManifest;
  /** Consent grants the USER has actually given this session. */
  consents: SpatialConsent[];
};

export type SpatialDisplayDecision =
  | { status: "GRANTED"; adapterId: string; renderMode: RendererKind }
  | {
      status: "UNAVAILABLE";
      reason: string;
      fallbackRenderer: RendererKind;
      missingConsents?: SpatialConsent[];
      requiredDependencies?: string[];
    };

export type SpatialDisplayAdapter = {
  id: string;
  deviceClass: SpatialDisplayClass;
  verification: SpatialVerification;
  /** Honest capability report (never aspirational). */
  capabilities(): SpatialDisplayCapabilityReport;
  /** Establish the presentation channel. FAIL CLOSED: unknown → UNAVAILABLE. */
  initialize(): Promise<SpatialDisplayDecision>;
  /** Present a governed manifest on an initialized channel. Requires every
   * declared consent grant. MUST NOT mutate the manifest. */
  present(request: SpatialSessionRequest): Promise<SpatialDisplayDecision>;
  /** End the presentation session (idempotent). */
  terminate(): void;
  /** Release resources (idempotent). */
  dispose(): void;
  /** Last refusal/error reason, if any (surfaced to the UI verbatim). */
  lastError(): string | null;
};

/* ───────────────────────── shared fail-closed evaluation ───────────────────────── */

type AdapterRuntimeState = { initialized: boolean; lastError: string | null };

/**
 * The single decision function every adapter routes `initialize()`/`present()`
 * through — consent, initialization and render-mode checks can never be
 * forgotten per adapter (tested once, relied on everywhere).
 */
export function evaluateSpatialRequest(
  adapter: Pick<SpatialDisplayAdapter, "id" | "deviceClass" | "verification" | "capabilities">,
  state: AdapterRuntimeState,
  request: { consents: SpatialConsent[]; requestedMode?: RendererKind },
): SpatialDisplayDecision {
  const report = adapter.capabilities();

  if (adapter.verification === "UNVERIFIED_NO_HARDWARE") {
    // Hardware honesty floor: unverified hardware can NEVER be granted, even
    // if a caller lies about consent. The dependency list is the truthful
    // remaining work.
    const decision: SpatialDisplayDecision = {
      status: "UNAVAILABLE",
      reason: `Adapter '${adapter.id}' (${adapter.deviceClass}) is UNVERIFIED_NO_HARDWARE: no documented hardware interface or compatible test device exists in this environment, so no session is ever granted.`,
      fallbackRenderer: "SPATIAL_PROJECTION",
      requiredDependencies: report.dependencies,
    };
    state.lastError = decision.reason;
    return decision;
  }

  if (!state.initialized) {
    const decision: SpatialDisplayDecision = {
      status: "UNAVAILABLE",
      reason: `Adapter '${adapter.id}' is not initialized. Call initialize() first; presentation fails closed until the channel is established.`,
      fallbackRenderer: "SPATIAL_PROJECTION",
    };
    state.lastError = decision.reason;
    return decision;
  }

  const granted = new Set(request.consents);
  const missing = report.requiredConsents.filter((c) => !granted.has(c));
  if (missing.length > 0) {
    const decision: SpatialDisplayDecision = {
      status: "UNAVAILABLE",
      reason: `Presentation on '${adapter.id}' requires consent for ${missing.join(", ")}; the request did not carry it.`,
      fallbackRenderer: "SPATIAL_PROJECTION",
      missingConsents: missing,
    };
    state.lastError = decision.reason;
    return decision;
  }

  const mode = request.requestedMode ?? report.supportedRenderModes[0];
  if (!mode || !report.supportedRenderModes.includes(mode)) {
    const decision: SpatialDisplayDecision = {
      status: "UNAVAILABLE",
      reason: `Render mode '${String(mode)}' is not supported by adapter '${adapter.id}' (supported: ${report.supportedRenderModes.join(", ") || "none"}).`,
      fallbackRenderer: "SPATIAL_PROJECTION",
    };
    state.lastError = decision.reason;
    return decision;
  }

  return { status: "GRANTED", adapterId: adapter.id, renderMode: mode };
}

/* ───────────────────────────── browser adapter ───────────────────────────── */

function makeReport(
  adapterId: string,
  deviceClass: SpatialDisplayClass,
  verification: SpatialVerification,
  supportedRenderModes: RendererKind[],
  requiredConsents: SpatialConsent[],
  dependencies: string[],
): SpatialDisplayCapabilityReport {
  return {
    adapterId,
    deviceClass,
    verification,
    supportedRenderModes,
    requiredConsents,
    presentsGovernedManifestOnly: true,
    dependencies,
  };
}

/**
 * The IMPLEMENTED adapter: presentation on the current browser/screen.
 * Verification is software-level — the WebGL renderer and its fallbacks are
 * exercised by automated tests; this says nothing about external hardware.
 * No sensor consent is required: the adapter renders pixels locally.
 */
export function createBrowserSpatialDisplayAdapter(profile: DeviceProfile): SpatialDisplayAdapter {
  const state: AdapterRuntimeState = { initialized: false, lastError: null };
  const modes: RendererKind[] = profile.webgl ? ["WEBGL_3D", "SPATIAL_PROJECTION", "HTML_TABLE"] : ["SPATIAL_PROJECTION", "HTML_TABLE"];
  const id = "beyu-spatial-browser";

  const adapter: SpatialDisplayAdapter = {
    id,
    deviceClass: profile.mobile ? "MOBILE_SCREEN" : "BROWSER_SCREEN",
    verification: "VERIFIED_IN_SOFTWARE",
    capabilities: () =>
      makeReport(
        id,
        profile.mobile ? "MOBILE_SCREEN" : "BROWSER_SCREEN",
        "VERIFIED_IN_SOFTWARE",
        modes,
        [],
        [],
      ),
    async initialize(): Promise<SpatialDisplayDecision> {
      state.initialized = true;
      state.lastError = null;
      return { status: "GRANTED", adapterId: id, renderMode: modes[0] };
    },
    async present(request): Promise<SpatialDisplayDecision> {
      const decision = evaluateSpatialRequest(adapter, state, {
        consents: request.consents,
        requestedMode: modes[0],
      });
      // Note: the manifest is presented as-is (already governed); this
      // adapter performs no I/O with it — rendering happens in the caller's
      // WebGL/2D renderer from the same allowlisted manifest.
      return decision;
    },
    terminate(): void {
      state.initialized = false;
    },
    dispose(): void {
      state.initialized = false;
    },
    lastError(): string | null {
      return state.lastError;
    },
  };
  return adapter;
}

/* ─────────────────────── unverified hardware adapters ─────────────────────── */

export type UnverifiedHardwareAdapterSpec = {
  id: string;
  deviceClass: Exclude<SpatialDisplayClass, "BROWSER_SCREEN" | "MOBILE_SCREEN">;
  /** What a real integration needs (vendor SDK, calibration, protocol…). */
  dependencies: string[];
  requiredConsents?: SpatialConsent[];
  proposedRenderModes?: RendererKind[];
};

/**
 * Template for a future physical/spatial display integration. It is a
 * REAL adapter object registered in the seam (so callers, tests and UI all
 * exercise the honest refusal path), but it can never grant a session: every
 * decision reports UNAVAILABLE + UNVERIFIED_NO_HARDWARE + the documented
 * dependency list. When (and only when) a documented technical interface and
 * a compatible test device exist, a NEW adapter implementation replaces this
 * one under normal review — the seam and its callers do not change.
 */
export function createUnverifiedHardwareSpatialDisplayAdapter(
  spec: UnverifiedHardwareAdapterSpec,
): SpatialDisplayAdapter {
  const state: AdapterRuntimeState = { initialized: false, lastError: null };

  const adapter: SpatialDisplayAdapter = {
    id: spec.id,
    deviceClass: spec.deviceClass,
    verification: "UNVERIFIED_NO_HARDWARE",
    capabilities: () =>
      makeReport(
        spec.id,
        spec.deviceClass,
        "UNVERIFIED_NO_HARDWARE",
        spec.proposedRenderModes ?? ["SPATIAL_PROJECTION"],
        spec.requiredConsents ?? [],
        spec.dependencies,
      ),
    async initialize(): Promise<SpatialDisplayDecision> {
      const decision = evaluateSpatialRequest(adapter, state, { consents: [] });
      state.initialized = false; // never becomes initialized while unverified
      return decision;
    },
    async present(): Promise<SpatialDisplayDecision> {
      const decision = evaluateSpatialRequest(adapter, state, { consents: [] });
      return decision;
    },
    terminate(): void {
      state.initialized = false;
    },
    dispose(): void {
      state.initialized = false;
    },
    lastError(): string | null {
      return state.lastError;
    },
  };
  return adapter;
}

/** The documented hardware template set — categories from §3 Experience C.
 * All UNVERIFIED_NO_HARDWARE in this repository; none is claimed supported. */
export function unverifiedHardwareDisplayAdapters(): SpatialDisplayAdapter[] {
  return [
    createUnverifiedHardwareSpatialDisplayAdapter({
      id: "beyu-spatial-ar-glass-template",
      deviceClass: "AR_GLASS",
      requiredConsents: ["CAMERA", "SPATIAL_ENVIRONMENT"],
      dependencies: [
        "a documented device/vendor streaming or WebXR-compatible interface",
        "a compatible test device available to the team",
        "user consent flow for camera/spatial-environment access",
        "a credible end-to-end test plan executed on real hardware",
      ],
      proposedRenderModes: ["WEBGL_3D"],
    }),
    createUnverifiedHardwareSpatialDisplayAdapter({
      id: "beyu-spatial-vr-headset-template",
      deviceClass: "VR_HEADSET",
      requiredConsents: ["SPATIAL_ENVIRONMENT"],
      dependencies: [
        "a documented immersive-session interface (e.g. WebXR on the target headset)",
        "a compatible test headset available to the team",
        "comfort/safety review of interaction patterns",
        "a credible end-to-end test plan executed on real hardware",
      ],
      proposedRenderModes: ["WEBGL_3D"],
    }),
    createUnverifiedHardwareSpatialDisplayAdapter({
      id: "beyu-spatial-spatial-display-template",
      deviceClass: "SPATIAL_DISPLAY",
      dependencies: [
        "the display vendor's documented content interface and formats",
        "calibrated content pipeline (the browser scene is not automatically vendor-ready)",
        "a compatible test display available to the team",
        "a credible end-to-end test plan executed on real hardware",
      ],
      proposedRenderModes: ["SPATIAL_PROJECTION"],
    }),
    createUnverifiedHardwareSpatialDisplayAdapter({
      id: "beyu-spatial-volumetric-display-template",
      deviceClass: "VOLUMETRIC_DISPLAY",
      dependencies: [
        "the display vendor's documented rendering protocol and SDK",
        "volume-specific content preparation (depth-sliced or equivalent)",
        "a compatible test display available to the team",
        "a credible end-to-end test plan executed on real hardware",
      ],
      proposedRenderModes: ["SPATIAL_PROJECTION"],
    }),
    createUnverifiedHardwareSpatialDisplayAdapter({
      id: "beyu-spatial-optical-holographic-template",
      deviceClass: "OPTICAL_HOLOGRAPHIC_PROJECTOR",
      dependencies: [
        "the projector vendor's documented holographic content format and SDK (an ordinary browser scene is NOT sendable as an optical hologram)",
        "optical calibration and content authored for the specific optical path",
        "a compatible test projector available to the team",
        "a credible end-to-end test plan executed on real hardware",
      ],
      proposedRenderModes: ["SPATIAL_PROJECTION"],
    }),
  ];
}

/* ───────────────────────────── registry ───────────────────────────── */

const registry: Map<string, SpatialDisplayAdapter> = new Map();

function seed(): void {
  if (registry.size > 0) return;
  for (const adapter of unverifiedHardwareDisplayAdapters()) registry.set(adapter.id, adapter);
}
seed();

/** Register an additional adapter (extension point for a future verified
 * integration). Duplicate ids are rejected — ids are unique seams. */
export function registerSpatialDisplayAdapter(adapter: SpatialDisplayAdapter): void {
  if (registry.has(adapter.id)) throw new Error(`Spatial display adapter '${adapter.id}' is already registered.`);
  if (!(SPATIAL_DISPLAY_CLASSES as readonly string[]).includes(adapter.deviceClass)) {
    throw new Error(`Unknown spatial display class '${adapter.deviceClass}'.`);
  }
  registry.set(adapter.id, adapter);
}

export function spatialDisplayAdapters(): SpatialDisplayAdapter[] {
  return [...registry.values()];
}

/**
 * Resolve the adapter to use for a probed device profile. Returns the
 * IMPLEMENTED browser adapter; external hardware adapters are never silently
 * auto-selected (they require an explicit future integration to replace them).
 */
export function resolveSpatialDisplay(profile: DeviceProfile): SpatialDisplayAdapter {
  return createBrowserSpatialDisplayAdapter(profile);
}

/** The honest inventory line for docs/UI/tests: verified-vs-unverified counts.
 * The browser adapter is created per device profile (id is constant), so it
 * is listed explicitly; every registry row is a hardware template. */
export function spatialDisplayInventory(): {
  verifiedInSoftware: string[];
  unverifiedNoHardware: string[];
} {
  const rows = spatialDisplayAdapters();
  return {
    verifiedInSoftware: ["beyu-spatial-browser"],
    unverifiedNoHardware: rows.filter((a) => a.verification === "UNVERIFIED_NO_HARDWARE").map((a) => a.id),
  };
}
