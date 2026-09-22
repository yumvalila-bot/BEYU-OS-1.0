/**
 * `/api/v1/admin/tenant-domains` — governed tenant-domain registry surface.
 *
 * GET  — listing of the hostname → tenant bindings INSIDE the principal's
 *        resolved tenant scope (RLS is the final boundary; this surface cannot
 *        see beyond it).
 * POST — registration of a hostname for an EXISTING operational tenant.
 *
 * Registration creates NO tenant, grants NO access and makes NO name resolve:
 * the row starts CREATED + UNVERIFIED with a challenge, and reachability requires
 * proven DNS ownership plus a separate audited activation. Both routes run
 * through the canonical `guarded()` boundary, so authentication, `can()`,
 * classification floor, rate limiting and denial auditing are the same as every
 * other capability surface.
 */
import { apiOk, guarded, parseBody } from "@/lib/api";
import { listDomainsInScope, registerTenantDomain } from "@/lib/tenant-domain";
import { domainRefusal, registerDomainSchema } from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:tenantdomain.read",
      action: "admin.tenantdomains.read",
      audit: { objectType: "TENANT_DOMAIN" },
    },
    async (ctx) => apiOk(await listDomainsInScope(ctx.principal), ctx.traceId),
  );
}

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:tenantdomain.register",
      action: "admin.tenantdomain.register",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "TENANT_DOMAIN" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerDomainSchema);
      try {
        const result = await registerTenantDomain(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = domainRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
