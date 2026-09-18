/**
 * BEYU OS — P3 Observability (canonical)
 *
 * Use existing telemetry infrastructure.
 * Add only missing release-specific measurements.
 *
 * At minimum make observable:
 * - release ID
 * - deployment ID
 * - PVG status
 * - PVG failure reason
 * - canary state
 * - traffic state if real
 * - promotion state
 * - rollback state
 * - migration fingerprint
 * - schema fingerprint
 * - runtime version
 *
 * Do not introduce unrelated observability platform.
 */

import { SYSTEM_VERSION } from "@/lib/constants";
import type { ReleaseObservability, ReleaseTransition, PvgResult, CanaryDeployment, BlueGreenDeployment } from "./types";
import { getCurrentReleaseIdentity } from "./identity";

// ─────────────────────────────────────────────────────────────────────────────
// Observability Builders (pure)
// ─────────────────────────────────────────────────────────────────────────────

export function buildObservabilityFromHistory(
  releaseId: string,
  history: ReleaseTransition[],
  pvgResult: PvgResult | null = null,
  canary: CanaryDeployment | null = null,
  blueGreen: BlueGreenDeployment | null = null,
): ReleaseObservability {
  const identity = getCurrentReleaseIdentity();
  const lastTransition = history.length > 0 ? history[history.length - 1] : null;
  const currentState = lastTransition?.nextState ?? "DESIGNED";

  // Determine PVG status
  let pvgStatus: ReleaseObservability["pvgStatus"] = "NOT_RUN";
  let pvgFailureReason: string | null = null;

  if (pvgResult) {
    pvgStatus = pvgResult.status === "PASS" ? "PASS" : "FAIL";
    if (pvgResult.status === "FAIL") {
      pvgFailureReason = pvgResult.blockingFailures.join("; ");
    }
  } else if (history.some((t) => t.nextState === "PVG_VERIFIED")) {
    pvgStatus = "PASS";
  } else if (history.some((t) => t.nextState === "FAILED")) {
    pvgStatus = "FAIL";
  }

  // Rollback state
  let rollbackState: ReleaseObservability["rollbackState"] = "NONE";
  if (history.some((t) => t.nextState === "ROLLED_BACK")) {
    rollbackState = "COMPLETED";
  } else if (history.some((t) => t.nextState === "FAILED")) {
    rollbackState = "FAILED";
  }

  return {
    releaseId,
    deploymentId: identity.deploymentId,
    pvgStatus,
    pvgFailureReason,
    canaryState: canary?.state ?? null,
    trafficState: blueGreen
      ? { blue: blueGreen.trafficState.bluePercentage, green: blueGreen.trafficState.greenPercentage }
      : canary
        ? { blue: 100 - canary.trafficPercentage, green: canary.trafficPercentage }
        : null,
    promotionState: currentState as ReleaseObservability["promotionState"],
    rollbackState,
    migrationFingerprint: identity.migrationFingerprint,
    schemaFingerprint: identity.schemaFingerprint,
    runtimeVersion: identity.runtimeVersion,
    environment: identity.environment,
    lastTransitionAt: lastTransition?.timestamp ?? null,
    verifiedAt: pvgResult?.verifiedAt ?? null,
  };
}

export function getReleaseMetrics(observability: ReleaseObservability): Record<string, string | number | boolean | null> {
  return {
    releaseId: observability.releaseId,
    deploymentId: observability.deploymentId,
    pvgStatus: observability.pvgStatus,
    pvgFailureReason: observability.pvgFailureReason,
    canaryState: observability.canaryState,
    trafficBlue: observability.trafficState?.blue ?? null,
    trafficGreen: observability.trafficState?.green ?? null,
    promotionState: observability.promotionState,
    rollbackState: observability.rollbackState,
    migrationFingerprint: observability.migrationFingerprint,
    schemaFingerprint: observability.schemaFingerprint,
    runtimeVersion: observability.runtimeVersion,
    environment: observability.environment,
    lastTransitionAt: observability.lastTransitionAt,
    verifiedAt: observability.verifiedAt,
    systemVersion: SYSTEM_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry Helpers (existing infrastructure reuse)
// ─────────────────────────────────────────────────────────────────────────────

export function buildTelemetryEvent(
  observability: ReleaseObservability,
  eventType: string,
): Record<string, unknown> {
  return {
    type: eventType,
    timestamp: new Date().toISOString(),
    releaseId: observability.releaseId,
    deploymentId: observability.deploymentId,
    environment: observability.environment,
    promotionState: observability.promotionState,
    pvgStatus: observability.pvgStatus,
    canaryState: observability.canaryState,
    trafficState: observability.trafficState,
    runtimeVersion: observability.runtimeVersion,
    migrationFingerprint: observability.migrationFingerprint,
    systemVersion: SYSTEM_VERSION,
  };
}

/**
 * For /api/health/identity and /api/v1/system/release observability
 */
export function getHealthObservability(): Record<string, unknown> {
  const identity = getCurrentReleaseIdentity();
  return {
    system: SYSTEM_VERSION,
    releaseId: identity.releaseId,
    gitSha: identity.gitSha,
    buildId: identity.buildId,
    deploymentId: identity.deploymentId,
    environment: identity.environment,
    applicationVersion: identity.applicationVersion,
    runtimeVersion: identity.runtimeVersion,
    migrationFingerprint: identity.migrationFingerprint,
    latestMigration: identity.latestMigration,
    releaseTimestamp: identity.releaseTimestamp,
  };
}
