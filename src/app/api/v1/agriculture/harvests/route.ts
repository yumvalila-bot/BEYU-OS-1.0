/**
 * GET  /api/v1/agriculture/harvests
 * POST /api/v1/agriculture/harvests
 *
 * Recording a harvest emits HARVEST_RECORDED. It never posts a journal.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listHarvests, recordHarvest } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const RecordHarvestSchema = z.object({
  cropCycleId: z.string().min(1),
  code: z.string().min(1).max(50),
  harvestDate: z.string().min(1),
  quantityKg: z.string().min(1),
  qualityGrade: z.enum(["A", "B", "C", "REJECTED"]).optional(),
  moistureContent: z.string().optional(),
  harvestedBy: z.string().optional(),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
  unit: z.string().optional(),
  batchCode: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.harvests.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_HARVEST" },
    },
    async (ctx) => {
      const cropCycleId = request.nextUrl.searchParams.get("cropCycleId") ?? undefined;
      return NextResponse.json({ harvests: await listHarvests(ctx.principal.tenantId, cropCycleId) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.harvests.record",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_HARVEST" },
    },
    async (ctx) => {
      try {
        const parsed = RecordHarvestSchema.parse(await request.json());
        const result = await recordHarvest({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
