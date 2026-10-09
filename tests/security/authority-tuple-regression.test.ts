import { describe, expect, it } from "vitest";
import { can, type AuthorityGrant, type Principal } from "../../src/lib/authz";
import { hasGlobalGovernanceScope } from "../../src/lib/tenant-scope";

function grant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    sourceId: "RAS_A",
    source: "ROLE_ASSIGNMENT",
    role: "GROUP_CFO",
    permission: "finance:ledger.read",
    tenantId: "TEN_A",
    legalEntityId: "LEN_A",
    countryCode: "TZ",
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function principal(authorityGrants: AuthorityGrant[]): Principal {
  return {
    userId: "USR_TUPLE",
    partyId: "PTY_TUPLE",
    email: "tuple@example.test",
    displayName: "Tuple Test",
    tenantId: "TEN_A",
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles: ["GROUP_CFO", "CHIEF_GOVERNANCE_OFFICER"],
    permissions: new Set(["finance:ledger.read", "ai:compliance.write"]),
    clearance: "HIGHLY_RESTRICTED",
    entityScope: ["LEN_A", "LEN_B"],
    countryScope: ["TZ", "KE"],
    mfaSatisfied: true,
    sessionId: "SES_TUPLE",
    riskScore: 0,
    emergencyPermissions: [],
    authorityGrants,
  };
}

describe("inseparable authority tuple regression", () => {
  it("does not recombine permission/entity/country dimensions across grants", () => {
    const p = principal([
      grant({ sourceId: "RAS_FINANCE_A", legalEntityId: "LEN_A", countryCode: "TZ" }),
      grant({
        sourceId: "RAS_COMPLIANCE_B",
        role: "CHIEF_GOVERNANCE_OFFICER",
        permission: "ai:compliance.write",
        legalEntityId: "LEN_B",
        countryCode: "KE",
      }),
    ]);
    expect(can(p, "finance:ledger.read", { tenantId: "TEN_A", entityId: "LEN_A", countryCode: "TZ" }).allowed).toBe(true);
    expect(can(p, "finance:ledger.read", { tenantId: "TEN_A", entityId: "LEN_B", countryCode: "KE" }).allowed).toBe(false);
    expect(can(p, "ai:compliance.write", { tenantId: "TEN_A", entityId: "LEN_A", countryCode: "TZ" }).allowed).toBe(false);
  });

  it("fails closed for omitted constrained dimensions and tenant/country mismatches", () => {
    const p = principal([grant()]);
    expect(can(p, "finance:ledger.read", { tenantId: "TEN_A", entityId: null, countryCode: "TZ" }).allowed).toBe(false);
    expect(can(p, "finance:ledger.read", { tenantId: "TEN_B", entityId: "LEN_A", countryCode: "TZ" }).allowed).toBe(false);
    expect(can(p, "finance:ledger.read", { tenantId: "TEN_A", entityId: "LEN_A", countryCode: "KE" }).allowed).toBe(false);
  });

  it("rejects expired, future, and presentation-only grants", () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    expect(can(principal([grant({ validTo: past })]), "finance:ledger.read", { tenantId: "TEN_A", entityId: "LEN_A", countryCode: "TZ" }).allowed).toBe(false);
    expect(can(principal([grant({ validFrom: future })]), "finance:ledger.read", { tenantId: "TEN_A", entityId: "LEN_A", countryCode: "TZ" }).allowed).toBe(false);
    expect(can(principal([]), "finance:ledger.read", { tenantId: "TEN_A", entityId: "LEN_A", countryCode: "TZ" }).allowed).toBe(false);
  });

  it("requires an actual explicitly unscoped qualifying assignment for global scope", () => {
    const scoped = principal([grant({ role: "CHIEF_GOVERNANCE_OFFICER", permission: "ai:compliance.write", legalEntityId: null, countryCode: null })]);
    expect(hasGlobalGovernanceScope(scoped)).toBe(false);

    const explicit = principal([grant({
      sourceId: "RAS_GLOBAL",
      role: "CHIEF_GOVERNANCE_OFFICER",
      permission: "ai:compliance.write",
      tenantId: null,
      legalEntityId: null,
      countryCode: null,
    })]);
    expect(hasGlobalGovernanceScope(explicit)).toBe(true);
  });
});
