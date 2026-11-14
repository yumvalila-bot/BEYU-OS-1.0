import { apiOk, guarded } from "@/lib/api";
import { jurisdictionLookup, moduleRollup, visibleEntities } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/modules — enterprise-module coverage per company.
 *
 * A module rollup reports what EXISTS in each canonical module for the visible
 * entities. It never synthesises a module record: procurement, assets, projects,
 * legal, risk, compliance, internal audit, EPM, documents, workflow, treasury and
 * group reporting all keep their own truth and their own authority.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.read",
      action: "mcm.modules.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => {
      const entities = await visibleEntities(ctx.principal);
      const jurisdictions = await jurisdictionLookup(
        entities.map((entity) => entity.jurisdictionId).filter((id): id is string => Boolean(id)),
      );
      return apiOk(
        {
          modules: await moduleRollup(ctx.principal, entities),
          jurisdictions: Object.fromEntries(jurisdictions),
        },
        ctx.traceId,
      );
    },
  );
}
