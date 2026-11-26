import { describe, expect, it } from "vitest";
import {
  HIVE_WORKFORCE_PROFILES,
  assertWorkforceIntegrity,
  auditWorkforceProfiles,
  intersectDelegationReach,
  isWorkforceProfileReachable,
  resolveWorkforceReach,
  type WorkforceCapabilityIndex,
} from "@/lib/noelia/cognitive/workforce";
import { NOELIA_BRAINS } from "@/lib/noelia/cognitive/brain-contracts";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";

/**
 * The workforce roster must be TRUE of the live registry, not merely plausible
 * on paper. These tests fail if a specialist names a capability that does not
 * exist, or if any specialist gains posting authority.
 */

function liveIndex(): WorkforceCapabilityIndex {
  const registry = createDefaultNoeliaToolRegistry();
  const rows = registry.list() as unknown as { name: string; risk?: string }[];
  const registered = new Set(rows.map((row) => row.name));
  const riskByName = new Map(rows.map((row) => [row.name, row.risk ?? "LOW"] as const));
  return {
    registered,
    riskOf: (capability) => (riskByName.get(capability) as "LOW" | "MEDIUM" | "HIGH" | undefined) ?? null,
  };
}

describe("HIVE workforce roster", () => {
  it("declares exactly twelve specialists with unique codes", () => {
    expect(HIVE_WORKFORCE_PROFILES).toHaveLength(12);
    const codes = HIVE_WORKFORCE_PROFILES.map((profile) => profile.code);
    expect(new Set(codes).size).toBe(12);
  });

  it("passes the structural integrity guard", () => {
    expect(() => assertWorkforceIntegrity()).not.toThrow();
  });

  it("arms no specialist with posting authority", () => {
    for (const profile of HIVE_WORKFORCE_PROFILES) {
      expect(profile.mayPost).toBe(false);
      expect(profile.riskCeiling).toBe("LOW");
    }
  });

  it("binds every specialist to a declared brain", () => {
    const brainIds = new Set(NOELIA_BRAINS.map((brain) => brain.id));
    for (const profile of HIVE_WORKFORCE_PROFILES) {
      expect(brainIds.has(profile.brain)).toBe(true);
    }
  });

  /**
   * The important one: every declared capability must resolve in the REAL
   * registry. This is what stops the roster from drifting into fiction.
   */
  it("names only capabilities that exist in the live registry", () => {
    const drift = auditWorkforceProfiles(liveIndex());
    expect(
      drift,
      `workforce specialists name unregistered capabilities: ${JSON.stringify(drift)}`,
    ).toEqual([]);
  });

  it("never names a HIGH-risk capability", () => {
    const index = liveIndex();
    for (const profile of HIVE_WORKFORCE_PROFILES) {
      for (const capability of profile.capabilities) {
        expect(index.riskOf(capability), `${profile.code} names ${capability}`).not.toBe("HIGH");
      }
    }
  });
});

describe("workforce reach resolution", () => {
  const index = liveIndex();
  const capitalFormation = HIVE_WORKFORCE_PROFILES.find((p) => p.code === "FINANCIAL_ANALYST")!;

  it("returns nothing when the caller holds nothing", () => {
    expect(resolveWorkforceReach(capitalFormation, [], index)).toEqual([]);
  });

  it("intersects declared reach with caller authorization", () => {
    const reach = resolveWorkforceReach(capitalFormation, ["finance.cash.position"], index);
    expect(reach).toEqual(["finance.cash.position"]);
  });

  it("drops a capability the caller holds but the specialist does not declare", () => {
    const reach = resolveWorkforceReach(capitalFormation, ["knowledge.rag.search"], index);
    expect(reach).toEqual([]);
  });

  it("does not widen beyond the declared list even with full authorization", () => {
    const everything = [...index.registered];
    const reach = resolveWorkforceReach(capitalFormation, everything, index);
    expect(reach.length).toBeLessThanOrEqual(capitalFormation.capabilities.length);
  });

  it("reports whether a caller can reach a specialist at all", () => {
    expect(isWorkforceProfileReachable(capitalFormation, [])).toBe(false);
    expect(isWorkforceProfileReachable(capitalFormation, ["finance.cash.position"])).toBe(true);
  });
});

describe("delegation is an intersection, never a union", () => {
  it("grants only what both specialists hold", () => {
    const result = intersectDelegationReach(
      ["finance.cash.position", "risk.register.query"],
      ["risk.register.query", "knowledge.rag.search"],
    );
    expect(result).toEqual(["risk.register.query"]);
  });

  it("cannot be used to escalate from a low-privilege to a high-privilege specialist", () => {
    const lowReach = ["knowledge.rag.search"];
    const highReach = ["finance.cash.position", "finance.treasury.aggregate"];
    expect(intersectDelegationReach(lowReach, highReach)).toEqual([]);
  });

  it("is order-stable and never duplicates", () => {
    const result = intersectDelegationReach(["a", "b", "a"], ["a", "b"]);
    expect(result).toEqual(["a", "b"]);
  });
});
