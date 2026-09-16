/**
 * Foundation OS — transport certification (real running server, runtime role).
 *
 * Proves the HTTP boundary: 401 unauthenticated, 403 without the capability,
 * 403 for a capability held in the WRONG tenant (the canonical Foundation
 * target-tenant/classification boundary, enforced independently of the UI
 * deep-link layer), 200 with capability + resolved scope, governed POST create
 * whose tenant is resolved server-side (never from the request), and page-level
 * SSR gating parity.
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
/** Enterprise-seat identity that holds Foundation capabilities from the group tenant. */
let governance = "";

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const createdIds: string[] = [];

let foundationTenantId = "";
let healthTenantId = "";
/** A real foundation row that lives OUTSIDE the canonical Foundation tenant. */
let foreignFoundationId = "";
let foreignFoundationCode = "";

beforeAll(async () => {
  if (!available) return;
  director = await login("foundation.director@beyu.os");
  officer = await login("foundation.ops@beyu.os");
  cfo = await login("cfo@beyu.os");
  sector = await login("health.ops@beyu.os");
  governance = await login("governance@beyu.os");

  const tenants = await db.execute<{ id: string; code: string }>(sql`
    select id, code from tenants where code in ('BEYU-FOUNDATION', 'BEYU-HEALTH')
  `);
  foundationTenantId = tenants.rows.find((r) => r.code === "BEYU-FOUNDATION")?.id ?? "";
  healthTenantId = tenants.rows.find((r) => r.code === "BEYU-HEALTH")?.id ?? "";
  if (!foundationTenantId || !healthTenantId) throw new Error("seed tenants missing — run npm run seed");

  // Attack fixture: a foundation-shaped row in another tenant. Inserted with the
  // privileged test role; the runtime role under test is RLS-bound.
  foreignFoundationId = `FDN_FOREIGN_${RUN}`;
  foreignFoundationCode = `FDN-FOREIGN-${RUN}`;
  await db.execute(sql`
    insert into foundations (id, tenant_id, code, legal_name, legal_vehicle, country_code, status)
    values (${foreignFoundationId}, ${healthTenantId}, ${foreignFoundationCode},
            ${`Foreign tenant foundation ${RUN}`}, 'FOUNDATION', 'TZ', 'PROPOSED')
  `);
}, 240_000);

