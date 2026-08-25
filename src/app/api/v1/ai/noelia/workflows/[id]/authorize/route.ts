import { z } from "zod";
import { apiError, apiOk, guarded, parseBody, withIdempotency } from "@/lib/api";
import { BeyuNoeliaWorkflowService } from "@/lib/noelia/workflows";

export const dynamic = "force-dynamic";

const AuthorizeSchema = z.object({
  comment: z.string().trim().max(2000).nullish(),
  /**
   * Decision validity window (ISO 8601). After this instant the approval is
   * no longer sufficient authority for execution. Omit for a non-expiring
   * decision. Values are request metadata, never a derived policy threshold.
   */
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  /**
   * Quorum: number of distinct approvers required before execution. Omit for
   * single-approver workflows. The requester can never approve their own
   * workflow, so every quorum member is a distinct accountable human.
   */
  quorum: z.number().int().min(1).max(5).nullable().optional(),
  /** Delegation evidence: approval cast on behalf of this human. */
  delegatedFrom: z.string().trim().min(3).max(128).nullable().optional(),
}).strict();

/**
 * POST /api/v1/ai/noelia/workflows/:id/authorize
 *
 * Maker/checker separation is enforced server-side: the requesting human can
 * never authorize their own workflow. Authorization records an approval; it
 * executes nothing — execution re-checks authorization.
 */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "ai:workflow.approve",
      action: "ai.noelia.workflow.authorize",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_WORKFLOW", objectId: id },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, AuthorizeSchema);
      return withIdempotency(ctx, `ai.noelia.workflows.${id}.authorize`, body, async () => {
        const result = await new BeyuNoeliaWorkflowService().authorize({
          principal: ctx.principal,
          workflowId: id,
          traceId: ctx.traceId,
          comment: body.comment ?? undefined,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          quorum: body.quorum ?? null,
          delegatedFrom: body.delegatedFrom ?? null,
        });
        if (result.code === "NOT_FOUND") return apiError("NOT_FOUND", result.reason, 404, ctx.traceId);
        if (result.code === "AUTHORIZATION_DENIED") return apiError("AUTHORIZATION_DENIED", result.reason, 403, ctx.traceId);
        return { status: 200, body: result };
      }).catch((err) => {
        if (err instanceof z.ZodError) {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }
        throw err;
      });
    },
  );
}
