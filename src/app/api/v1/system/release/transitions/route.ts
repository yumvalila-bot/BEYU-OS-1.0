/**
 * BEYU OS — P4 Release Transitions API (canonical)
 *
 * POST /api/v1/system/release/transitions
 * GET  /api/v1/system/release/transitions?releaseId=…
 *
 * Governed state transitions with full provenance and PERSISTENT evidence.
 * P3 validated transitions in memory; P4 persists every accepted transition
 * to `release_transitions` (append-only ledger) and every denial to the audit
 * chain, so release state survives restarts and is queryable evidence.
 *
 * Approval gate (P4): transitions into PROMOTED, SWITCHED or CONTRACTED require
 * an active, non-expired, non-revoked approval whose approver is NOT the actor
 * (four-eyes). Fail-closed: APPROVAL_REQUIRED denial with actionable reason.
 *
 * Guarded: platform:config.manage (control-plane authority). Every server
 * request independently enforces authorization; the URL grants nothing.
 */

import { z } from "zod";
import { apiOk, apiError, guarded } from "@/lib/api";
import { createTransition, getCurrentState } from "@/lib/release/state-machine";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
import { recordAudit } from "@/lib/audit";
import {
  appendTransitionRecord,
  getReleaseRecord,
  getTransitionHistory,
  listApprovals,
  upsertReleaseRecord,
} from "@/lib/release/store";
import { evaluateApproval, requiredApprovalScope } from "@/lib/release/approvals";
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

      // Ensure the release record exists (idempotent) so the ledger has a parent.
      const record = await getReleaseRecord(data.releaseId);
      if (!record) {
        await upsertReleaseRecord({
          ...identity,
          releaseId: data.releaseId,
          environment: data.environment,
          gitSha: data.sourceCommit,
          buildId: data.artifactBuildId,
        });
      }

      const history = await getTransitionHistory(data.releaseId);
      const currentState = getCurrentState(history);

      if (data.previousState !== null && currentState !== null && data.previousState !== currentState) {
        return apiError(
          "INVALID_TRANSITION",
          `Previous state mismatch: expected ${currentState}, got ${data.previousState}`,
          409,
          ctx.traceId,
          { currentState, requestedPrevious: data.previousState },
        );
      }

      // ── P4 approval gate (four-eyes, fail-closed) ──────────────────────────
      const scope = requiredApprovalScope(data.nextState as ReleaseState);
      let approvalSatisfied = true;
      let approvalDenial: Record<string, unknown> | null = null;
      if (scope) {
        const approvals = await listApprovals(data.releaseId);
        const evaluation = evaluateApproval({
          nextState: data.nextState as ReleaseState,
          releaseId: data.releaseId,
          environment: data.environment,
          actorId: ctx.principal.userId,
          approvals,
        });
        approvalSatisfied = evaluation.satisfied;
        if (!evaluation.satisfied) {
          approvalDenial = {
            code: evaluation.reason,
            requiredScope: evaluation.requiredScope,
            note: "A PROMOTE/CONTRACT action requires an active approval recorded by a different principal (four-eyes).",
          };
        }
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
        history,
        pvgEvidence: data.pvgEvidence as never,
        releaseIdentityMatches: data.releaseIdentityMatches,
        migrationFingerprint: data.migrationFingerprint ?? null,
        expectedMigrationFingerprint: data.expectedMigrationFingerprint ?? null,
        actorAuthorized: true, // Already authorized via can() in guarded()
      });

      if (!validation.allowed || !approvalSatisfied) {
        await recordAudit({
          tenantId: null,
          actorUserId: ctx.principal.userId,
          action: "RELEASE_TRANSITION_DENIED",
          objectType: "RELEASE",
          objectId: data.releaseId,
          outcome: "DENIED",
          reason: !validation.allowed ? validation.reason : "APPROVAL_REQUIRED",
          newValue: {
            previousState: data.previousState,
            nextState: data.nextState,
            blockingInvariant: validation.blockingInvariant,
            requiredEvidence: validation.requiredEvidence,
            approval: approvalDenial,
          },
          traceId: ctx.traceId,
        });

        if (!validation.allowed) {
          return apiError("INVALID_TRANSITION", validation.reason, 403, ctx.traceId, {
            blockingInvariant: validation.blockingInvariant,
            requiredEvidence: validation.requiredEvidence,
          });
        }
        return apiError("APPROVAL_REQUIRED", "Controlled release transition requires an active four-eyes approval", 403, ctx.traceId, approvalDenial);
      }

      // Persist to the append-only ledger (idempotent on transition id).
      await appendTransitionRecord(transition);

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

      if (releaseId) {
        const history: ReleaseTransition[] = await getTransitionHistory(releaseId);
        return apiOk({ transitions: history, count: history.length }, ctx.traceId);
      }

      // Without a release filter, return recent releases with derived state.
      const { listReleases } = await import("@/lib/release/store");
      const releases = await listReleases();
      return apiOk({ releases, count: releases.length }, ctx.traceId);
    },
  );
}
