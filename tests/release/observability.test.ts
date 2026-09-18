/**
 * BEYU OS — P3 Observability Tests (DB-free)
 */

import { describe, expect, it } from "vitest";
import { buildObservabilityFromHistory, getReleaseMetrics, getHealthObservability } from "@/lib/release/observability";
import type { ReleaseTransition } from "@/lib/release/types";

function makeHistory(states: string[]): ReleaseTransition[] {
  return states.map((s, i) => ({
    id: `evt_${i}`,
    releaseId: "REL_test",
    sourceCommit: "abc123",
    artifactBuildId: "build_1",
    environment: "test",
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
    actorId: "USR_test",
    actorType: "HUMAN",
    previousState: i === 0 ? null : (states[i - 1] as never),
    nextState: s as never,
    reason: "test",
    verificationEvidence: null,
    correlationId: null,
    traceId: null,
  }));
}

describe("P3 observability — release metrics", () => {
  it("builds observability from history", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED"]);
    const obs = buildObservabilityFromHistory("REL_test", history);

    expect(obs.releaseId).toBe("REL_test");
    expect(obs.promotionState).toBe("PROMOTED");
    expect(obs.runtimeVersion).toBeDefined();
    expect(obs.environment).toBeDefined();
  });

  it("observes PVG status", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]);
    const pvgResult = {
      status: "PASS",
      releaseId: "REL_test",
      commitSha: "abc123",
      environment: "test",
      deploymentId: "dep_1",
      buildId: "build_1",
      database: { connected: true, migrationCount: 47, latestMigration: "0046", fingerprint: "fp", fingerprintMatches: true },
      schema: { fingerprint: "sfp", matches: true },
      security: { rbac: true, abac: true, rls: true, capPostingLocked: true, noeliaBoundary: true },
      events: { outboxHealthy: true, chainIntact: true },
      runtime: { health: true, version: "BEYU-OS/1.0.0", identityMatches: true },
      checks: [],
      blockingFailures: [],
      verifiedAt: new Date().toISOString(),
      correlationId: "corr-1",
      traceId: "trace-1",
    } as never;

    const obs = buildObservabilityFromHistory("REL_test", history, pvgResult);
    expect(obs.pvgStatus).toBe("PASS");
    expect(obs.verifiedAt).toBeDefined();
  });

  it("observes PVG failure reason", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "FAILED"]);
    const pvgResult = {
      status: "FAIL",
      releaseId: "REL_test",
      commitSha: "abc123",
      environment: "test",
      deploymentId: "dep_1",
      buildId: "build_1",
      database: { connected: false, migrationCount: null, latestMigration: null, fingerprint: null, fingerprintMatches: false },
      schema: { fingerprint: null, matches: false },
      security: { rbac: true, abac: true, rls: true, capPostingLocked: true, noeliaBoundary: true },
      events: { outboxHealthy: null, chainIntact: null },
      runtime: { health: false, version: "BEYU-OS/1.0.0", identityMatches: false },
      checks: [],
      blockingFailures: ["database_connectivity", "runtime_health"],
      verifiedAt: new Date().toISOString(),
      correlationId: "corr-1",
      traceId: "trace-1",
    } as never;

    const obs = buildObservabilityFromHistory("REL_test", history, pvgResult);
    expect(obs.pvgStatus).toBe("FAIL");
    expect(obs.pvgFailureReason).toContain("database_connectivity");
  });

  it("observes canary state", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "CANARY"]);
    const canary = {
      id: "can_1",
      releaseId: "REL_test",
      environment: "test",
      state: "CANARY_TRAFFIC_ACTIVE",
      trafficPercentage: 5,
      previousPercentage: 1,
      verificationEvidence: null,
      pvgResult: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actorId: "USR_1",
      correlationId: null,
    } as never;

    const obs = buildObservabilityFromHistory("REL_test", history, null, canary);
    expect(obs.canaryState).toBe("CANARY_TRAFFIC_ACTIVE");
    expect(obs.trafficState?.green).toBe(5);
    expect(obs.trafficState?.blue).toBe(95);
  });

  it("observes blue/green traffic state", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED", "SWITCHED"]);
    const bg = {
      id: "bg_1",
      environment: "production",
      blueReleaseId: "REL_blue",
      greenReleaseId: "REL_green",
      state: "GREEN_ACTIVE",
      trafficState: { bluePercentage: 0, greenPercentage: 100 },
      verificationEvidence: null,
      pvgEvidence: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actorId: "USR_1",
      correlationId: null,
    } as never;

    const obs = buildObservabilityFromHistory("REL_test", history, null, null, bg);
    expect(obs.trafficState?.blue).toBe(0);
    expect(obs.trafficState?.green).toBe(100);
  });

  it("observes rollback state", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "FAILED", "ROLLED_BACK"]);
    const obs = buildObservabilityFromHistory("REL_test", history);
    expect(obs.rollbackState).toBe("COMPLETED");
  });

  it("getReleaseMetrics returns all required fields", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]);
    const obs = buildObservabilityFromHistory("REL_test", history);
    const metrics = getReleaseMetrics(obs);

    expect(metrics.releaseId).toBeDefined();
    expect(metrics.deploymentId).toBeDefined();
    expect(metrics.pvgStatus).toBeDefined();
    expect(metrics.canaryState).toBeDefined();
    expect(metrics.promotionState).toBeDefined();
    expect(metrics.rollbackState).toBeDefined();
    expect(metrics.migrationFingerprint).toBeDefined();
    expect(metrics.schemaFingerprint).toBeDefined();
    expect(metrics.runtimeVersion).toBeDefined();
    expect(metrics.environment).toBeDefined();
  });

  it("health observability includes release ID and deployment ID", () => {
    const health = getHealthObservability();
    expect(health.releaseId).toBeDefined();
    expect(health.deploymentId).toBeDefined();
    expect(health.system).toBeDefined();
    expect(health.gitSha).toBeDefined();
    expect(health.buildId).toBeDefined();
  });
});
