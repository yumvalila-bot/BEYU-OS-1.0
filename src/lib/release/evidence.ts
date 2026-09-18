/**
 * BEYU OS — P3 Release Evidence (canonical)
 *
 * Use existing audit/release/provenance architecture where possible.
 * Do not create competing audit trails.
 * Every release transition should be attributable.
 * Evidence suitable for operational debugging, compliance, security review, rollback, incident, board/founder governance.
 * Prefer immutable append-only records where existing architecture supports it.
 */

import { newId, ID_PREFIX } from "@/lib/ids";
import type { ReleaseTransition, PvgResult, CanaryDeployment, BlueGreenDeployment, RollbackRequest } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Types (aligned with existing audit_log + enterprise_events)
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseEvidenceType =
  | "RELEASE_DESIGNED"
  | "RELEASE_BUILT"
  | "RELEASE_DEPLOYED"
  | "RELEASE_PVG_STARTED"
  | "RELEASE_PVG_PASSED"
  | "RELEASE_PVG_FAILED"
  | "RELEASE_CANARY_CONFIGURED"
  | "RELEASE_CANARY_DEPLOYED"
  | "RELEASE_CANARY_PVG_VERIFIED"
  | "RELEASE_CANARY_TRAFFIC_ACTIVE"
  | "RELEASE_CANARY_OBSERVATION"
  | "RELEASE_CANARY_PROMOTION_ELIGIBLE"
  | "RELEASE_CANARY_FAILED"
  | "RELEASE_PROMOTED"
  | "RELEASE_SWITCHED"
  | "RELEASE_RETIRED"
  | "RELEASE_CONTRACTED"
  | "RELEASE_VERIFIED"
  | "RELEASE_FAILED"
  | "RELEASE_ROLLED_BACK"
  | "BLUE_GREEN_BLUE_ACTIVE"
  | "BLUE_GREEN_GREEN_DEPLOYED"
  | "BLUE_GREEN_GREEN_PVG_VERIFIED"
  | "BLUE_GREEN_GREEN_CANARY"
  | "BLUE_GREEN_PROMOTION_READY"
  | "BLUE_GREEN_GREEN_ACTIVE"
  | "BLUE_GREEN_BLUE_RETIRED"
  | "ROLLBACK_REQUESTED"
  | "ROLLBACK_COMPLETED"
  | "ROLLBACK_FAILED";

