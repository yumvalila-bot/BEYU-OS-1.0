/**
 * POST /api/v1/payments/transactions/[id]/accounting
 *
 * `action=PREPARE` computes the journal draft and records why it can or cannot
 * be posted. `action=POST` is the only call in the payment surface that can move
 * money into the ledger, and it does so by delegating to `postJournal()` — which
 * still requires CAP_POSTING, `finance:ledger.post`, the entity scope, an open
 * period, the structural invariants and its own idempotency key.
 *
 * This endpoint does not grant any of those, and a CAPABILITY_LOCKED answer is
 * returned as a 202-with-reason rather than a failure to retry: the lock is a
 * governance state, not a bug.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { db } from "@/db";
import { paymentTransactions } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { ACCOUNTING_BRIDGE_VERSION, prepareOrPost, type JournalDraft } from "@/lib/payments/accounting";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["PREPARE", "POST"]),
  correlationId: z.string().min(8).max(120).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: transactionId } = await context.params;
  const body = await parseBody(request, Body);
  return guarded(
    request,
    {
      // POST additionally needs the ledger permission, which `postJournal`
      // re-checks itself; asking for it here only produces a cleaner 403.
      permission: body.action === "POST" ? "finance:ledger.post" : "finance:payments.authorize",
      action: `finance.payments.accounting.${body.action.toLowerCase()}`,
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "payment_transaction", objectId: transactionId },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const rows = await db
        .select({ id: paymentTransactions.id, tenantId: paymentTransactions.tenantId })
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.id, transactionId), inArray(paymentTransactions.tenantId, scope)))
        .limit(1);
      const tx = rows[0];
      if (!tx) return apiError("NOT_FOUND", "Payment transaction not found.", 404, ctx.traceId);

      const result = await prepareOrPost({
        principal: ctx.principal,
        transactionId: tx.id,
        allowPost: body.action === "POST",
        traceId: ctx.traceId,
        correlationId: body.correlationId ?? ctx.correlationId,
      });

      if (result.kind === "BLOCKED") {
        const locked = result.blockers.includes("CAPABILITY_LOCKED");
        return apiOk(
          {
            outcome: "BLOCKED",
            blockers: result.blockers,
            reason: result.reason,
            journalEntryCreated: false,
            // 202, not 500: a governance lock is an expected steady state.
            httpIntent: locked ? "AWAITING_GOVERNANCE" : "REQUIRES_CONFIGURATION",
            bridgeVersion: ACCOUNTING_BRIDGE_VERSION,
          },
          ctx.traceId,
        );
      }
      if (result.kind === "ALREADY_POSTED") {
        return apiOk({ outcome: "ALREADY_POSTED", journalEntryId: result.journalEntryId, journalEntryCreated: false, idempotent: true }, ctx.traceId);
      }
      return apiOk(
        {
          outcome: result.kind,
          draft: result.kind === "DRAFTED" ? redact(result.draft) : undefined,
          gateBlockers: result.kind === "DRAFTED" ? result.gateBlockers : undefined,
          reason: result.kind === "DRAFTED" ? result.reason : undefined,
          journalEntryId: result.kind === "POSTED" ? result.journalEntryId : null,
          journalEntryCreated: result.kind === "POSTED",
          lineCount: result.kind === "POSTED" ? result.lineCount : undefined,
          totals: result.kind === "POSTED" ? { totalDebit: result.totalDebit, totalCredit: result.totalCredit } : undefined,
          bridgeVersion: ACCOUNTING_BRIDGE_VERSION,
        },
        ctx.traceId,
      );
    },
  );
}

/** The draft is returned with account ids but no code/name guesses; the client
 *  resolves names through the existing chart-of-accounts endpoint. */
function redact(draft: JournalDraft) {
  return {
    reference: draft.reference,
    description: draft.description,
    currency: draft.currency,
    periodId: draft.periodId,
    periodCode: draft.periodCode,
    lines: draft.lines.map((l) => ({
      role: l.role,
      accountId: l.accountId,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      description: l.description,
    })),
    balanced: draft.balanced,
    basis: draft.basis,
  };
}
