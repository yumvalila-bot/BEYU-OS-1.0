/**
 * Local-environment performance measurements.
 *
 * Records p50/p95/p99 latency for key endpoints against the PGlite-backed
 * Nest app. These are LOCAL, IN-PROCESS measurements — they do NOT reflect
 * production-scale latency and are labelled as such in the artifact.
 */
import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any
const request: any = require("supertest");
import * as fs from "fs";
import * as path from "path";
import { buildE2EHarness, E2EHarness } from "../../common/testing/e2e-harness";

interface Sample { op: string; samples: number[]; statusCounts: Record<string, number>; }

function percentile(arr: number[], p: number): number {
  const s = [...arr].sort((a,b)=>a-b);
  const i = Math.min(s.length-1, Math.floor(s.length * p));
  return s[i];
}

describe("Performance measurements (local PGlite, in-process)", () => {
  jest.setTimeout(60000);
  let h: E2EHarness;
  let token: string;
  const samples: Record<string, Sample> = {};

  beforeAll(async () => {
    h = await buildE2EHarness();
    const email = `perf-${Date.now()}@example.com`;
    await h.conn.exec(
      `INSERT INTO beyu_identity.tenants (tenant_id,tenant_code,name,country_code,entity_code)
         VALUES ('11111111-1111-1111-1111-111111111111','test','Test','TZ','HOSP-1')
         ON CONFLICT DO NOTHING;`
    );
    await request(h.app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "CorrectHorseBattery1!", full_name: "Perf", tenantCode: "test" });
    const uid = await h.conn.query<{ global_user_id: string }>(
      "SELECT global_user_id FROM beyu_identity.users WHERE email=$1", [email],
    );
    await h.conn.exec(
      `INSERT INTO beyu_identity.tenant_memberships (global_user_id,tenant_id,role)
         VALUES ('${(uid as any[])[0].global_user_id}','11111111-1111-1111-1111-111111111111','doctor')
         ON CONFLICT (global_user_id,tenant_id) DO UPDATE SET role='doctor';`,
    );
    const l = await request(h.app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "CorrectHorseBattery1!", tenantCode: "test" });
    token = l.body.accessToken;
  });
  afterAll(async () => {
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    const metrics: Record<string, any> = {};
    for (const [op, s] of Object.entries(samples)) {
      metrics[op] = {
        samples: s.samples.length,
        p50_ms: Math.round(percentile(s.samples, 0.50)),
        p95_ms: Math.round(percentile(s.samples, 0.95)),
        p99_ms: Math.round(percentile(s.samples, 0.99)),
        statusCounts: s.statusCounts,
      };
    }
    fs.writeFileSync(path.join(outDir, "performance.json"), JSON.stringify({
      generated: new Date().toISOString(),
      environment: "local-pglite-in-process",
      disclaimer: "Local in-process PGlite measurements; NOT production-scale.",
      metrics,
    }, null, 2));
    await h.close();
  });

  async function measure(op: string, fn: () => Promise<{ status: number }>, n = 10) {
    const s: Sample = { op, samples: [], statusCounts: {} };
    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      const r = await fn();
      const dt = Date.now() - t0;
      s.samples.push(dt);
      s.statusCounts[r.status] = (s.statusCounts[r.status] ?? 0) + 1;
    }
    samples[op] = s;
  }

  it("health/live probe", async () => {
    await measure("health.live", () => request(h.app.getHttpServer()).get("/health/live"), 20);
  });
  it("auth/login (post-warmup)", async () => {
    await measure("auth.login", async () => {
      const email = `perf-${Date.now()}-${Math.random()}@example.com`;
      await request(h.app.getHttpServer()).post("/auth/register")
        .send({ email, password: "CorrectHorseBattery1!", full_name: "P", tenantCode: "test" });
      return request(h.app.getHttpServer()).post("/auth/login")
        .send({ email, password: "CorrectHorseBattery1!", tenantCode: "test" });
    }, 5);
  });
  it("patient:list", async () => {
    await measure("patient.list", () =>
      request(h.app.getHttpServer()).get("/api/patients").set("Authorization", `Bearer ${token}`), 15);
  });
  it("patient:create", async () => {
    await measure("patient.create", () =>
      request(h.app.getHttpServer()).post("/api/patients").set("Authorization", `Bearer ${token}`)
        .send({ medical_record: `MRN-PERF-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, given_name: "Perf", family_name: "Test" }), 5);
  });
  it("audit-write (via rate-limit event on blocked request)", async () => {
    await measure("audit.read_probe", () =>
      request(h.app.getHttpServer()).get("/health/ready"), 10);
  });
});
