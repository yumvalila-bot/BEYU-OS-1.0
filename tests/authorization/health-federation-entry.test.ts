import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/authz";
import { ROLES } from "@/lib/constants";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/health-os-authorization", () => ({ checkHealthOSAuthorization: lookup }));
import { authorizeHealthFederationEntry, type HealthFederationScope } from "@/lib/health/federation-entry-authorization";

const scope: HealthFederationScope = { tenantId: "tenant-a", entityId: "entity-a", countryCode: "TZ", classification: "CONFIDENTIAL" };
const principal = (): Principal => ({
  userId: "user-a", partyId: "party-a", email: "", displayName: "",
  tenantId: "tenant-a", tenantCode: "test", tenantType: "ENTITY", roles: [],
  permissions: new Set(), clearance: "CONFIDENTIAL", entityScope: [], mfaSatisfied: true,
  sessionId: "session-a", riskScore: 0, emergencyPermissions: [], accountStatus: "ACTIVE", isServiceAccount: false,
  authorityGrants: [{ sourceId: "assignment", source: "ROLE_ASSIGNMENT", role: "test",
    permission: "health:federation.exchange", tenantId: "tenant-a", legalEntityId: "entity-a",
    countryCode: "TZ", validFrom: null, validTo: null }],
});

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue({ authorized: true, sectorUserId: "sector-user" });
});

describe("unwired Health federation entry prerequisite", () => {
  it("does not automatically grant the new permission to any existing role", () => {
    for (const role of Object.values(ROLES)) expect(role.permissions).not.toContain("health:federation.exchange");
  });

  it("requires a scoped server-side grant AND an active link", async () => {
    expect(await authorizeHealthFederationEntry(principal(), scope)).toEqual({ allowed: true, sectorUserId: "sector-user" });
    expect(lookup).toHaveBeenCalledWith("user-a");
  });

  it("does not treat a permission summary or an active link as an authority grant", async () => {
    const p = principal();
    p.authorityGrants = [];
    p.permissions.add("health:federation.exchange");
    expect(await authorizeHealthFederationEntry(p, scope)).toEqual({ allowed: false, reason: "DENIED" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    { ...scope, tenantId: "tenant-b" }, { ...scope, entityId: "entity-b" },
    { ...scope, countryCode: "KE" }, { ...scope, entityId: "" },
    { ...scope, classification: "RESTRICTED" as const },
  ])("denies a mismatched or incomplete scope", async (candidate) => {
    expect(await authorizeHealthFederationEntry(principal(), candidate)).toEqual({ allowed: false, reason: "DENIED" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["NOT_LINKED", "AUTHORIZATION_SERVICE_UNAVAILABLE"] as const)("fails closed on link state %s", async (reason) => {
    lookup.mockResolvedValue({ authorized: false, reason });
    expect(await authorizeHealthFederationEntry(principal(), scope)).toEqual({
      allowed: false, reason: reason === "NOT_LINKED" ? "DENIED" : "UNAVAILABLE",
    });
  });

  it("denies absent, inactive or service identities and expired grants", async () => {
    expect(await authorizeHealthFederationEntry(null, scope)).toEqual({ allowed: false, reason: "DENIED" });
    const inactive = principal(); inactive.accountStatus = "SUSPENDED";
    expect(await authorizeHealthFederationEntry(inactive, scope)).toEqual({ allowed: false, reason: "DENIED" });
    const service = principal(); service.isServiceAccount = true;
    expect(await authorizeHealthFederationEntry(service, scope)).toEqual({ allowed: false, reason: "DENIED" });
    const expired = principal(); expired.authorityGrants = expired.authorityGrants!.map((g) => ({ ...g, validTo: new Date(0) }));
    expect(await authorizeHealthFederationEntry(expired, scope)).toEqual({ allowed: false, reason: "DENIED" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails closed without leaking link infrastructure errors", async () => {
    lookup.mockRejectedValue(new Error("sensitive"));
    expect(await authorizeHealthFederationEntry(principal(), scope)).toEqual({ allowed: false, reason: "UNAVAILABLE" });
  });
});
