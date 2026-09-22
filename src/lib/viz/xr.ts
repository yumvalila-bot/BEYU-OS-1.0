/**
 * BEYU OS — XR ADAPTER FOUNDATION (shared capability, §16/§17.Q).
 *
 * XD is the extensible umbrella for future immersive presentation: AR, VR,
 * MR, XR, spatial computing, real-time streams and AI-assisted visualization.
 *
 * HONEST STATE OF THIS REPOSITORY
 * ───────────────────────────────
 * NO XR runtime exists. No WebXR session code, no headset integration, no
 * spatial-computing dependency is bundled, and none is claimed. What IS
 * implemented here is the ARCHITECTURAL EXTENSION POINT: the adapter contract
 * a future governed XR renderer must satisfy, a capability probe that
 * FAILS CLOSED (returns UNAVAILABLE rather than pretending), and the rule
 * that an XR presentation consumes exactly the same governed SceneManifest —
 * immersion never widens data access (§20: the renderer is never an
 * authorization boundary; an XR client re-authorizes like every other client).
 */
import type { VizFeatureStatus } from "./dimensions";
import type { SceneManifest } from "./scene-model";

export const XR_MODALITIES = ["AR", "VR", "MR", "SPATIAL_COMPUTING", "IMMERSIVE_WEB"] as const;
export type XrModality = (typeof XR_MODALITIES)[number];

export type XrSessionRequest = {
  modality: XrModality;
  /** The governed manifest to immerse. Already authorized — an XR adapter
   * may only PRESENT it, never extend it. */
  manifest: SceneManifest;
  /** Interaction tier the client declares; degraded tiers must still provide
   * the accessible text channel (§26 carries into XR). */
  interactionTier: "FULL" | "GAZE" | "CONTROLLER" | "PASSIVE";
};

export type XrSessionDecision =
  | { status: "GRANTED"; adapter: string }
  | { status: "UNAVAILABLE"; reason: string; fallbackRenderer: string };

export type XrAdapter = {
  id: string;
  modality: XrModality;
  status: VizFeatureStatus;
  /** Probe runtime support. MUST fail closed: unknown → UNAVAILABLE. */
  probe(): Promise<XrSessionDecision>;
  /** Present a governed manifest. MUST refuse manifests whose provenance is
   * absent and MUST surface the accessible text channel in-session. */
  present(request: XrSessionRequest): Promise<XrSessionDecision>;
  dispose(): void;
};

/**
 * The only adapter registered today. It is a NULL adapter: every probe and
 * presentation returns UNAVAILABLE with the deterministic 2D/3D-projection
 * fallback. Registering a real XR adapter is a governed dependency +
 * architecture decision; until then this keeps every XR code path honest and
 * fail-closed instead of throwing or fabricating a session.
 */
export const NULL_XR_ADAPTER: XrAdapter = {
  id: "beyu-xr-null",
  modality: "IMMERSIVE_WEB",
  status: "NOT_IMPLEMENTED",
  async probe(): Promise<XrSessionDecision> {
    return {
      status: "UNAVAILABLE",
      reason: "No XR runtime is implemented in BEYU OS. The XR adapter foundation is the architectural extension point (PLANNED); presenting immersive sessions would fabricate capability. The governed manifest remains fully presentable through the 2D/3D-projection fallback renderers.",
      fallbackRenderer: "SPATIAL_PROJECTION",
    };
  },
  async present(): Promise<XrSessionDecision> {
    return this.probe();
  },
  dispose(): void {
    /* nothing to release */
  },
};

/** Registry of XR adapters. Extension point: a future governed adapter is
 * registered here WITHOUT changing the scene model, adapters or authorization. */
const adapters: XrAdapter[] = [NULL_XR_ADAPTER];

export function registerXrAdapter(adapter: XrAdapter): void {
  if (adapters.some((a) => a.id === adapter.id)) throw new Error(`XR adapter '${adapter.id}' is already registered.`);
  adapters.push(adapter);
}

export function xrAdapters(): readonly XrAdapter[] {
  return adapters;
}

/** Resolve an XR session request. Today this ALWAYS returns UNAVAILABLE with
 * the fallback — by design and by honesty, not by failure. */
export async function requestXrSession(request: XrSessionRequest): Promise<XrSessionDecision> {
  const adapter = adapters.find((a) => a.modality === request.modality && a.status === "IMPLEMENTED");
  if (!adapter) {
    return {
      status: "UNAVAILABLE",
      reason: `No IMPLEMENTED XR adapter for modality ${request.modality}. XR is an architectural extension point (NOT_IMPLEMENTED); the governed scene remains available through 2D/3D-projection renderers.`,
      fallbackRenderer: "SPATIAL_PROJECTION",
    };
  }
  return adapter.present(request);
}

/** Real-time stream foundation (§16): the contract a future governed stream
 * source must satisfy. NOT_IMPLEMENTED today — events already provide the
 * governed refresh path (see ./events.ts), and a raw stream must never become
 * an unauthorized data channel. */
export type RealtimeStreamContract = {
  status: Extract<VizFeatureStatus, "NOT_IMPLEMENTED" | "PLANNED">;
  rule: "A future stream MAY only signal re-validation; data always re-enters through the authorized adapter/API path.";
};

export const REALTIME_STREAM_FOUNDATION: RealtimeStreamContract = {
  status: "NOT_IMPLEMENTED",
  rule: "A future stream MAY only signal re-validation; data always re-enters through the authorized adapter/API path.",
};
