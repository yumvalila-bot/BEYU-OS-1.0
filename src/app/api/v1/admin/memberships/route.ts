import { apiOk, guarded, parseBody } from "@/lib/api";
import { assignMembership, listMembershipsInScope, revokeMembership } from "@/lib/admin/governance-service";
import { governedRefusal, membershipSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/memberships — governed listing of tenant memberships
 * (role assignments in the principal's scope, active and historical, with the
 * active flag computed). The membership model IS the canonical role-assignment
 * model; no second membership registry exists.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:user.read",
      action: "admin.memberships.read",
      audit: { objectType: "MEMBERSHIP" },
    },
    async (ctx) => apiOk(await listMembershipsInScope(ctx.principal), ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/memberships — assign membership: an active TENANT_MEMBER
 * (zero-capability) role assignment, the governed statement "this user is a
 * member of this tenant". Write path: the governed admin-DSN boundary (F-01)
 * with the audit append in the same transaction. Audit MEMBERSHIP_GRANTED.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:membership.manage",
      action: "admin.membership.assign",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "MEMBERSHIP" },
    },
    async (ctx) => {
      const body = await parseBody(request, membershipSchema);
      try {
        const result = await assignMembership(ctx.principal, body.userId, body.tenantId, body.reason, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * DELETE-style revocation is a POST here (governed reason required, proxy-safe
 * body): end-dates EVERY active assignment of the user in the tenant and kills
 * the user's live sessions in that tenant. Revoking membership of the user's
 * HOME tenant is refused — that is a transfer, a distinct governed act.
 * Audit MEMBERSHIP_REVOKED.
 */
export async function PUT(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:membership.manage",
      action: "admin.membership.revoke",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "MEMBERSHIP" },
    },
    async (ctx) => {
      const body = await parseBody(request, membershipSchema);
      try {
        const result = await revokeMembership(ctx.principal, body.userId, body.tenantId, body.reason, ctx.traceId);
        return apiOk(result, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
