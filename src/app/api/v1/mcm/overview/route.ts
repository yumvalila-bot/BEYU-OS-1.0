import { apiOk, guarded } from "@/lib/api";
import { countryViews, moduleRollup, riskComplianceOverview, visibleEntities } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/overview — the Executive Command Centre payload.
 *
 * ONE authorization decision, ONE scope resolution, then every sub-view is built
 * from the SAME resolved entity set. Composing the command centre from several
 * independently-authorized calls is how a dashboard ends up showing a company the
 * viewer cannot open.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.read",
      action: "mcm.overview.read",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const entities = await visibleEntities(ctx.principal);
      const [countries, risk, modules] = await Promise.all([
        countryViews(entities),
        riskComplianceOverview(ctx.principal, entities),
        moduleRollup(ctx.principal, entities),
      ]);
      return apiOk(
        {
          entities,
          countries,
          risk,
          modules,
          counts: {
            entities: entities.length,
            active: entities.filter((entity) => entity.profile?.mcmLifecycleState === "ACTIVE").length,
            countries: countries.length,
            awaitingVerification: entities.filter(
              (entity) => entity.profile?.verificationState === "PENDING_VERIFICATION",
            ).length,
          },
        },
        ctx.traceId,
      );
    },
  );
}
