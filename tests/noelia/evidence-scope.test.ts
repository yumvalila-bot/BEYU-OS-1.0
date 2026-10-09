import { describe, expect, it } from "vitest";
import type { Principal } from "../../src/lib/authz";
import { resolveNoeliaEvidenceDimensions } from "../../src/lib/noelia/platform-services";
import type { NoeliaAuthorizedScope } from "../../src/lib/noelia/types";

const principal: Principal = {
  userId: "USR_TEST",
  partyId: "PTY_TEST",
  email: "test@beyu.os",
  displayName: "Test human",
  tenantId: "TEN_HOME",
  tenantCode: "HOME",
  tenantType: "ENTERPRISE",
  roles: [],
  permissions: new Set(),
  clearance: "RESTRICTED",
  entityScope: [],
  countryScope: [],
  mfaSatisfied: true,
  sessionId: "SES_TEST",
  riskScore: 0,
  emergencyPermissions: [],
  authorityGrants: [],
};

const scope: NoeliaAuthorizedScope = {
  tenantIds: ["TEN_HOME", "TEN_ALLOWED"],
  legalEntityIds: ["LEN_ALLOWED"],
  countryCodes: ["TZ", "KE"],
  entities: [{ id: "LEN_ALLOWED", tenantId: "TEN_ALLOWED", countryCode: "KE" }],
  tenantCountries: [
    { tenantId: "TEN_HOME", countryCode: "TZ" },
    { tenantId: "TEN_ALLOWED", countryCode: "KE" },
  ],
  enterprise: false,
};

describe("Noelia decision evidence scope", () => {
  it("records a target only when its complete composite is in canonical finite scope", () => {
    expect(resolveNoeliaEvidenceDimensions({
      principal,
      scope,
      target: { tenantId: "TEN_ALLOWED", legalEntityId: "LEN_ALLOWED", countryCode: "KE" },
    })).toEqual({ tenantId: "TEN_ALLOWED", legalEntityId: "LEN_ALLOWED", countryCode: "KE" });
  });

  it("keeps a denied or unknown tenant only as requested-target evidence", () => {
    expect(resolveNoeliaEvidenceDimensions({
      principal,
      scope,
      target: { tenantId: "TEN_UNKNOWN", legalEntityId: "LEN_UNKNOWN", countryCode: "XX" },
    })).toEqual({ tenantId: "TEN_HOME", legalEntityId: null, countryCode: null });
  });

  it("does not combine an unauthorized entity with an independently allowed country", () => {
    expect(resolveNoeliaEvidenceDimensions({
      principal,
      scope,
      target: { tenantId: "TEN_ALLOWED", legalEntityId: "LEN_UNKNOWN", countryCode: "KE" },
    })).toEqual({ tenantId: "TEN_ALLOWED", legalEntityId: null, countryCode: null });
  });

  it("retains an authorized tenant/entity while refusing an unauthorized country", () => {
    expect(resolveNoeliaEvidenceDimensions({
      principal,
      scope,
      target: { tenantId: "TEN_ALLOWED", legalEntityId: "LEN_ALLOWED", countryCode: "TZ" },
    })).toEqual({ tenantId: "TEN_ALLOWED", legalEntityId: "LEN_ALLOWED", countryCode: null });
  });
});
