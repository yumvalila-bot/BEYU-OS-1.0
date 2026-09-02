/**
 * Smoke: AppModule boots with PGlite override (no real PG required),
 * demonstrating that global DI wiring (AuditService/TenantContext/etc.) is
 * complete.
 */
import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any
const request: any = require("supertest");
import { buildE2EHarness, E2EHarness } from "../../common/testing/e2e-harness";

describe("AppModule boot (E2E smoke)", () => {
  let h: E2EHarness;
  beforeAll(async () => {
    h = await buildE2EHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it("GET /health/live returns 200 without secrets", async () => {
    const r = await request(h.app.getHttpServer()).get("/health/live");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|password|token/i);
  });

  it("GET /health/ready returns structured JSON (503 when optional infra missing is acceptable)", async () => {
    const r = await request(h.app.getHttpServer()).get("/health/ready");
    expect([200, 503]).toContain(r.status);
    expect(r.body.status).toBeDefined();
  });

  it("GET /api/patients without JWT is rejected (401)", async () => {
    const r = await request(h.app.getHttpServer()).get("/api/patients");
    expect([401, 403]).toContain(r.status);
  });
});
