/**
 * BEYU OS — Agriculture OS: Livestock Events API (DRAFT domain)
 *
 * POST /api/v1/agriculture/livestock/events — Record a livestock event
 *
 * Authorized by RBAC (`agriculture:data.manage`). The handler runs inside the
 * guarded() tenant RLS context; cross-tenant writes are additionally denied by
 * Row Level Security.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { recordLivestockEvent } from "@/lib/agriculture";

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
      const body = await request.json();
      const parsed = RecordLivestockEventSchema.parse(body);

      const result = await recordLivestockEvent({
        tenantId: ctx.principal.tenantId,
        ...parsed,
      });

      return NextResponse.json(result, { status: 201 });
    },
  );
}
