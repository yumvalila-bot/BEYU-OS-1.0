import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { financialPeriods, legalEntities } from "@/db/schema";
import { apiError, apiOk, guarded } from "@/lib/api";
import { checkPeriodOpen } from "@/lib/finance/contract";
import { tenantScopeIds } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/finance/periods
 * Read accounting periods and check period status for an entity and date.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:ledger.read",
      action: "finance.periods.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FINANCIAL_PERIOD" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const legalEntityId = url.searchParams.get("legalEntityId");
      const probeDate = url.searchParams.get("date");

      const scope = await tenantScopeIds(ctx.principal);

      const entityConditions = [inArray(legalEntities.tenantId, scope)];
      if (legalEntityId) {
        if (ctx.principal.entityScope.length > 0 && !ctx.principal.entityScope.includes(legalEntityId)) {
          return apiError("NOT_FOUND", "Legal entity not found in your scope.", 404, ctx.traceId);
        }
        entityConditions.push(eq(legalEntities.id, legalEntityId));
      } else if (ctx.principal.entityScope.length > 0) {
        entityConditions.push(inArray(legalEntities.id, ctx.principal.entityScope));
      }

      const visibleEntities = await db
        .select({ id: legalEntities.id, code: legalEntities.code, legalName: legalEntities.legalName })
        .from(legalEntities)
        .where(and(...entityConditions));

      const visibleEntityIds = visibleEntities.map((e) => e.id);
      const periods = visibleEntityIds.length > 0
        ? await db
            .select()
            .from(financialPeriods)
            .where(inArray(financialPeriods.legalEntityId, visibleEntityIds))
            .orderBy(desc(financialPeriods.startsOn))
        : [];

      let probeVerdict = null;
      if (legalEntityId && probeDate) {
        probeVerdict = await checkPeriodOpen({
          legalEntityId,
          date: probeDate,
        });
      }

      return apiOk(
        {
          periods,
          probeVerdict,
          total: periods.length,
        },
        ctx.traceId,
      );
    },
  );
}
