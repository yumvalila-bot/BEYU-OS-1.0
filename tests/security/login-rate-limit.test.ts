/**
 * C-07 remediation — login rate-limiter bucket identity.
 *
 * Proves the limiter never collapses into a single global bucket, that one
 * principal cannot exhaust another's budget, that spoofed forwarding headers
 * cannot mint fresh buckets under an untrusted proxy, and that brute-force /
 * credential-stuffing protection remains in force under both trusted and
 * untrusted proxy environments.
 */
import { afterEach, describe, expect, it } from "vitest";
import { rateLimit } from "../../src/lib/api";
import { LOGIN_RATE_LIMIT, loginRateLimitKeys, trustedClientIp } from "../../src/lib/auth-limits";

afterEach(() => {
  delete process.env.BEYU_TRUST_PROXY;
});

describe("loginRateLimitKeys — bucket identity (C-07)", () => {
  it("distinct principals never share a bucket (attacker A cannot exhaust attacker B)", () => {
    const a = loginRateLimitKeys("203.0.113.5", "alice@beyu.os");
    const b = loginRateLimitKeys("203.0.113.5", "bob@beyu.os");
    // No shared key between the two principals.
    expect(a.some((k) => b.includes(k))).toBe(false);
  });

  it("same principal from different IPs share the per-account bucket (distributed-stuffing guard)", () => {
    const ip1 = loginRateLimitKeys("203.0.113.5", "alice@beyu.os");
    const ip2 = loginRateLimitKeys("198.51.100.7", "alice@beyu.os");
    const shared = ip1.filter((k) => ip2.includes(k));
    expect(shared).toEqual([`login:acct:alice@beyu.os`]);
  });

  it("missing IP (untrusted proxy) yields only the per-account bucket — never a global key", () => {
    const keys = loginRateLimitKeys(null, "alice@beyu.os");
    expect(keys).toEqual([`login:acct:alice@beyu.os`]);
  });

  it("trusted IP adds a distinct per-(IP,account) bucket", () => {
    const keys = loginRateLimitKeys("203.0.113.5", "alice@beyu.os");
    expect(keys).toContain(`login:ipacct:203.0.113.5:alice@beyu.os`);
    expect(keys).toContain(`login:acct:alice@beyu.os`);
  });

  it("email is normalized to lowercase — case variation cannot dodge the budget", () => {
    const upper = loginRateLimitKeys(null, "ALICE@BEYU.OS");
    const lower = loginRateLimitKeys(null, "alice@beyu.os");
    expect(upper).toEqual(lower);
  });
});

describe("trustedClientIp — proxy trust (C-07)", () => {
  it("untrusted proxy: X-Forwarded-For is IGNORED (cannot be spoofed to evade)", () => {
    delete process.env.BEYU_TRUST_PROXY;
    const h = new Headers({ "x-forwarded-for": "6.6.6.6" });
    expect(trustedClientIp(h)).toBeNull();
  });

  it("trusted proxy: uses the left-most X-Forwarded-For entry", () => {
    process.env.BEYU_TRUST_PROXY = "true";
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(trustedClientIp(h)).toBe("203.0.113.9");
  });

  it("trusted proxy with no header yields null (fail safe to per-account bucket)", () => {
    process.env.BEYU_TRUST_PROXY = "true";
    expect(trustedClientIp(new Headers())).toBeNull();
  });
});

describe("rateLimit — distinct keys are independent (C-07)", () => {
  // The rateLimit Map is module-global and persists across tests in the same
  // window, so each case uses a unique key to avoid cross-test interference.
  const unique = (tag: string) => `${tag}:${Date.now()}:${Math.random()}`;

  it("exhausting one principal's key does not exhaust another's", () => {
    const keyA = unique("login:acct:alice");
    const keyB = unique("login:acct:bob");
    const limit = 3;
    for (let i = 0; i < limit; i++) expect(rateLimit(keyA, limit, 60_000).ok).toBe(true);
    // keyA is now exhausted...
    expect(rateLimit(keyA, limit, 60_000).ok).toBe(false);
    // ...but keyB is untouched.
    expect(rateLimit(keyB, limit, 60_000).ok).toBe(true);
  });

  it("the per-account bucket remains the effective protection when no IP is available", () => {
    const key = unique("login:acct:alice");
    const limit = LOGIN_RATE_LIMIT.perAccount;
    // First `limit` attempts allowed.
    for (let i = 0; i < limit; i++) expect(rateLimit(key, limit, 60_000).ok).toBe(true);
    expect(rateLimit(key, limit, 60_000).ok).toBe(false);
  });

  it("a spoofed header cannot mint a fresh per-IP bucket under an untrusted proxy", () => {
    // Under an untrusted proxy there is NO per-IP key at all, so the only key an
    // attacker can burn is the shared per-account key. This is enforced because
    // the route derives keys via loginRateLimitKeys(null, email).
    delete process.env.BEYU_TRUST_PROXY;
    const keys = loginRateLimitKeys(trustedClientIp(new Headers({ "x-forwarded-for": "6.6.6.6" })), "alice@beyu.os");
    expect(keys).toEqual([`login:acct:alice@beyu.os`]);
  });
});
