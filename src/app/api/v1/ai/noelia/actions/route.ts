import { z } from "zod";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import {
  approveNoeliaAction,
  executeApprovedNoeliaAction,
  requestNoeliaAction,
} from "@/lib/noelia/actions";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";

export const dynamic = "force-dynamic";

const ActionCommandSchema = z.object({
  command: z.enum(["REQUEST", "APPROVE", "EXECUTE"]),
  actionRequestId: z.string().min(1).optional(),
  toolName: z.enum(["knowledge.ingest", "knowledge.replace", "knowledge.publish"]).optional(),
  toolInput: z.record(z.unknown()).optional(),
  target: z.object({
    tenantId: z.string().min(1).optional(),
    legalEntityId: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
  }).strict().optional(),
  comment: z.string().max(1000).optional(),
}).strict();

/**
 * Canonical mutation boundary for consequential Noelia actions.
 * REQUEST only prepares immutable intent; APPROVE records exact-role human
 * authority; EXECUTE rechecks identity/role/MFA evidence/digest/target/expiry.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof ActionCommandSchema>;
  try {
    body = ActionCommandSchema.parse(await request.clone().json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", "Action command failed schema validation.", 422, "unassigned");
    }
    throw error;
  }
  const permission = body.command === "APPROVE" ? "ai:decision.review" as const : "ai:knowledge.ingest" as const;
  return guarded(
    request,
    {
      permission,
      action: `ai.noelia.action.${body.command.toLowerCase()}`,
      target: body.target ? {
        tenantId: body.target.tenantId,
        entityId: body.target.legalEntityId,
        countryCode: body.target.countryCode,
      } : undefined,
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "NOELIA_ACTION" },
    },
    async (ctx) => {
      // Parse through the canonical helper too, preserving its boundary behavior.
      const parsed = await parseBody(ctx.request, ActionCommandSchema);
      const registry = createDefaultNoeliaToolRegistry();
      if (parsed.command === "REQUEST") {
        if (!parsed.toolName || !parsed.toolInput) {
          return apiError("VALIDATION_FAILED", "REQUEST requires toolName and toolInput.", 422, ctx.traceId);
        }
        const result = await requestNoeliaAction({
          registry,
          principal: ctx.principal,
          toolName: parsed.toolName,
          toolInput: parsed.toolInput,
          target: parsed.target ?? null,
          traceId: ctx.traceId,
        });
        return apiOk(result, ctx.traceId);
      }
      if (!parsed.actionRequestId) {
        return apiError("VALIDATION_FAILED", `${parsed.command} requires actionRequestId.`, 422, ctx.traceId);
      }
      const result = parsed.command === "APPROVE"
        ? await approveNoeliaAction({
            principal: ctx.principal,
            actionRequestId: parsed.actionRequestId,
            traceId: ctx.traceId,
            comment: parsed.comment,
          })
        : await executeApprovedNoeliaAction({
            registry,
            requestingPrincipal: ctx.principal,
            actionRequestId: parsed.actionRequestId,
            traceId: ctx.traceId,
          });
      return apiOk(result, ctx.traceId);
    },
  );
}
