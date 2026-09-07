/**
 * Payment exceptions: the pipeline's honest failures, persisted as first-class
 * records instead of log lines.
 *
 * WHY EXCEPTIONS ARE THE PRODUCT
 *   An ingestion system that cannot explain itself quietly is worthless for
 *   money. Every "we could not determine this" here becomes a row with a code, a
 *   severity, a blocking flag and a named reviewer requirement. Nothing in this
 *   module resolves an exception; resolution is a human act recorded elsewhere.
 *   `blocking = 1` is what the accounting gate counts.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type DatabaseTransaction } from "@/db";
import { paymentExceptions } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";

export const EXCEPTION_VERSION = "payment-exceptions-1.0.0";

export const EXCEPTION_CODE = [
  "UNSIGNED_PAYLOAD",
  "BAD_TIMESTAMP",
  "REPLAY_SUSPECTED",
  "PAYLOAD_UNPARSEABLE",
  "AMOUNT_MISSING",
  "FEE_AND_TAX_EXCEED_GROSS",
  "NET_UNRESOLVED",
  "UNKNOWN_PARTY",
  "PARTY_AMBIGUOUS",
  "UNMATCHED",
  "AMOUNT_MISMATCH",
  "DUPLICATE_CONFLICT",
  "MISSING_ACCOUNT_MAPPING",
  "POLICY_MISSING",
  "CAPABILITY_LOCKED",
  "LIMIT_EXCEEDED",
  "FX_RATE_UNAVAILABLE",
  "PERIOD_CLOSED",
  "SETTLEMENT_SHORTFALL",
  "SETTLEMENT_ORPHAN_ITEM",
  "SETTLEMENT_AMOUNT_MISMATCH",
  "PROVIDER_NOT_INTEGRATED",
  "POSTING_REJECTED",
  "TIMING_MISMATCH",
  "PROVIDER_DATA_REFUSED",
] as const;
export type ExceptionCode = (typeof EXCEPTION_CODE)[number];

export const BLOCKING_EXCEPTION_CODES: readonly ExceptionCode[] = [
  "UNSIGNED_PAYLOAD",
  "PAYLOAD_UNPARSEABLE",
  "AMOUNT_MISSING",
  "NET_UNRESOLVED",
  "UNKNOWN_PARTY",
  "PARTY_AMBIGUOUS",
  "UNMATCHED",
  "AMOUNT_MISMATCH",
  "DUPLICATE_CONFLICT",
  "MISSING_ACCOUNT_MAPPING",
  "POLICY_MISSING",
  "LIMIT_EXCEEDED",
  "FX_RATE_UNAVAILABLE",
  "PERIOD_CLOSED",
  "SETTLEMENT_SHORTFALL",
  "SETTLEMENT_AMOUNT_MISMATCH",
  "TIMING_MISMATCH",
  "PROVIDER_DATA_REFUSED",
];

export type RaiseExceptionInput = {
  tenantId: string;
  legalEntityId: string | null;
  transactionId?: string | null;
  webhookEventId?: string | null;
  code: ExceptionCode;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detail?: Record<string, unknown>;
  raisedBy?: string;
  correlationId?: string | null;
};

/**
 * Insert-once semantics: the same code on the same subject does not accumulate
 * rows, it increments attention. `detail` is deliberately NOT part of the
 * dedupe key so a repeated failure with new context still updates the original,
 * and the audit trail carries the individual attempts.
 */
export async function raiseException(
  input: RaiseExceptionInput,
  tx?: DatabaseTransaction,
): Promise<{ id: string; deduped: boolean }> {
  const handle = tx ?? db;
  const blocking = BLOCKING_EXCEPTION_CODES.includes(input.code) ? 1 : 0;
  const existing = await handle
    .select({ id: paymentExceptions.id })
    .from(paymentExceptions)
    .where(
      and(
        eq(paymentExceptions.tenantId, input.tenantId),
        input.transactionId ? eq(paymentExceptions.transactionId, input.transactionId) : sql`"transaction_id" IS NULL`,
        input.webhookEventId ? eq(paymentExceptions.webhookEventId, input.webhookEventId) : sql`"webhook_event_id" IS NULL`,
        eq(paymentExceptions.code, input.code),
        sql`"status" <> 'RESOLVED'`,
      ),
    )
    .limit(1);
  if (existing[0]) {
    await handle
      .update(paymentExceptions)
      .set({ detail: (input.detail ?? {}) as Record<string, never> })
      .where(eq(paymentExceptions.id, existing[0].id));
    return { id: existing[0].id, deduped: true };
  }
  const id = newId(ID_PREFIX.paymentException);
  await handle.insert(paymentExceptions).values({
    id,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    transactionId: input.transactionId ?? null,
    webhookEventId: input.webhookEventId ?? null,
    code: input.code,
    severity: input.severity ?? "MEDIUM",
    status: "OPEN",
    detail: (input.detail ?? {}) as Record<string, never>,
    blocking,
    raisedBy: input.raisedBy ?? "SYSTEM",
    correlationId: input.correlationId ?? null,
  });
  return { id, deduped: false };
}

/** What the accounting gate counts. Only blocking, unresolved exceptions count. */
export async function countBlockingExceptions(transactionId: string, tx?: DatabaseTransaction): Promise<number> {
  const handle = tx ?? db;
  const rows = await handle
    .select({ n: sql<number>`count(*)::int` })
    .from(paymentExceptions)
    .where(
      and(
        eq(paymentExceptions.transactionId, transactionId),
        eq(paymentExceptions.blocking, 1),
        sql`"status" <> 'RESOLVED'`,
      ),
    );
  return Number(rows[0]?.n ?? 0);
}
