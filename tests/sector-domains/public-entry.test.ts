import { describe, expect, it } from "vitest";
import { resolveCanonicalHost } from "@/lib/canonical-hosts";
import { canonicalSignInForHost, requestedEntryDestination, signInContinuation } from "@/lib/public-entry";

const options = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };

describe("canonical public entry routing", () => {
  it.each([
    ["health", "HEALTH"], ["finance", "FINANCE"], ["agriculture", "AGRICULTURE"],
    ["ujenzi", "UJENZI"], ["foundation", "FOUNDATION"], ["familyoffice", "FAMILY_OFFICE"], ["noelia", "NOELIA_AI"],
  ])("redirects the exact %s host to central sign-in with an allowlisted request", (host, code) => {
    const resolved = resolveCanonicalHost(`${host}.beyu.co.tz`, options);
    expect(canonicalSignInForHost(resolved, options.canonicalDomain)).toBe(`https://www.beyu.co.tz/sign-in?destination=${code}`);
    expect(requestedEntryDestination(code)?.context.code).toBe(code);
  });

  it.each(["evil.beyu.co.tz", "health.beyu.co.tz.evil.test", "health.beyu.co.tz@evil.test", "www.beyu.co.tz", "localhost", ""])(
    "does not redirect a neutral or untrusted host %s off-site", (host) => {
      expect(canonicalSignInForHost(resolveCanonicalHost(host, options), options.canonicalDomain)).toBe("/sign-in");
    },
  );

  it("does not turn arbitrary URLs, paths, duplicates, or unknown codes into a continuation", () => {
    for (const value of [undefined, "", "//evil.test", "https://evil.test", "/os/finance", "BEYU", "finance", ["FINANCE", "HEALTH"]]) {
      expect(requestedEntryDestination(value)).toBeNull();
      expect(signInContinuation(requestedEntryDestination(value))).toBe("/launcher");
    }
    expect(signInContinuation(requestedEntryDestination("FINANCE"))).toBe("/sign-in?destination=FINANCE");
  });

  it("does not use a development localhost destination to redirect to a configured apex", () => {
    const host = resolveCanonicalHost("health.localhost", { ...options, allowLocalhost: true });
    expect(canonicalSignInForHost(host, options.canonicalDomain)).toBe("/sign-in");
  });
});
