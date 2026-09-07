/**
 * GET /api/v1/payments/transactions/[id] — one transaction with its full state
 * trail, matches and exceptions. The trail is returned because a payment record
 * without its provenance is indistinguishable from an assertion.
 */
import { apiError, apiOk, guarded } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { transactionDetail } from "@/lib/payments/readmodel";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(
    _request,
    {
      permission: "finance:payments.read",
      action: "finance.payments.transaction.read",
      rateLimit: { limit: 240, windowMs: 60_000 },
    },
    async (ctx) => {
      const { id } = await context.params;
      const scope = await tenantScopeIds(ctx.principal);
      const detail = await transactionDetail({ tenantIds: scope, transactionId: id });
      if (!detail) {
        // Non-enumerating: a foreign id and a missing id answer identically.
        return apiError("NOT_FOUND", "Payment transaction not found.", 404, ctx.traceId);
      }
      return apiOk({ transaction: detail, ledgerEffect: detail.journalEntryId ? "POSTED_ENTRY_REFERENCED" : "NONE" }, ctx.traceId);
    },
  );
}
