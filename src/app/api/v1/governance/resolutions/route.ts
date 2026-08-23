import { apiError, guarded, withIdempotency } from "@/lib/api";
import {
  ProposeResolutionSchema,
  findServerControlledField,
} from "@/lib/governance-contract";
import {
  GovernanceError,
  GOVERNANCE_ERROR_STATUS,
  NON_PROPOSABLE_STATUSES,
  proposeResolution,
} from "@/lib/governance";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/governance/resolutions
 *
 * The canonical BEYU OS governed mutation. Creates a REAL resolution record in
 * the initial lifecycle state, with its audit entry and domain event written in
 * the same database transaction.
 *
 * A resolution can never be created in a decided state through this endpoint;
 * voting and approval are separate governed mutations.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "governance:resolution.propose",
      action: "governance.resolution.propose",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "RESOLUTION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      // Read the payload once so server-controlled fields can be rejected
      // explicitly before schema validation. `.strict()` would already reject
      // them, but an explicit, named error makes the lifecycle and actor/tenant
      // invariants self-documenting and regression-proof.
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;

      if (
        typeof raw.status === "string" &&
        (NON_PROPOSABLE_STATUSES as readonly string[]).includes(raw.status)
      ) {
        return apiError(
          "STATUS_NOT_PROPOSABLE",
          "A proposal enters the lifecycle in its initial state; a decided status cannot be requested.",
          422,
          ctx.traceId,
        );
      }
      const forged = findServerControlledField(raw);
      if (forged) {
        return apiError(
          "SERVER_CONTROLLED_FIELD",
          `'${forged}' is derived from the authenticated context and cannot be supplied by the client.`,
          422,
          ctx.traceId,
        );
      }

      const body = ProposeResolutionSchema.parse(raw);

      try {
        // Idempotency is scoped to (tenant, actor, endpoint) and pinned to the
        // payload hash, so a replay returns the original 201 without creating a
        // second resolution, and a different payload under the same key is a
        // conflict rather than a silently wrong answer.
        return await withIdempotency(ctx, "governance.resolutions.propose", body, async () => {
          const result = await proposeResolution(ctx.principal, body, {
            traceId: ctx.traceId,
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
          });
          return { status: 201, body: result };
        });
      } catch (err) {
        if (err instanceof GovernanceError) {
          // Domain-safe messages only; no SQL, driver or schema detail is exposed.
          return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        throw err; // handled by guarded(): logged server-side, generic 500 to caller
      }
    },
  );
}
