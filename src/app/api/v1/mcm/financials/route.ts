import { apiOk, guarded } from "@/lib/api";
import { entityFinancialSnapshots, visibleEntities } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/financials?period=YYYY-MM — per-entity financial oversight.
 *
 * Every figure carries its currency, period, source and data state; a source that
 * holds nothing returns UNAVAILABLE with a reason and is never rendered as zero.
 * MCM DOES NOT POST: these are reads of Finance OS, which remains the ledger
 * authority.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:consolidation.read",
      action: "mcm.financials.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      classification: "CONFIDENTIAL",
    },
    async (ctx) => {
      const period = new URL(request.url).searchParams.get("period");
      const entities = await visibleEntities(ctx.principal);
      return apiOk(
        { period, entities: await entityFinancialSnapshots(ctx.principal, entities, period) },
        ctx.traceId,
      );
    },
  );
}
