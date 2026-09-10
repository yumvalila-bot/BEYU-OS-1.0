/**
 * /api/health — real-PostgreSQL integration.
 *
 * Drives the REAL route handler through the REAL canonical pool against a
 * live PostgreSQL (CI service container, embedded pg16, or any DATABASE_URL
 * the environment provisions). Skips cleanly when no DATABASE_URL exists, so
 * contributors without a database still get a green suite.
 *
 *   1. healthy database  -> 200, database UP (genuine `select 1`)
 *   2. unresolvable host -> 503 with a sanitized DNS classification, no leak
 *
 * The suite never touches application tables: the liveness probe is `select 1`
 * only, so no migration or seed state is required to run it.
 *
 * MODULE HYGIENE. `src/db/index.ts` caches its pool in BOTH a module-closure
 * variable and a `globalThis` key. Each test therefore loads a FRESH route
 * module (`vi.resetModules()` + dynamic import) after setting its own
 * DATABASE_URL, and ends + clears the cached pool afterwards — otherwise the
 * first test's healthy pool would leak into the failure test.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DATABASE_HEALTH_CLASSIFICATIONS } from "@/lib/db-health";

const POOL_CACHE_KEY = "__arenaNextJsPostgresqlPool";

async function endAndClearCachedPool(): Promise<void> {
  const cached = (globalThis as Record<string, unknown>)[POOL_CACHE_KEY] as
    | { end?: () => Promise<void> }
    | undefined;
  delete (globalThis as Record<string, unknown>)[POOL_CACHE_KEY];
  await cached?.end?.().catch(() => undefined);
}

async function freshHealthGet(): Promise<() => Promise<Response>> {
  vi.resetModules();
  await endAndClearCachedPool();
  const mod = await import("@/app/api/health/route");
  return mod.GET as () => Promise<Response>;
}

const available = Boolean(process.env.DATABASE_URL);
let savedUrl: string | undefined;

beforeAll(() => {
  savedUrl = process.env.DATABASE_URL;
});

afterAll(async () => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
  await endAndClearCachedPool();
  vi.resetModules();
});

describe.skipIf(!available)("api/health real-postgres integration", () => {
  it("healthy database -> 200 with database UP", async () => {
    const healthGet = await freshHealthGet();
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; checks: { database: string } };
    expect(body.ok).toBe(true);
    expect(body.checks.database).toBe("UP");
    await endAndClearCachedPool();
  });

  it("unresolvable host -> 503 with a sanitized classification and no leak", async () => {
    const sentinel = "SENTINEL-INTEGRATION-NOT-A-SECRET-0010";
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const previous = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL =
        `postgresql://beyu_runtime:${sentinel}@nonexistent-SENTINEL-0010.invalid:6543/postgres?sslmode=verify-full`;
      const healthGet = await freshHealthGet();
      const res = await healthGet();
      expect(res.status).toBe(503);
      const body = (await res.json()) as { ok: boolean; checks: { database: string }; reason: string };
      expect(body.ok).toBe(false);
      expect(body.checks.database).toBe("DOWN");
      expect(body.reason).toBe("DATABASE_DNS_FAILURE");
      expect(DATABASE_HEALTH_CLASSIFICATIONS).toContain(body.reason);
      const responseText = JSON.stringify(body);
      expect(responseText).not.toContain(sentinel);
      expect(responseText).not.toContain("nonexistent-SENTINEL-0010");
      const logged = silence.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).not.toContain(sentinel);
      expect(logged).not.toContain("nonexistent-SENTINEL-0010");
    } finally {
      silence.mockRestore();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      await endAndClearCachedPool();
    }
  });
});
