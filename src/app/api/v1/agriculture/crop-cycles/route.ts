/**
 * GET  /api/v1/agriculture/crop-cycles
 * POST /api/v1/agriculture/crop-cycles
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createCropCycle, listCropCycles } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const CreateCropCycleSchema = z.object({
  fieldId: z.string().min(1),
  cropTypeId: z.string().min(1).optional(),
  cropType: z.string().min(1).optional(),
  code: z.string().min(1).max(50),
  season: z.string().min(1).max(100),
  plantingDate: z.string().min(1),
  expectedHarvestDate: z.string().optional(),
  seedQuantityKg: z.string().optional(),
  expectedYieldKg: z.string().optional(),
  variety: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.cropCycles.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_CROP_CYCLE" },
    },
    async (ctx) => {
      const status = request.nextUrl.searchParams.get("status") ?? undefined;
      return NextResponse.json({ cropCycles: await listCropCycles(ctx.principal.tenantId, status) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.cropCycles.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_CROP_CYCLE" },
    },
    async (ctx) => {
      try {
        const parsed = CreateCropCycleSchema.parse(await request.json());
        const result = await createCropCycle({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
