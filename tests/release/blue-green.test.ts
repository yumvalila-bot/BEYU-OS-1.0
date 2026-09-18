/**
 * BEYU OS — P3 Blue/Green Tests (DB-free)
 */

import { describe, expect, it } from "vitest";
import {
  isValidBlueGreenTransition,
  createBlueGreenDeployment,
  transitionBlueGreen,
  getBlueGreenEvidence,
  NoOpDeploymentAdapter,
} from "@/lib/release/blue-green";

describe("P3 blue/green — state machine", () => {
  it("BLUE_ACTIVE → GREEN_DEPLOYED allowed", () => {
    expect(isValidBlueGreenTransition("BLUE_ACTIVE", "GREEN_DEPLOYED")).toBe(true);
  });

  it("GREEN_DEPLOYED → GREEN_PVG_VERIFIED allowed", () => {
    expect(isValidBlueGreenTransition("GREEN_DEPLOYED", "GREEN_PVG_VERIFIED")).toBe(true);
  });

  it("GREEN_PVG_VERIFIED → GREEN_CANARY allowed", () => {
    expect(isValidBlueGreenTransition("GREEN_PVG_VERIFIED", "GREEN_CANARY")).toBe(true);
  });

  it("GREEN_CANARY → GREEN_PROMOTION_READY allowed", () => {
    expect(isValidBlueGreenTransition("GREEN_CANARY", "GREEN_PROMOTION_READY")).toBe(true);
  });

  it("GREEN_PROMOTION_READY → GREEN_ACTIVE allowed", () => {
    expect(isValidBlueGreenTransition("GREEN_PROMOTION_READY", "GREEN_ACTIVE")).toBe(true);
  });

  it("GREEN_ACTIVE → BLUE_RETIRED allowed", () => {
    expect(isValidBlueGreenTransition("GREEN_ACTIVE", "BLUE_RETIRED")).toBe(true);
  });

  it("BLUE_ACTIVE → GREEN_ACTIVE NOT allowed (must go through verification)", () => {
    expect(isValidBlueGreenTransition("BLUE_ACTIVE", "GREEN_ACTIVE")).toBe(false);
  });

  it("BLUE_ACTIVE → BLUE_RETIRED NOT allowed", () => {
    expect(isValidBlueGreenTransition("BLUE_ACTIVE", "BLUE_RETIRED")).toBe(false);
  });
});

