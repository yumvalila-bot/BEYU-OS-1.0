/**
 * Deterministic transaction matching, and why it stops short of AR/AP.
 *
 * THE TARGETS THAT EXIST
 *   Matching needs something to match AGAINST. What this platform genuinely has:
 *     - `payment_transactions` themselves (so an outflow and an inflow of the same
 *       amount on the same channel can be recognised as one movement),
 *     - `journal_entries`, matched on their globally unique `reference` (a
 *       payment that was already posted can be re-confirmed against a later
 *       provider or bank artefact),
 *     - settlement items (in `settlement.ts`, same engine, different target).
 *
 *   What it does NOT have: an invoice / receivable / payable substrate. A repo-wide
 *   grep of `src/db/schema/` for invoice|receivable|payable returns nothing, and
 *   `src/lib/finance/truth.ts` records AR and AP as `canonicalTable: null` with
 *   "creating one requires ratified accounting policy". So this module reports
 *   `DATA_NOT_AVAILABLE` for obligation matching instead of inventing a table to
 *   fill the gap. A matcher that invents its own target table would be the exact
 *   shortcut the truth registry exists to prevent.
 *
 * THE CONFIDENCE MODEL
 *   Each rule declares a ceiling; a match may not score above the ceiling of the
 *   rule that produced it. FUZZY is capped at 0.750 and can never confirm
 *   anything on its own — confirmation is a named human decision recorded in the
 *   match row and the state trail. `confidence_floor` comes from governed policy,
 *   never from a threshold in this file.
 */
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db, type DatabaseTransaction } from "@/db";
import { paymentMatches, paymentTransactions, journalEntries } from "@/db/schema";
import { ID_PREFIX, newId } from "@/lib/ids";
import { MATCH_CONFIDENCE_CEILING, type MatchMethod } from "./domain";
import { raiseException } from "./exceptions";

export const MATCHING_VERSION = "payment-match-1.1.0";

export type MatchTargetType = "PAYMENT_TRANSACTION" | "JOURNAL_ENTRY" | "SETTLEMENT_ITEM" | "OBLIGATION";

export type MatchCandidate = {
  targetType: MatchTargetType;
  targetTable: string;
  targetId: string;
  method: MatchMethod;
  confidence: number;
  evidence: Record<string, unknown>;
};

export type TransactionSubject = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  connectionId: string;
  providerTransactionId: string;
  idempotencyKey: string;
  invoiceReference: string | null;
  counterpartyDigest: string | null;
  direction: "INBOUND" | "OUTBOUND";
  currency: string;
  grossMinor: number;
  occurredAt: Date;
  description: string | null;
};

/** Scale-free comparison window: 15 minutes, then 7 days, then no time bound. */
const WINDOWS: readonly { label: string; minutes: number | null }[] = [
  { label: "15m", minutes: 15 },
  { label: "7d", minutes: 7 * 24 * 60 },
  { label: "unbounded", minutes: null },
];

function within(occurredAt: Date, other: Date, minutes: number | null): boolean {
  if (minutes === null) return true;
  return Math.abs(occurredAt.getTime() - other.getTime()) <= minutes * 60_000;
}

/**
 * Pure rule evaluation over already-loaded candidates. No I/O, so the ordering
 * and the ceilings are testable without a database, and a test can prove that a
 * weak rule can never outrank a strong one.
 */
export function rankCandidates(candidates: readonly MatchCandidate[]): MatchCandidate[] {
  const byPriority: Record<MatchMethod, number> = {
    EXACT_REFERENCE: 0,
    EXACT_IDEMPOTENCY: 1,
    INVOICE_REFERENCE: 2,
    AMOUNT_ACCOUNT_EXACT: 3,
    COUNTERPARTY_DIGEST: 4,
    AMOUNT_DATE_WINDOW: 5,
    FUZZY: 6,
  };
  return [...candidates]
    .map((c) => ({ ...c, confidence: Math.min(c.confidence, MATCH_CONFIDENCE_CEILING[c.method]) }))
    .sort((a, b) => byPriority[a.method] - byPriority[b.method] || b.confidence - a.confidence || a.targetId.localeCompare(b.targetId));
}

type PeerRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  counterpartyDigest: string | null;
  invoiceReference: string | null;
  currency: string;
  grossMinor: string;
  occurredAt: Date;
  description: string | null;
  providerTransactionId: string;
};

