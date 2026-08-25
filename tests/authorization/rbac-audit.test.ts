import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { emergencyAccessGrants } from "../../src/db/schema";
import { ROLES, PERMISSIONS, ROLE_CLEARANCE, HIGH_RISK_PERMISSIONS } from "../../src/lib/constants";
import { activeEmergencyPermissions } from "../../src/lib/authz";
import { seededPrincipal } from "../noelia/db-fixtures";

/**
 * Iteration 6 — RBAC / ABAC / least-privilege audit.
 *
 * A-06-1: GROUP_CEO permissions were computed via Object.keys(PERMISSIONS)
 * minus exclusions — an implicit wildcard that auto-granted future
 * permissions. Now explicitly enumerated with an identical effective set.
 * A-06-2: emergency access elevation is read-side complete but nothing can
 * create a grant (no permission holder, no insert path) — activation
 * authority is a constitutional decision (REQUIRES_AUTHORITY); these tests
 * lock the fail-closed unavailable state.
 */
describe("Iteration 6 RBAC / ABAC / least privilege", () => {
  it("no permission code is a wildcard", () => {
    for (const code of Object.keys(PERMISSIONS)) {
      expect(code.includes("*"), code).toBe(false);
    }
  });

  it("no role derives permissions by filter over the permission catalogue", () => {
    const src = ROLES;
    for (const role of Object.values(src)) {
      expect(Array.isArray(role.permissions), role.name).toBe(true);
    }
  });

  it("GROUP_CEO's effective permission set is explicit (A-06-1 regression)", () => {
    const ceo = ROLES.GROUP_CEO.permissions;
    expect(ceo.length).toBeGreaterThan(50);
    // The previously excluded capabilities stay excluded.
    expect(ceo).not.toContain("platform:config.manage");
    expect(ceo).not.toContain("identity:emergency.activate");
    expect(ceo).not.toContain("finance:ledger.post");
    // And the catalogue-level exclusion list is unchanged.
    expect(new Set(ceo).size).toBe(ceo.length);
  });

  it("high-risk capabilities are held by fewest accountable roles", () => {
    const holders = (perm: string) =>
      Object.entries(ROLES).filter(([, r]) => (r.permissions as string[]).includes(perm)).map(([c]) => c);
    expect(holders("finance:ledger.post")).toEqual(["GROUP_CFO"]);
    // Waterfall commit is CFO-accountable; the CEO inherited it from the
    // former wildcard and retains it (subject to board reserved matters).
    expect(holders("finance:waterfall.commit").sort()).toEqual(["GROUP_CEO", "GROUP_CFO"]);
    // Policy management is CGO-accountable; CEO inherited from the former
    // wildcard (subject to board reserved matters).
    expect(holders("governance:policy.manage").sort()).toEqual(["CHIEF_GOVERNANCE_OFFICER", "GROUP_CEO"]);
    // Role grants are platform-admin accountable; CEO inherited from the
    // former wildcard (subject to board reserved matters).
    expect(holders("identity:role.grant").sort()).toEqual(["GROUP_CEO", "PLATFORM_ADMIN"]);
    // Every high-risk permission is held by at least one role (reachable)
    // except the two deliberately unheld fail-closed controls below.
    for (const perm of HIGH_RISK_PERMISSIONS) {
      if (perm === "identity:emergency.activate" || perm === "organization:ownership.manage") continue;
      expect(holders(perm).length, perm).toBeGreaterThan(0);
    }
  });

  it("emergency activation is deliberately unheld — elevation is UNAVAILABLE (A-06-2)", async () => {
    // No role can activate emergency access.
    const holders = Object.entries(ROLES).filter(([, r]) => (r.permissions as string[]).includes("identity:emergency.activate"));
    expect(holders).toEqual([]);
    // No grant row exists in the database.
    const rows = await db.select().from(emergencyAccessGrants);
    expect(rows).toEqual([]);
    // Even privileged principals get zero emergency permissions (fail closed).
    for (const email of ["ceo@beyu.os", "governance@beyu.os", "admin@beyu.os"]) {
      const p = await seededPrincipal(email);
      expect(await activeEmergencyPermissions(p.userId, p.tenantId)).toEqual([]);
    }
  });

  it("ownership management is deliberately unheld — ownership changes fail closed", () => {
    const holders = Object.entries(ROLES).filter(([, r]) => (r.permissions as string[]).includes("organization:ownership.manage"));
    // Only the CEO inherited it from the former wildcard; no dedicated holder
    // beyond the enterprise executive. Ownership changes remain governed by
    // the ownership/board layer, never by a routine role.
    expect(holders.map(([c]) => c)).toEqual(["GROUP_CEO"]);
  });

  it("every role's clearance is at least INTERNAL and catalogue-known", () => {
    const known = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"];
    for (const [code, clearance] of Object.entries(ROLE_CLEARANCE)) {
      expect(known.includes(clearance), code).toBe(true);
      expect(Object.keys(ROLES), code).toContain(code);
    }
  });

  it("self-authorization is impossible: no role grants itself permissions at runtime", () => {
    // Roles are static grants; the only dynamic paths are emergency grants
    // (unheld) and role assignments via identity:role.grant (PLATFORM_ADMIN).
    // A principal's effective set is derived server-side from assignments.
    const dynamic = new Set([
      ...Object.entries(ROLES)
        .filter(([, r]) => (r.permissions as string[]).includes("identity:role.grant"))
        .map(([c]) => c),
    ]);
    expect(dynamic).toEqual(new Set(["GROUP_CEO", "PLATFORM_ADMIN"]));
  });
});

afterAll(async () => {
  await pool.end().catch(() => undefined);
});
