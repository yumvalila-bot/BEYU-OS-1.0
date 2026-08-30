import {
  hasPermission,
  permissionsForRole,
  effectivePermissions,
  roleDefinition,
  ROLE_DEFINITIONS,
} from "./permissions";

describe("Canonical permission model (Phase 1 authorization)", () => {
  it("grants clinicians prescribing authority", () => {
    expect(hasPermission("doctor", "rx:write")).toBe(true);
    expect(hasPermission("doctor", "phi:read")).toBe(true);
  });

  it("denies patients clinical authority", () => {
    expect(hasPermission("patient", "rx:write")).toBe(false);
    expect(hasPermission("patient", "phi:write")).toBe(false);
    expect(hasPermission("patient", "phi:read")).toBe(true);
  });

  it("denies unknown roles by default", () => {
    expect(permissionsForRole("unknown-role")).toEqual([]);
    expect(hasPermission("unknown-role", "phi:read")).toBe(false);
  });

  it("enforces least privilege for trustee (read-only PHI)", () => {
    expect(hasPermission("trustee", "phi:write")).toBe(false);
    expect(hasPermission("trustee", "trustee:veto")).toBe(true);
  });

  it("separates pharmacy dispensing from prescribing", () => {
    expect(hasPermission("pharmacy", "rx:dispense")).toBe(true);
    expect(hasPermission("pharmacy", "rx:write")).toBe(false);
    expect(hasPermission("pharmacy-chief", "rx:controlled")).toBe(true);
  });

  it("combines role permissions with explicit grants", () => {
    const effective = effectivePermissions("patient", ["phi:write"]);
    expect(effective.has("phi:read")).toBe(true);
    expect(effective.has("phi:write")).toBe(true);
    expect(effective.has("rx:write")).toBe(false);
  });

  it("maintains a non-empty catalog with unique role ids", () => {
    expect(ROLE_DEFINITIONS.length).toBeGreaterThan(0);
    const ids = new Set(ROLE_DEFINITIONS.map((r) => r.id));
    expect(ids.size).toBe(ROLE_DEFINITIONS.length);
    expect(roleDefinition("doctor")?.cadre).toBe("Clinical");
  });
});
