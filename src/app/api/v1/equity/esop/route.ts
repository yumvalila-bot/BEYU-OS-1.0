import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { esopGrantEvents, esopGrants, esopPlans } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { EQUITY_ERROR_STATUS, EquityError } from "@/lib/equity/errors";
import { EquityModelError } from "@/lib/equity/model";
import {
  activateEsopPlan,
  approveEsopGrant,
  createEsopGrant,
  createEsopPlan,
  exerciseEsopGrant,
  runGrantVestingTo,
} from "@/lib/equity/service";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d+(\.\d{1,6})?$/;
const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"] as const;
const FREQUENCIES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;

const CreatePlanSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  planName: z.string().trim().min(1).max(200),
  jurisdictionCode: z.string().trim().min(2).max(20),
  poolSharesAuthorized: z.number().int().positive(),
  defaultVesting: z
    .object({
      vestingMonths: z.number().int().positive().max(480),
      cliffMonths: z.number().int().nonnegative().max(480),
      frequency: z.enum(FREQUENCIES).optional(),
    })
    .optional(),
  exerciseWindowDays: z.number().int().min(1).max(3650).optional(),
  documentRef: z.string().trim().max(200).nullish(),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

const ActivatePlanSchema = z.object({
  planId: z.string().trim().min(1).max(100),
  approvedByResolutionId: z.string().trim().min(1).max(100),
  legalReviewStatus: z.string().trim().min(1).max(60),
});

const CreateGrantSchema = z.object({
  planId: z.string().trim().min(1).max(100),
  granteePartyId: z.string().trim().min(1).max(100),
  hcmEmployeeRef: z.string().trim().max(100).nullish(),
  shareClassId: z.string().trim().min(1).max(100),
  optionShares: z.number().int().positive(),
  exercisePricePerShare: z.string().trim().regex(DECIMAL),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  grantDate: z.string().trim().regex(ISO_DATE),
  approvalRef: z.string().trim().max(200).nullish(),
  documentRef: z.string().trim().max(200).nullish(),
  taxMetadata: z.record(z.unknown()).optional(),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

const ApproveGrantSchema = z.object({
  grantId: z.string().trim().min(1).max(100),
  approvalRef: z.string().trim().min(1).max(200),
  legalReviewStatus: z.string().trim().max(60).optional(),
  documentRef: z.string().trim().max(200).nullish(),
});

const RunGrantVestingSchema = z.object({
  grantId: z.string().trim().min(1).max(100),
  asOf: z.string().trim().regex(ISO_DATE),
});

const ExerciseGrantSchema = z.object({
  grantId: z.string().trim().min(1).max(100),
  shares: z.number().int().positive(),
  proceedsRef: z.string().trim().max(200).nullish(),
});

/**
 * POST /api/v1/equity/esop
 *
 * ESOP lifecycle (§15): CREATE_PLAN → ACTIVATE_PLAN (legal review + APPROVED
 * resolution) → CREATE_GRANT (pool-bounded) → APPROVE_GRANT (approval evidence
 * required) → RUN_GRANT_VESTING (append-only ledger) → EXERCISE_GRANT (converts
 * vested options into issued shares; proceeds remain a Finance OS reference).
 * HCM stays the employee master (`hcmEmployeeRef`), never duplicated.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "equity:esop.manage",
      action: "equity.esop.manage",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "ESOP_PLAN" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const context = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "CREATE_PLAN": {
            const body = CreatePlanSchema.parse(raw);
            return await withIdempotency(ctx, "equity.esop.create-plan", body, async () => ({
              status: 201,
              body: await createEsopPlan(ctx.principal, body, context),
            }));
          }
          case "ACTIVATE_PLAN": {
            const body = ActivatePlanSchema.parse(raw);
            return await withIdempotency(ctx, "equity.esop.activate-plan", body, async () => ({
              status: 200,
              body: await activateEsopPlan(ctx.principal, body, context),
            }));
          }
          case "CREATE_GRANT": {
            const body = CreateGrantSchema.parse(raw);
            return await withIdempotency(ctx, "equity.esop.create-grant", body, async () => ({
              status: 201,
              body: await createEsopGrant(ctx.principal, body, context),
            }));
          }
          case "APPROVE_GRANT": {
            const body = ApproveGrantSchema.parse(raw);
            return await withIdempotency(ctx, "equity.esop.approve-grant", body, async () => ({
              status: 200,
              body: await approveEsopGrant(ctx.principal, body, context),
            }));
          }
          case "RUN_GRANT_VESTING": {
            const body = RunGrantVestingSchema.parse(raw);
            return await withIdempotency(ctx, "equity.esop.run-grant-vesting", body, async () => ({
              status: 200,
              body: await runGrantVestingTo(ctx.principal, body, context),
            }));
          }
          case "EXERCISE_GRANT": {
            const body = ExerciseGrantSchema.parse(raw);
            return await withIdempotency(ctx, "equity.esop.exercise-grant", body, async () => ({
              status: 200,
              body: await exerciseEsopGrant(ctx.principal, body, context),
            }));
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be one of CREATE_PLAN, ACTIVATE_PLAN, CREATE_GRANT, APPROVE_GRANT, RUN_GRANT_VESTING, EXERCISE_GRANT.",
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

/** GET /api/v1/equity/esop?planId=… — plan, its grants and their ledgers (visibility only). */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "equity:esop.read", action: "equity.esop.read", audit: { objectType: "ESOP_PLAN" } },
    async (ctx) => {
      const planId = new URL(request.url).searchParams.get("planId");
      if (!planId) {
        return apiError("VALIDATION_FAILED", "planId query parameter is required.", 422, ctx.traceId);
      }
      const scope = await tenantScopeIds(ctx.principal);
      const [plan] = await db
        .select()
        .from(esopPlans)
        .where(and(eq(esopPlans.id, planId), inArray(esopPlans.tenantId, scope)))
        .limit(1);
      if (!plan) {
        return apiError("NOT_FOUND", "ESOP plan not found within your authorised scope.", 404, ctx.traceId);
      }
      const grants = await db.select().from(esopGrants).where(eq(esopGrants.planId, plan.id));
      const grantIds = grants.map((g) => g.id);
      const events = grantIds.length
        ? await db.select().from(esopGrantEvents).where(inArray(esopGrantEvents.grantId, grantIds))
        : [];
      return apiOk({ plan, grants, events }, ctx.traceId);
    },
  );
}
