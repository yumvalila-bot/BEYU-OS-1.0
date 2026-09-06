/**
 * Phase 11 — OS authorization routing matrix.
 *
 * The launcher/root routing must be authorization-driven, not
 * "any authenticated user may enter BEYU OS". A valid session without any
 * control-plane permission must NOT be routed to the control plane, and must
 * not be shown it. Backend `requireAccess` remains authoritative on every page;
 * this check only prevents an unusable OS from being advertised.
 */
import { describe, expect, it } from "vitest";
import { permissionsForRoles, clearanceForRoles, type Principal } from "../../src/lib/authz";
import { checkBeyuOSAuthorization } from "../../src/lib/os-authorization";

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO"];
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

function authorizedOs(
  beyu: boolean,
  health: boolean,
): Array<{ code: string; authorized: boolean }> {
  const os: Array<{ code: string; authorized: boolean }> = [];
  os.push({ code: "BEYU", authorized: beyu });
  if (health) os.push({ code: "HEALTH", authorized: true });
  return os;
}

function directRoute(
  princip: Principal,
  healthAuthorized: boolean,
): string | "launcher" | "signin" {
  const beyu = checkBeyuOSAuthorization(princip).authorized;
  const count = (beyu ? 1 : 0) + (healthAuthorized ? 1 : 0);
  if (count > 1) return "launcher";
  if (count === 1) return beyu ? "/os" : "/health";
  return "signin";
}

describe("OS authorization routing matrix", () => {
  it("a principal with a BEYU capability is BEYU-authorized", () => {
    expect(checkBeyuOSAuthorization(principal()).authorized).toBe(true);
  });

  it("an authenticated principal with NO control-plane permission is denied BEYU OS", () => {
    const p = principal({ roles: [] });
    p.permissions = new Set();
    expect(checkBeyuOSAuthorization(p).authorized).toBe(false);
  });

  it("User A (Health only) routes directly to Health and is not shown BEYU OS", () => {
    const p = principal({ roles: [] });
    p.permissions = new Set();
    const os = authorizedOs(checkBeyuOSAuthorization(p).authorized, true);
    expect(os.filter((o) => o.authorized).map((o) => o.code)).toEqual(["HEALTH"]);
    expect(directRoute(p, true)).toBe("/health");
  });

  it("User B (Health + Finance/BEYU) sees the OS selector", () => {
    const p = principal({ roles: ["GROUP_CFO"] });
    const os = authorizedOs(checkBeyuOSAuthorization(p).authorized, true);
    expect(os.filter((o) => o.authorized).map((o) => o.code)).toEqual(["BEYU", "HEALTH"]);
    expect(directRoute(p, true)).toBe("launcher");
  });

  it("User C (BEYU only) routes directly to /os", () => {
    const p = principal({ roles: ["AUDITOR"] });
    expect(directRoute(p, false)).toBe("/os");
  });

  it("User D (authenticated, no OS authorization) receives a controlled denial", () => {
    const p = principal({ roles: [] });
    p.permissions = new Set();
    const os = authorizedOs(checkBeyuOSAuthorization(p).authorized, false);
    expect(os.filter((o) => o.authorized)).toHaveLength(0);
    expect(directRoute(p, false)).toBe("signin");
  });
});