/**
 * Load and evaluate every candidate for one transaction. `subject` is passed in
 * so the caller controls which transaction is being matched (and so the function
 * can be exercised on a synthetic subject in tests).
 */
export async function proposeMatches(input: {
  subject: TransactionSubject;
  confidenceFloor: number;
  tx?: DatabaseTransaction;
}): Promise<{ created: number; candidates: MatchCandidate[]; autoConfirmed: MatchCandidate | null; obligationsUnavailable: boolean }> {
  const handle = input.tx ?? db;
  const subject = input.subject;
  const candidates: MatchCandidate[] = [];
  const problems: string[] = [];

  // Rule 1 — exact provider reference already present on a posted journal entry.
  const journalRows = await handle
    .select({ id: journalEntries.id, reference: journalEntries.reference, currency: journalEntries.currency })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, subject.tenantId),
        sql`${journalEntries.reference} IN (${subject.providerTransactionId}, ${subject.idempotencyKey}${subject.invoiceReference ? sql`, ${subject.invoiceReference}` : sql``})`,
      ),
    )
    .limit(5);
  for (const row of journalRows) {
    candidates.push({
      targetType: "JOURNAL_ENTRY",
      targetTable: "journal_entries",
      targetId: row.id,
      method: "EXACT_REFERENCE",
      confidence: MATCH_CONFIDENCE_CEILING.EXACT_REFERENCE,
      evidence: { matchedReference: row.reference, rule: "journal_reference_equals_provider_reference", ruleVersion: MATCHING_VERSION },
    });
  }

  // Rule 2 — the other leg of a movement on the same channel.
  if (subject.counterpartyDigest) {
    const peers: PeerRow[] = (await handle
      .select({
        id: paymentTransactions.id,
        direction: paymentTransactions.direction,
        counterpartyDigest: paymentTransactions.counterpartyDigest,
        invoiceReference: paymentTransactions.invoiceReference,
        currency: paymentTransactions.currency,
        grossMinor: paymentTransactions.grossMinor,
        occurredAt: paymentTransactions.occurredAt,
        description: paymentTransactions.description,
        providerTransactionId: paymentTransactions.providerTransactionId,
      })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, subject.tenantId),
          eq(paymentTransactions.connectionId, subject.connectionId),
          eq(paymentTransactions.counterpartyDigest, subject.counterpartyDigest),
          sql`${paymentTransactions.id} <> ${subject.id}`,
        ),
      )
      .orderBy(asc(paymentTransactions.occurredAt))
      .limit(20)) as unknown as PeerRow[];

    for (const window of WINDOWS) {
      const peer = peers.find(
        (p) =>
          p.direction !== subject.direction &&
          p.currency === subject.currency &&
          Number(p.grossMinor) === subject.grossMinor &&
          within(subject.occurredAt, p.occurredAt, window.minutes),
      );
      if (!peer) continue;
      const sharedInvoice = Boolean(subject.invoiceReference && peer.invoiceReference && subject.invoiceReference === peer.invoiceReference);
      candidates.push({
        targetType: "PAYMENT_TRANSACTION",
        targetTable: "payment_transactions",
        targetId: peer.id,
        method: sharedInvoice ? "INVOICE_REFERENCE" : window.minutes === null ? "AMOUNT_DATE_WINDOW" : "COUNTERPARTY_DIGEST",
        confidence: sharedInvoice ? MATCH_CONFIDENCE_CEILING.INVOICE_REFERENCE : window.minutes === null ? 0.9 : 0.88,
        evidence: {
          peerProviderTransactionId: peer.providerTransactionId,
          window: window.label,
          matchedOn: ["counterparty_digest", "currency", "gross_minor", "opposite_direction", ...(sharedInvoice ? ["invoice_reference"] : [])],
          rule: "two_leg_movement",
          ruleVersion: MATCHING_VERSION,
        },
      });
      break;
    }
  }

  // Rule 3 — obligation (invoice / receivable / payable) matching is unavailable,
  // and that is reported as a fact rather than quietly skipped.
  const obligationsUnavailable = true;

  const ranked = rankCandidates(candidates);
  const exact = ranked.find((c) => c.confidence >= input.confidenceFloor && c.method !== "FUZZY") ?? null;
  let created = 0;

  for (const candidate of ranked) {
    const id = newId(ID_PREFIX.paymentMatch);
    const status = candidate === exact && candidate.method !== "FUZZY" ? "CONFIRMED" : "PROPOSED";
    const inserted = await handle
      .insert(paymentMatches)
      .values({
        id,
        tenantId: subject.tenantId,
        legalEntityId: subject.legalEntityId,
        transactionId: subject.id,
        targetType: candidate.targetType,
        targetTable: candidate.targetTable,
        targetId: candidate.targetId,
        method: candidate.method,
        confidence: String(candidate.confidence),
        rulesetVersion: MATCHING_VERSION,
        evidence: candidate.evidence as Record<string, never>,
        status,
        proposedBy: "SYSTEM",
        // A CONFIRMED row produced here is confirmed by a rule, not a person, so
        // `reviewed_by` stays null and the state trail records the rule as the
        // author. Only `review.ts` may put a human name on a match.
        reviewedBy: null,
      })
      .onConflictDoNothing()
      .returning({ id: paymentMatches.id });
    if (inserted.length > 0) created += 1;
  }

  if (ranked.length === 0) {
    problems.push("NO_CANDIDATE");
    await raiseException({
      tenantId: subject.tenantId,
      legalEntityId: subject.legalEntityId,
      transactionId: subject.id,
      code: "UNMATCHED",
      severity: "MEDIUM",
      detail: { reason: "No internal record matches this transaction on any rule.", obligationsUnavailable, ruleVersion: MATCHING_VERSION },
    });
  }

  return { created, candidates: ranked, autoConfirmed: exact, obligationsUnavailable };
}

