import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, generateTotpCode, generateTotpSecret, verifyTotp } from "../../src/lib/mfa";

describe("C-04 real TOTP MFA", () => {
  it("rejects 000000 and random six-digit values", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp({ secret, code: "000000" }).ok).toBe(false);
    expect(verifyTotp({ secret, code: "123456" }).ok).toBe(false);
  });

  it("accepts a valid generated TOTP", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(verifyTotp({ secret, code }).ok).toBe(true);
  });

  it("rejects expired codes outside clock tolerance", () => {
    const secret = generateTotpSecret();
    const old = Date.now() - 10 * 60_000;
    const code = generateTotpCode(secret, old);
    expect(verifyTotp({ secret, code, at: Date.now(), window: 1 }).ok).toBe(false);
  });

  it("rejects replay of an already accepted TOTP step", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);
    const first = verifyTotp({ secret, code, at: now });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(verifyTotp({ secret, code, at: now, lastAcceptedStep: first.step })).toEqual({ ok: false, reason: "REPLAY" });
  });

  it("protects TOTP secrets at rest", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });
});
