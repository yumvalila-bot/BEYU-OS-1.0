import { apiOk, guarded, parseBody } from "@/lib/api";
import { transitionUserStatus } from "@/lib/admin/governance-service";
import { governedRefusal, userStatusSchema } from "../../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/users/[id]/status — governed lifecycle transition
 * (activate | suspend | deactivate). Every transition validates the state
 * machine, revokes live sessions when moving away from ACTIVE, blocks
 * self-action and the last-PLATFORM_ADMIN lockout, and appends the canonical
 * audit event (USER_ACTIVATED / USER_SUSPENDED / USER_DEACTIVATED).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "identity:user.suspend",
      action: "admin.user.status",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "USER", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, userStatusSchema);
      try {
        const result = await transitionUserStatus(ctx.principal, id, body.action, body.reason, ctx.traceId);
        return apiOk({ id, ...result }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
