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
    authorityGrants: [
      {
        sourceId: "RAS_TEST_RISK",
        source: "ROLE_ASSIGNMENT",
        role: "SECTOR_OPERATOR",
        permission: "risk:register.read",
        tenantId: "TEN_A",
        legalEntityId: null,
        countryCode: null,
        validFrom: null,
        validTo: null,
      },
      {
        sourceId: "RAS_TEST_QUERY",
        source: "ROLE_ASSIGNMENT",
        role: "SECTOR_OPERATOR",
        permission: "ai:noelia.query",
        tenantId: "TEN_A",
        legalEntityId: null,
        countryCode: null,
        validFrom: null,
        validTo: null,
      },
    ],
    ...overrides,
  };
}
