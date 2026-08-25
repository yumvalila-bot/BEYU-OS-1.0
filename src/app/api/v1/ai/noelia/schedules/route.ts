import { z } from "zod";
import { apiError, apiOk, guarded, parseBody, withIdempotency } from "@/lib/api";
import { BeyuNoeliaSchedulerService, SCHEDULE_SCHEMA } from "@/lib/noelia/scheduler-service";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  code: z.string().min(3).max(64).regex(/^[A-Z0-9._-]+$/),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "HORIZON"]),
  horizon: z.string().min(1).max(40),
  briefingFocus: z.string().min(1).max(120).default("STANDARD"),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).default("RESTRICTED"),
  targetTenantId: z.string().min(1),
  legalEntityId: z.string().min(1).nullable().optional(),
  countryCode: z.string().length(2).toUpperCase().nullable().optional(),
  nextRunAt: z.string(),
  enabled: z.boolean().default(true),
}).strict();

/**
 * POST /api/v1/ai/noelia/schedules — register a governed schedule (DATA, not
 * execution). Runs are emitted through the canonical enterprise-events OUTBOX
 * and consumed idempotently; nothing executes from this request.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:schedule.manage",
      action: "ai.noelia.schedule.create",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "NOELIA_SCHEDULE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, CreateSchema);
      return withIdempotency(ctx, "ai.noelia.schedules.create", body, async () => {
        const result = await new BeyuNoeliaSchedulerService().create({
          principal: ctx.principal,
          schedule: body as z.infer<typeof SCHEDULE_SCHEMA>,
          traceId: ctx.traceId,
        });
        if (result.status === "DENIED") return apiError("SCHEDULE_DENIED", result.reason, 409, ctx.traceId);
        if (result.status === "FAILED") return apiError("SCHEDULE_FAILED", result.reason, 500, ctx.traceId);
        return { status: 201, body: result };
      }).catch((err) => {
        if (err instanceof z.ZodError) {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }
        throw err;
      });
    },
  );
}

/** GET /api/v1/ai/noelia/schedules — scoped schedule + run evidence. */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:schedule.manage",
      action: "ai.noelia.schedule.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "NOELIA_SCHEDULE" },
    },
    async (ctx) => {
      const result = await new BeyuNoeliaSchedulerService().list({
        principal: ctx.principal,
      });
      return apiOk(result, ctx.traceId);
    },
  );
}
