/**
 * POST /api/v1/agriculture/livestock/events
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { recordLivestockEvent } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const RecordLivestockEventSchema = z.object({
  herdId: z.string().min(1),
  eventType: z.enum(["BIRTH", "DEATH", "PURCHASE", "SALE", "VACCINATION", "TREATMENT", "TRANSFER"]),
  eventDate: z.string().min(1),
  headCount: z.number().int(),
  description: z.string().optional(),
  performedBy: z.string().optional(),
  cost: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.livestock.events.record",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_LIVESTOCK_EVENT" },
    },
    async (ctx) => {
      try {
        const parsed = RecordLivestockEventSchema.parse(await request.json());
        const result = await recordLivestockEvent({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
