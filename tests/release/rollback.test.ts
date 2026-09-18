/**
 * BEYU OS — P3 Rollback Tests (DB-free)
 */

import { describe, expect, it } from "vitest";
import {
  createRollbackRequest,
  authorizeRollback,
  validateRollback,
  getRollbackExecutor,
} from "@/lib/release/rollback";
import type { ReleaseTransition } from "@/lib/release/types";

function makeHistory(states: string[]): ReleaseTransition[] {
  return states.map((s, i) => ({
    id: `evt_${i}`,
    releaseId: "REL_current",
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

describe("P3 rollback — creation", () => {
  it("creates rollback request", () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "APPLICATION",
      reason: "Critical bug",
      actorId: "USR_1",
    });
    expect(req.releaseId).toBe("REL_current");
    expect(req.targetReleaseId).toBe("REL_previous");
    expect(req.type).toBe("APPLICATION");
    expect(req.authorized).toBe(false);
  });

  it("distinguishes APPLICATION, DATABASE, TRAFFIC", () => {
    const app = createRollbackRequest({
      releaseId: "REL_1",
      targetReleaseId: "REL_0",
      type: "APPLICATION",
      reason: "app bug",
      actorId: "USR_1",
    });
    const db = createRollbackRequest({
      releaseId: "REL_1",
      targetReleaseId: "REL_0",
      type: "DATABASE",
      reason: "db bug",
      actorId: "USR_1",
    });
    const traffic = createRollbackRequest({
      releaseId: "REL_1",
      targetReleaseId: "REL_0",
      type: "TRAFFIC",
      reason: "traffic bug",
      actorId: "USR_1",
    });

    expect(app.type).toBe("APPLICATION");
    expect(db.type).toBe("DATABASE");
    expect(traffic.type).toBe("TRAFFIC");
  });
});

describe("P3 rollback — validation", () => {
  it("validates target exists and compatible", () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "APPLICATION",
      reason: "bug",
      actorId: "USR_1",
    });
    const authorized = authorizeRollback(req, true, true);

    const result = validateRollback(authorized, {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "FAILED"]),
      targetReleaseExists: true,
      targetReleaseCompatible: true,
      actorAuthorized: true,
      dbRollbackSafe: true,
      trafficRollbackSafe: true,
      currentState: "FAILED",
    });

    expect(result.valid).toBe(true);
  });

  it("blocks when target does not exist", () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_missing",
      type: "APPLICATION",
      reason: "bug",
      actorId: "USR_1",
    });
    const authorized = authorizeRollback(req, true, true);

    const result = validateRollback(authorized, {
      history: makeHistory(["FAILED"]),
      targetReleaseExists: false,
      targetReleaseCompatible: true,
      actorAuthorized: true,
      dbRollbackSafe: true,
      trafficRollbackSafe: true,
      currentState: "FAILED",
    });

    expect(result.valid).toBe(false);
    expect(result.blocking.join(" ")).toContain("does not exist");
  });

  it("blocks DATABASE rollback as unsafe by default", () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "DATABASE",
      reason: "db issue",
      actorId: "USR_1",
    });
    const authorized = authorizeRollback(req, true, true);

    const result = validateRollback(authorized, {
      history: makeHistory(["FAILED"]),
      targetReleaseExists: true,
      targetReleaseCompatible: true,
      actorAuthorized: true,
      dbRollbackSafe: false, // DB rollback not safe
      trafficRollbackSafe: true,
      currentState: "FAILED",
    });

    expect(result.valid).toBe(false);
    expect(result.blocking.join(" ")).toContain("Database rollback not safe");
  });

  it("blocks unauthorized actor", () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "APPLICATION",
      reason: "bug",
      actorId: "USR_unauthorized",
    });
    const authorized = authorizeRollback(req, true, true);

    const result = validateRollback(authorized, {
      history: makeHistory(["FAILED"]),
      targetReleaseExists: true,
      targetReleaseCompatible: true,
      actorAuthorized: false,
      dbRollbackSafe: true,
      trafficRollbackSafe: true,
      currentState: "FAILED",
    });

    expect(result.valid).toBe(false);
    expect(result.blocking.join(" ")).toContain("not authorized");
  });
});

describe("P3 rollback — executors (adapter boundary)", () => {
  it("application rollback executor stops at human boundary", async () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "APPLICATION",
      reason: "bug",
      actorId: "USR_1",
    });
    const executor = getRollbackExecutor("APPLICATION");
    const result = await executor.execute(req);

    expect(result.success).toBe(false);
    expect(result.evidence.boundary).toBe("HUMAN_CONTROLLED");
    expect(result.evidence.note).toContain("human-governed");
  });

  it("database rollback executor is forward-fix only", async () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "DATABASE",
      reason: "db bug",
      actorId: "USR_1",
    });
    const executor = getRollbackExecutor("DATABASE");
    const result = await executor.execute(req);

    expect(result.success).toBe(false);
    expect(result.evidence.safety).toBe("FORWARD_FIX_ONLY");
    expect(result.evidence.note).toContain("forward-fix");
  });

  it("traffic rollback executor stops at boundary", async () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "TRAFFIC",
      reason: "traffic issue",
      actorId: "USR_1",
    });
    const executor = getRollbackExecutor("TRAFFIC");
    const result = await executor.execute(req);

    expect(result.success).toBe(false);
    expect(result.evidence.boundary).toBe("HUMAN_CONTROLLED");
  });
});

describe("P3 rollback — authorization", () => {
  it("rollback must verify target release", () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_target",
      type: "APPLICATION",
      reason: "rollback",
      actorId: "USR_1",
    });
    expect(req.compatibilityChecked).toBe(false);

    const authorized = authorizeRollback(req, true, true, { verified: true });
    expect(authorized.compatibilityChecked).toBe(true);
    expect(authorized.authorized).toBe(true);
  });

  it("rollback produces audit evidence", async () => {
    const req = createRollbackRequest({
      releaseId: "REL_current",
      targetReleaseId: "REL_previous",
      type: "APPLICATION",
      reason: "bug",
      actorId: "USR_1",
    });
    const authorized = authorizeRollback(req, true, true);
    const executor = getRollbackExecutor("APPLICATION");
    const result = await executor.execute(authorized);

    expect(result.evidence).toBeDefined();
    expect(result.requestId).toBe(req.id);
    expect(result.fromReleaseId).toBe("REL_current");
    expect(result.toReleaseId).toBe("REL_previous");
  });
});
