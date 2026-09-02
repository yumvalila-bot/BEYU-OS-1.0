import { RateLimiter } from "./rate-limiter";

/**
 * Adversarial tests for the in-memory rate limiter (Part C). Distributed Redis
 * backend is ARCHITECTURE-BLOCKED until a real REDIS_URL is provided; the limiter
 * refuses to boot in 'redis' mode without one.
 */
describe("RateLimiter (Part C)", () => {
  function build(): { rl: RateLimiter; db: any } {
    const db = { query: jest.fn().mockResolvedValue([] as any[]) };
    const cfg = {
      get: jest.fn((k: string) =>
        k === "RATE_LIMIT_BACKEND" ? "memory" : undefined,
      ),
    };
    return { rl: new RateLimiter(db as any, cfg as any), db };
  }

  afterEach(() => {
    // prevent timers from leaking
    jest.useRealTimers();
  });

  it("allows requests up to limit; blocks after", async () => {
    const { rl } = build();
    for (let i = 0; i < 5; i++) {
      const r = await rl.hit({
        keyType: "ip",
        keyValue: "1.2.3.4",
        endpoint: "/auth/login",
        windowMs: 60_000,
        limit: 5,
      });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(5 - i - 1);
    }
    await expect(
      rl.hit({
        keyType: "ip",
        keyValue: "1.2.3.4",
        endpoint: "/auth/login",
        windowMs: 60_000,
        limit: 5,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: "RATE_LIMITED" }),
    });
  });

  it("keys are isolated per ip/actor/endpoint/window", async () => {
    const { rl } = build();
    for (let i = 0; i < 5; i++) {
      await rl.hit({
        keyType: "ip",
        keyValue: "1.2.3.4",
        endpoint: "/auth/login",
        windowMs: 60_000,
        limit: 5,
      });
    }
    // Different IP should pass.
    const r = await rl.hit({
      keyType: "ip",
      keyValue: "9.9.9.9",
      endpoint: "/auth/login",
      windowMs: 60_000,
      limit: 5,
    });
    expect(r.allowed).toBe(true);
    // Same IP different endpoint should pass.
    const r2 = await rl.hit({
      keyType: "ip",
      keyValue: "1.2.3.4",
      endpoint: "/auth/mfa",
      windowMs: 60_000,
      limit: 5,
    });
    expect(r2.allowed).toBe(true);
  });

  it("redis backend refuses to boot without REDIS_URL", () => {
    const db = { query: jest.fn() };
    const cfg = {
      get: jest.fn((k: string) =>
        k === "RATE_LIMIT_BACKEND" ? "redis" : undefined,
      ),
    };
    expect(() => new RateLimiter(db as any, cfg as any)).toThrow(/REDIS_URL/);
  });
});
