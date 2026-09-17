import { apiOk, guarded, parseBody } from "@/lib/api";
import { transitionTenantStatus } from "@/lib/admin/governance-service";
import { governedRefusal, tenantStatusSchema } from "../../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/tenants/[id]/status — governed tenant lifecycle
 * transitions: activate | suspend | deactivate | archive under
 * `organization:tenant.manage`. Removal is a SEPARATE, stricter capability
 * (`organization:tenant.remove`, HIGH-RISK with MFA step-up) exposed at
 * POST /api/v1/admin/tenants/[id]/remove so a delegation of either capability
 * can be exercised without implying the other.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "organization:tenant.manage",
      action: "admin.tenant.status",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "TENANT", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, tenantStatusSchema);
      const action = body.action === "remove" ? "archive" : body.action;
      try {
        const result = await transitionTenantStatus(ctx.principal, id, action, body.reason, ctx.traceId);
        return apiOk({ id, ...result }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