export interface ReleaseEvidence {
  id: string;
  type: ReleaseEvidenceType;
  releaseId: string;
  environment: string;
  actorId: string;
  actorType: "HUMAN" | "SERVICE" | "AI" | "SYSTEM";
  timestamp: string;
  correlationId: string | null;
  traceId: string | null;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  evidence: Record<string, unknown> | null;
  pvgResult: PvgResult | null;
  // For audit chain compatibility
  auditLogId: string | null;
  eventId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Creation (pure, DB-free)
// ─────────────────────────────────────────────────────────────────────────────

export function createEvidenceFromTransition(transition: ReleaseTransition): ReleaseEvidence {
  const typeMap: Record<string, ReleaseEvidenceType> = {
    DESIGNED: "RELEASE_DESIGNED",
    BUILT: "RELEASE_BUILT",
    DEPLOYED: "RELEASE_DEPLOYED",
    PVG_VERIFIED: "RELEASE_PVG_PASSED",
    CANARY: "RELEASE_CANARY_DEPLOYED",
    PROMOTED: "RELEASE_PROMOTED",
    SWITCHED: "RELEASE_SWITCHED",
    RETIRED: "RELEASE_RETIRED",
    CONTRACTED: "RELEASE_CONTRACTED",
    VERIFIED: "RELEASE_VERIFIED",
    FAILED: "RELEASE_FAILED",
    ROLLED_BACK: "RELEASE_ROLLED_BACK",
  };

  return {
    id: newId(ID_PREFIX.event),
    type: typeMap[transition.nextState] ?? "RELEASE_FAILED",
    releaseId: transition.releaseId,
    environment: transition.environment,
    actorId: transition.actorId,
    actorType: transition.actorType,
    timestamp: transition.timestamp,
    correlationId: transition.correlationId,
    traceId: transition.traceId,
    previousState: transition.previousState,
    nextState: transition.nextState,
    reason: transition.reason,
    evidence: transition.verificationEvidence,
    pvgResult: (transition.verificationEvidence?.pvgResult as PvgResult) ?? null,
    auditLogId: null,
    eventId: null,
  };
}

export function createEvidenceFromPvg(pvgResult: PvgResult, actorId: string): ReleaseEvidence {
  return {
    id: newId(ID_PREFIX.event),
    type: pvgResult.status === "PASS" ? "RELEASE_PVG_PASSED" : "RELEASE_PVG_FAILED",
    releaseId: pvgResult.releaseId,
    environment: pvgResult.environment,
    actorId,
    actorType: "SERVICE",
    timestamp: pvgResult.verifiedAt,
    correlationId: pvgResult.correlationId,
    traceId: pvgResult.traceId,
    previousState: null,
    nextState: pvgResult.status === "PASS" ? "PVG_VERIFIED" : "FAILED",
    reason: pvgResult.status === "PASS" ? "PVG passed" : pvgResult.blockingFailures.join("; "),
    evidence: {
      checks: pvgResult.checks,
      blockingFailures: pvgResult.blockingFailures,
      database: pvgResult.database,
      schema: pvgResult.schema,
      security: pvgResult.security,
      runtime: pvgResult.runtime,
    },
    pvgResult,
    auditLogId: null,
    eventId: null,
  };
}

export function createEvidenceFromCanary(
  deployment: CanaryDeployment,
  actorId: string,
): ReleaseEvidence {
  const typeMap: Record<string, ReleaseEvidenceType> = {
    CANARY_CONFIGURED: "RELEASE_CANARY_CONFIGURED",
    CANARY_DEPLOYED: "RELEASE_CANARY_DEPLOYED",
    CANARY_PVG_VERIFIED: "RELEASE_CANARY_PVG_VERIFIED",
    CANARY_TRAFFIC_ACTIVE: "RELEASE_CANARY_TRAFFIC_ACTIVE",
    CANARY_OBSERVATION: "RELEASE_CANARY_OBSERVATION",
    CANARY_PROMOTION_ELIGIBLE: "RELEASE_CANARY_PROMOTION_ELIGIBLE",
    CANARY_FAILED: "RELEASE_CANARY_FAILED",
    CANARY_ROLLED_BACK: "RELEASE_ROLLED_BACK",
  };

  return {
    id: newId(ID_PREFIX.event),
    type: typeMap[deployment.state] ?? "RELEASE_CANARY_FAILED",
    releaseId: deployment.releaseId,
    environment: deployment.environment,
    actorId,
    actorType: "SERVICE",
    timestamp: deployment.updatedAt,
    correlationId: deployment.correlationId,
    traceId: null,
    previousState: null,
    nextState: deployment.state,
    reason: `Canary ${deployment.state} at ${deployment.trafficPercentage}%`,
    evidence: {
      trafficPercentage: deployment.trafficPercentage,
      verificationEvidence: deployment.verificationEvidence,
      pvgResult: deployment.pvgResult,
    },
    pvgResult: deployment.pvgResult,
    auditLogId: null,
    eventId: null,
  };
}

export function createEvidenceFromBlueGreen(
  deployment: BlueGreenDeployment,
  actorId: string,
): ReleaseEvidence {
  const typeMap: Record<string, ReleaseEvidenceType> = {
    BLUE_ACTIVE: "BLUE_GREEN_BLUE_ACTIVE",
    GREEN_DEPLOYED: "BLUE_GREEN_GREEN_DEPLOYED",
    GREEN_PVG_VERIFIED: "BLUE_GREEN_GREEN_PVG_VERIFIED",
    GREEN_CANARY: "BLUE_GREEN_GREEN_CANARY",
    GREEN_PROMOTION_READY: "BLUE_GREEN_PROMOTION_READY",
    GREEN_ACTIVE: "BLUE_GREEN_GREEN_ACTIVE",
    BLUE_RETIRED: "BLUE_GREEN_BLUE_RETIRED",
    BG_FAILED: "RELEASE_FAILED",
    BG_ROLLED_BACK: "RELEASE_ROLLED_BACK",
  };

  return {
    id: newId(ID_PREFIX.event),
    type: typeMap[deployment.state] ?? "RELEASE_FAILED",
    releaseId: deployment.greenReleaseId,
    environment: deployment.environment,
    actorId,
    actorType: "SERVICE",
    timestamp: deployment.updatedAt,
    correlationId: deployment.correlationId,
    traceId: null,
    previousState: null,
    nextState: deployment.state,
    reason: `Blue/Green ${deployment.state}: blue=${deployment.blueReleaseId} green=${deployment.greenReleaseId}`,
    evidence: {
      blueReleaseId: deployment.blueReleaseId,
      greenReleaseId: deployment.greenReleaseId,
      trafficState: deployment.trafficState,
      verificationEvidence: deployment.verificationEvidence,
      pvgEvidence: deployment.pvgEvidence,
    },
    pvgResult: deployment.pvgEvidence,
    auditLogId: null,
    eventId: null,
  };
}

export function createEvidenceFromRollback(
  rollback: RollbackRequest,
  success: boolean,
  auditEventId: string | null = null,
): ReleaseEvidence {
  return {
    id: newId(ID_PREFIX.event),
    type: success ? "ROLLBACK_COMPLETED" : "ROLLBACK_FAILED",
    releaseId: rollback.releaseId,
    environment: "unknown", // Would be derived from release record
    actorId: rollback.actorId,
    actorType: rollback.actorType,
    timestamp: new Date().toISOString(),
    correlationId: rollback.correlationId,
    traceId: null,
    previousState: rollback.releaseId,
    nextState: rollback.targetReleaseId,
    reason: rollback.reason,
    evidence: {
      type: rollback.type,
      targetReleaseId: rollback.targetReleaseId,
      compatibilityChecked: rollback.compatibilityChecked,
      authorized: rollback.authorized,
      evidence: rollback.evidence,
    },
    pvgResult: null,
    auditLogId: auditEventId,
    eventId: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Integration (would call existing audit_log in real DB)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditRecordInput {
  tenantId?: string | null;
  actorUserId: string;
  action: string;
  objectType: string;
  objectId: string;
  outcome: "SUCCESS" | "DENIED" | "FAILURE";
  reason?: string;
  newValue?: Record<string, unknown> | null;
  traceId?: string;
}

/**
 * Convert release evidence to audit input for existing audit_log.
 * This reuses the canonical audit infrastructure.
 */
export function toAuditInput(evidence: ReleaseEvidence): AuditRecordInput {
  return {
    tenantId: null, // Platform-level, not tenant-scoped
    actorUserId: evidence.actorId,
    action: evidence.type,
    objectType: "RELEASE",
    objectId: evidence.releaseId,
    outcome: evidence.type.includes("FAILED") ? "FAILURE" : "SUCCESS",
    reason: evidence.reason ?? undefined,
    newValue: {
      environment: evidence.environment,
      previousState: evidence.previousState,
      nextState: evidence.nextState,
      evidence: evidence.evidence,
      pvgResult: evidence.pvgResult
        ? {
            status: evidence.pvgResult.status,
            blockingFailures: evidence.pvgResult.blockingFailures,
            verifiedAt: evidence.pvgResult.verifiedAt,
          }
        : null,
      correlationId: evidence.correlationId,
      traceId: evidence.traceId,
    },
    traceId: evidence.traceId ?? undefined,
  };
}
