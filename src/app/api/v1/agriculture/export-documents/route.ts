/**
 * Agriculture OS — Export Document Links
 * Reuses canonical agriculture_documents system
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { linkExportDocument, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const CreateSchema = z.object({
  exportOrderId: z.string().optional(),
  shipmentId: z.string().optional(),
  exportShipmentId: z.string().optional(),
  documentId: z.string().min(1),
  documentRole: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportDocuments.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_DOCUMENT_LINK" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const exportOrderId = url.searchParams.get("exportOrderId");
      const conditions = [eq(s.exportDocumentLinks.tenantId, ctx.principal.tenantId)];
      if (exportOrderId) conditions.push(eq(s.exportDocumentLinks.exportOrderId, exportOrderId));
      const rows = await db.select().from(s.exportDocumentLinks).where(and(...conditions));
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportDocuments.link",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_DOCUMENT_LINK" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await linkExportDocument(
          {
            tenantId: ctx.principal.tenantId,
            exportOrderId: body.exportOrderId,
            shipmentId: body.shipmentId,
            exportShipmentId: body.exportShipmentId,
            documentId: body.documentId,
            documentRole: body.documentRole.toUpperCase(),
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
