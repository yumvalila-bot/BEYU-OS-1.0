/**
 * The reconciliation pass: run the matching engine over transactions whose
 * reconciliation axis is still open, and record what it found.
 *
 * WHAT AN AUTOMATIC PASS MAY ACHIEVE
 *   It may record candidates, and it may set `reconciliation_status = RECONCILED`
 *   when an EXACT rule agrees at or above the governed confidence floor. It may
 *   not raise trust past what a second artefact or a human provides: a match
 *   proves attribution, not authenticity, and authenticity is the verification
 *   axis' business.
 *
 * WHAT IT MAY NEVER DO
 *   No amount is ever adjusted to make something match (the rule imported from
 *   `src/lib/finance/reconciliation.ts`: "NEVER SILENTLY ADJUST"). A disagreement
 *   of one unit is an `AMOUNT_MISMATCH` exception with both numbers in it, because
 *   a plug is indistinguishable from a correction only until someone needs to
 *   know which it was.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentTransactions, paymentTransactionStates } from "@/db/schema";
import { ID_PREFIX, newId } from "@/lib/ids";
import { appendPaymentAudit } from "./audit-scope";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { resolveConfidenceFloor } from "./config";
import { assertTransition } from "./domain";
import { raiseException } from "./exceptions";
import { applyMatchOutcome, proposeMatches, type TransactionSubject } from "./matching";

export const RECONCILE_VERSION = "payment-reconcile-1.0.0";

export type ReconcileSummary = {
  examined: number;
  reconciled: number;
  stillRequired: number;
  conflicts: number;
  exceptionsRaised: string[];
  candidatesCreated: number;
  rulesetVersion: string;
};

export async function reconcileTransaction(input: { transactionId: string; actorUserId: string | null; correlationId?: string | null }): Promise<{
  status: string;
  confidence: number | null;
  method: string | null;
  candidates: number;
  exceptions: string[];
}> {
  const rows = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, input.transactionId)).limit(1);
  const row = rows[0];
  if (!row) return { status: "NOT_FOUND", confidence: null, method: null, candidates: 0, exceptions: ["NOT_FOUND"] };

  const floor = await resolveConfidenceFloor({
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    providerCode: row.providerCode,
    currency: row.currency,
  });

  const subject: TransactionSubject = {
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    connectionId: row.connectionId,
    providerTransactionId: row.providerTransactionId,
    idempotencyKey: row.idempotencyKey,
    invoiceReference: row.invoiceReference,
    counterpartyDigest: row.counterpartyDigest,
    direction: row.direction as "INBOUND" | "OUTBOUND",
    currency: row.currency,
    grossMinor: Number(row.grossMinor),
    occurredAt: row.occurredAt,
    description: row.description,
  };

  const exceptions: string[] = [];
  let status = row.reconciliationStatus;
  let confidence: number | null = null;
  let method: string | null = null;
  let candidates = 0;

  await withDatabaseRlsContext([row.tenantId], false, async () => {
    const outcome = await proposeMatches({ subject, confidenceFloor: floor });
    candidates = outcome.created;
    if (outcome.autoConfirmed) {
      const transition = assertTransition({ axis: "RECONCILIATION", from: row.reconciliationStatus, to: "RECONCILED" });
      status = transition.to;
      confidence = outcome.autoConfirmed.confidence;
      method = outcome.autoConfirmed.method;
      await applyMatchOutcome({ transactionId: row.id, status: "RECONCILED", confidence, method: outcome.autoConfirmed.method });
      await db.insert(paymentTransactionStates).values(
        stateValue(row.id, row.tenantId, row.reconciliationStatus, "RECONCILED", `matched by ${method} at ${confidence} (floor ${floor})`, input.actorUserId, input.correlationId ?? null, "RECONCILIATION"),
      );
    } else if (outcome.candidates.length > 0) {
      status = "ATTRIBUTION_CONFLICT";
      exceptions.push("UNMATCHED");
      await applyMatchOutcome({ transactionId: row.id, status: "ATTRIBUTION_CONFLICT", confidence: null, method: null });
      await db.insert(paymentTransactionStates).values(
        stateValue(row.id, row.tenantId, row.reconciliationStatus, "ATTRIBUTION_CONFLICT", "candidates exist but none clears the governed confidence floor; a human must decide", input.actorUserId, input.correlationId ?? null, "RECONCILIATION"),
      );
      await raiseException({
        tenantId: row.tenantId,
        legalEntityId: row.legalEntityId,
        transactionId: row.id,
        code: "UNMATCHED",
        severity: "MEDIUM",
        detail: { reason: "proposed only; below the confidence floor or awaiting review", bestCandidate: outcome.candidates[0]?.method ?? null, floor },
        correlationId: input.correlationId ?? null,
      });
    } else {
      status = "DATA_NOT_AVAILABLE";
      await applyMatchOutcome({ transactionId: row.id, status: "DATA_NOT_AVAILABLE", confidence: null, method: null });
      await db.insert(paymentTransactionStates).values(
        stateValue(
          row.id,
          row.tenantId,
          row.reconciliationStatus,
          "DATA_NOT_AVAILABLE",
          "no internal record matched on any rule (an AR/AP obligation substrate does not exist in this platform)",
          input.actorUserId,
          input.correlationId ?? null,
          "RECONCILIATION",
        ),
      );
    }

    await appendPaymentAudit({
      tenantId: row.tenantId,
      actorUserId: input.actorUserId,
      actorType: input.actorUserId ? "HUMAN" : "SERVICE",
      action: "PAYMENT_RECONCILIATION_PASS",
      objectType: "payment_transaction",
      objectId: row.id,
      outcome: status === "RECONCILED" ? "SUCCESS" : "DENIED",
      reason: `${candidates} candidate(s); status ${status}`,
      authority: RECONCILE_VERSION,
      newValue: { from: row.reconciliationStatus, to: status, confidence, method },
    });
  });

  return { status, confidence, method, candidates, exceptions };
}

function stateValue(
  transactionId: string,
  tenantId: string,
  from: string,
  to: string,
  reason: string,
  actorUserId: string | null,
  correlationId: string | null,
  axis: "RECONCILIATION" | "SETTLEMENT" | "VERIFICATION" | "ACCOUNTING" | "TRUST",
) {
  return {
    id: newId(ID_PREFIX.paymentStateTransition),
    tenantId,
    transactionId,
    axis,
    fromState: from,
    toState: to,
    reason,
    // A matching pass is not a human decision. Recording it as SERVICE keeps the
    // trail honest about who did what, which is what separation of duties reads.
    actorType: actorUserId ? ("HUMAN" as const) : ("SERVICE" as const),
    actorUserId,
    controlRole: null,
    evidence: {} as Record<string, never>,
    policyVersion: RECONCILE_VERSION,
    correlationId,
    occurredAt: new Date(),
  };
}

/** Batch pass over the open queue, oldest first, bounded. */
export async function reconcileOpenQueue(input: { tenantIds: string[]; limit?: number; actorUserId: string | null }): Promise<ReconcileSummary> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await db
    .select({ id: paymentTransactions.id })
    .from(paymentTransactions)
    .where(
      and(
        inArray(paymentTransactions.tenantId, input.tenantIds),
        sql`${paymentTransactions.reconciliationStatus} in ('RECONCILIATION_REQUIRED','DATA_NOT_AVAILABLE')`,
      ),
    )
    .orderBy(asc(paymentTransactions.occurredAt))
    .limit(limit);

  const summary: ReconcileSummary = {
    examined: 0,
    reconciled: 0,
    stillRequired: 0,
    conflicts: 0,
    exceptionsRaised: [],
    candidatesCreated: 0,
    rulesetVersion: RECONCILE_VERSION,
  };
  for (const row of rows) {
    const result = await reconcileTransaction({ transactionId: row.id, actorUserId: input.actorUserId });
    summary.examined += 1;
    summary.candidatesCreated += result.candidates;
    if (result.status === "RECONCILED") summary.reconciled += 1;
    else if (result.status === "ATTRIBUTION_CONFLICT") summary.conflicts += 1;
    else summary.stillRequired += 1;
    for (const e of result.exceptions) if (!summary.exceptionsRaised.includes(e)) summary.exceptionsRaised.push(e);
  }
  return summary;
}

export const RECONCILE_BOUNDARIES = {
  adjustsAmounts: false,
  raisesTrustLevel: false,
  postsJournals: false,
  emptySourceMeansReconciled: false,
  maxBatch: 500,
} as const;
