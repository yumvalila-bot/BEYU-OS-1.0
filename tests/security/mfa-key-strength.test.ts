import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/mfa";

/**
 * F-NEW-1 regression — production MFA key material must fail closed.
 *
 * Before remediation `keyMaterial()` rejected only the literal placeholder
 * containing "development-only". Any other value — an empty string, a short
 * string, an all-zero key, or the published Health OS test fixture — was
 * accepted in production and stretched through sha256() into a deterministic,
 * publicly derivable AES-256 key used to encrypt every TOTP secret at rest.
 *
 * `keyMaterial()` reads process.env at CALL time, so mutating the environment
 * per-case is sufficient; no module-registry reset is required.
 *
 * No test asserts on a secret value; all assertions are on thrown rule text.
 */

const ENV_KEYS = ["MFA_ENCRYPTION_KEY", "AUTH_SECRET", "NODE_ENV", "BEYU_ENV"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

/**
 * `process.env.NODE_ENV` is typed read-only by @types/node. These tests must
 * exercise production-mode behaviour, so write through a mutable view of the
 * same object rather than widening the global type.
 */
const mutableEnv = process.env as Record<string, string | undefined>;

let saved: Partial<Record<EnvKey, string | undefined>> = {};

/** The published 32-byte fixture key hard-coded in the Health OS MFA service. */
const HEALTH_TEST_KEY_HEX = "6d6661746573745f746573745f6b65795f33325f62797465735f6e6565646564";

/** A valid production-shaped key: 64 lowercase hex characters. */
const STRONG_KEY = "a3f1".repeat(16);

function encryptWith(key: string | undefined, env: "production" | "test"): string {
  for (const k of ENV_KEYS) delete mutableEnv[k];
  if (key !== undefined) mutableEnv.MFA_ENCRYPTION_KEY = key;
  mutableEnv.NODE_ENV = env;
  mutableEnv.BEYU_ENV = env;
  return encryptSecret("JBSWY3DPEHPK3PXP");
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete mutableEnv[k];
    else mutableEnv[k] = v;
  }
});

describe("MFA key material — production strength (F-NEW-1)", () => {
  it("rejects the development placeholder in production", () => {
    expect(() => encryptWith(undefined, "production")).toThrow(/required in production/i);
  });

  it("rejects an empty key in production", () => {
    expect(() => encryptWith("", "production")).toThrow(/required in production|at least 32 characters/i);
  });

  it("rejects a short key in production", () => {
    expect(() => encryptWith("tooshort", "production")).toThrow(/at least 32 characters/i);
  });

  it("rejects an all-zero key in production", () => {
    expect(() => encryptWith("0".repeat(64), "production")).toThrow(/all-zero/i);
  });

  it("rejects the published Health OS test fixture key in production", () => {
    expect(() => encryptWith(HEALTH_TEST_KEY_HEX, "production")).toThrow(/published test key/i);
  });

  it("accepts a 64-hex-character production key", () => {
    expect(encryptWith(STRONG_KEY, "production")).toMatch(/^v1:/);
  });

  it("never echoes the offending key material in the error", () => {
    const marker = "SUPER_DISTINCTIVE_WEAK_KEY";
    try {
      encryptWith(marker, "production");
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as Error).message).not.toContain(marker);
      expect((e as Error).message).toMatch(/at least 32 characters/i);
    }
  });

  it("still permits weak keys outside production so local development works", () => {
    expect(encryptWith("tooshort", "test")).toMatch(/^v1:/);
  });
});
