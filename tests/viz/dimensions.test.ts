/**
 * Universal Dimension Registry — pure certification.
 *
 * Proves the closed code contract: canonical 1D–8D + XD only from code;
 * unknown codes REJECTED (never assumed); governed extensions live at 9D+
 * and can never shadow a canonical dimension or carry financial posting
 * authority (CAP_POSTING LOCKED); combinations normalize deterministically.
 */
import { describe, expect, it } from "vitest";
import {
  CANONICAL_DIMENSIONS,
  CANONICAL_DIMENSION_IDS,
  VIZ_SECTOR_CODES,
  dimensionsForSector,
  extensionToDefinition,
  normalizeCombination,
  parseDimensionCode,
  resolveDimensionRegistry,
  validateDimensionExtension,
  type DimensionExtensionRecord,
} from "@/lib/viz/dimensions";

function extension(code: string, overrides: Partial<DimensionExtensionRecord> = {}): DimensionExtensionRecord {
  return {
    id: `VZD_TEST_${code}`,
    tenantId: "TEN_TEST",
    code,
    name: `Extension ${code}`,
    description: `Governed test extension ${code}`,
    capabilities: ["test"],
    dataRequirements: [],
    renderingRequirements: [],
    requiredPermissions: [],
    sectorApplicability: "*",
    lifecycleState: "PLANNED",
    provenance: { registeredBy: "USR_TEST", rationale: "test", registeredAt: "2026-01-01T00:00:00.000Z" },
    classification: "INTERNAL",
    ...overrides,
  };
}

describe("canonical registry (1D–8D + XD)", () => {
  it("declares exactly the canonical ids, XD last", () => {
    expect(CANONICAL_DIMENSION_IDS).toEqual(["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D", "XD"]);
    const registry = resolveDimensionRegistry([]);
    expect(registry.dimensions.map((d) => d.id)).toEqual(["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D", "XD"]);
    expect(registry.canonicalCount).toBe(9);
    expect(registry.extensionCount).toBe(0);
  });

  it("lists UJENZI as an equal sector consumer — the foundation is never a Ujenzi subsystem", () => {
    expect(VIZ_SECTOR_CODES).toEqual(["BEYU", "HEALTH", "FINANCE", "AGRICULTURE", "UJENZI", "FOUNDATION"]);
    for (const d of CANONICAL_DIMENSIONS) {
      expect(d.sectorApplicability === "*" || d.sectorApplicability.includes("UJENZI")).toBe(true);
    }
  });

  it("every canonical definition carries honest status + provenance", () => {
    for (const d of CANONICAL_DIMENSIONS) {
      expect(["IMPLEMENTED", "PARTIALLY_IMPLEMENTED", "PLANNED", "NOT_IMPLEMENTED", "EXPERIMENTAL", "AVAILABLE"]).toContain(d.status);
      expect(d.provenance.origin).toBe("CANONICAL");
      expect(d.permissions).toContain("viz:scene.read");
    }
  });

  it("parseDimensionCode accepts canonical + governed 9D+ codes and rejects everything else", () => {
    expect(parseDimensionCode("3D")).toMatchObject({ ok: true, canonical: true, order: 3 });
    expect(parseDimensionCode("XD")).toMatchObject({ ok: true, canonical: true, order: 99 });
    expect(parseDimensionCode("9D")).toMatchObject({ ok: true, canonical: false, order: 9 });
    expect(parseDimensionCode("10D_SIMULATION")).toMatchObject({ ok: true, canonical: false, order: 10 });
    expect(parseDimensionCode("999D")).toMatchObject({ ok: true, canonical: false, order: 999 });
    expect(parseDimensionCode("0D").ok).toBe(false);
    expect(parseDimensionCode("8D_EXT").ok).toBe(false); // ordinal 8 collides with canonical model
    expect(parseDimensionCode("1000D").ok).toBe(false); // beyond governed maximum
    expect(parseDimensionCode("DIM9").ok).toBe(false);
    expect(parseDimensionCode("77X").ok).toBe(false);
  });
});

