/**
 * BEYU OS — P3 Canary Governance (canonical)
 *
 * System must distinguish:
 * CANARY CONFIGURED
 * CANARY DEPLOYED
 * CANARY PVG VERIFIED
 * CANARY TRAFFIC ACTIVE
 * CANARY OBSERVATION
 * CANARY PROMOTION ELIGIBLE
 *
 * Canary traffic percentage must be represented separately from authorization.
 * Do not implement fake traffic shifting if current infrastructure cannot actually control traffic.
 * If infrastructure integration unavailable, implement provider-neutral contract + deterministic state machine + validation + evidence + adapter boundary and STOP at genuine infrastructure/human boundary.
 * Never pretend a canary occurred if it did not.
 */

import { newId, ID_PREFIX } from "@/lib/ids";
import type {
  CanaryState,
  CanaryConfig,
  CanaryDeployment,
  CanaryEvidence,
  PvgResult,
  TrafficAdapter,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Canary State Machine
// ─────────────────────────────────────────────────────────────────────────────

export const CANARY_ALLOWED_TRANSITIONS: Record<CanaryState | "NULL", CanaryState[]> = {
  NULL: ["CANARY_CONFIGURED"],
  CANARY_CONFIGURED: ["CANARY_DEPLOYED", "CANARY_FAILED"],
  CANARY_DEPLOYED: ["CANARY_PVG_VERIFIED", "CANARY_FAILED", "CANARY_ROLLED_BACK"],
  CANARY_PVG_VERIFIED: ["CANARY_TRAFFIC_ACTIVE", "CANARY_FAILED", "CANARY_ROLLED_BACK"],
  CANARY_TRAFFIC_ACTIVE: ["CANARY_OBSERVATION", "CANARY_FAILED", "CANARY_ROLLED_BACK"],
  CANARY_OBSERVATION: ["CANARY_PROMOTION_ELIGIBLE", "CANARY_FAILED", "CANARY_ROLLED_BACK"],
  CANARY_PROMOTION_ELIGIBLE: ["CANARY_FAILED", "CANARY_ROLLED_BACK"], // Terminal success, promotion handled by release state machine
  CANARY_FAILED: ["CANARY_ROLLED_BACK", "CANARY_CONFIGURED"],
  CANARY_ROLLED_BACK: ["CANARY_CONFIGURED", "CANARY_FAILED"],
};

export function isValidCanaryTransition(from: CanaryState | null, to: CanaryState): boolean {
  const key = from ?? "NULL";
  return (CANARY_ALLOWED_TRANSITIONS[key as CanaryState | "NULL"] ?? []).includes(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Canary Config Validation
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_TRAFFIC_PERCENTAGES = [0, 1, 5, 25, 50, 100] as const;

export function validateCanaryConfig(config: CanaryConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.releaseId) errors.push("releaseId required");
  if (!config.environment) errors.push("environment required");
  if (!Array.isArray(config.allowedPercentages) || config.allowedPercentages.length === 0) {
    errors.push("allowedPercentages required");
  } else {
    for (const p of config.allowedPercentages) {
      if (!ALLOWED_TRAFFIC_PERCENTAGES.includes(p as (typeof ALLOWED_TRAFFIC_PERCENTAGES)[number])) {
        errors.push(`Invalid traffic percentage ${p}, allowed: ${ALLOWED_TRAFFIC_PERCENTAGES.join(",")}`);
      }
    }
  }

  if (!ALLOWED_TRAFFIC_PERCENTAGES.includes(config.configuredPercentage as (typeof ALLOWED_TRAFFIC_PERCENTAGES)[number])) {
    errors.push(`configuredPercentage ${config.configuredPercentage} not in allowed set`);
  }

  if (config.observationWindowMinutes < 1) errors.push("observationWindowMinutes must be >=1");
  if (config.observationWindowMinutes > 1440) errors.push("observationWindowMinutes must be <=1440 (24h)");

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canary Deployment Management
// ─────────────────────────────────────────────────────────────────────────────

export function createCanaryDeployment(params: {
  releaseId: string;
  environment: string;
  actorId: string;
  trafficPercentage?: number;
  correlationId?: string | null;
}): CanaryDeployment {
  return {
    id: newId(ID_PREFIX.event),
    releaseId: params.releaseId,
    environment: params.environment,
    state: "CANARY_CONFIGURED",
    trafficPercentage: params.trafficPercentage ?? 0,
    previousPercentage: null,
    verificationEvidence: null,
    pvgResult: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actorId: params.actorId,
    correlationId: params.correlationId ?? null,
  };
}

export function transitionCanary(
  deployment: CanaryDeployment,
  nextState: CanaryState,
  evidence: {
    trafficPercentage?: number;
    verificationEvidence?: Record<string, unknown> | null;
    pvgResult?: PvgResult | null;
    actorId?: string;
  } = {},
): { deployment: CanaryDeployment; valid: boolean; reason: string } {
  if (!isValidCanaryTransition(deployment.state, nextState)) {
    return {
      deployment,
      valid: false,
      reason: `Invalid canary transition ${deployment.state} → ${nextState}`,
    };
  }

  // Additional safety: traffic percentage must be separate from authorization
  // We allow traffic % change only in TRAFFIC_ACTIVE or OBSERVATION states
  if (evidence.trafficPercentage !== undefined) {
    if (!["CANARY_TRAFFIC_ACTIVE", "CANARY_OBSERVATION"].includes(nextState) && nextState !== deployment.state) {
      // Traffic % can be set during transition to TRAFFIC_ACTIVE
      if (nextState !== "CANARY_TRAFFIC_ACTIVE") {
        // Allow setting traffic % when staying in same state (for gradual rollout)
        if (deployment.state !== "CANARY_TRAFFIC_ACTIVE" && deployment.state !== "CANARY_OBSERVATION") {
          return {
            deployment,
            valid: false,
            reason: `Traffic percentage can only be set in TRAFFIC_ACTIVE or OBSERVATION, not in ${deployment.state}`,
          };
        }
      }
    }

    if (!ALLOWED_TRAFFIC_PERCENTAGES.includes(evidence.trafficPercentage as (typeof ALLOWED_TRAFFIC_PERCENTAGES)[number])) {
      return {
        deployment,
        valid: false,
        reason: `Invalid traffic percentage ${evidence.trafficPercentage}`,
      };
    }
  }

  // PVG verification required for PVG_VERIFIED state
  if (nextState === "CANARY_PVG_VERIFIED") {
    if (!evidence.pvgResult || evidence.pvgResult.status !== "PASS") {
      return {
        deployment,
        valid: false,
        reason: "CANARY_PVG_VERIFIED requires PASS PVG result",
      };
    }
  }

  const newDeployment: CanaryDeployment = {
    ...deployment,
    state: nextState,
    previousPercentage: evidence.trafficPercentage !== undefined ? deployment.trafficPercentage : deployment.previousPercentage,
    trafficPercentage: evidence.trafficPercentage ?? deployment.trafficPercentage,
    verificationEvidence: evidence.verificationEvidence ?? deployment.verificationEvidence,
    pvgResult: evidence.pvgResult ?? deployment.pvgResult,
    updatedAt: new Date().toISOString(),
    actorId: evidence.actorId ?? deployment.actorId,
  };

  return { deployment: newDeployment, valid: true, reason: `Transition ${deployment.state} → ${nextState} succeeded` };
}

export function getCanaryEvidence(deployment: CanaryDeployment): CanaryEvidence {
  return {
    releaseId: deployment.releaseId,
    state: deployment.state,
    trafficPercentage: deployment.trafficPercentage,
    pvgVerified: deployment.state === "CANARY_PVG_VERIFIED" || !!deployment.pvgResult,
    observationPassed: deployment.state === "CANARY_OBSERVATION" || deployment.state === "CANARY_PROMOTION_ELIGIBLE",
    promotionEligible: deployment.state === "CANARY_PROMOTION_ELIGIBLE",
    evidence: {
      deploymentId: deployment.id,
      state: deployment.state,
      trafficPercentage: deployment.trafficPercentage,
      pvgStatus: deployment.pvgResult?.status ?? null,
      verificationEvidence: deployment.verificationEvidence,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider-Neutral Contract + Adapter Boundary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * No-op adapter for when real infrastructure is unavailable.
 * Implements the contract but reports isRealInfrastructure=false.
 * Never pretends traffic shifting occurred.
 */
export class NoOpTrafficAdapter implements TrafficAdapter {
  provider = "noop";
  isRealInfrastructure = false;

  async getTrafficSplit(_environment: string): Promise<{ blue: number; green: number }> {
    return { blue: 100, green: 0 };
  }

  async setTrafficSplit(
    _environment: string,
    _split: { blue: number; green: number },
    evidence: { actorId: string; reason: string; correlationId: string | null },
  ): Promise<{ success: boolean; evidence: Record<string, unknown> }> {
    return {
      success: false,
      evidence: {
        provider: this.provider,
        isRealInfrastructure: this.isRealInfrastructure,
        reason: "Real traffic infrastructure not available — stopped at adapter boundary",
        requestedSplit: _split,
        actorId: evidence.actorId,
        correlationId: evidence.correlationId,
        timestamp: new Date().toISOString(),
        note: "This is a genuine infrastructure boundary, not a failure. Traffic shifting requires human-governed platform action.",
      },
    };
  }
}

/**
 * Vercel adapter stub — documents the boundary, does not fabricate.
 * Real implementation would use Vercel API with proper auth, but that requires
 * production credentials which must not be requested in chat.
 */
export class VercelTrafficAdapter implements TrafficAdapter {
  provider = "vercel";
  isRealInfrastructure = false; // Set to true only when real credentials and API available

  async getTrafficSplit(_environment: string): Promise<{ blue: number; green: number }> {
    // Would query Vercel deployment API
    return { blue: 100, green: 0 };
  }

  async setTrafficSplit(
    environment: string,
    split: { blue: number; green: number },
    evidence: { actorId: string; reason: string; correlationId: string | null },
  ): Promise<{ success: boolean; evidence: Record<string, unknown> }> {
    // Real implementation requires VERCEL_TOKEN and human approval
    // We stop at boundary and document
    return {
      success: false,
      evidence: {
        provider: this.provider,
        isRealInfrastructure: this.isRealInfrastructure,
        environment,
        requestedSplit: split,
        actorId: evidence.actorId,
        reason: evidence.reason,
        correlationId: evidence.correlationId,
        timestamp: new Date().toISOString(),
        boundary: "HUMAN_CONTROLLED",
        note: "Vercel traffic shifting requires production credentials and human approval. This adapter documents the boundary without fabricating.",
      },
    };
  }
}

export function getTrafficAdapter(provider: string = "noop"): TrafficAdapter {
  switch (provider) {
    case "vercel":
      return new VercelTrafficAdapter();
    case "noop":
    default:
      return new NoOpTrafficAdapter();
  }
}
