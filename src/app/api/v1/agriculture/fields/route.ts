/**
 * GET  /api/v1/agriculture/fields
 * POST /api/v1/agriculture/fields
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createField, listFields } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const CreateFieldSchema = z.object({
  farmId: z.string().min(1),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  areaHa: z.string().min(1),
  soilType: z.string().optional(),
  irrigationType: z.string().optional(),
  gpsLatitude: z.string().optional(),
  gpsLongitude: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.fields.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_FIELD" },
    },
    async (ctx) => {
      const farmId = request.nextUrl.searchParams.get("farmId") ?? undefined;
      return NextResponse.json({ fields: await listFields(ctx.principal.tenantId, farmId) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.fields.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_FIELD" },
    },
    async (ctx) => {
      try {
        const parsed = CreateFieldSchema.parse(await request.json());
        const result = await createField({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
