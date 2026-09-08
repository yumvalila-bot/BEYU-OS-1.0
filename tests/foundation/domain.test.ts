/**
 * Foundation OS — domain certification (real PostgreSQL, privileged test role).
 *
 * Proves: seed integrity (registry, demo foundation, funds, grant, deadline),
 * tenant-scope isolation (out-of-scope reads return nothing / NOT_FOUND, never
 * leak), and mutation governance (illegal transitions rejected, approval-gated
 * transitions require a reference, audits are written).
 *
 * Reads are scope-enforced in the service layer; capability enforcement lives
 * at the HTTP boundary and is proven by tests/foundation/http.test.ts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, tenants, users } from "@/db/schema";
import {
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "@/lib/authz";
import { fixedId, ID_PREFIX } from "@/lib/ids";
import {
  FoundationError,
  createFoundation,
  getFoundation,
  listFoundations,
  listFunds,
  listGrants,
  transitionFoundation,
  type ServiceContext,
} from "@/lib/foundation/service";
import {
  complianceDashboard,
  listDeadlines,
  listObligations,
} from "@/lib/foundation/compliance";
import { listDonations, listDonors } from "@/lib/foundation/service";

async function principalFor(userKey: string, overrides: Partial<Principal> = {}): Promise<Principal> {
  const userId = fixedId(ID_PREFIX.user, userKey);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error(`seed user ${userKey} missing`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  };
}

const ctxFor = (principal: Principal): ServiceContext => ({
  principal,
  traceId: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const createdFoundationIds: string[] = [];

afterAll(async () => {
  for (const id of createdFoundationIds) {
    await db.execute(sql`delete from foundations where id = ${id}`);
  }
});

describe("seed integrity", () => {
  it("foundation principals exist with the governed roles", async () => {
    const director = await principalFor("FATMA_JUMA");
    const officer = await principalFor("YUSUF_MAKAME");
    expect(director.roles).toContain("FOUNDATION_DIRECTOR");
    expect(officer.roles).toContain("FOUNDATION_OFFICER");
    expect(director.tenantCode).toBe("BEYU-FOUNDATION");
    expect(officer.tenantCode).toBe("BEYU-FOUNDATION");
    expect(director.permissions.has("foundation:registry.read")).toBe(true);
    expect(director.permissions.has("foundation:grant.approve")).toBe(true);
    expect(officer.permissions.has("foundation:grant.approve")).toBe(false);
  });

  it("foundation principals are HCM employees (no shadow workforce)", async () => {
    for (const key of ["FATMA_JUMA", "YUSUF_MAKAME"]) {
      const [e] = await db
        .select()
        .from(employees)
        .where(eq(employees.partyId, fixedId(ID_PREFIX.party, key)));
      expect(e?.employeeNo).toMatch(/^BEYU-EMP-0010[12]$/);
    }
  });

  it("FOUNDATION_OS is ACTIVE in the OS registry", async () => {
    const r = await db.execute<{ lifecycle: string }>(sql`
      select lifecycle from os_registry where code = 'FOUNDATION_OS'
    `);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].lifecycle).toBe("ACTIVE");
  });

  it("demo foundation, funds, donation, grant and deadline are readable in scope", async () => {
    const director = await principalFor("FATMA_JUMA");
    const foundations = await listFoundations(director);
    const demo = foundations.find((f) => f.code === "BEYU-FDN-01");
    expect(demo).toBeDefined();
    expect(demo?.status).toBe("ACTIVE");

    const funds = await listFunds(director);
    expect(funds.map((f) => f.code).sort()).toEqual(["FUND-GENERAL", "FUND-STEM"]);

    const donors = await listDonors(director);
    expect(donors.length).toBeGreaterThanOrEqual(1);
    const donations = await listDonations(director);
    expect(donations.some((d) => d.status === "ALLOCATED")).toBe(true);

    const grants = await listGrants(director);
    expect(grants.some((g) => g.status === "OPPORTUNITY")).toBe(true);

    const obligations = await listObligations(director);
    expect(obligations.length).toBeGreaterThanOrEqual(2);
    const deadlines = await listDeadlines(director);
    const annual = deadlines.find((d) => d.periodLabel === "FY2026");
    expect(annual?.status).toBe("UPCOMING");
    expect(annual?.dueDate).toBe("2026-09-29");
  });

  it("compliance dashboard aggregates honestly for the demo foundation", async () => {
    const director = await principalFor("FATMA_JUMA");
    const dash = await complianceDashboard(director, "2026-09-08");
    expect(dash.totals.open).toBeGreaterThanOrEqual(1);
    expect(dash.overdueCount).toBeGreaterThanOrEqual(0);
    expect(dash.openEscalations).toBeGreaterThanOrEqual(0);
    expect(dash.blockedTasks).toBeGreaterThanOrEqual(0);
    if (dash.onTimePct !== null) {
      expect(dash.onTimePct).toBeGreaterThanOrEqual(0);
      expect(dash.onTimePct).toBeLessThanOrEqual(100);
    }
  });
});

describe("tenant-scope isolation", () => {
  it("a health-sector principal sees zero foundations and gets NOT_FOUND by id", async () => {
    const sector = await principalFor("SARA_LEMA");
    expect(await listFoundations(sector)).toEqual([]);
    expect(await listFunds(sector)).toEqual([]);
    const director = await principalFor("FATMA_JUMA");
    const demo = (await listFoundations(director)).find((f) => f.code === "BEYU-FDN-01");
    await expect(getFoundation(sector, demo!.id)).rejects.toMatchObject({
      name: "FoundationError",
      code: "NOT_FOUND",
    });
  });

  it("global governance roles retain enterprise oversight of sector foundations", async () => {
    // GROUP_CFO is a global-governance role: enterprise oversight of the
    // foundation tenant is BY DESIGN, not a leak. Sector confinement is proven
    // by the health-operator case above.
    const cfo = await principalFor("DAUDI_MOSHI");
    const rows = await listFoundations(cfo);
    expect(rows.map((r) => r.code)).toContain("BEYU-FDN-01");
  });

  it("a foundation principal sees no foundations outside the foundation tenant", async () => {
    const director = await principalFor("FATMA_JUMA");
    const rows = await listFoundations(director);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenantId === director.tenantId)).toBe(true);
  });
});

describe("mutation governance", () => {
  it("illegal lifecycle jumps are rejected; legal steps persist with audit", async () => {
    const director = await principalFor("FATMA_JUMA");
    const ctx = ctxFor(director);
    const created = await createFoundation(ctx, {
      code: `FDN-TEST-${RUN}`,
      legalName: `Test Foundation ${RUN}`,
      legalVehicle: "FOUNDATION",
      countryCode: "TZ",
    });
    createdFoundationIds.push(created.id);
    expect((await getFoundation(director, created.id)).status).toBe("PROPOSED");

    await expect(transitionFoundation(ctx, created.id, "ACTIVE")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    const moved = await transitionFoundation(ctx, created.id, "FORMATION");
    expect(moved.status).toBe("FORMATION");

    const audit = await db.execute<{ n: string }>(sql`
      select count(*)::text as n from audit_log
      where object_type = 'FOUNDATION' and object_id = ${created.id}
    `);
    expect(Number(audit.rows[0].n)).toBeGreaterThanOrEqual(2);
  });

  it("approval-gated transitions require a governance reference", async () => {
    const director = await principalFor("FATMA_JUMA");
    const ctx = ctxFor(director);
    const created = await createFoundation(ctx, {
      code: `FDN-APR-${RUN}`,
      legalName: `Approval Probe ${RUN}`,
      legalVehicle: "FOUNDATION",
      countryCode: "TZ",
    });
    createdFoundationIds.push(created.id);
    await transitionFoundation(ctx, created.id, "FORMATION");
    await transitionFoundation(ctx, created.id, "REGISTRATION_PENDING");
    await expect(transitionFoundation(ctx, created.id, "REGISTERED")).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
    const registered = await transitionFoundation(ctx, created.id, "REGISTERED", "TEST-RES-001");
    expect(registered.status).toBe("REGISTERED");
  });

  it("an out-of-scope principal cannot mutate the demo foundation", async () => {
    const sector = await principalFor("SARA_LEMA");
    const director = await principalFor("FATMA_JUMA");
    const demo = (await listFoundations(director)).find((f) => f.code === "BEYU-FDN-01");
    await expect(
      transitionFoundation(ctxFor(sector), demo!.id, "FORMATION"),
    ).rejects.toBeInstanceOf(FoundationError);
  });

  it("FoundationError maps to governed HTTP statuses", () => {
    expect(new FoundationError("NOT_FOUND", "x").status).toBe(404);
    expect(new FoundationError("FORBIDDEN", "x").status).toBe(403);
    expect(new FoundationError("CONFLICT", "x").status).toBe(409);
    expect(new FoundationError("INVALID_TRANSITION", "x").status).toBe(422);
    expect(new FoundationError("APPROVAL_REQUIRED", "x").status).toBe(403);
  });
});
