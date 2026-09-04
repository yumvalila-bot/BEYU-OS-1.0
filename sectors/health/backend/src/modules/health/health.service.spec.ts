import { HealthService } from "./health.service";

function svc(
  overrides: {
    dbFail?: boolean;
    migrationRows?: any[];
    env?: Record<string, any>;
    adapters?: any[];
    outbox?: any;
  } = {},
) {
  const db = {
    query: async (q: string) => {
      if (overrides.dbFail) throw new Error("connection refused");
      if (/schema_migrations/.test(q))
        return (
          overrides.migrationRows ?? [
            { version: "015", applied_at: new Date() },
          ]
        );
      return [{ ok: 1 }];
    },
  } as any;
  const cfg = { get: (k: string) => overrides.env?.[k] ?? undefined } as any;
  const reg = { probeAll: async () => overrides.adapters ?? [] } as any;
  const metrics = {
    readiness: async () => overrides.outbox ?? { status: "up", detail: {} },
    snapshot: async () => ({
      governed_events: {},
      sync_adapters: {},
      dispatcher: {},
      timestamp: "",
    }),
  } as any;
  return new HealthService(db, cfg, reg, metrics);
}

describe("HealthService readiness", () => {
  it("liveness always returns alive", async () => {
    const s = svc({ dbFail: true });
    await expect(s.checkLiveness()).resolves.toMatchObject({ status: "alive" });
  });

  it("readiness throws when DB is down", async () => {
    const s = svc({ dbFail: true });
    await expect(s.checkReadiness()).rejects.toThrow();
  });

  it("readiness returns ready when DB up and config ok", async () => {
    const s = svc();
    const r = await s.checkReadiness();
    expect(r.status).toBe("ready");
    expect(r.checks.database.status).toBe("up");
  });

  it("production with default JWT_SECRET reports NOT_READY (critical config)", async () => {
    const s = svc({
      env: { NODE_ENV: "production", JWT_SECRET: "dev-only-change-me" },
    });
    await expect(s.checkReadiness()).rejects.toThrow();
  });
});
