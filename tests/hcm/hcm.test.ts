/**
 * Phase 9 / 12 — HCM: ONE employee master, tenant/entity scoped, clearance-gated.
 *
 * Sector OSs consume this. They must not obtain another tenant's workforce, and
 * they must not see compensation below the RESTRICTED ceiling.
 *
 * Fault injections are independent: a control hidden behind an earlier denial
 * is extracted and tested on its own.
 */
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, tenants, users } from "@/db/schema";
import { clearanceForRoles, filterByClearance, loadGrants, permissionsForRoles, type Principal } from "@/lib/authz";
import {
  HcmError,
  HcmIntegrityError,
  HCM_VERSION,
  assertEffectiveDates,
  assertManagerAcyclic,
  assertManagerNotSelf,
  assertManagerSameScope,
  classifyEmploymentEventTemporal,
  classifyEmploymentTemporal,
  evaluateEmploymentTransition,
  listEmploymentHistory,
  listEstablishment,
  listWorkforce,
  recordEmploymentChange,
} from "@/lib/hcm";
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
    expect(HCM_VERSION).toBe("hcm-1.3.0");
  });

  it("POSITIVE: an authorised principal reads the single employee master", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const result = await listWorkforce(hcm);
    expect(result.source).toBe("people.employees");
    expect(result.records.length).toBe(7);
    expect(new Set(result.records.map((r) => r.employeeNo)).size).toBe(result.records.length);
    expect(result.records.every((r) => r.partyId.startsWith("PTY_"))).toBe(true);
    expect(result.records.every((r) => r.globalUserId?.startsWith("USR_"))).toBe(true);
    expect(result.records.every((r) => r.legalEntityId.startsWith("LEN_"))).toBe(true);
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
    expect(result.records.length).toBe(7);
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

describe("HCM tenant / entity isolation", () => {
  it("a sector operator sees only employees of entities in their tenant", async () => {
    const sara = await principalFor("SARA_LEMA");
    expect(sara.tenantType).toBe("SECTOR");
    const result = await listWorkforce(sara);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.every((r) => r.legalEntityTenantId === sara.tenantId)).toBe(true);
    expect(result.records.every((r) => r.employeeNo === "BEYU-EMP-00006")).toBe(true);
    expect(result.records.some((r) => r.employeeNo === "BEYU-EMP-00001")).toBe(false);
  });

  it("entityScope filters independently of tenant reach", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const health = fixedId(ID_PREFIX.legalEntity, "BEYU_HEALTH_LTD");
    const result = await listWorkforce({ ...hcm, entityScope: [health] });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.every((r) => r.legalEntityId === health)).toBe(true);
    expect(result.records.length).toBeLessThan(7);
  });

  it("a forged entity scope cannot enlarge visibility", async () => {
    const sara = await principalFor("SARA_LEMA");
    const holdings = fixedId(ID_PREFIX.legalEntity, "BEYU_HOLDINGS");
    const result = await listWorkforce({ ...sara, entityScope: [holdings] });
    expect(result.records).toEqual([]);
  });

  it("unknown clearance fails closed independently of RBAC", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const forged: Principal = { ...hcm, clearance: "SUPER_ADMIN" as Principal["clearance"] };
    const result = await listWorkforce(forged);
    expect(result.records).toEqual([]);
    expect(result.suppressedCompensation).toBe(true);
    expect(filterByClearance(forged, [{ classification: "PUBLIC" }])).toEqual([]);
  });
});

describe("HCM temporal classification (extracted — not masked by RBAC)", () => {
  const asOf = "2024-06-01";

  it("a future hire is FUTURE, not CURRENT", () => {
    expect(classifyEmploymentTemporal({ status: "ACTIVE", hireDate: "2025-01-01", endDate: null, asOf })).toBe(
      "FUTURE",
    );
  });

  it("a terminated employee is TERMINATED even if endDate is missing", () => {
    expect(classifyEmploymentTemporal({ status: "TERMINATED", hireDate: "2020-01-01", endDate: null, asOf })).toBe(
      "TERMINATED",
    );
  });

  it("a past endDate that is not TERMINATED is EXPIRED, not ACTIVE", () => {
    expect(
      classifyEmploymentTemporal({ status: "ACTIVE", hireDate: "2020-01-01", endDate: "2023-12-31", asOf }),
    ).toBe("EXPIRED");
  });

  it("an in-force employee is CURRENT", () => {
    expect(classifyEmploymentTemporal({ status: "ACTIVE", hireDate: "2020-01-01", endDate: null, asOf })).toBe(
      "CURRENT",
    );
    expect(classifyEmploymentTemporal({ status: "ON_LEAVE", hireDate: "2020-01-01", endDate: "2024-12-31", asOf })).toBe(
      "CURRENT",
    );
  });

  it("employment events distinguish HISTORICAL / CURRENT / FUTURE", () => {
    expect(classifyEmploymentEventTemporal("2020-01-01", asOf)).toBe("HISTORICAL");
    expect(classifyEmploymentEventTemporal(asOf, asOf)).toBe("CURRENT");
    expect(classifyEmploymentEventTemporal("2025-01-01", asOf)).toBe("FUTURE");
  });

  it("rejects a malformed asOf rather than defaulting", () => {
    expect(() =>
      classifyEmploymentTemporal({ status: "ACTIVE", hireDate: "2020-01-01", endDate: null, asOf: "June 2024" }),
    ).toThrow(/ISO date/);
  });

  it("seeded employees are CURRENT at a date after every hire", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const result = await listWorkforce(hcm, { asOf: "2026-01-01" });
    expect(result.records.every((r) => r.temporalClass === "CURRENT")).toBe(true);
  });

  it("seeded employees are FUTURE when asOf precedes every hire", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const result = await listWorkforce(hcm, { asOf: "2010-01-01" });
    expect(result.records.every((r) => r.temporalClass === "FUTURE")).toBe(true);
  });
});

