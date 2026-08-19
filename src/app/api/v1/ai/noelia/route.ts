import { z } from "zod";
import { apiOk, guarded, parseBody } from "@/lib/api";
import { askNoelia } from "@/lib/noelia";

export const dynamic = "force-dynamic";

const AskSchema = z.object({ question: z.string().min(3).max(1000) });

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
      const answer = await askNoelia({ principal: ctx.principal, question: body.question, traceId: ctx.traceId });
      return apiOk(answer, ctx.traceId);
    },
  );
}
