import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { EstablishmentCommandSchema } from "@/lib/governance/establishment-contract";
import { readBodyEstablishment, commandBodyEstablishment } from "@/lib/governance/establishment-service";
import { authorizeBodyPresider } from "@/lib/governance/body-authority";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
export async function POST(request: Request, params: { params: Promise<{ id: string; establishmentId: string }> }) {
 const { id, establishmentId } = await params.params;
 return guarded(request, { permission: "governance:resolution.approve", action: "governance.body.command", databaseContext: "handler", rateLimit: { limit: 30, windowMs: 60000 } }, async (ctx) => {
  let json: unknown; try { json = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Valid JSON required.", 422, ctx.traceId); }
  const input = EstablishmentCommandSchema.parse(json);
  try {
   await withTenantDatabaseContext(ctx.principal, async () => { const { row } = await readBodyEstablishment(ctx.principal, id, establishmentId); await authorizeBodyPresider(ctx.principal, id, row.classification, input.command, "body_establishment"); });
   return await withIdempotency(ctx, `governance.bodies.${id}.establishments.${establishmentId}`, input, async () => ({ status: 200, body: await commandBodyEstablishment(ctx.principal, id, establishmentId, input, { traceId: ctx.traceId }) }));
  } catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
 });
}
