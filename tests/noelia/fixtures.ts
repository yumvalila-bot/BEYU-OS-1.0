import type { Principal } from "../../src/lib/authz";
import type { PermissionCode } from "../../src/lib/constants";

export function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "USR_REQUESTING_HUMAN",
    partyId: "PTY_REQUESTING_HUMAN",
    email: "human@example.test",
    displayName: "Requesting Human",
    tenantId: "TEN_A",
    tenantCode: "A",
    tenantType: "SECTOR",
    roles: ["SECTOR_OPERATOR"],
    permissions: new Set<PermissionCode>(["ai:noelia.query", "risk:register.read"]),
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_TEST",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  };
}
