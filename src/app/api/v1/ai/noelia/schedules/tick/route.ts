import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { BeyuNoeliaSchedulerService } from "@/lib/noelia/scheduler-service";
import { runScheduledBriefing } from "@/lib/noelia";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/noelia/schedules/tick — governed scheduler tick.
 *
 * The ONLY scheduler entry point: due schedules emit one canonical
 * enterprise-event OUTBOX entry per (schedule, period); the consumer then
 * processes due events idempotently (unique run per schedule/for) and records
 * audit evidence. No in-process timer executes anything. Scheduled briefings
 * run as the schedule's recorded owner and re-check authorization per tool.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:schedule.manage",
      action: "ai.noelia.schedule.tick",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "NOELIA_SCHEDULE_RUN" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "ai.noelia.schedules.tick", {}, async () => {
        const service = new BeyuNoeliaSchedulerService();
        const { emitted } = await service.emitDueRuns({
          principal: ctx.principal,
          traceId: ctx.traceId,
        });
        const consumed = await service.consumeDueRuns({
          principal: ctx.principal,
          traceId: ctx.traceId,
          runBriefing: async (owner, schedule, periodKey, runTraceId) =>
            runScheduledBriefing({
              owner,
              schedule: {
                id: schedule.id,
                code: schedule.code,
                tenantId: schedule.tenantId,
                legalEntityId: schedule.legalEntityId,
                countryCode: schedule.countryCode,
                horizon: schedule.horizon,
                briefingFocus: schedule.briefingFocus,
              },
              traceId: runTraceId,
            }),
        });
        if (consumed.failed > 0) {
          return apiError(
            "SCHEDULE_RUN_FAILED",
            `${consumed.failed} scheduled run(s) failed; evidence recorded, no domain mutation committed.`,
            500,
            ctx.traceId,
          );
        }
        return { status: 200, body: { emitted, ...consumed } };
      }).catch((err) => {
        if (err instanceof Error && err.name === "NoeliaToolTimeoutError") {
          return apiError("TIMEOUT", "A scheduled briefing exceeded its governed budget.", 504, ctx.traceId);
        }
        throw err;
      });
    },
  );
}