describe("P3 blue/green — deployment lifecycle", () => {
  it("creates deployment in BLUE_ACTIVE", () => {
    const dep = createBlueGreenDeployment({
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      actorId: "USR_1",
    });
    expect(dep.state).toBe("BLUE_ACTIVE");
    expect(dep.trafficState.bluePercentage).toBe(100);
    expect(dep.trafficState.greenPercentage).toBe(0);
  });

  it("BLUE_ACTIVE → GREEN_DEPLOYED succeeds", () => {
    const dep = createBlueGreenDeployment({
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      actorId: "USR_1",
    });
    const result = transitionBlueGreen(dep, "GREEN_DEPLOYED");
    expect(result.valid).toBe(true);
    expect(result.deployment.state).toBe("GREEN_DEPLOYED");
  });

  it("GREEN_DEPLOYED → GREEN_PVG_VERIFIED requires PASS PVG", () => {
    const dep = createBlueGreenDeployment({
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      actorId: "USR_1",
    });
    const deployed = transitionBlueGreen(dep, "GREEN_DEPLOYED").deployment;

    const fail = transitionBlueGreen(deployed, "GREEN_PVG_VERIFIED");
    expect(fail.valid).toBe(false);

    const pass = transitionBlueGreen(deployed, "GREEN_PVG_VERIFIED", {
      pvgResult: { status: "PASS" } as never,
    });
    expect(pass.valid).toBe(true);
  });

  it("GREEN_PROMOTION_READY → GREEN_ACTIVE requires audit record", () => {
    let dep = createBlueGreenDeployment({
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      actorId: "USR_1",
    });
    dep = transitionBlueGreen(dep, "GREEN_DEPLOYED").deployment;
    dep = transitionBlueGreen(dep, "GREEN_PVG_VERIFIED", { pvgResult: { status: "PASS" } as never }).deployment;
    dep = transitionBlueGreen(dep, "GREEN_PROMOTION_READY", {
      pvgResult: { status: "PASS" } as never,
      identityMatches: true,
      dbCompatible: true,
      actorAuthorized: true,
      policyAuthorized: true,
    }).deployment;

    const fail = transitionBlueGreen(dep, "GREEN_ACTIVE");
    expect(fail.valid).toBe(false);
    expect(fail.reason).toContain("audit");

    const pass = transitionBlueGreen(dep, "GREEN_ACTIVE", {
      auditRecordId: "AUD_123",
      identityMatches: true,
      dbCompatible: true,
      actorAuthorized: true,
      policyAuthorized: true,
      pvgResult: { status: "PASS" } as never,
    });
    expect(pass.valid).toBe(true);
  });

  it("promotion requires identity match and db compatibility", () => {
    let dep = createBlueGreenDeployment({
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      actorId: "USR_1",
    });
    dep = transitionBlueGreen(dep, "GREEN_DEPLOYED").deployment;
    dep = transitionBlueGreen(dep, "GREEN_PVG_VERIFIED", { pvgResult: { status: "PASS" } as never }).deployment;

    const failIdentity = transitionBlueGreen(dep, "GREEN_PROMOTION_READY", {
      pvgResult: { status: "PASS" } as never,
      identityMatches: false,
      dbCompatible: true,
      actorAuthorized: true,
      policyAuthorized: true,
    });
    expect(failIdentity.valid).toBe(false);
    expect(failIdentity.reason).toContain("identity");

    const failDb = transitionBlueGreen(dep, "GREEN_PROMOTION_READY", {
      pvgResult: { status: "PASS" } as never,
      identityMatches: true,
      dbCompatible: false,
      actorAuthorized: true,
      policyAuthorized: true,
    });
    expect(failDb.valid).toBe(false);
    expect(failDb.reason).toContain("Database");
  });

  it("full blue/green flow to BLUE_RETIRED", () => {
    let dep = createBlueGreenDeployment({
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      actorId: "USR_1",
    });
    dep = transitionBlueGreen(dep, "GREEN_DEPLOYED").deployment;
    dep = transitionBlueGreen(dep, "GREEN_PVG_VERIFIED", { pvgResult: { status: "PASS" } as never }).deployment;
    dep = transitionBlueGreen(dep, "GREEN_PROMOTION_READY", {
      pvgResult: { status: "PASS" } as never,
      identityMatches: true,
      dbCompatible: true,
      actorAuthorized: true,
      policyAuthorized: true,
    }).deployment;
    dep = transitionBlueGreen(dep, "GREEN_ACTIVE", {
      auditRecordId: "AUD_123",
      identityMatches: true,
      dbCompatible: true,
      actorAuthorized: true,
      policyAuthorized: true,
      pvgResult: { status: "PASS" } as never,
    }).deployment;
    dep = transitionBlueGreen(dep, "BLUE_RETIRED").deployment;

    expect(dep.state).toBe("BLUE_RETIRED");
    const evidence = getBlueGreenEvidence(dep);
    expect(evidence.state).toBe("BLUE_RETIRED");
  });
});

describe("P3 blue/green — adapter boundary", () => {
  it("noop adapter does not fabricate deployment", async () => {
    const adapter = new NoOpDeploymentAdapter();
    expect(adapter.isRealInfrastructure).toBe(false);

    const result = await adapter.deployGreen("REL_green", "production");
    expect(result.evidence.isRealInfrastructure).toBe(false);
    expect(result.evidence.boundary).toBe("HUMAN_CONTROLLED");
  });

  it("retire blue requires human governance", async () => {
    const adapter = new NoOpDeploymentAdapter();
    const result = await adapter.retireBlue("REL_blue", "production");
    expect(result.success).toBe(false);
    expect(result.evidence.boundary).toBe("HUMAN_CONTROLLED");
  });
});
