/**
 * GET /api/v1/communications/feedback — list feedback
 * POST /api/v1/communications/feedback — submit feedback
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { createFeedback, listFeedback } from "@/lib/communications/feedback-service";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

const CreateFeedbackSchema = z.object({
  messageId: z.string().max(60).optional().nullable(),
  conversationId: z.string().max(60).optional().nullable(),
  contactId: z.string().max(60).optional().nullable(),
  caseId: z.string().max(60).optional().nullable(),
  type: z.enum(["FEEDBACK", "SURVEY", "RATING", "COMPLAINT", "SUGGESTION", "REVIEW"]).default("FEEDBACK"),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  subject: z.string().max(300).optional().nullable(),
  body: z.string().min(1).max(10000),
  category: z.string().max(100).optional().nullable(),
  urgency: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  correlationId: z.string().max(120).optional(),
  causationId: z.string().max(120).optional().nullable(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:case.read",
      action: "communications.feedback.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get("type") ?? undefined;
      const status = searchParams.get("status") ?? undefined;
      const contactId = searchParams.get("contactId") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      const feedback = await listFeedback(ctx.principal.tenantId, { type, status, contactId, limit });

      return apiOk({ feedback, total: feedback.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:case.manage",
      action: "communications.feedback.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEEDBACK" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.feedback.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateFeedbackSchema);

        const correlationId = body.correlationId ?? newId(ID_PREFIX.correlationId);

        const feedback = await createFeedback({
          tenantId: ctx.principal.tenantId,
          messageId: body.messageId,
          conversationId: body.conversationId,
          contactId: body.contactId,
          caseId: body.caseId,
          type: body.type as never,
          rating: body.rating,
          subject: body.subject,
          body: body.body,
          category: body.category,
          urgency: body.urgency,
          classification: body.classification,
          correlationId,
          causationId: body.causationId,
          createdBy: ctx.principal.userId,
        });

        return {
          status: 201,
          body: { feedback, correlationId },
        };
      });
    },
  );
}
