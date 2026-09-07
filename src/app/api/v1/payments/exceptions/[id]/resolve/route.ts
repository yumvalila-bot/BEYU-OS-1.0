/**
 * POST /api/v1/payments/exceptions/[id]/resolve
 *
 * Closes an exception by decision, never by deletion. `ACCEPT_RISK` is accepted
 * here as a named, auditable act and the row stays OPEN-to-ACCEPTED_RISK with the
 * reason attached — the record of "someone chose to proceed anyway" is the point.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { db } from "@/db";
import { paymentExceptions } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { decideException } from "@/lib/payments/review";

export const dynamic = "force-dynamic";

const Body = z.object({
  decision: z.enum(["RESOLVED", "ACCEPT_RISK", "ESCALATE"]),
  resolution: z.string().min(5).max(1000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: exceptionId } = await context.params;
  const body = await parseBody(request, Body);
  return guarded(
    request,
    {
      permission: body.decision === "ACCEPT_RISK" ? "finance:payments.authorize" : "finance:payments.review",
      action: `finance.payments.exception.${body.decision.toLowerCase()}`,
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "payment_exception", objectId: exceptionId },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const rows = await db
        .select({ id: paymentExceptions.id, tenantId: paymentExceptions.tenantId })
        .from(paymentExceptions)
        .where(and(eq(paymentExceptions.id, exceptionId), inArray(paymentExceptions.tenantId, scope)))
        .limit(1);
      const exception = rows[0];
      if (!exception) return apiError("NOT_FOUND", "Exception not found.", 404, ctx.traceId);

      const result = await decideException({
        tenantId: exception.tenantId,
        exceptionId,
        decision: body.decision === "ACCEPT_RISK" ? "ACCEPTED_RISK" : body.decision === "ESCALATE" ? "ESCALATED" : "RESOLVED",
        actorUserId: ctx.principal.userId,
        resolution: body.resolution,
        correlationId: ctx.correlationId,
      });
      if (!result.ok) {
        const status = result.code === "SEGREGATION_OF_DUTIES" ? 403 : result.code === "NOT_FOUND" ? 404 : 409;
        return apiError(result.code, result.message, status, ctx.traceId);
      }
      return apiOk({ result, deleted: false, note: "The exception row remains; only its status changed." }, ctx.traceId);
    },
  );
}
