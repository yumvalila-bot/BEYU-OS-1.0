/**
 * Phase 9 — HCM consumption: ONE employee master, tenant-scoped, clearance-gated.
 *
 * Sector OSs consume this. They must not obtain another tenant's workforce, and
 * they must not see compensation below the RESTRICTED ceiling.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "@/lib/authz";
import { HcmError, HCM_VERSION, listWorkforce } from "@/lib/hcm";
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

describe("HCM workforce consumption", () => {
  it("versions are pinned", () => {
    expect(HCM_VERSION).toBe("hcm-1.0.0");
  });

  it("POSITIVE: an authorised principal reads the single employee master", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const result = await listWorkforce(hcm);
    expect(result.source).toBe("people.employees");
    expect(result.records.length).toBe(7);
    expect(new Set(result.records.map((r) => r.employeeNo)).size).toBe(result.records.length);
    expect(result.records.every((r) => r.partyId.startsWith("PTY_"))).toBe(true);
  });

  it("NEGATIVE: a principal without hcm:employee.read is denied", async () => {
    const cfo = await principalFor("DAUDI_MOSHI");
    expect(cfo.permissions.has("hcm:employee.read")).toBe(false);
    await expect(listWorkforce(cfo)).rejects.toBeInstanceOf(HcmError);
  });

  it("compensation is stripped below RESTRICTED clearance", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const lowered: Principal = { ...hcm, clearance: "CONFIDENTIAL" };
    const result = await listWorkforce(lowered);
    expect(result.suppressedCompensation).toBe(true);
    expect(result.records.every((r) => r.baseSalary === null)).toBe(true);
  });

  it("POSITIVE: RESTRICTED clearance sees pay", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    expect(hcm.clearance).toBe("RESTRICTED");
    const result = await listWorkforce(hcm);
    expect(result.suppressedCompensation).toBe(false);
    expect(result.records.some((r) => r.baseSalary !== null)).toBe(true);
  });
});
