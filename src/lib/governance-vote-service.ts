import { and, eq, inArray, isNull, or, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceBodies,
  governanceMembers,
  parties,
  resolutions,
  resolutionVotes,
  users,
} from "@/db/schema";
import { can, type Principal } from "./authz";
import { evaluatePolicy } from "./policy";
import { withAuditTransaction, type EventInput } from "./audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "./tenant-scope";
import { newId, ID_PREFIX } from "./ids";
import { classificationRank, type Classification } from "./constants";
import { GovernanceError, type GovernanceErrorCode } from "./governance";
import {
  allEligibleHaveVoted,
  calculateQuorum,
  decideResolution,
  isMajorityRule,
  isSubstantiveVote,
  tallyBallots,
  votingWindowState,
  type BallotLine,
  type MajorityRule,
  type SubstantiveVote,
  type VotingOutcome,
} from "./governance-voting";

/**
 * BEYU OS — governance vote service.
 *
 * The SECOND canonical governed transaction, following the same pipeline as the
 * resolution proposal and reusing the identical kernel services:
 *
 *   VALIDATE → AUTHENTICATE → LOOKUP → TENANT SCOPE → BODY SCOPE → MEMBERSHIP →
 *   RECUSAL → RBAC → ABAC → CLASSIFICATION → POLICY → VOTING WINDOW →
 *   CURRENT-VOTE CHECK → MUTATE → AUDIT → EVENT → STATUS TRANSITION → COMMIT
 *
 * Two authorisation layers must BOTH pass:
 *   1. SYSTEM AUTHORIZATION — `governance:resolution.vote` via RBAC/ABAC.
 *   2. GOVERNANCE MEMBERSHIP — an active, voting seat on the body that owns the
 *      resolution. Holding the permission is never sufficient on its own.
 */

/** Default voting window applied when a resolution is tabled without an explicit one. */
export const DEFAULT_VOTING_WINDOW_DAYS = 14;

export type CastVoteInput = {
  resolutionId: string;
  vote: SubstantiveVote;
  comment?: string | null;
};

export type MutationContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type VoteResult = {
  resolutionId: string;
  reference: string;
  memberId: string;
  vote: SubstantiveVote;
  previousVote: SubstantiveVote | null;
  changed: boolean;
  status: string;
  outcome: VotingOutcome;
  explanation: string;
  quorum: { eligible: number; recused: number; required: number; participated: number; met: boolean };
  tally: { for: number; against: number; abstain: number };
  votingClosesAt: string | null;
};

export type TableResult = {
  resolutionId: string;
  reference: string;
  status: string;
  votingOpensAt: string;
  votingClosesAt: string;
  tabledByMemberId: string;
};

/* ------------------------------------------------------------------ *
 * Shared resolution + membership resolution
 * ------------------------------------------------------------------ */

type ResolutionContext = {
  resolution: typeof resolutions.$inferSelect;
  body: typeof governanceBodies.$inferSelect;
  /** The acting principal's seat on the owning body, if any. */
  seat: typeof governanceMembers.$inferSelect | null;
  eligibleMemberIds: string[];
  majorityRule: MajorityRule;
};

/** Active seat predicate: appointed, not retired, holding voting rights. */
function activeSeatConditions(today: string) {
  return and(
    eq(governanceMembers.votingRights, true),
    lte(governanceMembers.appointedOn, today),
    or(isNull(governanceMembers.retiredOn), gte(governanceMembers.retiredOn, today)),
  );
}

/**
 * Locate a resolution strictly inside the principal's tenant scope and resolve
 * the acting principal's governance seat.
 *
 * An out-of-scope or non-existent resolution produces an identical NOT_FOUND so
 * a caller cannot enumerate other tenants' resolutions by guessing identifiers.
 */
