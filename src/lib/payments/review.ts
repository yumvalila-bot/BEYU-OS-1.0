/**
 * Human review: the only route by which an uncertain payment becomes certain.
 *
 * REUSED, NOT REINVENTED
 *   Separation of duties comes from `checkRoleSeparation()` in
 *   `src/lib/finance/workflow.ts`, and its history is rebuilt from
 *   `payment_transaction_states` — the same trail the machine writes. So the rule
 *   "whoever prepared it may not confirm it" is enforced by the platform's policy
 *   function, and a payment-specific copy of it does not exist to drift.
 *
 * WHAT CONFIRMATION ACTUALLY DOES
 *   It raises `trust_level` to CONFIRMED_MANUAL and, for a match, moves the row to
 *   CONFIRMED with the reviewer's name and reason. It does not post, does not
 *   change the amount, and does not resolve an exception on the reviewer's behalf:
 *   resolving an exception is its own recorded act.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentExceptions, paymentMatches, paymentTransactionStates, paymentTransactions } from "@/db/schema";
import { ID_PREFIX, newId } from "@/lib/ids";
import { appendPaymentAudit } from "./audit-scope";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { checkRoleSeparation, CONTROL_ROLE, rolesHeldBy, type ControlRole, type WorkflowStep } from "@/lib/finance/workflow";
import { assertTransition, MATCH_CONFIDENCE_CEILING } from "./domain";
import { raiseException } from "./exceptions";

export const REVIEW_VERSION = "payment-review-1.0.0";

export class ReviewDeniedError extends Error {
  readonly code = "SEGREGATION_OF_DUTIES";
  constructor(message: string) {
    super(message);
    this.name = "ReviewDeniedError";
  }
}

/** Machine rows carry no control role; a human act must, or the trail cannot be audited. */
const ROLE_FOR_ACT = {
  confirm_match: "CHECKER",
  reject_match: "CHECKER",
  confirm_transaction: "AUTHORIZER",
  resolve_exception: "CHECKER",
  accept_risk: "AUTHORIZER",
} as const satisfies Record<string, ControlRole>;

export type ReviewAct = keyof typeof ROLE_FOR_ACT;

export const REQUIRED_PERMISSION: Record<ReviewAct, string> = {
  confirm_match: "finance:payments.review",
  reject_match: "finance:payments.review",
  confirm_transaction: "finance:payments.authorize",
  resolve_exception: "finance:payments.review",
  accept_risk: "finance:payments.authorize",
};

/**
 * The trail read is scoped to the transaction's tenant when the caller knows it.
 * `db` under the runtime role sees nothing without a tenant context, so an unscoped
 * read here is not merely untidy: the review path returns SEGREGATION_OF_DUTIES
 * pass/fail based on an empty history, and the exception lookup returns NOT_FOUND
 * for a row that exists. Discovered by the DR drill, which runs as the runtime role
 * rather than as a test superuser.
 */
