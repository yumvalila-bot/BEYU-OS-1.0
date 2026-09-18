/**
 * BEYU OS — P4 Release Governance Store (canonical persistence)
 *
 * WHAT THIS IS
 * ────────────
 * The ONE persistence layer for the release control plane. Every release
 * record, transition, PVG run, approval, canary/blue-green state and rollback
 * request goes through this module — the P3 in-memory history is retired.
 *
 * Persistence is the difference between a demo and a control plane:
 *   - release state survives process restarts and platform deploys,
 *   - evidence is queryable for audit and compliance,
 *   - idempotent writes make pipeline retries safe (P6 recovery).
 *
 * IDEMPOTENCY CONTRACT
 * ────────────────────
 * Every insert carries a client-generated primary key (from `newId` at the
 * call site, or the pipeline's deterministic record id). Re-running a step —
 * the normal recovery after a transient CI failure — re-inserts the SAME key
 * and therefore changes nothing (`onConflictDoNothing`). Nothing is upserted
 * into a different semantic: history is append-only; only the mutable
 * instrument tables (canary, blue/green, rollback, approvals) ever UPDATE.
 *
 * SECURITY
 * ────────
 * These are control-plane tables: tenantId is NULL, access is gated by RBAC at
 * the API boundary (platform:dashboard.read / platform:config.manage), the
 * runtime role has append-mostly DML via 0047 and no DDL anywhere, and RLS on
 * tenant-scoped tables is untouched. Persistence here confers no authority.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  blueGreenDeployments,
  canaryDeployments,
  pvgRuns,
  releaseApprovals,
  releaseRecords,
  releaseTransitions,
  rollbackRequests,
} from "@/db/schema/release";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { ReleaseIdentity, ReleaseTransition, PvgResult } from "./types";
import { getCurrentState } from "./state-machine";
import type { ReleaseApprovalRecord, ApprovalScope, ApprovalDecision } from "./approvals";

// ─────────────────────────────────────────────────────────────────────────────
// Release records
// ─────────────────────────────────────────────────────────────────────────────

/** Idempotently persist a release identity. Returns the stored row id. */
export async function upsertReleaseRecord(identity: ReleaseIdentity): Promise<string> {
  const existing = await db
    .select({ id: releaseRecords.id })
    .from(releaseRecords)
    .where(eq(releaseRecords.releaseId, identity.releaseId))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const rowId = newId(ID_PREFIX.event);
  await db
    .insert(releaseRecords)
    .values({
      id: rowId,
      releaseId: identity.releaseId,
      gitSha: identity.gitSha,
      repository: identity.repository,
      buildId: identity.buildId,
      deploymentId: identity.deploymentId,
      environment: identity.environment,
      applicationVersion: identity.applicationVersion,
      runtimeVersion: identity.runtimeVersion,
      migrationFingerprint: identity.migrationFingerprint,
      latestMigration: identity.latestMigration,
      migrationCount: identity.migrationCount,
      schemaFingerprint: identity.schemaFingerprint,
      releaseTimestamp: new Date(identity.releaseTimestamp),
    })
    .onConflictDoNothing({ target: releaseRecords.releaseId });
  return rowId;
}

export async function getReleaseRecord(releaseId: string) {
  const rows = await db
    .select()
    .from(releaseRecords)
    .where(eq(releaseRecords.releaseId, releaseId))
    .limit(1);
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Release transitions (append-only ledger)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a validated transition. Idempotent on the transition id: pipeline
 * retries after a transient failure cannot double-write history.
 */
export async function appendTransitionRecord(transition: ReleaseTransition): Promise<void> {
  await db
    .insert(releaseTransitions)
    .values({
      id: transition.id,
      releaseId: transition.releaseId,
      sourceCommit: transition.sourceCommit,
      artifactBuildId: transition.artifactBuildId,
      environment: transition.environment,
      timestamp: new Date(transition.timestamp),
      actorId: transition.actorId,
      actorType: transition.actorType,
      previousState: transition.previousState,
      nextState: transition.nextState,
      reason: transition.reason,
      verificationEvidence: transition.verificationEvidence ?? undefined,
      correlationId: transition.correlationId,
      traceId: transition.traceId,
    })
    .onConflictDoNothing({ target: releaseTransitions.id });
}

export async function getTransitionHistory(releaseId: string): Promise<ReleaseTransition[]> {
  const rows = await db
    .select()
    .from(releaseTransitions)
    .where(eq(releaseTransitions.releaseId, releaseId))
    .orderBy(asc(releaseTransitions.timestamp), asc(releaseTransitions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    releaseId: r.releaseId,
    sourceCommit: r.sourceCommit,
    artifactBuildId: r.artifactBuildId,
    environment: r.environment,
    timestamp: r.timestamp.toISOString(),
    actorId: r.actorId,
    actorType: r.actorType as ReleaseTransition["actorType"],
    previousState: r.previousState as ReleaseTransition["previousState"],
    nextState: r.nextState as ReleaseTransition["nextState"],
    reason: r.reason,
    verificationEvidence: (r.verificationEvidence ?? null) as Record<string, unknown> | null,
    correlationId: r.correlationId,
    traceId: r.traceId,
  }));
}

