/**
 * POST /api/v1/communications/documents — attach canonical document to message
 * Uses existing Documents capability, never duplicates storage
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, parseBody, withIdempotency } from "@/lib/api";
import { createDocumentDelivery } from "@/lib/communications/document-service";

export const dynamic = "force-dynamic";

const AttachSchema = z.object({
  messageId: z.string().min(1).max(60),
  documentId: z.string().min(1).max(60),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.send",
      action: "communications.documents.attach",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_ATTACHMENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.documents.attach", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, AttachSchema);

        const result = await createDocumentDelivery({
          messageId: body.messageId,
          documentId: body.documentId,
          tenantId: ctx.principal.tenantId,
          principal: { userId: ctx.principal.userId, clearance: ctx.principal.clearance },
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });

        if (!result.success) {
          return { status: 422, body: { error: { code: "ATTACHMENT_FAILED", message: result.reason } } };
        }

        return { status: 201, body: { attachment: result.attachment } };
      });
    },
  );
}
