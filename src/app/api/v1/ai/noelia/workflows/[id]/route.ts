import { apiError, apiOk, guarded } from "@/lib/api";
import { BeyuNoeliaWorkflowService } from "@/lib/noelia/workflows";

export const dynamic = "force-dynamic";

/** GET /api/v1/ai/noelia/workflows/:id — scoped read of a workflow and its step evidence. */
export async function GET(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "ai:workflow.run",
      action: "ai.noelia.workflow.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "NOELIA_WORKFLOW", objectId: id },
    },
    async (ctx) => {
      const result = await new BeyuNoeliaWorkflowService().get({
        principal: ctx.principal,
        workflowId: id,
      });
      if (!result) return apiError("NOT_FOUND", "Workflow not found in scope.", 404, ctx.traceId);
      return apiOk(result, ctx.traceId);
    },
  );
}
