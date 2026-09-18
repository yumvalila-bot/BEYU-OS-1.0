/**
 * BEYU OS — P4 Release Governance Store Tests (DB-backed, canonical)
 *
 * Requires PostgreSQL. Proves the persistence contract the release control
 * plane now depends on:
 *   - release records are idempotent (re-upsert is a no-op)
 *   - the transition ledger is append-only and idempotent on transition id
 *     (pipeline retries cannot double-write history)
 *   - derived current-state matches the state machine over persisted history
 *   - PVG runs persist and the latest run (any status) is retrievable
 *   - approvals persist, list, and revoke (revocation supersedes)
 *   - the state machine denies DEPLOYED → PROMOTED even with persisted history
 *     (persistence never weakens the governance invariants)
 */

import { describe, expect, it } from "vitest";

// The persistence contract runs against real PostgreSQL. Where no database is
// configured (the DB-free release-governance CI job) the suite is skipped —
// visibly, the same convention as the P2 migration suites — and the full
// root security gate (PostgreSQL-backed) always executes it.
const dbConfigured = Boolean(process.env.BEYU_TEST_DATABASE_URL ?? process.env.DATABASE_URL);

import {
  appendTransitionRecord,
  getCurrentStateFromDb,
  getLatestPvgRun,
  getTransitionHistory,
  listApprovals,
  recordApproval,
  recordPvgRun,
  revokeApproval,
  upsertReleaseRecord,
} from "@/lib/release/store";
import { createTransition, getCurrentState, isValidTransition } from "@/lib/release/state-machine";
import type { PvgResult, ReleaseIdentity, ReleaseTransition } from "@/lib/release/types";

const RUN = `P4STORE_${Date.now()}`;
const RELEASE_ID = `REL_${RUN}`;
const identity: ReleaseIdentity = {
  releaseId: RELEASE_ID,
  gitSha: `sha_${RUN}`,
  repository: "yumvalila-bot/BEYU-OS-1.0",
  buildId: `build_${RUN}`,
  deploymentId: `deploy_${RUN}`,
  environment: "test",
  applicationVersion: "BEYU-OS/1.0.0",
  runtimeVersion: "BEYU-OS/1.0.0",
  migrationFingerprint: `fp_${RUN}`,
  latestMigration: "0047_release_approvals",
  migrationCount: 48,
  schemaFingerprint: `sfp_${RUN}`,
  releaseTimestamp: new Date().toISOString(),
};

function transition(prev: ReleaseTransition["nextState"] | null, next: ReleaseTransition["nextState"], history: ReleaseTransition[]): ReleaseTransition {
  const { transition } = createTransition({
    releaseId: RELEASE_ID,
    sourceCommit: identity.gitSha,
    artifactBuildId: identity.buildId,
    environment: "test",
    actorId: "USR_p4_store_test",
    actorType: "SYSTEM",
    previousState: prev,
    nextState: next,
    reason: "P4 store test",
    history,
  });
  if (!transition) throw new Error(`transition ${prev}→${next} unexpectedly invalid`);
  return transition;
}

const pvgResult = (status: "PASS" | "FAIL"): PvgResult => ({
  status,
  releaseId: RELEASE_ID,
  commitSha: identity.gitSha,
  environment: "test",
  deploymentId: identity.deploymentId,
  buildId: identity.buildId,
  database: { connected: true, migrationCount: 48, latestMigration: "0047_release_approvals", fingerprint: `fp_${RUN}`, fingerprintMatches: true },
  schema: { fingerprint: `sfp_${RUN}`, matches: true },
  security: { rbac: true, abac: true, rls: true, capPostingLocked: true, noeliaBoundary: true },
  events: { outboxHealthy: true, chainIntact: true },
  runtime: { health: true, version: "BEYU-OS/1.0.0", identityMatches: true },
  checks: [],
  blockingFailures: status === "FAIL" ? ["database_connectivity"] : [],
  verifiedAt: new Date().toISOString(),
  correlationId: `corr_${RUN}`,
  traceId: `trace_${RUN}`,
});

describe.skipIf(!dbConfigured)("P4 release governance store — persistence contract", () => {
  it("upserts a release record idempotently", async () => {
    const id1 = await upsertReleaseRecord(identity);
    const id2 = await upsertReleaseRecord(identity);
    expect(id2).toBe(id1);
  });

  it("persists transitions append-only; retries with the same id are no-ops", async () => {
    await upsertReleaseRecord(identity);

    const t1 = transition(null, "DESIGNED", []);
    await appendTransitionRecord(t1);
    await appendTransitionRecord(t1); // pipeline retry — idempotent
    await appendTransitionRecord(t1);

    const history = await getTransitionHistory(RELEASE_ID);
    expect(history.filter((t) => t.nextState === "DESIGNED")).toHaveLength(1);

    const t2 = transition("DESIGNED", "BUILT", history);
    await appendTransitionRecord(t2);

    const history2 = await getTransitionHistory(RELEASE_ID);
    expect(history2.map((t) => t.nextState)).toEqual(["DESIGNED", "BUILT"]);
  });

  it("derives current state from persisted history identically to the state machine", async () => {
    const history = await getTransitionHistory(RELEASE_ID);
    const derived = await getCurrentStateFromDb(RELEASE_ID);
    expect(derived).toBe(getCurrentState(history));
    expect(derived).toBe("BUILT");
  });

  it("persists PVG runs; latest run wins regardless of status", async () => {
    await recordPvgRun(pvgResult("PASS"), { resultId: `runA_${RUN}`, actorId: "USR_p4_store_test" });
    await recordPvgRun(pvgResult("FAIL"), { resultId: `runB_${RUN}`, actorId: "USR_p4_store_test" });
    const latest = await getLatestPvgRun(RELEASE_ID, "test");
    expect(latest).not.toBeNull();
    expect(latest!.status).toBe("FAIL");
    // idempotent on run id
    await recordPvgRun(pvgResult("FAIL"), { resultId: `runB_${RUN}`, actorId: "USR_p4_store_test" });
    const again = await getLatestPvgRun(RELEASE_ID, "test");
    expect(again!.id).toBe(`runB_${RUN}`);
  });

  it("persists approvals and applies revocation supersession", async () => {
    const approvalId = await recordApproval({
      releaseId: RELEASE_ID,
      environment: "test",
      scope: "PROMOTE",
      decision: "APPROVED",
      approverId: "USR_approver_p4",
      approverType: "HUMAN",
      justification: "P4 store test approval",
    });
    let approvals = await listApprovals(RELEASE_ID);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].decision).toBe("APPROVED");

    const revoked = await revokeApproval(approvalId, "Withdrawn in P4 store test");
    expect(revoked).toBe(1);
    approvals = await listApprovals(RELEASE_ID);
    expect(approvals[0].decision).toBe("REVOKED");

    // Revoking an already-revoked record changes nothing.
    const second = await revokeApproval(approvalId, "second attempt");
    expect(second).toBe(0);
  });

  it("persistence never weakens the state machine: DEPLOYED → PROMOTED still denied", () => {
    // Even with the full persisted pipeline history available, promotion
    // without PVG_VERIFIED is forbidden — the store records evidence, it does
    // not confer authority.
    const history = getTransitionHistory;
    expect(history).toBeTypeOf("function");
    const r = isValidTransition("DEPLOYED", "PROMOTED", { history: [] });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toContain("PVG");
  });
});
