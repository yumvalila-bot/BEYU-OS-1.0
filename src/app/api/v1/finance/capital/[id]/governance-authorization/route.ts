import { z } from "zod";
import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { authorizeCapitalRequestGovernance } from "@/lib/capital-governance-service";

export const dynamic = "force-dynamic";

/**
 * Client-controlled inputs only.
 *
 * Everything governance-related is DERIVED: the resolution, its status, the
 * authorization decision and the resulting capital status all come from server
 * state. `.strict()` makes a forged field fail loudly instead of being ignored.
 */
const AuthorizeSchema = z
  .object({
    note: z.string().trim().max(2000).nullish(),
  })
  .strict();

/** Fields a client must never supply — all are server-derived. */
const SERVER_CONTROLLED_FIELDS = [
  "status",
  "authorized",
  "governanceAuthorized",
  "approved",
  "resolutionId",
  "resolutionStatus",
  "decision",
  "decidedAt",
  "decidedBy",
  "provenance",
  "tenantId",
  "legalEntityId",
  "amount",
  "executed",
] as const;

/**
 * POST /api/v1/finance/capital/:id/governance-authorization
 *
 * Records that a capital request has satisfied its GOVERNANCE PREREQUISITE,
 * transitioning it to `GOVERNANCE_AUTHORIZED`.
 *
 * THIS IS NOT EXECUTION. No money moves, no journal entry is posted, no ledger
 * record is written, no treasury instruction is issued and no external system
 * is called. Governance authorization and capital execution are different
 * authorities; this endpoint only establishes the former.
 *
 * The governance decision is never supplied by the caller: it is resolved
 * server-side through the canonical governance authorization service.
 */
export async function POST(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;

  return guarded(
    request,
    {
      permission: "finance:capital.manage",
      action: "finance.capital.governance_authorize",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "CAPITAL_REQUEST", objectId: id },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;

      const forged = SERVER_CONTROLLED_FIELDS.find((field) => field in raw);
      if (forged) {
        return apiError(
          "SERVER_CONTROLLED_FIELD",
          `'${forged}' is derived from governance state and cannot be supplied by the client.`,
          422,
          ctx.traceId,
        );
      }

      const body = AuthorizeSchema.parse(raw);

      try {
        return await withIdempotency(
          ctx,
          `finance.capital.${id}.governance-authorization`,
          body,
          async () => {
            const result = await authorizeCapitalRequestGovernance(
              ctx.principal,
              { capitalRequestId: id, note: body.note ?? null },
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
