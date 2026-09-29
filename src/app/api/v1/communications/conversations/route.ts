/**
 * GET /api/v1/communications/conversations — list conversations
 * POST /api/v1/communications/conversations — create conversation
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { listConversations, createConversation } from "@/lib/communications/conversation-service";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

const CreateConversationSchema = z.object({
  contactId: z.string().max(60).optional().nullable(),
  globalUserId: z.string().max(60).optional().nullable(),
  legalEntityId: z.string().max(60).optional().nullable(),
  countryCode: z.string().length(2).optional().nullable(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"]),
  subject: z.string().max(300).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).default("INTERNAL"),
  correlationId: z.string().max(120).optional(),
  causationId: z.string().max(120).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:conversation.read",
      action: "communications.conversations.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status") ?? undefined;
      const channel = searchParams.get("channel") ?? undefined;
      const contactId = searchParams.get("contactId") ?? undefined;
      const assignedToUserId = searchParams.get("assignedToUserId") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      const conversations = await listConversations(ctx.principal.tenantId, {
        status,
        channel,
        contactId,
        assignedToUserId,
        limit,
      });

      return apiOk({ conversations, total: conversations.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:conversation.manage",
      action: "communications.conversations.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "CONVERSATION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.conversations.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateConversationSchema);

        const correlationId = body.correlationId ?? newId(ID_PREFIX.correlationId);

        const conversation = await createConversation({
          tenantId: ctx.principal.tenantId,
          legalEntityId: body.legalEntityId,
          countryCode: body.countryCode,
          contactId: body.contactId,
          globalUserId: body.globalUserId,
          channel: body.channel,
          subject: body.subject,
          priority: body.priority as never,
          classification: body.classification,
          correlationId,
          causationId: body.causationId,
          createdBy: ctx.principal.userId,
          metadata: body.metadata,
        });

        return {
          status: 201,
          body: { conversation, correlationId },
        };
      });
    },
  );
}
