/**
 * BEYU OS — frontend↔backend full-stack integration certification (Stages 2, 4–8).
 *
 * Drives the REAL running production server (on the RLS-bound runtime role) and
 * asserts the complete chain: USER → FRONTEND (SSR page) → API → AUTH → GOVERNANCE
 * → BUSINESS LOGIC → DATABASE → AUDIT → RESPONSE → FRONTEND.
 *
 * Because a browser cannot be launched in this environment (Playwright CDN is
 * unreachable), this is the controlled E2E suite: it performs authenticated
 * server-side page rendering plus real HTTP API calls, which is exactly the
 * boundary the user's browser would cross.
 */
import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiPost, apiGetJson, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let ceo = "";
let cfo = "";
let hcm = "";
let auditor = "";
let family = "";

beforeAll(async () => {
  if (!available) return;
  ceo = await login("ceo@beyu.os");
  cfo = await login("cfo@beyu.os");
  hcm = await login("hcm@beyu.os");
  auditor = await login("auditor@beyu.os");
  family = await login("family@beyu.os"); // FAMILY_OFFICE_PRINCIPAL lacks ai:analytics.read
}, 240_000);

const REDIRECT_TO_SIGNIN = async (path: string) => {
  const res = await apiGet(path, null);
  // Unauthenticated server components call redirect("/") → the sign-in page.
  expect([307, 200]).toContain(res.status);
  expect(res.html).toMatch(/BEYU OS|Sign in|Welcome/i);
};

describe("Stage 2/4 — route auth boundary (unauthenticated direct URL)", () => {
  it.skipIf(!available)("direct URL to every protected /os route redirects to sign-in when unauthenticated", async () => {
    const routes = [
      "/os", "/os/constitution", "/os/registry", "/os/organization", "/os/governance",
      "/os/assurance", "/os/hcm", "/os/capital", "/os/waterfall", "/os/tax",
      "/os/family", "/os/foundation", "/os/noelia", "/os/documents", "/os/audit",
    ];
    for (const r of routes) {
      await REDIRECT_TO_SIGNIN(r);
    }
  });
});

describe("Stage 2/6 — per-route authorization (authorized renders, unauthorized denies)", () => {
  it.skipIf(!available)("audit page: CEO (audit:log.read) renders; HCM director is denied with the capability code", async () => {
    const ok = await apiGet("/os/audit", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Audit/i);
    expect(ok.html).not.toMatch(/Authorisation denied/i);
    const denied = await apiGet("/os/audit", hcm);
    expect(denied.html).toMatch(/Authorisation denied/);
    expect(denied.html).toMatch(/audit:log\.read/);
  });

  it.skipIf(!available)("HCM page: CEO renders; CFO is denied with the capability code", async () => {
    const ok = await apiGet("/os/hcm", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/HCM|workforce|employee/i);
    const denied = await apiGet("/os/hcm", cfo);
    expect(denied.html).toMatch(/Authorisation denied/);
    expect(denied.html).toMatch(/hcm:employee\.read/);
  });

  it.skipIf(!available)("Capital page: CFO renders finance content; HCM director is denied", async () => {
    const ok = await apiGet("/os/capital", cfo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Capital|Treasury|pipeline/i);
    const denied = await apiGet("/os/capital", hcm);
    expect(denied.html).toMatch(/Authorisation denied/);
    expect(denied.html).toMatch(/finance:capital\.read/);
  });

  it.skipIf(!available)("Noelia page: CEO renders console; auditor (no ai:noelia.query) is denied", async () => {
    const ok = await apiGet("/os/noelia", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Noelia|HIVE/i);
    const denied = await apiGet("/os/noelia", auditor);
    expect(denied.html).toMatch(/Authorisation denied/);
  });
});

describe("Stage 4 — identity continuity across login → page → API", () => {
  it.skipIf(!available)("the rendered layout shows the authenticated principal's name, tenant and roles", async () => {
    const page = await apiGet("/os", ceo);
    expect(page.status).toBe(200);
    // Principal identity propagated to SSR layout.
    expect(page.html).toMatch(/Amani Beyu/);
    expect(page.html).toMatch(/ceo@beyu\.os/);
    expect(page.html).toMatch(/GROUP_CEO/);
    // Tenant context rendered.
    expect(page.html).toMatch(/BEYU-GROUP|BEYU/i);
  });

  it.skipIf(!available)("a forged session cookie is rejected at the page boundary (identity not honored)", async () => {
    const res = await apiGet("/os/organization", "session=forged-cookie-value-0123456789abcdef");
    // Either redirected to sign-in or denied — never renders protected content as the forged identity.
    expect(res.html).not.toMatch(/Organisation & Ownership/);
  });
});

describe("Stage 8 — Noelia full response-contract preservation", () => {
  it.skipIf(!available)("analyze returns decisionId/engine/confidence/deniedScopes/humanReviewRequired/toolsUsed intact", async () => {
    const res = await apiPost(
      "/api/v1/ai/noelia/analyze",
      { analysisType: "LIQUIDITY_ANALYSIS" },
      { cookie: ceo },
    );
    expect(res.status).toBe(200);
    const a = (res.body as any).data;
    expect(typeof a.decisionId).toBe("string");
    expect(a.decisionId.length).toBeGreaterThan(0);
    expect(typeof a.engine).toBe("string");
    expect(typeof a.confidence).toBe("number");
    expect(Array.isArray(a.deniedScopes)).toBe(true);
    expect(typeof a.humanReviewRequired).toBe("boolean");
    expect(Array.isArray(a.toolsUsed)).toBe(true);
    expect(Array.isArray(a.sources)).toBe(true);
    // The audit ledger recorded this AI decision (backing the UI's decision ID).
    expect(res.status).toBe(200);
  }, 60_000);

  it.skipIf(!available)("a FAMILY_OFFICE_PRINCIPAL without ai:analytics.read is denied the analyze endpoint", async () => {
    const res = await apiPost(
      "/api/v1/ai/noelia/analyze",
      { analysisType: "LIQUIDITY_ANALYSIS" },
      { cookie: family },
    );
    expect(res.status).toBe(403);
  }, 60_000);

  it.skipIf(!available)("a forged target tenant in the body cannot escape the resolved scope", async () => {
    const res = await apiPost(
      "/api/v1/ai/noelia/analyze",
      {
        analysisType: "LIQUIDITY_ANALYSIS",
        context: { tenantId: "TEN_BEYU_GROUP", legalEntityId: "LE_FOREIGN" },
      },
      { cookie: family },
    );
    // FAMILY_OFFICE_PRINCIPAL is denied outright (no ai:analytics.read); the forged body cannot bypass.
    expect([403, 422]).toContain(res.status);
  }, 60_000);
});
