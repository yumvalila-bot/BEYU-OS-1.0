import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { ActivationProposalSchema } from "@/lib/governance/activation-contract";
import { listBodyActivations, proposeBodyActivation } from "@/lib/governance/activation-service";
import { authorizeAppointmentPresider } from "@/lib/governance/appointment-authority";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, params: Params) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.read", action: "governance.body_activation.list" }, async (ctx) => {
  try { return apiOk(await listBodyActivations(ctx.principal, id), ctx.traceId); }
  catch(e) { if(e instanceof GovernanceError) return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId); throw e; }
 });
}
export async function POST(request: Request, params: Params) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.approve", action: "governance.body_activation.propose", databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60000 } }, async (ctx) => {
  let raw: unknown; try { raw = await request.json(); } catch { return apiError("VALIDATION_ERROR","Valid JSON required.",422,ctx.traceId); }
  const input = ActivationProposalSchema.parse(raw);
  try {
  await withTenantDatabaseContext(ctx.principal, () => authorizeAppointmentPresider(ctx.principal, id, ctx.principal.clearance, "PROPOSE_ACTIVATION"));
  return await withIdempotency(ctx, `governance.bodies.${id}.activations`, input, async () => {
   try { return { status: 201, body: await proposeBodyActivation(ctx.principal, id, input, { traceId: ctx.traceId }) }; }
   catch (e) { if (e instanceof GovernanceError) return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId); throw e; }
  });
  } catch(e) { if(e instanceof GovernanceError) return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId); throw e; }
 });
}
