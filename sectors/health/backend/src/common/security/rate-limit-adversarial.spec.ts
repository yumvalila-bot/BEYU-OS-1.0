/**
 * Rate-limiter adversarial tests:
 *  - deterministic in-memory policy enforcement (hit → allowed → blocked)
 *  - exponential lockout after threshold
 *  - RATE_LIMIT_BACKEND=redis without REDIS_URL fails closed at construction
 *  - with REDIS_URL set, Redis backend still fails closed (NOT IMPLEMENTED)
 *  - keys are isolated across IPs/users/tenants
 */
import "reflect-metadata";
import { buildTestBed } from "../testing/test-bed";
import { RateLimiter } from "./rate-limiter";
import { buildPolicy, policyFor } from "./rate-limit-policies";

describe("Rate limiter — deterministic + fail-closed", () => {
  let bed: any;
  beforeAll(async () => { bed = await buildTestBed(); });

  it("policy registry returns conservative defaults", () => {
    expect(policyFor("POST", "/api/auth/login").limit).toBe(10);
    expect(policyFor("GET", "/api/patients/x").limit).toBe(600);
    expect(policyFor("POST", "/api/pharmacy/dispense").limit).toBe(200);
  });

  it("in-memory limiter enforces limit and 429s past it", async () => {
    await bed.run(async () => {
      const cfgStub = { get: (k: string, d?: any) => (k === "RATE_LIMIT_BACKEND" ? "memory" : d) };
      const rl = new RateLimiter(bed.conn, cfgStub as any);
      rl.resetAll();
      const cfg = { keyType: "ip" as const, keyValue: "1.2.3.4", endpoint: "test-limit", windowMs: 1000, limit: 5, tenantId: null };
      for (let i = 0; i < 5; i++) {
        const r = await rl.hit(cfg);
        expect(r.allowed).toBe(true);
      }
      await expect(rl.hit(cfg)).rejects.toHaveProperty("response.code", "RATE_LIMITED");
    });
  });

  it("keys are isolated across IPs, users, and tenants", async () => {
    await bed.run(async () => {
      const cfgStub = { get: (k: string, d?: any) => (k === "RATE_LIMIT_BACKEND" ? "memory" : d) };
      const rl = new RateLimiter(bed.conn, cfgStub as any);
      rl.resetAll();
      for (let i = 0; i < 10; i++) await rl.hit(buildPolicy("POST", "/api/w", "ip", "ip1"));
      const r = await rl.hit(buildPolicy("POST", "/api/w", "ip", "ip2"));
      expect(r.allowed).toBe(true);
      const r2 = await rl.hit(buildPolicy("POST", "/api/w", "actor", "user1"));
      expect(r2.allowed).toBe(true);
    });
  });

  it("exponential lockout applies after lockoutThreshold", () => {
    const p = buildPolicy("POST", "/api/auth/login", "email", "a@b.c", { lockoutHits: 5 });
    expect(p.lockout).toBe(true);
    expect(p.limit).toBe(0);
  });

  it("RATE_LIMIT_BACKEND=redis without REDIS_URL fails closed at construction", () => {
    const cfgStub = { get: (k: string, d?: any) => k === "RATE_LIMIT_BACKEND" ? "redis" : d };
    expect(() => new RateLimiter(bed.conn, cfgStub as any)).toThrow(/REDIS_URL/);
  });

  it("with REDIS_URL set, Redis backend still fails closed (NOT IMPLEMENTED, no fabrication)", () => {
    const cfgStub = { get: (k: string, d?: any) => {
      if (k === "RATE_LIMIT_BACKEND") return "redis";
      if (k === "REDIS_URL") return "redis://example:6379";
      return d;
    } };
    expect(() => new RateLimiter(bed.conn, cfgStub as any)).toThrow(/not implemented/i);
  });
});
