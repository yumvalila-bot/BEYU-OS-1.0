import { apiOk, guarded, parseBody } from "@/lib/api";
import { revokeRole } from "@/lib/admin/governance-service";
import { governedRefusal, revokeRoleSchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/roles/[assignmentId] — revoke (end-date) a role
 * assignment under the HIGH-RISK `identity:role.grant` capability. Revocation
 * is effective immediately: the permission set is recomputed from assignments
 * on every request. The last active PLATFORM_ADMIN assignment can never be
 * revoked. Audit ROLE_REVOKED + event, written on the governed admin-DSN
 * boundary in the same transaction as the end-dating.
 */
export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return guarded(
    request,
    {
      permission: "identity:role.grant",
      action: "admin.role.revoke",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "ROLE_ASSIGNMENT", objectId: assignmentId },
    },
    async (ctx) => {
      const body = await parseBody(request, revokeRoleSchema);
      try {
        const result = await revokeRole(ctx.principal, assignmentId, body.reason, ctx.traceId);
        return apiOk({ assignmentId, ...result }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
