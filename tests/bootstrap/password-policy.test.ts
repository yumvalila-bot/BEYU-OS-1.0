import { describe, expect, it } from "vitest";
import { evaluateAdminPassword, ADMIN_PASSWORD_MIN_LENGTH } from "../../src/lib/bootstrap/password-policy";

describe("administrator password policy", () => {
  it("rejects the explicitly forbidden defaults", () => {
    for (const bad of ["admin", "password", "changeme", "BEYU123", "Password1234!"]) {
      expect(evaluateAdminPassword(bad).ok, bad).toBe(false);
    }
  });

  it("rejects passwords shorter than the minimum", () => {
    const short = "Aa1!aaaa"; // 8 chars
    expect(short.length).toBeLessThan(ADMIN_PASSWORD_MIN_LENGTH);
    expect(evaluateAdminPassword(short).ok).toBe(false);
  });

  it("rejects low character-class diversity", () => {
    expect(evaluateAdminPassword("aaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
  });

  it("rejects passwords containing the email local-part", () => {
    const r = evaluateAdminPassword("Zx9!ownerlongsuffix", "owner@beyu.os");
    expect(r.ok).toBe(false);
  });

  it("rejects long single-character runs", () => {
    expect(evaluateAdminPassword("Zx9!aaaaQwErTyUiOp").ok).toBe(false);
  });

  it("accepts a strong, diverse passphrase", () => {
    const r = evaluateAdminPassword("Tr0ub4dour&3xplorer-Vault");
    expect(r.ok).toBe(true);
  });

  it("returns reasons, never the password itself", () => {
    const r = evaluateAdminPassword("short");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reasons.join(" ")).not.toContain("short");
  });
});
