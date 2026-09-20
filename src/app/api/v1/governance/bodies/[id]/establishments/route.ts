import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { EstablishmentProposalSchema } from "@/lib/governance/establishment-contract";
import { listBodyEstablishments, proposeBodyEstablishment } from "@/lib/governance/establishment-service";
import { readGoverningBody, readBodyDocument, authorizeBodyPresider } from "@/lib/governance/body-authority";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, params: Params) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.read", action: "governance.body.list" }, async (ctx) => {
  try { return apiOk(await listBodyEstablishments(ctx.principal, id), ctx.traceId); }
  catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
 });
}
export async function POST(request: Request, params: Params) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.approve", action: "governance.body.propose", databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60000 } }, async (ctx) => {
  let json: unknown; try { json = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Valid JSON required.", 422, ctx.traceId); }
  const input = EstablishmentProposalSchema.parse(json);
  try {
   await withTenantDatabaseContext(ctx.principal, async () => { const parent = await readGoverningBody(ctx.principal, id); const doc = await readBodyDocument(ctx.principal, parent, input.documentId); await authorizeBodyPresider(ctx.principal, id, doc.classification, "PROPOSE", "body_establishment"); });
   return await withIdempotency(ctx, `governance.bodies.${id}.establishments`, input, async () => ({ status: 201, body: await proposeBodyEstablishment(ctx.principal, id, input, { traceId: ctx.traceId }) }));
  } catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
 });
}
