import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bootstrapSecretState,
  isBootstrapSecretConfigured,
  verifyBootstrapSecret,
  bootstrapSecretFingerprint,
  BOOTSTRAP_SECRET_MIN_LENGTH,
} from "../../src/lib/bootstrap/secret";

const STRONG = "x9Q2".repeat(10); // 40 chars, high entropy enough for tests

describe("bootstrap authorization secret", () => {
  const saved = process.env.BEYU_BOOTSTRAP_SECRET;
  const savedEnv = process.env.BEYU_ENV;
  const savedNode = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.BEYU_BOOTSTRAP_SECRET;
    delete process.env.BEYU_ENV;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.BEYU_BOOTSTRAP_SECRET;
    else process.env.BEYU_BOOTSTRAP_SECRET = saved;
    if (savedEnv === undefined) delete process.env.BEYU_ENV;
    else process.env.BEYU_ENV = savedEnv;
    (process.env as Record<string, string | undefined>).NODE_ENV = savedNode;
  });

  it("reports MISSING when unset", () => {
    expect(bootstrapSecretState()).toEqual({ configured: false, reason: "MISSING" });
    expect(isBootstrapSecretConfigured()).toBe(false);
    expect(verifyBootstrapSecret("anything")).toBe(false);
    expect(bootstrapSecretFingerprint()).toBeNull();
  });

  it("reports TOO_SHORT below the minimum length", () => {
    process.env.BEYU_BOOTSTRAP_SECRET = "a".repeat(BOOTSTRAP_SECRET_MIN_LENGTH - 1);
    expect(bootstrapSecretState()).toEqual({ configured: false, reason: "TOO_SHORT" });
  });

  it("rejects placeholder-looking secrets in production", () => {
    process.env.BEYU_ENV = "production";
    process.env.BEYU_BOOTSTRAP_SECRET = "CHANGE_ME_" + "a".repeat(40);
    expect(bootstrapSecretState()).toEqual({ configured: false, reason: "PLACEHOLDER" });
  });

  it("verifies the correct secret in constant time and rejects others", () => {
    process.env.BEYU_BOOTSTRAP_SECRET = STRONG;
    expect(isBootstrapSecretConfigured()).toBe(true);
    expect(verifyBootstrapSecret(STRONG)).toBe(true);
    expect(verifyBootstrapSecret(STRONG + "x")).toBe(false);
    expect(verifyBootstrapSecret("")).toBe(false);
    expect(verifyBootstrapSecret("wrong")).toBe(false);
  });

  it("produces a stable, non-reversible fingerprint", () => {
    process.env.BEYU_BOOTSTRAP_SECRET = STRONG;
    const fp = bootstrapSecretFingerprint();
    expect(fp).toBeTruthy();
    expect(fp).not.toContain(STRONG);
    expect(bootstrapSecretFingerprint()).toBe(fp);
  });
});
