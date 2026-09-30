import { apiOk, guarded, parseBody } from "@/lib/api";
import { listRegistryFamilies, registerFamily } from "@/lib/admin/registry-service";
import { governedRefusal, registerFamilySchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/families — canonical Family registry listing
 * within the principal's resolved tenant scope, clearance-filtered
 * (families are HIGHLY_RESTRICTED). Read-only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "family:member.read",
      action: "registry.family.read",
      audit: { objectType: "FAMILY" },
    },
    async (ctx) => apiOk({ items: await listRegistryFamilies(ctx.principal) }, ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/registry/families — register the canonical Family
 * entity: ONE transaction creates the family's MDM identity (parties row,
 * type ORGANIZATION) plus the families domain row. Duplicate codes are
 * controlled refusals. Family ≠ tenant ≠ legal entity.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "family:member.manage",
      action: "registry.family.register",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "FAMILY" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerFamilySchema);
      try {
        const result = await registerFamily(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
