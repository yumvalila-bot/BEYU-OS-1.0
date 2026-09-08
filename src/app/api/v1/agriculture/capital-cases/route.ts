/**
 * GET/POST /api/v1/agriculture/capital-cases
 *
 * Operational capital cases only. Does not insert journals or capital_requests.
 * Finance handoff is SUBMITTED_PENDING_FINANCE. CAP_POSTING remains LOCKED.
 */
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { capitalCases } from "@/db/schema";
import { guarded } from "@/lib/api";
import { createCapitalCase } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const CreateSchema = z.object({
  legalEntityId: z.string().optional(),
  farmId: z.string().optional(),
  code: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  amount: z.string().min(1),
  currency: z.string().length(3).optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.capitalCases.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_CAPITAL_CASE" },
    },
    async (ctx) => {
      const rows = await db.select().from(capitalCases).where(eq(capitalCases.tenantId, ctx.principal.tenantId));
      return NextResponse.json({ items: rows, capPosting: "LOCKED" });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.capitalCases.submit",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_CAPITAL_CASE" },
    },
    async (ctx) => {
      try {
        const parsed = CreateSchema.parse(await request.json());
        const result = await createCapitalCase({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