/** Current release state derived from the persisted ledger. */
export async function getCurrentStateFromDb(releaseId: string): Promise<ReleaseTransition["nextState"] | null> {
  const history = await getTransitionHistory(releaseId);
  return getCurrentState(history);
}

/** All releases with their latest persisted state (governed listing). */
export async function listReleases(limit = 50): Promise<
  Array<{ releaseId: string; environment: string; gitSha: string; state: string | null; releaseTimestamp: string }>
> {
  const rows = await db
    .select()
    .from(releaseRecords)
    .orderBy(desc(releaseRecords.releaseTimestamp))
    .limit(limit);
  const out = [] as Array<{
    releaseId: string;
    environment: string;
    gitSha: string;
    state: string | null;
    releaseTimestamp: string;
  }>;
  for (const r of rows) {
    const state = await getCurrentStateFromDb(r.releaseId);
    out.push({
      releaseId: r.releaseId,
      environment: r.environment,
      gitSha: r.gitSha,
      state,
      releaseTimestamp: r.releaseTimestamp.toISOString(),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PVG runs
// ─────────────────────────────────────────────────────────────────────────────

/** Persist a PVG result. Idempotent on `resultId`. */
export async function recordPvgRun(
  result: PvgResult,
  ctx: { resultId?: string; correlationId?: string | null; traceId?: string | null; actorId: string },
): Promise<string> {
  const id = ctx.resultId ?? newId(ID_PREFIX.event);
  await db
    .insert(pvgRuns)
    .values({
      id,
      releaseId: result.releaseId,
      environment: result.environment,
      status: result.status,
      commitSha: result.commitSha,
      deploymentId: result.deploymentId,
      buildId: result.buildId,
      database: result.database,
      schema: result.schema,
      security: result.security,
      events: result.events,
      runtime: result.runtime,
      checks: result.checks,
      blockingFailures: result.blockingFailures,
      correlationId: ctx.correlationId ?? null,
      traceId: ctx.traceId ?? null,
    })
    .onConflictDoNothing({ target: pvgRuns.id });
  return id;
}

export async function getLatestPvgRun(
  releaseId: string,
  environment?: string,
): Promise<{ id: string; status: string; verifiedAt: string; result: Record<string, unknown> } | null> {
  const where = environment
    ? and(eq(pvgRuns.releaseId, releaseId), eq(pvgRuns.environment, environment))
    : eq(pvgRuns.releaseId, releaseId);
  const rows = await db
    .select()
    .from(pvgRuns)
    .where(where)
    .orderBy(desc(pvgRuns.verifiedAt))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    status: r.status,
    verifiedAt: r.verifiedAt.toISOString(),
    result: {
      database: r.database,
      schema: r.schema,
      security: r.security,
      events: r.events,
      runtime: r.runtime,
      checks: r.checks,
      blockingFailures: r.blockingFailures,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Approvals
// ─────────────────────────────────────────────────────────────────────────────

export async function recordApproval(input: {
  id?: string;
  releaseId: string;
  environment: string;
  scope: ApprovalScope;
  decision: ApprovalDecision;
  approverId: string;
  approverType: ReleaseApprovalRecord["approverType"];
  justification: string;
  evidence?: Record<string, unknown> | null;
  expiresAt?: string | null;
}): Promise<string> {
  const id = input.id ?? newId(ID_PREFIX.approval);
  await db.insert(releaseApprovals).values({
    id,
    releaseId: input.releaseId,
    environment: input.environment,
    scope: input.scope,
    decision: input.decision,
    approverId: input.approverId,
    approverType: input.approverType,
    justification: input.justification,
    evidence: input.evidence ?? undefined,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });
  return id;
}

export async function listApprovals(releaseId: string): Promise<ReleaseApprovalRecord[]> {
  const rows = await db
    .select()
    .from(releaseApprovals)
    .where(eq(releaseApprovals.releaseId, releaseId))
    .orderBy(asc(releaseApprovals.createdAt));
  return rows.map((r) => ({
    id: r.id,
    releaseId: r.releaseId,
    environment: r.environment,
    scope: r.scope as ApprovalScope,
    decision: r.decision as ApprovalDecision,
    approverId: r.approverId,
    approverType: r.approverType as ReleaseApprovalRecord["approverType"],
    justification: r.justification,
    evidence: (r.evidence ?? null) as Record<string, unknown> | null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Withdraw an approval before it is consumed. Returns rows updated. */
export async function revokeApproval(
  approvalId: string,
  justification: string,
): Promise<number> {
  const updated = await db
    .update(releaseApprovals)
    .set({ decision: "REVOKED", justification, updatedAt: new Date() })
    .where(and(eq(releaseApprovals.id, approvalId), eq(releaseApprovals.decision, "APPROVED")))
    .returning({ id: releaseApprovals.id });
  return updated.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canary / blue-green / rollback instrument state (P5/P6 build on these)
// ─────────────────────────────────────────────────────────────────────────────

export async function recordCanaryDeployment(input: {
  id?: string;
  releaseId: string;
  environment: string;
  state: string;
  trafficPercentage: number;
  previousPercentage?: number | null;
  verificationEvidence?: Record<string, unknown> | null;
  pvgResult?: Record<string, unknown> | null;
  actorId: string;
  correlationId?: string | null;
}): Promise<string> {
  const id = input.id ?? newId(ID_PREFIX.event);
  await db
    .insert(canaryDeployments)
    .values({
      id,
      releaseId: input.releaseId,
      environment: input.environment,
      state: input.state,
      trafficPercentage: input.trafficPercentage,
      previousPercentage: input.previousPercentage ?? null,
      verificationEvidence: input.verificationEvidence ?? undefined,
      pvgResult: input.pvgResult ?? undefined,
      actorId: input.actorId,
      correlationId: input.correlationId ?? null,
    })
    .onConflictDoNothing({ target: canaryDeployments.id });
  return id;
}

export async function getLatestCanaryDeployment(releaseId: string) {
  const rows = await db
    .select()
    .from(canaryDeployments)
    .where(eq(canaryDeployments.releaseId, releaseId))
    .orderBy(desc(canaryDeployments.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordBlueGreenDeployment(input: {
  id?: string;
  environment: string;
  blueReleaseId: string;
  greenReleaseId: string;
  state: string;
  trafficState: Record<string, unknown>;
  verificationEvidence?: Record<string, unknown> | null;
  pvgEvidence?: Record<string, unknown> | null;
  actorId: string;
  correlationId?: string | null;
}): Promise<string> {
  const id = input.id ?? newId(ID_PREFIX.event);
  await db
    .insert(blueGreenDeployments)
    .values({
      id,
      environment: input.environment,
      blueReleaseId: input.blueReleaseId,
      greenReleaseId: input.greenReleaseId,
      state: input.state,
      trafficState: input.trafficState,
      verificationEvidence: input.verificationEvidence ?? undefined,
      pvgEvidence: input.pvgEvidence ?? undefined,
      actorId: input.actorId,
      correlationId: input.correlationId ?? null,
    })
    .onConflictDoNothing({ target: blueGreenDeployments.id });
  return id;
}

export async function getLatestBlueGreenDeployment(environment: string) {
  const rows = await db
    .select()
    .from(blueGreenDeployments)
    .where(eq(blueGreenDeployments.environment, environment))
    .orderBy(desc(blueGreenDeployments.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordRollbackRequest(input: {
  id?: string;
  releaseId: string;
  targetReleaseId: string;
  type: "APPLICATION" | "DATABASE" | "TRAFFIC";
  reason: string;
  actorId: string;
  actorType: "HUMAN" | "SERVICE";
  compatibilityChecked: boolean;
  authorized: boolean;
  evidence?: Record<string, unknown> | null;
  correlationId?: string | null;
}): Promise<string> {
  const id = input.id ?? newId(ID_PREFIX.event);
  await db
    .insert(rollbackRequests)
    .values({
      id,
      releaseId: input.releaseId,
      targetReleaseId: input.targetReleaseId,
      type: input.type,
      reason: input.reason,
      actorId: input.actorId,
      actorType: input.actorType,
      compatibilityChecked: input.compatibilityChecked,
      authorized: input.authorized,
      evidence: input.evidence ?? undefined,
      correlationId: input.correlationId ?? null,
    })
    .onConflictDoNothing({ target: rollbackRequests.id });
  return id;
}

export async function listRollbackRequests(releaseId: string) {
  const rows = await db
    .select()
    .from(rollbackRequests)
    .where(eq(rollbackRequests.releaseId, releaseId))
    .orderBy(desc(rollbackRequests.createdAt));
  return rows;
}
