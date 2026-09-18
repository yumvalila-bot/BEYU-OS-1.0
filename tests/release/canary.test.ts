/**
 * BEYU OS — P3 Canary Governance Tests (DB-free)
 */

import { describe, expect, it } from "vitest";
import {
  isValidCanaryTransition,
  validateCanaryConfig,
  createCanaryDeployment,
  transitionCanary,
  getCanaryEvidence,
  NoOpTrafficAdapter,
  ALLOWED_TRAFFIC_PERCENTAGES,
} from "@/lib/release/canary";

describe("P3 canary — state machine", () => {
  it("CONFIGURED → DEPLOYED allowed", () => {
    expect(isValidCanaryTransition("CANARY_CONFIGURED", "CANARY_DEPLOYED")).toBe(true);
  });

  it("DEPLOYED → PVG_VERIFIED allowed", () => {
    expect(isValidCanaryTransition("CANARY_DEPLOYED", "CANARY_PVG_VERIFIED")).toBe(true);
  });

  it("PVG_VERIFIED → TRAFFIC_ACTIVE allowed", () => {
    expect(isValidCanaryTransition("CANARY_PVG_VERIFIED", "CANARY_TRAFFIC_ACTIVE")).toBe(true);
  });

  it("TRAFFIC_ACTIVE → OBSERVATION allowed", () => {
    expect(isValidCanaryTransition("CANARY_TRAFFIC_ACTIVE", "CANARY_OBSERVATION")).toBe(true);
  });

  it("OBSERVATION → PROMOTION_ELIGIBLE allowed", () => {
    expect(isValidCanaryTransition("CANARY_OBSERVATION", "CANARY_PROMOTION_ELIGIBLE")).toBe(true);
  });

  it("CONFIGURED → PROMOTION_ELIGIBLE NOT allowed (must go through states)", () => {
    expect(isValidCanaryTransition("CANARY_CONFIGURED", "CANARY_PROMOTION_ELIGIBLE")).toBe(false);
  });

  it("PROMOTION_ELIGIBLE → CONFIGURED NOT allowed (terminal)", () => {
    expect(isValidCanaryTransition("CANARY_PROMOTION_ELIGIBLE", "CANARY_CONFIGURED")).toBe(false);
  });
});

