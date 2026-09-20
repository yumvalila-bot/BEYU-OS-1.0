import { apiError, guarded, withIdempotency } from "@/lib/api";
import { GovernanceError, GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { AppointmentCommandSchema } from "@/lib/governance/appointment-contract";
import { commandAppointment, readAppointment } from "@/lib/governance/appointment-service";
import { authorizeBodyPresider } from "@/lib/governance/body-authority";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic = "force-dynamic";
export async function POST(request: Request, params: { params: Promise<{ id: string; appointmentId: string }> }) {
 const { id, appointmentId } = await params.params;
 return guarded(request, { permission: "governance:resolution.read", action: "governance.appointment.command", databaseContext: "handler", rateLimit: { limit: 30, windowMs: 60000 } }, async (ctx) => {
  let json: unknown; try { json = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Valid JSON required.", 422, ctx.traceId); }
  const input = AppointmentCommandSchema.parse(json);
  try {
   await withTenantDatabaseContext(ctx.principal, async () => {
    const { row } = await readAppointment(ctx.principal, id, appointmentId);
    if (input.command === "ACCEPT" || input.command === "DECLINE") {
     if (row.nomineeUserId !== ctx.principal.userId || row.partyId !== ctx.principal.partyId || !ctx.principal.mfaSatisfied) throw new GovernanceError("FORBIDDEN", "Only the authenticated nominee may consent.");
    } else await authorizeBodyPresider(ctx.principal, id, row.classification, input.command, "appointment");
   });
   return await withIdempotency(ctx, `governance.bodies.${id}.appointments.${appointmentId}`, input, async () => {
    try { return { status: 200, body: await commandAppointment(ctx.principal, id, appointmentId, input, { traceId: ctx.traceId }) }; }
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
