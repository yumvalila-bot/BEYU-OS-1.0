/** UJENZI OS — governed transition: purchaseOrders.approve */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { approvePurchaseOrder } from "@/lib/ujenzi";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.purchaseOrders.approve",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_PURCHASE_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await approvePurchaseOrder({ tenantId: ctx.principal.tenantId, purchaseOrderId: id }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
