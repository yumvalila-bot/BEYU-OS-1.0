/**
 * BEYU OS — P4 Release Approvals API (canonical)
 *
 * POST /api/v1/system/release/approvals   — record an approval decision
 * GET  /api/v1/system/release/approvals?releaseId=… — list approval evidence
 *
 * An approval is attributable EVIDENCE consumed by the release state machine's
 * four-eyes gate. Recording one requires the same control-plane authority
 * (`platform:config.manage`) as performing a transition; consuming one still
 * requires the actor to differ from the approver. Nothing here grants
 * authorization by itself — RBAC/ABAC/policy/RLS all still apply.
 *
 * Every decision (APPROVED, REVOKED, REJECTED) is audited with its mandatory
 * justification, so the governance trail shows who decided and why.
 */

import { z } from "zod";
import { apiOk, apiError, guarded } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getReleaseRecord, listApprovals, recordApproval, revokeApproval, upsertReleaseRecord } from "@/lib/release/store";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
import { validateApprovalInput } from "@/lib/release/approvals";

export const dynamic = "force-dynamic";

const ApprovalRequestSchema = z.object({
  releaseId: z.string().min(1),
  environment: z.string().min(1),
  scope: z.enum(["DEPLOY", "PROMOTE", "ROLLBACK", "CONTRACT"]),
  decision: z.enum(["APPROVED", "REVOKED", "REJECTED"]),
  justification: z.string().min(1),
  expiresAt: z.string().nullable().optional(),
  evidence: z.record(z.unknown()).nullable().optional(),
  // REVOKED path: revoke an existing APPROVED record instead of inserting.
  revokeApprovalId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:config.manage",
      action: "system.release.approval.record",
      audit: { objectType: "RELEASE_APPROVAL" },
    },
    async (ctx) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError("VALIDATION_FAILED", "Invalid JSON body", 422, ctx.traceId);
      }

      const parsed = ApprovalRequestSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("VALIDATION_FAILED", "Invalid approval request", 422, ctx.traceId, parsed.error.issues);
      }
      const data = parsed.data;

      // A revocation targets an existing record; other decisions create one.
      if (data.decision === "REVOKED") {
        if (!data.revokeApprovalId) {
          return apiError("VALIDATION_FAILED", "REVOKED requires revokeApprovalId", 422, ctx.traceId);
        }
        const updated = await revokeApproval(data.revokeApprovalId, data.justification);
        if (updated === 0) {
          return apiError("NOT_FOUND", "No active approval with that id", 404, ctx.traceId);
        }
        await recordAudit({
          tenantId: null,
          actorUserId: ctx.principal.userId,
          action: "RELEASE_APPROVAL_REVOKED",
          objectType: "RELEASE_APPROVAL",
          objectId: data.revokeApprovalId,
          outcome: "SUCCESS",
          reason: data.justification,
          newValue: { releaseId: data.releaseId, scope: data.scope },
          traceId: ctx.traceId,
        });
        return apiOk({ approvalId: data.revokeApprovalId, decision: "REVOKED" }, ctx.traceId, 200);
      }

      const check = validateApprovalInput({
        releaseId: data.releaseId,
        environment: data.environment,
        scope: data.scope,
        decision: data.decision,
        approverId: ctx.principal.userId,
        justification: data.justification,
        expiresAt: data.expiresAt ?? null,
      });
      if (!check.valid) {
        return apiError("VALIDATION_FAILED", check.reason ?? "Invalid approval", 422, ctx.traceId);
      }

      // Ensure the parent release record exists (idempotent).
      const record = await getReleaseRecord(data.releaseId);
      if (!record) {
        const identity = getCurrentReleaseIdentity();
        await upsertReleaseRecord({
          ...identity,
          releaseId: data.releaseId,
          environment: data.environment,
        });
      }

      const approvalId = await recordApproval({
        releaseId: data.releaseId,
        environment: data.environment,
        scope: data.scope,
        decision: data.decision,
        approverId: ctx.principal.userId,
        approverType: "HUMAN",
        justification: data.justification,
        evidence: (data.evidence as Record<string, unknown> | null) ?? null,
        expiresAt: data.expiresAt ?? null,
      });

      await recordAudit({
        tenantId: null,
        actorUserId: ctx.principal.userId,
        action: `RELEASE_APPROVAL_${data.decision}`,
        objectType: "RELEASE_APPROVAL",
        objectId: approvalId,
        outcome: "SUCCESS",
        reason: data.justification,
        newValue: {
          releaseId: data.releaseId,
          environment: data.environment,
          scope: data.scope,
          decision: data.decision,
          expiresAt: data.expiresAt ?? null,
        },
        traceId: ctx.traceId,
      });

      return apiOk({ approvalId, decision: data.decision, scope: data.scope }, ctx.traceId, 201);
    },
  );
}

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:dashboard.read",
      action: "system.release.approvals.read",
      audit: { objectType: "RELEASE_APPROVAL" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const releaseId = url.searchParams.get("releaseId");
      if (!releaseId) {
        return apiError("VALIDATION_FAILED", "releaseId query parameter is required", 422, ctx.traceId);
      }
      const approvals = await listApprovals(releaseId);
      return apiOk({ approvals, count: approvals.length }, ctx.traceId);
    },
  );
}
