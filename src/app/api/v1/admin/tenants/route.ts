import { apiOk, guarded, parseBody } from "@/lib/api";
import { listTenantsInScope, registerTenant } from "@/lib/admin/governance-service";
import { governedRefusal, registerTenantSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/tenants — governed listing of the canonical tenant
 * registry within the principal's resolved tenant scope. The tenant model is
 * the existing `tenants` table; this surface only makes it visible.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:entity.read",
      action: "admin.tenants.read",
      audit: { objectType: "TENANT" },
    },
    async (ctx) => apiOk(await listTenantsInScope(ctx.principal), ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/tenants — governed tenant registration through the
 * canonical organization model: code uniqueness, parent hierarchy (in scope,
 * operational, acyclic by construction), country reference and isolation
 * metadata are validated; audit TENANT_REGISTERED + event append atomically.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:tenant.register",
      action: "admin.tenant.register",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "TENANT" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerTenantSchema);
      try {
        const result = await registerTenant(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
