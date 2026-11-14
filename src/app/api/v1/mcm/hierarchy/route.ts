import { apiOk, guarded } from "@/lib/api";
import { buildHierarchy, visibleEntities } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/hierarchy — the group structure as a forest.
 *
 * STRUCTURAL ONLY. Nodes are joined by the registry's parent pointer; ownership
 * percentages are never implied by tree position, because a control relationship
 * and an economic interest are different facts with different instruments.
 *
 * Entities whose parent is outside the viewer's scope appear as roots with a
 * `parentOutOfScope` marker — the hierarchy is never silently re-rooted, which
 * would misrepresent the group.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.read",
      action: "mcm.hierarchy.read",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const entities = await visibleEntities(ctx.principal);
      const roots = buildHierarchy(entities);
      return apiOk(
        {
          roots,
          totals: {
            visible: entities.length,
            rootCount: roots.length,
            outOfScopeParents: roots.filter((root) => root.parentOutsideScope).length,
          },
        },
        ctx.traceId,
      );
    },
  );
}
