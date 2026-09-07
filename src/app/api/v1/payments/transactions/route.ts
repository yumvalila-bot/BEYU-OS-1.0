/**
 * GET /api/v1/payments/transactions — RLS-scoped payment transaction list.
 * Read-only by construction: no POST here. Money enters through the provider
 * webhook or a governed settlement ingest, never through a dashboard call.
 */
import { z } from "zod";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { listTransactions, READMODEL_VERSION } from "@/lib/payments/readmodel";

export const dynamic = "force-dynamic";

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  reconciliationStatus: z.enum(["RECONCILED", "RECONCILIATION_REQUIRED", "DATA_NOT_AVAILABLE", "ATTRIBUTION_CONFLICT", "DATA_CONFLICT", "REQUIRES_AUTHORITY"]).nullable().optional(),
  accountingStatus: z.enum(["NOT_PREPARED", "POLICY_MISSING", "PREPARED", "READY", "POSTED", "POSTING_FAILED", "REVERSED"]).optional(),
});

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:payments.read",
      action: "finance.payments.transactions.read",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) {
        return apiError("VALIDATION", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 422, ctx.traceId);
      }
      const scope = await tenantScopeIds(ctx.principal);
      const page = await listTransactions({
        tenantIds: scope,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        reconciliationStatus: parsed.data.reconciliationStatus ?? null,
        accountingStatus: parsed.data.accountingStatus ?? null,
      });
      return apiOk(
        {
          items: page.items,
          nextOffset: page.nextOffset,
          readModelVersion: READMODEL_VERSION,
          returned: page.items.length,
          // The list is a claim ledger, not a balance. Nothing here is a
          // reconciled position; `paymentsPosture` reports the axis counts.
          balancesIncluded: false,
        },
        ctx.traceId,
      );
    },
  );
}
