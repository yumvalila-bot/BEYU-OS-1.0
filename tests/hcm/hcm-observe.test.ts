/**
 * HCM-1 — observation, single-record consumption, quality, org read, write chain.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "@/lib/authz";
import { HcmError } from "@/lib/hcm";
import {
  assertOrgAcyclic,
  assessWorkforceQuality,
  getEmployee,
  getEmployment,
  listOrganizations,
  observeWorkforce,
  proposeEmploymentChange,
} from "@/lib/hcm-observe";
import { fixedId, ID_PREFIX } from "@/lib/ids";

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

describe("HCM-1 single-record consumption", () => {
  it("POSITIVE: getEmployee returns the same master row", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const id = fixedId(ID_PREFIX.employee, "ASHA_NDULU");
    const one = await getEmployee(hcm, id);
    expect(one.source).toBe("people.employees");
    expect(one.employee.employeeId).toBe(id);
    expect(one.employee.globalUserId).toBe(fixedId(ID_PREFIX.user, "ASHA_NDULU"));
  });

  it("out-of-scope and missing ids are indistinguishable NOT_FOUND", async () => {
    const sara = await principalFor("SARA_LEMA");
    await expect(getEmployee(sara, fixedId(ID_PREFIX.employee, "AMANI_BEYU"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getEmployee(sara, "EMP_NOPE")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("employment view is derived, not a second master", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const id = fixedId(ID_PREFIX.employee, "ASHA_NDULU");
    const emp = await getEmployment(hcm, id);
    expect(emp.source).toBe("people.employees + people.employment_events");
    expect(emp.history.length).toBeGreaterThan(0);
    expect(emp.history.every((e) => e.employeeId === id)).toBe(true);
  });
});

describe("HCM-1 observation and quality", () => {
  it("observed headcount is not a fabricated zero", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const obs = await observeWorkforce(hcm);
    expect(obs.basis).toBe("OBSERVED");
    expect(obs.headcount).toBe(7);
    expect(obs.active).toBe(7);
    expect(obs.managerSpanBasis).toBe("DATA_NOT_AVAILABLE");
    expect(obs.explanation.join(" ")).toMatch(/No turnover rate/);
  });

  it("empty entity scope is DATA_NOT_AVAILABLE, not headcount 0", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const obs = await observeWorkforce({ ...hcm, entityScope: ["LEN_DOES_NOT_EXIST"] });
    expect(obs.basis).toBe("DATA_NOT_AVAILABLE");
    expect(obs.headcount).toBeNull();
    expect(obs.explanation.join(" ")).toMatch(/not a headcount of zero/);
  });

  it("organization seed is DATA_NOT_AVAILABLE, not a fake tree", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const orgs = await listOrganizations(hcm);
    expect(orgs.source).toBe("core.org_units");
    expect(orgs.basis).toBe("DATA_NOT_AVAILABLE");
    expect(orgs.records).toEqual([]);
  });

  it("org cycles fail independently", () => {
    expect(() =>
      assertOrgAcyclic([
        { id: "A", parentUnitId: "B" },
        { id: "B", parentUnitId: "A" },
      ]),
    ).toThrow(/cycles/);
  });

  it("quality scan is advisory and does not invent repairs", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const q = await assessWorkforceQuality(hcm);
    expect(q.source).toBe("people.employees");
    expect(q.scanned).toBe(7);
    expect(q.findings.every((f) => f.advisoryOnly)).toBe(true);
    expect(q.findings.filter((f) => f.code === "DUPLICATE_EMPLOYEE_NO")).toHaveLength(0);
  });

  it("CFO cannot observe or scan", async () => {
    const cfo = await principalFor("DAUDI_MOSHI");
    await expect(observeWorkforce(cfo)).rejects.toBeInstanceOf(HcmError);
    await expect(assessWorkforceQuality(cfo)).rejects.toBeInstanceOf(HcmError);
    await expect(listOrganizations(cfo)).rejects.toBeInstanceOf(HcmError);
  });
});

describe("HCM-1 write chain is SIMULATION and never mutates", () => {
  it("missing principal is DENIED", () => {
    const r = proposeEmploymentChange(null, { from: "ACTIVE", to: "TERMINATED", eventType: "TERMINATION" });
    expect(r.classification).toBe("SIMULATION");
    expect(r.decision).toBe("DENIED");
    expect(r.mutated).toBe(false);
  });

  it("authorised HCM director still cannot write — AUTHORITY_CHAIN_INCOMPLETE", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const r = proposeEmploymentChange(hcm, { from: "ACTIVE", to: "TERMINATED", eventType: "TERMINATION" });
    expect(r.classification).toBe("SIMULATION");
    expect(r.decision).toBe("AUTHORITY_CHAIN_INCOMPLETE");
    expect(r.mutated).toBe(false);
    expect(r.stages.some((s) => s.stage === "AUTHORITY" && !s.passed)).toBe(true);
  });

  it("illegal transition is independent of the authority stage", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const r = proposeEmploymentChange(hcm, { from: "TERMINATED", to: "ACTIVE", eventType: "HIRE" });
    expect(r.decision).toBe("INVALID_LIFECYCLE_TRANSITION");
    expect(r.mutated).toBe(false);
  });
});
