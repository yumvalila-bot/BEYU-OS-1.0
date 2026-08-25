import { z } from "zod";
import { apiError, apiOk, guarded, parseBody, withIdempotency } from "@/lib/api";
import { BeyuNoeliaSchedulerService } from "@/lib/noelia/scheduler-service";

export const dynamic = "force-dynamic";

const StatusSchema = z.object({
  status: z.enum(["SUSPENDED", "CANCELLED", "ACTIVE"]),
}).strict();

/** POST /api/v1/ai/noelia/schedules/:id/status — governed suspend/cancel/reactivate. */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "ai:schedule.manage",
      action: "ai.noelia.schedule.status",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_SCHEDULE", objectId: id },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, StatusSchema);
      return withIdempotency(ctx, `ai.noelia.schedules.${id}.status`, body, async () => {
        const result = await new BeyuNoeliaSchedulerService().setStatus({
          principal: ctx.principal,
          scheduleId: id,
          status: body.status,
          traceId: ctx.traceId,
        });
        if (result.status === "NOT_FOUND") return apiError("NOT_FOUND", result.reason, 404, ctx.traceId);
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
