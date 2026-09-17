import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { revokeDelegation } from "@/lib/admin/delegation";
import { governedRefusal, revokeDelegationSchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/delegations/[id] — revoke a delegation instrument under
 * the HIGH-RISK `identity:delegation.manage` capability. Revocation is
 * IMMEDIATE: delegated permissions are resolved per request, so the next
 * request of the delegatee already sees zero authority from this instrument.
 * Audit ADMIN_DELEGATION_REVOKED + event atomically.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "identity:delegation.manage",
      action: "admin.delegation.revoke",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "ADMIN_DELEGATION", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, revokeDelegationSchema);
      try {
        const result = await revokeDelegation(ctx.principal, id, body.reason, ctx.traceId);
        if (!result.ok) {
          const status = result.code === "NOT_FOUND" ? 404 : 409;
          return apiError(result.code, result.message, status, ctx.traceId);
        }
        return apiOk({ id, status: result.delegation.status }, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
