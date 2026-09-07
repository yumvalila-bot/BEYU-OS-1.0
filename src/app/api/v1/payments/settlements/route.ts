/**
 * /api/v1/payments/settlements
 *
 * GET  — the tenant's settlement batches as recorded, with their variances.
 * POST — ingest a provider settlement batch (or a bank-statement view of one).
 *        This is the only payment endpoint that can raise a transaction's trust
 *        without a human, and it raises it only when the batch amount AND a bank
 *        credit both agree with what we recorded. It creates no transactions of
 *        its own: a settlement item with no matching transaction becomes an
 *        orphan exception, never a booking.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { db } from "@/db";
import { paymentProviderConnections } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { ingestSettlementBatch, listSettlements, SETTLEMENT_VERSION } from "@/lib/payments/settlement";

export const dynamic = "force-dynamic";

const Item = z.object({
  providerTransactionId: z.string().min(1).max(128),
  amountMinor: z.number().int().min(0),
  feeMinor: z.number().int().min(0).nullable().optional(),
});

const Body = z.object({
  providerSettlementId: z.string().min(4).max(128),
  providerCode: z.string().min(2).max(32),
  connectionId: z.string().min(8).max(120),
  settlementDate: z.string().datetime({ offset: true }),
  currency: z.string().length(3),
  grossMinor: z.number().int().min(0),
  feeMinor: z.number().int().min(0).nullable().optional(),
  taxMinor: z.number().int().min(0).nullable().optional(),
  netMinor: z.number().int().min(0),
  creditedMinor: z.number().int().min(0).nullable().optional(),
  source: z.enum(["PROVIDER_PUSH", "STATEMENT_FILE", "BANK_STATEMENT"]),
  items: z.array(Item).min(0).max(5000),
});

export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "finance:payments.read", action: "finance.payments.settlements.read", rateLimit: { limit: 60, windowMs: 60_000 } },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const items = await listSettlements(scope);
      return apiOk({ items, settlementVersion: SETTLEMENT_VERSION, balancesIncluded: false }, ctx.traceId);
    },
  );
}

export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  return guarded(
    request,
    {
      permission: "finance:settlement.manage",
      action: "finance.payments.settlement.ingest",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "payment_settlement", objectId: body.providerSettlementId },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      // A batch may only be attached to a connection the caller can already see.
      // RLS is the enforcement; this turns a foreign connection id into the same
      // 404 as a missing one instead of a distinguishable 403.
      const [connectionRow] = await db
        .select({
          id: paymentProviderConnections.id,
          tenantId: paymentProviderConnections.tenantId,
          legalEntityId: paymentProviderConnections.legalEntityId,
          providerCode: paymentProviderConnections.providerCode,
        })
        .from(paymentProviderConnections)
        .where(and(eq(paymentProviderConnections.id, body.connectionId), eq(paymentProviderConnections.enabled, 1), inArray(paymentProviderConnections.tenantId, scope)))
        .limit(1);
      if (!connectionRow) {
        return apiError("NOT_FOUND", "No enabled connection with that id is visible to you.", 404, ctx.traceId);
      }
      if (connectionRow.providerCode !== body.providerCode) {
        return apiError("PROVIDER_CONNECTION_MISMATCH", "The provider code does not match the connection it is being settled against.", 422, ctx.traceId);
      }
      const tenantRow = connectionRow;

      const outcome = await ingestSettlementBatch({
        tenantId: tenantRow.tenantId,
        legalEntityId: tenantRow.legalEntityId,
        providerCode: body.providerCode,
        connectionId: body.connectionId,
        providerSettlementId: body.providerSettlementId,
        settlementDate: new Date(body.settlementDate),
        currency: body.currency.toUpperCase(),
        grossMinor: body.grossMinor,
        feeMinor: body.feeMinor ?? null,
        taxMinor: body.taxMinor ?? null,
        netMinor: body.netMinor,
        creditedMinor: body.creditedMinor ?? null,
        source: body.source,
        items: body.items.map((i) => ({ providerTransactionId: i.providerTransactionId, amountMinor: i.amountMinor, feeMinor: i.feeMinor ?? null })),
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        actorType: "HUMAN",
        actorUserId: ctx.principal.userId,
      });

      if (!outcome.idempotentReplay && outcome.status === "VARIANCE") {
        return apiOk({ ...outcome, accepted: true, note: "Recorded with its variance reported. Nothing was adjusted." }, ctx.traceId, 202);
      }
      return apiOk({ ...outcome, accepted: true }, ctx.traceId, outcome.idempotentReplay ? 200 : 202);
    },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET,POST" } });
}
