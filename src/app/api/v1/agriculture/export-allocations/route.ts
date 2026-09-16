/**
 * Agriculture OS — Export Lot Allocations
 * GET /api/v1/agriculture/export-allocations?exportOrderId=...
 */
import { guarded } from "@/lib/api";
import { visibleAgricultureItems } from "@/lib/agriculture/http";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportAllocations.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_LOT_ALLOCATION" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const exportOrderId = url.searchParams.get("exportOrderId");
      const conditions = [eq(s.exportLotAllocations.tenantId, ctx.principal.tenantId)];
      if (exportOrderId) conditions.push(eq(s.exportLotAllocations.exportOrderId, exportOrderId));
      const rows = await db.select().from(s.exportLotAllocations).where(and(...conditions));
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}
