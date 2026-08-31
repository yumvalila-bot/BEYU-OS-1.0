import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Lightweight cryptographic helpers used internally by Health OS.
 *
 *   - sha256Hex: deterministic hex digest used by the audit hash chain.
 *   - aes256gcmEncrypt / aes256gcmDecrypt: AES-256-GCM envelope for TOTP
 *     secrets at rest. Key MUST be 32 bytes (64 hex chars); IV is 12 random
 *     bytes prepended to ciphertext; auth tag appended.
 *
 * These helpers deliberately do NOT attempt cryptographic anchoring into BEYU's
 * constitutional chain — that remains ARCHITECTURE-BLOCKED pending governance.
 */

export const AUDIT_GENESIS = "HEALTH_AUDIT_GENESIS_v1" as const;
export const AUDIT_HASH_VERSION = 1 as const;

export function sha256Hex(...parts: Array<string | null | undefined>): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p == null ? "" : String(p));
  h.update("|");
  return h.digest("hex");
}

/** Build the canonical payload string that underlies an audit entry_hash. */
export function auditHashInput(args: {
  version?: number;
  auditId: string;
  tenantId: string;
  entityCode: string | null;
  countryCode: string | null;
  actorId: string;
  correlationId: string | null;
  operation: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  prevHash: string;
}): string {
  const v = args.version ?? AUDIT_HASH_VERSION;
  return [
    `v${v}`,
    args.auditId,
    args.tenantId,
    args.entityCode ?? "",
    args.countryCode ?? "",
    args.actorId,
    args.correlationId ?? "",
    args.operation,
    args.resourceType,
    args.resourceId ?? "",
    args.createdAt,
    args.prevHash,
  ].join("|");
}

export interface AesEnvelope {
  /** base64(iv) + "." + base64(ciphertext) + "." + base64(auth_tag) */
  enc: string;
}

export function aes256gcmEncrypt(
  keyHex: string,
  plaintext: string,
  aad?: string,
): AesEnvelope {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("CRYPTO_KEY_INVALID: AES-256-GCM key must be 64 hex chars (32 bytes)");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: [iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join("."),
  };
}

export function aes256gcmDecrypt(
  keyHex: string,
  envelope: AesEnvelope,
  aad?: string,
): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("CRYPTO_KEY_INVALID: AES-256-GCM key must be 64 hex chars (32 bytes)");
  }
  const parts = envelope.enc.split(".");
  if (parts.length !== 3) throw new Error("CRYPTO_ENVELOPE_INVALID");
  const iv = Buffer.from(parts[0], "base64");
  const ct = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

import { timingSafeEqual as tsec } from "crypto";

/** Constant-time string comparison. Returns false if lengths differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return tsec(ab, bb);
}

/** Generate a URL-safe random token of given byte length. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
