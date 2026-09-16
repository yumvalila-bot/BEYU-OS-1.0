/**
 * Agriculture OS — Export Holds
 * GET list, POST release
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { releaseHold, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const ReleaseSchema = z.object({
  holdId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportHolds.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_HOLD" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const exportOrderId = url.searchParams.get("exportOrderId");
      const status = url.searchParams.get("status");
      const conditions = [eq(s.exportHolds.tenantId, ctx.principal.tenantId)];
      if (exportOrderId) conditions.push(eq(s.exportHolds.exportOrderId, exportOrderId));
      if (status) conditions.push(eq(s.exportHolds.status, status));
      const rows = await db.select().from(s.exportHolds).where(and(...conditions));
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportHolds.release",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_HOLD" },
    },
    async (ctx) => {
      try {
        const body = ReleaseSchema.parse(await request.json());
        const result = await releaseHold(body.holdId, ctx.principal.tenantId, agriActor(ctx));
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
