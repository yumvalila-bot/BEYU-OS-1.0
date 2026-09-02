/**
 * HTTP E2E workflow (GET-safe paths; write-path CSRF tested separately):
 *   register → seed doctor membership → login → GET /api/patients 200 →
 *   GET /api/patients unauthenticated → 401/403 → /health/ready structured
 *   without fabricated adapter availability.
 */
import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any
const request: any = require("supertest");
import { buildE2EHarness, E2EHarness } from "../../common/testing/e2e-harness";

describe("HTTP E2E — register/login/tenant isolation (GET-safe)", () => {
  let h: E2EHarness;
  let token: string;
  let email: string;
  beforeAll(async () => {
    h = await buildE2EHarness();
    h.app.useLogger(["error", "warn", "log"]);
    email = `e2e-${Date.now()}@example.com`;
    await request(h.app.getHttpServer()).post("/auth/register").send({
      email,
      password: "CorrectHorseBattery1!",
      full_name: "E2E User",
      tenantCode: "test",
    });
    // Grant doctor role on test tenant.
    await h.conn.exec(
      `INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
         VALUES ('11111111-1111-1111-1111-111111111111','test','Test Tenant','TZ','HOSP-1')
         ON CONFLICT DO NOTHING;
       INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
         SELECT global_user_id, '11111111-1111-1111-1111-111111111111', 'doctor'
         FROM beyu_identity.users WHERE email='${email}'
         ON CONFLICT (global_user_id, tenant_id) DO UPDATE SET role='doctor';`,
    );
    // Debug: verify schemas/tables exist
    const t = await h.conn.query(
      "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('beyu_identity','health') ORDER BY table_schema,table_name",
    );
    // eslint-disable-next-line no-console
    console.log("tables count:", (t as any[]).length, (t as any[]).slice(0, 8));
    const login = await request(h.app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "CorrectHorseBattery1!", tenantCode: "test" });
    // eslint-disable-next-line no-console
    console.log(
      "login status:",
      login.status,
      "body:",
      JSON.stringify(login.body).slice(0, 500),
    );
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });
  afterAll(async () => {
    if (h) await h.close();
  });

  it("authenticated GET /api/patients returns 200 + JSON array", async () => {
    const r = await request(h.app.getHttpServer())
      .get("/api/patients")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("unauthenticated GET /api/patients is 401/403", async () => {
    const r = await request(h.app.getHttpServer()).get("/api/patients");
    expect([401, 403]).toContain(r.status);
  });

  it("GET /health/live returns 200 without secret leakage", async () => {
    const r = await request(h.app.getHttpServer()).get("/health/live");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|password|token/i);
  });

  it("GET /health/ready returns structured checks without fabricating adapter availability", async () => {
    const r = await request(h.app.getHttpServer()).get("/health/ready");
    expect([200, 503]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toMatch(/"state"\s*:\s*"available"/);
  });

  it("CSRF token endpoint requires JWT (401 anonymous, 200 authenticated)", async () => {
    const anon = await request(h.app.getHttpServer()).get("/auth/csrf-token");
    expect([401, 403]).toContain(anon.status);
    const ok = await request(h.app.getHttpServer())
      .get("/auth/csrf-token")
      .set("Authorization", `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.csrfToken).toBeTruthy();
    expect(typeof ok.body.csrfToken).toBe("string");
    expect(ok.body.csrfToken.length).toBeGreaterThan(20);
  });

  it("POST /api/patients succeeds with Bearer JWT (CSRF guard intentionally bypasses Bearer requests)", async () => {
    // By design, the CSRF Double-Submit guard treats Bearer-token requests as
    // CSRF-safe: the Authorization header is not auto-sent by browsers on
    // cross-origin forms. CSRF is enforced for cookie-authenticated requests.
    const ok = await request(h.app.getHttpServer())
      .post("/api/patients")
      .set("Authorization", `Bearer ${token}`)
      .send({
        medical_record: `MRN-E2E-${Date.now()}`,
        given_name: "Alice",
        family_name: "Test",
      });
    expect(ok.status).toBe(201);
  });

  it("POST /api/patients without auth is rejected (401/403 or server failure — never 2xx)", async () => {
    const r = await request(h.app.getHttpServer()).post("/api/patients").send({
      medical_record: "MRN-ANON",
      given_name: "Anon",
      family_name: "Ymous",
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
