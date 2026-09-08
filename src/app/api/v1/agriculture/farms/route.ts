/**
 * GET  /api/v1/agriculture/farms
 * POST /api/v1/agriculture/farms
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createFarm, listFarms } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const CreateFarmSchema = z.object({
  legalEntityId: z.string().min(1),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  region: z.string().optional(),
  totalAreaHa: z.string().optional(),
  arableAreaHa: z.string().optional(),
  soilType: z.string().optional(),
  waterSource: z.string().optional(),
  gpsLatitude: z.string().optional(),
  gpsLongitude: z.string().optional(),
  timezone: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.farms.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_FARM" },
    },
    async (ctx) => NextResponse.json({ farms: await listFarms(ctx.principal.tenantId) }),
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.farms.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_FARM" },
    },
    async (ctx) => {
      try {
        const parsed = CreateFarmSchema.parse(await request.json());
        const result = await createFarm({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
