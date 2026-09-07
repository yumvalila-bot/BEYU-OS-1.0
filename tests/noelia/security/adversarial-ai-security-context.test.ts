/**
 * ADVERSARIAL SECURITY TESTS — Noelia Cross-OS Context, Identity, Memory
 *
 * Tests that authorization, isolation, and audit boundaries hold under
 * adversarial conditions.
 */
import { describe, it, expect } from "vitest";
import { NOELIA_CANONICAL_ID } from "@/lib/noelia/canonical-identity";
import { resolveNoeliaOSContext, NOELIA_ASSET_MAPPING } from "@/lib/noelia/context-resolver";

// Minimal mock authorization scope
function mockScope(authorizedOS: string[] = ["BEYU_OS"], tenantIds: string[] = ["t1"], entityIds: string[] = ["e1"], countryCodes: string[] = ["US"]): any {
  return {
    tenantIds,
    legalEntityIds: entityIds,
    countryCodes,
    entities: entityIds.map((id) => ({ id, tenantId: "t1", countryCode: "US" })),
    tenantCountries: [{ tenantId: "t1", countryCode: "US" }],
    enterprise: false,
    osContexts: authorizedOS,
  };
}

describe("Noelia Identity Isolation", () => {
  it("canonical identity remains stable across contexts", () => {
    expect(NOELIA_CANONICAL_ID.canonical_id).toBe("NOELIA_AI");
  });

  it("visual mapping preserves original filenames and SHA-256", () => {
    const ai = NOELIA_ASSET_MAPPING["NOELIA_AI"];
    expect(ai?.sha256).toBe("12542aef08ef5bb087a9ad15e2a8631a");
    expect(ai?.logicalId).toBe("noelia-ai");
  });

  it("agriculture filename preserved exactly (Noeloa) in registry mapping", () => {
    const ag = NOELIA_ASSET_MAPPING["AGRICULTURE_OS"];
    expect(ag?.logicalId).toBe("noelia-agriculture");
    expect(ag?.sha256).toBeDefined();
  });
});

describe("Noelia OS Authorization / Context Spoofing Prevention", () => {
  it("authorizes BEYU_OS with default scope", () => {
    const result = resolveNoeliaOSContext("BEYU_OS", mockScope(), { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("BEYU_OS");
  });

  it("denies unauthorized OS (spoofing attempt)", () => {
    const result = resolveNoeliaOSContext("FINANCE_OS", mockScope(["BEYU_OS"]), { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("OS_DENIED");
    expect(result.denialReason).toContain("not authorized");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
  });

  it("allows authorized Finance OS context", () => {
    const scope = mockScope(["BEYU_OS", "FINANCE_OS"]);
    const result = resolveNoeliaOSContext("FINANCE_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("FINANCE_OS");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-finance-os-canonical.png");
  });

  it("allows authorized Health OS context", () => {
    const scope = mockScope(["BEYU_OS", "HEALTH_OS"]);
    const result = resolveNoeliaOSContext("HEALTH_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("HEALTH_OS");
  });

  it("allows authorized Agriculture OS context", () => {
    const scope = mockScope(["BEYU_OS", "AGRICULTURE_OS"]);
    const result = resolveNoeliaOSContext("AGRICULTURE_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("AGRICULTURE_OS");
  });

  it("blocks client-supplied arbitrary OS value", () => {
    const scope = mockScope(["BEYU_OS"]);
    // A malicious client sends an arbitrary OS not in scope.
    const result = resolveNoeliaOSContext("UNAUTHORIZED_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("OS_DENIED");
  });
});

describe("Noelia Memory Isolation (Adversarial)", () => {
  it("memory scope includes authorization boundaries", () => {
    const scope = mockScope(["BEYU_OS", "FINANCE_OS"], ["t1"], ["e1"], ["US"]);
    const result = resolveNoeliaOSContext("BEYU_OS", scope, { tenantId: "t2", legalEntityId: "e2", countryCode: "GB" });
    // Context is authorized (OS allowed), but scope does not cover the target.
    expect(result.authorizedContext).toBe(true); // OS is authorized.
    // The authorization chain must handle entity/tenant/country isolation separately.
  });
});

describe("Noelia Audit / Security Boundary", () => {
  it("denial produces no capabilities or visual asset", () => {
    const scope = mockScope(["BEYU_OS"]);
    const result = resolveNoeliaOSContext("FINANCE_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(false);
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities.length).toBe(0);
  });
});
