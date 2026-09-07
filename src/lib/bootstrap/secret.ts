import { createHmac, timingSafeEqual } from "node:crypto";
import { sha256 } from "@/lib/crypto";

/**
 * BEYU OS — bootstrap authorization secret.
 *
 * The one-time administrator enrollment path is gated by an owner-controlled
 * secret provisioned ONLY through the deployment platform's environment/secret
 * manager (Vercel) as `BEYU_BOOTSTRAP_SECRET`. It is:
 *   - never committed to source control or documentation,
 *   - never returned by any application API,
 *   - never logged,
 *   - compared in constant time,
 *   - required to have high entropy (min length below),
 *   - refused in production if it looks like a placeholder.
 *
 * This module deliberately holds NO fallback/default value: if the secret is
 * absent, the enrollment path reports "not configured" and refuses to proceed.
 */

export const BOOTSTRAP_SECRET_MIN_LENGTH = 32;

const PLACEHOLDER_MARKERS = ["change_me", "changeme", "placeholder", "example", "your-", "not_secret", "todo"];

export type BootstrapSecretState =
  | { configured: true }
  | { configured: false; reason: "MISSING" | "TOO_SHORT" | "PLACEHOLDER" };

function productionMode(): boolean {
  return process.env.NODE_ENV === "production" || process.env.BEYU_ENV === "production";
}

/** Report whether a usable bootstrap secret is configured — without revealing it. */
export function bootstrapSecretState(): BootstrapSecretState {
  const raw = process.env.BEYU_BOOTSTRAP_SECRET;
  if (!raw) return { configured: false, reason: "MISSING" };
  if (raw.length < BOOTSTRAP_SECRET_MIN_LENGTH) return { configured: false, reason: "TOO_SHORT" };
  if (productionMode() && PLACEHOLDER_MARKERS.some((m) => raw.toLowerCase().includes(m))) {
    return { configured: false, reason: "PLACEHOLDER" };
  }
  return { configured: true };
}

export function isBootstrapSecretConfigured(): boolean {
  return bootstrapSecretState().configured;
}

/**
 * Constant-time comparison of a candidate against the configured secret.
 *
 * Both sides are folded through an HMAC keyed on a fixed domain-separation
 * string so inputs of different lengths do not leak length through
 * `timingSafeEqual` (which throws on unequal-length buffers), and so the raw
 * secret never sits in a comparison buffer.
 */
export function verifyBootstrapSecret(candidate: string): boolean {
  const state = bootstrapSecretState();
  if (!state.configured) return false;
  const secret = process.env.BEYU_BOOTSTRAP_SECRET as string;
  const key = "beyu-os/bootstrap-secret/v1";
  const a = createHmac("sha256", key).update(candidate).digest();
  const b = createHmac("sha256", key).update(secret).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Non-reversible fingerprint of the active secret, for audit correlation only. */
export function bootstrapSecretFingerprint(): string | null {
  const state = bootstrapSecretState();
  if (!state.configured) return null;
  // Truncated hash of an HMAC — cannot be used to recover or brute-force the
  // secret offline, but lets audit rows show the same enrollment used one
  // consistent configured secret.
  const mac = createHmac("sha256", "beyu-os/bootstrap-fingerprint/v1")
    .update(process.env.BEYU_BOOTSTRAP_SECRET as string)
    .digest("hex");
  return sha256(mac).slice(0, 16);
}
