import { z } from "zod";
import { apiError, guarded, parseBody, withIdempotency } from "@/lib/api";
import { NOELIA_ANALYSIS_TYPES } from "@/lib/noelia/types";
import { analyzeNoelia } from "@/lib/noelia";

export const dynamic = "force-dynamic";

const AnalyzeSchema = z.object({
  analysisType: z.enum(NOELIA_ANALYSIS_TYPES),
  options: z.record(z.unknown()).optional(),
  context: z.object({
    tenantId: z.string().min(1).max(128).optional(),
    legalEntityId: z.string().min(1).max(128).nullable().optional(),
    countryCode: z.string().length(2).toUpperCase().nullable().optional(),
  }).strict().optional(),
}).strict();

/**
 * POST /api/v1/ai/noelia/analyze — governed enterprise analytics.
 *
 * Deterministic analysis over canonical specialist engines with finite
 * tenant/entity/country predicates. Missing data is UNAVAILABLE, never zero;
 * FORECAST/SCENARIO outputs are never actuals.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:analytics.read",
      action: "ai.noelia.analyze",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "AI_DECISION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, AnalyzeSchema);
      return withIdempotency(ctx, "ai.noelia.analyze", body, async () => {
        const answer = await analyzeNoelia({
          principal: ctx.principal,
          analysisType: body.analysisType,
          traceId: ctx.traceId,
          correlationId: ctx.correlationId,
          target: body.context,
          options: body.options,
        });
        return { status: 200, body: answer };
      }).catch((err) => {
        if (err instanceof z.ZodError) {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }
        throw err;
      });
    },
  );
}
