/**
 * GET /api/v1/communications/analytics — summary + daily
 */

import { NextRequest } from "next/server";
import { guarded, apiOk } from "@/lib/api";
import { getAnalyticsSummary, getCostIntelligence, getConversationMetrics } from "@/lib/communications/analytics-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:analytics.read",
      action: "communications.analytics.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const fromDate = searchParams.get("from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const toDate = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

      const summary = await getAnalyticsSummary(ctx.principal.tenantId, fromDate, toDate);
      const cost = await getCostIntelligence(ctx.principal.tenantId, fromDate, toDate);
      const conversations = await getConversationMetrics(ctx.principal.tenantId);

      return apiOk(
        {
          period: { from: fromDate, to: toDate },
          summary,
          costIntelligence: cost,
          conversations,
        },
        ctx.traceId,
      );
    },
  );
}
