import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { CreateActionSchema } from "@/lib/governance/action-contract";
import { assertGovernanceActionsReadable, createGovernanceAction, listGovernanceActions } from "@/lib/governance/action-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, params: Params) {
  const { id } = await params.params;
  return guarded(request, { permission: "governance:resolution.read", action: "governance.action.list",
    audit: { objectType: "RESOLUTION", objectId: id }, rateLimit: { limit: 60, windowMs: 60_000 } }, async (ctx) => {
    try { return apiOk(await listGovernanceActions(ctx.principal, id), ctx.traceId); }
    catch (err) {
      if (err instanceof GovernanceError) return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId);
      throw err;
    }
  });
}
export async function POST(request: Request, params: Params) {
  const { id } = await params.params;
  return guarded(request, { permission: "governance:resolution.approve", action: "governance.action.create",
    databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60_000 },
    audit: { objectType: "RESOLUTION", objectId: id } }, async (ctx) => {
    const input = CreateActionSchema.parse(await ctx.request.json().catch(() => ({})));
    try {
      await withTenantDatabaseContext(ctx.principal, () => assertGovernanceActionsReadable(ctx.principal, id));
      return await withIdempotency(ctx, `governance.resolutions.${id}.actions`, input, async () => ({
        status: 201, body: await createGovernanceAction(ctx.principal, id, input,
          { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent }),
      }));
    } catch (err) {
      if (err instanceof GovernanceError) return apiError(err.code, err.message, GOVERNANCE_ERROR_STATUS[err.code], ctx.traceId);
      throw err;
    }
  });
}
