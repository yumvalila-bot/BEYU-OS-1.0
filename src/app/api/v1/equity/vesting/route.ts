import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vestingEvents, vestingSchedules } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { EQUITY_ERROR_STATUS, EquityError } from "@/lib/equity/errors";
import { EquityModelError } from "@/lib/equity/model";
import {
  activateVestingSchedule,
  applyAcceleration,
  confirmChangeOfControl,
  declareChangeOfControl,
  runVestingTo,
} from "@/lib/equity/service";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"] as const;

const ActivateSchema = z.object({
  scheduleId: z.string().trim().min(1).max(100),
  approvedByResolutionId: z.string().trim().min(1).max(100),
  legalReviewStatus: z.string().trim().min(1).max(60),
  documentRef: z.string().trim().max(200).nullish(),
});

const RunSchema = z.object({
  scheduleId: z.string().trim().min(1).max(100),
  asOf: z.string().trim().regex(ISO_DATE),
});

const DeclareCocSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  eventType: z.enum(["CHANGE_OF_CONTROL", "QUALIFYING_TERMINATION"]),
  description: z.string().trim().min(1).max(2000),
  occurredOn: z.string().trim().regex(ISO_DATE),
  linkedEventId: z.string().trim().max(100).nullish(),
  affectedPartyId: z.string().trim().max(100).nullish(),
  resolutionRef: z.string().trim().max(100).nullish(),
  documentRef: z.string().trim().max(200).nullish(),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

const ConfirmCocSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  legalReviewStatus: z.string().trim().min(1).max(60),
  resolutionRef: z.string().trim().min(1).max(100),
});

const AccelerateSchema = z.object({
  scheduleId: z.string().trim().min(1).max(100),
  changeOfControlId: z.string().trim().min(1).max(100),
  qualifyingTerminationId: z.string().trim().max(100).nullish(),
});

/**
 * POST /api/v1/equity/vesting
 *
 * Governed vesting and change-of-control operations (§9, §12):
 *   ACTIVATE_SCHEDULE     — DRAFT → ACTIVE (APPROVED resolution + human
 *                           legal-review closure required);
 *   RUN_VESTING           — append immutable milestone ledger entries up to a
 *                           date (idempotent, deterministic);
 *   DECLARE_COC           — declare a Change of Control or Qualifying
 *                           Termination (DECLARED; acceleration-eligible only
 *                           after CONFIRM);
 *   CONFIRM_COC           — DECLARED → CONFIRMED (legal review + resolution);
 *   APPLY_ACCELERATION    — apply the schedule's acceleration policy (double
 *                           trigger by default) to confirmed triggers.
 *
 * The pure engine computes every number; this endpoint is the only write path
 * and it fails closed on any missing prerequisite.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "equity:vesting.manage",
      action: "equity.vesting.manage",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VESTING_SCHEDULE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const context = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "ACTIVATE_SCHEDULE": {
            const body = ActivateSchema.parse(raw);
            return await withIdempotency(ctx, "equity.vesting.activate", body, async () => ({
              status: 200,
              body: await activateVestingSchedule(ctx.principal, body, context),
            }));
          }
          case "RUN_VESTING": {
            const body = RunSchema.parse(raw);
            return await withIdempotency(ctx, "equity.vesting.run", body, async () => ({
              status: 200,
              body: await runVestingTo(ctx.principal, body, context),
            }));
          }
          case "DECLARE_COC": {
            const body = DeclareCocSchema.parse(raw);
            return await withIdempotency(ctx, "equity.vesting.declare-coc", body, async () => ({
              status: 201,
              body: await declareChangeOfControl(ctx.principal, body, context),
            }));
          }
          case "CONFIRM_COC": {
            const body = ConfirmCocSchema.parse(raw);
            return await withIdempotency(ctx, "equity.vesting.confirm-coc", body, async () => ({
              status: 200,
              body: await confirmChangeOfControl(ctx.principal, body, context),
            }));
          }
          case "APPLY_ACCELERATION": {
            const body = AccelerateSchema.parse(raw);
            return await withIdempotency(ctx, "equity.vesting.apply-acceleration", body, async () => ({
              status: 200,
              body: await applyAcceleration(ctx.principal, body, context),
            }));
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be one of ACTIVATE_SCHEDULE, RUN_VESTING, DECLARE_COC, CONFIRM_COC, APPLY_ACCELERATION.",
              422,
              ctx.traceId,
            );
        }
      } catch (err) {
        if (err instanceof EquityError) {
          return apiError(err.code, err.message, EQUITY_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        if (err instanceof EquityModelError) {
          return apiError("MODEL_ERROR", err.message, 422, ctx.traceId, { code: err.code });
        }
        throw err;
      }
    },
  );
}

/** GET /api/v1/equity/vesting?scheduleId=… — read one schedule with its ledger (visibility only). */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "equity:vesting.read", action: "equity.vesting.read", audit: { objectType: "VESTING_SCHEDULE" } },
    async (ctx) => {
      const scheduleId = new URL(request.url).searchParams.get("scheduleId");
      if (!scheduleId) {
        return apiError("VALIDATION_FAILED", "scheduleId query parameter is required.", 422, ctx.traceId);
      }
      const scope = await tenantScopeIds(ctx.principal);
      const [schedule] = await db
        .select()
        .from(vestingSchedules)
        .where(and(eq(vestingSchedules.id, scheduleId), inArray(vestingSchedules.tenantId, scope)))
        .limit(1);
      if (!schedule) {
        // Non-enumerating: out-of-scope is indistinguishable from nonexistent.
        return apiError("NOT_FOUND", "Vesting schedule not found within your authorised scope.", 404, ctx.traceId);
      }
      const ledger = await db
        .select()
        .from(vestingEvents)
        .where(eq(vestingEvents.scheduleId, schedule.id));
      return apiOk({ schedule, ledger }, ctx.traceId);
    },
  );
}
