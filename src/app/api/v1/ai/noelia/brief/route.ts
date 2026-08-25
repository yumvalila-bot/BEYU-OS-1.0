import { z } from "zod";
import { apiError, guarded, parseBody, withIdempotency } from "@/lib/api";
import { briefNoelia } from "@/lib/noelia";

export const dynamic = "force-dynamic";

const BriefSchema = z.object({
  question: z.string().trim().min(3).max(1000).default("Executive briefing across the authorized enterprise."),
  horizon: z.string().min(1).max(40).nullable().optional(),
  /** Board/executive/operational presentation structure (metadata only). */
  structure: z.enum(["BOARD", "EXECUTIVE", "OPERATIONAL"]).optional(),
  focus: z.string().trim().max(300).nullable().optional(),
  context: z.object({
    tenantId: z.string().min(1).max(128).optional(),
    legalEntityId: z.string().min(1).max(128).nullable().optional(),
    countryCode: z.string().length(2).toUpperCase().nullable().optional(),
  }).strict().optional(),
}).strict();

/**
 * POST /api/v1/ai/noelia/brief — governed executive intelligence briefing.
 *
 * Horizons are metadata (near/medium/long term), never authority. Every
 * finding carries an epistemic status; denied capabilities are reported;
 * policy DENY is final and reported.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:executive.read",
      action: "ai.noelia.brief",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "AI_DECISION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, BriefSchema);
      const question = body.question ?? "Executive briefing across the authorized enterprise.";
      return withIdempotency(ctx, "ai.noelia.brief", body, async () => {
        const briefing = await briefNoelia({
          principal: ctx.principal,
          question,
          traceId: ctx.traceId,
          correlationId: ctx.correlationId,
          target: body.context,
          horizon: body.horizon,
          focus: body.focus,
          structure: body.structure,
        });
        return { status: 200, body: briefing };
      }).catch((err) => {
        if (err instanceof z.ZodError) {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }
        throw err;
      });
    },
  );
}
