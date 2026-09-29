/**
 * GET /api/v1/communications/scheduled — list scheduled
 * POST /api/v1/communications/scheduled — schedule communication (reminders, etc.)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { db } from "@/db";
import { communicationScheduled } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

const ScheduleSchema = z.object({
  contactId: z.string().max(60).optional().nullable(),
  conversationId: z.string().max(60).optional().nullable(),
  journeyRunId: z.string().max(60).optional().nullable(),
  type: z.string().min(2).max(50),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"]),
  templateId: z.string().max(60).optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().max(200).optional(),
  correlationId: z.string().max(120).optional(),
  scheduledFor: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:read",
      action: "communications.scheduled.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      const conditions = [eq(communicationScheduled.tenantId, ctx.principal.tenantId)];
      if (status) conditions.push(eq(communicationScheduled.status, status));

      const rows = await db
        .select()
        .from(communicationScheduled)
        .where(and(...conditions))
        .orderBy(desc(communicationScheduled.scheduledFor))
        .limit(limit);

      return apiOk({ scheduled: rows, total: rows.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.send",
      action: "communications.scheduled.create",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_SCHEDULED" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.scheduled.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, ScheduleSchema);
        const id = newId("CSCH" as keyof typeof ID_PREFIX);
        const correlationId = body.correlationId ?? newId("CORR" as keyof typeof ID_PREFIX);
        const idempotencyKey = body.idempotencyKey ?? newId("IDEM" as keyof typeof ID_PREFIX);

        const [row] = await db
          .insert(communicationScheduled)
          .values({
            id,
            tenantId: ctx.principal.tenantId,
            contactId: body.contactId,
            conversationId: body.conversationId,
            journeyRunId: body.journeyRunId,
            type: body.type,
            channel: body.channel,
            templateId: body.templateId,
            payload: body.payload ?? {},
            idempotencyKey,
            correlationId,
            status: "SCHEDULED",
            scheduledFor: new Date(body.scheduledFor),
            createdBy: ctx.principal.userId,
          })
          .returning();

        return { status: 201, body: { scheduled: row, correlationId } };
      });
    },
  );
}
