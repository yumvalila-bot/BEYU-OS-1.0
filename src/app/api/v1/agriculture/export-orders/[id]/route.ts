/**
 * GET /api/v1/agriculture/export-orders/[id]
 * Returns export order with allocations, compliance readiness, holds, traceability summary
 */
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getExportOrder, complianceReadiness, traceabilityForExportOrder, AgriDomainError } from "@/lib/agriculture";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportOrders.get",
      classification: "RESTRICTED",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const order = await getExportOrder(id, ctx.principal.tenantId);
        if (!order) return apiError("NOT_FOUND", "Export order not found", 404, ctx.traceId);

        const [allocations, compliance, holds, shipments, docLinks] = await Promise.all([
          db.select().from(s.exportLotAllocations).where(and(eq(s.exportLotAllocations.exportOrderId, id), eq(s.exportLotAllocations.tenantId, ctx.principal.tenantId))),
          complianceReadiness(id, ctx.principal.tenantId),
          db.select().from(s.exportHolds).where(and(eq(s.exportHolds.exportOrderId, id), eq(s.exportHolds.tenantId, ctx.principal.tenantId))),
          db.select().from(s.exportShipments).where(and(eq(s.exportShipments.exportOrderId, id), eq(s.exportShipments.tenantId, ctx.principal.tenantId))),
          db.select().from(s.exportDocumentLinks).where(and(eq(s.exportDocumentLinks.exportOrderId, id), eq(s.exportDocumentLinks.tenantId, ctx.principal.tenantId))),
        ]);

        return NextResponse.json({
          order,
          allocations,
          compliance,
          holds,
          shipments,
          documentLinks: docLinks,
        });
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
