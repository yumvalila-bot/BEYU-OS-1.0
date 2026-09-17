import { apiOk, guarded, parseBody } from "@/lib/api";
import { transitionTenantStatus } from "@/lib/admin/governance-service";
import { governedRefusal, removeSchema } from "../../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/tenants/[id]/remove — governed tenant REMOVAL under the
 * HIGH-RISK `organization:tenant.remove` capability (MFA step-up enforced by
 * the canonical guard). Dependency-checked: live users, sessions, grants,
 * legal entities, child tenants or operational rows BLOCK the removal and are
 * reported; the administrator can resolve them or archive instead. No tenant
 * is ever hard-deleted — removal is a terminal REVOKED status that retains
 * every legal, financial, compliance and audit record.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "organization:tenant.remove",
      action: "admin.tenant.remove",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "TENANT", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, removeSchema);
      try {
        const result = await transitionTenantStatus(ctx.principal, id, "remove", body.reason, ctx.traceId);
        return apiOk({ id, ...result }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
