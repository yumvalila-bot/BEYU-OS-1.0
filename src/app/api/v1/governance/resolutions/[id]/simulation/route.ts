import { apiError, apiOk, guarded } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { simulateResolution } from "@/lib/governance/simulation";
export const dynamic = "force-dynamic";
/** POST carries hypothetical input only. No idempotency claim or business event:
 * the service owns a genuinely READ ONLY, REPEATABLE READ transaction. */
export async function POST(request: Request, params: { params: Promise<{ id: string }> }) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.read", action: "governance.resolution.simulate", databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60000 }, audit: { objectType: "RESOLUTION", objectId: id } }, async (ctx) => {
  let input: unknown;
  try { input = await ctx.request.json(); }
  catch { return apiError("VALIDATION_ERROR", "Request body must be valid JSON.", 422, ctx.traceId); }
  try { return apiOk(await simulateResolution(ctx.principal, id, input), ctx.traceId); }
  catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
 });
}
