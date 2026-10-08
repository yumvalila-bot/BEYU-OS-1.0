/**
 * Session cookie policy across the canonical BEYU hosts (pure).
 *
 * The cookie is host-only unless the deployment opts in to sharing across the
 * canonical apex, and even then only for requests under that apex. Logout
 * clears every variant that could have been issued for the request host.
 */
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/constants";
import {
  sessionCookieAttributes,
  sessionCookieClearTargets,
  sessionCookieDomain,
  sessionSharedAcrossCanonicalDomain,
} from "@/lib/session-cookie";

const SHARED = { NODE_ENV: "production", BEYU_CANONICAL_DOMAIN: "beyu.co.tz", BEYU_SESSION_COOKIE_DOMAIN: "beyu.co.tz" };
const ROUTING_ONLY = { NODE_ENV: "production", BEYU_CANONICAL_DOMAIN: "beyu.co.tz" };
const UNCONFIGURED = { NODE_ENV: "production" };
const DEV = { NODE_ENV: "development" };

describe("default (unconfigured) behaviour is unchanged", () => {
  it("issues a host-only, httpOnly, lax cookie — secure in production, not in development", () => {
    expect(sessionCookieAttributes("www.beyu.co.tz", UNCONFIGURED)).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(sessionCookieAttributes("localhost:3000", DEV)).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    expect(sessionCookieAttributes("localhost:3000", { ...DEV, BEYU_ENV: "production" }).secure).toBe(true);
    expect(sessionSharedAcrossCanonicalDomain(UNCONFIGURED)).toBe(false);
  });

  it("does not broaden the cookie merely because routing is configured", () => {
    expect(sessionCookieDomain("www.beyu.co.tz", ROUTING_ONLY)).toBeUndefined();
    expect(sessionCookieDomain("health.beyu.co.tz", ROUTING_ONLY)).toBeUndefined();
    expect(sessionSharedAcrossCanonicalDomain(ROUTING_ONLY)).toBe(false);
  });

  it("clears exactly the host-only cookie when nothing is shared", () => {
    expect(sessionCookieClearTargets("www.beyu.co.tz", ROUTING_ONLY)).toEqual([{ name: SESSION_COOKIE, path: "/" }]);
  });
});

describe("opt-in sharing across the canonical apex", () => {
  it("scopes the cookie to the apex for the apex, www and every canonical sector host, forcing Secure", () => {
    for (const host of ["beyu.co.tz", "www.beyu.co.tz", "health.beyu.co.tz", "finance.beyu.co.tz", "agriculture.beyu.co.tz", "ujenzi.beyu.co.tz", "HEALTH.beyu.co.tz:443"]) {
      expect(sessionCookieDomain(host, SHARED), host).toBe("beyu.co.tz");
      expect(sessionCookieAttributes(host, { ...SHARED, NODE_ENV: "development" })).toEqual({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        domain: "beyu.co.tz",
      });
    }
    expect(sessionSharedAcrossCanonicalDomain(SHARED)).toBe(true);
  });

  it("never issues a domain cookie for a request outside the apex (preview, localhost, IP, foreign, malformed)", () => {
    for (const host of [
      "beyu-os.vercel.app",
      "localhost:3000",
      "127.0.0.1:3100",
      "beyu.co.tz.evil.example",
      "evilbeyu.co.tz",
      "https://www.beyu.co.tz",
      "",
      null,
      undefined,
    ]) {
      expect(sessionCookieDomain(host, SHARED), String(host)).toBeUndefined();
      expect(sessionCookieAttributes(host, SHARED).domain).toBeUndefined();
    }
  });

  it("refuses a cookie domain that is not exactly the canonical domain", () => {
    expect(sessionCookieDomain("www.beyu.co.tz", { ...SHARED, BEYU_SESSION_COOKIE_DOMAIN: "co.tz" })).toBeUndefined();
    expect(sessionCookieDomain("www.beyu.co.tz", { ...SHARED, BEYU_SESSION_COOKIE_DOMAIN: "evil.example" })).toBeUndefined();
    expect(sessionCookieDomain("www.beyu.co.tz", { ...SHARED, BEYU_SESSION_COOKIE_DOMAIN: ".beyu.co.tz" })).toBeUndefined();
    expect(sessionCookieDomain("www.beyu.co.tz", { ...SHARED, BEYU_CANONICAL_DOMAIN: undefined })).toBeUndefined();
    expect(sessionCookieDomain("www.beyu.co.tz", { ...SHARED, BEYU_SESSION_COOKIE_DOMAIN: "localhost" })).toBeUndefined();
  });

  it("clears both the host-only and the domain-scoped variant on logout", () => {
    expect(sessionCookieClearTargets("health.beyu.co.tz", SHARED)).toEqual([
      { name: SESSION_COOKIE, path: "/" },
      { name: SESSION_COOKIE, path: "/", domain: "beyu.co.tz" },
    ]);
    expect(sessionCookieClearTargets("beyu-os.vercel.app", SHARED)).toEqual([{ name: SESSION_COOKIE, path: "/" }]);
  });
});
