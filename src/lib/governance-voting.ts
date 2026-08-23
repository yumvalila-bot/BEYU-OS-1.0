/**
 * BEYU OS — governance voting rules (pure, deterministic).
 *
 * This module contains NO database or transport concerns so the constitutional
 * arithmetic is independently testable and mathematically reproducible from the
 * governing rules and the eligible votes, per the architectural principle that
 * every final decision must be reproducible.
 *
 * Authoritative decisions encoded here:
 *   - Quorum is counted from ELIGIBLE MEMBERS MINUS RECUSALS, never from the
 *     number of votes cast. A member who simply has not voted remains in the
 *     denominator.
 *   - ABSTAIN is participation but is neither FOR nor AGAINST.
 *   - RECUSED members leave the eligible denominator entirely for that
 *     resolution and cannot cast a substantive vote.
 *   - A tie between FOR and AGAINST is DEADLOCKED. There is no automatic
 *     tie-break and no chair casting vote.
 */

/** Vote vocabulary already defined by the resolution_votes schema. */
export const VOTE_VALUES = ["FOR", "AGAINST", "ABSTAIN", "RECUSED"] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

/** Substantive votes — those that can carry or defeat a resolution. */
export const SUBSTANTIVE_VOTES = ["FOR", "AGAINST", "ABSTAIN"] as const;
export type SubstantiveVote = (typeof SUBSTANTIVE_VOTES)[number];

export function isSubstantiveVote(v: string): v is SubstantiveVote {
  return (SUBSTANTIVE_VOTES as readonly string[]).includes(v);
}

/** Majority rules already defined by governance_bodies.majority_rule. */
export const MAJORITY_RULES = ["SIMPLE", "TWO_THIRDS", "UNANIMOUS"] as const;
export type MajorityRule = (typeof MAJORITY_RULES)[number];

export function isMajorityRule(v: string): v is MajorityRule {
  return (MAJORITY_RULES as readonly string[]).includes(v);
}

export type BallotLine = { memberId: string; vote: VoteValue };

export type QuorumInput = {
  /** Members with voting rights and an active appointment for this body. */
  eligibleMemberIds: string[];
  /** Members recused from THIS resolution (excluded from the denominator). */
  recusedMemberIds: string[];
  /** The body's configured quorum_minimum (absolute number of members). */
  quorumMinimum: number;
};

export type QuorumResult = {
  /** Eligible members after removing recusals — the denominator. */
  eligibleCount: number;
  recusedCount: number;
  /** The effective requirement, never more than the available electorate. */
  required: number;
  participated: number;
  met: boolean;
};

/**
 * Quorum.
 *
 * `quorum_minimum` is an absolute member count in this schema (no percentage or
 * ratio form exists), so it is used directly. It is capped at the eligible count:
 * a body cannot require more attendees than it has non-recused members, which
 * would otherwise make every resolution permanently undecidable after a recusal.
 */
export function calculateQuorum(input: QuorumInput, ballots: BallotLine[]): QuorumResult {
  const recused = new Set(input.recusedMemberIds);
  const eligible = input.eligibleMemberIds.filter((id) => !recused.has(id));
  const eligibleSet = new Set(eligible);

  // Only substantive ballots from still-eligible members count as participation.
  const participated = ballots.filter(
    (b) => eligibleSet.has(b.memberId) && isSubstantiveVote(b.vote),
  ).length;

  const required = Math.max(0, Math.min(input.quorumMinimum, eligible.length));

  return {
    eligibleCount: eligible.length,
    recusedCount: input.recusedMemberIds.length,
    required,
    participated,
    met: eligible.length > 0 && participated >= required,
  };
}

export type Tally = { for: number; against: number; abstain: number; recused: number };

export function tallyBallots(ballots: BallotLine[]): Tally {
  const tally: Tally = { for: 0, against: 0, abstain: 0, recused: 0 };
  for (const b of ballots) {
    if (b.vote === "FOR") tally.for += 1;
    else if (b.vote === "AGAINST") tally.against += 1;
    else if (b.vote === "ABSTAIN") tally.abstain += 1;
    else if (b.vote === "RECUSED") tally.recused += 1;
  }
  return tally;
}

/** Outcomes this engine may produce. Mapped onto the existing status enum. */
export type VotingOutcome = "APPROVED" | "REJECTED" | "DEADLOCKED" | "DEFERRED" | "PENDING";

