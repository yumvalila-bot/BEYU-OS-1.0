import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { CreateCharterSchema } from "@/lib/governance/charter-contract";
import { createBodyCharter, readBodyCharters } from "@/lib/governance/charter-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, params: Params) {
  const { id } = await params.params;
  return guarded(request, { permission: "governance:resolution.read", action: "governance.charter.list", audit: { objectType: "GOVERNANCE_BODY", objectId: id } }, async (ctx) => {
    try { return apiOk(await readBodyCharters(ctx.principal, id), ctx.traceId); }
    catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
  });
}
export async function POST(request: Request, params: Params) {
  const { id } = await params.params;
  return guarded(request, { permission: "governance:resolution.approve", action: "governance.charter.create", databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60000 }, audit: { objectType: "GOVERNANCE_BODY", objectId: id } }, async (ctx) => {
    const input = CreateCharterSchema.parse(await ctx.request.json().catch(() => ({})));
    try {
      await withTenantDatabaseContext(ctx.principal, () => readBodyCharters(ctx.principal, id));
      return await withIdempotency(ctx, `governance.bodies.${id}.charters`, input, async () => ({ status: 201, body: await createBodyCharter(ctx.principal, id, input, { traceId: ctx.traceId }) }));
    } catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
  });
}
