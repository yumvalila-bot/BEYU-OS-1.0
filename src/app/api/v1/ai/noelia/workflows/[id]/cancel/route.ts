import { apiError, apiOk, guarded } from "@/lib/api";
import { BeyuNoeliaWorkflowService } from "@/lib/noelia/workflows";

export const dynamic = "force-dynamic";

/** POST /api/v1/ai/noelia/workflows/:id/cancel — governed cancellation; execution stops at the next step boundary. */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "ai:workflow.run",
      action: "ai.noelia.workflow.cancel",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_WORKFLOW", objectId: id },
    },
    async (ctx) => {
      const result = await new BeyuNoeliaWorkflowService().cancel({
        principal: ctx.principal,
        workflowId: id,
        traceId: ctx.traceId,
      });
      if (result.code === "NOT_FOUND") return apiError("NOT_FOUND", result.reason, 404, ctx.traceId);
      if (result.code === "PERMISSION_DENIED") return apiError("FORBIDDEN", result.reason, 403, ctx.traceId);
      return apiOk(result, ctx.traceId);
    },
  );
}
