import { apiOk, guarded, parseBody } from "@/lib/api";
import { updateUser } from "@/lib/admin/governance-service";
import { governedRefusal, updateUserSchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/admin/users/[id] — governed profile update (umbrella
 * capability `identity:user.manage`). Identity-critical fields (email, party,
 * home tenant) are immutable here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "identity:user.manage",
      action: "admin.user.update",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "USER", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, updateUserSchema);
      try {
        await updateUser(ctx.principal, id, body, ctx.traceId);
        return apiOk({ id, updated: true }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
