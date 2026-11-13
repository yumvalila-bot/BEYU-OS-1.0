import { apiOk, guarded } from "@/lib/api";
import { consolidationOverview, intercompanyOverview, visibleEntities } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/consolidation — consolidation runs and the intercompany
 * position, both status-only.
 *
 * A consolidation run is a governed computation with a preparer and an
 * independent reviewer; the database refuses a run whose reviewer equals its
 * preparer. MCM never auto-posts an elimination into Finance OS.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:consolidation.read",
      action: "mcm.consolidation.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      classification: "RESTRICTED",
    },
    async (ctx) => {
      const entities = await visibleEntities(ctx.principal);
      const [consolidation, intercompany] = await Promise.all([
        consolidationOverview(ctx.principal),
        intercompanyOverview(ctx.principal, entities),
      ]);
      return apiOk({ consolidation, intercompany }, ctx.traceId);
    },
  );
}
