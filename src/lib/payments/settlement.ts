/**
 * Settlement ingestion and the one way a transaction's trust may rise without a
 * human.
 *
 * THE TRUST RULE, STATED PLAINLY
 *   A webhook says "a customer paid". A settlement batch from the provider says
 *   "we moved this money to you", and a bank statement credit says the money
 *   actually arrived. Only the second and third are independent evidence about
 *   the movement of funds, so only they may raise `trust_level` to
 *   `RECONCILED_BANK` / `VERIFIED_PROVIDER`. Settlement NEVER raises the
 *   `verification_status` of a transaction that failed signature checks, and
 *   never invents a transaction the provider did not report: an unmatched
 *   settlement item is an exception (`SETTLEMENT_ORPHAN_ITEM`), not a booking.
 *
 * VARIANCE IS REPORTED, NOT PLUGGED
 *   `variance_minor` is stored as the arithmetic difference and the batch is
 *   marked `VARIANCE`. There is no code path in this file that adjusts an amount
 *   to make a total agree — that is the rule taken from
 *   `src/lib/finance/reconciliation.ts` ("NEVER SILENTLY ADJUST"), applied to the
 *   provider side of the same problem. Treasury's own position stays OBSERVED
 *   and is reconciled against, never posted from.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "@/db";
import { paymentSettlementItems, paymentSettlements, paymentTransactionStates, paymentTransactions } from "@/db/schema";
import { ID_PREFIX, newId } from "@/lib/ids";
import { appendPaymentAudit } from "./audit-scope";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { majorUnitsString } from "./money";
import { assertTransition, MATCH_CONFIDENCE_CEILING } from "./domain";
import { raiseException } from "./exceptions";
import { stableDigest } from "./resolve";

export const SETTLEMENT_VERSION = "payment-settlement-1.0.0";

export type SettlementItemInput = {
  providerTransactionId: string;
  amountMinor: number;
  feeMinor?: number | null;
};

export type SettlementBatchInput = {
  tenantId: string;
  legalEntityId: string;
  providerCode: string;
  connectionId: string;
  providerSettlementId: string;
  settlementDate: Date;
  currency: string;
  grossMinor: number;
  feeMinor: number | null;
  taxMinor: number | null;
  netMinor: number;
  creditedMinor?: number | null;
  source: "PROVIDER_PUSH" | "STATEMENT_FILE" | "BANK_STATEMENT";
  items: SettlementItemInput[];
  correlationId?: string | null;
  traceId?: string | null;
  /** Who supplied the batch. A file drop is a SERVICE; a person keying it is HUMAN. */
  actorType?: "SERVICE" | "HUMAN";
  actorUserId?: string | null;
};

export type SettlementOutcome = {
  settlementId: string;
  status: "RECONCILED" | "VARIANCE" | "PARTIAL" | "RECEIVED" | "DISPUTED";
  itemCount: number;
  matchedCount: number;
  unmatchedCount: number;
  sumOfItemsMinor: number;
  /** Provider's declared gross minus the sum of its own lines. Never plugged. */
  itemGrossVarianceMinor: number;
  /** Declared net minus what the bank statement actually showed. */
  creditVarianceMinor: number | null;
  transactionsRaisedToBankTrust: number;
  exceptionsRaised: string[];
  idempotentReplay: boolean;
};

/**
 * A batch is immutable once recorded; a re-delivery with identical numbers is an
 * idempotent replay, and a re-delivery with different numbers is a conflict that
 * must be decided by a human, not by last-write-wins.
 */
