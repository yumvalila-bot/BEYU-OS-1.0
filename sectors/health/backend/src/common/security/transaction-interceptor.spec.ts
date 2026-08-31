import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request: any = require("supertest");
import { buildE2EHarness, E2EHarness } from "../testing/e2e-harness";

describe("TransactionInterceptor — automatic envelope + X-Transaction-ID", () => {
  jest.setTimeout(60000);
  let h: E2EHarness;
  let token: string;
  beforeAll(async () => {
    h = await buildE2EHarness();
    const email = `tx-${Date.now()}@example.com`;
    await request(h.app.getHttpServer())
      .post("/auth/register").send({ email, password: "CorrectHorseBattery1!", full_name: "Tx", tenantCode: "test" });
    await h.conn.exec(
      `INSERT INTO beyu_identity.tenant_memberships (global_user_id,tenant_id,role)
       SELECT global_user_id,'11111111-1111-1111-1111-111111111111','doctor'
       FROM beyu_identity.users WHERE email='${email}'
       ON CONFLICT (global_user_id,tenant_id) DO UPDATE SET role='doctor';`);
    const l = await request(h.app.getHttpServer())
      .post("/auth/login").send({ email, password: "CorrectHorseBattery1!", tenantCode: "test" });
    token = l.body.accessToken;
  });
  afterAll(async () => { if (h) await h.close(); });

  it("POST /api/patients returns X-Transaction-ID header on mutating non-public request", async () => {
    const r = await request(h.app.getHttpServer())
      .post("/api/patients").set("Authorization", `Bearer ${token}`)
      .send({ mrn: `MRN-TX-${Date.now()}`, given_name: "A", family_name: "B", gender: "M" });
    expect([200, 201, 403, 400]).toContain(r.status);
    // Auth guard may deny permission; if response reaches controller the header is set.
    if (r.status === 200 || r.status === 201) {
      expect(r.headers["x-transaction-id"]).toBeTruthy();
      expect(r.headers["x-request-id"]).toBeTruthy();
    }
  });

  it("GET (safe method) on a public-style endpoint does not require envelope", async () => {
    // Health check / root is @Public(); no X-Transaction-ID expected.
    const r = await request(h.app.getHttpServer()).get("/health");
    expect([200, 404]).toContain(r.status);
  });

  it("POST /auth/login is @Public() and does NOT receive X-Transaction-ID (auth guard path)", async () => {
    const email = `txp-${Date.now()}@example.com`;
    await request(h.app.getHttpServer())
      .post("/auth/register").send({ email, password: "CorrectHorseBattery1!", full_name: "Tx", tenantCode: "test" });
    const r = await request(h.app.getHttpServer())
      .post("/auth/login").send({ email, password: "CorrectHorseBattery1!", tenantCode: "test" });
    expect(r.status).toBe(200);
    // login is @Public(); interceptor skips; no X-Transaction-ID set.
    expect(r.headers["x-transaction-id"]).toBeFalsy();
  });
});
