/**
 * BEYU OS — Agriculture OS: Livestock API
 *
 * GET  /api/v1/agriculture/livestock — List herds for current tenant
 * POST /api/v1/agriculture/livestock/events — Record a livestock event
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/guard";
import { listHerds, recordLivestockEvent } from "@/lib/agriculture";

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

export const GET = guarded(async (req: NextRequest, ctx) => {
  const farmId = req.nextUrl.searchParams.get("farmId") ?? undefined;
  const herds = await listHerds(ctx.tenantId, farmId);
  return NextResponse.json({ herds });
});

// POST /api/v1/agriculture/livestock/events
export const POST_events = guarded(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const parsed = RecordLivestockEventSchema.parse(body);

  const result = await recordLivestockEvent({
    tenantId: ctx.tenantId,
    ...parsed,
  });

  return NextResponse.json(result, { status: 201 });
});