async function loadResolutionContext(
  principal: Principal,
  resolutionId: string,
): Promise<ResolutionContext> {
  const scope = await tenantScopeIds(principal);

  const [row] = await db
    .select({ resolution: resolutions, body: governanceBodies })
    .from(resolutions)
    .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
    .where(and(eq(resolutions.id, resolutionId), inArray(resolutions.tenantId, scope)))
    .limit(1);

  if (!row) {
    throw new GovernanceError("NOT_FOUND", "Resolution not found within your authorised scope.");
  }
  if (row.body.status !== "ACTIVE") {
    throw new GovernanceError("RULE_VIOLATION", "The governing body is not active.", {
      bodyStatus: row.body.status,
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Eligible electorate for this body: active seats with voting rights.
  const eligible = await db
    .select({ id: governanceMembers.id })
    .from(governanceMembers)
    .where(and(eq(governanceMembers.bodyId, row.body.id), activeSeatConditions(today)));

  // The acting principal's own seat, resolved through party identity — never
  // from the request, a general application role, or proposal ownership.
  const [seat] = await db
    .select()
    .from(governanceMembers)
    .innerJoin(parties, eq(parties.id, governanceMembers.partyId))
    .innerJoin(users, eq(users.partyId, parties.id))
    .where(and(eq(governanceMembers.bodyId, row.body.id), eq(users.id, principal.userId)))
    .limit(1)
    .then((rows) => rows.map((r) => r.governance_members));

  const majorityRule = isMajorityRule(row.body.majorityRule) ? row.body.majorityRule : "SIMPLE";

  return {
    resolution: row.resolution,
    body: row.body,
    seat: seat ?? null,
    eligibleMemberIds: eligible.map((e) => e.id),
    majorityRule,
  };
}

/** Shared ABAC + classification + policy gate for governance mutations. */
async function authorizeGovernanceAction(
  principal: Principal,
  ctx: ResolutionContext,
  permission: "governance:resolution.vote" | "governance:resolution.approve",
  action: string,
) {
  const classification = ctx.resolution.classification as Classification;

  const decision = can(principal, permission, {
    classification,
    tenantId: ctx.resolution.tenantId,
    entityId: ctx.body.legalEntityId ?? undefined,
  });
  if (!decision.allowed) {
    const code: GovernanceErrorCode =
      classificationRank(classification) > classificationRank(principal.clearance)
        ? "CLASSIFICATION_DENIED"
        : "FORBIDDEN";
    throw new GovernanceError(code, decision.reason);
  }

  const policy = await evaluatePolicy({
    action: permission,
    tenantId: ctx.resolution.tenantId,
    roles: principal.roles,
    classification,
    riskScore: principal.riskScore,
    aiInitiated: false,
  });
  if (policy.effect === "DENY") {
    throw new GovernanceError(
      "POLICY_DENIED",
      policy.denials.map((d) => d.message).join(" ") || `Denied by governance policy (${action}).`,
      { denials: policy.denials },
    );
  }
  return policy;
}

/* ------------------------------------------------------------------ *
 * TABLE — DRAFT → TABLED (opens the voting window)
 * ------------------------------------------------------------------ */

export type TableResolutionInput = {
  resolutionId: string;
  votingClosesAt?: Date | null;
};

/**
 * Table a resolution, placing it before the body and opening voting.
 *
 * Tabling is a SEPARATE governed action from proposing: creating a proposal does
 * not table it, and being the proposer confers no tabling authority. Only the
 * body's presiding officer (CHAIR, or SECRETARY who convenes it) may table,
 * derived from `governance_members.seat_role` — never from a hardcoded identity.
 */
export async function tableResolution(
  principal: Principal,
  input: TableResolutionInput,
  context: MutationContext,
): Promise<TableResult> {
  const ctx = await loadResolutionContext(principal, input.resolutionId);

  // Tabling records an outcome-affecting transition, so it is gated on the
  // approve capability rather than the vote capability.
  const policy = await authorizeGovernanceAction(
    principal,
    ctx,
    "governance:resolution.approve",
    "governance.resolution.table",
  );

  if (!ctx.seat) {
    throw new GovernanceError(
      "FORBIDDEN",
      "Only a member of the governing body may table a resolution.",
    );
  }
  const PRESIDING_SEATS = ["CHAIR", "SECRETARY"];
  if (!PRESIDING_SEATS.includes(ctx.seat.seatRole)) {
    throw new GovernanceError(
      "FORBIDDEN",
      "Only the presiding officer of the governing body may table a resolution.",
      { seatRole: ctx.seat.seatRole },
    );
  }
  if (ctx.resolution.status !== "DRAFT") {
    throw new GovernanceError(
      "RULE_VIOLATION",
      `Only a DRAFT resolution may be tabled; this resolution is ${ctx.resolution.status}.`,
      { status: ctx.resolution.status },
    );
  }

  const now = new Date();
  const closesAt =
    input.votingClosesAt ?? new Date(now.getTime() + DEFAULT_VOTING_WINDOW_DAYS * 86_400_000);
  if (closesAt.getTime() <= now.getTime()) {
    throw new GovernanceError("RULE_VIOLATION", "The voting window must close in the future.");
  }

  try {
    await assertWithinScope(principal, ctx.resolution.tenantId);
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      throw new GovernanceError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  }

  return withAuditTransaction(
    async (tx) => {
      // Guarded on status so two concurrent tabling attempts cannot both apply.
      const [updated] = await tx
        .update(resolutions)
        .set({
          status: "TABLED",
          votingOpensAt: now,
          votingClosesAt: closesAt,
          tabledByMemberId: ctx.seat!.id,
          tabledAt: now,
        })
        .where(and(eq(resolutions.id, ctx.resolution.id), eq(resolutions.status, "DRAFT")))
        .returning();

      if (!updated) {
        throw new GovernanceError(
          "CONFLICT",
          "The resolution was tabled concurrently. Reload and retry.",
        );
      }

      return {
        resolutionId: updated.id,
        reference: updated.reference,
        status: updated.status,
        votingOpensAt: now.toISOString(),
        votingClosesAt: closesAt.toISOString(),
        tabledByMemberId: ctx.seat!.id,
      } satisfies TableResult;
    },
    (result) => ({
      tenantId: ctx.resolution.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "governance.resolution.table",
      objectType: "RESOLUTION",
      objectId: result.resolutionId,
      outcome: "SUCCESS" as const,
      reason: `Resolution ${result.reference} tabled before ${ctx.body.name}; voting open until ${result.votingClosesAt}`,
      authority: "governance:resolution.approve",
      policyVersion:
        policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || undefined,
      oldValue: { status: "DRAFT" },
      newValue: {
        status: "TABLED",
        votingOpensAt: result.votingOpensAt,
        votingClosesAt: result.votingClosesAt,
        tabledByMemberId: result.tabledByMemberId,
        seatRole: ctx.seat!.seatRole,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "GOVERNANCE_RESOLUTION_TABLED",
      source: "beyu-os/governance",
      tenantId: ctx.resolution.tenantId,
      subjectType: "RESOLUTION",
      subjectId: result.resolutionId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: ctx.resolution.classification as Classification,
      payload: {
        reference: result.reference,
        bodyCode: ctx.body.code,
        votingOpensAt: result.votingOpensAt,
        votingClosesAt: result.votingClosesAt,
      },
      traceId: context.traceId,
    }),
  );
}

/* ------------------------------------------------------------------ *
 * CAST VOTE
 * ------------------------------------------------------------------ */

export async function castVote(
  principal: Principal,
  input: CastVoteInput,
  context: MutationContext,
): Promise<VoteResult> {
  const ctx = await loadResolutionContext(principal, input.resolutionId);

  /* ---- SYSTEM AUTHORIZATION (RBAC + ABAC + classification + policy) ---- */
  const policy = await authorizeGovernanceAction(
    principal,
    ctx,
    "governance:resolution.vote",
    "governance.resolution.vote",
  );

  /* ---- GOVERNANCE MEMBERSHIP ELIGIBILITY -------------------------------
   * Holding the permission is not sufficient: the actor must hold an active
   * voting seat on the body that owns this resolution. Membership is resolved
   * from governance_members via party identity, never from the request. */
  if (!ctx.seat) {
    throw new GovernanceError(
      "FORBIDDEN",
      "You are not a member of the governing body responsible for this resolution.",
    );
  }
  if (!ctx.seat.votingRights) {
    throw new GovernanceError("FORBIDDEN", "Your seat does not carry voting rights.");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (ctx.seat.appointedOn > today || (ctx.seat.retiredOn && ctx.seat.retiredOn < today)) {
    throw new GovernanceError("FORBIDDEN", "Your appointment to this body is not currently active.");
  }
  if (!ctx.eligibleMemberIds.includes(ctx.seat.id)) {
    throw new GovernanceError("FORBIDDEN", "Your seat is not part of the eligible electorate.");
  }

  /* ---- LIFECYCLE + VOTING WINDOW (server clock is authoritative) -------- */
  if (ctx.resolution.status !== "TABLED") {
    throw new GovernanceError(
      "RULE_VIOLATION",
      ctx.resolution.status === "DRAFT"
        ? "This resolution has not been tabled; voting has not opened."
        : `Voting is closed: the resolution is ${ctx.resolution.status}.`,
      { status: ctx.resolution.status },
    );
  }

  const now = new Date();
  const windowState = votingWindowState(
    { opensAt: ctx.resolution.votingOpensAt, closesAt: ctx.resolution.votingClosesAt },
    now,
  );
  if (windowState === "NOT_OPEN") {
    throw new GovernanceError("RULE_VIOLATION", "The voting window has not opened yet.", {
      votingOpensAt: ctx.resolution.votingOpensAt?.toISOString() ?? null,
    });
  }
  if (windowState === "CLOSED") {
    throw new GovernanceError("RULE_VIOLATION", "The voting window has closed.", {
      votingClosesAt: ctx.resolution.votingClosesAt?.toISOString() ?? null,
    });
  }

  /* ---- RECUSAL ---------------------------------------------------------
   * Recusal is resolution-specific and represented by an existing RECUSED
   * ballot row. A recused member keeps their seat and global role but cannot
   * cast a substantive vote on THIS resolution. */
  const [existingBallot] = await db
    .select()
    .from(resolutionVotes)
    .where(
      and(
        eq(resolutionVotes.resolutionId, ctx.resolution.id),
        eq(resolutionVotes.memberId, ctx.seat.id),
      ),
    )
    .limit(1);

  if (existingBallot?.vote === "RECUSED") {
    // Deliberately does not disclose any other member's recusal state.
    throw new GovernanceError(
      "FORBIDDEN",
      "You are recused from this resolution and may not cast a vote.",
    );
  }

  try {
    await assertWithinScope(principal, ctx.resolution.tenantId);
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      throw new GovernanceError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  }

  const previousVote = (existingBallot?.vote ?? null) as SubstantiveVote | null;
  const isChange = previousVote !== null;

  /* ---- MUTATE + AUDIT + EVENT + STATUS TRANSITION, ATOMICALLY ---------- */
  try {
    return await withAuditTransaction(
      async (tx) => {
        // Serialise all concurrent voting on this resolution so the tally and any
        // resulting status transition are computed from a stable ballot set.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`beyu:resolution-vote:${ctx.resolution.id}`}))`,
        );

        // Re-read status inside the lock: the window may have been closed, or the
        // resolution decided, between the pre-checks and the transaction.
        const [current] = await tx
          .select()
          .from(resolutions)
          .where(eq(resolutions.id, ctx.resolution.id))
          .limit(1);
        if (!current || current.status !== "TABLED") {
          throw new GovernanceError(
            "RULE_VIOLATION",
            "Voting closed before this vote could be recorded.",
            { status: current?.status ?? "UNKNOWN" },
          );
        }
        if (
          votingWindowState(
            { opensAt: current.votingOpensAt, closesAt: current.votingClosesAt },
            new Date(),
          ) !== "OPEN"
        ) {
          throw new GovernanceError("RULE_VIOLATION", "The voting window has closed.");
        }

        // One effective vote per member per resolution. The pre-existing unique
        // index (resolution_id, member_id) is the storage-level invariant; the
        // upsert makes a change safe under concurrency rather than racing a
        // SELECT-then-INSERT.
        await tx
          .insert(resolutionVotes)
          .values({
            id: newId(ID_PREFIX.vote),
            resolutionId: ctx.resolution.id,
            memberId: ctx.seat!.id,
            vote: input.vote,
            conflictDeclared: existingBallot?.conflictDeclared ?? false,
            comment: input.comment ?? null,
            castAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [resolutionVotes.resolutionId, resolutionVotes.memberId],
            set: { vote: input.vote, comment: input.comment ?? null, castAt: new Date() },
          });

        // Recompute from the authoritative ballot set inside the lock.
        const ballots = (await tx
          .select({ memberId: resolutionVotes.memberId, vote: resolutionVotes.vote })
          .from(resolutionVotes)
          .where(eq(resolutionVotes.resolutionId, ctx.resolution.id))) as BallotLine[];

        const recusedMemberIds = ballots.filter((b) => b.vote === "RECUSED").map((b) => b.memberId);
        const quorum = calculateQuorum(
          {
            eligibleMemberIds: ctx.eligibleMemberIds,
            recusedMemberIds,
            quorumMinimum: ctx.body.quorumMinimum,
          },
          ballots,
        );
        const tally = tallyBallots(ballots);

        // A decision is only reached when voting has genuinely concluded: the
        // window closed, or every eligible member has voted. A single arriving
        // vote never decides a resolution by itself.
        const everyoneVoted = allEligibleHaveVoted(
          ctx.eligibleMemberIds,
          recusedMemberIds,
          ballots,
        );
        const decision = decideResolution({
          majorityRule: ctx.majorityRule,
          quorum,
          tally,
          votingConcluded: everyoneVoted,
        });

        /**
         * Voting CONCLUDES; it does not DECIDE.
         *
         * `beyu_decision_status` defines VOTED as "voting concluded; reserved
         * for a separate ratification flow (governance:resolution.approve)".
         * Casting a ballot therefore never produces APPROVED, REJECTED or
         * DEADLOCKED: voting authority and decision authority are separate
         * powers, and a voter must not be able to finalise a resolution merely
         * by being the last to vote. Closure is the decision authority's act.
         */
        const nextStatus = decision.outcome === "PENDING" ? "TABLED" : "VOTED";

        const [updated] = await tx
          .update(resolutions)
          .set({
            votesFor: tally.for,
            votesAgainst: tally.against,
            votesAbstain: tally.abstain,
            quorumMet: quorum.met,
            status: nextStatus,
          })
          .where(eq(resolutions.id, ctx.resolution.id))
          .returning();

        return {
          resolutionId: updated.id,
          reference: updated.reference,
          memberId: ctx.seat!.id,
          vote: input.vote,
          previousVote,
          changed: isChange,
          status: updated.status,
          outcome: decision.outcome,
          explanation: decision.explanation,
          quorum: {
            eligible: quorum.eligibleCount,
            recused: quorum.recusedCount,
            required: quorum.required,
            participated: quorum.participated,
            met: quorum.met,
          },
          tally: { for: tally.for, against: tally.against, abstain: tally.abstain },
          votingClosesAt: updated.votingClosesAt?.toISOString() ?? null,
        } satisfies VoteResult;
      },
      // Immutable provenance: the previous vote is preserved in the ledger even
      // though the ballot row itself carries only the effective vote.
      (result) => ({
        tenantId: ctx.resolution.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: result.changed
          ? "governance.resolution.vote.change"
          : "governance.resolution.vote.cast",
        objectType: "RESOLUTION",
        objectId: result.resolutionId,
        outcome: "SUCCESS" as const,
        reason: result.changed
          ? `Vote changed from ${result.previousVote} to ${result.vote} on ${result.reference}`
          : `Vote ${result.vote} cast on ${result.reference}`,
        authority: "governance:resolution.vote",
        policyVersion:
          policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || undefined,
        oldValue: result.changed
          ? { vote: result.previousVote, memberId: result.memberId }
          : null,
        newValue: {
          vote: result.vote,
          memberId: result.memberId,
          bodyId: ctx.body.id,
          bodyCode: ctx.body.code,
          reference: result.reference,
          tally: result.tally,
          quorum: result.quorum,
          outcome: result.outcome,
          status: result.status,
          explanation: result.explanation,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      /**
       * Durable domain events, appended INSIDE the transaction.
       *
       * The conclusion of voting is a distinct governance fact from the ballot
       * that triggered it, so it is published as its own event rather than
       * leaving consumers to infer it. Both are hash-chained rows in
       * `enterprise_events`, so both must be atomic with the state transition.
       *
       * NOTE: this emits VOTING_CONCLUDED, not DECIDED. Voting concluding means
       * the electorate has finished; the resolution is not decided until the
       * decision authority closes it. GOVERNANCE_RESOLUTION_DECIDED is emitted
       * only by `decideResolutionClosure`.
       */
      (result) => {
        const events: EventInput[] = [
          {
            type: result.changed
              ? "GOVERNANCE_RESOLUTION_VOTE_CHANGED"
              : "GOVERNANCE_RESOLUTION_VOTE_CAST",
            source: "beyu-os/governance",
            tenantId: ctx.resolution.tenantId,
            subjectType: "RESOLUTION",
            subjectId: result.resolutionId,
            actorUserId: principal.userId,
            actorType: "HUMAN" as const,
            classification: ctx.resolution.classification as Classification,
            payload: {
              reference: result.reference,
              bodyCode: ctx.body.code,
              vote: result.vote,
              previousVote: result.previousVote,
              tally: result.tally,
              quorum: result.quorum,
              outcome: result.outcome,
              status: result.status,
            },
            traceId: context.traceId,
          },
        ];

        if (result.outcome !== "PENDING") {
          events.push({
            type: "GOVERNANCE_RESOLUTION_VOTING_CONCLUDED",
            source: "beyu-os/governance",
            tenantId: ctx.resolution.tenantId,
            subjectType: "RESOLUTION",
            subjectId: result.resolutionId,
            actorUserId: principal.userId,
            actorType: "HUMAN" as const,
            classification: ctx.resolution.classification as Classification,
            payload: {
              reference: result.reference,
              bodyCode: ctx.body.code,
              // The provisional outcome the ballots imply. It is NOT the
              // decision: only the decision authority's closure makes it one.
              provisionalOutcome: result.outcome,
              status: result.status,
              majorityRule: ctx.majorityRule,
              tally: result.tally,
              quorum: result.quorum,
              explanation: result.explanation,
            },
            traceId: context.traceId,
          });
        }

        return events;
      },
    );
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      throw new GovernanceError("CONFLICT", "A concurrent vote was recorded. Retry the request.");
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * DECIDE — TABLED | VOTED → APPROVED | REJECTED | DEADLOCKED | DEFERRED
 * ------------------------------------------------------------------ */

export type DecideResolutionInput = {
  resolutionId: string;
  /** Free-text closure note. Metadata only — it can never affect the outcome. */
  decisionNote?: string | null;
};

export type DecisionResult = {
  resolutionId: string;
  reference: string;
  previousStatus: string;
  status: string;
  outcome: VotingOutcome;
  explanation: string;
  decidedByMemberId: string;
  decisionDate: string;
  quorum: { eligible: number; recused: number; required: number; participated: number; met: boolean };
  tally: { for: number; against: number; abstain: number; recused: number };
  majorityRule: MajorityRule;
  votingClosed: boolean;
};

/** Statuses from which a resolution may still be closed. */
const DECIDABLE_STATUSES = ["TABLED", "VOTED"] as const;

/** Terminal statuses. Once reached, the resolution is immutable. */
export const TERMINAL_RESOLUTION_STATUSES = [
  "APPROVED",
  "REJECTED",
  "DEADLOCKED",
  "DEFERRED",
  "WITHDRAWN",
] as const;

/**
 * Seats that carry decision/closure authority for the owning body.
 *
 * Closure is the presiding function of the body, exactly as tabling is. It is
 * resolved from `governance_members.seat_role`, never from a username and never
 * from a global administrative role: an enterprise admin with the capability but
 * no seat on the body cannot close that body's resolutions.
 */
const DECISION_SEATS = ["CHAIR", "SECRETARY"];

/**
 * Close a resolution and record the constitutional decision.
 *
 * This is the third canonical governed transaction, after PROPOSAL and VOTE.
 *
 * The caller NEVER supplies the outcome. The server recomputes it inside the
 * transaction from the authoritative ballot set using the same pure rules engine
 * that governs voting (`calculateQuorum`, `tallyBallots`, `decideResolution`), so
 * a decision cannot be forged through the API, a governance role, or a crafted
 * request body.
 *
 * Authority is verified independently of voting authority: holding
 * `governance:resolution.vote` confers nothing here.
 */
export async function decideResolutionClosure(
  principal: Principal,
  input: DecideResolutionInput,
  context: MutationContext,
): Promise<DecisionResult> {
  const ctx = await loadResolutionContext(principal, input.resolutionId);

  /* ---- SYSTEM AUTHORIZATION (RBAC + ABAC + classification + policy) ---- */
  const policy = await authorizeGovernanceAction(
    principal,
    ctx,
    "governance:resolution.approve",
    "governance.resolution.decide",
  );

  /* ---- GOVERNANCE-BODY AUTHORITY (independent of voting rights) -------- */
  if (!ctx.seat) {
    throw new GovernanceError(
      "FORBIDDEN",
      "Only a member of the governing body may close one of its resolutions.",
    );
  }
  if (!DECISION_SEATS.includes(ctx.seat.seatRole)) {
    throw new GovernanceError(
      "FORBIDDEN",
      "Only the presiding officer of the governing body may close a resolution.",
      { seatRole: ctx.seat.seatRole },
    );
  }

  /* ---- LIFECYCLE PRE-CHECK (re-checked inside the transaction) --------- */
  if (!(DECIDABLE_STATUSES as readonly string[]).includes(ctx.resolution.status)) {
    const already = (TERMINAL_RESOLUTION_STATUSES as readonly string[]).includes(
      ctx.resolution.status,
    );
    throw new GovernanceError(
      already ? "ALREADY_DECIDED" : "NOT_READY_FOR_DECISION",
      already
        ? `Resolution is already ${ctx.resolution.status} and cannot be decided again.`
        : `A ${ctx.resolution.status} resolution cannot be closed; it must be tabled first.`,
      { status: ctx.resolution.status },
    );
  }

  try {
    await assertWithinScope(principal, ctx.resolution.tenantId);
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      throw new GovernanceError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  }

  /* ---- DECIDE + AUDIT + EVENT, ATOMICALLY ------------------------------ */
  return withAuditTransaction(
    async (tx) => {
      // Serialise against concurrent votes and concurrent closures on the SAME
      // advisory lock the vote path uses, so a vote can never land between the
      // tally being read and the decision being written.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`beyu:resolution-vote:${ctx.resolution.id}`}))`,
      );

      // Re-read the authoritative row inside the lock. Nothing loaded before
      // BEGIN is trusted for the decision.
      const [current] = await tx
        .select()
        .from(resolutions)
        .where(eq(resolutions.id, ctx.resolution.id))
        .limit(1);

      if (!current) {
        throw new GovernanceError("NOT_FOUND", "Resolution not found within your authorised scope.");
      }
      if (!(DECIDABLE_STATUSES as readonly string[]).includes(current.status)) {
        const already = (TERMINAL_RESOLUTION_STATUSES as readonly string[]).includes(current.status);
        throw new GovernanceError(
          already ? "ALREADY_DECIDED" : "NOT_READY_FOR_DECISION",
          already
            ? `Resolution was decided concurrently and is now ${current.status}.`
            : `A ${current.status} resolution cannot be closed.`,
          { status: current.status },
        );
      }

      // Re-read the ballots inside the lock: this is the authoritative electorate.
      const ballots = (await tx
        .select({ memberId: resolutionVotes.memberId, vote: resolutionVotes.vote })
        .from(resolutionVotes)
        .where(eq(resolutionVotes.resolutionId, ctx.resolution.id))) as BallotLine[];

      const recusedMemberIds = ballots.filter((b) => b.vote === "RECUSED").map((b) => b.memberId);
      const quorum = calculateQuorum(
        {
          eligibleMemberIds: ctx.eligibleMemberIds,
          recusedMemberIds,
          quorumMinimum: ctx.body.quorumMinimum,
        },
        ballots,
      );
      const tally = tallyBallots(ballots);

      /**
       * Voting must have genuinely concluded before closure: either the window
       * has closed, or every eligible member has voted. Closing while voting is
       * still open and incomplete would disenfranchise members who have not yet
       * voted, so it is refused rather than allowed at the authority's discretion.
       */
      const windowClosed =
        votingWindowState(
          { opensAt: current.votingOpensAt, closesAt: current.votingClosesAt },
          new Date(),
        ) === "CLOSED";
      const everyoneVoted = allEligibleHaveVoted(ctx.eligibleMemberIds, recusedMemberIds, ballots);

      if (!windowClosed && !everyoneVoted) {
        throw new GovernanceError(
          "NOT_READY_FOR_DECISION",
          "Voting is still open and not every eligible member has voted. " +
            "The resolution cannot be closed yet.",
          {
            participated: quorum.participated,
            eligible: quorum.eligibleCount,
            votingClosesAt: current.votingClosesAt?.toISOString() ?? null,
          },
        );
      }

      // THE OUTCOME IS COMPUTED, NEVER SUPPLIED. Same engine as the vote path.
      const decision = decideResolution({
        majorityRule: ctx.majorityRule,
        quorum,
        tally,
        votingConcluded: true,
      });

      if (decision.outcome === "PENDING") {
        // Unreachable while votingConcluded is true; refuse rather than guess.
        throw new GovernanceError(
          "NOT_READY_FOR_DECISION",
          "No decision is derivable from the current ballots.",
        );
      }

      /**
       * Quorum failure produces DEFERRED — an existing status meaning "voting
       * closed without quorum; no decision was reachable". It is NOT approved or
       * rejected, and no EXPIRED state is invented.
       */
      const nextStatus = decision.outcome as
        | "APPROVED"
        | "REJECTED"
        | "DEADLOCKED"
        | "DEFERRED";
      const decidedAt = new Date();

      // Guarded on the decidable statuses so two concurrent closures cannot both
      // apply: the loser sees zero rows and is reported as a conflict.
      const [updated] = await tx
        .update(resolutions)
        .set({
          status: nextStatus,
          votesFor: tally.for,
          votesAgainst: tally.against,
          votesAbstain: tally.abstain,
          quorumMet: quorum.met,
          decidedByMemberId: ctx.seat!.id,
          decisionDate: decidedAt,
        })
        .where(
          and(
            eq(resolutions.id, ctx.resolution.id),
            inArray(resolutions.status, [...DECIDABLE_STATUSES]),
          ),
        )
        .returning();

      if (!updated) {
        throw new GovernanceError(
          "CONFLICT",
          "The resolution was decided concurrently. Reload and retry.",
        );
      }

      return {
        resolutionId: updated.id,
        reference: updated.reference,
        previousStatus: current.status,
        status: updated.status,
        outcome: decision.outcome,
        explanation: decision.explanation,
        decidedByMemberId: ctx.seat!.id,
        decisionDate: decidedAt.toISOString(),
        quorum: {
          eligible: quorum.eligibleCount,
          recused: quorum.recusedCount,
          required: quorum.required,
          participated: quorum.participated,
          met: quorum.met,
        },
        tally: {
          for: tally.for,
          against: tally.against,
          abstain: tally.abstain,
          recused: tally.recused,
        },
        majorityRule: ctx.majorityRule,
        votingClosed: windowClosed,
      } satisfies DecisionResult;
    },
    (result) => ({
      tenantId: ctx.resolution.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "governance.resolution.decide",
      objectType: "RESOLUTION",
      objectId: result.resolutionId,
      outcome: "SUCCESS" as const,
      reason:
        `Resolution ${result.reference} closed as ${result.outcome} by ${ctx.body.name}. ` +
        result.explanation +
        (input.decisionNote ? ` Note: ${input.decisionNote}` : ""),
      authority: "governance:resolution.approve",
      policyVersion:
        policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || undefined,
      oldValue: { status: result.previousStatus },
      newValue: {
        status: result.status,
        outcome: result.outcome,
        tally: result.tally,
        quorum: result.quorum,
        majorityRule: result.majorityRule,
        decidedByMemberId: result.decidedByMemberId,
        decisionDate: result.decisionDate,
        seatRole: ctx.seat!.seatRole,
        decisionNote: input.decisionNote ?? null,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    /**
     * The durable decision event, appended INSIDE the same transaction via
     * publishEventTx (through withAuditTransaction). A committed decision that
     * consumers cannot observe would be a governance integrity failure.
     */
    (result) => ({
      type: "GOVERNANCE_RESOLUTION_DECIDED",
      source: "beyu-os/governance",
      tenantId: ctx.resolution.tenantId,
      subjectType: "RESOLUTION",
      subjectId: result.resolutionId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: ctx.resolution.classification as Classification,
      payload: {
        reference: result.reference,
        bodyCode: ctx.body.code,
        outcome: result.outcome,
        status: result.status,
        previousStatus: result.previousStatus,
        majorityRule: result.majorityRule,
        tally: result.tally,
        quorum: result.quorum,
        explanation: result.explanation,
        decidedByMemberId: result.decidedByMemberId,
        decisionDate: result.decisionDate,
      },
      traceId: context.traceId,
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Read model for the governance UI
 * ------------------------------------------------------------------ */

export type VotingSnapshot = {
  resolutionId: string;
  canVote: boolean;
  reason: string | null;
  memberId: string | null;
  currentVote: string | null;
  windowState: "NOT_OPEN" | "OPEN" | "CLOSED";
  votingClosesAt: string | null;
  quorum: { eligible: number; recused: number; required: number; participated: number; met: boolean };
  tally: { for: number; against: number; abstain: number };
};

/**
 * Server-computed voting state for the UI.
 *
 * The UI renders from this; it never decides eligibility for itself. Server
 * enforcement in `castVote` remains authoritative regardless of what is shown.
 */
export async function votingSnapshots(
  principal: Principal,
  resolutionIds: string[],
): Promise<Map<string, VotingSnapshot>> {
  const snapshots = new Map<string, VotingSnapshot>();
  if (resolutionIds.length === 0) return snapshots;

  const scope = await tenantScopeIds(principal);
  const rows = await db
    .select({ resolution: resolutions, body: governanceBodies })
    .from(resolutions)
    .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
    .where(and(inArray(resolutions.id, resolutionIds), inArray(resolutions.tenantId, scope)));

  if (rows.length === 0) return snapshots;

  const today = new Date().toISOString().slice(0, 10);
  const bodyIds = [...new Set(rows.map((r) => r.body.id))];

  const [allBallots, eligibleSeats, mySeats] = await Promise.all([
    db
      .select({
        resolutionId: resolutionVotes.resolutionId,
        memberId: resolutionVotes.memberId,
        vote: resolutionVotes.vote,
      })
      .from(resolutionVotes)
      .where(inArray(resolutionVotes.resolutionId, rows.map((r) => r.resolution.id))),
    db
      .select({ id: governanceMembers.id, bodyId: governanceMembers.bodyId })
      .from(governanceMembers)
      .where(and(inArray(governanceMembers.bodyId, bodyIds), activeSeatConditions(today))),
    db
      .select({
        id: governanceMembers.id,
        bodyId: governanceMembers.bodyId,
        seatRole: governanceMembers.seatRole,
        votingRights: governanceMembers.votingRights,
      })
      .from(governanceMembers)
      .innerJoin(parties, eq(parties.id, governanceMembers.partyId))
      .innerJoin(users, eq(users.partyId, parties.id))
      .where(and(inArray(governanceMembers.bodyId, bodyIds), eq(users.id, principal.userId))),
  ]);

  const hasVotePermission = can(principal, "governance:resolution.vote").allowed;
  const now = new Date();

  for (const { resolution, body } of rows) {
    const ballots = allBallots.filter((b) => b.resolutionId === resolution.id) as BallotLine[];
    const eligibleMemberIds = eligibleSeats.filter((s) => s.bodyId === body.id).map((s) => s.id);
    const recusedMemberIds = ballots.filter((b) => b.vote === "RECUSED").map((b) => b.memberId);

    const quorum = calculateQuorum(
      { eligibleMemberIds, recusedMemberIds, quorumMinimum: body.quorumMinimum },
      ballots,
    );
    const tally = tallyBallots(ballots);
    const seat = mySeats.find((s) => s.bodyId === body.id) ?? null;
    const myBallot = seat ? ballots.find((b) => b.memberId === seat.id) : undefined;

    const windowState = votingWindowState(
      { opensAt: resolution.votingOpensAt, closesAt: resolution.votingClosesAt },
      now,
    );

    let canVote = false;
    let reason: string | null = null;
    if (!hasVotePermission) reason = "governance:resolution.vote is not granted to your roles.";
    else if (!seat) reason = "You do not hold a seat on this governing body.";
    else if (!seat.votingRights) reason = "Your seat does not carry voting rights.";
    else if (!eligibleMemberIds.includes(seat.id)) reason = "Your seat is not currently active.";
    else if (myBallot?.vote === "RECUSED") reason = "You are recused from this resolution.";
    else if (resolution.status === "DRAFT") reason = "This resolution has not been tabled yet.";
    else if (resolution.status !== "TABLED") reason = `Voting is closed (${resolution.status}).`;
    else if (windowState === "NOT_OPEN") reason = "The voting window has not opened.";
    else if (windowState === "CLOSED") reason = "The voting window has closed.";
    else canVote = true;

    snapshots.set(resolution.id, {
      resolutionId: resolution.id,
      canVote,
      reason,
      memberId: seat?.id ?? null,
      currentVote: myBallot?.vote ?? null,
      windowState,
      votingClosesAt: resolution.votingClosesAt?.toISOString() ?? null,
      quorum: {
        eligible: quorum.eligibleCount,
        recused: quorum.recusedCount,
        required: quorum.required,
        participated: quorum.participated,
        met: quorum.met,
      },
      tally: { for: tally.for, against: tally.against, abstain: tally.abstain },
    });
  }

  return snapshots;
}

/** Whether the principal may table a given DRAFT resolution (UI affordance). */
export async function canTableResolutions(
  principal: Principal,
  resolutionIds: string[],
): Promise<Set<string>> {
  return presidingAuthorityFor(principal, resolutionIds, ["DRAFT"]);
}

/**
 * Resolutions the principal may CLOSE (decide), for the governance workbench.
 *
 * Mirrors `canTableResolutions` and applies the same presiding-seat rule, so the
 * UI can only ever offer an action the service would also allow. It is a
 * read-model convenience, never the authority itself: `decideResolutionClosure`
 * re-verifies everything.
 */
export async function canDecideResolutions(
  principal: Principal,
  resolutionIds: string[],
): Promise<Set<string>> {
  return presidingAuthorityFor(principal, resolutionIds, [...DECIDABLE_STATUSES]);
}

/**
 * Shared read-model helper: of the given resolutions in one of `statuses`, which
 * does the principal hold a presiding seat for?
 */
async function presidingAuthorityFor(
  principal: Principal,
  resolutionIds: string[],
  statuses: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (resolutionIds.length === 0) return allowed;
  if (!can(principal, "governance:resolution.approve").allowed) return allowed;

  const scope = await tenantScopeIds(principal);
  const rows = await db
    .select({ resolution: resolutions, body: governanceBodies })
    .from(resolutions)
    .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
    .where(
      and(
        inArray(resolutions.id, resolutionIds),
        inArray(resolutions.tenantId, scope),
        inArray(resolutions.status, statuses as never),
      ),
    );
  if (rows.length === 0) return allowed;

  const seats = await db
    .select({ bodyId: governanceMembers.bodyId, seatRole: governanceMembers.seatRole })
    .from(governanceMembers)
    .innerJoin(parties, eq(parties.id, governanceMembers.partyId))
    .innerJoin(users, eq(users.partyId, parties.id))
    .where(
      and(
        inArray(governanceMembers.bodyId, rows.map((r) => r.body.id)),
        eq(users.id, principal.userId),
      ),
    );

  for (const { resolution, body } of rows) {
    const seat = seats.find((s) => s.bodyId === body.id);
    if (seat && DECISION_SEATS.includes(seat.seatRole)) allowed.add(resolution.id);
  }
  return allowed;
}
