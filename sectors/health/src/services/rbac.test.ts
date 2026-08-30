import { describe, it, expect } from "vitest";
import { can, roleFor, ROLES_RBAC } from "./rbac";

describe("RBAC foundation (Phase 1 authorization source of truth)", () => {
  it("maps application roles to canonical RBAC role ids", () => {
    expect(roleFor("doctor").id).toBe("doctor");
    expect(roleFor("pharmacy").id).toBe("pharmacy-chief");
    expect(roleFor("finance").id).toBe("cfo");
    // Unknown roles must fall back to the least-privilege patient role.
    expect(roleFor("unknown-role").id).toBe("patient");
  });

  it("allows clinicians to prescribe but not patients", () => {
    expect(can("doctor", "rx:write")).toBe(true);
    expect(can("patient", "rx:write")).toBe(false);
  });

  it("allows patients to read only their own record", () => {
    expect(can("patient", "phi:read")).toBe(true);
    expect(can("patient", "phi:write")).toBe(false);
    expect(can("patient", "patient:write")).toBe(false);
  });

  it("enforces least privilege for the trustee role (read-only PHI by design)", () => {
    expect(can("trustee", "phi:write")).toBe(false);
    expect(can("trustee", "trustee:veto")).toBe(true);
    expect(can("trustee", "audit:export")).toBe(true);
  });

  it("grants pharmacists dispensing authority but not prescribing", () => {
    expect(can("pharmacy", "rx:dispense")).toBe(true);
    expect(can("pharmacy", "rx:write")).toBe(false);
  });

  it("keeps a complete, non-empty role catalog", () => {
    expect(ROLES_RBAC.length).toBeGreaterThan(0);
    const ids = new Set(ROLES_RBAC.map((r) => r.id));
    expect(ids.size).toBe(ROLES_RBAC.length); // no duplicate ids
  });
});
