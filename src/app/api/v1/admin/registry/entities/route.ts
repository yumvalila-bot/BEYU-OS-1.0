import { apiOk, guarded, parseBody } from "@/lib/api";
import { listRegistryEntities, registerLegalEntity } from "@/lib/admin/registry-service";
import { governedRefusal, registerEntitySchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/entities — canonical legal-entity listing
 * within the principal's resolved tenant scope (clearance-filtered).
 * TENANT ≠ LEGAL ENTITY ≠ BUSINESS. Read-only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:entity.read",
      action: "registry.entity.read",
      audit: { objectType: "LEGAL_ENTITY" },
    },
    async (ctx) => apiOk({ items: await listRegistryEntities(ctx.principal) }, ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/registry/entities — register a canonical legal entity
 * (company/trust/foundation/partnership/branch …) through the governed
 * registry: code + registration-number uniqueness, country/jurisdiction
 * references, parent hierarchy and scope all validated before one atomic
 * transaction with audit + enterprise event.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:entity.manage",
      action: "registry.entity.register",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "LEGAL_ENTITY" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerEntitySchema);
      try {
        const result = await registerLegalEntity(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