describe("combination normalization (§4)", () => {
  const registry = resolveDimensionRegistry([extension("9D"), extension("12D_ORG_ECOSYSTEM")]);

  it("de-duplicates and orders by ordinal", () => {
    const result = normalizeCombination(["5D", "2D", "2D", "9D"], registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dimensions.map((d) => d.id)).toEqual(["2D", "5D", "9D"]);
  });

  it("REJECTS unknown codes — never silently drops, never assumes", () => {
    const result = normalizeCombination(["2D", "77X"], registry);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/unknown dimension/i);
  });

  it("rejects an empty activation set", () => {
    expect(normalizeCombination([], registry).ok).toBe(false);
  });

  it("'9D+' umbrella activates every governed extension and nothing canonical", () => {
    const result = normalizeCombination(["9D+", "1D"], registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dimensions.map((d) => d.id)).toEqual(["1D", "9D", "12D_ORG_ECOSYSTEM"]);
  });

  it("dimensionsForSector filters by applicability", () => {
    const onlyUjenzi = resolveDimensionRegistry([extension("9D", { sectorApplicability: ["UJENZI"] })]);
    const ujenzi = dimensionsForSector(onlyUjenzi, "UJENZI").map((d) => d.id);
    const health = dimensionsForSector(onlyUjenzi, "HEALTH").map((d) => d.id);
    expect(ujenzi).toContain("9D");
    expect(health).not.toContain("9D");
    expect(health).toContain("XD");
  });
});

describe("governed extensions (9D+)", () => {
  it("validates: canonical shadowing, empty text, unknown state and posting authority all rejected", () => {
    expect(validateDimensionExtension({ code: "3D", name: "x", description: "y", lifecycleState: "PLANNED" }).ok).toBe(false);
    expect(validateDimensionExtension({ code: "XD", name: "x", description: "y", lifecycleState: "PLANNED" }).ok).toBe(false);
    expect(validateDimensionExtension({ code: "9D", name: " ", description: "y", lifecycleState: "PLANNED" }).ok).toBe(false);
    expect(validateDimensionExtension({ code: "9D", name: "x", description: "y", lifecycleState: "BETA" }).ok).toBe(false);
    const posting = validateDimensionExtension({
      code: "9D",
      name: "Money dimension",
      description: "Attempt to smuggle posting authority into a dimension extension",
      lifecycleState: "PLANNED",
      requiredPermissions: ["finance:ledger.post"],
    });
    expect(posting.ok).toBe(false);
    if (!posting.ok) expect(posting.reason).toMatch(/CAP_POSTING remains LOCKED/);
    expect(validateDimensionExtension({ code: "9d", name: "Domain intelligence", description: "Lowercase code normalizes", lifecycleState: "PLANNED" })).toMatchObject({ ok: true, code: "9D" });
  });

  it("an extension definition always floors at viz:scene.read and never widens sector access", () => {
    const definition = extensionToDefinition(extension("10D_SIMULATION", { requiredPermissions: ["viz:export"] }));
    expect(definition.permissions[0]).toBe("viz:scene.read");
    expect(definition.permissions).toContain("viz:export");
    expect(definition.provenance.origin).toBe("EXTENSION");
    expect(definition.status).toBe("PLANNED");
  });

  it("registry merge: extensions never shadow canonical ids, malformed rows fail closed, XD stays last", () => {
    const registry = resolveDimensionRegistry([
      extension("3D"), // attempted canonical shadow — dropped
      extension("9D"),
      extension("9D", { id: "VZD_DUP" }), // duplicate code — dropped
      { ...extension("11D"), lifecycleState: "BETA" } as unknown as DimensionExtensionRecord, // malformed — dropped
      extension("10D_SIMULATION"),
    ]);
    expect(registry.extensionCount).toBe(2);
    const ids = registry.dimensions.map((d) => d.id);
    expect(ids).toEqual(["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D", "9D", "10D_SIMULATION", "XD"]);
    expect(registry.dimensions.find((d) => d.id === "3D")?.provenance.origin).toBe("CANONICAL");
  });
});
