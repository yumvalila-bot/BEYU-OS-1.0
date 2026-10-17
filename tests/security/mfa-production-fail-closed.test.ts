/**
 * P2 — MFA key material fails closed in production by an EXPLICIT rule.
 *
 * Production never reads the development literal. A missing key is refused
 * before any fallback is considered, so no derived key can be predictable from
 * source. Pure unit tests: no database, no server.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/mfa";

const KEYS = ["MFA_ENCRYPTION_KEY", "AUTH_SECRET", "NODE_ENV", "BEYU_ENV"] as const;
const env = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

function runtime(mode: "production" | "development", key?: string): void {
  env.NODE_ENV = mode;
  env.BEYU_ENV = mode;
  delete env.MFA_ENCRYPTION_KEY;
  delete env.AUTH_SECRET;
  if (key !== undefined) env.MFA_ENCRYPTION_KEY = key;
}

describe("MFA key material — explicit production fail-closed rule (P2)", () => {
  it("refuses to encrypt in production when no key is configured", () => {
    runtime("production");
    expect(() => encryptSecret("JBSWY3DPEHPK3PXP")).toThrow(/required in production/);
  });

  it("refuses to decrypt in production when no key is configured", () => {
    runtime("development", "a".repeat(64));
    const cipher = encryptSecret("JBSWY3DPEHPK3PXP");
    runtime("production");
    expect(() => decryptSecret(cipher)).toThrow(/required in production/);
  });

  it("refuses an empty configured key in production instead of falling through", () => {
    runtime("production");
    env.MFA_ENCRYPTION_KEY = "";
    expect(() => encryptSecret("JBSWY3DPEHPK3PXP")).toThrow(/required in production|at least 32 characters/i);
  });

  it("round-trips in production with a configured, non-fixture key", () => {
    runtime("production", "f1".repeat(32));
    const cipher = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(cipher)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("keeps local development working without any configured key", () => {
    runtime("development");
    const cipher = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(cipher)).toBe("JBSWY3DPEHPK3PXP");
  });
});
