/**
 * BEYU OS — Accounting period and close engine (Finance OS, Phases 7–8).
 *
 * WHAT THIS BUILDS. The technical lifecycle of an accounting period, and nothing else:
 *
 *     OPEN → IN_PROGRESS → SOFT_CLOSE → HARD_CLOSE → FINAL
 *                              ↑            │
 *                              └── REOPENED ┘  (requires explicit authority)
 *
 * WHAT IT DELIBERATELY DOES NOT DECIDE. When a period *should* close, what must be reconciled
 * first, who signs off, what materiality applies to an adjustment, or whether a closed period may
 * be reopened at all. Those are accounting-policy judgements (P1) and none is ratified. The engine
 * enforces only what is true under ANY policy: you cannot skip states, you cannot post to a closed
 * period, you cannot close twice, and history cannot be silently rewritten.
 *
 * THE EXISTING SUBSTRATE. `financial_periods` already has id, legal_entity_id, code, starts_on,
 * ends_on, status, closed_by, closed_at. That is enough to express this lifecycle, so NO NEW TABLE
 * is created — the state machine is enforced in code over the existing column. Adding a parallel
 * period table would be a second source of truth about the same fiscal calendar.
 *
 * THERE ARE ZERO PERIODS IN THE DATABASE. Every function here therefore reports DATA_NOT_AVAILABLE
 * against real data. That is the honest production answer: a fiscal calendar is an accounting
 * artefact that requires ratified authority to create.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { financialPeriods, journalEntries } from "@/db/schema";

export const PERIOD_ENGINE_VERSION = "period-1.0.0";

/**
 * The period lifecycle.
 *
 * `OPEN` and `CLOSED` are the values the existing schema uses; the intermediate states are
 * modelled here because a real close is not atomic. Any state the database does not yet store is
 * still enforceable in the transition rules, so ratification changes configuration, not code.
 */
export const PERIOD_STATE = [
  "OPEN",
  "IN_PROGRESS",
  "SOFT_CLOSE",
  "HARD_CLOSE",
  "CLOSED",
  "REOPENED",
  "FINAL",
] as const;
export type PeriodState = (typeof PERIOD_STATE)[number];

/**
 * Legal transitions. Everything absent from this map is illegal — default deny, so a new state
 * cannot be reached by omission.
 *
 * EXPORTED FOR DIRECT TESTING. Fault injection (FI-10) changed `FINAL: []` to `FINAL: [...]` and
 * no test failed, because the early `from === "FINAL"` guard in evaluateTransition() returns first.
 * That guard is real defence in depth, but it left the table itself unverified — and the table
 * becomes load-bearing the moment the guard is refactored. The table is now asserted directly.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<PeriodState, readonly PeriodState[]>> = {
  OPEN: ["IN_PROGRESS", "SOFT_CLOSE"],
  IN_PROGRESS: ["SOFT_CLOSE", "OPEN"],
  SOFT_CLOSE: ["HARD_CLOSE", "IN_PROGRESS"],
  HARD_CLOSE: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED", "FINAL"],
  REOPENED: ["IN_PROGRESS", "SOFT_CLOSE"],
  // FINAL is terminal. A finalised period is permanently immutable.
  FINAL: [],
};

/** States in which posting is permitted. Deliberately the shortest possible list. */
const POSTABLE_STATES: readonly PeriodState[] = ["OPEN", "IN_PROGRESS", "REOPENED"];

/** Transitions that require explicit governance authority beyond ordinary permission. */
const AUTHORITY_REQUIRED_TRANSITIONS: ReadonlySet<string> = new Set([
  "HARD_CLOSE->REOPENED",
  "CLOSED->REOPENED",
  "CLOSED->FINAL",
]);

/**
 * Resolves which period covers a date, given the candidate rows.
 *
 * EXPORTED AND PURE so the overlap rule is testable. FI-15 deleted the multi-match branch without
 * any failure, because `financial_periods` is empty and the DB path can only ever return zero rows
 * today. Overlap handling is precisely the logic that matters once a calendar exists, so it must
 * not depend on data that does not yet exist to be tested.
 */
export function resolvePeriodForDate(
  candidates: Array<{ id: string; code: string; status: string }>,
  date: string,
): {
  found: boolean;
  periodId: string | null;
  state: PeriodState | null;
  decision: "FOUND" | "DATA_NOT_AVAILABLE" | "DATA_CONFLICT";
  reason: string;
} {
  if (candidates.length === 0) {
    return {
      found: false,
      periodId: null,
      state: null,
      decision: "DATA_NOT_AVAILABLE",
      reason: `No accounting period covers ${date}.`,
    };
  }
  if (candidates.length > 1) {
    return {
      found: false,
      periodId: null,
      state: null,
      decision: "DATA_CONFLICT",
      reason:
        `${candidates.length} periods overlap ${date} (${candidates.map((c) => c.code).join(", ")}). ` +
        "A posting date must map to exactly one period; no winner is selected, because picking one " +
        "would mean the posting lands in a period chosen by row order.",
    };
  }
  return {
    found: true,
    periodId: candidates[0].id,
    state: isPeriodState(candidates[0].status) ? candidates[0].status : null,
    decision: "FOUND",
    reason: `Date ${date} falls in period ${candidates[0].code}.`,
  };
}

