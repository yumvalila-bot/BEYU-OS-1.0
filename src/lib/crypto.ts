import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

/** Password hashing — scrypt with per-user salt. No plaintext ever stored. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, digest] = stored.split("$");
  if (algo !== "scrypt" || !salt || !digest) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Deterministic JSON serialisation with recursively sorted object keys.
 * Required because PostgreSQL `jsonb` does not preserve key order: any hash
 * computed over raw JSON.stringify output would fail to reproduce on read.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Stable checksum for documents, waterfall runs and event payloads. */
export function checksumOf(value: unknown): string {
  return sha256(stableStringify(value));
}
