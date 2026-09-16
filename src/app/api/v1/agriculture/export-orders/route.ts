/**
 * Agriculture OS — Food Export Orders
 * GET /api/v1/agriculture/export-orders
 * POST /api/v1/agriculture/export-orders
 *
 * Reuses buyer, product, country models. No Finance posting.
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { createExportOrder, listExportOrders, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const CreateSchema = z.object({
  code: z.string().min(1),
  buyerId: z.string().min(1),
  productId: z.string().min(1).optional(),
  quantity: z.string().min(1),
  uom: z.string().min(1).optional(),
  gradeSpec: z.string().optional(),
  destination: z.string().optional(),
  destinationCountryCode: z.string().min(2).max(2),
  requestedShipmentDate: z.string().optional(),
  commercialTerms: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  legalEntityId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportOrders.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const buyerId = url.searchParams.get("buyerId") ?? undefined;
      const destinationCountryCode = url.searchParams.get("destinationCountryCode") ?? undefined;
      const rows = await listExportOrders(ctx.principal.tenantId, { status, buyerId, destinationCountryCode });
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportOrders.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createExportOrder(
          {
            tenantId: ctx.principal.tenantId,
            code: body.code,
            buyerId: body.buyerId,
            productId: body.productId,
            quantity: body.quantity,
            uom: body.uom,
            gradeSpec: body.gradeSpec,
            destination: body.destination,
            destinationCountryCode: body.destinationCountryCode.toUpperCase(),
            requestedShipmentDate: body.requestedShipmentDate,
            commercialTerms: body.commercialTerms,
            currency: body.currency,
            notes: body.notes,
            legalEntityId: body.legalEntityId,
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
