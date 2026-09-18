/** UJENZI OS — governed transition: requisitions.approve */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { approveRequisition } from "@/lib/ujenzi";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.requisitions.approve",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_REQUISITION", objectId: id },
    },
    async (ctx) => {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await approveRequisition({ tenantId: ctx.principal.tenantId, requisitionId: id }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
