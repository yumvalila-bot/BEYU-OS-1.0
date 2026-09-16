/**
 * GET /api/v1/agriculture/export-orders/[id]/holds
 * POST /api/v1/agriculture/export-orders/[id]/holds
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { createHold, listHolds, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const CreateSchema = z.object({
  holdType: z.string().min(1),
  reason: z.string().min(5),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportOrders.holds.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      const rows = await listHolds(ctx.principal.tenantId, { exportOrderId: id });
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportOrders.holds.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createHold(
          {
            tenantId: ctx.principal.tenantId,
            exportOrderId: id,
            holdType: body.holdType.toUpperCase(),
            reason: body.reason,
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