describe("P3 canary — config validation", () => {
  it("valid config passes", () => {
    const result = validateCanaryConfig({
      releaseId: "REL_123",
      environment: "production",
      allowedPercentages: [0, 1, 5, 25, 50, 100],
      configuredPercentage: 1,
      enabled: true,
      observationWindowMinutes: 30,
      requiredPvgChecks: ["runtime_health", "release_identity"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("invalid percentage fails", () => {
    const result = validateCanaryConfig({
      releaseId: "REL_123",
      environment: "production",
      allowedPercentages: [0, 1, 5],
      configuredPercentage: 10, // Not allowed
      enabled: true,
      observationWindowMinutes: 30,
      requiredPvgChecks: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("configuredPercentage");
  });

  it("traffic percentage must be from allowed set", () => {
    for (const p of ALLOWED_TRAFFIC_PERCENTAGES) {
      expect(ALLOWED_TRAFFIC_PERCENTAGES.includes(p)).toBe(true);
    }
    expect(ALLOWED_TRAFFIC_PERCENTAGES.includes(0)).toBe(true);
    expect(ALLOWED_TRAFFIC_PERCENTAGES.includes(100)).toBe(true);
  });
});

describe("P3 canary — deployment lifecycle", () => {
  it("creates canary deployment in CONFIGURED state", () => {
    const dep = createCanaryDeployment({
      releaseId: "REL_123",
      environment: "production",
      actorId: "USR_1",
    });
    expect(dep.state).toBe("CANARY_CONFIGURED");
    expect(dep.trafficPercentage).toBe(0);
  });

  it("CONFIGURED → DEPLOYED succeeds", () => {
    const dep = createCanaryDeployment({ releaseId: "REL_123", environment: "production", actorId: "USR_1" });
    const result = transitionCanary(dep, "CANARY_DEPLOYED");
    expect(result.valid).toBe(true);
    expect(result.deployment.state).toBe("CANARY_DEPLOYED");
  });

  it("DEPLOYED → PVG_VERIFIED requires PASS PVG", () => {
    const dep = createCanaryDeployment({ releaseId: "REL_123", environment: "production", actorId: "USR_1" });
    const deployed = transitionCanary(dep, "CANARY_DEPLOYED").deployment;

    const fail = transitionCanary(deployed, "CANARY_PVG_VERIFIED");
    expect(fail.valid).toBe(false);
    expect(fail.reason).toContain("PVG");

    const pass = transitionCanary(deployed, "CANARY_PVG_VERIFIED", {
      pvgResult: { status: "PASS" } as never,
    });
    expect(pass.valid).toBe(true);
    expect(pass.deployment.state).toBe("CANARY_PVG_VERIFIED");
  });

  it("traffic percentage separate from authorization — percentage does not grant promotion", () => {
    const dep = createCanaryDeployment({ releaseId: "REL_123", environment: "production", actorId: "USR_1" });
    let d = transitionCanary(dep, "CANARY_DEPLOYED").deployment;
    d = transitionCanary(d, "CANARY_PVG_VERIFIED", { pvgResult: { status: "PASS" } as never }).deployment;
    d = transitionCanary(d, "CANARY_TRAFFIC_ACTIVE", { trafficPercentage: 5 }).deployment;

    expect(d.trafficPercentage).toBe(5);
    // Traffic % alone does NOT make it promotion eligible
    const evidence = getCanaryEvidence(d);
    expect(evidence.promotionEligible).toBe(false);
    expect(evidence.trafficPercentage).toBe(5);
  });

  it("full canary flow to promotion eligible", () => {
    let dep = createCanaryDeployment({ releaseId: "REL_123", environment: "production", actorId: "USR_1" });
    dep = transitionCanary(dep, "CANARY_DEPLOYED").deployment;
    dep = transitionCanary(dep, "CANARY_PVG_VERIFIED", { pvgResult: { status: "PASS" } as never }).deployment;
    dep = transitionCanary(dep, "CANARY_TRAFFIC_ACTIVE", { trafficPercentage: 1 }).deployment;
    dep = transitionCanary(dep, "CANARY_OBSERVATION").deployment;
    dep = transitionCanary(dep, "CANARY_PROMOTION_ELIGIBLE").deployment;

    expect(dep.state).toBe("CANARY_PROMOTION_ELIGIBLE");
    const evidence = getCanaryEvidence(dep);
    expect(evidence.promotionEligible).toBe(true);
  });

  it("canary percentage does not authorize promotion — explicit evidence required", () => {
    const dep = createCanaryDeployment({ releaseId: "REL_123", environment: "production", actorId: "USR_1" });
    // Even at 100% traffic, not promotion eligible unless state is PROMOTION_ELIGIBLE
    let d = dep;
    d = transitionCanary(d, "CANARY_DEPLOYED").deployment;
    d = transitionCanary(d, "CANARY_PVG_VERIFIED", { pvgResult: { status: "PASS" } as never }).deployment;
    d = transitionCanary(d, "CANARY_TRAFFIC_ACTIVE", { trafficPercentage: 100 }).deployment;

    const evidence = getCanaryEvidence(d);
    expect(evidence.trafficPercentage).toBe(100);
    expect(evidence.promotionEligible).toBe(false); // Must go through OBSERVATION → PROMOTION_ELIGIBLE
  });
});

describe("P3 canary — adapter boundary", () => {
  it("noop adapter reports real infra unavailable and does not fake traffic", async () => {
    const adapter = new NoOpTrafficAdapter();
    expect(adapter.isRealInfrastructure).toBe(false);

    const result = await adapter.setTrafficSplit("production", { blue: 90, green: 10 }, {
      actorId: "USR_1",
      reason: "test",
      correlationId: "corr-1",
    });

    expect(result.success).toBe(false);
    expect(result.evidence.isRealInfrastructure).toBe(false);
    expect(result.evidence.reason).toContain("not available");
  });

  it("getTrafficSplit returns safe default without pretending", async () => {
    const adapter = new NoOpTrafficAdapter();
    const split = await adapter.getTrafficSplit("production");
    expect(split.blue).toBe(100);
    expect(split.green).toBe(0);
  });
});
