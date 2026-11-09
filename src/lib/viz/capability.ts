/**
 * BEYU OS — HOLOGRAPH CLIENT CAPABILITY DETECTION (shared capability).
 *
 * Answers one question honestly: which presentation capabilities does THIS
 * browser/device actually have right now, so the workspace can choose a
 * renderer with deterministic degradation instead of user-agent guessing.
 *
 * INVARIANTS
 * ──────────
 *   • FEATURE DETECTION ONLY. No user-agent sniffing; `canvas.getContext`,
 *     `matchMedia` and `navigator` feature presence are the only signals.
 *   • FAIL CLOSED. On the server (no `window`/`document`), during probe
 *     failure, or when a signal is unavailable, the conservative profile is
 *     returned — the 2D/table channel is always correct, 3D is an enhancement.
 *   • A capability probe is NOT a test result. Detecting WebGL proves a
 *     context can be created on this device NOW; it says nothing about
 *     authorization, data access or hardware verification (§9.1).
 *   • DECLARATIONS NEVER WIDEN ACCESS. The bandwidth tier is a client
 *     declaration that can only reduce fidelity (object caps come from the
 *     server), never widen data access — same rule as DeviceProfile.
 */
import { CONSERVATIVE_DEVICE, type DeviceProfile } from "./renderers";

/** Raw signals collected from the runtime (all optional at the edge). */
export type CapabilityProbe = {
  webgl: boolean;
  webgpu: boolean;
  reducedMotion: boolean;
  lowBandwidth: boolean;
  coarsePointer: boolean;
  compactViewport: boolean;
};

/**
 * Map a probe to the canonical DeviceProfile (pure).
 * `mobile` is coarse-pointer OR a compact viewport: either signal alone is
 * enough to prefer touch-friendly, lower-cost presentation.
 */
export function deviceProfileFrom(probe: CapabilityProbe): DeviceProfile {
  return {
    webgl: probe.webgl === true,
    webgpu: probe.webgpu === true,
    mobile: probe.coarsePointer === true || probe.compactViewport === true,
    // Declarations may only REDUCE fidelity — never widen data access.
    lowBandwidth: probe.lowBandwidth === true,
    reducedMotion: probe.reducedMotion === true,
  };
}

/** Safe matchMedia wrapper (undefined outside browsers or without the API). */
function mediaMatches(query: string): boolean | undefined {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    return window.matchMedia(query).matches === true;
  } catch {
    return undefined;
  }
}

/**
 * Probe WebGL availability by attempting to create (and immediately release)
 * a context. Returns `false` on failure; never throws.
 */
function probeWebGL(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGLRenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return false;
    // Release the probe context immediately — detection must not leak a
    // context on memory-constrained phones.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect the raw capability probe. Returns `null` when there is no browser
 * runtime to probe (SSR) — callers must treat `null` as "unknown", i.e. fail
 * closed to the conservative profile.
 */
export function probeBrowserCapabilities(): CapabilityProbe | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  let webgpu = false;
  try {
    webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
  } catch {
    webgpu = false;
  }

  // Bandwidth: a DECLARATION used only to reduce fidelity (§ device profile).
  let lowBandwidth = false;
  try {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;
    if (connection) {
      if (connection.saveData === true) lowBandwidth = true;
      const et = connection.effectiveType;
      if (et === "slow-2g" || et === "2g" || et === "3g") lowBandwidth = true;
    }
  } catch {
    lowBandwidth = false;
  }

  let compactViewport = false;
  try {
    compactViewport = Number.isFinite(window.innerWidth) && window.innerWidth < 768;
  } catch {
    compactViewport = false;
  }

  return {
    webgl: probeWebGL(),
    webgpu,
    reducedMotion: mediaMatches("(prefers-reduced-motion: reduce)") === true,
    lowBandwidth,
    coarsePointer: mediaMatches("(pointer: coarse)") === true,
    compactViewport,
  };
}

/**
 * The profile every client renderer resolver should use. SSR, probe failure
 * and unsupported signals all collapse to CONSERVATIVE_DEVICE — the 2D/table
 * channel keeps working; 3D only activates on a positively probed device.
 */
export function detectDeviceProfile(): DeviceProfile {
  const probe = probeBrowserCapabilities();
  if (!probe) return { ...CONSERVATIVE_DEVICE };
  return deviceProfileFrom(probe);
}
