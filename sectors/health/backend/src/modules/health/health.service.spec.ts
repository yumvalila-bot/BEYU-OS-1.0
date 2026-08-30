import { describe, it, expect } from "@jest/globals";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";
import { createTestDbConnection } from "../identity/test-connection";

describe("HealthService", () => {
  it("liveness never depends on the database", async () => {
    // A connection whose query always fails still reports liveness.
    const broken: any = {
      query: async () => {
        throw new Error("db down");
      },
    };
    const svc = new HealthService(broken);
    await expect(svc.checkLiveness()).resolves.toMatchObject({
      status: "alive",
    });
  });

  it("readiness is ready when the database is reachable", async () => {
    const conn = await createTestDbConnection();
    const svc = new HealthService(conn);
    const res = await svc.checkReadiness();
    expect(res.status).toBe("ready");
    expect(res.checks).toEqual({ database: "up" });
    await conn.close();
  });

  it("readiness fails closed (503) when the database is unreachable", async () => {
    const broken: any = {
      query: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    };
    const svc = new HealthService(broken);
    await expect(svc.checkReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("does not leak secrets in readiness output", async () => {
    const conn = await createTestDbConnection();
    const svc = new HealthService(conn);
    const raw = await svc.checkReadiness();
    const json = JSON.stringify(raw);
    expect(json).not.toMatch(/password|token|secret|DATABASE_URL/i);
    await conn.close();
  });
});
