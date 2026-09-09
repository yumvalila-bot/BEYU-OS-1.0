import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import {
  FAMILY_OFFICE_ERROR_STATUS,
  FamilyOfficeCapitalError,
  createInvestment,
  listInvestments,
} from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

/**
 * Client-controlled inputs only, and money is INTEGER MINOR UNITS.
 *
 * A client supplying `10.50` is refused rather than silently read as ten and a
 * half minor units: §33 forbids floating-point money, and the refusal happens at
 * the boundary so the defect surfaces in the caller, not in a total three
 * screens away.
 */
const CreateInvestmentSchema = z
  .object({
    legalEntityId: z.string().trim().min(1).nullish(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/, "countryCode must be ISO 3166-1 alpha-2"),
    type: z.enum(["REAL_ESTATE", "EQUITY_PRIVATE", "EQUITY_LISTED", "FIXED_INCOME", "FUND_INTEREST", "BUSINESS_ACQUISITION", "AGRICULTURAL", "INTELLECTUAL_PROPERTY", "CASH_EQUIVALENT", "OTHER"]),
    name: z.string().trim().min(1).max(200),
    assetClass: z.string().trim().min(1).max(100),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    acquisitionCostMinor: z.number().int().positive(),
    cashInvestedMinor: z.number().int().positive(),
    acquisitionDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    liquidity: z.enum(["LIQUID", "NEAR_LIQUID", "ILLIQUID"]),
    governanceStatus: z.enum(["IDEA", "SCREENING", "DUE_DILIGENCE", "COMMITTEE_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED", "DEFERRED", "EXECUTED", "MONITORED", "UNDER_REVIEW_FOR_EXIT", "EXITED", "WRITTEN_OFF"]),
    exitStrategy: z.string().trim().max(2000).nullish(),
    legalReviewRef: z.string().trim().max(200).nullish(),
    taxReviewRef: z.string().trim().max(200).nullish(),
    committeeDecisionRef: z.string().trim().max(200).nullish(),
  })
  .strict();

/** Fields a client must never supply — all server-derived or boundary-fixed. */
const SERVER_CONTROLLED = [
  "tenantId",
  "id",
  "realisedGainMinor",
  "currentValueMinor",
  "valuationBasis",
  "authoritativeOwner",
  "financeRecordRef",
  "approved",
  "executed",
] as const;

/**
 * GET /api/v1/family-office/investments
 *
 * Investments inside the caller's tenant scope, each with its measure set, plus
 * the portfolio aggregation and concentration breakdown.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:investment.read",
      action: "family.investment.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INVESTMENT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      const result = await listInvestments(ctx.principal, asOf);
      return apiOk(result, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/family-office/investments
 *
 * Records an investment. Recording is NOT approving: an investment whose
 * governance status is past screening must already reference the committee
 * decision that authorised it, and the engine refuses the write if it does not.
 * No money moves and nothing is posted (§32).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:investment.manage",
      action: "family.investment.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INVESTMENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forged = SERVER_CONTROLLED.find((f) => f in raw);
      if (forged) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forged}' is server-derived and cannot be supplied by the client.`, 422, ctx.traceId);
      }
      const body = CreateInvestmentSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.investment.create", body, async () => {
          const result = await createInvestment(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            {
              legalEntityId: body.legalEntityId ?? null,
              countryCode: body.countryCode,
              type: body.type,
              name: body.name,
              assetClass: body.assetClass,
              currency: body.currency,
              acquisitionCostMinor: body.acquisitionCostMinor,
              cashInvestedMinor: body.cashInvestedMinor,
              acquisitionDate: body.acquisitionDate,
              liquidity: body.liquidity,
              governanceStatus: body.governanceStatus,
              exitStrategy: body.exitStrategy ?? null,
              legalReviewRef: body.legalReviewRef ?? null,
              taxReviewRef: body.taxReviewRef ?? null,
              committeeDecisionRef: body.committeeDecisionRef ?? null,
            },
          );
          return { status: 201, body: result };
        });
      } catch (err) {
        if (err instanceof FamilyOfficeCapitalError) {
          return apiError(err.code, err.message, FAMILY_OFFICE_ERROR_STATUS[err.code], ctx.traceId, { findings: err.findings });
        }
        throw err;
      }
    },
  );
}
