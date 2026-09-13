/**
 * POST /api/v1/agriculture/export-orders/[id]/allocate
 * Allocate inventory lots or trace batches to export order
 * Prevents over-allocation, duplicate, negative, blocked, rejected, double consumption
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { allocateLot, AgriDomainError } from "@/lib/agriculture";
import { agriActor } from "@/lib/agriculture/http";

const Schema = z.object({
  inventoryLotId: z.string().min(1).optional(),
  traceBatchId: z.string().min(1).optional(),
  qtyAllocated: z.string().min(1),
}).refine((d) => d.inventoryLotId || d.traceBatchId, { message: "Either inventoryLotId or traceBatchId required" });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportOrders.allocateLot",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        const result = await allocateLot(
          {
            tenantId: ctx.principal.tenantId,
            exportOrderId: id,
            inventoryLotId: body.inventoryLotId,
            traceBatchId: body.traceBatchId,
            qtyAllocated: body.qtyAllocated,
          },
          agriActor(ctx),
        );
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        if (err instanceof AgriDomainError) {
          const status = err.code === "NOT_FOUND" ? 404 : err.code === "SCOPE" ? 403 : 409;
          return apiError(err.code, err.message, status, ctx.traceId, err.details);
        }
        throw err;
      }
    },
  );
}
