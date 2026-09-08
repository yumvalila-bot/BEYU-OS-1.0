/**
 * BEYU Foundation OS — deadline computation + listing.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { computeDeadline, listDeadlines } from "@/lib/foundation/compliance";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const ComputeSchema = z.object({
  obligationId: z.string().min(1),
  triggerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodLabel: z.string().max(120).optional(),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  reminderSchedule: z.array(z.number().int().min(0).max(365)).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.read",
      action: "foundation.compliance.deadlines",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_DEADLINE" },
    },
    async (ctx) => {
      const foundationId = new URL(request.url).searchParams.get("foundationId") ?? undefined;
      const rows = await listDeadlines(ctx.principal, foundationId);
      return NextResponse.json({ deadlines: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.computeDeadline",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_DEADLINE" },
    },
    async (ctx) => {
      try {
        const body = ComputeSchema.parse(await request.json());
        const result = await computeDeadline(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
