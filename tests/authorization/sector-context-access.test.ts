import { describe, expect, it } from "vitest";
import {
  can,
  clearanceForRoles,
  permissionsForRoles,
  type AuthorityGrant,
  type Principal,
} from "@/lib/authz";
import { ROLES } from "@/lib/constants";
import {
  canonicalSectorForPermission,
  resolveCanonicalSectorPrincipal,
} from "@/lib/sector-context";
import { hasGlobalGovernanceScope, tenantScopeIds } from "@/lib/tenant-scope";

const GROUP = "TEN_BEYU_GROUP";
const AGRI = "TEN_BEYU_AGRI";
const UJENZI = "TEN_BEYU_UJENZI";

function grantsFor(
  permissions: Principal["permissions"],
  values: Partial<AuthorityGrant> = {},
): AuthorityGrant[] {
  return [...permissions].map((permission) => ({
    sourceId: `RAS_TEST_${permission}`,
    source: "ROLE_ASSIGNMENT",
    role: "SECTOR_READ_ONLY",
    permission,
    tenantId: AGRI,
    legalEntityId: null,
    countryCode: null,
    validFrom: null,
    validTo: null,
    ...values,
  }));
}

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["SECTOR_READ_ONLY"];
  const permissions = overrides.permissions ?? permissionsForRoles(roles);
  return {
    userId: "USR_SECTOR_CONTEXT_TEST",
    partyId: "PTY_SECTOR_CONTEXT_TEST",
    email: "sector-context@example.test",
    displayName: "Disposable sector context fixture",
    tenantId: AGRI,
    tenantCode: "BEYU-AGRI",
    tenantType: "SECTOR",
    roles,
    permissions,
    clearance: clearanceForRoles(roles),
    entityScope: [],
    countryScope: [],
    mfaSatisfied: true,
    sessionId: "SES_SECTOR_CONTEXT_TEST",
    riskScore: 0,
    emergencyPermissions: [],
    delegatedPermissions: [],
    authorityGrants: grantsFor(permissions),
    accountStatus: "ACTIVE",
    isServiceAccount: false,
    ...overrides,
  };
}

