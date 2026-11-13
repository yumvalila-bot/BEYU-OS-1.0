import { apiOk, guarded, parseBody } from "@/lib/api";
import { transitionEntityLifecycle } from "@/lib/mcm/services";
import { lifecycleSchema, mcmRefusal } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/lifecycle — transition a legal entity's MCM lifecycle.
 *
 * The state machine is closed and the event is append-only. DISSOLVED and
 * ARCHIVED additionally require the authority reference that made the change
 * lawful, because a company does not stop existing because a screen was saved.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.lifecycle",
      action: "mcm.company.lifecycle.transition",
      rateLimit: { limit: 15, windowMs: 60_000 },
      audit: { objectType: "LEGAL_ENTITY" },
    },
    async (ctx) => {
      const body = await parseBody(request, lifecycleSchema);
      try {
        return apiOk(await transitionEntityLifecycle(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
