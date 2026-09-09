import { z } from "zod";
import { apiOk, guarded } from "@/lib/api";
import { buildDebtBook } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

/**
 * The financial inputs the debt book needs and the Family Office does not own.
 *
 * NOI, EBIT, equity, total assets and revenue are Finance OS and sector OS
 * figures. They are supplied by the caller with a source reference rather than
 * invented here, because a debt measure computed from an invented denominator is
 * worse than no measure at all: it looks like a number somebody checked.
 */
const FinancialsSchema = z
  .object({
    asOf: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    noiMinor: z.number().int(),
    ebitMinor: z.number().int(),
    equityMinor: z.number().int(),
    totalAssetsMinor: z.number().int().positive(),
    revenueMinor: z.number().int().nonnegative(),
    revenueToNoiBps: z.number().int().min(0).max(10000),
    /** Source of the financials. Required: an unsourced denominator is unverifiable. */
    sourceRef: z.string().trim().min(1).max(200),
  })
  .strict();

/**
 * POST /api/v1/family-office/debt
 *
 * The debt engine (§14): LTV, DSCR, interest coverage, debt/equity, debt/asset,
 * maturity concentration, refinancing, currency and fixed/floating exposure, plus
 * the full stress grid (revenue −10/−20/−30/−40%, interest +1/+3/+5pp, asset
 * value −10/−20/−30%).
 *
 * POST rather than GET because the caller supplies the financial denominators.
 * Every stressed figure is SCENARIO and is labelled as such on the way out.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:risk.read", action: "family.debt.measure", rateLimit: { limit: 40, windowMs: 60_000 }, audit: { objectType: "FAMILY_DEBT" } },
    async (ctx) => {
      const body = FinancialsSchema.parse(await ctx.request.json().catch(() => ({})));
      const result = await buildDebtBook(ctx.principal, body.asOf ?? todayIso(), {
        noiMinor: body.noiMinor,
        ebitMinor: body.ebitMinor,
        equityMinor: body.equityMinor,
        totalAssetsMinor: body.totalAssetsMinor,
        revenueMinor: body.revenueMinor,
        revenueToNoiBps: body.revenueToNoiBps,
      });
      return apiOk({ ...result, financialsSourceRef: body.sourceRef }, ctx.traceId);
    },
  );
}