async function historyFor(transactionId: string, tenantId?: string | null): Promise<WorkflowStep[]> {
  type RawStep = { actorUserId: string | null; controlRole: string | null; reason: string | null; occurredAt: Date | null; traceId: string | null };
  const trailRead = (): Promise<RawStep[]> => db
    .select({
      actorUserId: paymentTransactionStates.actorUserId,
      controlRole: paymentTransactionStates.controlRole,
      reason: paymentTransactionStates.reason,
      occurredAt: paymentTransactionStates.occurredAt,
      traceId: paymentTransactionStates.traceId,
    })
    .from(paymentTransactionStates)
    .where(eq(paymentTransactionStates.transactionId, transactionId))
    // An ordering is not a predicate: passing asc() to and() builds invalid SQL,
    // which surfaced the first time a human review act ran against a database.
    .orderBy(asc(paymentTransactionStates.occurredAt)) as unknown as Promise<RawStep[]>;
  // The state trail records only the five money axes — that vocabulary is the
  // schema's, and a review act is not a change to the money's state. So an
  // exception decision is read from the record that carries it, instead of faking
  // a row on an axis the posting gate consumes. Without this, the person who
  // cleared a blocking data gap was invisible to separation of duties and could
  // then accept the residual risk on the same payment: measured before the fix,
  // `assertSeparation` reported `alreadyHeld: []` after a real resolution.
  const decisionRead = (): Promise<RawStep[]> => db
    .select({
      actorUserId: paymentExceptions.reviewedBy,
      controlRole: paymentExceptions.status,
      reason: paymentExceptions.resolution,
      occurredAt: paymentExceptions.resolvedAt,
      traceId: paymentExceptions.correlationId,
    })
    .from(paymentExceptions)
    .where(
      and(
        eq(paymentExceptions.transactionId, transactionId),
        sql`${paymentExceptions.status} <> 'OPEN'`,
        sql`${paymentExceptions.reviewedBy} is not null`,
      ),
    ) as unknown as Promise<RawStep[]>;

  let trail: RawStep[] = [];
  let decisions: RawStep[] = [];
  if (tenantId) {
    [trail, decisions] = await withDatabaseRlsContext([tenantId], false, async () => [await trailRead(), await decisionRead()] as [RawStep[], RawStep[]]);
  } else {
    trail = await trailRead();
    decisions = await decisionRead();
  }

  const roleOf = (raw: RawStep): ControlRole | null => {
    if (!raw.controlRole) return null;
    // An accepted risk is an authorizing act; every other recorded decision is a
    // check. Both come from ROLE_FOR_ACT's own vocabulary, not a new policy.
    if (raw.controlRole === "ACCEPTED_RISK") return "AUTHORIZER";
    if (raw.controlRole === "CHECKER" || raw.controlRole === "AUTHORIZER" || raw.controlRole === "MAKER" || raw.controlRole === "EXECUTOR") {
      return raw.controlRole;
    }
    return "CHECKER";
  };

  return [...trail, ...decisions]
    .filter((r) => r.actorUserId)
    .map((r): WorkflowStep => ({
      actorUserId: r.actorUserId as string,
      role: roleOf(r) as ControlRole,
      // The axis state names are not WorkflowStates; the step records the ACT, and
      // `checkRoleSeparation` only consumes the actor/role pair. Using DRAFT for the
      // state keeps the type honest without inventing a workflow state.
      state: "DRAFT",
      at: (r.occurredAt ?? new Date(0)).toISOString(),
      reason: r.reason ?? "",
      traceId: r.traceId ?? "unknown",
    }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
/**
 * The segregation check, exposed separately so a test can prove it is real
 * without performing a mutation, and so a UI can grey out an action for the
 * right reason instead of a generic 403.
 */
export async function assertSeparation(input: {
  transactionId: string;
  actorUserId: string;
  act: ReviewAct;
  tenantId?: string | null;
}): Promise<{ permitted: boolean; reason: string; alreadyHeld: ControlRole[] }> {
  const history = await historyFor(input.transactionId, input.tenantId ?? null);
  const role = ROLE_FOR_ACT[input.act];
  const verdict = checkRoleSeparation({ history, actorUserId: input.actorUserId, role });
  return {
    permitted: verdict.permitted,
    reason: verdict.reason,
    alreadyHeld: rolesHeldBy(history, input.actorUserId),
  };
}

export type ReviewResult =
  | { ok: true; act: ReviewAct; transactionId: string; matchId?: string; exceptionId?: string; trustLevel: string; detail: string }
  | { ok: false; code: "SEGREGATION_OF_DUTIES" | "NOT_FOUND" | "CONFIDENCE_FLOOR" | "ALREADY_DECIDED" | "IMMUTABLE_DECISION"; message: string };

/**
 * A refused control act is written down. `objectType` names the review module so the
 * row can be found again, and the outcome is DENIED rather than FAILURE: the control
 * worked, which is the whole point of recording it.
 */
async function recordReviewDenial(input: {
  tenantId: string;
  actorUserId: string;
  objectId: string;
  reason: string;
  correlationId: string | null;
}): Promise<void> {
  try {
    await appendPaymentAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actorType: "HUMAN",
      action: "PAYMENT_REVIEW_REFUSED",
      objectType: "payment_review",
      objectId: input.objectId,
      outcome: "DENIED",
      reason: input.correlationId ? `${input.reason.slice(0, 280)} [correlation ${input.correlationId}]` : input.reason.slice(0, 300),
      authority: REVIEW_VERSION,
      newValue: null,
    });
  } catch {
    // A refusal must be returned to the caller even if the audit write itself failed;
    // swallowing here would turn a control into an outage.
  }
}

/**
 * Confirm or reject a proposed match. Confirmation requires that the actor has
 * not already acted on this transaction, and refuses to promote a match whose
 * method cannot support the confidence being asserted (the ceiling in
 * `domain.ts`, not a value chosen here).
 */
export async function decideMatch(input: {
  tenantId: string;
  matchId: string;
  decision: "CONFIRM" | "REJECT";
  actorUserId: string;
  reason: string;
  confidenceFloor: number;
  correlationId?: string | null;
}): Promise<ReviewResult> {
  if (!input.reason || input.reason.trim().length < 5) {
    return { ok: false, code: "CONFIDENCE_FLOOR", message: "A review decision without a recorded reason is not a review decision." };
  }
  const rows = await withDatabaseRlsContext([input.tenantId], false, () =>
    db.select().from(paymentMatches).where(eq(paymentMatches.id, input.matchId)).limit(1),
  );
  const match = rows[0];
  if (!match) return { ok: false, code: "NOT_FOUND", message: "Match not visible in this scope." };
  if (match.tenantId !== input.tenantId) {
    return { ok: false, code: "NOT_FOUND", message: "Match not visible in this scope." };
  }
  if (match.status !== "PROPOSED") {
    return { ok: false, code: "ALREADY_DECIDED", message: `This match is ${match.status}; decisions are frozen and a later change is a new match plus an exception.` };
  }

  const separation = await assertSeparation({ transactionId: match.transactionId, actorUserId: input.actorUserId, act: input.decision === "CONFIRM" ? "confirm_match" : "reject_match" });
  if (!separation.permitted) return { ok: false, code: "SEGREGATION_OF_DUTIES", message: separation.reason };

  const ceiling = MATCH_CONFIDENCE_CEILING[match.method as keyof typeof MATCH_CONFIDENCE_CEILING];
  const asserted = Number(match.confidence);
  if (input.decision === "CONFIRM" && asserted > (ceiling ?? 0)) {
    return {
      ok: false,
      code: "CONFIDENCE_FLOOR",
      message: `Method ${match.method} can support at most ${ceiling}; the row asserts ${asserted}. Refusing to confirm an impossible match.`,
    };
  }
  if (input.decision === "CONFIRM" && asserted < input.confidenceFloor) {
    return {
      ok: false,
      code: "CONFIDENCE_FLOOR",
      message: `Confidence ${asserted} is below the governed floor ${input.confidenceFloor}. A human decision may raise trust to CONFIRMED_MANUAL, but it may not relabel the machine's confidence.`,
    };
  }

  await withDatabaseRlsContext([input.tenantId], false, async () => {
    await db
      .update(paymentMatches)
      .set({
        status: input.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED",
        reviewedBy: input.actorUserId,
        reviewedAt: new Date(),
        reviewReason: input.reason.slice(0, 500),
      })
      .where(eq(paymentMatches.id, input.matchId));

    if (input.decision === "CONFIRM") {
      const txRows = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, match.transactionId)).limit(1);
      const tx = txRows[0];
      if (tx) {
        const transition = assertTransition({ axis: "TRUST", from: tx.trustLevel, to: "CONFIRMED_MANUAL" });
        await db
          .update(paymentTransactions)
          .set({ trustLevel: "CONFIRMED_MANUAL", reconciliationStatus: "RECONCILED", matchConfidence: String(asserted), matchMethod: match.method, updatedAt: new Date() })
          .where(eq(paymentTransactions.id, tx.id));
        await db.insert(paymentTransactionStates).values({
          id: newId(ID_PREFIX.paymentStateTransition),
          tenantId: tx.tenantId,
          transactionId: tx.id,
          axis: "TRUST",
          fromState: transition.from,
          toState: transition.to,
          reason: input.reason.slice(0, 500),
          actorType: "HUMAN",
          actorUserId: input.actorUserId,
          controlRole: ROLE_FOR_ACT.confirm_match,
          evidence: { matchId: input.matchId, method: match.method, confidence: asserted } as unknown as Record<string, never>,
          policyVersion: REVIEW_VERSION,
          correlationId: input.correlationId ?? null,
        });
        await db.insert(paymentTransactionStates).values({
          id: newId(ID_PREFIX.paymentStateTransition),
          tenantId: tx.tenantId,
          transactionId: tx.id,
          axis: "RECONCILIATION",
          fromState: tx.reconciliationStatus,
          toState: "RECONCILED",
          reason: `match ${input.matchId} confirmed by ${input.actorUserId}`,
          actorType: "HUMAN",
          actorUserId: input.actorUserId,
          controlRole: ROLE_FOR_ACT.confirm_match,
          evidence: {} as unknown as Record<string, never>,
          policyVersion: REVIEW_VERSION,
          correlationId: input.correlationId ?? null,
        });
      }
    } else {
      await raiseException({
        tenantId: input.tenantId,
        legalEntityId: match.legalEntityId,
        transactionId: match.transactionId,
        code: "UNMATCHED",
        severity: "MEDIUM",
        detail: { reason: "proposed match rejected", matchId: input.matchId, method: match.method, by: input.actorUserId },
        correlationId: input.correlationId ?? null,
      });
      await db.insert(paymentTransactionStates).values({
        id: newId(ID_PREFIX.paymentStateTransition),
        tenantId: input.tenantId,
        transactionId: match.transactionId,
        axis: "RECONCILIATION",
        fromState: "RECONCILIATION_REQUIRED",
        toState: "RECONCILIATION_REQUIRED",
        reason: `match ${input.matchId} rejected: ${input.reason.slice(0, 300)}`,
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        controlRole: ROLE_FOR_ACT.reject_match,
        evidence: { matchId: input.matchId } as unknown as Record<string, never>,
        policyVersion: REVIEW_VERSION,
        correlationId: input.correlationId ?? null,
      });
    }

    await appendPaymentAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actorType: "HUMAN",
      action: input.decision === "CONFIRM" ? "PAYMENT_MATCH_CONFIRMED" : "PAYMENT_MATCH_REJECTED",
      objectType: "payment_match",
      objectId: input.matchId,
      outcome: "SUCCESS",
      reason: input.reason.slice(0, 300),
      authority: REVIEW_VERSION,
      newValue: { decision: input.decision, method: match.method, confidence: asserted },
    });
  });

  return {
    ok: true,
    act: input.decision === "CONFIRM" ? "confirm_match" : "reject_match",
    transactionId: match.transactionId,
    matchId: input.matchId,
    trustLevel: input.decision === "CONFIRM" ? "CONFIRMED_MANUAL" : "unchanged",
    detail: input.decision === "CONFIRM" ? "Match confirmed by a named reviewer who had not previously acted on this transaction." : "Match rejected; the transaction returned to the unmatched queue.",
  };
}