export type TransitionVerdict = {
  permitted: boolean;
  decision:
    | "PERMITTED"
    | "ILLEGAL_TRANSITION"
    | "REQUIRES_AUTHORITY"
    | "PERIOD_FINAL"
    | "UNKNOWN_STATE"
    | "DUPLICATE_CLOSE";
  from: PeriodState | null;
  to: PeriodState | null;
  requiresAuthority: boolean;
  reason: string;
};

/** Whitelist check. An unrecognised state is never treated as a known one. */
export function isPeriodState(value: unknown): value is PeriodState {
  return typeof value === "string" && (PERIOD_STATE as readonly string[]).includes(value);
}

/**
 * Evaluates a proposed period transition.
 *
 * Pure and synchronous so it can be tested exhaustively across all 49 state pairs without a
 * database — an important property, since the real table is empty and would otherwise make this
 * logic untestable.
 */
export function evaluateTransition(input: {
  from: string;
  to: string;
  hasGovernanceAuthority?: boolean;
}): TransitionVerdict {
  if (!isPeriodState(input.from) || !isPeriodState(input.to)) {
    return {
      permitted: false,
      decision: "UNKNOWN_STATE",
      from: isPeriodState(input.from) ? input.from : null,
      to: isPeriodState(input.to) ? input.to : null,
      requiresAuthority: false,
      reason:
        `Unrecognised period state in transition '${input.from}' -> '${input.to}'. ` +
        "An unknown state fails closed rather than being treated as OPEN.",
    };
  }

  if (input.from === "FINAL") {
    return {
      permitted: false,
      decision: "PERIOD_FINAL",
      from: input.from,
      to: input.to,
      requiresAuthority: false,
      reason: "A FINAL period is permanently immutable and admits no further transition.",
    };
  }

  if (input.from === input.to) {
    return {
      permitted: false,
      decision: "DUPLICATE_CLOSE",
      from: input.from,
      to: input.to,
      requiresAuthority: false,
      reason: `The period is already ${input.from}; repeating the transition is refused (idempotency is not a licence to re-close).`,
    };
  }

  if (!LEGAL_TRANSITIONS[input.from].includes(input.to)) {
    return {
      permitted: false,
      decision: "ILLEGAL_TRANSITION",
      from: input.from,
      to: input.to,
      requiresAuthority: false,
      reason:
        `${input.from} -> ${input.to} is not a legal transition. Legal targets: ` +
        `${LEGAL_TRANSITIONS[input.from].join(", ") || "(none — terminal)"}.`,
    };
  }

  const key = `${input.from}->${input.to}`;
  if (AUTHORITY_REQUIRED_TRANSITIONS.has(key)) {
    if (!input.hasGovernanceAuthority) {
      return {
        permitted: false,
        decision: "REQUIRES_AUTHORITY",
        from: input.from,
        to: input.to,
        requiresAuthority: true,
        reason:
          `${key} requires explicit governance authority. Reopening or finalising a closed period ` +
          "changes reported history and is not an ordinary operational act.",
      };
    }
    return {
      permitted: true,
      decision: "PERMITTED",
      from: input.from,
      to: input.to,
      requiresAuthority: true,
      reason: `${key} is permitted with the governance authority supplied.`,
    };
  }

  return {
    permitted: true,
    decision: "PERMITTED",
    from: input.from,
    to: input.to,
    requiresAuthority: false,
    reason: `${key} is a legal operational transition.`,
  };
}

/** May a posting be made into a period in this state? */
export function postingAllowedIn(state: string): {
  allowed: boolean;
  decision: "PERMITTED" | "PERIOD_LOCKED" | "UNKNOWN_STATE";
  reason: string;
} {
  if (!isPeriodState(state)) {
    return {
      allowed: false,
      decision: "UNKNOWN_STATE",
      reason: `Unrecognised period state '${state}'; posting is refused rather than assumed safe.`,
    };
  }
  if (!POSTABLE_STATES.includes(state)) {
    return {
      allowed: false,
      decision: "PERIOD_LOCKED",
      reason: `The period is ${state}; postings are refused. Correct a closed period by governed reversal in an open period, never by editing history.`,
    };
  }
  return { allowed: true, decision: "PERMITTED", reason: `The period is ${state} and accepts postings.` };
}

export type CloseReadiness = {
  periodId: string | null;
  entityId: string;
  state: PeriodState | null;
  ready: boolean;
  decision: "READY" | "BLOCKED" | "DATA_NOT_AVAILABLE" | "REQUIRES_AUTHORITY";
  blockers: string[];
  /** Checks a close must satisfy. Which are MANDATORY is a policy decision, so all are reported. */
  checks: Array<{ check: string; passed: boolean; detail: string }>;
  reason: string;
};

