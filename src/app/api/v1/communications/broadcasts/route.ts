/**
 * GET /api/v1/communications/broadcasts — list broadcasts
 * POST /api/v1/communications/broadcasts — create broadcast (governed, consent-gated)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { db } from "@/db";
import { communicationBroadcasts } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

const CreateBroadcastSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"]),
  templateId: z.string().max(60).optional().nullable(),
  audienceFilter: z.record(z.string(), z.unknown()).optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
  correlationId: z.string().max(120).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:broadcast.read",
      action: "communications.broadcasts.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      const conditions = [eq(communicationBroadcasts.tenantId, ctx.principal.tenantId)];
      if (status) conditions.push(eq(communicationBroadcasts.status, status));

      const rows = await db
        .select()
        .from(communicationBroadcasts)
        .where(and(...conditions))
        .orderBy(desc(communicationBroadcasts.createdAt))
        .limit(limit);

      return apiOk({ broadcasts: rows, total: rows.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:broadcast.manage",
      action: "communications.broadcasts.create",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_BROADCAST" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.broadcasts.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateBroadcastSchema);
        const id = newId(ID_PREFIX.commBroadcast);
        const correlationId = body.correlationId ?? newId(ID_PREFIX.correlationId);

        // Broadcast requires authorization, consent, audience definition, rate limiting,
        // scheduling, cancellation, preview, approval where required, deduplication, audit, cost visibility
        // For now, create as DRAFT — approval required before sending

        const [row] = await db
          .insert(communicationBroadcasts)
          .values({
            id,
            tenantId: ctx.principal.tenantId,
            name: body.name,
            description: body.description,
            channel: body.channel,
            templateId: body.templateId,
            audienceFilter: body.audienceFilter ?? {},
            status: "DRAFT",
            scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
            correlationId,
            createdBy: ctx.principal.userId,
          })
          .returning();

        return {
          status: 201,
          body: {
            broadcast: row,
            correlationId,
            note: "Broadcast created as DRAFT — requires approval via communications:broadcast.approve before sending",
          },
        };
      });
    },
  );
}