export async function ingestSettlementBatch(input: SettlementBatchInput): Promise<SettlementOutcome> {
  const settlementId = newId(ID_PREFIX.paymentSettlement);
  const exceptionsRaised: string[] = [];
  let outcome: SettlementOutcome | null = null;

  await withDatabaseRlsContext([input.tenantId], false, async () => {
    await withDatabaseTransactionContext(async (tx) => {
      const existing = await tx
        .select()
        .from(paymentSettlements)
        .where(and(eq(paymentSettlements.connectionId, input.connectionId), eq(paymentSettlements.providerSettlementId, input.providerSettlementId)))
        .limit(1);
      const prior = existing[0];
      if (prior) {
        const sameNumbers =
          Number(prior.grossMinor) === input.grossMinor &&
          Number(prior.netMinor) === input.netMinor &&
          (prior.feeMinor === null ? input.feeMinor === null : Number(prior.feeMinor) === input.feeMinor);
        if (!sameNumbers) {
          await raiseException(
            {
              tenantId: input.tenantId,
              legalEntityId: input.legalEntityId,
              code: "SETTLEMENT_AMOUNT_MISMATCH",
              severity: "CRITICAL",
              detail: {
                reason: "A settlement batch with this provider id already exists with different amounts. Last-write-wins on money is not acceptable; a human must decide.",
                priorSettlementId: prior.id,
                priorGrossMinor: Number(prior.grossMinor),
                incomingGrossMinor: input.grossMinor,
              },
              correlationId: input.correlationId ?? null,
            },
            tx,
          );
          outcome = {
            settlementId: prior.id,
            status: "DISPUTED",
            itemCount: prior.itemCount,
            matchedCount: prior.matchedCount,
            unmatchedCount: prior.unmatchedCount,
            sumOfItemsMinor: 0,
            itemGrossVarianceMinor: 0,
            creditVarianceMinor: null,
            transactionsRaisedToBankTrust: 0,
            exceptionsRaised: ["SETTLEMENT_AMOUNT_MISMATCH"],
            idempotentReplay: false,
          };
          return;
        }
        outcome = {
          settlementId: prior.id,
          status: prior.status as SettlementOutcome["status"],
          itemCount: prior.itemCount,
          matchedCount: prior.matchedCount,
          unmatchedCount: prior.unmatchedCount,
          sumOfItemsMinor: 0,
          itemGrossVarianceMinor: 0,
          creditVarianceMinor: prior.varianceMinor === null ? null : Number(prior.varianceMinor),
          transactionsRaisedToBankTrust: 0,
          exceptionsRaised: [],
          idempotentReplay: true,
        };
        return;
      }

      const sumOfItemsMinor = input.items.reduce((n, i) => n + i.amountMinor, 0);
      const itemGrossVarianceMinor = input.grossMinor - sumOfItemsMinor;
      const creditVarianceMinor = input.creditedMinor === undefined || input.creditedMinor === null ? null : input.netMinor - input.creditedMinor;

      // Variance against the provider's own declared gross, and against the bank
      // credit when one was supplied. Both are derived from the input alone, so they
      // are already final when the header is written — and neither is ever plugged.
      // The batch header is written BEFORE its lines, because the lines carry a
      // foreign key to it. The amounts come from the provider's own declaration and
      // are therefore final at this point; only the tallies and the derived status
      // depend on matching, and those are updated once the loop has finished. A
      // settlement that failed halfway rolls back with this transaction — there is
      // no partially recorded batch.
      await tx.insert(paymentSettlements).values({
        id: settlementId,
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        providerCode: input.providerCode,
        connectionId: input.connectionId,
        providerSettlementId: input.providerSettlementId,
        settlementDate: input.settlementDate,
        currency: input.currency,
        grossMinor: String(input.grossMinor),
        feeMinor: input.feeMinor === null ? "0" : String(input.feeMinor),
        taxMinor: input.taxMinor === null ? "0" : String(input.taxMinor),
        netMinor: String(input.netMinor),
        creditedMinor: input.creditedMinor === undefined || input.creditedMinor === null ? null : String(input.creditedMinor),
        varianceMinor: String(itemGrossVarianceMinor + (creditVarianceMinor ?? 0)),
        itemCount: input.items.length,
        matchedCount: 0,
        unmatchedCount: 0,
        status: 'RECEIVED',
        source: input.source,
        evidenceDigest: stableDigest(
          JSON.stringify({ id: input.providerSettlementId, gross: input.grossMinor, net: input.netMinor, items: input.items.map((i) => [i.providerTransactionId, i.amountMinor]).sort() }),
        ),
        accountingStatus: "NOT_PREPARED",
        correlationId: input.correlationId ?? null,
      });


      const itemIds: { providerTransactionId: string; transactionId: string | null }[] = [];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let raised = 0;

      for (const item of input.items) {
        const candidates = await tx
          .select({
            id: paymentTransactions.id,
            netMinor: paymentTransactions.netMinor,
            netBasis: paymentTransactions.netBasis,
            verificationStatus: paymentTransactions.verificationStatus,
            trustLevel: paymentTransactions.trustLevel,
            reconciliationStatus: paymentTransactions.reconciliationStatus,
            settlementStatus: paymentTransactions.settlementStatus,
            grossMinor: paymentTransactions.grossMinor,
            currency: paymentTransactions.currency,
            occurredAt: paymentTransactions.occurredAt,
          })
          .from(paymentTransactions)
          .where(
            and(
              eq(paymentTransactions.tenantId, input.tenantId),
              eq(paymentTransactions.connectionId, input.connectionId),
              eq(paymentTransactions.providerTransactionId, item.providerTransactionId),
            ),
          )
          .limit(2);
        const found = candidates[0];
        await tx.insert(paymentSettlementItems).values({
          id: newId(ID_PREFIX.paymentSettlementItem),
          tenantId: input.tenantId,
          settlementId: settlementId,
          providerTransactionId: item.providerTransactionId,
          transactionId: found?.id ?? null,
          amountMinor: String(item.amountMinor),
          feeMinor: item.feeMinor === undefined || item.feeMinor === null ? "0" : String(item.feeMinor),
          matchStatus: found ? (Number(found.grossMinor) === item.amountMinor ? "MATCHED" : "AMOUNT_MISMATCH") : "UNMATCHED",
        });
        itemIds.push({ providerTransactionId: item.providerTransactionId, transactionId: found?.id ?? null });

        if (!found) {
          unmatchedCount += 1;
          exceptionsRaised.push("SETTLEMENT_ORPHAN_ITEM");
          await raiseException(
            {
              tenantId: input.tenantId,
              legalEntityId: input.legalEntityId,
              code: "SETTLEMENT_ORPHAN_ITEM",
              severity: "HIGH",
              detail: { providerTransactionId: item.providerTransactionId, amountMinor: item.amountMinor, note: "The provider settled a transaction we never received. Nothing was created from the settlement alone." },
              correlationId: input.correlationId ?? null,
            },
            tx,
          );
          continue;
        }
        matchedCount += 1;
        if (Number(found.grossMinor) !== item.amountMinor) {
          exceptionsRaised.push("SETTLEMENT_AMOUNT_MISMATCH");
          await raiseException(
            {
              tenantId: input.tenantId,
              legalEntityId: input.legalEntityId,
              transactionId: found.id,
              code: "SETTLEMENT_AMOUNT_MISMATCH",
              severity: "CRITICAL",
              detail: { transactionAmountMinor: Number(found.grossMinor), settledAmountMinor: item.amountMinor, providerTransactionId: item.providerTransactionId },
              correlationId: input.correlationId ?? null,
            },
            tx,
          );
          continue;
        }
        if (found.verificationStatus !== "VERIFIED") {
          // A settlement cannot launder an unverified event into verified money.
          exceptionsRaised.push("SETTLEMENT_ON_UNVERIFIED_TRANSACTION");
          await raiseException(
            {
              tenantId: input.tenantId,
              legalEntityId: input.legalEntityId,
              transactionId: found.id,
              code: "TIMING_MISMATCH",
              severity: "HIGH",
              detail: { reason: "Settled, but the underlying transaction is not signature-verified; trust was NOT raised.", verificationStatus: found.verificationStatus },
              correlationId: input.correlationId ?? null,
            },
            tx,
          );
          continue;
        }

        // Independent confirmation: the batch (and, when supplied, the statement
        // credit) corroborates the event. This is the only automatic route from
        // AUTHENTICATED to RECONCILED_BANK.
        const transition = assertTransition({ axis: "TRUST", from: found.trustLevel, to: "RECONCILED_BANK" });
        const creditAgrees =
          input.creditedMinor !== undefined && input.creditedMinor !== null && input.creditedMinor === input.netMinor;
        const reconciliationAchieved = creditAgrees && found.netMinor !== null && found.netBasis !== "UNRESOLVED";
        if (!reconciliationAchieved) {
          await raiseException(
            {
              tenantId: input.tenantId,
              legalEntityId: input.legalEntityId,
              transactionId: found.id,
              code: "SETTLEMENT_SHORTFALL",
              severity: "HIGH",
              detail: {
                reason: "Settled without a bank credit that matches the expected net, or with an unresolved net. Trust was raised by the batch; the reconciliation axis was not.",
                creditedMinor: input.creditedMinor ?? null,
                expectedNetMinor: found.netMinor === null ? null : Number(found.netMinor),
                netBasis: found.netBasis,
              },
              correlationId: input.correlationId ?? null,
            },
            tx,
          );
          exceptionsRaised.push("SETTLEMENT_SHORTFALL");
        }
        // A batch is both events at once — the transaction was swept into a batch and
        // the batch was paid — so the state ledger records the two legal hops rather
        // than inventing a PENDING -> SETTLED edge that would skip IN_SETTLEMENT.
        if (found.settlementStatus === "PENDING") {
          await tx.insert(paymentTransactionStates).values({
            id: newId(ID_PREFIX.paymentStateTransition),
            tenantId: input.tenantId,
            transactionId: found.id,
            axis: "SETTLEMENT",
            fromState: "PENDING",
            toState: "IN_SETTLEMENT",
            reason: `swept into settlement batch ${input.providerSettlementId}`,
            actorType: input.actorType ?? "SERVICE",
            actorUserId: input.actorUserId ?? null,
            controlRole: null,
            evidence: { settlementId, source: input.source } as unknown as Record<string, never>,
            policyVersion: SETTLEMENT_VERSION,
            correlationId: input.correlationId ?? null,
            traceId: input.traceId ?? null,
          });
        }
        const settleTransition = assertTransition({
          axis: "SETTLEMENT",
          from: found.settlementStatus === "PENDING" ? "IN_SETTLEMENT" : found.settlementStatus,
          to: "SETTLED",
        });
        await tx
          .update(paymentTransactions)
          .set({
            trustLevel: "RECONCILED_BANK",
            settlementStatus: "SETTLED",
            settlementId,
            // A settlement corroborates the movement of funds. It does not by
            // itself attribute the money to an internal obligation, so the
            // reconciliation axis advances only when an obligation match already
            // existed; otherwise the row stays RECONCILIATION_REQUIRED and the
            // trust axis carries the corroboration.
            // A settlement plus a bank credit that equals the expected net IS a
            // reconciliation: it is a second, independent artefact confirming the
            // movement and the arrival of the money. Without a credit figure, or
            // where the credit disagrees, the axis stays RECONCILIATION_REQUIRED
            // and an exception is raised instead — the difference between
            // "corroborated" and "assumed".
            reconciliationStatus: reconciliationAchieved ? "RECONCILED" : found.reconciliationStatus,
            matchMethod: reconciliationAchieved ? "AMOUNT_ACCOUNT_EXACT" : null,
            matchConfidence: reconciliationAchieved ? String(MATCH_CONFIDENCE_CEILING.AMOUNT_ACCOUNT_EXACT) : null,
            updatedAt: new Date(),
          })
          .where(eq(paymentTransactions.id, found.id));
        await tx.insert(paymentTransactionStates).values({
          id: newId(ID_PREFIX.paymentStateTransition),
          tenantId: input.tenantId,
          transactionId: found.id,
          axis: "TRUST",
          fromState: transition.from,
          toState: transition.to,
          reason: `settlement ${input.providerSettlementId} corroborates this transaction`,
          actorType: input.actorType ?? "SERVICE",
          actorUserId: input.actorUserId ?? null,
          controlRole: null,
          evidence: { settlementId, source: input.source, creditedMinor: input.creditedMinor ?? null } as unknown as Record<string, never>,
          policyVersion: SETTLEMENT_VERSION,
          correlationId: input.correlationId ?? null,
          traceId: input.traceId ?? null,
        });
        if (reconciliationAchieved) {
          await tx.insert(paymentTransactionStates).values({
            id: newId(ID_PREFIX.paymentStateTransition),
            tenantId: input.tenantId,
            transactionId: found.id,
            axis: "RECONCILIATION",
            fromState: found.reconciliationStatus,
            toState: "RECONCILED",
            reason: `settlement ${input.providerSettlementId} credited ${input.creditedMinor} minor units, equal to the expected net`,
            actorType: input.actorType ?? "SERVICE",
            actorUserId: input.actorUserId ?? null,
            controlRole: null,
            evidence: { settlementId, creditedMinor: input.creditedMinor ?? null, confidenceCeiling: MATCH_CONFIDENCE_CEILING.AMOUNT_ACCOUNT_EXACT } as unknown as Record<string, never>,
            policyVersion: SETTLEMENT_VERSION,
            correlationId: input.correlationId ?? null,
            traceId: input.traceId ?? null,
          });
        }
        await tx
          .insert(paymentTransactionStates)
          .values({
            id: newId(ID_PREFIX.paymentStateTransition),
            tenantId: input.tenantId,
            transactionId: found.id,
            axis: "SETTLEMENT",
            fromState: settleTransition.from,
            toState: settleTransition.to,
            reason: "included in a settlement batch whose amounts agreed",
            actorType: input.actorType ?? "SERVICE",
            actorUserId: input.actorUserId ?? null,
            controlRole: null,
            evidence: { settlementId } as unknown as Record<string, never>,
            policyVersion: SETTLEMENT_VERSION,
            correlationId: input.correlationId ?? null,
            traceId: input.traceId ?? null,
          });
        raised += 1;
      }

      const status: SettlementOutcome["status"] =
        itemGrossVarianceMinor !== 0 || (creditVarianceMinor !== null && creditVarianceMinor !== 0)
          ? "VARIANCE"
          : unmatchedCount > 0
            ? "PARTIAL"
            : matchedCount === input.items.length && input.items.length > 0
              ? "RECONCILED"
              : "RECEIVED";

      if (status === "VARIANCE") exceptionsRaised.push("SETTLEMENT_SHORTFALL");

      await tx
        .update(paymentSettlements)
        .set({ matchedCount, unmatchedCount, status, varianceMinor: String(itemGrossVarianceMinor + (creditVarianceMinor ?? 0)) })
        .where(eq(paymentSettlements.id, settlementId));

      await appendPaymentAudit({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType ?? "SERVICE",
        action: "PAYMENT_SETTLEMENT_INGESTED",
        objectType: "payment_settlement",
        objectId: settlementId,
        outcome: status === "VARIANCE" ? "FAILURE" : "SUCCESS",
        reason: `${matchedCount}/${input.items.length} matched, ${unmatchedCount} orphan, variance ${itemGrossVarianceMinor + (creditVarianceMinor ?? 0)} minor units`,
        authority: SETTLEMENT_VERSION,
        newValue: { providerSettlementId: input.providerSettlementId, status, grossMinor: input.grossMinor, netMinor: input.netMinor },
      });

      outcome = {
        settlementId,
        status,
        itemCount: input.items.length,
        matchedCount,
        unmatchedCount,
        sumOfItemsMinor,
        itemGrossVarianceMinor,
        creditVarianceMinor,
        transactionsRaisedToBankTrust: raised,
        exceptionsRaised: [...new Set(exceptionsRaised)],
        idempotentReplay: false,
      };
    });
  });

  if (!outcome) throw new Error("settlement ingest produced no outcome");
  return outcome;
}

