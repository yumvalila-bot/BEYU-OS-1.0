import { apiOk, guarded, parseBody } from "@/lib/api";
import { removeUser } from "@/lib/admin/governance-service";
import { governedRefusal, removeSchema } from "../../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/users/[id]/remove — governed user REMOVAL under the
 * HIGH-RISK `identity:user.remove` capability (MFA step-up enforced by the
 * canonical guard). Removal is NEVER a hard delete: identity rows are retained
 * for audit/legal attribution, sessions die immediately, every role assignment
 * is end-dated through the governed admin boundary, and party PII is
 * anonymized under a controlled, audited transformation. Self-removal and
 * removal of the last active PLATFORM_ADMIN are refused.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "identity:user.remove",
      action: "admin.user.remove",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "USER", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, removeSchema);
      try {
        const result = await removeUser(ctx.principal, id, body.reason, ctx.traceId);
        return apiOk({ id, ...result }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
