/**
 * BEYU Foundation OS — authorised knowledge subgraph for a foundation.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded, apiError } from "@/lib/api";
import { buildFoundationGraph } from "@/lib/foundation/knowledge-graph";
import { foundationErrorResponse } from "../_shared";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:registry.read",
      action: "foundation.graph",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION" },
    },
    async (ctx) => {
      try {
        const foundationId = new URL(request.url).searchParams.get("foundationId");
        if (!foundationId) return apiError("VALIDATION_FAILED", "foundationId is required", 422, ctx.traceId);
        const graph = await buildFoundationGraph(ctx.principal, foundationId);
        return NextResponse.json(graph);
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
