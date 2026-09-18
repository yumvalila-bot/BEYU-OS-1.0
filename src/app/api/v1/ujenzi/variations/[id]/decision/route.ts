/** UJENZI OS — governed transition: variations.decide */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { decideVariation } from "@/lib/ujenzi";

const Schema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.variations.decide",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_VARIATION", objectId: id },
    },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        const result = await decideVariation({ tenantId: ctx.principal.tenantId, variationId: id, decision: body.decision }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
