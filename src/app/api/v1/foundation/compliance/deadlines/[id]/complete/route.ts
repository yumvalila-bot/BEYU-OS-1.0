/**
 * BEYU Foundation OS — deadline completion (evidence-gated).
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { completeDeadline } from "@/lib/foundation/compliance";
import { foundationErrorResponse, foundationServiceContext } from "../../../../_shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.completeDeadline",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_DEADLINE" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const row = await completeDeadline(foundationServiceContext(ctx), id);
        return NextResponse.json({ deadline: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
