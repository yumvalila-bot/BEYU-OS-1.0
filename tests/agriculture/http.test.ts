/**
 * Agriculture OS — HTTP transport.
 *
 * skipIf during collection: HTTP suites require the running server.
 * Pattern matches tests/hcm/hcm-http.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, enterpriseEvents, journalEntries } from "@/db/schema";
import { apiGet, apiGetJson, apiPost, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let ceoCookie = "";
let hcmCookie = "";
let opsCookie = "";
let healthCookie = "";

const RUN = `HTTPAGR${Date.now()}`;

async function tableCount(table: typeof journalEntries | typeof capitalRequests): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return Number(row?.n ?? 0);
}

beforeAll(async () => {
  if (!available) return;
  ceoCookie = await login("ceo@beyu.os");
  hcmCookie = await login("hcm@beyu.os");
  opsCookie = await login("agri.ops@beyu.os");
  healthCookie = await login("health.ops@beyu.os");
}, 240_000);

describe.skipIf(!available)("Agriculture OS API over HTTP", () => {
  it("unauthenticated GET is 401", async () => {
    const res = await apiGetJson("/api/v1/agriculture/dashboard");
    expect(res.status).toBe(401);
  });

  it("unauthenticated POST farms is 401", async () => {
    const res = await apiPost("/api/v1/agriculture/farms", {
      legalEntityId: "LEN_BEYU_AGRI_LTD",
      code: `${RUN}U`,
      name: "Unauth farm",
      countryCode: "TZ",
    });
    expect(res.status).toBe(401);
  });

  it("Health identity cannot POST Agriculture farms", async () => {
    const res = await apiPost(
      "/api/v1/agriculture/farms",
      {
        legalEntityId: "LEN_BEYU_AGRI_LTD",
        code: `${RUN}H`,
        name: "Health impersonation farm",
        countryCode: "TZ",
      },
      { cookie: healthCookie },
    );
    expect(res.status).toBe(403);
  });

  it("Agriculture identity cannot bind a Health legal entity", async () => {
    const res = await apiPost(
      "/api/v1/agriculture/farms",
      {
        legalEntityId: "LEN_BEYU_HEALTH_LTD",
        code: `${RUN}XE`,
        name: "Cross-entity farm",
        countryCode: "TZ",
      },
      { cookie: opsCookie },
    );
    // Runtime RLS hides other-tenant entities, so the domain reports NOT_FOUND (404).
    // Privileged domain tests see the row and return SCOPE (403). Both are deny.
    expect([403, 404]).toContain(res.status);
  });

  it("Agriculture identity cannot post a foreign country", async () => {
    const res = await apiPost(
      "/api/v1/agriculture/farms",
      {
        legalEntityId: "LEN_BEYU_AGRI_LTD",
        code: `${RUN}XC`,
        name: "Cross-country farm",
        countryCode: "KE",
      },
      { cookie: opsCookie },
    );
    expect(res.status).toBe(403);
  });

  it("HCM director is 403 — no agriculture:data.read", async () => {
    const res = await apiGetJson("/api/v1/agriculture/dashboard", { cookie: hcmCookie });
    expect(res.status).toBe(403);
  });

  it("CEO reads the dashboard with CAP_POSTING LOCKED", async () => {
    const res = await apiGetJson("/api/v1/agriculture/dashboard", { cookie: ceoCookie });
    expect(res.status).toBe(200);
    const body = res.body as {
      dashboard: {
        financeBoundary: { journals: string; capPosting: string; harvestEvent: string };
        timezoneDefault: string;
        countryDefault: string;
      };
    };
    expect(body.dashboard.financeBoundary.journals).toBe("FINANCE_OS_ONLY");
    expect(body.dashboard.financeBoundary.capPosting).toBe("LOCKED");
    expect(body.dashboard.financeBoundary.harvestEvent).toBe("HARVEST_RECORDED");
    expect(body.dashboard.timezoneDefault).toBe("Africa/Dar_es_Salaam");
    expect(body.dashboard.countryDefault).toBe("TZ");
  });

  it("capital-cases GET returns capPosting LOCKED", async () => {
    const res = await apiGetJson("/api/v1/agriculture/capital-cases", { cookie: ceoCookie });
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; capPosting: string };
    expect(body.capPosting).toBe("LOCKED");
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("CEO cannot POST farms — read is not manage", async () => {
    const res = await apiPost(
      "/api/v1/agriculture/farms",
      {
        legalEntityId: "LEN_BEYU_HOLDINGS",
        code: `${RUN}CEO`,
        name: "Should not create",
        countryCode: "TZ",
      },
      { cookie: ceoCookie },
    );
    expect(res.status).toBe(403);
  });

  it("Agriculture identity records a harvest: HARVEST_RECORDED, journals 0, no capital_requests", async () => {
    const journalsBefore = await tableCount(journalEntries);
    const capitalBefore = await tableCount(capitalRequests);

    const farm = await apiPost(
      "/api/v1/agriculture/farms",
      {
        legalEntityId: "LEN_BEYU_AGRI_LTD",
        code: `${RUN}F`,
        name: "HTTP harvest farm",
        countryCode: "TZ",
        region: "Morogoro",
      },
      { cookie: opsCookie },
    );
    expect(farm.status).toBe(201);
    const farmId = (farm.body as { id: string }).id;

    const field = await apiPost(
      "/api/v1/agriculture/fields",
      { farmId, code: `${RUN}FL`, name: "Block A", areaHa: "3.50" },
      { cookie: opsCookie },
    );
    expect(field.status).toBe(201);
    const fieldId = (field.body as { id: string }).id;

    const cycle = await apiPost(
      "/api/v1/agriculture/crop-cycles",
      {
        fieldId,
        cropType: "MAIZE",
        code: `${RUN}CY`,
        season: "2026-MASIKA",
        plantingDate: "2026-03-01",
      },
      { cookie: opsCookie },
    );
    expect(cycle.status).toBe(201);
    const cropCycleId = (cycle.body as { id: string }).id;

    const harvest = await apiPost(
      "/api/v1/agriculture/harvests",
      {
        cropCycleId,
        code: `${RUN}HV`,
        harvestDate: "2026-07-20",
        quantityKg: "950",
        qualityGrade: "B",
      },
      { cookie: opsCookie },
    );
    expect(harvest.status).toBe(201);
    const body = harvest.body as { id: string; journalsPosted: boolean; financeHandoff: string };
    expect(body.journalsPosted).toBe(false);
    expect(body.financeHandoff).toBe("NONE");
    expect(typeof body.id).toBe("string");

    const [eventRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(enterpriseEvents)
      .where(and(eq(enterpriseEvents.type, "HARVEST_RECORDED"), eq(enterpriseEvents.subjectId, body.id)));
    expect(Number(eventRow?.n ?? 0)).toBe(1);

    expect(await tableCount(journalEntries)).toBe(journalsBefore);
    expect(await tableCount(capitalRequests)).toBe(capitalBefore);
  });

  it("what-if POST is SIMULATION / SCENARIO", async () => {
    const res = await apiPost(
      "/api/v1/agriculture/whatif",
      { title: `${RUN} rainfall`, areaHa: 8, yieldKgPerHa: 1500, rainfallMm: 250 },
      { cookie: ceoCookie },
    );
    expect(res.status).toBe(201);
    const body = res.body as {
      epistemicStatus: string;
      outputs: { basis: string; journalsPosted: boolean };
      explanation: string;
    };
    expect(body.epistemicStatus).toBe("SCENARIO");
    expect(body.outputs.basis).toBe("SIMULATION");
    expect(body.outputs.journalsPosted).toBe(false);
    expect(body.explanation).toMatch(/SIMULATION/i);
  });

  it("sync envelope replay is 200; first accept is 201", async () => {
    const envelopeId = `${RUN}ENV0001`;
    const payload = {
      envelopeId,
      operation: "RECORD_OBSERVATION",
      payload: { note: "offline" },
      clientOccurredAt: new Date().toISOString(),
    };
    const first = await apiPost("/api/v1/agriculture/sync", payload, { cookie: opsCookie });
    expect(first.status).toBe(201);
    expect((first.body as { replay: boolean }).replay).toBe(false);
    const second = await apiPost("/api/v1/agriculture/sync", payload, { cookie: opsCookie });
    expect(second.status).toBe(200);
    expect((second.body as { replay: boolean }).replay).toBe(true);
    expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id);
  });

  it("capital-case POST does not create capital_requests", async () => {
    const capitalBefore = await tableCount(capitalRequests);
    const res = await apiPost(
      "/api/v1/agriculture/capital-cases",
      { code: `${RUN}CAP`, title: "Borehole", amount: "4200", currency: "USD" },
      { cookie: opsCookie },
    );
    expect(res.status).toBe(201);
    const body = res.body as { capPosting: string; journalsPosted: boolean; financeHandoff: string };
    expect(body.capPosting).toBe("LOCKED");
    expect(body.journalsPosted).toBe(false);
    expect(body.financeHandoff).toBe("SUBMITTED_PENDING_FINANCE");
    expect(await tableCount(capitalRequests)).toBe(capitalBefore);
  });
});

describe.skipIf(!available)("Agriculture OS page over HTTP", () => {
  it("unauthenticated /os/agriculture redirects to sign-in", async () => {
    const res = await apiGet("/os/agriculture", null);
    expect([307, 200]).toContain(res.status);
    expect(res.html).toMatch(/BEYU OS|Sign in|Welcome/i);
  });
});