/**
 * Resolve or accept-risk an exception. `ACCEPTED_RISK` is deliberately as
 * accountable as `RESOLVED`: it needs the same named actor, and it never deletes
 * the row. Accepting risk on a blocking exception is what unblocks accounting, so
 * it is the act most in need of a witness.
 */
export async function decideException(input: {
  tenantId: string;
  exceptionId: string;
  decision: "RESOLVED" | "ACCEPTED_RISK" | "ESCALATED";
  actorUserId: string;
  resolution: string;
  correlationId?: string | null;
}): Promise<ReviewResult> {
  if (input.resolution.trim().length < 5) {
    // A control act that was refused still happened: who tried to close a blocking
    // exception without writing a reason is exactly what a reviewer of the control
    // needs to be able to find later.
    await recordReviewDenial({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      objectId: input.exceptionId,
      reason: "A closure without a written resolution is refused.",
      correlationId: input.correlationId ?? null,
    });
    return { ok: false, code: "CONFIDENCE_FLOOR", message: "A closure without a written resolution is refused." };
  }
  const rows = await withDatabaseRlsContext([input.tenantId], false, () =>
    db.select().from(paymentExceptions).where(eq(paymentExceptions.id, input.exceptionId)).limit(1),
  );
  const exception = rows[0];
  if (!exception) return { ok: false, code: "NOT_FOUND", message: "Exception not visible in this scope." };
  // The session scope is established FROM `input.tenantId`, so a caller that names one
  // tenant and an id belonging to another would otherwise be trusted to have matched
  // them already. A privileged handle (the migration role, a test superuser) sees the
  // row, so this check is what stands between a wrong id and another tenant's money.
  if (exception.tenantId !== input.tenantId) {
    return { ok: false, code: "NOT_FOUND", message: "Exception not visible in this scope." };
  }
  if (exception.status === "RESOLVED") return { ok: false, code: "IMMUTABLE_DECISION", message: "This exception is already resolved." };
  if (exception.transactionId) {
    const separation = await assertSeparation({
      transactionId: exception.transactionId,
      actorUserId: input.actorUserId,
      act: input.decision === "ACCEPTED_RISK" ? "accept_risk" : "resolve_exception",
      tenantId: input.tenantId,
    });
    if (!separation.permitted) {
      await recordReviewDenial({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        objectId: exception.transactionId ?? input.exceptionId,
        reason: separation.reason,
        correlationId: input.correlationId ?? null,
      });
      return { ok: false, code: "SEGREGATION_OF_DUTIES", message: separation.reason };
    }
  }

  await withDatabaseRlsContext([input.tenantId], false, async () => {
    await db
      .update(paymentExceptions)
      .set({
        status: input.decision,
        reviewedBy: input.actorUserId,
        resolution: input.resolution.slice(0, 1000),
        resolvedAt: input.decision === "ESCALATED" ? null : new Date(),
        blocking: input.decision === "ESCALATED" ? exception.blocking : 0,
      })
      .where(eq(paymentExceptions.id, input.exceptionId));
    await appendPaymentAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actorType: "HUMAN",
      action: `PAYMENT_EXCEPTION_${input.decision}`,
      objectType: "payment_exception",
      objectId: input.exceptionId,
      outcome: "SUCCESS",
      reason: input.resolution.slice(0, 300),
      authority: REVIEW_VERSION,
      newValue: { code: exception.code, severity: exception.severity, wasBlocking: exception.blocking === 1 },
    });
  });

  return {
    ok: true,
    act: input.decision === "ACCEPTED_RISK" ? "accept_risk" : "resolve_exception",
    transactionId: exception.transactionId ?? "",
    exceptionId: input.exceptionId,
    trustLevel: "unchanged",
    detail: input.decision === "ACCEPTED_RISK" ? "Risk accepted by a named actor; the exception row remains with the decision recorded." : "Exception resolved with a written resolution.",
  };
}

