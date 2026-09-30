import { apiOk, guarded, parseBody } from "@/lib/api";
import { listRegistryBusinesses, registerOrgUnit } from "@/lib/admin/registry-service";
import { governedRefusal, registerBusinessSchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/businesses — business / operating units (org
 * units) within the principal's resolved tenant scope. An org unit is neither
 * a legal entity nor a tenant. Read-only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:entity.read",
      action: "registry.business.read",
      audit: { objectType: "ORG_UNIT" },
    },
    async (ctx) => apiOk({ items: await listRegistryBusinesses(ctx.principal) }, ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/registry/businesses — register a business / operating
 * unit (DIVISION | DEPARTMENT | BRANCH | TEAM) under an existing, in-scope
 * legal entity. Uniqueness, parent containment and entity scope validated;
 * one transaction with audit + enterprise event.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:business.register",
      action: "registry.business.register",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "ORG_UNIT" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerBusinessSchema);
      try {
        const result = await registerOrgUnit(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
