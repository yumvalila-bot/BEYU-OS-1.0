/**
 * BEYU OS — P3 Release Transitions API (canonical)
 *
 * POST /api/v1/system/release/transitions
 *
 * Governed state transitions with full provenance.
 * Guarded: platform:config.manage (control-plane authority)
 *
 * Every transition must have:
 * - release identity
 * - source commit
 * - artifact/build identity
 * - environment
 * - timestamp
 * - actor/service identity
 * - previous state
 * - next state
 * - reason
 * - verification evidence
 * - correlation/request ID
 *
 * Invalid transitions must fail closed.
 */

import { z } from "zod";
import { apiOk, apiError, guarded } from "@/lib/api";
import { createTransition, getCurrentState } from "@/lib/release/state-machine";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
import { recordAudit } from "@/lib/audit";
import type { ReleaseState, ReleaseTransition } from "@/lib/release/types";

export const dynamic = "force-dynamic";

const TransitionRequestSchema = z.object({
  releaseId: z.string().min(1),
  sourceCommit: z.string().min(1),
  artifactBuildId: z.string().min(1),
  environment: z.string().min(1),
  previousState: z.string().nullable(),
  nextState: z.enum([
    "DESIGNED",
    "BUILT",
    "DEPLOYED",
    "PVG_VERIFIED",
    "CANARY",
    "PROMOTED",
    "SWITCHED",
    "RETIRED",
    "CONTRACTED",
    "VERIFIED",
    "FAILED",
    "ROLLED_BACK",
  ]),
  reason: z.string().min(1),
  verificationEvidence: z.record(z.unknown()).nullable().optional(),
  correlationId: z.string().nullable().optional(),
  // For validation context
  pvgEvidence: z.record(z.unknown()).nullable().optional(),
  releaseIdentityMatches: z.boolean().optional(),
  migrationFingerprint: z.string().nullable().optional(),
  expectedMigrationFingerprint: z.string().nullable().optional(),
});

// In-memory history for demo (real implementation would use DB)
const inMemoryHistory: ReleaseTransition[] = [];

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:config.manage",
      action: "system.release.transition",
      audit: { objectType: "RELEASE" },
    },
    async (ctx) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError("VALIDATION_FAILED", "Invalid JSON body", 422, ctx.traceId);
      }

      const parsed = TransitionRequestSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("VALIDATION_FAILED", "Invalid transition request", 422, ctx.traceId, parsed.error.issues);
      }

      const data = parsed.data;
      const identity = getCurrentReleaseIdentity();

      // Validate previous state matches current history
      const releaseHistory = inMemoryHistory.filter((t) => t.releaseId === data.releaseId);
      const currentState = getCurrentState(releaseHistory);

      if (data.previousState !== null && currentState !== null && data.previousState !== currentState) {
        return apiError(
          "INVALID_TRANSITION",
          `Previous state mismatch: expected ${currentState}, got ${data.previousState}`,
          409,
          ctx.traceId,
          { currentState, requestedPrevious: data.previousState },
        );
      }

      // Create transition with full provenance
      const { transition, validation } = createTransition({
        releaseId: data.releaseId,
        sourceCommit: data.sourceCommit,
        artifactBuildId: data.artifactBuildId,
        environment: data.environment,
        actorId: ctx.principal.userId,
        actorType: "HUMAN",
        previousState: (data.previousState as ReleaseState | null) ?? currentState,
        nextState: data.nextState as ReleaseState,
        reason: data.reason,
        verificationEvidence: (data.verificationEvidence as Record<string, unknown> | null) ?? null,
        correlationId: data.correlationId ?? ctx.traceId,
        traceId: ctx.traceId,
        history: releaseHistory,
        pvgEvidence: data.pvgEvidence as never,
        releaseIdentityMatches: data.releaseIdentityMatches,
        migrationFingerprint: data.migrationFingerprint ?? null,
        expectedMigrationFingerprint: data.expectedMigrationFingerprint ?? null,
        actorAuthorized: true, // Already authorized via can() in guarded()
      });

      if (!validation.allowed) {
        await recordAudit({
          tenantId: null,
          actorUserId: ctx.principal.userId,
          action: "RELEASE_TRANSITION_DENIED",
          objectType: "RELEASE",
          objectId: data.releaseId,
          outcome: "DENIED",
          reason: validation.reason,
          newValue: {
            previousState: data.previousState,
            nextState: data.nextState,
            blockingInvariant: validation.blockingInvariant,
            requiredEvidence: validation.requiredEvidence,
          },
          traceId: ctx.traceId,
        });

        return apiError("INVALID_TRANSITION", validation.reason, 403, ctx.traceId, {
          blockingInvariant: validation.blockingInvariant,
          requiredEvidence: validation.requiredEvidence,
        });
      }

      // Persist (in-memory for P3, DB in real)
      inMemoryHistory.push(transition);

      // Audit success (reuses existing audit_log)
      await recordAudit({
        tenantId: null,
        actorUserId: ctx.principal.userId,
        action: `RELEASE_${transition.nextState}`,
        objectType: "RELEASE",
        objectId: transition.releaseId,
        outcome: "SUCCESS",
        reason: transition.reason,
        newValue: {
          previousState: transition.previousState,
          nextState: transition.nextState,
          sourceCommit: transition.sourceCommit,
          artifactBuildId: transition.artifactBuildId,
          environment: transition.environment,
          correlationId: transition.correlationId,
          traceId: transition.traceId,
          verificationEvidence: transition.verificationEvidence,
        },
        traceId: ctx.traceId,
      });

      return apiOk({ transition, validation }, ctx.traceId, 201);
    },
  );
}

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:dashboard.read",
      action: "system.release.transitions.read",
      audit: { objectType: "RELEASE" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const releaseId = url.searchParams.get("releaseId");

      let history = inMemoryHistory;
      if (releaseId) {
        history = inMemoryHistory.filter((t) => t.releaseId === releaseId);
      }

      return apiOk({ transitions: history, count: history.length }, ctx.traceId);
    },
  );
}
