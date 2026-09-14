import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leaverCases } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { EQUITY_ERROR_STATUS, EquityError } from "@/lib/equity/errors";
import { EquityModelError } from "@/lib/equity/model";
import {
  approveLeaverCase,
  classifyLeaverCase,
  executeLeaverCase,
  initiateLeaverCase,
} from "@/lib/equity/service";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"] as const;
const VESTED_TREATMENTS = [
  "RETAIN",
  "REPURCHASE_AT_FMV",
  "REPURCHASE_AT_COST",
  "REPURCHASE_AT_LOWER_OF_COST_AND_FMV",
] as const;
const UNVESTED_TREATMENTS = ["FORFEIT", "VEST_ACCELERATED", "RETAIN_UNVESTED"] as const;
const DECIMAL = /^\d+(\.\d{1,6})?$/;

const InitiateSchema = z.object({
  positionId: z.string().trim().min(1).max(100),
  conditionCode: z.string().trim().min(1).max(80),
  conditionEvidence: z.record(z.unknown()).optional(),
  documentRefs: z.array(z.string().trim().max(200)).max(20).optional(),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

const ClassifySchema = z.object({
  caseId: z.string().trim().min(1).max(100),
  caseType: z.enum(["GOOD_LEAVER", "BAD_LEAVER"]),
  legalReviewStatus: z.string().trim().min(1).max(60),
  treatment: z.object({ vested: z.enum(VESTED_TREATMENTS), unvested: z.enum(UNVESTED_TREATMENTS) }).nullish(),
  costPricePerShare: z.string().trim().regex(DECIMAL).nullish(),
  fmvPricePerShare: z.string().trim().regex(DECIMAL).nullish(),
  valuationBasis: z.string().trim().max(2000).nullish(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).nullish(),
  documentRefs: z.array(z.string().trim().max(200)).max(20).optional(),
});

const ApproveSchema = z.object({
  caseId: z.string().trim().min(1).max(100),
  resolutionRef: z.string().trim().min(1).max(100),
  approvalRef: z.string().trim().max(200).nullish(),
});

const ExecuteSchema = z.object({
  caseId: z.string().trim().min(1).max(100),
});

/**
 * POST /api/v1/equity/leaver
 *
 * Good/bad leaver lifecycle (§10, §11):
 *   INITIATE — open a case against a position (UNDETERMINED; snapshot of
 *              vested/unvested at the event);
 *   CLASSIFY — set GOOD/BAD + treatment AFTER a recorded human legal-review
 *              closure; the deterministic engine refuses arbitrary or
 *              mismatched conditions (no arbitrary forfeiture);
 *   APPROVE  — governance approval via an APPROVED resolution;
 *   EXECUTE  — apply the disposition to the position, the append-only vesting
 *              ledger and the share class. Payment of any repurchase total is
 *              NOT executed: `payment_status` becomes PENDING and Finance OS
 *              remains the money authority (BLOCKED — EXTERNAL for real funds).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "equity:leaver.manage",
      action: "equity.leaver.manage",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "LEAVER_CASE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const context = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "INITIATE": {
            const body = InitiateSchema.parse(raw);
            return await withIdempotency(ctx, "equity.leaver.initiate", body, async () => ({
              status: 201,
              body: await initiateLeaverCase(ctx.principal, body, context),
            }));
          }
          case "CLASSIFY": {
            const body = ClassifySchema.parse(raw);
            return await withIdempotency(ctx, "equity.leaver.classify", body, async () => ({
              status: 200,
              body: await classifyLeaverCase(ctx.principal, body, context),
            }));
          }
          case "APPROVE": {
            const body = ApproveSchema.parse(raw);
            return await withIdempotency(ctx, "equity.leaver.approve", body, async () => ({
              status: 200,
              body: await approveLeaverCase(ctx.principal, body, context),
            }));
          }
          case "EXECUTE": {
            const body = ExecuteSchema.parse(raw);
            return await withIdempotency(ctx, "equity.leaver.execute", body, async () => ({
              status: 200,
              body: await executeLeaverCase(ctx.principal, body, context),
            }));
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be one of INITIATE, CLASSIFY, APPROVE, EXECUTE.",
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

/** GET /api/v1/equity/leaver?caseId=… — read one case (visibility only). */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "equity:leaver.read", action: "equity.leaver.read", audit: { objectType: "LEAVER_CASE" } },
    async (ctx) => {
      const caseId = new URL(request.url).searchParams.get("caseId");
      if (!caseId) {
        return apiError("VALIDATION_FAILED", "caseId query parameter is required.", 422, ctx.traceId);
      }
      const scope = await tenantScopeIds(ctx.principal);
      const [row] = await db
        .select()
        .from(leaverCases)
        .where(and(eq(leaverCases.id, caseId), inArray(leaverCases.tenantId, scope)))
        .limit(1);
      if (!row) {
        return apiError("NOT_FOUND", "Leaver case not found within your authorised scope.", 404, ctx.traceId);
      }
      return apiOk(row, ctx.traceId);
    },
  );
}
