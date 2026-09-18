/**
 * BEYU OS — P3 PVG Tests (DB-free)
 */

import { describe, expect, it } from "vitest";
import { runPvg, isPvgPass, getPvgFailureReason } from "@/lib/release/pvg";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";

describe("P3 PVG — structured evidence", () => {
  it("PASS when all blocking checks pass", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      migrationFingerprint: "fp-abc",
      expectedMigrationFingerprint: "fp-abc",
      migrationFingerprintMatches: true,
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
      eventOutboxHealthy: true,
      eventChainIntact: true,
      criticalReadiness: true,
    });

    expect(result.status).toBe("PASS");
    expect(result.blockingFailures).toEqual([]);
    expect(isPvgPass(result)).toBe(true);
    // P4 adds the database_release_compatibility check (11 total).
    expect(result.checks.length).toBe(11);
    expect(result.releaseId).toBe(identity.releaseId);
  });

  it("FAIL when runtime health fails", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      runtimeHealth: false,
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("runtime_health");
    expect(isPvgPass(result)).toBe(false);
    expect(getPvgFailureReason(result)).toContain("runtime_health");
  });

  it("FAIL when release identity mismatch", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      expectedReleaseIdentity: { gitSha: "different-sha-that-does-not-match-anything-1234567890" },
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("release_identity");
  });

  it("FAIL when database connectivity fails", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: false,
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("database_connectivity");
  });

  it("FAIL when migration fingerprint mismatch", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      migrationFingerprint: "actual-fp",
      expectedMigrationFingerprint: "expected-fp",
      migrationFingerprintMatches: false,
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("database_migration_state");
  });

  it("FAIL when security invariants fail", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      runtimeHealth: true,
      authzChecks: {
        rbac: false,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("authorization_security");
  });

  it("FAIL when CAP_POSTING not locked", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: false,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("authorization_security");
  });

  it("FAIL when Noelia boundary violated", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test-123",
      traceId: "trace-123",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: false,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.blockingFailures).toContain("authorization_security");
  });

  it("PASS includes structured evidence", async () => {
    const identity = getCurrentReleaseIdentity();
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "production",
      correlationId: "corr-1",
      traceId: "trace-1",
      dbConnected: true,
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      migrationFingerprint: "fp-123",
      runtimeHealth: true,
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
      eventOutboxHealthy: true,
      eventChainIntact: true,
      criticalReadiness: true,
    });

    expect(result.releaseId).toBeDefined();
    expect(result.commitSha).toBeDefined();
    expect(result.environment).toBe("production");
    expect(result.database).toBeDefined();
    expect(result.schema).toBeDefined();
    expect(result.security).toBeDefined();
    expect(result.events).toBeDefined();
    expect(result.runtime).toBeDefined();
    expect(result.checks).toBeDefined();
    expect(result.verifiedAt).toBeDefined();
    expect(result.correlationId).toBe("corr-1");
    expect(result.traceId).toBe("trace-1");
  });

  it("health 200 alone is NOT sufficient — PVG checks 10 dimensions", async () => {
    const identity = getCurrentReleaseIdentity();
    // Simulate health 200 but other checks fail
    const result = await runPvg({
      releaseIdentity: identity,
      environment: "test",
      correlationId: "test",
      traceId: "test",
      runtimeHealth: true, // health 200
      dbConnected: false, // but DB down
      migrationCount: 47,
      latestMigration: "0046_release_governance",
      authzChecks: {
        rbac: true,
        abac: true,
        rls: true,
        capPostingLocked: true,
        noeliaBoundary: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.checks.find((c) => c.check === "runtime_health")?.passed).toBe(true);
    expect(result.checks.find((c) => c.check === "database_connectivity")?.passed).toBe(false);
  });
});
