import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { tableResolution } from "@/lib/governance-vote-service";
import { TableResolutionSchema, findVoteServerControlledField } from "@/lib/governance-vote-contract";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/governance/resolutions/:id/table
 *
 * Transitions DRAFT → TABLED and opens the voting window.
 *
 * Tabling is a governed action distinct from proposing: creating a proposal does
 * not table it, and being the proposer grants no tabling authority. Only the
 * presiding officer of the owning body (CHAIR or SECRETARY, from
 * `governance_members.seat_role`) may table.
 */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;

  return guarded(
    request,
    {
      permission: "governance:resolution.approve",
      action: "governance.resolution.table",
      rateLimit: { limit: 20, windowMs: 60_000 },
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

      const body = TableResolutionSchema.parse(raw);

      try {
        return await withIdempotency(
          ctx,
          `governance.resolutions.${id}.table`,
          body,
          async () => {
            const result = await tableResolution(
              ctx.principal,
              {
                resolutionId: id,
                votingClosesAt: body.votingClosesAt ? new Date(body.votingClosesAt) : null,
              },
              { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            );
            return { status: 200, body: result };
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
