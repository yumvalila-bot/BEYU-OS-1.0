/**
 * Shared inbound-verification primitives for provider adapters.
 *
 * WHY THE TIMESTAMP IS SIGNED
 *   A signature over the body alone is replayable forever. The canonical string
 *   is `${timestamp}.${rawBody}`, so a captured request expires on its own. This
 *   is not a clever invention; it is the minimum that makes "verified" mean
 *   something for a money-moving endpoint, and the reason `timestampValid` is a
 *   column rather than an assumption.
 *
 * WHY THE COMPARE IS CONSTANT TIME
 *   `crypto.timingSafeEqual` is already the pattern used for password and MFA
 *   checks in this repository (`src/lib/auth`). A webhook HMAC compared with `===`
 *   is byte-by-byte distinguishable by timing, and a provider endpoint is
 *   reachable by anyone on the network.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HMAC_ALGORITHM = "sha256";
export const TIMESTAMP_HEADER = "x-beyu-timestamp";
export const SIGNATURE_HEADER = "x-beyu-signature";

export function canonicalString(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

export function computeHmac(secret: string, timestamp: string, rawBody: string): string {
  return createHmac(HMAC_ALGORITHM, secret).update(canonicalString(timestamp, rawBody), "utf8").digest("hex");
}

/** Accepts `sha256=<hex>` or a bare hex digest. Never throws on malformed input. */
export function verifyHmac(input: { secret: string; timestamp: string; rawBody: string; presented: string | null | undefined }): boolean {
  const presented = (input.presented ?? "").trim();
  if (!presented) return false;
  const bare = presented.startsWith("sha256=") ? presented.slice("sha256=".length) : presented;
  if (!/^[0-9a-fA-F]{64}$/.test(bare)) return false;
  const expected = computeHmac(input.secret, input.timestamp, input.rawBody);
  const a = Buffer.from(bare.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

export type SkewReading = { skewSeconds: number | null; valid: boolean; detail: string };

export function readTimestampHeader(value: string | null | undefined, receivedAt: Date, maxSkewSeconds: number): SkewReading {
  const raw = (value ?? "").trim();
  if (!raw) return { skewSeconds: null, valid: false, detail: "MISSING_TIMESTAMP_HEADER" };
  const seconds = /^\d{10}$/.test(raw) ? Number(raw) : Date.parse(raw) / 1000;
  if (!Number.isFinite(seconds)) return { skewSeconds: null, valid: false, detail: "UNPARSEABLE_TIMESTAMP" };
  const skewSeconds = Math.round(receivedAt.getTime() / 1000 - seconds);
  if (Math.abs(skewSeconds) > maxSkewSeconds) {
    return { skewSeconds, valid: false, detail: skewSeconds > 0 ? "TIMESTAMP_TOO_OLD" : "TIMESTAMP_IN_FUTURE" };
  }
  return { skewSeconds, valid: true, detail: "TIMESTAMP_WITHIN_WINDOW" };
}

/** Test/dev helper only — a real provider owns its own secret. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export const VERIFICATION_VERSION = "payment-verify-1.0.0";
