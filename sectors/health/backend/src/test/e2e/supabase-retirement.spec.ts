/**
 * P0 regression: the legacy Supabase data proxy is RETIRED.
 *
 * Historical defect (Phase 0 re-verified): /api/supabase/:table proxied
 * database access through a Supabase service-role client (which bypasses
 * RLS), and the allowlisted tables `patients`, `appointments`, `users` and
 * `organizations` were NOT in TENANT_SCOPED_TABLES — no application-layer
 * tenant filter was applied to them. Combined with the legacy
 * `supabase-schema.sql` (public.patients with no tenant_id and no RLS
 * policies), any authenticated actor holding phi:read could have read
 * cross-tenant patient rows when a Supabase deployment was configured.
 *
 * The canonical Health OS data layer is the beyu_identity/health PostgreSQL
 * schemas. The proxy served only legacy demo views, so the entire path was
 * removed rather than hardened. This spec proves:
 *
 *   1. no /api/supabase route exists, even for a fully authenticated,
 *      phi:read-authorized actor (404, not 401/403);
 *   2. no backend source reads SUPABASE_* credentials or constructs a
 *      supabase-js client (prevents silent reintroduction of a privileged
 *      data path);
 *   3. the retired module/config files do not reappear.
 */
import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any
const request: any = require("supertest");
import * as fs from "fs";
import * as path from "path";
import { buildE2EHarness, E2EHarness } from "../../common/testing/e2e-harness";

const SRC_ROOT = path.resolve(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("P0: legacy Supabase data proxy is retired", () => {
  let h: E2EHarness;

  beforeAll(async () => {
    h = await buildE2EHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it("GET /api/supabase/patients is 404 for an authenticated phi:read actor", async () => {
    // The harness seeds the user with a placeholder hash, so password login
    // cannot succeed; sign the access token the way AuthService does so the
    // request is fully authenticated and authorized for phi:read. A mounted
    // route would answer 401/403 — only an absent route answers 404.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      {
        sub: "00000000-0000-0000-0000-000000000001",
        email: "doc@beyu.health",
        role: "doctor",
        tenantId: "11111111-1111-1111-1111-111111111111",
        permissions: ["phi:read", "patient:read"],
      },
      process.env.JWT_SECRET as string,
      {
        issuer: process.env.JWT_ISSUER as string,
        audience: process.env.JWT_AUDIENCE as string,
        algorithm: "HS256",
        expiresIn: "5m",
      },
    );
    const authed = await request(h.app.getHttpServer())
      .get("/api/supabase/patients")
      .set("Authorization", `Bearer ${token}`);
    expect(authed.status).toBe(404);

    const unauth = await request(h.app.getHttpServer()).get(
      "/api/supabase/patients",
    );
    expect(unauth.status).toBe(404);
  });

  it("GET /api/supabase/health is 404 (the proxy health probe is gone)", async () => {
    const r = await request(h.app.getHttpServer()).get("/api/supabase/health");
    expect(r.status).toBe(404);
  });

  it("no backend source reads SUPABASE_* credentials or builds a supabase client", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file.endsWith(".spec.ts")) continue;
      const src = fs.readFileSync(file, "utf8");
      if (/SUPABASE_(URL|ANON_KEY|SERVICE_KEY|SERVICE_ROLE_KEY)/.test(src)) {
        offenders.push(`${file}: SUPABASE_* credential reference`);
      }
      if (/@supabase\/(supabase-js|ssr)/.test(src)) {
        offenders.push(`${file}: @supabase client import`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the retired module and config files do not exist", () => {
    expect(fs.existsSync(path.join(SRC_ROOT, "modules", "supabase"))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(SRC_ROOT, "config", "supabase.config.ts")),
    ).toBe(false);
  });
});
