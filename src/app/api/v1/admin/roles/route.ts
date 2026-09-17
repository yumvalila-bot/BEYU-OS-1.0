import { apiOk, guarded, parseBody } from "@/lib/api";
import { grantRole, listMembershipsInScope, listRoleCatalogue } from "@/lib/admin/governance-service";
import { governedRefusal, grantRoleSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/roles — the canonical role catalogue plus the assignments
 * in the principal's scope. The catalogue is `roles` seeded from the ONE
 * constants.ts definition; nothing here can mint a role.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:user.read",
      action: "admin.roles.read",
      audit: { objectType: "ROLE" },
    },
    async (ctx) => {
      const [catalogue, assignments] = await Promise.all([
        listRoleCatalogue(),
        listMembershipsInScope(ctx.principal),
      ]);
      return apiOk({ catalogue, assignments }, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/admin/roles — grant a role assignment under the HIGH-RISK
 * `identity:role.grant` capability (MFA step-up enforced by the guard).
 * Guards: no self-grant (self-escalation), privileged roles grantable only by
 * a PLATFORM_ADMIN, tenant/entity scope validated, duplicates refused. The
 * write runs through the governed admin-DSN boundary (F-01) with audit
 * ROLE_GRANTED + event in the same transaction.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:role.grant",
      action: "admin.role.grant",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "ROLE_ASSIGNMENT" },
    },
    async (ctx) => {
      const body = await parseBody(request, grantRoleSchema);
      try {
        const result = await grantRole(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
