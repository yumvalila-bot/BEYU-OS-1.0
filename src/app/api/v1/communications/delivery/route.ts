/**
 * GET /api/v1/communications/delivery — delivery events for message
 */

import { NextRequest } from "next/server";
import { guarded, apiOk } from "@/lib/api";
import { db } from "@/db";
import { communicationDeliveryEvents, communicationMessages } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.read",
      action: "communications.delivery.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const messageId = searchParams.get("messageId");

      if (messageId) {
        // Verify message belongs to tenant
        const [msg] = await db
          .select({ id: communicationMessages.id })
          .from(communicationMessages)
          .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.tenantId, ctx.principal.tenantId)))
          .limit(1);
        if (!msg) {
          return apiOk({ events: [], total: 0, messageId, reason: "Message not found in tenant scope" }, ctx.traceId);
        }

        const events = await db
          .select()
          .from(communicationDeliveryEvents)
          .where(eq(communicationDeliveryEvents.messageId, messageId))
          .orderBy(desc(communicationDeliveryEvents.occurredAt));

        return apiOk({ events, total: events.length, messageId }, ctx.traceId);
      }

      // List recent delivery events for tenant
      const events = await db
        .select()
        .from(communicationDeliveryEvents)
        .where(eq(communicationDeliveryEvents.tenantId, ctx.principal.tenantId))
        .orderBy(desc(communicationDeliveryEvents.occurredAt))
        .limit(50);

      return apiOk({ events, total: events.length }, ctx.traceId);
    },
  );
}