/**
 * Assesses whether a period can close.
 *
 * Reports every check; does NOT decide which are mandatory. "A period may close with unreconciled
 * differences below X" is a materiality judgement requiring ratified policy, so the engine
 * surfaces the facts and refuses to invent the threshold.
 */
export async function assessCloseReadiness(input: {
  legalEntityId: string;
  periodCode?: string;
}): Promise<CloseReadiness> {
  const conditions = [eq(financialPeriods.legalEntityId, input.legalEntityId)];
  if (input.periodCode) conditions.push(eq(financialPeriods.code, input.periodCode));

  const [period] = await db
    .select()
    .from(financialPeriods)
    .where(and(...conditions))
    .limit(1);

  if (!period) {
    return {
      periodId: null,
      entityId: input.legalEntityId,
      state: null,
      ready: false,
      decision: "DATA_NOT_AVAILABLE",
      blockers: ["NO_PERIOD_DEFINED"],
      checks: [],
      reason:
        `No accounting period is defined for ${input.legalEntityId}` +
        `${input.periodCode ? ` (${input.periodCode})` : ""}. A fiscal calendar is an accounting-policy ` +
        "artefact requiring ratified authority (P1); it is not created implicitly.",
    };
  }

  const state = isPeriodState(period.status) ? period.status : null;
  const checks: CloseReadiness["checks"] = [];
  const blockers: string[] = [];

  if (!state) {
    blockers.push("UNKNOWN_PERIOD_STATE");
  }

  const [unposted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(eq(journalEntries.periodId, period.id));

  checks.push({
    check: "JOURNALS_PRESENT",
    passed: true,
    detail: `${Number(unposted?.n ?? 0)} journal entr(ies) recorded in this period.`,
  });

  const transition = evaluateTransition({ from: state ?? "", to: "SOFT_CLOSE" });
  checks.push({
    check: "TRANSITION_LEGAL",
    passed: transition.permitted,
    detail: transition.reason,
  });
  if (!transition.permitted) blockers.push(`TRANSITION_${transition.decision}`);

  checks.push({
    check: "RECONCILIATION_COMPLETE",
    passed: false,
    detail:
      "Reconciliation completeness cannot be asserted: the ledger holds no entries, so there is " +
      "nothing to reconcile against. DATA_NOT_AVAILABLE, not 'reconciled'.",
  });
  blockers.push("RECONCILIATION_DATA_NOT_AVAILABLE");

  checks.push({
    check: "CLOSE_POLICY_RATIFIED",
    passed: false,
    detail: "No ratified close policy defines the mandatory pre-close conditions (P1).",
  });
  blockers.push("REQUIRES_AUTHORITY");

  return {
    periodId: period.id,
    entityId: input.legalEntityId,
    state,
    ready: false,
    decision: "REQUIRES_AUTHORITY",
    blockers,
    checks,
    reason:
      `Period ${period.code} cannot be assessed as close-ready: ${blockers.join(", ")}. ` +
      "The engine reports the facts; which conditions are mandatory is a ratified-policy question.",
  };
}

/** Every period for an entity, with its posting eligibility. */
export async function periodCalendar(legalEntityId: string): Promise<
  Array<{
    id: string;
    code: string;
    startsOn: string;
    endsOn: string;
    state: PeriodState | null;
    postingAllowed: boolean;
    reason: string;
  }>
> {
  const rows = await db
    .select()
    .from(financialPeriods)
    .where(eq(financialPeriods.legalEntityId, legalEntityId))
    .orderBy(financialPeriods.startsOn);

  return rows.map((r) => {
    const posting = postingAllowedIn(r.status);
    return {
      id: r.id,
      code: r.code,
      startsOn: String(r.startsOn),
      endsOn: String(r.endsOn),
      state: isPeriodState(r.status) ? r.status : null,
      postingAllowed: posting.allowed,
      reason: posting.reason,
    };
  });
}

/**
 * Finds the period covering a date.
 *
 * Overlapping periods are a DATA_CONFLICT, never a first-match win: silently picking one would
 * mean a posting lands in a period chosen by row order.
 */
export async function periodForDate(input: {
  legalEntityId: string;
  date: string;
}): Promise<ReturnType<typeof resolvePeriodForDate>> {
  const rows = await db
    .select()
    .from(financialPeriods)
    .where(
      and(
        eq(financialPeriods.legalEntityId, input.legalEntityId),
        sql`${financialPeriods.startsOn} <= ${input.date}::date`,
        sql`${financialPeriods.endsOn} >= ${input.date}::date`,
      ),
    );

  return resolvePeriodForDate(
    rows.map((r) => ({ id: r.id, code: r.code, status: r.status })),
    input.date,
  );
}
