/**
 * POST /api/v1/agriculture/export-orders/[id]/transition
 * Governed state transitions — client cannot arbitrarily set status
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { transitionExportOrder, AgriDomainError } from "@/lib/agriculture";
import { agriActor } from "@/lib/agriculture/http";

const Schema = z.object({
  targetStatus: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportOrders.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        const result = await transitionExportOrder(id, ctx.principal.tenantId, body.targetStatus.toUpperCase(), agriActor(ctx));
        return NextResponse.json(result);
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
