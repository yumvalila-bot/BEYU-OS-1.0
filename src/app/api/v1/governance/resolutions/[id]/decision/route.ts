import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { decideResolutionClosure } from "@/lib/governance-vote-service";
import {
  DecideResolutionSchema,
  findDecisionServerControlledField,
} from "@/lib/governance-vote-contract";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/governance/resolutions/:id/decision
 *
 * The third canonical governed transaction: closes a resolution and records the
 * constitutional decision.
 *
 * The caller does NOT choose the outcome. The server recomputes it inside the
 * transaction from the authoritative ballot set, so no combination of API
 * access, governance role or crafted request body can manufacture an APPROVED
 * resolution. This endpoint deliberately exposes no generic status mutation.
 */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;

  return guarded(
    request,
    {
      // Decision authority is verified independently of voting authority: the
      // vote capability grants nothing here.
      permission: "governance:resolution.approve",
      action: "governance.resolution.decide",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "RESOLUTION", objectId: id },
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;

      const forged = findDecisionServerControlledField(raw);
      if (forged) {
        return apiError(
          "SERVER_CONTROLLED_FIELD",
          `'${forged}' is computed by the server from the authoritative ballots and cannot be supplied by the client.`,
          422,
          ctx.traceId,
        );
      }

      const body = DecideResolutionSchema.parse(raw);

      try {
        return await withIdempotency(
          ctx,
          `governance.resolutions.${id}.decision`,
          body,
          async () => {
            const result = await decideResolutionClosure(
              ctx.principal,
              { resolutionId: id, decisionNote: body.decisionNote ?? null },
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
