import { apiError, apiOk, guarded } from "@/lib/api";
import { readLifecycleHistory } from "@/lib/contracts/service";
import { contractApiError } from "../_common";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contracts/lifecycle?contractId=…
 *
 * The append-only lifecycle ledger for one contract, oldest first: every action,
 * its actor, whether the actor was an AI/service principal, and the evidence or
 * resolution the transition was justified by. This route is read-only by design —
 * transitions belong to `POST /api/v1/contracts` (TRANSITION), where the engine
 * decides legality and the audit chain records it.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:read",
      action: "contracts.lifecycle.read",
      audit: { objectType: "CONTRACT_LIFECYCLE_EVENT" },
    },
    async (ctx) => {
      const contractId = new URL(request.url).searchParams.get("contractId");
      if (!contractId) return apiError("VALIDATION_FAILED", "contractId is required.", 422, ctx.traceId);
      try {
        const items = await readLifecycleHistory(ctx.principal, contractId);
        return apiOk({ contractId, items }, ctx.traceId);
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}
