/**
 * /api/v1/payments/reconciliation
 *
 * GET  — the current posture: how far each axis has got, and what is blocking.
 * POST — run the matching engine over one transaction or over the open queue.
 *
 * This endpoint never adjusts an amount and never posts. Its most likely answer
 * in a fresh installation is "nothing matched, because there is no AR/AP
 * obligation substrate to match against" — that is reported as
 * `DATA_NOT_AVAILABLE`, which is a fact about the platform, not an error here.
 */
import { z } from "zod";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { paymentsPosture } from "@/lib/payments/readmodel";
import { reconcileOpenQueue, reconcileTransaction, RECONCILE_BOUNDARIES, RECONCILE_VERSION } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";

const Body = z.object({
  transactionId: z.string().min(8).max(120).optional(),
  sweep: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "finance:payments.read", action: "finance.payments.reconciliation.read", rateLimit: { limit: 60, windowMs: 60_000 } },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const posture = await paymentsPosture({ tenantIds: scope, settlements: true });
      return apiOk(
        {
          posture,
          boundaries: RECONCILE_BOUNDARIES,
          version: RECONCILE_VERSION,
          note: "Amounts are never adjusted to obtain agreement.",
        },
        ctx.traceId,
      );
    },
  );
}

export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  return guarded(
    request,
    {
      permission: "finance:payments.review",
      action: "finance.payments.reconciliation.run",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "payment_reconciliation_run", objectId: body.transactionId ?? "sweep" },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      if (body.transactionId && !body.sweep) {
        const result = await reconcileTransaction({ transactionId: body.transactionId, actorUserId: ctx.principal.userId, correlationId: ctx.correlationId });
        if (result.status === "NOT_FOUND") return apiError("NOT_FOUND", "Payment transaction not found.", 404, ctx.traceId);
        return apiOk({ scope: "single", result, boundaries: RECONCILE_BOUNDARIES, postingPerformed: false }, ctx.traceId);
      }
      const summary = await reconcileOpenQueue({ tenantIds: scope, limit: body.limit ?? 100, actorUserId: ctx.principal.userId });
      return apiOk({ scope: "queue", summary, boundaries: RECONCILE_BOUNDARIES, postingPerformed: false }, ctx.traceId);
    },
  );
}
