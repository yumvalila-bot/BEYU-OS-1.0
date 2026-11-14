import { apiOk, guarded } from "@/lib/api";
import { governanceOverview, ownershipOverview, visibleEntities } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/governance — boards, committees, trustees, resolutions and
 * the ownership overview, restricted to entities the viewer may see.
 *
 * Governance bodies and resolutions are READ from their canonical tables (the
 * governance domain owns them). MCM presents them per company; it never creates
 * an appointment or a resolution, because those carry their own authority chain.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.read",
      action: "mcm.governance.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => {
      const entities = await visibleEntities(ctx.principal);
      const [governance, ownership] = await Promise.all([
        governanceOverview(ctx.principal, entities),
        ownershipOverview(ctx.principal, entities),
      ]);
      return apiOk({ governance, ownership }, ctx.traceId);
    },
  );
}
