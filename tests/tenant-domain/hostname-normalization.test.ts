/**
 * Hostname normalisation, tenant-slug derivation and DNS challenge proof.
 *
 * Pure unit coverage of the ONE canonical normaliser plus the DNS verification
 * primitive: every case here is a fail-closed decision that the request path
 * depends on, and every case is asserted without a database or a network so the
 * boundary cannot drift silently.
 */
import { describe, expect, it } from "vitest";
import {
  challengeValueHash,
  constantTimeEquals,
  dnsChallengeRecordName,
  dnsChallengeRecordValue,
  generateChallenge,
  isReservedLabel,
  isWithinNamespace,
  normalizeHostname,
  tenantSlugForCode,
  verifyDnsTxtChallenge,
} from "../../src/lib/tenant-domain";

describe("hostname normalisation", () => {
  it("accepts and canonicalises real host forms", () => {
    const cases: Array<[string, string]> = [
      ["health.beyuos.co.tz", "health.beyuos.co.tz"],
      ["Health.BEYUOS.co.tz", "health.beyuos.co.tz"],
      // Surrounding whitespace is stripped before validation: a Host value can
      // only ever be mapped to the EXACT registered name (and a registered name
      // still has to be ACTIVE + VERIFIED + in scope before it resolves).
      ["  health.beyuos.co.tz  ", "health.beyuos.co.tz"],
      ["health.beyuos.co.tz\t", "health.beyuos.co.tz"],
      ["health.beyuos.co.tz:443", "health.beyuos.co.tz"],
      ["health.beyuos.co.tz.", "health.beyuos.co.tz"],
      ["mwanza.health.beyuos.co.tz", "mwanza.health.beyuos.co.tz"],
      ["clinic-a.health.beyuos.co.tz", "clinic-a.health.beyuos.co.tz"],
      ["beyu-os-1-0.vercel.app", "beyu-os-1-0.vercel.app"],
    ];
    for (const [input, expected] of cases) {
      const result = normalizeHostname(input);
      expect(result, input).toEqual({ ok: true, hostname: expected, scope: "HOSTNAME" });
    }
  });

  it("classifies the local execution hosts", () => {
    for (const input of ["localhost", "LOCALHOST", "localhost:3100", "127.0.0.1", "127.0.0.1:3100"]) {
      const result = normalizeHostname(input);
      expect(result.ok, input).toBe(true);
      if (result.ok) expect(result.scope).toBe("LOCAL");
    }
  });

  it("rejects anything that is not a DNS hostname", () => {
    const malformed = [
      "http://health.beyuos.co.tz",
      "https://health.beyuos.co.tz/os/health",
      "health.beyuos.co.tz/os/health",
      "health.beyuos.co.tz..",
      ".health.beyuos.co.tz",
      "*.health.beyuos.co.tz",
      "_dmarc.health.beyuos.co.tz",
      "health_beyu.beyuos.co.tz",
      "héalth.beyuos.co.tz",
      "health.beyuos.co.tz@evil.com",
      "user:pass@health.beyuos.co.tz",
      `${"a".repeat(64)}.beyuos.co.tz`,
      `${"a.".repeat(130)}co.tz`,
      "health.beyuos.co.tz\x00",
      "health.beyuos.co.tz\nmwanza",
    ];
    for (const input of malformed) {
      const result = normalizeHostname(input);
      expect(result.ok, input).toBe(false);
      if (!result.ok) expect(["MALFORMED", "IP_LITERAL"]).toContain(result.reason);
    }
  });

  it("refuses IP literals and bare labels", () => {
    expect(normalizeHostname("10.0.0.5")).toEqual({ ok: false, reason: "IP_LITERAL" });
    expect(normalizeHostname("[::1]")).toEqual({ ok: false, reason: "IP_LITERAL" });
    expect(normalizeHostname("health")).toEqual({ ok: false, reason: "SINGLE_LABEL" });
    expect(normalizeHostname("")).toEqual({ ok: false, reason: "ABSENT" });
    expect(normalizeHostname(null)).toEqual({ ok: false, reason: "ABSENT" });
    expect(normalizeHostname(undefined)).toEqual({ ok: false, reason: "ABSENT" });
  });

  it("keeps namespaces strict (never the base itself)", () => {
    expect(isWithinNamespace("mwanza.health.beyuos.co.tz", "health.beyuos.co.tz")).toBe(true);
    expect(isWithinNamespace("health.beyuos.co.tz", "health.beyuos.co.tz")).toBe(false);
    expect(isWithinNamespace("evilhealth.beyuos.co.tz", "health.beyuos.co.tz")).toBe(false);
    expect(isWithinNamespace("health.beyuos.co.tz.evil.com", "health.beyuos.co.tz")).toBe(false);
  });

  it("derives canonical slugs and refuses impossible ones", () => {
    expect(tenantSlugForCode("BEYU-HEALTH")).toBe("beyu-health");
    expect(tenantSlugForCode("BEYU_HEALTH_MWANZA")).toBe("beyu-health-mwanza");
    expect(tenantSlugForCode("  Beyu Health  ")).toBe("beyu-health");
    expect(tenantSlugForCode("-")).toBeNull();
    expect(tenantSlugForCode("")).toBeNull();
    expect(tenantSlugForCode("a".repeat(64))).toBeNull();
    for (const label of ["www", "mail", "ns", "www"]) expect(isReservedLabel(label)).toBe(true);
    expect(isReservedLabel("mwanza")).toBe(false);
  });
});

