/**
 * GET /api/v1/agriculture/export-orders/[id]/traceability
 * Reuses existing traceability architecture
 */
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { traceabilityForExportOrder, AgriDomainError } from "@/lib/agriculture";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportOrders.traceability",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const result = await traceabilityForExportOrder(id, ctx.principal.tenantId);
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
