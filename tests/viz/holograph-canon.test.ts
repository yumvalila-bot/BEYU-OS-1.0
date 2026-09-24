/**
 * Holograph canon — architectural invariants (pure, no database).
 *
 * Proves the constitutional boundaries of the capability:
 *   • Holograph is a SHARED BEYU OS CAPABILITY — it holds no OS registry
 *     entry and appears nowhere in the canonical Sector OS catalogue;
 *   • the canonical authorization order is never reversed (renderer last);
 *   • the honest status matrix never claims physical holographic hardware
 *     support or any parser this repository does not contain;
 *   • Family Office is a capability too, and the sector-consumer set is
 *     exactly the five canonical Sector OSs.
 */
import { describe, expect, it } from "vitest";
import {
  HOLOGRAPH_AUTHORIZATION_ORDER,
  HOLOGRAPH_CAPABILITY_NAME,
  HOLOGRAPH_CANONICAL_DEFINITION,
  HOLOGRAPH_IS,
  HOLOGRAPH_IS_NOT,
  HOLOGRAPH_SECTOR_CONSUMERS,
  HOLOGRAPH_SUBSYSTEM_STATUS,
  holographSubsystemStatus,
} from "@/lib/viz/holograph";
import { BEYU_CONTROL_PLANE, SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import { VIZ_INTERACTION_TYPES } from "@/db/schema/visualization";

describe("Holograph — canonical definition", () => {
  it("is named Holograph and carries the canonical definition", () => {
    expect(HOLOGRAPH_CAPABILITY_NAME).toBe("Holograph");
    expect(HOLOGRAPH_CANONICAL_DEFINITION).toContain("governed spatial visualization and interaction capability");
    expect(HOLOGRAPH_CANONICAL_DEFINITION).toContain("hardware-independent");
    expect(HOLOGRAPH_CANONICAL_DEFINITION).toContain("tenant isolation, RLS, audit");
    expect(HOLOGRAPH_CANONICAL_DEFINITION).toContain("human-approval controls");
  });

  it("declares the constitutional negatives", () => {
    const joined = HOLOGRAPH_IS_NOT.join(" ");
    expect(joined).toMatch(/an operating system \(not registered in the BEYU OS catalogue/i);
    expect(joined).toMatch(/an authorization system/i);
    expect(joined).toMatch(/a database authority/i);
    expect(joined).toMatch(/a transaction engine/i);
    expect(joined).toMatch(/CAP_POSTING remains LOCKED/i);
    expect(joined).toMatch(/independent AI authority/i);
    expect(joined).toMatch(/a replacement for Noelia/i);
    expect(joined).toMatch(/a lending platform/i);
    expect(joined).toMatch(/insurance underwriter/i);
  });

  it("declares what Holograph IS (capabilities only)", () => {
    const joined = HOLOGRAPH_IS.join(" ");
    expect(joined).toMatch(/spatial visualization/i);
    expect(joined).toMatch(/digital-twin presentation/i);
    expect(joined).toMatch(/device abstraction/i);
    expect(joined).toMatch(/accessible 2D/i);
  });
});

describe("Holograph — no OS exists or is implied", () => {
  it("the canonical Sector OS catalogue is exactly the five Sector OSs", () => {
    expect(BEYU_CONTROL_PLANE.code).toBe("BEYU");
    const codes = SECTOR_OPERATING_SYSTEMS.map((s) => s.code).sort();
    expect(codes).toEqual(["AGRICULTURE", "FINANCE", "FOUNDATION", "HEALTH", "UJENZI"]);
  });

  it("Holograph and Family Office appear nowhere in the OS catalogue", () => {
    const all = [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS];
    for (const os of all) {
      const haystack = `${os.code} ${os.name} ${os.description}`.toLowerCase();
      expect(haystack).not.toContain("holograph");
      expect(haystack).not.toContain("family office");
      expect(haystack).not.toContain("bim os");
      expect(haystack).not.toContain("gis os");
      expect(haystack).not.toContain("digital twin os");
    }
  });

  it("the sector-consumer set is exactly the five Sector OSs (never Holograph or Family Office)", () => {
    expect([...HOLOGRAPH_SECTOR_CONSUMERS].sort()).toEqual([
      "Agriculture OS",
      "Finance OS",
      "Foundation OS",
      "Health OS",
      "Ujenzi OS",
    ]);
  });

  it("the viz sector code vocabulary has no holograph/family-office sector", () => {
    const codes = VIZ_SECTOR_CODES.map((c) => String(c).toLowerCase());
    expect(codes).not.toContain("holograph");
    expect(codes).not.toContain("family");
  });
});

describe("Holograph — authorization order", () => {
  it("authentication first, renderer last (the order is never reversed)", () => {
    expect(HOLOGRAPH_AUTHORIZATION_ORDER[0]).toBe("AUTHENTICATION");
    expect(HOLOGRAPH_AUTHORIZATION_ORDER[HOLOGRAPH_AUTHORIZATION_ORDER.length - 1]).toBe("RENDERER");
    const order = HOLOGRAPH_AUTHORIZATION_ORDER.join(" ");
    const rlsIdx = order.indexOf("RLS");
    const sceneIdx = order.indexOf("SCENE");
    const datasetIdx = order.indexOf("PERMITTED DATASET");
    expect(rlsIdx).toBeGreaterThan(-1);
    expect(datasetIdx).toBeGreaterThan(rlsIdx);
    expect(sceneIdx).toBeGreaterThan(datasetIdx);
  });
});

describe("Holograph — honest status matrix", () => {
  it("never claims physical holographic hardware support as implemented", () => {
    const hardware = holographSubsystemStatus().filter((s) => /physical holographic/i.test(s.subsystem));
    expect(hardware.length).toBeGreaterThan(0);
    for (const row of hardware) {
      expect(row.status).toBe("NOT_IMPLEMENTED");
    }
  });

  it("never claims binary geometry parsers that do not exist", () => {
    const parsers = holographSubsystemStatus().filter((s) => /parsing|GLTF|IFC/.test(s.subsystem));
    for (const row of parsers) {
      expect(row.status).not.toBe("IMPLEMENTED");
    }
  });

  it("the full exported matrix equals the clean accessor (no hidden rows)", () => {
    expect(holographSubsystemStatus().map((s) => s.subsystem)).toEqual(HOLOGRAPH_SUBSYSTEM_STATUS.map((s) => s.subsystem));
    for (const row of holographSubsystemStatus()) {
      expect(["IMPLEMENTED", "PARTIALLY_IMPLEMENTED", "NOT_IMPLEMENTED", "PLANNED"]).toContain(row.status);
    }
  });
});

describe("Holograph — interaction vocabulary", () => {
  it("is a closed set: presentation + navigation + delegation, no mutation type", () => {
    expect(VIZ_INTERACTION_TYPES).toContain("SELECT_OBJECT");
    expect(VIZ_INTERACTION_TYPES).toContain("INSPECT_OBJECT");
    expect(VIZ_INTERACTION_TYPES).toContain("REQUEST_WORKFLOW");
    expect(VIZ_INTERACTION_TYPES).toContain("REQUEST_APPROVAL");
    // No interaction type may be a mutation verb on sector data.
    for (const t of VIZ_INTERACTION_TYPES) {
      expect(t).not.toMatch(/^(CREATE|UPDATE|DELETE|POST|APPROVE)_/);
    }
  });
});