/** Major-unit view of a stored settlement, for the read model and the demo. */
export function settlementView(row: typeof paymentSettlements.$inferSelect) {
  const currency = row.currency;
  return {
    id: row.id,
    providerSettlementId: row.providerSettlementId,
    providerCode: row.providerCode,
    settlementDate: row.settlementDate.toISOString().slice(0, 10),
    currency,
    gross: majorUnitsString(Number(row.grossMinor), currency),
    fee: row.feeMinor === null ? null : majorUnitsString(Number(row.feeMinor), currency),
    net: majorUnitsString(Number(row.netMinor), currency),
    credited: row.creditedMinor === null ? null : majorUnitsString(Number(row.creditedMinor), currency),
    varianceMinor: row.varianceMinor === null ? null : Number(row.varianceMinor),
    items: { total: row.itemCount, matched: row.matchedCount, unmatched: row.unmatchedCount },
    status: row.status,
    source: row.source,
    accountingStatus: row.accountingStatus,
    evidenceDigest: row.evidenceDigest,
  };
}

/** Outstanding settlements for a tenant in RLS scope, newest first. */
export async function listSettlements(tenantIds: string[], limit = 50) {
  if (tenantIds.length === 0) return [];
  const rows = await db.select().from(paymentSettlements).where(inArray(paymentSettlements.tenantId, tenantIds)).orderBy(sql`${paymentSettlements.settlementDate} DESC`).limit(limit);
  return rows.map(settlementView);
}
