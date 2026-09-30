/**
 * GET /api/v1/communications/journeys — list journeys
 * POST /api/v1/communications/journeys — create journey
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { listJourneys, createJourney } from "@/lib/communications/journey-service";

export const dynamic = "force-dynamic";

const CreateJourneySchema = z.object({
  code: z.string().min(2).max(60).regex(/^[A-Z][A-Z0-9_]+$/),
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  triggerEventType: z.string().min(2).max(100),
  triggerConditions: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(
    z.object({
      step: z.number().int().min(0),
      name: z.string().min(1).max(200),
      channel: z.string().max(20).optional(),
      templateCode: z.string().max(60).optional(),
      delayMinutes: z.number().int().min(0).max(10080).optional(),
      condition: z.record(z.string(), z.unknown()).optional(),
      action: z.string().max(100).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:journey.read",
      action: "communications.journeys.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const journeys = await listJourneys(ctx.principal.tenantId);
      return apiOk({ journeys, total: journeys.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:journey.manage",
      action: "communications.journeys.create",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_JOURNEY" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.journeys.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateJourneySchema);

        const journey = await createJourney({
          tenantId: ctx.principal.tenantId,
          code: body.code,
          name: body.name,
          description: body.description,
          triggerEventType: body.triggerEventType,
          triggerConditions: body.triggerConditions,
          steps: body.steps as never,
          classification: body.classification,
          createdBy: ctx.principal.userId,
        });

        return { status: 201, body: { journey } };
      });
    },
  );
}
