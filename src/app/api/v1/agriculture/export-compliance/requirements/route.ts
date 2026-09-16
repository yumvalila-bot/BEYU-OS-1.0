/**
 * Agriculture OS — Export Compliance Requirements
 * GET list, POST create
 * Configurable by country, product, destination market, shipment type, buyer requirements
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { createComplianceRequirement, listComplianceRequirements, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  productId: z.string().optional(),
  destinationMarket: z.string().optional(),
  shipmentType: z.string().optional(),
  buyerId: z.string().optional(),
  documentType: z.string().min(1),
  isMandatory: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportCompliance.requirements.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_COMPLIANCE_REQUIREMENT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const countryCode = url.searchParams.get("countryCode") ?? undefined;
      const productId = url.searchParams.get("productId") ?? undefined;
      const buyerId = url.searchParams.get("buyerId") ?? undefined;
      const rows = await listComplianceRequirements(ctx.principal.tenantId, { countryCode, productId, buyerId });
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportCompliance.requirements.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_COMPLIANCE_REQUIREMENT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createComplianceRequirement(
          {
            tenantId: ctx.principal.tenantId,
            code: body.code,
            name: body.name,
            description: body.description,
            countryCode: body.countryCode?.toUpperCase(),
            productId: body.productId,
            destinationMarket: body.destinationMarket,
            shipmentType: body.shipmentType,
            buyerId: body.buyerId,
            documentType: body.documentType,
            isMandatory: body.isMandatory,
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
