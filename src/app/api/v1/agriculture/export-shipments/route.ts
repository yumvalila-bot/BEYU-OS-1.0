/**
 * Agriculture OS — Export Shipments
 * GET list, POST create, POST transition via /export-shipments/[id]/transition? We'll handle transition via same route with action
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createExportShipment, transitionExportShipment, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const CreateSchema = z.object({
  exportOrderId: z.string().min(1),
  shipmentCode: z.string().min(1),
  fromWarehouseId: z.string().optional(),
  destinationCountryCode: z.string().length(2),
  destinationText: z.string().optional(),
  transportMode: z.string().optional(),
  commercialTerms: z.string().optional(),
});

const TransitionSchema = z.object({
  exportShipmentId: z.string().min(1),
  targetStatus: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportShipments.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_SHIPMENT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const exportOrderId = url.searchParams.get("exportOrderId");
      const conditions = [eq(s.exportShipments.tenantId, ctx.principal.tenantId)];
      if (exportOrderId) conditions.push(eq(s.exportShipments.exportOrderId, exportOrderId));
      const rows = await db.select().from(s.exportShipments).where(and(...conditions));
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportShipments.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_SHIPMENT" },
    },
    async (ctx) => {
      try {
        const raw = await request.json();
        // Detect if it's a transition request (has exportShipmentId + targetStatus) vs create
        if (raw.exportShipmentId && raw.targetStatus) {
          const parsed = TransitionSchema.parse(raw);
          const result = await transitionExportShipment(parsed.exportShipmentId, ctx.principal.tenantId, parsed.targetStatus.toUpperCase(), agriActor(ctx));
          return NextResponse.json(result);
        }
        const body = CreateSchema.parse(raw);
        const result = await createExportShipment(
          {
            tenantId: ctx.principal.tenantId,
            exportOrderId: body.exportOrderId,
            shipmentCode: body.shipmentCode,
            fromWarehouseId: body.fromWarehouseId,
            destinationCountryCode: body.destinationCountryCode.toUpperCase(),
            destinationText: body.destinationText,
            transportMode: body.transportMode,
            commercialTerms: body.commercialTerms,
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
