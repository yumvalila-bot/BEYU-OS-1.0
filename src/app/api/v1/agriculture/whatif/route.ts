/** POST /api/v1/agriculture/whatif — SIMULATION only, never financial truth */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { runWhatIf } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const WhatIfSchema = z.object({
  farmId: z.string().optional(),
  title: z.string().min(1).max(200),
  areaHa: z.number().nonnegative().optional(),
  yieldKgPerHa: z.number().nonnegative().optional(),
  rainfallMm: z.number().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.whatif.run",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_WHATIF_RUN" },
    },
    async (ctx) => {
      try {
        const parsed = WhatIfSchema.parse(await request.json());
        const result = await runWhatIf({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