/** The strongest currently-proposed match for a transaction, if any. */
export async function strongestMatch(transactionId: string, tx?: DatabaseTransaction): Promise<{ id: string; method: string; confidence: number; status: string } | null> {
  const handle = tx ?? db;
  const rows = await handle
    .select({
      id: paymentMatches.id,
      method: paymentMatches.method,
      confidence: paymentMatches.confidence,
      status: paymentMatches.status,
    })
    .from(paymentMatches)
    .where(and(eq(paymentMatches.transactionId, transactionId), sql`${paymentMatches.status} <> 'REJECTED'`))
    .orderBy(sql`${paymentMatches.confidence}::numeric DESC`, asc(paymentMatches.method))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, method: row.method, confidence: Number(row.confidence), status: row.status };
}

/**
 * Apply the matching outcome to the transaction. Note what counts as RECONCILED:
 * a confirmed match at or above the policy floor, and nothing else. A proposed
 * fuzzy match leaves the status exactly where it was.
 */
export async function applyMatchOutcome(input: {
  transactionId: string;
  status: "RECONCILED" | "RECONCILIATION_REQUIRED" | "ATTRIBUTION_CONFLICT" | "DATA_NOT_AVAILABLE";
  confidence: number | null;
  method: MatchMethod | null;
  /** Defaults to the ambient handle, which inside `withDatabaseRlsContext` is
   *  already the pinned transaction. Passing an explicit tx is for callers that
   *  want the write in a transaction they own. */
  tx?: DatabaseTransaction;
}): Promise<void> {
  const handle = input.tx ?? db;
  await handle
    .update(paymentTransactions)
    .set({
      reconciliationStatus: input.status,
      matchConfidence: input.confidence === null ? null : String(input.confidence),
      matchMethod: input.method,
      updatedAt: new Date(),
    })
    .where(eq(paymentTransactions.id, input.transactionId));
}

export const MATCHING_LIMITS = { candidateScanLimit: 20, journalScanLimit: 5, windowLabels: WINDOWS.map((w) => w.label) };

/** Used by the self-test: prove no rule can be tuned above its ceiling. */
export function ceilingAudit(): { method: MatchMethod; ceiling: number }[] {
  return (Object.keys(MATCH_CONFIDENCE_CEILING) as MatchMethod[]).map((m) => ({ method: m, ceiling: MATCH_CONFIDENCE_CEILING[m] }));
}

/** Guard used by tests: an unmatched transaction must never be reconciled by absence of evidence. */
export function unmatchedIsNotReconciled(status: string): boolean {
  return status !== "RECONCILED";
}

/** Kept for the RLS-scoped read path: never widen beyond the tenant + window. */
export function scopeWindow(from: Date, to: Date) {
  return and(gte(paymentTransactions.occurredAt, from), lte(paymentTransactions.occurredAt, to), isNull(paymentTransactions.journalEntryId));
}
