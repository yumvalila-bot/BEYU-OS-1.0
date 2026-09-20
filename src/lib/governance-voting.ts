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
  /** The configured absolute requirement; recusals never lower it. */
  required: number;
  participated: number;
  met: boolean;
};

/**
 * Quorum.
 *
 * `quorum_minimum` is an absolute member count, not a proportion. An
 * insufficient electorate must defer the decision, never rewrite the rule.
 */
export function calculateQuorum(input: QuorumInput, ballots: BallotLine[]): QuorumResult {
  const members = new Set(input.eligibleMemberIds);
  const recused = new Set(input.recusedMemberIds.filter((id) => members.has(id)));
  const eligible = new Set([...members].filter((id) => !recused.has(id)));
  const participated = new Set(ballots.filter(
    (b) => eligible.has(b.memberId) && isSubstantiveVote(b.vote),
  ).map((b) => b.memberId)).size;
  const required = input.quorumMinimum;
  const validRule = Number.isSafeInteger(required) && required > 0;
  return {
    eligibleCount: eligible.size,
    recusedCount: recused.size,
    required,
    participated,
    met: validRule && eligible.size > 0 && participated >= required,
  };
}

/** One electorate for quorum AND tally. Conflicts fail closed as recusals. */
export function eligibleBallots(
  ballots: (BallotLine & { conflictDeclared?: boolean })[],
  eligibleMemberIds: string[],
): BallotLine[] {
  const eligible = new Set(eligibleMemberIds);
  const seen = new Set<string>();
  return ballots.filter((b) => eligible.has(b.memberId)).map((b) => {
    if (seen.has(b.memberId) || !(VOTE_VALUES as readonly string[]).includes(b.vote)) {
      throw new Error("Invalid or duplicate authoritative ballot");
    }
    seen.add(b.memberId);
    return { memberId: b.memberId, vote: b.conflictDeclared ? "RECUSED" : b.vote };
  });
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

  if (!isMajorityRule(majorityRule)) {
    return { outcome: "DEFERRED", explanation: "Unknown majority rule; no authority to decide.", threshold: null };
  }

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
