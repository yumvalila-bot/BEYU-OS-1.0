/**
 * POST /api/v1/communications/approval — human approval for AI-drafted sensitive comms
 * Flow: AI DRAFT → POLICY CHECK → HUMAN REVIEW → APPROVAL → SEND → AUDIT
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency, apiError } from "@/lib/api";
import { db } from "@/db";
import { communicationMessages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { updateMessageStatus } from "@/lib/communications/message-service";
import { recordAudit, publishEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ApprovalSchema = z.object({
  messageId: z.string().min(1).max(60),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.send", // approval requires same send permission + MFA via HIGH_RISK if template/broadcast
      action: "communications.approval.decide",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "MESSAGE_APPROVAL" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.approval.decide", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, ApprovalSchema);

        const [message] = await db
          .select()
          .from(communicationMessages)
          .where(and(eq(communicationMessages.id, body.messageId), eq(communicationMessages.tenantId, ctx.principal.tenantId)))
          .limit(1);

        if (!message) {
          return { status: 404, body: { error: { code: "MESSAGE_NOT_FOUND", message: "Message not found in tenant scope" } } };
        }

        if (!message.requiresHumanApproval) {
          return { status: 422, body: { error: { code: "NOT_REQUIRES_APPROVAL", message: "Message does not require human approval" } } };
        }

        if (message.approvedBy) {
          return { status: 409, body: { error: { code: "ALREADY_DECIDED", message: `Message already ${message.approvedBy ? "approved" : "decided"}` } } };
        }

        if (body.decision === "REJECTED") {
          await db
            .update(communicationMessages)
            .set({ status: "CANCELLED", deliveryStatus: "CANCELLED", approvedBy: ctx.principal.userId, approvedAt: new Date(), updatedAt: new Date() })
            .where(eq(communicationMessages.id, body.messageId));

          await recordAudit({
            tenantId: ctx.principal.tenantId,
            actorUserId: ctx.principal.userId,
            action: "communications.message.approval_rejected",
            objectType: "MESSAGE",
            objectId: body.messageId,
            outcome: "SUCCESS",
            newValue: { decision: "REJECTED", comment: body.comment },
            traceId: ctx.traceId,
          });

          return { status: 200, body: { messageId: body.messageId, decision: "REJECTED" } };
        }

        // APPROVED → mark approved and set to QUEUED for sending
        await db
          .update(communicationMessages)
          .set({ approvedBy: ctx.principal.userId, approvedAt: new Date(), status: "QUEUED", deliveryStatus: "QUEUED", updatedAt: new Date() })
          .where(eq(communicationMessages.id, body.messageId));

        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "communications.message.approved",
          objectType: "MESSAGE",
          objectId: body.messageId,
          outcome: "SUCCESS",
          newValue: { decision: "APPROVED", approvedBy: ctx.principal.userId, comment: body.comment },
          traceId: ctx.traceId,
        });

        await publishEvent({
          type: "COMMUNICATION_APPROVED",
          source: "BEYU_OS",
          domain: "communications",
          operation: "message.approve",
          destinationDomain: null,
          tenantId: ctx.principal.tenantId,
          legalEntityId: null,
          subjectType: "MESSAGE",
          subjectId: body.messageId,
          actorUserId: ctx.principal.userId,
          classification: message.classification as never,
          payload: { messageId: body.messageId, approvedBy: ctx.principal.userId, channel: message.channel },
          traceId: ctx.traceId,
          correlationId: message.correlationId,
          causationId: message.id,
          authorityContext: null,
          policyVersion: null,
        });

        return { status: 200, body: { messageId: body.messageId, decision: "APPROVED", status: "QUEUED", note: "Message approved and queued for delivery" } };
      });
    },
  );
}