/** Queue for a human: open exceptions plus their transaction's four axis states. */
export async function reviewQueue(tenantId: string, limit = 50) {
  // The WHERE clause is not the isolation mechanism. The table's own policy needs a
  // session tenant context, so an unscoped read hands back an empty queue to the
  // runtime role and a full one to a privileged handle — and both look plausible in
  // a log.
  return withDatabaseRlsContext([tenantId], false, () => db
    .select({
      id: paymentExceptions.id,
      code: paymentExceptions.code,
      severity: paymentExceptions.severity,
      status: paymentExceptions.status,
      blocking: paymentExceptions.blocking,
      transactionId: paymentExceptions.transactionId,
      createdAt: paymentExceptions.createdAt,
      trustLevel: paymentTransactions.trustLevel,
      verificationStatus: paymentTransactions.verificationStatus,
      reconciliationStatus: paymentTransactions.reconciliationStatus,
      accountingStatus: paymentTransactions.accountingStatus,
      currency: paymentTransactions.currency,
      grossMinor: paymentTransactions.grossMinor,
      bestMatch: sql<string | null>`(SELECT m.method FROM payment_matches m WHERE m.transaction_id = ${paymentExceptions.transactionId} AND m.status = 'PROPOSED' ORDER BY m.confidence::numeric DESC LIMIT 1)`,
    })
    .from(paymentExceptions)
    .leftJoin(paymentTransactions, eq(paymentTransactions.id, paymentExceptions.transactionId))
    .where(and(eq(paymentExceptions.tenantId, tenantId), sql`${paymentExceptions.status} = 'OPEN'`))
    .orderBy(sql`${paymentExceptions.severity} = 'CRITICAL' DESC, ${paymentExceptions.createdAt} DESC`)
    .limit(limit));
}
