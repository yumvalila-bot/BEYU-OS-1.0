import { apiOk, guarded } from "@/lib/api";
import { getRegistryFamily, listRegistryFamilyMembers } from "@/lib/admin/registry-service";
import { governedRefusal } from "../../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/families/[id] — one canonical family with its
 * member relationships (scope + clearance enforced, fail-closed 404).
 * Read-only presentation of the governed registry.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "family:member.read",
      action: "registry.family.detail",
      audit: { objectType: "FAMILY", objectId: id },
    },
    async (ctx) => {
      try {
        const family = await getRegistryFamily(ctx.principal, id);
        const members = await listRegistryFamilyMembers(ctx.principal, id);
        return apiOk({ family, members: members.items }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
