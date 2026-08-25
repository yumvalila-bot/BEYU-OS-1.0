import { apiError, apiOk, guarded } from "@/lib/api";
import { BeyuNoeliaWorkflowService } from "@/lib/noelia/workflows";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";

export const dynamic = "force-dynamic";

/** POST /api/v1/ai/noelia/workflows/:id/validate — capability validation before authorization. */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "ai:workflow.run",
      action: "ai.noelia.workflow.validate",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_WORKFLOW", objectId: id },
    },
    async (ctx) => {
      const result = await new BeyuNoeliaWorkflowService().validate({
        principal: ctx.principal,
        registry: createDefaultNoeliaToolRegistry(),
        workflowId: id,
        traceId: ctx.traceId,
      });
      if (result.code === "NOT_FOUND") return apiError("NOT_FOUND", result.reason, 404, ctx.traceId);
      if (result.code === "INVALID_TRANSITION") return apiError("INVALID_TRANSITION", result.reason, 409, ctx.traceId);
      return apiOk(result, ctx.traceId);
    },
  );
}
