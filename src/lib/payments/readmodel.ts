/**
 * Read models for the payments surface.
 *
 * Every function here takes the resolved tenant scope from the caller
 * (`tenantScopeIds(principal)`) and filters on it. RLS is the enforcement; this
 * is the polite refusal that keeps a cross-tenant id from producing a
 * distinguishable 404-vs-403 signal. The ledger reads the same way.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentExceptions, paymentMatches, paymentTransactions, paymentTransactionStates } from "@/db/schema";
import { listSettlements } from "./settlement";

export const READMODEL_VERSION = "payment-readmodel-1.0.0";

export type TransactionListView = {
  id: string;
  providerCode: string;
  providerTransactionId: string;
  direction: string;
  transactionType: string;
  currency: string;
  grossMinor: number;
  feeMinor: number | null;
  netMinor: number | null;
  netBasis: string;
  occurredAt: string;
  verificationStatus: string;
  trustLevel: string;
  reconciliationStatus: string;
  settlementStatus: string;
  accountingStatus: string;
  counterpartyRef: string | null;
  counterpartyName: string | null;
  invoiceReference: string | null;
  partyLinked: boolean;
  openBlockingExceptions: number;
};

function view(row: typeof paymentTransactions.$inferSelect, blocking: number): TransactionListView {
  return {
    id: row.id,
    providerCode: row.providerCode,
    providerTransactionId: row.providerTransactionId,
    direction: row.direction,
    transactionType: row.transactionType,
    currency: row.currency,
    grossMinor: Number(row.grossMinor),
    feeMinor: row.feeMinor === null ? null : Number(row.feeMinor),
    netMinor: row.netMinor === null ? null : Number(row.netMinor),
    netBasis: row.netBasis,
    occurredAt: row.occurredAt.toISOString(),
    verificationStatus: row.verificationStatus,
    trustLevel: row.trustLevel,
    reconciliationStatus: row.reconciliationStatus,
    settlementStatus: row.settlementStatus,
    accountingStatus: row.accountingStatus,
    counterpartyRef: row.counterpartyRef,
    counterpartyName: row.counterpartyName,
    invoiceReference: row.invoiceReference,
    // A name from the provider is display text only. `partyLinked` is what says a
    // canonical identity was actually resolved; the two must never be confused.
    partyLinked: row.partyId !== null,
    openBlockingExceptions: blocking,
  };
}

export async function listTransactions(input: { tenantIds: string[]; limit?: number; offset?: number; reconciliationStatus?: string | null; accountingStatus?: string | null }): Promise<{ items: TransactionListView[]; nextOffset: number | null }> {
  if (input.tenantIds.length === 0) return { items: [], nextOffset: null };
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const clauses = [inArray(paymentTransactions.tenantId, input.tenantIds)];
  if (input.reconciliationStatus) clauses.push(eq(paymentTransactions.reconciliationStatus, input.reconciliationStatus));
  if (input.accountingStatus) clauses.push(eq(paymentTransactions.accountingStatus, input.accountingStatus));
  const rows = await db
    .select()
    .from(paymentTransactions)
    .where(and(...clauses))
    .orderBy(desc(paymentTransactions.occurredAt))
    .limit(limit + 1)
    .offset(offset);
  const page = rows.slice(0, limit);
  const ids = page.map((r) => r.id);
  const blockingRows = ids.length
    ? await db
        .select({ transactionId: paymentExceptions.transactionId, n: sql<number>`count(*)::int` })
        .from(paymentExceptions)
        .where(and(inArray(paymentExceptions.transactionId, ids), eq(paymentExceptions.blocking, 1), sql`${paymentExceptions.status} <> 'RESOLVED'`))
        .groupBy(paymentExceptions.transactionId)
    : [];
  const counts = new Map(blockingRows.map((b) => [b.transactionId as string, Number(b.n)]));
  return {
    items: page.map((r) => view(r, counts.get(r.id) ?? 0)),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

export type TransactionDetail = TransactionListView & {
  legalEntityId: string;
  countryCode: string;
  tenantId: string;
  accountId: string | null;
  partyId: string | null;
  customerUserId: string | null;
  journalEntryId: string | null;
  settlementId: string | null;
  description: string | null;
  providerMetadata: unknown;
  verificationEvidence: unknown;
  states: { axis: string; from: string | null; to: string; reason: string; actorType: string; actorUserId: string | null; controlRole: string | null; at: string }[];
  matches: { id: string; method: string; confidence: number; status: string; targetType: string; targetId: string; reviewedBy: string | null }[];
  exceptions: { id: string; code: string; severity: string; status: string; blocking: boolean }[];
};

export async function transactionDetail(input: { tenantIds: string[]; transactionId: string }): Promise<TransactionDetail | null> {
  if (input.tenantIds.length === 0) return null;
  const rows = await db
    .select()
    .from(paymentTransactions)
    .where(and(inArray(paymentTransactions.tenantId, input.tenantIds), eq(paymentTransactions.id, input.transactionId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [states, matches, exceptions] = await Promise.all([
    db
      .select()
      .from(paymentTransactionStates)
      .where(eq(paymentTransactionStates.transactionId, row.id))
      .orderBy(paymentTransactionStates.occurredAt),
    db
      .select({
        id: paymentMatches.id,
        method: paymentMatches.method,
        confidence: paymentMatches.confidence,
        status: paymentMatches.status,
        targetType: paymentMatches.targetType,
        targetId: paymentMatches.targetId,
        reviewedBy: paymentMatches.reviewedBy,
      })
      .from(paymentMatches)
      .where(eq(paymentMatches.transactionId, row.id)),
    db
      .select({ id: paymentExceptions.id, code: paymentExceptions.code, severity: paymentExceptions.severity, status: paymentExceptions.status, blocking: paymentExceptions.blocking })
      .from(paymentExceptions)
      .where(eq(paymentExceptions.transactionId, row.id)),
  ]);

  const blocking = exceptions.filter((e) => e.blocking === 1 && e.status !== "RESOLVED").length;
  return {
    ...view(row, blocking),
    legalEntityId: row.legalEntityId,
    countryCode: row.countryCode,
    tenantId: row.tenantId,
    accountId: row.accountId,
    partyId: row.partyId,
    customerUserId: row.customerUserId,
    journalEntryId: row.journalEntryId,
    settlementId: row.settlementId,
    description: row.description,
    providerMetadata: row.providerMetadata,
    verificationEvidence: row.verificationEvidence,
    states: states.map((s) => ({
      axis: s.axis,
      from: s.fromState,
      to: s.toState,
      reason: s.reason,
      actorType: s.actorType,
      actorUserId: s.actorUserId,
      controlRole: s.controlRole,
      at: s.occurredAt.toISOString(),
    })),
    matches: matches.map((m) => ({ ...m, confidence: Number(m.confidence), targetId: m.targetId ?? "" })),
    exceptions: exceptions.map((e) => ({ ...e, blocking: e.blocking === 1 })),
  };
}

/** Aggregate posture for the dashboard and the self-test. Derived, never cached as truth. */
export async function paymentsPosture(input: { tenantIds: string[]; settlements: boolean }) {
  if (input.tenantIds.length === 0) {
    return { totals: null, settlements: [] as unknown[] };
  }
  const totals = await db
    .select({
      transactions: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where ${paymentTransactions.verificationStatus} = 'VERIFIED')::int`,
      reconciled: sql<number>`count(*) filter (where ${paymentTransactions.reconciliationStatus} = 'RECONCILED')::int`,
      prepared: sql<number>`count(*) filter (where ${paymentTransactions.accountingStatus} = 'PREPARED')::int`,
      posted: sql<number>`count(*) filter (where ${paymentTransactions.accountingStatus} = 'POSTED')::int`,
      blockedExceptions: sql<number>`count(*) filter (where exists (select 1 from payment_exceptions e where e.transaction_id = ${paymentTransactions.id} and e.blocking = 1 and e.status <> 'RESOLVED'))::int`,
    })
    .from(paymentTransactions)
    .where(inArray(paymentTransactions.tenantId, input.tenantIds));
  const settlements = input.settlements ? await listSettlements(input.tenantIds) : [];
  return { totals: totals[0] ?? null, settlements };
}
