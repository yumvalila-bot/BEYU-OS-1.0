import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { FAMILY_OFFICE_ERROR_STATUS, FamilyOfficeCapitalError, createCashFlowItem, readCashFlow } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

const CreateItemSchema = z
  .object({
    legalEntityId: z.string().trim().min(1).nullish(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    period: z.string().trim().min(4).max(10),
    direction: z.enum(["INFLOW", "OUTFLOW"]),
    category: z.enum(["BUSINESS_INCOME", "RENTAL_INCOME", "INTEREST", "DIVIDENDS", "ROYALTIES", "AGRICULTURE", "CAPITAL_GAINS", "FINANCING_INFLOW", "CAPITAL_CONTRIBUTION", "OPERATING_COST", "TAX", "DEBT_SERVICE", "CAPEX", "DISTRIBUTION"]),
    amountMinor: z.number().int().nonnegative(),
    basis: z.enum(["POSTED", "OBSERVED", "DERIVED", "FORECAST", "ASSUMPTION", "SCENARIO"]),
    sourceRef: z.string().trim().min(1).max(200),
    recurring: z.boolean(),
    sectorCode: z.string().trim().max(50).nullish(),
  })
  .strict();

/**
 * GET /api/v1/family-office/cash-flow
 *
 * Consolidated family cash flow (§16): operating, free, recurring and
 * discretionary cash flow, debt coverage and the cross-sector breakdown. Items
 * carrying a projection basis are counted and named, so a total that mixes fact
 * and forecast says so.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:cashflow.read", action: "family.cashflow.read", rateLimit: { limit: 100, windowMs: 60_000 }, audit: { objectType: "FAMILY_CASH_FLOW" } },
    async (ctx) => {
      const url = new URL(request.url);
      return apiOk(await readCashFlow(ctx.principal, url.searchParams.get("asOf") ?? todayIso(), url.searchParams.get("period") ?? undefined), ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/family-office/cash-flow
 *
 * Records a cash-flow item. The direction field carries the sign, so the amount
 * is unsigned — a negative amount is refused rather than double-negated.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:cashflow.read", action: "family.cashflow.create", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_CASH_FLOW_ITEM" }, databaseContext: "handler" },
    async (ctx) => {
      const body = CreateItemSchema.parse(await ctx.request.json().catch(() => ({})));
      try {
        return await withIdempotency(ctx, "family.cashflow.create", body, async () => {
          const result = await createCashFlowItem(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            { ...body, legalEntityId: body.legalEntityId ?? null, sectorCode: body.sectorCode ?? null },
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
