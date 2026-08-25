import { z } from "zod";
import { apiError, guarded, parseBody, withIdempotency } from "@/lib/api";
import { BeyuNoeliaWorkflowService, WORKFLOW_PLAN_SCHEMA } from "@/lib/noelia/workflows";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  goal: z.string().trim().min(10).max(500),
  maxSteps: z.number().int().min(1).max(12).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  target: z.object({
    tenantId: z.string().min(1),
    legalEntityId: z.string().min(1).nullable().optional(),
    countryCode: z.string().length(2).toUpperCase().nullable().optional(),
  }).strict(),
  steps: z.array(z.object({
    toolName: z.string().min(3).max(80),
    input: z.record(z.unknown()).default({}),
    requiresApproval: z.boolean().default(false),
    approverRole: z.string().nullable().optional(),
  }).strict()).min(1).max(12),
}).strict();

/**
 * POST /api/v1/ai/noelia/workflows — PLAN a governed agentic workflow.
 *
 * Nothing executes at plan time. Steps are persisted PENDING; a later
 * VALIDATE → AUTHORIZE (separate accountable human) → EXECUTE sequence is
 * required, and every step re-checks authorization at execution.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:workflow.run",
      action: "ai.noelia.workflow.plan",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_WORKFLOW" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, CreateSchema);
      return withIdempotency(ctx, "ai.noelia.workflows.create", body, async () => {
        const service = new BeyuNoeliaWorkflowService();
        const result = await service.create({
          principal: ctx.principal,
          plan: body as z.infer<typeof WORKFLOW_PLAN_SCHEMA>,
          traceId: ctx.traceId,
          correlationId: ctx.correlationId,
        });
        if (result.status === "PLANNED" && result.code === "TENANT_DENIED") {
          return apiError("TENANT_DENIED", result.reason, 403, ctx.traceId);
        }
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