describe("canonical sector context and the proposed read-only role", () => {
  it("contains exactly the two existing sector read permissions and no shared/material authority", () => {
    expect(ROLES.SECTOR_READ_ONLY.permissions).toEqual([
      "agriculture:data.read",
      "ujenzi:data.read",
    ]);
    expect(ROLES.SECTOR_READ_ONLY.privileged).toBe(false);
    expect(ROLES.SECTOR_READ_ONLY.scope).toBe("SECTOR");
    expect(clearanceForRoles(["SECTOR_READ_ONLY"])).toBe("RESTRICTED");
    for (const permission of [
      "agriculture:data.manage",
      "ujenzi:data.manage",
      "finance:ledger.read",
      "finance:ledger.post",
      "family:member.read",
      "familyoffice:capital.read",
      "ai:noelia.query",
      "ai:decision.review",
      "ai:knowledge.ingest",
      "identity:role.grant",
    ] as const) {
      expect(ROLES.SECTOR_READ_ONLY.permissions).not.toContain(permission);
    }
  });

  it("does not raise an existing administrator's classification ceiling", () => {
    expect(clearanceForRoles(["PLATFORM_ADMIN", "SECTOR_READ_ONLY"])).toBe("RESTRICTED");
    // This is why FAMILY_MEMBER_VIEW is not a harmless alternative for an
    // administrator that already holds other Family Office read permissions.
    expect(clearanceForRoles(["PLATFORM_ADMIN", "FAMILY_MEMBER_VIEW"])).toBe("HIGHLY_RESTRICTED");
  });

  it("keeps Family Office and NOELIA on their existing home-scope guards", () => {
    const home = principal({
      roles: ["PLATFORM_ADMIN"],
      tenantId: GROUP,
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      authorityGrants: grantsFor(permissionsForRoles(["PLATFORM_ADMIN"]), {
        role: "PLATFORM_ADMIN",
        tenantId: GROUP,
      }),
    });
    expect(can(home, "family:member.read").allowed).toBe(true);
    expect(can(home, "familyoffice:capital.read", { classification: "HIGHLY_RESTRICTED" }).allowed).toBe(false);
    expect(can(home, "familyoffice:protection.read", { classification: "HIGHLY_RESTRICTED" }).allowed).toBe(false);
    expect(can(home, "ai:noelia.query").allowed).toBe(true);
    expect(can(home, "ai:decision.review").allowed).toBe(false);
    expect(can(home, "finance:ledger.read").allowed).toBe(true);
    expect(can(home, "finance:ledger.post").allowed).toBe(false);
    expect(can(home, "identity:role.grant").allowed).toBe(true);
  });

  it("authorizes a direct read grant only in its own sector context", async () => {
    const agri = principal();
    await expect(resolveCanonicalSectorPrincipal(agri, "AGRICULTURE")).resolves.toEqual({
      allowed: true,
      principal: agri,
    });
    expect(can(agri, "agriculture:data.read").allowed).toBe(true);
    expect(can(agri, "agriculture:data.manage").allowed).toBe(false);
    expect(can(agri, "family:member.read").allowed).toBe(false);
    expect(can(agri, "ai:noelia.query").allowed).toBe(false);

    const wrongSector = await resolveCanonicalSectorPrincipal(agri, "UJENZI");
    expect(wrongSector.allowed).toBe(false);
    if (!wrongSector.allowed) expect(wrongSector.reason).toContain("BEYU-UJENZI");
  });

  it("does not let a target-tenant grant authorize from the wrong session tenant", async () => {
    const wrongHome = principal({
      tenantId: GROUP,
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
    });
    const result = await resolveCanonicalSectorPrincipal(wrongHome, "AGRICULTURE");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("BEYU-AGRI");
  });

  it("fails closed when the target clearance is insufficient", async () => {
    const lowClearance = principal({ clearance: "PUBLIC" });
    const result = await resolveCanonicalSectorPrincipal(lowClearance, "AGRICULTURE");
    expect(result.allowed).toBe(false);
  });

  it("expires an authority tuple without changing the role catalogue", () => {
    const expired = principal({
      authorityGrants: grantsFor(permissionsForRoles(["SECTOR_READ_ONLY"]), {
        validTo: new Date(Date.now() - 1),
      }),
    });
    expect(can(expired, "agriculture:data.read").allowed).toBe(false);
    expect(can(expired, "ujenzi:data.read", { tenantId: UJENZI }).allowed).toBe(false);
  });

  it("preserves explicit global read authority while pinning its sector RLS context to one tenant", async () => {
    const global = principal({
      roles: ["GROUP_CEO"],
      tenantId: GROUP,
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      permissions: new Set(["agriculture:data.read"]),
      authorityGrants: grantsFor(new Set(["agriculture:data.read"]), {
        role: "GROUP_CEO",
        tenantId: null,
      }),
    });
    expect(hasGlobalGovernanceScope(global)).toBe(true);
    const result = await resolveCanonicalSectorPrincipal(global, "AGRICULTURE");
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.principal.tenantId).toBe(AGRI);
    expect(result.principal.tenantCode).toBe("BEYU-AGRI");
    expect(result.principal.tenantType).toBe("SECTOR");
    expect(result.principal.authorityGrants).toBe(global.authorityGrants);
    expect(hasGlobalGovernanceScope(result.principal)).toBe(false);
    await expect(tenantScopeIds(result.principal)).resolves.toEqual([AGRI]);
    expect(can(result.principal, "agriculture:data.read").allowed).toBe(true);
  });

  it("does not remap Finance, Family Office or NOELIA into a sector context", () => {
    expect(canonicalSectorForPermission("agriculture:data.read")).toBe("AGRICULTURE");
    expect(canonicalSectorForPermission("ujenzi:data.read")).toBe("UJENZI");
    expect(canonicalSectorForPermission("finance:ledger.read")).toBeNull();
    expect(canonicalSectorForPermission("family:member.read")).toBeNull();
    expect(canonicalSectorForPermission("ai:noelia.query")).toBeNull();
  });
});