afterAll(async () => {
  if (!available) return;
  for (const id of createdIds) {
    await db.execute(sql`delete from foundations where id = ${id}`);
  }
  await db.execute(sql`delete from foundations where id = ${foreignFoundationId}`);
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

  it.skipIf(!available)("sector operator: capability in the wrong tenant is denied, not silently empty", async () => {
    const denied = await apiGetJson("/api/v1/foundation/foundations", { cookie: sector });
    expect(denied.status).toBe(403); // no foundation:registry.read

    // SECTOR_OPERATOR holds foundation:program.read, but its resolved scope does
    // not contain the canonical Foundation tenant: the Foundation API boundary
    // denies it exactly as the Foundation deep-link layer does. A silently-empty
    // 200 would be indistinguishable from "no programmes exist".
    const targetScopeDenied = await apiGetJson<{ error: { code: string; message: string } }>(
      "/api/v1/foundation/programs",
      { cookie: sector },
    );
    expect(targetScopeDenied.status).toBe(403);
    expect(targetScopeDenied.body.error.code).toBe("FORBIDDEN");
    expect(targetScopeDenied.body.error.message).toMatch(/Foundation OS target scope/);
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

/**
 * ==========================================================================
 * Foundation API target-scope boundary (remediation after PR #63)
 * ==========================================================================
 *
 * The Foundation deep-link layer has always proved the canonical Foundation
 * target-tenant/classification boundary. These specs prove the API enforces the
 * SAME boundary INDEPENDENTLY — a raw HTTP request that never rendered a page,
 * never followed a link and supplies its own tenant/foundation identifiers is
 * still resolved against the authenticated principal alone.
 */
describe("Foundation API target-scope boundary", () => {
  it.skipIf(!available)("A. authorized principal reads and writes its canonical target", async () => {
    const list = await apiGetJson<{ foundations: Array<{ code: string; tenantId: string }> }>(
      "/api/v1/foundation/foundations",
      { cookie: director },
    );
    expect(list.status).toBe(200);
    expect(list.body.foundations.some((f) => f.code === "BEYU-FDN-01")).toBe(true);
    expect(list.body.foundations.every((f) => f.tenantId === foundationTenantId)).toBe(true);

    const created = await apiPost<{ id: string }>(
      "/api/v1/foundation/foundations",
      { code: `FDN-SCOPE-${RUN}`, legalName: `Scope probe ${RUN}`, legalVehicle: "FOUNDATION", countryCode: "TZ" },
      { cookie: director },
    );
    expect(created.status).toBe(201);
    createdIds.push(created.body.id);
  });

  it.skipIf(!available)("B. wrong Foundation target tenant is denied on every dataset", async () => {
    // Every path here is RBAC-allowed for this identity (foundation:program.read,
    // foundation:compliance.read, foundation:impact.read). What denies them is
    // the canonical Foundation target scope — the same boundary the UI applies.
    const probes = [
      "/api/v1/foundation/programs",
      "/api/v1/foundation/compliance/dashboard",
      "/api/v1/foundation/impact",
    ];
    for (const path of probes) {
      const res = await apiGetJson<{ error?: { code: string; message: string }; programs?: unknown; measurements?: unknown }>(
        path,
        { cookie: sector },
      );
      expect(res.status, `${path} must be denied`).toBe(403);
      expect(res.body.error?.code, `${path} must carry the governed error envelope`).toBe("FORBIDDEN");
      expect(res.body.error?.message, `${path} must cite the target scope`).toMatch(/Foundation OS target scope/);
      expect(res.body.programs, `${path} must not return data`).toBeUndefined();
      expect(res.body.measurements, `${path} must not return data`).toBeUndefined();
    }

    // A dataset the operator does not hold at all is still refused (403), so the
    // boundary never becomes the *only* control.
    const beneficiaries = await apiGetJson("/api/v1/foundation/beneficiaries", { cookie: sector });
    expect(beneficiaries.status).toBe(403);
  });

  it.skipIf(!available)("C/D. a forged client target never changes the resolved scope", async () => {
    // Query-string forgery: claiming the Foundation tenant (and naming a real
    // foundation) does not move the health operator into the Foundation target.
    const forgedTenant = await apiGetJson(
      `/api/v1/foundation/programs?tenantId=${foundationTenantId}&tenant=${foundationTenantId}`,
      { cookie: sector },
    );
    expect(forgedTenant.status).toBe(403);

    const forgedFoundation = await apiGetJson(
      `/api/v1/foundation/compliance/dashboard?foundationId=FDN_BEYU_FOUNDATION&tenantId=${foundationTenantId}`,
      { cookie: sector },
    );
    expect(forgedFoundation.status).toBe(403);

    // Body forgery on a mutation: the created row is stamped with the resolved
    // Foundation target tenant, never with the tenant the caller supplied.
    const created = await apiPost<{ id: string }>(
      "/api/v1/foundation/foundations",
      {
        code: `FDN-FORGE-${RUN}`,
        legalName: `Forgery probe ${RUN}`,
        legalVehicle: "FOUNDATION",
        countryCode: "TZ",
        tenantId: healthTenantId,
      },
      { cookie: director },
    );
    expect(created.status).toBe(201);
    createdIds.push(created.body.id);
    const stored = await db.execute<{ tenant_id: string }>(
      sql`select tenant_id from foundations where id = ${created.body.id}`,
    );
    expect(stored.rows[0]?.tenant_id).toBe(foundationTenantId);
  });

  it.skipIf(!available)("E/F. the classification boundary still gates the most protected dataset", async () => {
    // Safeguarding is HIGHLY_RESTRICTED. Both Foundation seats and the
    // group-governance seat hold the explicit clearance, so their authorised
    // reads succeed; every identity below that ceiling — or outside the target
    // scope — is refused. (The clearance-vs-floor refusal for a principal that
    // DOES hold the grant is proved exhaustively in
    // tests/foundation/target-scope.test.ts, where the clearance is overridden.)
    const directorRead = await apiGetJson("/api/v1/foundation/safeguarding", { cookie: director });
    expect(directorRead.status).toBe(200);

    const governanceRead = await apiGetJson("/api/v1/foundation/safeguarding", { cookie: governance });
    expect(governanceRead.status).toBe(200);

    const sectorDenied = await apiGetJson("/api/v1/foundation/safeguarding", { cookie: sector });
    expect(sectorDenied.status).toBe(403);

    const cfoDenied = await apiGetJson("/api/v1/foundation/safeguarding", { cookie: cfo });
    expect(cfoDenied.status).toBe(403);

    // The boundary never *widens* the ceiling: the restricted dataset is not
    // reachable merely by holding a Foundation capability in the right tenant.
    const officerRead = await apiGetJson("/api/v1/foundation/beneficiaries", { cookie: officer });
    expect(officerRead.status).toBe(200);
    const healthBeneficiaries = await apiGetJson("/api/v1/foundation/beneficiaries", { cookie: sector });
    expect(healthBeneficiaries.status).toBe(403);
  });

  it.skipIf(!available)("G. an unauthorized role is denied even inside the target tenant", async () => {
    // The CFO has Foundation enterprise oversight scope but no Foundation
    // capability: scope does not confer permission.
    const res = await apiGetJson("/api/v1/foundation/foundations", { cookie: cfo });
    expect(res.status).toBe(403);
  });

  it.skipIf(!available)("H. cross-tenant reads by identifier are refused", async () => {
    // The fixture row exists in the health tenant. The director's authorised
    // scope is the Foundation tenant, so it is not found rather than returned.
    const byId = await apiGetJson(`/api/v1/foundation/foundations/${foreignFoundationId}`, {
      cookie: director,
    });
    expect(byId.status).toBe(404);

    const list = await apiGetJson<{ foundations: Array<{ id: string; code: string }> }>(
      "/api/v1/foundation/foundations",
      { cookie: director },
    );
    expect(list.status).toBe(200);
    expect(list.body.foundations.map((f) => f.id)).not.toContain(foreignFoundationId);
    expect(list.body.foundations.map((f) => f.code)).not.toContain(foreignFoundationCode);

    // And the tenant that owns it cannot reach it through the Foundation API
    // either: the health operator is denied the Foundation target outright.
    const ownerSide = await apiGetJson(`/api/v1/foundation/foundations/${foreignFoundationId}`, {
      cookie: sector,
    });
    expect(ownerSide.status).toBe(403);
  });

  it.skipIf(!available)("I. a direct API request that bypasses the UI is still denied", async () => {
    // No page render, no link, no navigation state — a bare authenticated call.
    const res = await apiGetJson<{ error: { message: string } }>("/api/v1/foundation/programs", {
      cookie: sector,
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/FDN-HEALTH-01|FDN-EDU-02|GRT-2026/);
  });

  it.skipIf(!available)("J. an enterprise principal whose scope contains the target is authorized", async () => {
    // Cross-check that the boundary is not a blanket denial for group seats: the
    // governance identity holds Foundation capabilities and its resolved scope
    // contains the canonical Foundation tenant, so its reads succeed.
    const res = await apiGetJson<{ foundations: Array<{ tenantId: string }> }>(
      "/api/v1/foundation/foundations",
      { cookie: governance },
    );
    expect(res.status).toBe(200);
    expect(res.body.foundations.every((f) => f.tenantId === foundationTenantId)).toBe(true);
  });

  it.skipIf(!available)("UI parity: the denied API path renders the governed denial panel", async () => {
    const page = await apiGet("/os/foundation/programs", sector);
    expect(page.status).toBe(200);
    expect(isDeniedPage(page.html)).toBe(true);
  });
});
