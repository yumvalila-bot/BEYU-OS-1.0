/**
 * POST /api/v1/federation/access-requests/[id]/decision
 * — the governed human approval for a federation access request.
 *
 * HIGH_RISK (federation:approve → MFA step-up enforced by can()). The
 * decision records a DISTINCT approval row and only then may the request
 * become APPROVED — the 0071 CHECK constraint makes the reverse impossible.
 * Separation of duties: the requester cannot approve their own request.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { federationAccessRequests, federationApprovals } from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { publishEvent, recordAudit } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";

const DecisionSchema = z.object({
  decision: z.enum(["APPROVED", "DENIED"]),
  approvalReference: z.string().min(4).max(128).optional(),
  reason: z.string().min(4).max(2000).optional(),
});

export async function POST(request: NextRequest, params: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "federation:approve",
      action: "federation.accessRequests.decide",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_APPROVAL" },
    },
    async (ctx) => {
      const { id } = await params.params;
      const body = await parseBody(request, DecisionSchema);

      const rows = await db
        .select()
        .from(federationAccessRequests)
        .where(eq(federationAccessRequests.id, id))
        .limit(1);
      // RLS makes cross-tenant rows invisible: 404 is the honest answer.
      if (rows.length === 0) {
        return apiError("NOT_FOUND", "Access request not found in this tenant scope.", 404, ctx.traceId);
      }
      const req = rows[0];

      if (!["SUBMITTED", "IN_REVIEW"].includes(req.status)) {
        return apiError("INVALID_STATE", `Access request is ${req.status}; only SUBMITTED or IN_REVIEW requests can be decided.`, 409, ctx.traceId);
      }
      if (req.requestedBy && req.requestedBy === ctx.principal.userId) {
        return apiError("SEPARATION_OF_DUTIES", "The requester cannot approve their own access request; a distinct approver is required.", 403, ctx.traceId);
      }
      if (body.decision === "APPROVED" && !body.approvalReference) {
        return apiError("VALIDATION", "approvalReference is required for an APPROVED decision.", 400, ctx.traceId);
      }
      if (body.decision === "DENIED" && !body.reason) {
        return apiError("VALIDATION", "reason is required for a DENIED decision.", 400, ctx.traceId);
      }

      const approvalId = newId(ID_PREFIX.fedApproval);
      await db.insert(federationApprovals).values({
        id: approvalId,
        accessRequestId: id,
        approverUserId: ctx.principal.userId,
        decision: body.decision,
        reason: body.reason ?? null,
        approvalReference: body.approvalReference ?? null,
      });

      await db
        .update(federationAccessRequests)
        .set({
          status: body.decision,
          approvalId: body.decision === "APPROVED" ? approvalId : req.approvalId,
        })
        .where(eq(federationAccessRequests.id, id));

      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: `federation.accessRequests.${body.decision.toLowerCase()}`,
        objectType: "FEDERATION_APPROVAL",
        objectId: approvalId,
        outcome: "SUCCESS",
        reason: `Access request ${id} ${body.decision} by ${ctx.principal.userId}`,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });
      await publishEvent({
        type: `federation.accessRequest.${body.decision.toLowerCase()}`,
        source: "beyu-os",
        domain: "federation",
        operation: `federation.accessRequest.${body.decision.toLowerCase()}`,
        destinationDomain: null,
        tenantId: ctx.principal.tenantId,
        legalEntityId: req.legalEntityId,
        subjectType: "FEDERATION_ACCESS_REQUEST",
        subjectId: id,
        actorUserId: ctx.principal.userId,
        actorType: "HUMAN",
        classification: "CONFIDENTIAL",
        payload: {
          decision: body.decision,
          approvalId,
          approvalReference: body.approvalReference ?? null,
        },
        traceId: ctx.traceId,
        correlationId: ctx.correlationId,
        causationId: ctx.causationId ?? null,
        authorityContext: null,
        policyVersion: null,
      });

      return NextResponse.json({
        accessRequestId: id,
        decision: body.decision,
        approvalId,
        status: body.decision,
      });
    },
  );
}
