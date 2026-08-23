import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { castVote } from "@/lib/governance-vote-service";
import { CastVoteSchema, findVoteServerControlledField } from "@/lib/governance-vote-contract";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/governance/resolutions/:id/votes
 *
 * The second canonical BEYU OS governed mutation. Records a REAL ballot with its
 * audit entry, domain event and any resulting status transition in one
 * transaction.
 *
 * Two authorisation layers must both pass: the `governance:resolution.vote`
 * capability (RBAC/ABAC/classification/policy) AND an active voting seat on the
 * body that owns the resolution. The permission alone is never sufficient.
 *
 * The endpoint cannot set a final status directly: APPROVED / REJECTED /
 * DEADLOCKED are computed from the eligible ballots under the body's configured
 * majority rule.
 */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;

  return guarded(
    request,
    {
      permission: "governance:resolution.vote",
      action: "governance.resolution.vote",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "RESOLUTION", objectId: id },
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;

      const forged = findVoteServerControlledField(raw);
      if (forged) {
        return apiError(
          "SERVER_CONTROLLED_FIELD",
          `'${forged}' is derived from the authenticated context and cannot be supplied by the client.`,
          422,
          ctx.traceId,
        );
      }

      const body = CastVoteSchema.parse(raw);

      try {
        // Idempotency is scoped to (tenant, actor, endpoint) and pinned to the
        // payload hash, so a retried ballot replays instead of double-voting.
        return await withIdempotency(
          ctx,
          `governance.resolutions.${id}.votes`,
          body,
          async () => {
            const result = await castVote(
              ctx.principal,
              { resolutionId: id, vote: body.vote, comment: body.comment ?? null },
              { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            );
            return { status: result.changed ? 200 : 201, body: result };
          },
        );
      } catch (err) {
        if (err instanceof GovernanceError) {
          return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        throw err;
      }
    },
  );
}
