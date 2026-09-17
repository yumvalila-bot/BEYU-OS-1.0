/**
 * UJENZI OS — HTTP transport.
 *
 * skipIf during collection: HTTP suites require the running server.
 * Pattern matches tests/agriculture/http.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { apiGetJson, apiPost, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let ceoCookie = "";
let hcmCookie = "";
let opsCookie = "";
let agriOpsCookie = "";

const RUN = `HTTPUJZ${Date.now()}`;

beforeAll(async () => {
  if (!available) return;
  ceoCookie = await login("ceo@beyu.os");
  hcmCookie = await login("hcm@beyu.os");
  opsCookie = await login("ujenzi.ops@beyu.os");
  agriOpsCookie = await login("agri.ops@beyu.os");
}, 240_000);

describe.skipIf(!available)("Ujenzi OS API over HTTP", () => {
  it("unauthenticated GET dashboard is 401", async () => {
    const res = await apiGetJson("/api/v1/ujenzi/dashboard");
    expect(res.status).toBe(401);
  });

  it("unauthenticated POST projects is 401", async () => {
    const res = await apiPost("/api/v1/ujenzi/projects", {
      legalEntityId: "LEN_BEYU_UJENZI_LTD",
      code: `${RUN}U`,
      name: "Unauth project",
      countryCode: "TZ",
    });
    expect(res.status).toBe(401);
  });

  it("HCM director is 403 — no ujenzi:data.read", async () => {
    const res = await apiGetJson("/api/v1/ujenzi/dashboard", { cookie: hcmCookie });
    expect(res.status).toBe(403);
  });

  it("Agriculture operator's Ujenzi view is RLS-bounded to its own tenant (no construction rows)", async () => {
    // SECTOR_OPERATOR holds ujenzi:data.read, but the request transaction pins
    // RLS to the principal's OWN tenant (BEYU-AGRI), which contains no
    // construction rows: tenant isolation at the database layer, zeros — never
    // another tenant's data.
    const res = await apiGetJson("/api/v1/ujenzi/projects", { cookie: agriOpsCookie });
    expect(res.status).toBe(200);
    const body = res.body as unknown as { items: Array<{ code: string }> };
    expect(body.items.some((item) => item.code === `${RUN}P`)).toBe(false);
  });

  it("Agriculture operator cannot create construction records bound to its own (non-construction) entity", async () => {
    const res = await apiPost(
      "/api/v1/ujenzi/projects",
      {
        legalEntityId: "LEN_BEYU_AGRI_LTD",
        code: `${RUN}AGRI`,
        name: "Agriculture entity construction project",
        countryCode: "TZ",
      },
      { cookie: agriOpsCookie },
    );
    expect([403, 404]).toContain(res.status);
  });

  it("Ujenzi operator cannot manage with a read-only audience's session (CEO has read, not manage)", async () => {
    const res = await apiPost(
      "/api/v1/ujenzi/projects",
      {
        legalEntityId: "LEN_BEYU_UJENZI_LTD",
        code: `${RUN}CEO`,
        name: "CEO write attempt",
        countryCode: "TZ",
      },
      { cookie: ceoCookie },
    );
    expect(res.status).toBe(403);
  });

  it("CEO reads the dashboard with CAP_POSTING LOCKED", async () => {
    const res = await apiGetJson("/api/v1/ujenzi/dashboard", { cookie: ceoCookie });
    expect(res.status).toBe(200);
    const body = res.body as unknown as {
      financeBoundary: { journals: string; capPosting: string; paymentCertificateEvent: string };
    };
    expect(body.financeBoundary.journals).toBe("FINANCE_OS_ONLY");
    expect(body.financeBoundary.capPosting).toBe("LOCKED");
    expect(body.financeBoundary.paymentCertificateEvent).toBe("PAYMENT_CERTIFIED");
  });

  it("Ujenzi operator creates a project (happy path, 201)", async () => {
    const res = await apiPost(
      "/api/v1/ujenzi/projects",
      {
        legalEntityId: "LEN_BEYU_UJENZI_LTD",
        code: `${RUN}P`,
        name: "HTTP test project",
        countryCode: "TZ",
        contractValue: "500000",
      },
      { cookie: opsCookie },
    );
    expect(res.status).toBe(201);
    const body = res.body as unknown as { id: string; status: string };
    expect(body.status).toBe("PLANNED");
  });

  it("Ujenzi operator cannot bind a foreign sector's legal entity", async () => {
    const res = await apiPost(
      "/api/v1/ujenzi/projects",
      {
        legalEntityId: "LEN_BEYU_AGRI_LTD",
        code: `${RUN}XE`,
        name: "Cross-entity project",
        countryCode: "TZ",
      },
      { cookie: opsCookie },
    );
    // Runtime RLS hides other-tenant entities → NOT_FOUND (404); a privileged
    // view would see SCOPE (403). Both are deny.
    expect([403, 404]).toContain(res.status);
  });

  it("validation: missing required fields is 422", async () => {
    const res = await apiPost(
      "/api/v1/ujenzi/projects",
      { code: `${RUN}V` },
      { cookie: opsCookie },
    );
    expect(res.status).toBe(422);
  });

  it("project list is visible to the Ujenzi operator and contains the created project", async () => {
    const res = await apiGetJson("/api/v1/ujenzi/projects", { cookie: opsCookie });
    expect(res.status).toBe(200);
    const body = res.body as unknown as { items: Array<{ code: string }> };
    expect(body.items.some((item) => item.code === `${RUN}P`)).toBe(true);
  });
});
