import { apiOk, guarded } from "@/lib/api";
import { buildRegistryGraph } from "@/lib/admin/registry-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/graph — read-only projection of the canonical
 * relationship graph (party ↔ family ↔ legal entity ↔ tenant ↔ org unit,
 * ownership, employment, membership, the GlobalUserID link). Each edge family
 * is gated inside the service by its own permission — the graph never grants
 * what the underlying permission would deny, and never fabricates a User or
 * Employment edge that does not exist. Presentation only; never authorization.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:entity.read",
      action: "registry.graph.read",
      audit: { objectType: "REGISTRY_GRAPH" },
    },
    async (ctx) => apiOk(await buildRegistryGraph(ctx.principal), ctx.traceId),
  );
}
