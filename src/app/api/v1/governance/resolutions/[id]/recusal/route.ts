import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { DeclareRecusalSchema } from "@/lib/governance-vote-contract";
import { declareRecusal } from "@/lib/governance-vote-service";

export const dynamic = "force-dynamic";

/** Restrictive self-declaration; actor and member identity are never client inputs. */
export async function POST(request: Request, params: { params: Promise<{ id: string }> }) {
  const { id } = await params.params;
  return guarded(request, {
    permission: "governance:resolution.vote", action: "governance.resolution.recuse",
    databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60_000 },
    audit: { objectType: "RESOLUTION", objectId: id },
  }, async (ctx) => {
    const body = DeclareRecusalSchema.parse(await ctx.request.json().catch(() => ({})));
    try {
      return await withIdempotency(ctx, `governance.resolutions.${id}.recusal`, body, async () => ({
        status: 201,
        body: await declareRecusal(ctx.principal, { resolutionId: id, reason: body.reason },
          { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent }),
      }));
    } catch (err) {
      if (err instanceof GovernanceError) return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId);
      throw err;
    }
  });
}
