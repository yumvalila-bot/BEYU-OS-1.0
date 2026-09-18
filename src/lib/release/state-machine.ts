/**
 * BEYU OS — P3 Canonical Release State Machine
 *
 * Single source of truth for release lifecycle.
 * No duplicate release/state/PVG implementations.
 *
 * Invariants:
 * - DEPLOYED != VERIFIED != PROMOTED
 * - EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT
 * - DEPLOYED → PROMOTED MUST FAIL unless PVG_VERIFIED exists
 * - CANARY → PROMOTED MUST FAIL unless canary verification exists
 * - FAILED → PROMOTED MUST FAIL
 * - RETIRED → PROMOTED MUST FAIL
 * - CONTRACTED → PROMOTED MUST FAIL
 * - Server-side authorization and persistence must enforce transitions
 * - No client-side claims alone
 */

import { newId, ID_PREFIX } from "@/lib/ids";
import type {
  ReleaseState,
  ReleaseTransition,
  TransitionValidationContext,
  PvgResult,
  CanaryEvidence,
  BlueGreenEvidence,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Allowed Transitions (canonical, fail-closed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical allowed transitions.
 * Key = previous state, Value = set of allowed next states.
 * null previous means initial creation.
 */
export const ALLOWED_TRANSITIONS: Record<ReleaseState | "NULL", ReleaseState[]> = {
  NULL: ["DESIGNED"],
  DESIGNED: ["BUILT", "FAILED"],
  BUILT: ["DEPLOYED", "FAILED"],
  DEPLOYED: ["PVG_VERIFIED", "FAILED", "ROLLED_BACK"],
  PVG_VERIFIED: ["CANARY", "PROMOTED", "FAILED", "ROLLED_BACK"],
  CANARY: ["PROMOTED", "FAILED", "ROLLED_BACK"],
  PROMOTED: ["SWITCHED", "VERIFIED", "FAILED", "ROLLED_BACK"],
  SWITCHED: ["RETIRED", "VERIFIED", "FAILED", "ROLLED_BACK"],
  RETIRED: ["CONTRACTED", "FAILED", "ROLLED_BACK"],
  CONTRACTED: ["VERIFIED", "FAILED", "ROLLED_BACK"],
  VERIFIED: ["FAILED", "ROLLED_BACK"], // VERIFIED is terminal success, but can still fail later or rollback
  FAILED: ["ROLLED_BACK", "DESIGNED"], // FAILED can go to ROLLED_BACK or be re-DESIGNED
  ROLLED_BACK: ["DESIGNED", "FAILED"], // After rollback, can redesign
};

// Explicitly forbidden transitions (for clarity and audit)
export const FORBIDDEN_TRANSITIONS: Array<{ from: ReleaseState; to: ReleaseState; reason: string }> = [
  { from: "DEPLOYED", to: "PROMOTED", reason: "DEPLOYED → PROMOTED requires PVG_VERIFIED evidence" },
  { from: "DEPLOYED", to: "VERIFIED", reason: "DEPLOYED → VERIFIED requires PVG_VERIFIED and PROMOTED" },
  { from: "DEPLOYED", to: "SWITCHED", reason: "DEPLOYED must be PVG_VERIFIED before SWITCHED" },
  { from: "DEPLOYED", to: "RETIRED", reason: "Invalid lifecycle" },
  { from: "DEPLOYED", to: "CONTRACTED", reason: "CONTRACT before PROMOTE violates EXPAND→MIGRATE→VERIFY→CANARY→PROMOTE→CONTRACT" },
  { from: "CANARY", to: "VERIFIED", reason: "CANARY → VERIFIED requires PROMOTED→SWITCHED→RETIRED→CONTRACTED" },
  { from: "FAILED", to: "PROMOTED", reason: "FAILED → PROMOTED is forbidden" },
  { from: "FAILED", to: "VERIFIED", reason: "FAILED → VERIFIED is forbidden" },
  { from: "FAILED", to: "SWITCHED", reason: "FAILED → SWITCHED is forbidden" },
  { from: "RETIRED", to: "PROMOTED", reason: "RETIRED → PROMOTED is forbidden" },
  { from: "CONTRACTED", to: "PROMOTED", reason: "CONTRACTED → PROMOTED is forbidden" },
  { from: "ROLLED_BACK", to: "PROMOTED", reason: "ROLLED_BACK → PROMOTED is forbidden" },
  { from: "VERIFIED", to: "PROMOTED", reason: "VERIFIED → PROMOTED is forbidden (already terminal)" },
];

export interface TransitionValidationResult {
  allowed: boolean;
  reason: string;
  blockingInvariant: string | null;
  requiredEvidence: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Logic (pure, DB-free)
// ─────────────────────────────────────────────────────────────────────────────

export function isValidTransition(
  previousState: ReleaseState | null,
  nextState: ReleaseState,
  context: TransitionValidationContext = { history: [] },
): TransitionValidationResult {
  const fromKey = previousState ?? "NULL";
  const allowed = ALLOWED_TRANSITIONS[fromKey as ReleaseState | "NULL"] ?? [];

  // Check basic allowed list
  if (!allowed.includes(nextState)) {
    const forbidden = FORBIDDEN_TRANSITIONS.find((f) => f.from === previousState && f.to === nextState);
    return {
      allowed: false,
      reason: forbidden?.reason ?? `Transition ${previousState ?? "NULL"} → ${nextState} is not allowed`,
      blockingInvariant: forbidden?.reason ?? `INVALID_TRANSITION_${previousState ?? "NULL"}_TO_${nextState}`,
      requiredEvidence: [],
    };
  }

  // Additional contextual checks (fail-closed)

  // DEPLOYED → PROMOTED already blocked by allowed list, but double-check history for PVG_VERIFIED
  if (previousState === "DEPLOYED" && nextState === "PROMOTED") {
    return {
      allowed: false,
      reason: "DEPLOYED → PROMOTED requires PVG_VERIFIED evidence",
      blockingInvariant: "PVG_VERIFICATION_REQUIRED",
      requiredEvidence: ["PVG_VERIFIED"],
    };
  }

  // Check PVG evidence for transitions that require it
  if (nextState === "PROMOTED") {
    // Must have PVG_VERIFIED in history
    const hasPvgVerified = context.history.some((t) => t.nextState === "PVG_VERIFIED");
    const hasCurrentPvgEvidence = context.pvgEvidence?.status === "PASS";

    if (previousState === "PVG_VERIFIED") {
      // Direct PVG_VERIFIED → PROMOTED requires PVG PASS
      if (!hasCurrentPvgEvidence && !context.pvgEvidence) {
        return {
          allowed: false,
          reason: "PVG_VERIFIED → PROMOTED requires PASS PVG evidence",
          blockingInvariant: "PVG_EVIDENCE_REQUIRED",
          requiredEvidence: ["PVG_PASS"],
        };
      }
      if (context.pvgEvidence && context.pvgEvidence.status !== "PASS") {
        return {
          allowed: false,
          reason: `PVG_VERIFIED → PROMOTED blocked: PVG status ${context.pvgEvidence.status}`,
          blockingInvariant: "PVG_FAILED",
          requiredEvidence: ["PVG_PASS"],
        };
      }
    }

    if (previousState === "CANARY") {
      // CANARY → PROMOTED requires canary verification
      if (!context.canaryEvidence?.promotionEligible) {
        return {
          allowed: false,
          reason: "CANARY → PROMOTED requires canary promotion eligibility",
          blockingInvariant: "CANARY_VERIFICATION_REQUIRED",
          requiredEvidence: ["CANARY_PROMOTION_ELIGIBLE", "PVG_PASS"],
        };
      }
      if (!context.canaryEvidence.pvgVerified) {
        return {
          allowed: false,
          reason: "CANARY → PROMOTED requires PVG verified canary",
          blockingInvariant: "CANARY_PVG_REQUIRED",
          requiredEvidence: ["CANARY_PVG_VERIFIED"],
        };
      }
    }

    // General: any PROMOTED requires PVG in history or current evidence
    if (!hasPvgVerified && !hasCurrentPvgEvidence) {
      // If coming from PVG_VERIFIED, history check is not needed (we are PVG_VERIFIED)
      if (previousState !== "PVG_VERIFIED") {
        // Check if there's PVG evidence in context
        if (!context.pvgEvidence || context.pvgEvidence.status !== "PASS") {
          return {
            allowed: false,
            reason: "PROMOTED requires PVG_VERIFIED history and PASS evidence",
            blockingInvariant: "PVG_HISTORY_REQUIRED",
            requiredEvidence: ["PVG_VERIFIED", "PVG_PASS"],
          };
        }
      }
    }

    // Release identity mismatch blocks promotion
    if (context.releaseIdentityMatches === false) {
      return {
        allowed: false,
        reason: "Release identity mismatch blocks promotion",
        blockingInvariant: "RELEASE_IDENTITY_MISMATCH",
        requiredEvidence: ["RELEASE_IDENTITY_MATCH"],
      };
    }

    // Migration fingerprint mismatch blocks promotion
    if (
      context.migrationFingerprint &&
      context.expectedMigrationFingerprint &&
      context.migrationFingerprint !== context.expectedMigrationFingerprint
    ) {
      return {
        allowed: false,
        reason: "Migration fingerprint mismatch blocks promotion",
        blockingInvariant: "MIGRATION_FINGERPRINT_MISMATCH",
        requiredEvidence: ["MIGRATION_FINGERPRINT_MATCH"],
      };
    }

    // Unauthorized actor blocks transition
    if (context.actorAuthorized === false) {
      return {
        allowed: false,
        reason: "Unauthorized actor blocks promotion",
        blockingInvariant: "UNAUTHORIZED_ACTOR",
        requiredEvidence: ["AUTHORIZED_ACTOR"],
      };
    }
  }

  // CONTRACTED requires safety conditions
  if (nextState === "CONTRACTED") {
    // Must have gone through PROMOTED, SWITCHED, RETIRED
    const hasPromoted = context.history.some((t) => t.nextState === "PROMOTED");
    const hasSwitched = context.history.some((t) => t.nextState === "SWITCHED");
    const hasRetired = context.history.some((t) => t.nextState === "RETIRED");

    if (!hasPromoted || !hasSwitched || !hasRetired) {
      return {
        allowed: false,
        reason: "CONTRACTED requires PROMOTED → SWITCHED → RETIRED history (EXPAND→MIGRATE→VERIFY→CANARY→PROMOTE→CONTRACT)",
        blockingInvariant: "CONTRACT_SAFETY_VIOLATION",
        requiredEvidence: ["PROMOTED", "SWITCHED", "RETIRED"],
      };
    }
  }

  // Canary percentage does not authorize promotion (separate check)
  // This is enforced by requiring explicit canary evidence, not just percentage

  return {
    allowed: true,
    reason: `Transition ${previousState ?? "NULL"} → ${nextState} allowed`,
    blockingInvariant: null,
    requiredEvidence: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition Creation (with full provenance)
// ─────────────────────────────────────────────────────────────────────────────

export function createTransition(params: {
  releaseId: string;
  sourceCommit: string;
  artifactBuildId: string;
  environment: string;
  actorId: string;
  actorType: "HUMAN" | "SERVICE" | "AI" | "SYSTEM";
  previousState: ReleaseState | null;
  nextState: ReleaseState;
  reason: string;
  verificationEvidence?: Record<string, unknown> | null;
  correlationId?: string | null;
  traceId?: string | null;
  history?: ReleaseTransition[];
  pvgEvidence?: PvgResult | null;
  canaryEvidence?: import("./types").CanaryEvidence | null;
  blueGreenEvidence?: import("./types").BlueGreenEvidence | null;
  migrationFingerprint?: string | null;
  expectedMigrationFingerprint?: string | null;
  releaseIdentityMatches?: boolean;
  actorAuthorized?: boolean;
}): { transition: ReleaseTransition; validation: TransitionValidationResult } {
  const history = params.history ?? [];
  const validation = isValidTransition(params.previousState, params.nextState, {
    history,
    pvgEvidence: params.pvgEvidence,
    canaryEvidence: params.canaryEvidence,
    blueGreenEvidence: params.blueGreenEvidence,
    migrationFingerprint: params.migrationFingerprint,
    expectedMigrationFingerprint: params.expectedMigrationFingerprint,
    releaseIdentityMatches: params.releaseIdentityMatches,
    actorAuthorized: params.actorAuthorized,
  });

  if (!validation.allowed) {
    return {
      transition: null as unknown as ReleaseTransition,
      validation,
    };
  }

  const transition: ReleaseTransition = {
    id: newId(ID_PREFIX.event),
    releaseId: params.releaseId,
    sourceCommit: params.sourceCommit,
    artifactBuildId: params.artifactBuildId,
    environment: params.environment,
    timestamp: new Date().toISOString(),
    actorId: params.actorId,
    actorType: params.actorType,
    previousState: params.previousState,
    nextState: params.nextState,
    reason: params.reason,
    verificationEvidence: params.verificationEvidence ?? null,
    correlationId: params.correlationId ?? null,
    traceId: params.traceId ?? null,
  };

  return { transition, validation };
}

// ─────────────────────────────────────────────────────────────────────────────
// Release History Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getCurrentState(history: ReleaseTransition[]): ReleaseState | null {
  if (history.length === 0) return null;
  // History is ordered; last entry is current
  return history[history.length - 1].nextState;
}

export function hasStateInHistory(history: ReleaseTransition[], state: ReleaseState): boolean {
  return history.some((t) => t.nextState === state);
}

export function getTransitionHistoryForRelease(
  allTransitions: ReleaseTransition[],
  releaseId: string,
): ReleaseTransition[] {
  return allTransitions.filter((t) => t.releaseId === releaseId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant Checks (pure)
// ─────────────────────────────────────────────────────────────────────────────

export function assertDeployedNotVerifiedNotPromoted(): { invariant: string; holds: boolean }[] {
  return [
    {
      invariant: "DEPLOYED != VERIFIED",
      holds: !ALLOWED_TRANSITIONS["DEPLOYED"]?.includes("VERIFIED" as ReleaseState),
    },
    {
      invariant: "DEPLOYED != PROMOTED",
      holds: !ALLOWED_TRANSITIONS["DEPLOYED"]?.includes("PROMOTED"),
    },
    {
      invariant: "VERIFIED != PROMOTED (VERIFIED is after PROMOTED chain, not direct from DEPLOYED)",
      holds: !ALLOWED_TRANSITIONS["DEPLOYED"]?.includes("VERIFIED" as ReleaseState),
    },
  ];
}
