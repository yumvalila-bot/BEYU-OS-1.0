/**
 * Health Migration Fingerprint — Cross-System Compatibility Test.
 *
 * Proves that the Health migration fingerprint computation is compatible
 * with the root BEYU OS fingerprint convention:
 *
 *   sha256( ordered checksums joined by "\n" )
 *
 * This is critical for PVG integration: the root PVG must be able to
 * verify the Health migration ledger fingerprint using the SAME algorithm.
 *
 * SECURITY NOTE
 * ─────────────
 * A fingerprint is EVIDENCE, never authority. It proves that the committed
 * migration set has not been silently altered; it grants nothing.
 */
import { describe, it, expect } from "@jest/globals";
import { createHash } from "node:crypto";
import { computeFingerprint, FINGERPRINT_JOIN } from "./migration-governance";

describe("Health Migration Fingerprint — Convention Compatibility", () => {
  it("uses newline as the join separator (matches root convention)", () => {
    expect(FINGERPRINT_JOIN).toBe("\n");
  });

  it("fingerprint algorithm matches root sha256(string_agg(checksum, '\n' order by version))", () => {
    // Simulate what the root PVG does:
    //   string_agg(checksum, '\n' order by version)
    //   then sha256 of the result.
    const checksums = ["aaa111", "bbb222", "ccc333"];
    const joined = checksums.join("\n");
    const expected = createHash("sha256").update(joined).digest("hex");

    const actual = computeFingerprint(checksums);
    expect(actual).toBe(expected);
  });

  it("empty checksum list returns null (matches root SQL string_agg over zero rows)", () => {
    // Root SQL: string_agg over zero rows returns NULL, never a hash of "".
    expect(computeFingerprint([])).toBeNull();
  });

  it("fingerprint is exactly 64 hex characters (sha256)", () => {
    const fp = computeFingerprint(["test1", "test2"]);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("single checksum fingerprint is deterministic", () => {
    const fp1 = computeFingerprint(["only-one"]);
    const fp2 = computeFingerprint(["only-one"]);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("adding a migration changes the fingerprint", () => {
    const fp1 = computeFingerprint(["a", "b"]);
    const fp2 = computeFingerprint(["a", "b", "c"]);
    expect(fp1).not.toBe(fp2);
  });

  it("modifying a checksum changes the fingerprint", () => {
    const fp1 = computeFingerprint(["a", "b", "c"]);
    const fp2 = computeFingerprint(["a", "b", "CHANGED"]);
    expect(fp1).not.toBe(fp2);
  });

  it("reordering checksums changes the fingerprint", () => {
    const fp1 = computeFingerprint(["a", "b", "c"]);
    const fp2 = computeFingerprint(["c", "b", "a"]);
    expect(fp1).not.toBe(fp2);
  });
});
