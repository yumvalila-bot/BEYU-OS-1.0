import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { listDelegationInstruments } from "@/lib/admin/governance-service";
import { createDelegation, type DelegationDecision } from "@/lib/admin/delegation";
import { governedRefusal, createDelegationSchema } from "../_shared";

export const dynamic = "force-dynamic";

/** Governed refusals that are authority violations map to 403; the rest are conflicts. */
const DELEGATION_REFUSAL_STATUS: Partial<Record<DelegationDecision, number>> = {
  SELF_DELEGATION: 403,
  NON_DELEGABLE: 403,
  EXCEEDS_DELEGATOR_AUTHORITY: 403,
  SCOPE_EXCEEDS_DELEGATOR: 403,
  DELEGATEE_INVALID: 404,
  NOT_FOUND: 404,
};

/**
 * GET /api/v1/admin/delegations — the delegation instruments visible to the
 * acting administrator (issued by them, received by them, or recorded in
 * their tenant context).
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:delegation.manage",
      action: "admin.delegations.read",
      audit: { objectType: "ADMIN_DELEGATION" },
    },
    async (ctx) => apiOk(await listDelegationInstruments(ctx.principal), ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/delegations — create a delegation instrument under the
 * HIGH-RISK `identity:delegation.manage` capability (MFA step-up enforced by
 * the guard). Server-side validation: only capabilities the DELEGATOR holds
 * through ROLE grants (delegated authority can never be re-delegated), only
 * the closed delegable set (delegating is itself non-delegable — chains have
 * depth one), scope ⊆ the delegator's own resolved tenant scope, bounded
 * window, active human delegatee. Audit ADMIN_DELEGATED + event atomically.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:delegation.manage",
      action: "admin.delegation.create",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "ADMIN_DELEGATION" },
    },
    async (ctx) => {
      const body = await parseBody(request, createDelegationSchema);
      try {
        const result = await createDelegation(
          ctx.principal,
          {
            delegatorUserId: ctx.principal.userId, // always the acting principal
            delegateeUserId: body.delegateeUserId,
            permissions: body.permissions,
            scopeTenantIds: body.scopeTenantIds,
            scopeLegalEntityIds: body.scopeLegalEntityIds ?? [],
            scopeCountryCodes: body.scopeCountryCodes ?? [],
            effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
            effectiveTo: new Date(body.effectiveTo),
            reason: body.reason,
          },
          ctx.traceId,
        );
        if (!result.ok) {
          return apiError(
            result.code,
            result.message,
            DELEGATION_REFUSAL_STATUS[result.code] ?? 409,
            ctx.traceId,
          );
        }
        return apiOk(result.delegation, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
