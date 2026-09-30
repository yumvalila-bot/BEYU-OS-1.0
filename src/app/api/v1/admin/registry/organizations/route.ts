import { apiOk, guarded } from "@/lib/api";
import { can } from "@/lib/authz";
import { listRegistryEntities, listRegistryFamilies, listRegistryOwnership } from "@/lib/admin/registry-service";
import { listWorkforce } from "@/lib/hcm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/organizations — the organization overview that
 * relates companies to families: canonical legal entities, canonical families
 * and the ownership records that connect them, all within the principal's
 * resolved tenant scope. The optional `scope` parameter is a PRESENTATION
 * filter only (e.g. `scope=groups` → group-level/top holdings); it is never an
 * authorization input — scope is always resolved from the principal.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:entity.read",
      action: "registry.organizations.read",
      audit: { objectType: "REGISTRY_ORGANIZATIONS" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const scope = url.searchParams.get("scope") ?? undefined;
      const ownedEntityId = url.searchParams.get("ownedEntityId") ?? undefined;

      let entities = await listRegistryEntities(ctx.principal);
      if (scope === "groups") {
        // Group-level view: top-level holdings (no parent) — presentation only.
        entities = entities.filter(
          (e) => !e.parentEntityId && ["HOLDING", "COUNTRY_HOLDING", "TRUST", "FOUNDATION"].includes(String(e.entityType)),
        );
      }
      const families = await listRegistryFamilies(ctx.principal);
      const ownership = await listRegistryOwnership(ctx.principal, ownedEntityId ?? undefined);
      // Employment overview is gated on the SAME HCM read capability the
      // dedicated employment route requires — the overview never widens reach.
      const employment = can(ctx.principal, "hcm:employee.read").allowed
        ? (await listWorkforce(ctx.principal)).records
        : [];
      return apiOk({ entities, families, ownership, employment }, ctx.traceId);
    },
  );
}
