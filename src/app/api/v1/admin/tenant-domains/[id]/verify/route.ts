/**
 * `POST /api/v1/admin/tenant-domains/[id]/verify` — prove control of a
 * registered hostname through a REAL DNS TXT lookup against the stored challenge
 * hash. Every non-match, missing record, resolver error and timeout is a
 * refusal (audited as DOMAIN_VERIFICATION_FAILED); verification cannot be
 * asserted by a request, only observed in DNS.
 */
import { apiOk, guarded, parseBody } from "@/lib/api";
import { verifyTenantDomain } from "@/lib/tenant-domain";
import { domainRefusal, verifyDomainSchema } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "organization:tenantdomain.verify",
      action: "admin.tenantdomain.verify",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "TENANT_DOMAIN", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, verifyDomainSchema);
      try {
        const result = await verifyTenantDomain(ctx.principal, id, body.reason, ctx.traceId);
        return apiOk(result, ctx.traceId);
      } catch (err) {
        const refusal = domainRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
