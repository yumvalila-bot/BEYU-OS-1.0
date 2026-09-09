import { apiOk, guarded } from "@/lib/api";
import { listInvestments, listObligations, readCashFlow } from "@/lib/family-office-capital-service";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/dashboard
 *
 * One consolidated read of what the capital and wealth domain actually holds:
 * portfolio, obligations, cash flow and the stored balance-sheet and liquidity
 * snapshots.
 *
 * This endpoint is deliberately read-only over stored data. The computed balance
 * sheet (§15) and liquidity projection (§19) need caller-supplied Finance OS
 * inputs and live behind POST on their own routes — folding them in here would
 * mean inventing the inputs they require.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:capital.read", action: "family.dashboard.read", rateLimit: { limit: 30, windowMs: 60_000 }, audit: { objectType: "FAMILY_DASHBOARD" } },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      const scope = await tenantScopeIds(ctx.principal);

      const [investments, obligations, cashFlow, balanceSheets, liquiditySnapshots] = await Promise.all([
        listInvestments(ctx.principal, asOf),
        listObligations(ctx.principal, asOf),
        readCashFlow(ctx.principal, asOf),
        db.select().from(s.familyBalanceSheetSnapshots).where(inArray(s.familyBalanceSheetSnapshots.tenantId, scope)),
        db.select().from(s.familyLiquiditySnapshots).where(inArray(s.familyLiquiditySnapshots.tenantId, scope)),
      ]);

      return apiOk(
        {
          asOf,
          investments: { total: investments.total, portfolio: investments.portfolio },
          obligations: { total: obligations.total, summary: obligations.summary },
          cashFlow: { total: cashFlow.total, consolidation: cashFlow.consolidation },
          /**
           * The latest stored snapshot per currency, if any. Absent a snapshot the
           * field is an empty array rather than a zeroed balance sheet: "never
           * measured" and "measured at zero" are different statements.
           */
          balanceSheetSnapshots: balanceSheets,
          liquiditySnapshots,
          /**
           * Cross-currency totals are deliberately absent. Aggregating USD and NGN
           * without a ratified FX rate produces a number that looks like a total
           * and is not one (§15). Every figure above is per currency by
           * construction.
           */
          crossCurrencyAggregation: "NOT_PERFORMED",
          /** Finance OS owns the ledger. Nothing in this payload is an accounting entry (§32). */
          authoritativeAccountingOwner: "FINANCE_OS",
        },
        ctx.traceId,
      );
    },
  );
}
