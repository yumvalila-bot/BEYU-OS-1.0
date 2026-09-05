import { apiError, apiOk, guarded } from "@/lib/api";
import {
  reconcileTreasuryToLedger,
  scanDataQuality,
  summarizeDataQuality,
} from "@/lib/finance/reconciliation";
import { tenantScopeIds } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/finance/reconciliation
 * Governed reconciliation between treasury observations and the general ledger.
 * Adheres to strict Finance OS principles:
 * 1. Zero silent plugs / adjustments (differences are reported, never silently forced to match).
 * 2. An empty source is DATA_NOT_AVAILABLE, never a false-positive agreement.
 * 3. Scans live data quality defects across financial tables.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:treasury.read",
      action: "finance.reconciliation.read",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "FINANCE_RECONCILIATION" },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      if (!scope.includes(ctx.principal.tenantId)) {
        return apiError("FORBIDDEN", "Tenant scope violation.", 403, ctx.traceId);
      }

      const reconciliation = await reconcileTreasuryToLedger(ctx.principal.tenantId);
      const dataQualityFindings = await scanDataQuality();
      const qualitySummary = summarizeDataQuality(dataQualityFindings);

      return apiOk(
        {
          reconciliation,
          dataQuality: {
            summary: qualitySummary,
            findings: dataQualityFindings,
          },
        },
        ctx.traceId,
      );
    },
  );
}
