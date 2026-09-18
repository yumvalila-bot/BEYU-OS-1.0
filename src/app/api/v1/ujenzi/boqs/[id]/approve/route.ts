/** UJENZI OS — governed transition: boqs.approve */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { approveBoq } from "@/lib/ujenzi";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.boqs.approve",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_BOQ", objectId: id },
    },
    async (ctx) => {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await approveBoq({ tenantId: ctx.principal.tenantId, boqId: id }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