describe("DNS TXT challenge", () => {
  const host = "mwanza.health.beyuos.co.tz";

  it("builds the canonical challenge record", () => {
    expect(dnsChallengeRecordName(host)).toBe("_beyu-domain-verification.mwanza.health.beyuos.co.tz");
    expect(dnsChallengeRecordValue("abc123")).toBe("beyu-domain-verification=abc123");
    expect(generateChallenge()).toMatch(/^[0-9a-f]{64}$/);
    expect(generateChallenge()).not.toBe(generateChallenge());
  });

  it("verifies only a matching published value", async () => {
    const challenge = generateChallenge();
    const stored = challengeValueHash(dnsChallengeRecordValue(challenge));

    const match = await verifyDnsTxtChallenge(host, stored, async () => [dnsChallengeRecordValue(challenge)]);
    expect(match).toEqual({ verified: true, reason: "MATCH", observedRecords: 1 });

    const amongOthers = await verifyDnsTxtChallenge(host, stored, async () => [
      "v=spf1 -all",
      dnsChallengeRecordValue(challenge),
      "google-site-verification=xyz",
    ]);
    expect(amongOthers.verified).toBe(true);
  });

  it("fails closed on every non-match, empty answer and resolver failure", async () => {
    const challenge = generateChallenge();
    const stored = challengeValueHash(dnsChallengeRecordValue(challenge));

    expect(await verifyDnsTxtChallenge(host, stored, async () => [])).toEqual({
      verified: false,
      reason: "NO_RECORDS",
      observedRecords: 0,
    });
    expect(
      await verifyDnsTxtChallenge(host, stored, async () => [dnsChallengeRecordValue(generateChallenge())]),
    ).toMatchObject({ verified: false, reason: "NO_MATCH" });
    expect(await verifyDnsTxtChallenge(host, stored, async () => ["v=spf1 -all"])).toMatchObject({
      verified: false,
      reason: "NO_MATCH",
    });
    expect(
      await verifyDnsTxtChallenge(host, stored, async () => {
        throw new Error("ENOTFOUND");
      }),
    ).toEqual({ verified: false, reason: "LOOKUP_FAILED", observedRecords: 0 });
  });

  it("compares digests in constant time", () => {
    expect(constantTimeEquals("a", "a")).toBe(true);
    expect(constantTimeEquals("a", "b")).toBe(false);
    expect(constantTimeEquals("", "a")).toBe(false);
    expect(challengeValueHash(" x ")).toBe(challengeValueHash("x"));
  });
});
