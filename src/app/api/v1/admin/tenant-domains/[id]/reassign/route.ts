/**
 * `POST /api/v1/admin/tenant-domains/[id]/reassign` — move a hostname to another
 * in-scope tenant. HIGH-RISK (MFA step-up through the canonical guard), refused
 * while the domain is ACTIVE, and always returned to CREATED + UNVERIFIED with a
 * fresh DNS challenge so the new binding must prove ownership again.
 */
import { apiOk, guarded, parseBody } from "@/lib/api";
import { reassignTenantDomain } from "@/lib/tenant-domain";
import { domainRefusal, reassignDomainSchema } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "organization:tenantdomain.reassign",
      action: "admin.tenantdomain.reassign",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "TENANT_DOMAIN", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, reassignDomainSchema);
      try {
        const result = await reassignTenantDomain(ctx.principal, id, body.tenantId, body.reason, ctx.traceId);
        return apiOk(result, ctx.traceId);
      } catch (err) {
        const refusal = domainRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
