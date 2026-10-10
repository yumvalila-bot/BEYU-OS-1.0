import { z } from "zod";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { setNoeliaExecutionControl } from "@/lib/noelia/execution-control";

export const dynamic = "force-dynamic";

const ControlSchema = z.object({
  command: z.enum(["STOP", "RESUME"]),
  targetType: z.enum(["ALL", "MODEL", "PROVIDER", "TOOL", "OS", "TENANT", "CAPABILITY", "AI_IDENTITY"]),
  targetRef: z.string().min(1).max(200),
  targetTenantId: z.string().min(1).nullable().optional(),
  reason: z.string().min(10).max(1000),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict();

/** Human stop/restart authority. STOP always outranks queued and future work. */
export async function POST(request: Request) {
  let preview: z.infer<typeof ControlSchema>;
  try {
    preview = ControlSchema.parse(await request.clone().json());
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("VALIDATION_FAILED", "Control command failed schema validation.", 422, "unassigned");
    throw error;
  }
  const globalTarget = preview.targetType === "ALL" || preview.targetType === "AI_IDENTITY";
  return guarded(
    request,
    {
      permission: "ai:killswitch.manage",
      action: `ai.noelia.control.${preview.command.toLowerCase()}`,
      target: { tenantId: globalTarget ? null : preview.targetTenantId },
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_KILL_SWITCH" },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, ControlSchema);
      const result = await setNoeliaExecutionControl({
        principal: ctx.principal,
        command: body.command,
        targetType: body.targetType,
        targetRef: body.targetRef,
        targetTenantId: body.targetTenantId,
        reason: body.reason,
        traceId: ctx.traceId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      return apiOk(result, ctx.traceId);
    },
  );
}
