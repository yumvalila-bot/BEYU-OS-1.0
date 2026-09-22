/**
 * `POST /api/v1/admin/tenant-domains/[id]/status` — governed domain lifecycle:
 * activate | suspend | retire. Activation requires a VERIFIED domain and an
 * ACTIVE tenant; retirement is a terminal STATUS, never a delete.
 */
import { apiOk, guarded, parseBody } from "@/lib/api";
import { transitionTenantDomainStatus } from "@/lib/tenant-domain";
import { domainRefusal, domainStatusSchema } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "organization:tenantdomain.manage",
      action: "admin.tenantdomain.status",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "TENANT_DOMAIN", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, domainStatusSchema);
      try {
        const result = await transitionTenantDomainStatus(ctx.principal, id, body.action, body.reason, ctx.traceId);
        return apiOk(result, ctx.traceId);
      } catch (err) {
        const refusal = domainRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
