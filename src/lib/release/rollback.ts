/**
 * BEYU OS — P3 Rollback Semantics (canonical)
 *
 * Rollback must distinguish:
 * APPLICATION ROLLBACK
 * DATABASE ROLLBACK
 * TRAFFIC ROLLBACK
 *
 * Never assume database rollback is automatically safe.
 * For schema changes follow Expand/Contract principles.
 *
 * A rollback action must:
 * - verify target release
 * - verify compatibility
 * - authorize the action
 * - record evidence
 * - produce an audit event
 * - update release state
 *
 * Do not fabricate database rollback capabilities that do not exist.
 */

import { newId, ID_PREFIX } from "@/lib/ids";
import type { RollbackType, RollbackRequest, RollbackResult, ReleaseTransition } from "./types";
import { isValidTransition } from "./state-machine";

// ─────────────────────────────────────────────────────────────────────────────
// Rollback Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface RollbackValidationContext {
  history: ReleaseTransition[];
  targetReleaseExists: boolean;
  targetReleaseCompatible: boolean;
  actorAuthorized: boolean;
  dbRollbackSafe: boolean;
  trafficRollbackSafe: boolean;
  currentState: string | null;
}

export function validateRollback(
  request: RollbackRequest,
  context: RollbackValidationContext,
): { valid: boolean; reason: string; blocking: string[] } {
  const blocking: string[] = [];

  if (!context.targetReleaseExists) {
    blocking.push(`Target release ${request.targetReleaseId} does not exist`);
  }

  if (!context.targetReleaseCompatible) {
    blocking.push(`Target release ${request.targetReleaseId} incompatible with current state`);
  }

  if (!context.actorAuthorized) {
    blocking.push(`Actor ${request.actorId} not authorized for rollback`);
  }

  if (request.type === "DATABASE" && !context.dbRollbackSafe) {
    blocking.push("Database rollback not safe — requires forward-fix per Expand/Contract, not automatic down-migration");
  }

  if (request.type === "TRAFFIC" && !context.trafficRollbackSafe) {
    blocking.push("Traffic rollback not safe — no stable blue release available");
  }

  // Check if current state allows rollback
  const currentState = context.currentState as import("./types").ReleaseState | null;
  if (currentState) {
    const canRollback = isValidTransition(currentState, "ROLLED_BACK", { history: context.history });
    if (!canRollback.allowed) {
      blocking.push(`Current state ${currentState} cannot transition to ROLLED_BACK: ${canRollback.reason}`);
    }
  }

  return {
    valid: blocking.length === 0,
    reason: blocking.length === 0 ? "Rollback validation passed" : `Rollback blocked: ${blocking.join("; ")}`,
    blocking,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollback Creation
// ─────────────────────────────────────────────────────────────────────────────

export function createRollbackRequest(params: {
  releaseId: string;
  targetReleaseId: string;
  type: RollbackType;
  reason: string;
  actorId: string;
  actorType?: "HUMAN" | "SERVICE";
  correlationId?: string | null;
}): RollbackRequest {
  return {
    id: newId(ID_PREFIX.event),
    releaseId: params.releaseId,
    targetReleaseId: params.targetReleaseId,
    type: params.type,
    reason: params.reason,
    actorId: params.actorId,
    actorType: params.actorType ?? "HUMAN",
    compatibilityChecked: false,
    authorized: false,
    evidence: null,
    correlationId: params.correlationId ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function authorizeRollback(
  request: RollbackRequest,
  authorized: boolean,
  compatibilityChecked: boolean,
  evidence: Record<string, unknown> | null = null,
): RollbackRequest {
  return {
    ...request,
    authorized,
    compatibilityChecked,
    evidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollback Execution (provider-neutral, no fake DB rollback)
// ─────────────────────────────────────────────────────────────────────────────

export interface RollbackExecutor {
  type: RollbackType;
  execute(request: RollbackRequest): Promise<RollbackResult>;
}

export class ApplicationRollbackExecutor implements RollbackExecutor {
  type: RollbackType = "APPLICATION";

  async execute(request: RollbackRequest): Promise<RollbackResult> {
    // Real implementation would re-deploy previous SHA via Vercel/GitHub
    // For P3, we document the boundary without fabricating
    return {
      requestId: request.id,
      success: false, // Not actually executed without real infra
      type: "APPLICATION",
      fromReleaseId: request.releaseId,
      toReleaseId: request.targetReleaseId,
      reason: request.reason,
      auditEventId: null,
      evidence: {
        executor: "application",
        isRealInfrastructure: false,
        boundary: "HUMAN_CONTROLLED",
        note: "Application rollback requires human-governed re-deploy of previous SHA (git revert or Vercel rollback). Stopped at boundary without fabricating.",
        request,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export class DatabaseRollbackExecutor implements RollbackExecutor {
  type: RollbackType = "DATABASE";

  async execute(request: RollbackRequest): Promise<RollbackResult> {
    // Database rollback is NEVER automatic down-migration
    // Forward-fix only per P2/P3 Expand/Contract
    return {
      requestId: request.id,
      success: false,
      type: "DATABASE",
      fromReleaseId: request.releaseId,
      toReleaseId: request.targetReleaseId,
      reason: request.reason,
      auditEventId: null,
      evidence: {
        executor: "database",
        isRealInfrastructure: false,
        boundary: "HUMAN_CONTROLLED",
        safety: "FORWARD_FIX_ONLY",
        note: "Database rollback is forward-fix only. No automatic down-migration. Requires new corrective migration (ADDITIVE) and human approval. This executor documents the boundary.",
        request,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export class TrafficRollbackExecutor implements RollbackExecutor {
  type: RollbackType = "TRAFFIC";

  async execute(request: RollbackRequest): Promise<RollbackResult> {
    return {
      requestId: request.id,
      success: false,
      type: "TRAFFIC",
      fromReleaseId: request.releaseId,
      toReleaseId: request.targetReleaseId,
      reason: request.reason,
      auditEventId: null,
      evidence: {
        executor: "traffic",
        isRealInfrastructure: false,
        boundary: "HUMAN_CONTROLLED",
        note: "Traffic rollback requires real infrastructure adapter and human approval. Stopped at boundary.",
        request,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export function getRollbackExecutor(type: RollbackType): RollbackExecutor {
  switch (type) {
    case "APPLICATION":
      return new ApplicationRollbackExecutor();
    case "DATABASE":
      return new DatabaseRollbackExecutor();
    case "TRAFFIC":
      return new TrafficRollbackExecutor();
    default:
      return new ApplicationRollbackExecutor();
  }
}
