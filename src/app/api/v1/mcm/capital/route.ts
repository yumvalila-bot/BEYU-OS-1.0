import { apiOk, guarded, parseBody } from "@/lib/api";
import { decideCapitalAllocation, proposeCapitalAllocation } from "@/lib/mcm/services";
import { capitalDecisionSchema, capitalProposalSchema, mcmRefusal } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/capital — propose a group capital allocation.
 *
 * A PROPOSAL only. MCM cannot approve capital, and neither can NOELIA: the
 * approving verb below requires a named governance body and the resolution that
 * decided it.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:capital.propose",
      action: "mcm.capital.propose",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "MCM_CAPITAL_ALLOCATION" },
    },
    async (ctx) => {
      const body = await parseBody(request, capitalProposalSchema);
      try {
        return apiOk(await proposeCapitalAllocation(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * PATCH /api/v1/mcm/capital?id=… — record the governance decision.
 *
 * `mcm:capital.approve` is held by the CFO and the Chief Governance Officer and
 * is HIGH_RISK, so it can never be delegated to a service account or an
 * administrative role.
 */
export async function PATCH(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:capital.approve",
      action: "mcm.capital.decide",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "MCM_CAPITAL_ALLOCATION" },
    },
    async (ctx) => {
      const body = await parseBody(request, capitalDecisionSchema);
      const id = new URL(request.url).searchParams.get("id");
      try {
        if (!id) {
          const { McmError } = await import("@/lib/mcm/model");
          throw new McmError("QUERY_PARAMETER_REQUIRED", 'The query parameter "id" is required.', 422);
        }
        return apiOk(
          await decideCapitalAllocation(ctx.principal, { allocationId: id, ...body }, ctx.traceId),
          ctx.traceId,
        );
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
