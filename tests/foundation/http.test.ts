/**
 * Foundation OS — transport certification (real running server, runtime role).
 *
 * Proves the HTTP boundary: 401 unauthenticated, 403 without the capability,
 * 200 with capability + scope, empty (not leaked) with capability but no
 * scope, governed POST create, and page-level SSR gating parity.
 *
 * Requires a running server (see tests/helpers/http.ts); skips when absent,
 * which CI prevents by starting the server and failing if it never becomes
 * ready.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiGet, apiGetJson, apiPost, isDeniedPage, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let director = "";
let officer = "";
let cfo = "";
let sector = "";

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const createdIds: string[] = [];

beforeAll(async () => {
  if (!available) return;
  director = await login("foundation.director@beyu.os");
  officer = await login("foundation.ops@beyu.os");
  cfo = await login("cfo@beyu.os");
  sector = await login("health.ops@beyu.os");
}, 240_000);

afterAll(async () => {
  if (!available) return;
  for (const id of createdIds) {
    await db.execute(sql`delete from foundations where id = ${id}`);
  }
});

describe("auth boundary", () => {
  it.skipIf(!available)("unauthenticated reads are 401", async () => {
    const res = await apiGetJson("/api/v1/foundation/foundations");
    expect(res.status).toBe(401);
  });

  it.skipIf(!available)("director reads the registry; demo foundation present", async () => {
    const res = await apiGetJson<{ foundations: Array<{ code: string; status: string }> }>(
      "/api/v1/foundation/foundations",
      { cookie: director },
    );
    expect(res.status).toBe(200);
    const demo = res.body.foundations.find((f) => f.code === "BEYU-FDN-01");
    expect(demo?.status).toBe("ACTIVE");
  });

  it.skipIf(!available)("CFO without foundation:registry.read is 403", async () => {
    const res = await apiGetJson("/api/v1/foundation/foundations", { cookie: cfo });
    expect(res.status).toBe(403);
  });

  it.skipIf(!available)("sector operator: capability without scope returns empty, not leaked", async () => {
    const denied = await apiGetJson("/api/v1/foundation/foundations", { cookie: sector });
    expect(denied.status).toBe(403); // no foundation:registry.read
    const allowed = await apiGetJson<{ programs: unknown[] }>("/api/v1/foundation/programs", {
      cookie: sector,
    });
    expect(allowed.status).toBe(200); // SECTOR_OPERATOR holds foundation:program.read
    expect(allowed.body.programs).toEqual([]); // but no programs live in the health tenant
  });
});

describe("governed writes", () => {
  it.skipIf(!available)("director creates a PROPOSED foundation; officer write is 403", async () => {
    const code = `FDN-HTTP-${RUN}`;
    const created = await apiPost<{ id: string }>(
      "/api/v1/foundation/foundations",
      { code, legalName: `HTTP Probe ${RUN}`, legalVehicle: "FOUNDATION", countryCode: "TZ" },
      { cookie: director },
    );
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^FDN_/);
    createdIds.push(created.body.id);

    const fetched = await apiGetJson<{ foundation: { code: string; status: string } }>(
      `/api/v1/foundation/foundations/${created.body.id}`,
      { cookie: director },
    );
    expect(fetched.status).toBe(200);
    expect(fetched.body.foundation.code).toBe(code);
    expect(fetched.body.foundation.status).toBe("PROPOSED");

    // The officer reads the registry but cannot write it: registry creation is a
    // director-held capability.
    const officerWrite = await apiPost(
      "/api/v1/foundation/foundations",
      { code: `FDN-HTTP-O-${RUN}`, legalName: "Officer write", legalVehicle: "FOUNDATION", countryCode: "TZ" },
      { cookie: officer },
    );
    expect(officerWrite.status).toBe(403);
  });

  it.skipIf(!available)("invalid payloads are 422, not 500", async () => {
    const res = await apiPost(
      "/api/v1/foundation/foundations",
      { code: "", legalName: "x", legalVehicle: "FOUNDATION", countryCode: "TZZ" },
      { cookie: director },
    );
    expect([400, 422]).toContain(res.status);
  });
});

describe("compliance dashboard", () => {
  it.skipIf(!available)("director reads the dashboard; CFO is 403", async () => {
    const ok = await apiGetJson<{ totals: { open: number }; overdueCount: number }>(
      "/api/v1/foundation/compliance/dashboard?today=2026-09-08",
      { cookie: director },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.totals.open).toBeGreaterThanOrEqual(1);
    expect(ok.body.overdueCount).toBeGreaterThanOrEqual(0);

    const denied = await apiGetJson("/api/v1/foundation/compliance/dashboard", { cookie: cfo });
    expect(denied.status).toBe(403);
  });
});

describe("page-level SSR gating parity", () => {
  it.skipIf(!available)("director renders the dashboard; CFO sees the governed denial", async () => {
    const ok = await apiGet("/os/foundation", director);
    expect(ok.status).toBe(200);
    expect(isDeniedPage(ok.html)).toBe(false);
    expect(ok.html).toMatch(/Foundation OS|Registry/i);

    const denied = await apiGet("/os/foundation", cfo);
    expect(denied.status).toBe(200);
    expect(isDeniedPage(denied.html)).toBe(true);
    expect(denied.html).toMatch(/foundation:registry\.read/);
  });

  it.skipIf(!available)("unauthenticated page access redirects to sign-in", async () => {
    const res = await apiGet("/os/foundation", null);
    expect([307, 200]).toContain(res.status);
    expect(res.html).toMatch(/BEYU OS|Sign in|Welcome/i);
  });
});
