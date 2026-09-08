/**
 * GET  /api/v1/agriculture/livestock
 * POST /api/v1/agriculture/livestock
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createHerd, listHerds } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const CreateHerdSchema = z.object({
  farmId: z.string().min(1),
  livestockTypeId: z.string().min(1).optional(),
  species: z.string().optional(),
  breed: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  headCount: z.number().int().optional(),
  location: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.livestock.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_LIVESTOCK_HERD" },
    },
    async (ctx) => {
      const farmId = request.nextUrl.searchParams.get("farmId") ?? undefined;
      return NextResponse.json({ herds: await listHerds(ctx.principal.tenantId, farmId) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.livestock.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_LIVESTOCK_HERD" },
    },
    async (ctx) => {
      try {
        const parsed = CreateHerdSchema.parse(await request.json());
        const result = await createHerd({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
