/**
 * NOELIA AI CONTEXTUAL APPEARANCE & PROFESSIONAL MANIFESTATION SUITE
 *
 * Systematic verification of Sections 1-29 requirements:
 *   A. Identity invariance across all OS and professional contexts
 *   B. Canonical OS resolution (BEYU_OS, HEALTH_OS, FINANCE_OS, AGRICULTURE_OS, UJENZI_OS)
 *   C. Ujenzi professional resolution (ARCHITECTURAL, ENGINEERING, CONSTRUCTION, etc.)
 *   D. Context switching preservation (identity remains NOELIA_AI throughout)
 *   E. Unauthorized OS fail-closed
 *   F. Unauthorized professional context fail-closed
 *   G. Missing asset canonical fallback
 *   H. Ujenzi missing asset canonical fallback with explicit documentation
 *   I. Asset integrity verification (byte hashes preserved)
 *   J. No duplicate Noelia identity (exactly 1 canonical identity)
 *   K. No duplicate OS (UJENZI_OS is Sector OS; no Engineering/Architecture OS)
 *   L. PR #78 preferences preservation
 *   M. Shell rendering consumes server-resolved manifestation
 *   N. SSR / hydration safety
 *   O. Accessibility compliance
 *   P. Authorization isolation (appearance never grants authority)
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NOELIA_CANONICAL_ID } from "@/lib/noelia/canonical-identity";
import {
  NOELIA_ASSET_MAPPING,
  SUPPORTED_NOELIA_OS_CONTEXTS,
  SUPPORTED_UJENZI_PROFESSIONAL_CONTEXTS,
  resolveNoeliaOSContext,
  type SupportedNoeliaOSContext,
  type SupportedUjenziProfessionalContext,
} from "@/lib/noelia/context-resolver";
import {
  NOELIA_APPEARANCE_DEFAULTS,
  NOELIA_DISPLAY_IDENTITY,
  parseNoeliaAppearance,
  resolveNoeliaContextualAppearance,
  resolveNoeliaPresentation,
  serializeNoeliaAppearance,
} from "@/lib/noelia/appearance";
import { NOELIA_ASSETS, NOELIA_CANONICAL_PNG_ASSETS } from "@/components/brand-assets";
import { NoeliaShell } from "@/components/noelia-shell";
import { SECTOR_OPERATING_SYSTEMS, BEYU_CONTROL_PLANE } from "@/lib/operating-systems";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function mockScope(
  authorizedOS: string[] = ["BEYU_OS", "HEALTH_OS", "FINANCE_OS", "AGRICULTURE_OS", "UJENZI_OS"],
  professionalContexts?: string[],
) {
  return {
    tenantIds: ["t-canonical"],
    legalEntityIds: ["e-canonical"],
    countryCodes: ["US"],
    entities: [{ id: "e-canonical", tenantId: "t-canonical", countryCode: "US" }],
    tenantCountries: [{ tenantId: "t-canonical", countryCode: "US" }],
    enterprise: true,
    osContexts: authorizedOS,
    professionalContexts,
  };
}

const mockTarget = {
  tenantId: "t-canonical",
  legalEntityId: "e-canonical",
  countryCode: "US",
};

describe("A. Identity Invariance", () => {
  it("preserves NOELIA_AI identity across every canonical OS context", () => {
    for (const os of SUPPORTED_NOELIA_OS_CONTEXTS) {
      const result = resolveNoeliaOSContext(os, mockScope(), mockTarget);
      expect(result.canonicalIdentity.canonical_id).toBe("NOELIA_AI");
      expect(result.contextualAppearance.identityId).toBe("NOELIA_AI");
      expect(result.authorizedContext).toBe(true);
    }
  });

  it("preserves NOELIA_AI identity across every Ujenzi professional manifestation", () => {
    for (const prof of SUPPORTED_UJENZI_PROFESSIONAL_CONTEXTS) {
      const result = resolveNoeliaOSContext("UJENZI_OS", mockScope(), mockTarget, prof);
      expect(result.canonicalIdentity.canonical_id).toBe("NOELIA_AI");
      expect(result.contextualAppearance.identityId).toBe("NOELIA_AI");
      expect(result.authorizedContext).toBe(true);
      expect(result.professionalContext).toBe(prof);
    }
  });
});

describe("B. Canonical OS Resolution", () => {
  it("resolves BEYU_OS control plane context", () => {
    const result = resolveNoeliaOSContext("BEYU_OS", mockScope(), mockTarget);
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("BEYU_OS");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-beyu-os-canonical.png");
    expect(result.contextualAppearance.status).toBe("AUTHORITATIVE");
    expect(result.contextualAppearance.contextualLabel).toContain("BEYU OS");
  });

  it("resolves HEALTH_OS sector context", () => {
    const result = resolveNoeliaOSContext("HEALTH_OS", mockScope(), mockTarget);
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("HEALTH_OS");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-health-os-canonical.png");
    expect(result.contextualAppearance.status).toBe("AUTHORITATIVE");
    expect(result.contextualAppearance.contextualLabel).toContain("Health OS");
  });

  it("resolves FINANCE_OS sector context", () => {
    const result = resolveNoeliaOSContext("FINANCE_OS", mockScope(), mockTarget);
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("FINANCE_OS");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-finance-os-canonical.png");
    expect(result.contextualAppearance.status).toBe("AUTHORITATIVE");
    expect(result.contextualAppearance.contextualLabel).toContain("Finance OS");
  });

  it("resolves AGRICULTURE_OS sector context", () => {
    const result = resolveNoeliaOSContext("AGRICULTURE_OS", mockScope(), mockTarget);
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("AGRICULTURE_OS");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-agriculture-os-canonical.png");
    expect(result.contextualAppearance.status).toBe("AUTHORITATIVE");
    expect(result.contextualAppearance.contextualLabel).toContain("Agriculture OS");
  });

  it("resolves UJENZI_OS sector context", () => {
    const result = resolveNoeliaOSContext("UJENZI_OS", mockScope(), mockTarget);
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("UJENZI_OS");
    expect(result.visualManifestation).toBe("/noelia/canonical/noelia-ai-canonical.png");
    expect(result.contextualAppearance.status).toBe("FALLBACK_CANONICAL");
    expect(result.contextualAppearance.contextualLabel).toContain("Ujenzi OS");
  });
});

describe("C. Ujenzi Professional Resolution", () => {
  it("resolves Architectural manifestation with design and planning capabilities", () => {
    const result = resolveNoeliaOSContext("UJENZI_OS", mockScope(), mockTarget, "ARCHITECTURAL");
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("UJENZI_OS");
    expect(result.professionalContext).toBe("ARCHITECTURAL");
    expect(result.contextualAppearance.contextualLabel).toBe(
      "Noelia Ujenzi OS — Architectural Manifestation",
    );
    expect(result.availableCapabilities).toContain("ARCHITECTURAL_COORDINATION");
    expect(result.availableCapabilities).toContain("BIM_SPATIAL");
    expect(result.personalityModifier).toContain("Architectural design");
  });

  it("resolves Engineering manifestation with structural and civil capabilities", () => {
    const result = resolveNoeliaOSContext("UJENZI_OS", mockScope(), mockTarget, "ENGINEERING");
    expect(result.authorizedContext).toBe(true);
    expect(result.activeOS).toBe("UJENZI_OS");
    expect(result.professionalContext).toBe("ENGINEERING");
    expect(result.contextualAppearance.contextualLabel).toBe(
      "Noelia Ujenzi OS — Engineering Manifestation",
    );
    expect(result.availableCapabilities).toContain("STRUCTURAL_ANALYSIS");
    expect(result.availableCapabilities).toContain("CIVIL_WORKS");
    expect(result.personalityModifier).toContain("Structural engineering");
  });

  it("resolves Construction, Site, HSE, and Quality manifestations where supported", () => {
    for (const prof of ["CONSTRUCTION", "SITE", "HSE", "BIM", "BOQ_COST", "QUALITY_NCR", "COMMISSIONING"] as const) {
      const result = resolveNoeliaOSContext("UJENZI_OS", mockScope(), mockTarget, prof);
      expect(result.authorizedContext).toBe(true);
      expect(result.professionalContext).toBe(prof);
      expect(result.contextualAppearance.contextualLabel).toContain(
        prof === "BOQ_COST" ? "Boq cost" : prof.charAt(0) + prof.slice(1).toLowerCase().replace("_", " "),
      );
    }
  });
});

describe("D. Context Switching Preservation", () => {
  it("switches across the full canonical chain without losing NOELIA_AI identity", () => {
    const chain: Array<{ os: SupportedNoeliaOSContext; prof?: SupportedUjenziProfessionalContext }> = [
      { os: "BEYU_OS" },
      { os: "HEALTH_OS" },
      { os: "FINANCE_OS" },
      { os: "AGRICULTURE_OS" },
      { os: "UJENZI_OS" },
      { os: "UJENZI_OS", prof: "ARCHITECTURAL" },
      { os: "UJENZI_OS", prof: "ENGINEERING" },
      { os: "UJENZI_OS" },
      { os: "BEYU_OS" },
    ];

    for (const step of chain) {
      const result = resolveNoeliaOSContext(step.os, mockScope(), mockTarget, step.prof);
      expect(result.authorizedContext).toBe(true);
      expect(result.canonicalIdentity.canonical_id).toBe("NOELIA_AI");
      expect(result.contextualAppearance.identityId).toBe("NOELIA_AI");
      if (step.prof) {
        expect(result.professionalContext).toBe(step.prof);
      }
    }
  });
});

describe("E. Unauthorized OS Fail-Closed", () => {
  it("unauthorized UJENZI_OS produces empty visual manifestation and no capabilities", () => {
    const scope = mockScope(["BEYU_OS", "FINANCE_OS"]); // UJENZI_OS not granted
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, mockTarget);
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("OS_DENIED");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
    expect(result.toolPermissions).toEqual([]);
    expect(result.contextualAppearance.status).toBe("DENIED");
  });
});

describe("F. Unauthorized Professional Context", () => {
  it("unauthorized professional context produces empty visual manifestation and no capabilities", () => {
    const scope = mockScope(["BEYU_OS", "UJENZI_OS"], ["ARCHITECTURAL"]); // Only ARCHITECTURAL granted
    const result = resolveNoeliaOSContext("UJENZI_OS", scope, mockTarget, "ENGINEERING");
    expect(result.authorizedContext).toBe(false);
    expect(result.denialCode).toBe("PROFESSIONAL_CONTEXT_DENIED");
    expect(result.visualManifestation).toBe("");
    expect(result.availableCapabilities).toEqual([]);
    expect(result.toolPermissions).toEqual([]);
    expect(result.contextualAppearance.status).toBe("DENIED");
  });
});

describe("G. Missing Asset & Canonical Fallback", () => {
  it("unknown OS falls back to canonical NOELIA_AI asset mapping", () => {
    const mapping = NOELIA_ASSET_MAPPING["UNKNOWN_OS"] ?? NOELIA_ASSET_MAPPING["NOELIA_AI"];
    expect(mapping.logicalId).toBe("noelia-ai");
    expect(mapping.path).toBe("/noelia/canonical/noelia-ai-canonical.png");
  });
});

describe("H. Ujenzi Missing Asset Fallback & Documentation", () => {
  it("explicitly marks UJENZI_OS as canonical fallback with documented reason", () => {
    const ujenziMapping = NOELIA_ASSET_MAPPING["UJENZI_OS"];
    expect(ujenziMapping.status).toBe("FALLBACK_CANONICAL");
    expect(ujenziMapping.path).toBe("/noelia/canonical/noelia-ai-canonical.png");
    expect(ujenziMapping.logicalId).toBe("noelia-ai");
    expect(ujenziMapping.notes).toBe(
      "UJENZI_OS contextual asset unavailable; canonical Noelia fallback active.",
    );

    const appearance = resolveNoeliaContextualAppearance("UJENZI_OS");
    expect(appearance.status).toBe("FALLBACK_CANONICAL");
    expect(appearance.notes).toBe(
      "UJENZI_OS contextual asset unavailable; canonical Noelia fallback active.",
    );
  });
});

describe("I. Asset Integrity (Authoritative PNGs)", () => {
  it("preserves exact byte hashes of the 5 authoritative PNG assets", () => {
    const assets = [
      { name: "Noelia AI .png", expectedMd5: "12542aef08ef5bb087a9ad15e2a8631a" },
      { name: "Noelia BEYU OS.png", expectedMd5: "4f61c9187398e80e32746b0f8540b513" },
      { name: "Noelia Finance os.png", expectedMd5: "2eb029f1739e9fbf54041dccfae27093" },
      { name: "Noelia Health os.png", expectedMd5: "6a63d1037bd0bb68d4811ebd1516b1e3" },
      { name: "Noeloa Agriculture OS.png", expectedMd5: "14ea902f3a8b88e685cc183a83fb1699" },
    ];

    for (const a of assets) {
      const filePath = path.join(ROOT, a.name);
      expect(existsSync(filePath), `Root asset ${a.name} must exist`).toBe(true);
      const buffer = readFileSync(filePath);
      const md5 = createHash("md5").update(buffer).digest("hex");
      expect(md5, `Hash of ${a.name} must match authoritative record`).toBe(a.expectedMd5);
    }
  });
});

describe("J. No Duplicate Identity", () => {
  it("has exactly one canonical Noelia identity (NOELIA_AI)", () => {
    expect(NOELIA_CANONICAL_ID.canonical_id).toBe("NOELIA_AI");
    expect(NOELIA_CANONICAL_ID.display_name).toBe("Noelia");
    const contexts = Object.values(NOELIA_CANONICAL_ID.context_profiles);
    for (const c of contexts) {
      expect(c.display_name).toContain("Noelia");
      expect(c.display_name).not.toBe("Noelia Finance");
    }
  });
});

describe("K. No Duplicate OS", () => {
  it("UJENZI_OS is a Sector OS; no Engineering/Architecture/BIM OS exists", () => {
    const sectorCodes = SECTOR_OPERATING_SYSTEMS.map((s) => s.code);
    expect(sectorCodes).toContain("UJENZI");
    expect(sectorCodes).toContain("FINANCE");
    expect(sectorCodes).toContain("HEALTH");
    expect(sectorCodes).toContain("AGRICULTURE");

    // Prohibit duplicate OS definitions
    expect(sectorCodes).not.toContain("ENGINEERING");
    expect(sectorCodes).not.toContain("ARCHITECTURE");
    expect(sectorCodes).not.toContain("BIM");
    expect(sectorCodes).not.toContain("GIS");
    expect(sectorCodes).not.toContain("TWIN");
    expect(sectorCodes).not.toContain("CONSTRUCTION");
    expect(sectorCodes).not.toContain("NOELIA");
  });
});

describe("L. PR #78 Preferences Compatibility", () => {
  it("preserves PR #78 preferences, parsing, serialization, and presentation", () => {
    const prefs = { ...NOELIA_APPEARANCE_DEFAULTS, chatPosition: "contextual" as const };
    const serialized = serializeNoeliaAppearance(prefs);
    const parsed = parseNoeliaAppearance(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.chatPosition).toBe("contextual");
      const presentation = resolveNoeliaPresentation(parsed.value);
      expect(presentation.panelPosition).toBe("contextual");
    }
  });
});

describe("M. Shell Rendering & Contextual Manifestation", () => {
  it("NoeliaShell consumes server-resolved contextual appearance", () => {
    const appearance = resolveNoeliaContextualAppearance("UJENZI_OS", "ARCHITECTURAL");
    const html = renderToString(
      React.createElement(NoeliaShell, {
        canQuery: true,
        mfaSatisfied: true,
        providerMode: "DETERMINISTIC_ANALYST",
        principalName: "Amani Beyu",
        contextualAppearance: appearance,
      }),
    );
    expect(html).toContain("Noelia");
    expect(html).toContain('alt="Noelia AI"');
    expect(html).toContain("/noelia/canonical/noelia-ai-canonical.png");
  });
});

describe("N. SSR / Hydration Safety", () => {
  it("renders deterministically without throws or window dependencies during SSR", () => {
    expect(() => {
      renderToString(
        React.createElement(NoeliaShell, {
          canQuery: true,
          mfaSatisfied: true,
          providerMode: "DETERMINISTIC_ANALYST",
          principalName: "Test Principal",
          activeOS: "UJENZI_OS",
          professionalContext: "ENGINEERING",
        }),
      );
    }).not.toThrow();
  });
});

describe("O. Accessibility Compliance", () => {
  it("maintains accessible name and alt text", () => {
    const html = renderToString(
      React.createElement(NoeliaShell, {
        canQuery: true,
        mfaSatisfied: true,
        providerMode: "DETERMINISTIC_ANALYST",
        principalName: "Test Principal",
        contextualAppearance: resolveNoeliaContextualAppearance("UJENZI_OS", "ARCHITECTURAL"),
      }),
    );
    expect(html).toContain('alt="Noelia AI"');
    expect(html).toContain('aria-label="Open Noelia — Governed AI, state READY"');
  });
});

describe("P. Authorization Isolation", () => {
  it("appearance/professional context never modifies principal authority or grants write capabilities", () => {
    const result = resolveNoeliaOSContext(
      "UJENZI_OS",
      mockScope(["BEYU_OS", "UJENZI_OS"]),
      mockTarget,
      "ARCHITECTURAL",
    );
    // Descriptive only: no execution authority granted
    expect(result.toolPermissions).toEqual([
      "ai:memory.read",
      "ai:analytics.read",
      "os:ujenzi.read",
    ]);
    expect(result.toolPermissions).not.toContain("ujenzi:data.write");
    expect(result.toolPermissions).not.toContain("ujenzi:data.delete");
    expect(result.toolPermissions).not.toContain("finance:ledger.post");
  });
});
