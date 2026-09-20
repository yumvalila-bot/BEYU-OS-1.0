import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { ActionCommandSchema } from "@/lib/governance/action-contract";
import { assertGovernanceActionReadable, commandGovernanceAction } from "@/lib/governance/action-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
/** The service derives source mandate, tenant, assignee and presiding authority. */
export async function POST(request: Request, params: { params: Promise<{ id: string }> }) {
  const { id } = await params.params;
  return guarded(request, { permission: "governance:resolution.read", action: "governance.action.command",
    databaseContext: "handler", rateLimit: { limit: 30, windowMs: 60_000 },
    audit: { objectType: "GOVERNANCE_ACTION", objectId: id } }, async (ctx) => {
    const input = ActionCommandSchema.parse(await ctx.request.json().catch(() => ({})));
    try {
      await withTenantDatabaseContext(ctx.principal, () => assertGovernanceActionReadable(ctx.principal, id));
      return await withIdempotency(ctx, `governance.actions.${id}`, input, async () => ({
        status: 200, body: await commandGovernanceAction(ctx.principal, id, input,
          { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent }),
      }));
    } catch (err) {
      if (err instanceof GovernanceError) return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId);
      throw err;
    }
  });
}
