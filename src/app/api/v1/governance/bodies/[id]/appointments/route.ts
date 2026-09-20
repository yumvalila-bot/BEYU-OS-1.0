import { authorizeAppointmentPresider } from "@/lib/governance/appointment-authority";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { NominateMemberSchema } from "@/lib/governance/appointment-contract";
import { nominateMember, listBodyAppointments } from "@/lib/governance/appointment-service";
import { readBodyDocument, readGoverningBody } from "@/lib/governance/body-authority";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, params: Params) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.read", action: "governance.appointment.list" }, async (ctx) => {
  try { return apiOk(await listBodyAppointments(ctx.principal, id), ctx.traceId); }
  catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
 });
}
export async function POST(request: Request, params: Params) {
 const { id } = await params.params;
 return guarded(request, { permission: "governance:resolution.approve", action: "governance.appointment.nominate", databaseContext: "handler", rateLimit: { limit: 20, windowMs: 60000 } }, async (ctx) => {
  let json: unknown; try { json = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Valid JSON required.", 422, ctx.traceId); }
  const input = NominateMemberSchema.parse(json);
  try {
   await withTenantDatabaseContext(ctx.principal, async () => { const body = await readGoverningBody(ctx.principal, id); const doc = await readBodyDocument(ctx.principal, body, input.documentId); await authorizeAppointmentPresider(ctx.principal, id, doc.classification, "NOMINATE"); });
   return await withIdempotency(ctx, `governance.bodies.${id}.appointments`, input, async () => {
    try { return { status: 201, body: await nominateMember(ctx.principal, id, input, { traceId: ctx.traceId }) }; }
    catch (e) {
     // The appointment service's nested transaction has rolled back before this
     // recognized domain error is returned. Release only that known-failed claim.
     // Unknown/commit/completion failures still throw and remain IN_FLIGHT.
     if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId);
     throw e;
    }
   });
  } catch (e) { if (e instanceof GovernanceError) return apiError(e.code, e.message, GOVERNANCE_ERROR_STATUS[e.code], ctx.traceId); throw e; }
 });
}
