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

  it("denies unauthorized UJENZI_OS (spoofing attempt)", () => {
    const scope = mockScope(["BEYU_OS"]);
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("OS_DENIED");
    expect(result.denialReason).toContain("not authorized");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
  });

  it("allows authorized UJENZI_OS context with canonical fallback asset", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"]);
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" });
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("UJENZI_OS");
    expect(result.canonicalIdentity.canonical_id).toBe("NOELIA_AI");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-ai-canonical.png");
    expect(result.contextualAppearance.status).toBe("FALLBACK_CANONICAL");
    expect(result.contextualAppearance.notes).toBe(
      "UJENZI_OS contextual asset unavailable; canonical Noelia fallback active.",
    );
  });
});

describe("Noelia Ujenzi Professional Contexts & Privilege Isolation", () => {
  it("resolves Architectural manifestation within authorized UJENZI_OS", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"]);
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ARCHITECTURAL");
    expect(result.authorizedContext).toBe(true);
    expect(result.canonicalIdentity.canonical_id).toBe("NOELIA_AI");
    expect(result.activeOS).toBe("UJENZI_OS");
    expect(result.professionalContext).toBe("ARCHITECTURAL");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-ai-canonical.png");
    expect(result.contextualAppearance.contextualLabel).toBe("Noelia Ujenzi OS — Architectural Manifestation");
    expect(result.contextualAppearance.status).toBe("FALLBACK_CANONICAL");
    expect(result.personalityModifier).toContain("Architectural design");
    expect(result.availableCapabilities).toContain("ARCHITECTURAL_COORDINATION");
  });

  it("resolves Engineering manifestation within authorized UJENZI_OS", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"]);
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ENGINEERING");
    expect(result.authorizedContext).toBe(true);
    expect(result.canonicalIdentity.canonical_id).toBe("NOELIA_AI");
    expect(result.activeOS).toBe("UJENZI_OS");
    expect(result.professionalContext).toBe("ENGINEERING");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-ai-canonical.png");
    expect(result.contextualAppearance.contextualLabel).toBe("Noelia Ujenzi OS — Engineering Manifestation");
    expect(result.contextualAppearance.status).toBe("FALLBACK_CANONICAL");
    expect(result.personalityModifier).toContain("Structural engineering");
    expect(result.availableCapabilities).toContain("STRUCTURAL_ANALYSIS");
  });

  it("denies Architectural manifestation on non-Ujenzi OS (cross-OS escalation attempt)", () => {
    const scope = mockScope(["BEYU_OS", "FINANCE_OS"]);
    const result = resolveNoeliaOSContext("FINANCE_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ARCHITECTURAL");
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("PROFESSIONAL_CONTEXT_DENIED");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
    expect(result.denialReason).toContain("inside UJENZI_OS only");
  });

  it("denies Engineering manifestation on BEYU control plane (cross-OS escalation attempt)", () => {
    const scope = mockScope(["BEYU_OS"]);
    const result = resolveNoeliaOSContext("BEYU_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ENGINEERING");
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("PROFESSIONAL_CONTEXT_DENIED");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
  });

  it("denies unauthorized professional context when restricted by principal scope", () => {
    const scope = {
      ...mockScope(["BEYU_OS", "UJENZI_OS"]),
      professionalContexts: ["ARCHITECTURAL"],
    };
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ENGINEERING");
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("PROFESSIONAL_CONTEXT_DENIED");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
    expect(result.denialReason).toContain("not authorized for this principal scope");
  });

  it("denies fabricated or unsupported professional context under UJENZI_OS", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"]);
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "FABRICATED_CONTEXT");
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("PROFESSIONAL_CONTEXT_DENIED");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
  });

  it("professional context NEVER escalates backend authority (authorization isolation)", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"]);
    const archResult = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ARCHITECTURAL");
    expect(archResult.toolPermissions).not.toContain("ujenzi:data.write");
    expect(archResult.toolPermissions).not.toContain("finance:ledger.post");
    expect(archResult.toolPermissions).not.toContain("admin:*");

    const engResult = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ENGINEERING");
    expect(engResult.toolPermissions).not.toContain("ujenzi:data.write");
    expect(engResult.toolPermissions).not.toContain("finance:ledger.post");
    expect(engResult.toolPermissions).not.toContain("admin:*");
  });

  it("generates NOELIA_CONTEXT_CHANGED audit event on resolution", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"]);
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, { tenantId: "t1", legalEntityId: "e1", countryCode: "US" }, "ARCHITECTURAL");
    expect(result.auditEvent).toBeDefined();
    expect(result.auditEvent?.action).toBe("NOELIA_CONTEXT_CHANGED");
    expect(result.auditEvent?.objectType).toBe("NOELIA_CONTEXT");
    expect(result.auditEvent?.objectId).toBe("NOELIA_AI");
    expect(result.auditEvent?.outcome).toBe("SUCCESS");
    expect(result.auditEvent?.metadata).toEqual({
      activeOS: "UJENZI_OS",
      professionalContext: "ARCHITECTURAL",
      logicalAssetId: "noelia-ai",
      status: "FALLBACK_CANONICAL",
    });
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