export type DecisionInput = {
  majorityRule: MajorityRule;
  quorum: QuorumResult;
  tally: Tally;
  /** True once the voting window has closed or every eligible member has voted. */
  votingConcluded: boolean;
};

export type Decision = {
  outcome: VotingOutcome;
  /** Human-readable derivation, recorded in the audit ledger. */
  explanation: string;
  /** Votes needed to carry under the rule, for transparency. */
  threshold: number | null;
};

/**
 * Decide a resolution from its ballots.
 *
 * Returns PENDING while voting remains open and the result is not yet
 * mathematically settled, so a decision is never recorded merely because a vote
 * arrived. A decision is only produced when voting has concluded.
 */
export function decideResolution(input: DecisionInput): Decision {
  const { tally, quorum, majorityRule } = input;

  if (!input.votingConcluded) {
    return {
      outcome: "PENDING",
      explanation: "Voting remains open; no decision has been reached.",
      threshold: null,
    };
  }

  if (!quorum.met) {
    return {
      outcome: "DEFERRED",
      explanation:
        `Quorum not met: ${quorum.participated} of ${quorum.eligibleCount} eligible members ` +
        `participated, ${quorum.required} required (${quorum.recusedCount} recused). ` +
        `No decision is reachable.`,
      threshold: null,
    };
  }

  // ABSTAIN is participation but is neither FOR nor AGAINST, so the majority is
  // computed over the substantive (FOR + AGAINST) vote only.
  const decisive = tally.for + tally.against;

  if (decisive === 0) {
    return {
      outcome: "DEADLOCKED",
      explanation:
        `All ${tally.abstain} participating members abstained; there is no substantive ` +
        `vote either way. No automatic tie-break is applied.`,
      threshold: null,
    };
  }

  let threshold: number;
  switch (majorityRule) {
    case "UNANIMOUS":
      threshold = decisive;
      break;
    case "TWO_THIRDS":
      // Ceiling of two-thirds of the substantive vote.
      threshold = Math.ceil((decisive * 2) / 3);
      break;
    case "SIMPLE":
    default:
      threshold = Math.floor(decisive / 2) + 1;
      break;
  }

  // A tie is a deadlock under every rule and is checked before the threshold so
  // an even split can never be resolved by rounding.
  if (tally.for === tally.against) {
    return {
      outcome: "DEADLOCKED",
      explanation:
        `Tied vote: ${tally.for} for, ${tally.against} against (${tally.abstain} abstained). ` +
        `Under ${majorityRule} no automatic tie-break applies; escalation requires a ` +
        `separate governed action.`,
      threshold,
    };
  }

  if (tally.for >= threshold) {
    return {
      outcome: "APPROVED",
      explanation:
        `Carried under ${majorityRule}: ${tally.for} for, ${tally.against} against, ` +
        `${tally.abstain} abstained. ${threshold} of ${decisive} substantive votes required.`,
      threshold,
    };
  }

  return {
    outcome: "REJECTED",
    explanation:
      `Not carried under ${majorityRule}: ${tally.for} for, ${tally.against} against, ` +
      `${tally.abstain} abstained. ${threshold} of ${decisive} substantive votes required.`,
    threshold,
  };
}

/* --------------------------- voting window --------------------------- */

export type VotingWindow = { opensAt: Date | null; closesAt: Date | null };

export type WindowState = "NOT_OPEN" | "OPEN" | "CLOSED";

/**
 * Half-open window: opensAt <= now < closesAt.
 *
 * An absent boundary is treated as unbounded on that side, which keeps a
 * resolution tabled without an explicit deadline votable.
 */
export function votingWindowState(window: VotingWindow, now: Date): WindowState {
  if (window.opensAt && now.getTime() < window.opensAt.getTime()) return "NOT_OPEN";
  if (window.closesAt && now.getTime() >= window.closesAt.getTime()) return "CLOSED";
  return "OPEN";
}

/** Every eligible member has cast a substantive ballot, so waiting adds nothing. */
export function allEligibleHaveVoted(
  eligibleMemberIds: string[],
  recusedMemberIds: string[],
  ballots: BallotLine[],
): boolean {
  const recused = new Set(recusedMemberIds);
  const eligible = eligibleMemberIds.filter((id) => !recused.has(id));
  if (eligible.length === 0) return false;
  const voted = new Set(
    ballots.filter((b) => isSubstantiveVote(b.vote)).map((b) => b.memberId),
  );
  return eligible.every((id) => voted.has(id));
}
