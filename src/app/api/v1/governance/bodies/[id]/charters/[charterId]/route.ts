import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { CharterCommandSchema } from "@/lib/governance/charter-contract";
import { assertCharterReadable, commandBodyCharter } from "@/lib/governance/charter-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
export async function POST(request: Request, params: { params: Promise<{ id: string; charterId: string }> }) {
  const { id, charterId } = await params.params;
  return guarded(request, { permission: "governance:resolution.approve", action: "governance.charter.command", databaseContext: "handler", rateLimit: { limit: 30, windowMs: 60000 }, audit: { objectType: "GOVERNANCE_CHARTER", objectId: charterId } }, async (ctx) => {
    const input = CharterCommandSchema.parse(await ctx.request.json().catch(() => ({})));
    try {
      await withTenantDatabaseContext(ctx.principal, () => assertCharterReadable(ctx.principal, id, charterId));
      return await withIdempotency(ctx, `governance.bodies.${id}.charters.${charterId}`, input, async () => ({ status: 200, body: await commandBodyCharter(ctx.principal, id, charterId, input, { traceId: ctx.traceId }) }));
    } catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
  });
}