describe("HCM lifecycle primitive — evaluates, never writes", () => {
  it("ACTIVE → TERMINATED via TERMINATION is structurally admissible", () => {
    const v = evaluateEmploymentTransition({ from: "ACTIVE", to: "TERMINATED", eventType: "TERMINATION" });
    expect(v.permitted).toBe(true);
  });

  it("TERMINATED → ACTIVE without REHIRE fails independently", () => {
    const v = evaluateEmploymentTransition({ from: "TERMINATED", to: "ACTIVE", eventType: "HIRE" });
    expect(v.permitted).toBe(false);
    expect(v.decision).toBe("REQUIRES_REHIRE");
  });

  it("unknown statuses fail closed", () => {
    const v = evaluateEmploymentTransition({ from: "GHOST", to: "ACTIVE", eventType: "HIRE" });
    expect(v.permitted).toBe(false);
    expect(v.decision).toBe("UNKNOWN_STATE");
  });

  it("an authorised HCM director still cannot mutate — REQUIRES_AUTHORITY, mutated false", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(employees);
    const result = recordEmploymentChange(hcm, { from: "ACTIVE", to: "TERMINATED", eventType: "TERMINATION" });
    expect(result.decision).toBe("REQUIRES_AUTHORITY");
    expect(result.mutated).toBe(false);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(employees);
    expect(after[0].n).toBe(before[0].n);
  });

  it("CFO is denied before the authority question is asked", async () => {
    const cfo = await principalFor("DAUDI_MOSHI");
    const result = recordEmploymentChange(cfo, { from: "ACTIVE", to: "TERMINATED", eventType: "TERMINATION" });
    expect(result.decision).toBe("DENIED");
    expect(result.mutated).toBe(false);
  });
});

describe("HCM integrity invariants (extracted)", () => {
  it("rejects a self-manager", () => {
    expect(() => assertManagerNotSelf("EMP_A", "EMP_A")).toThrow(HcmIntegrityError);
  });

  it("rejects a circular manager graph", () => {
    expect(() =>
      assertManagerAcyclic([
        { id: "A", managerEmployeeId: "B" },
        { id: "B", managerEmployeeId: "A" },
      ]),
    ).toThrow(/cycles/);
  });

  it("accepts an acyclic tree", () => {
    expect(() =>
      assertManagerAcyclic([
        { id: "A", managerEmployeeId: null },
        { id: "B", managerEmployeeId: "A" },
        { id: "C", managerEmployeeId: "B" },
      ]),
    ).not.toThrow();
  });

  it("rejects a cross-tenant or cross-entity manager", () => {
    expect(() =>
      assertManagerSameScope(
        { id: "E1", tenantId: "TEN_A", legalEntityId: "LEN_A" },
        { id: "E2", tenantId: "TEN_B", legalEntityId: "LEN_A" },
      ),
    ).toThrow(/outside/);
    expect(() =>
      assertManagerSameScope(
        { id: "E1", tenantId: "TEN_A", legalEntityId: "LEN_A" },
        { id: "E2", tenantId: "TEN_A", legalEntityId: "LEN_B" },
      ),
    ).toThrow(/outside/);
  });

  it("rejects endDate before hireDate", () => {
    expect(() => assertEffectiveDates("2024-06-01", "2024-01-01")).toThrow(/endDate/);
  });

  it("live seed has no manager cycles and unique parties", async () => {
    const rows = await db
      .select({
        id: employees.id,
        partyId: employees.partyId,
        managerEmployeeId: employees.managerEmployeeId,
      })
      .from(employees);
    expect(() => assertManagerAcyclic(rows)).not.toThrow();
    expect(new Set(rows.map((r) => r.partyId)).size).toBe(rows.length);
  });
});

describe("HCM history and establishment reuse the same gate", () => {
  it("employment history is limited to visible employees", async () => {
    const sara = await principalFor("SARA_LEMA");
    const events = await listEmploymentHistory(sara);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.employeeNo === "BEYU-EMP-00006")).toBe(true);
  });

  it("CFO cannot read establishment", async () => {
    const cfo = await principalFor("DAUDI_MOSHI");
    await expect(listEstablishment(cfo)).rejects.toBeInstanceOf(HcmError);
  });

  it("HCM director reads the seeded establishment", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const positions = await listEstablishment(hcm);
    expect(positions.length).toBeGreaterThanOrEqual(5);
    expect(new Set(positions.map((p) => p.code)).size).toBe(positions.length);
  });
});

describe("HCM does not execute financially", () => {
  it("listWorkforce does not change employees, journals or capabilities", async () => {
    const n = async (q: ReturnType<typeof sql>) =>
      Number(((await db.execute(q)) as unknown as { rows: Array<{ n: number }> }).rows[0].n);
    const before = {
      emp: await n(sql`select count(*)::int as n from employees`),
      je: await n(sql`select count(*)::int as n from journal_entries`),
      locked: await n(
        sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`,
      ),
    };
    const hcm = await principalFor("ASHA_NDULU");
    await listWorkforce(hcm);
    await listEmploymentHistory(hcm);
    recordEmploymentChange(hcm, { from: "ACTIVE", to: "ON_LEAVE", eventType: "LEAVE" });
    expect(await n(sql`select count(*)::int as n from employees`)).toBe(before.emp);
    expect(await n(sql`select count(*)::int as n from journal_entries`)).toBe(before.je);
    expect(
      await n(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`),
    ).toBe(before.locked);
  });
});
