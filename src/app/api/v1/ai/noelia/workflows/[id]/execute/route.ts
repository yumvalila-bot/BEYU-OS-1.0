import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { BeyuNoeliaWorkflowService } from "@/lib/noelia/workflows";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/noelia/workflows/:id/execute
 *
 * EXECUTE → OBSERVE → REASSESS → CONTINUE/ESCALATE/STOP. Authorization is
 * re-checked at execution (an approval record is never authority by
 * existence). Steps commit individually and resume idempotently after a
 * crash; the whole run is bounded by maxSteps/timeout.
 */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "ai:workflow.run",
      action: "ai.noelia.workflow.execute",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "NOELIA_WORKFLOW", objectId: id },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, `ai.noelia.workflows.${id}.execute`, {}, async () => {
        const result = await new BeyuNoeliaWorkflowService().execute({
          principal: ctx.principal,
          registry: createDefaultNoeliaToolRegistry(),
          workflowId: id,
          traceId: ctx.traceId,
        });
        if (result.code === "NOT_FOUND") return apiError("NOT_FOUND", result.reason, 404, ctx.traceId);
        if (result.code === "EXECUTION_DENIED") return apiError("EXECUTION_DENIED", result.reason, 403, ctx.traceId);
        return { status: 200, body: result };
      }).catch((err) => {
        if (err instanceof Error && err.name === "NoeliaToolTimeoutError") {
          return apiError("TIMEOUT", "A workflow step exceeded its governed budget.", 504, ctx.traceId);
        }
        throw err;
      });
    },
  );
}
