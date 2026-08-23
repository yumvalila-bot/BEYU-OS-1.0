import { z } from "zod";
import { apiOk, guarded, parseBody } from "@/lib/api";
import { askNoelia } from "@/lib/noelia";

export const dynamic = "force-dynamic";

const AskSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  context: z.object({
    tenantId: z.string().min(1).max(128).optional(),
    legalEntityId: z.string().min(1).max(128).nullable().optional(),
    countryCode: z.string().length(2).toUpperCase().nullable().optional(),
  }).strict().optional(),
}).strict();

/** POST /api/v1/ai/noelia — governed AI query (single AI identity, fully audited). */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:noelia.query",
      action: "ai.noelia.query",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "AI_DECISION" },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, AskSchema);
      const answer = await askNoelia({
        principal: ctx.principal,
        question: body.question,
        traceId: ctx.traceId,
        target: body.context,
      });
      return apiOk(answer, ctx.traceId);
    },
  );
}
