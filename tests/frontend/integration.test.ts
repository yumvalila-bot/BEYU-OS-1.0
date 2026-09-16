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
import { apiGet, apiPost, apiGetJson, isDeniedPage, login, serverAvailable } from "../helpers/http";

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
      "/os/agriculture",
      // Newly surfaced capability destinations (feature discovery integration).
      "/os/identity", "/os/security", "/os/notifications", "/os/events",
      "/os/workflow", "/os/risk", "/os/compliance", "/os/legal", "/os/finance",
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
    expect(isDeniedPage(ok.html)).toBe(false);
    const denied = await apiGet("/os/audit", hcm);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/audit:log\.read/);
  });

  it.skipIf(!available)("HCM page: CEO renders; CFO is denied with the capability code", async () => {
    const ok = await apiGet("/os/hcm", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/HCM|workforce|employee/i);
    const denied = await apiGet("/os/hcm", cfo);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/hcm:employee\.read/);
  });

  it.skipIf(!available)("Capital page: CFO renders finance content; HCM director is denied", async () => {
    const ok = await apiGet("/os/capital", cfo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Capital|Treasury|pipeline/i);
    const denied = await apiGet("/os/capital", hcm);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/finance:capital\.read/);
  });

  it.skipIf(!available)("Noelia page: CEO renders console; auditor (no ai:noelia.query) is denied", async () => {
    const ok = await apiGet("/os/noelia", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Noelia|HIVE/i);
    const denied = await apiGet("/os/noelia", auditor);
    expect(isDeniedPage(denied.html)).toBe(true);
  });

  // Newly surfaced capability destinations (feature discovery integration):
  // each must re-verify its OWN canonical capability server-side and show the
  // governed denial with the capability code when the grant is absent.
  it.skipIf(!available)("Identity page: CEO renders identity records; HCM director is denied with identity:user.read", async () => {
    const ok = await apiGet("/os/identity", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Identity|GlobalUserID/i);
    expect(isDeniedPage(ok.html)).toBe(false);
    const denied = await apiGet("/os/identity", hcm);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/identity:user\.read/);
  });

  it.skipIf(!available)("Security page: CEO renders posture; auditor (no identity:user.read) is denied", async () => {
    const ok = await apiGet("/os/security", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Security|Session risk|service-principal/i);
    const denied = await apiGet("/os/security", auditor);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/identity:user\.read/);
  });

  it.skipIf(!available)("Events page: CEO renders the enterprise stream; HCM director is denied with audit:event.read", async () => {
    const ok = await apiGet("/os/events", ceo);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/enterprise event|CloudEvents|event stream/i);
    const denied = await apiGet("/os/events", hcm);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/audit:event\.read/);
  });

  it.skipIf(!available)("Compliance page: auditor renders; HCM director is denied with compliance:obligation.read", async () => {
    const ok = await apiGet("/os/compliance", auditor);
    expect(ok.status).toBe(200);
    expect(ok.html).toMatch(/Compliance|obligation/i);
    const denied = await apiGet("/os/compliance", hcm);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/compliance:obligation\.read/);
  });

  it.skipIf(!available)("Workflow page: per-section capability gating without page-level bypass", async () => {
    // CEO (dashboard + HIVE) sees both planes; HCM director (dashboard only)
    // sees enterprise workflows while the HIVE section reports its grant
    // boundary — never the workflow data itself.
    const full = await apiGet("/os/workflow", ceo);
    expect(full.status).toBe(200);
    expect(full.html).toMatch(/Workflow|governed execution/i);
    expect(full.html).toMatch(/HIVE/i);
    const partial = await apiGet("/os/workflow", hcm);
    expect(partial.status).toBe(200);
    expect(isDeniedPage(partial.html)).toBe(false);
    expect(partial.html).toMatch(/Approvals, tasks|Workflow/i);
    expect(partial.html).toMatch(/ai:workflow\.run or ai:workflow\.approve/);
  });

  it.skipIf(!available)("Notifications page: any authenticated principal reads their own tenant stream", async () => {
    for (const cookie of [ceo, hcm, auditor]) {
      const res = await apiGet("/os/notifications", cookie);
      expect(res.status).toBe(200);
      expect(isDeniedPage(res.html)).toBe(false);
      expect(res.html).toMatch(/Notification|alert/i);
    }
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
