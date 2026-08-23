import { apiOk, apiError, guarded } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import {
  GOVERNED_OBJECT_TYPES,
  getGovernanceDecisionAuthorization,
  type GovernedObjectType,
} from "@/lib/governance-authorization";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/governance/authorization?objectType=...&objectId=...
 *
 * READ-ONLY. Answers whether a governed object is authorised by an APPROVED
 * BEYU OS resolution, and on whose authority.
 *
 * This is the first downstream consumer of the governance decision. It mutates
 * nothing: no capital moves, no journal is posted, no workflow is triggered. It
 * is an ADDITIONAL governance prerequisite that a future execution path would
 * check IN ADDITION TO its own security authorization — never instead of it.
 *
 * Tenant isolation is non-enumerating: an out-of-scope object and a non-existent
 * object return the same 404.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      // Reading a governance decision requires the governance read capability.
      permission: "governance:resolution.read",
      action: "governance.authorization.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "RESOLUTION" },
    },
    async (ctx) => {
      const url = new URL(ctx.request.url);
      const objectType = url.searchParams.get("objectType");
      const objectId = url.searchParams.get("objectId");

      if (!objectType || !objectId) {
        return apiError(
          "VALIDATION_FAILED",
          "objectType and objectId are required.",
          422,
          ctx.traceId,
        );
      }
      if (!(GOVERNED_OBJECT_TYPES as readonly string[]).includes(objectType)) {
        return apiError(
          "VALIDATION_FAILED",
          `objectType must be one of: ${GOVERNED_OBJECT_TYPES.join(", ")}.`,
          422,
          ctx.traceId,
        );
      }

      try {
        const result = await getGovernanceDecisionAuthorization(
          ctx.principal,
          objectType as GovernedObjectType,
          objectId,
        );
        return apiOk(result, ctx.traceId);
      } catch (err) {
        if (err instanceof GovernanceError) {
          return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        throw err;
      }
    },
  );
}
