/**
 * POST /api/v1/payments/transactions/[id]/review
 *
 * The human decision surface for payments: confirm or reject a proposed match.
 * Enforces the permission, the separation-of-duties rule from
 * `src/lib/finance/workflow.ts`, and the per-method confidence ceiling, then
 * records the act. It cannot post and it cannot change an amount: a review that
 * could edit money would replace the ledger's maker-checker discipline with a
 * dashboard form.
 *
 * `CHECK_SEPARATION` is a read-shaped pre-flight so a UI can disable its own
 * button for the true reason ("you already acted as MAKER here") instead of
 * letting the reviewer discover a 403 after submitting.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { db } from "@/db";
import { paymentMatches, paymentTransactions } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { resolveConfidenceFloor } from "@/lib/payments/config";
import { assertSeparation, decideMatch, REVIEW_VERSION } from "@/lib/payments/review";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("act", [
  z.object({ act: z.literal("CONFIRM_MATCH"), matchId: z.string().min(8).max(120), reason: z.string().min(5).max(1000) }),
  z.object({ act: z.literal("REJECT_MATCH"), matchId: z.string().min(8).max(120), reason: z.string().min(5).max(1000) }),
  z.object({ act: z.literal("CHECK_SEPARATION") }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: transactionId } = await context.params;
  const body = await parseBody(request, Body);
  const isRead = body.act === "CHECK_SEPARATION";

  return guarded(
    request,
    {
      permission: isRead ? "finance:payments.read" : "finance:payments.review",
      action: isRead ? "finance.payments.review.separation.check" : `finance.payments.${body.act === "CONFIRM_MATCH" ? "match.confirm" : "match.reject"}`,
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: isRead ? undefined : { objectType: "payment_transaction", objectId: transactionId },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const visible = await db
        .select({
          id: paymentTransactions.id,
          tenantId: paymentTransactions.tenantId,
          legalEntityId: paymentTransactions.legalEntityId,
          providerCode: paymentTransactions.providerCode,
          currency: paymentTransactions.currency,
        })
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.id, transactionId), inArray(paymentTransactions.tenantId, scope)))
        .limit(1);
      const tx = visible[0];
      if (!tx) return apiError("NOT_FOUND", "Payment transaction not found.", 404, ctx.traceId);

      if (body.act === "CHECK_SEPARATION") {
        const verdict = await assertSeparation({ transactionId: tx.id, actorUserId: ctx.principal.userId, act: "confirm_match" });
        return apiOk({ act: body.act, ...verdict, reviewVersion: REVIEW_VERSION }, ctx.traceId);
      }

      const matchRows = await db
        .select({ id: paymentMatches.id })
        .from(paymentMatches)
        .where(and(eq(paymentMatches.id, body.matchId), eq(paymentMatches.transactionId, tx.id)))
        .limit(1);
      if (matchRows.length === 0) return apiError("NOT_FOUND", "That match does not belong to this transaction.", 404, ctx.traceId);

      const floor = await resolveConfidenceFloor({
        tenantId: tx.tenantId,
        legalEntityId: tx.legalEntityId,
        providerCode: tx.providerCode,
        currency: tx.currency,
      });

      const result = await decideMatch({
        tenantId: tx.tenantId,
        matchId: body.matchId,
        decision: body.act === "CONFIRM_MATCH" ? "CONFIRM" : "REJECT",
        actorUserId: ctx.principal.userId,
        reason: body.reason,
        confidenceFloor: floor,
        correlationId: ctx.correlationId,
      });
      if (!result.ok) {
        const status = result.code === "SEGREGATION_OF_DUTIES" ? 403 : result.code === "NOT_FOUND" ? 404 : 409;
        return apiError(result.code, result.message, status, ctx.traceId);
      }
      return apiOk({ result, reviewVersion: REVIEW_VERSION, postingPerformed: false, ledgerEffect: "NONE" }, ctx.traceId);
    },
  );
}
