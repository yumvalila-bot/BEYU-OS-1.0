import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { ActivationCommandSchema } from "@/lib/governance/activation-contract";
import { listBodyActivations, commandBodyActivation } from "@/lib/governance/activation-service";
import { authorizeEstablishmentSuperior } from "@/lib/governance/establishment-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
export async function POST(request: Request, params: { params: Promise<{ id: string; activationId: string }> }) {
 const { id, activationId } = await params.params;
 return guarded(request, { permission: "governance:resolution.approve", action: "governance.body_activation.command", databaseContext: "handler", rateLimit: { limit: 30, windowMs: 60000 } }, async (ctx) => {
  let raw: unknown; try { raw = await request.json(); } catch { return apiError("VALIDATION_ERROR","Valid JSON required.",422,ctx.traceId); }
  const input = ActivationCommandSchema.parse(raw);
  try {
  await withTenantDatabaseContext(ctx.principal, async () => {
   const { plans } = await listBodyActivations(ctx.principal,id), plan=plans.find((r)=>r.id===activationId);
   if (!plan) throw new GovernanceError("NOT_FOUND","Activation plan is not visible.");
   // Completed receipts still use the recorded superior; the new child does not
   // acquire power to approve or replay its own initial activation.
   await authorizeEstablishmentSuperior(ctx.principal,plan.authorityBodyId,plan.classification,input.command,"body_activation");
  });
  return await withIdempotency(ctx, `governance.bodies.${id}.activations.${activationId}`, input, async () => {
   try { return { status: 200, body: await commandBodyActivation(ctx.principal,id,activationId,input,{traceId:ctx.traceId}) }; }
   catch(e) { if(e instanceof GovernanceError) return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId); throw e; }
  });
  } catch(e) { if(e instanceof GovernanceError) return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId); throw e; }
 });
}
