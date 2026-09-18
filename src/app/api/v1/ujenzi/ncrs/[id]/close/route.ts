/** UJENZI OS — governed transition: ncrs.close */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { closeNcr } from "@/lib/ujenzi";

const Schema = z.object({
  correctiveAction: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.ncrs.close",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_NCR", objectId: id },
    },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        const result = await closeNcr({ tenantId: ctx.principal.tenantId, ncrId: id, correctiveAction: body.correctiveAction }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
