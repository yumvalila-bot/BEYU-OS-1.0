import { afterAll, describe, expect, it } from "vitest";
import {
  can,
  clearanceForRoles,
  filterByClearance,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";
import { classificationRank } from "../../src/lib/constants";

/**
 * Iteration 7 — ABAC decision-unit depth.
 * Pure unit coverage of the can() decision lattice, clearance ordering,
 * fail-closed filtering, and emergency-grant semantics (RBAC-only elevation).
 */

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["SECTOR_OPERATOR"];
  return {
    userId: "USR_TEST",
    partyId: "PTY_TEST",
    email: "test@beyu.os",
    displayName: "Test Principal",
    tenantId: "TEN_BEYU_GROUP",
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_TEST",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  };
}

describe("Iteration 7 ABAC decision lattice", () => {
  it("classification ranks are strictly ordered and stable", () => {
    const order = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"];
    const ranks = order.map((c) => classificationRank(c as never));
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    // Unknown classification ranks as the most restrictive (fail closed).
    expect(classificationRank("UNKNOWN" as never)).toBeGreaterThanOrEqual(ranks[4]);
  });

  it("clearanceForRoles takes the maximum; unknown roles default to INTERNAL", () => {
    expect(clearanceForRoles(["SECTOR_OPERATOR"])).toBe("CONFIDENTIAL");
    expect(clearanceForRoles(["GROUP_CEO"])).toBe("HIGHLY_RESTRICTED");
    expect(clearanceForRoles(["SECTOR_OPERATOR", "GROUP_CEO"])).toBe("HIGHLY_RESTRICTED");
    expect(clearanceForRoles([])).toBe("PUBLIC");
    expect(clearanceForRoles(["UNKNOWN_ROLE_XYZ"])).toBe("INTERNAL");
  });

  it("filterByClearance removes rows above the principal's clearance", () => {
    const p = principal({ clearance: "CONFIDENTIAL" });
    const rows = [
      { id: 1, classification: "PUBLIC" },
      { id: 2, classification: "CONFIDENTIAL" },
      { id: 3, classification: "HIGHLY_RESTRICTED" },
      { id: 4, classification: null },
    ];
    const ids = filterByClearance(p, rows).map((r) => r.id);
    expect(ids).toEqual([1, 2, 4]);
  });

  it("filterByClearance fails closed for an unknown principal clearance", () => {
    const p = principal({ clearance: "MEGA-SECRET" as never });
    expect(filterByClearance(p, [{ id: 1, classification: "PUBLIC" }])).toEqual([]);
  });

  it("a missing grant is denied first, even under a benign context", () => {
    const d = can(principal({ permissions: new Set() }), "finance:capital.read");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/RBAC/);
  });

  it("classification ABAC denial fires even when the RBAC grant exists", () => {
    const p = principal({ permissions: new Set(["documents:registry.read"]), clearance: "INTERNAL" });
    const d = can(p, "documents:registry.read", { classification: "HIGHLY_RESTRICTED" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/ABAC: clearance/);
  });

  it("tenant ABAC denial fires even when the RBAC grant exists", () => {
    const p = principal({ permissions: new Set(["finance:capital.read"]) });
    const d = can(p, "finance:capital.read", { tenantId: "TEN_OTHER" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Tenant isolation/);
  });

  it("entity ABAC denial fires even when the RBAC grant exists", () => {
    const p = principal({ permissions: new Set(["finance:capital.read"]), entityScope: ["LEN_A"] });
    const d = can(p, "finance:capital.read", { entityId: "LEN_B" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/entity outside/);
  });

  it("empty entityScope means all entities within the tenant subtree", () => {
    const p = principal({ permissions: new Set(["finance:capital.read"]), entityScope: [] });
    expect(can(p, "finance:capital.read", { entityId: "ANY_ENTITY" }).allowed).toBe(true);
  });

  it("emergency permissions elevate RBAC only — ABAC checks still apply", () => {
    // Grant via emergency channel, no role grant:
    const p = principal({
      permissions: new Set(),
      emergencyPermissions: ["documents:registry.read"],
      clearance: "INTERNAL",
    });
    expect(can(p, "documents:registry.read").allowed).toBe(true);
    // ...but the classification ceiling still holds:
    const hi = can(p, "documents:registry.read", { classification: "HIGHLY_RESTRICTED" });
    expect(hi.allowed).toBe(false);
    expect(hi.reason).toMatch(/ABAC: clearance/);
    // ...and the entity scope still holds:
    const scoped = { ...p, entityScope: ["LEN_A"] };
    const ent = can(scoped, "documents:registry.read", { entityId: "OUTSIDE" });
    expect(ent.allowed).toBe(false);
    expect(ent.reason).toMatch(/entity outside/);
  });

  it("high-risk emergency elevation still requires step-up authentication", () => {
    const p = principal({
      permissions: new Set(),
      emergencyPermissions: ["finance:waterfall.commit"],
      mfaSatisfied: false,
    });
    const d = can(p, "finance:waterfall.commit");
    expect(d.allowed).toBe(false);
    expect(d.requiresMfa).toBe(true);
  });

  it("non-high-risk permissions do not demand MFA step-up", () => {
    const p = principal({ permissions: new Set(["documents:registry.read"]), mfaSatisfied: false });
    expect(can(p, "documents:registry.read").allowed).toBe(true);
  });
});

afterAll(async () => undefined);
