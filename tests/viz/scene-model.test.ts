/**
 * Scene-model projection — pure certification of the leak-prevention core.
 *
 * The manifest is an EXACT allowlist projection: classification, source refs
 * and every non-allowlisted field stay server-side; classification ceilings
 * withhold rows (counting them honestly); the accessible table equivalent is
 * ALWAYS present; object ceilings bound the payload (progressive loading).
 */
import { describe, expect, it } from "vitest";
import {
  LOW_BANDWIDTH_OBJECT_LIMIT,
  MANIFEST_OBJECT_LIMIT,
  buildSceneManifest,
  type SceneObjectInput,
} from "@/lib/viz/scene-model";
import { derived, observed, unavailable } from "@/lib/viz/provenance";
import type { Principal } from "@/lib/authz";

const clearance = (level: Principal["clearance"]): Pick<Principal, "clearance"> => ({ clearance: level });

function object(i: number, overrides: Partial<SceneObjectInput> = {}): SceneObjectInput {
  return {
    id: `OBJ_${i}`,
    label: `Object ${i}`,
    layerId: "test-layer",
    classification: "INTERNAL",
    geometry: null,
    dimensionValues: {
      "1D": observed(`value-${i}`),
      "5D": i % 2 === 0 ? observed("1000.00", "TZS") : unavailable(),
      "8D": derived("MEDIUM"),
    },
    accessibleText: `Test object ${i} with governed values.`,
    timeAnchor: "2026-01-01",
    sourceRef: `secret_table:${i}`,
    status: "ACTIVE",
    ...overrides,
  };
}

const LAYERS = [{ id: "test-layer", dimensionId: "1D", kind: "TABLE" as const, label: "Test", visible: true }];

describe("allowlist projection (leak prevention by construction)", () => {
  it("projected objects carry EXACTLY the client-safe keys", () => {
    const manifest = buildSceneManifest({
      sceneId: null,
      name: "Test scene",
      sector: "UJENZI",
      dimensions: ["1D", "5D", "8D"],
      layers: LAYERS,
      objects: [object(1)],
      principal: clearance("INTERNAL"),
      sourceAdapter: "UJENZI",
      systemOfRecord: "test",
    });
    expect(manifest.objects).toHaveLength(1);
    const keys = Object.keys(manifest.objects[0]).sort();
    expect(keys).toEqual(["accessibleText", "geometry", "id", "label", "layerId", "status", "timeAnchor", "values"]);
    // No classification, no sourceRef, no internal reference ever crosses.
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("sourceRef");
    expect(serialized).not.toContain("secret_table");
    expect(serialized).not.toContain('"classification"');
  });

  it("values keep only value/status/unit — the epistemic status survives, internals do not", () => {
    const manifest = buildSceneManifest({
      sceneId: null,
      name: "Test",
      sector: "UJENZI",
      dimensions: ["1D", "5D", "8D"],
      layers: LAYERS,
      objects: [object(1), object(2)],
      principal: clearance("INTERNAL"),
      sourceAdapter: "UJENZI",
      systemOfRecord: "test",
    });
    // object(1) is odd → 5D UNAVAILABLE (never fabricated as 0); object(2) is even → OBSERVED.
    const first = manifest.objects[0].values;
    expect(Object.keys(first["5D"]).sort()).toEqual(["status", "unit", "value"]);
    expect(first["5D"].status).toBe("UNAVAILABLE");
    expect(first["5D"].value).toBeNull();
    expect(first["8D"].status).toBe("DERIVED");
    const second = manifest.objects[1].values;
    expect(second["5D"]).toMatchObject({ value: "1000.00", status: "OBSERVED", unit: "TZS" });
  });
});

describe("classification ceiling", () => {
  it("withholds above-clearance objects and discloses the COUNT only", () => {
    const manifest = buildSceneManifest({
      sceneId: null,
      name: "Test",
      sector: "UJENZI",
      dimensions: ["1D"],
      layers: LAYERS,
      objects: [
        object(1, { classification: "INTERNAL" }),
        object(2, { classification: "RESTRICTED", label: "Restricted row" }),
        object(3, { classification: "HIGHLY_RESTRICTED" }),
      ],
      principal: clearance("INTERNAL"),
      sourceAdapter: "UJENZI",
      systemOfRecord: "test",
    });
    expect(manifest.objects.map((o) => o.id)).toEqual(["OBJ_1"]);
    expect(manifest.withheldByClassification).toBe(2);
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("Restricted row");
    expect(serialized).not.toContain("HIGHLY_RESTRICTED");
  });
});

describe("accessible table + payload ceilings", () => {
  it("the accessible table equivalent is always present with one row per object", () => {
    const manifest = buildSceneManifest({
      sceneId: null,
      name: "Test",
      sector: "AGRICULTURE",
      dimensions: ["1D", "5D"],
      layers: LAYERS,
      objects: [object(1), object(2)],
      principal: clearance("INTERNAL"),
      sourceAdapter: "AGRICULTURE",
      systemOfRecord: "test",
    });
    expect(manifest.accessibleTable.columns).toEqual(["Object", "Layer", "1D", "5D", "Time", "Status", "Description"]);
    expect(manifest.accessibleTable.rows).toHaveLength(2);
    expect(manifest.accessibleTable.rows[0][3]).toBe("UNKNOWN"); // UNAVAILABLE renders UNKNOWN, never 0
    expect(manifest.accessibleTable.rows[1][3]).toBe("1000.00 TZS");
    expect(manifest.accessibleTable.rows[0][5]).toBe("ACTIVE"); // Status column
    expect(manifest.accessibleTable.rows[0][6]).toContain("governed values"); // Description = accessible text
  });

  it("caps objects at the server-side limits (progressive loading, low bandwidth)", () => {
    const many = Array.from({ length: MANIFEST_OBJECT_LIMIT + 20 }, (_, i) => object(i));
    const full = buildSceneManifest({
      sceneId: null, name: "Big", sector: "UJENZI", dimensions: ["1D"], layers: LAYERS,
      objects: many, principal: clearance("INTERNAL"), sourceAdapter: "UJENZI", systemOfRecord: "test",
    });
    expect(full.objects).toHaveLength(MANIFEST_OBJECT_LIMIT);
    const low = buildSceneManifest({
      sceneId: null, name: "Big", sector: "UJENZI", dimensions: ["1D"], layers: LAYERS,
      objects: many, principal: clearance("INTERNAL"), sourceAdapter: "UJENZI", systemOfRecord: "test",
      presentation: { lowBandwidth: true },
    });
    expect(low.objects).toHaveLength(LOW_BANDWIDTH_OBJECT_LIMIT);
    expect(low.presentation.maxObjects).toBe(LOW_BANDWIDTH_OBJECT_LIMIT);
  });

  it("provenance carries the dominant epistemic status honestly", () => {
    const manifest = buildSceneManifest({
      sceneId: null,
      name: "Test",
      sector: "UJENZI",
      dimensions: ["1D", "5D"],
      layers: LAYERS,
      objects: [object(1), object(2)],
      principal: clearance("INTERNAL"),
      sourceAdapter: "UJENZI",
      systemOfRecord: "ujenzi_projects + friends",
    });
    expect(manifest.provenance.systemOfRecord).toBe("ujenzi_projects + friends");
    expect(["OBSERVED", "DERIVED", "UNAVAILABLE", "UNVERIFIED", "FORECAST"]).toContain(manifest.provenance.epistemicStatus);
    expect(manifest.provenance.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
