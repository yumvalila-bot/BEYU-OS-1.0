import { describe, expect, it } from "vitest";
import {
  allEligibleHaveVoted,
  calculateQuorum,
  decideResolution,
  tallyBallots,
  votingWindowState,
  type BallotLine,
} from "../../src/lib/governance-voting";

/**
 * Constitutional arithmetic — pure, no database.
 *
 * Every final decision must be mathematically reproducible from the governing
 * rules and the eligible votes; these tests are that proof.
 */

const members = (n: number) => Array.from({ length: n }, (_, i) => `M${i + 1}`);
const ballot = (memberId: string, vote: BallotLine["vote"]): BallotLine => ({ memberId, vote });

describe("quorum", () => {
  it("counts eligible members, not votes cast", () => {
    // 5 eligible, only 1 has voted: the denominator stays 5.
    const q = calculateQuorum(
      { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 4 },
      [ballot("M1", "FOR")],
    );
    expect(q.eligibleCount).toBe(5);
    expect(q.participated).toBe(1);
    expect(q.required).toBe(4);
    expect(q.met).toBe(false);
  });

  it("a non-voting eligible member remains in the denominator", () => {
    const q = calculateQuorum(
      { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 4 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "AGAINST"), ballot("M4", "ABSTAIN")],
    );
    expect(q.eligibleCount).toBe(5);
    expect(q.participated).toBe(4);
    expect(q.met).toBe(true);
  });

  it("excludes recused members from the denominator", () => {
    // 5 members, 2 recused -> electorate of 3.
    const q = calculateQuorum(
      { eligibleMemberIds: members(5), recusedMemberIds: ["M4", "M5"], quorumMinimum: 3 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "AGAINST"), ballot("M4", "RECUSED"), ballot("M5", "RECUSED")],
    );
    expect(q.eligibleCount).toBe(3);
    expect(q.recusedCount).toBe(2);
    expect(q.participated).toBe(3);
    expect(q.met).toBe(true);
  });

  /* §9 boundary cases — the edges of the quorum arithmetic. */

  it("an empty electorate never reaches quorum", () => {
    // 0 eligible members: `required` collapses to 0, but quorum must NOT be
    // reported as met, or a body with no members could decide anything.
    const q = calculateQuorum(
      { eligibleMemberIds: [], recusedMemberIds: [], quorumMinimum: 0 },
      [],
    );
    expect(q.eligibleCount).toBe(0);
    expect(q.required).toBe(0);
    expect(q.met).toBe(false);
  });

  it("an electorate of one reaches quorum only when that member votes", () => {
    const input = { eligibleMemberIds: members(1), recusedMemberIds: [], quorumMinimum: 1 };
    expect(calculateQuorum(input, []).met).toBe(false);
    const q = calculateQuorum(input, [ballot("M1", "FOR")]);
    expect(q.eligibleCount).toBe(1);
    expect(q.participated).toBe(1);
    expect(q.met).toBe(true);
  });

  it("is met at exactly the quorum minimum", () => {
    const q = calculateQuorum(
      { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 4 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "AGAINST"), ballot("M4", "ABSTAIN")],
    );
    expect(q.participated).toBe(4);
    expect(q.required).toBe(4);
    expect(q.met).toBe(true);
  });

  it("is not met one participant below the quorum minimum", () => {
    const q = calculateQuorum(
      { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 4 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "AGAINST")],
    );
    expect(q.participated).toBe(3);
    expect(q.required).toBe(4);
    expect(q.met).toBe(false);
  });

  it("a recusal can lower the requirement enough to reach quorum", () => {
    // 5 members, quorum 4, only 3 participate -> not met. Recuse one member and
    // the electorate becomes 4 with the same 3 participants -> still not met;
    // recuse two and the requirement caps at 3 -> met. Recusal changes the
    // denominator, never the participation count.
    const ballots = [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "AGAINST")];
    const base = { eligibleMemberIds: members(5), quorumMinimum: 4 };
    expect(calculateQuorum({ ...base, recusedMemberIds: [] }, ballots).met).toBe(false);
    expect(calculateQuorum({ ...base, recusedMemberIds: ["M5"] }, ballots).met).toBe(false);
    const withTwo = calculateQuorum({ ...base, recusedMemberIds: ["M4", "M5"] }, ballots);
    expect(withTwo.eligibleCount).toBe(3);
    expect(withTwo.required).toBe(3);
    expect(withTwo.met).toBe(true);
  });

  it("ignores ballots from members outside the eligible electorate", () => {
    // A ballot from a retired or non-member seat cannot manufacture quorum.
    const q = calculateQuorum(
      { eligibleMemberIds: members(3), recusedMemberIds: [], quorumMinimum: 3 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("OUTSIDER", "FOR")],
    );
    expect(q.participated).toBe(2);
    expect(q.met).toBe(false);
  });

  it("does not let a recusal make a body permanently undecidable", () => {
    // quorum_minimum 4 but only 2 non-recused members remain.
    const q = calculateQuorum(
      { eligibleMemberIds: members(4), recusedMemberIds: ["M3", "M4"], quorumMinimum: 4 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "RECUSED"), ballot("M4", "RECUSED")],
    );
    expect(q.eligibleCount).toBe(2);
    expect(q.required).toBe(2);
    expect(q.met).toBe(true);
  });

  it("counts an abstention as participation", () => {
    const q = calculateQuorum(
      { eligibleMemberIds: members(3), recusedMemberIds: [], quorumMinimum: 3 },
      [ballot("M1", "FOR"), ballot("M2", "AGAINST"), ballot("M3", "ABSTAIN")],
    );
    expect(q.participated).toBe(3);
    expect(q.met).toBe(true);
  });

  it("does not count a RECUSED ballot as participation", () => {
    const q = calculateQuorum(
      { eligibleMemberIds: members(3), recusedMemberIds: ["M3"], quorumMinimum: 3 },
      [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "RECUSED")],
    );
    expect(q.eligibleCount).toBe(2);
    expect(q.participated).toBe(2);
  });
});

describe("decision — majority rules", () => {
  const quorumMet = calculateQuorum(
    { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 3 },
    [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "FOR"), ballot("M4", "AGAINST"), ballot("M5", "ABSTAIN")],
  );

  it("SIMPLE majority carries with more than half the substantive vote", () => {
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum: quorumMet,
      tally: { for: 3, against: 1, abstain: 1, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("APPROVED");
    expect(d.threshold).toBe(3); // floor(4/2)+1
  });

  it("SIMPLE majority rejects when the threshold is not reached", () => {
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum: quorumMet,
      tally: { for: 1, against: 3, abstain: 1, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("REJECTED");
  });

  it("TWO_THIRDS requires a two-thirds substantive majority", () => {
    // 2 of 3 is exactly two-thirds -> carries.
    expect(
      decideResolution({
        majorityRule: "TWO_THIRDS",
        quorum: quorumMet,
        tally: { for: 2, against: 1, abstain: 0, recused: 0 },
        votingConcluded: true,
      }).outcome,
    ).toBe("APPROVED");

    // 3 of 5 is a simple but not a two-thirds majority -> fails.
    expect(
      decideResolution({
        majorityRule: "TWO_THIRDS",
        quorum: quorumMet,
        tally: { for: 3, against: 2, abstain: 0, recused: 0 },
        votingConcluded: true,
      }).outcome,
    ).toBe("REJECTED");
  });

  it("UNANIMOUS requires every substantive vote in favour", () => {
    expect(
      decideResolution({
        majorityRule: "UNANIMOUS",
        quorum: quorumMet,
        tally: { for: 3, against: 0, abstain: 1, recused: 0 },
        votingConcluded: true,
      }).outcome,
    ).toBe("APPROVED");

    expect(
      decideResolution({
        majorityRule: "UNANIMOUS",
        quorum: quorumMet,
        tally: { for: 3, against: 1, abstain: 0, recused: 0 },
        votingConcluded: true,
      }).outcome,
    ).toBe("REJECTED");
  });
});

describe("abstention semantics", () => {
  const quorum = calculateQuorum(
    { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 3 },
    [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "FOR"), ballot("M4", "AGAINST"), ballot("M5", "ABSTAIN")],
  );

  it("the worked example from the governance decisions resolves correctly", () => {
    // 5 eligible, 5 participate: 3 FOR, 1 AGAINST, 1 ABSTAIN.
    expect(quorum.met).toBe(true);
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 3, against: 1, abstain: 1, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("APPROVED");
  });

  it("an abstention is never counted as FOR", () => {
    // 1 FOR, 1 AGAINST, 3 ABSTAIN. If abstentions counted as FOR this would carry.
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 1, against: 1, abstain: 3, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("DEADLOCKED");
  });

  it("an abstention is never counted as AGAINST", () => {
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 2, against: 1, abstain: 2, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("APPROVED");
  });

  it("an all-abstain vote deadlocks rather than approving or rejecting", () => {
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 0, against: 0, abstain: 5, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("DEADLOCKED");
  });
});

describe("tie handling — no automatic tie-break", () => {
  const quorum = calculateQuorum(
    { eligibleMemberIds: members(4), recusedMemberIds: [], quorumMinimum: 3 },
    [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "AGAINST"), ballot("M4", "AGAINST")],
  );

  it("a tie produces DEADLOCKED, never APPROVED or REJECTED", () => {
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 2, against: 2, abstain: 0, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("DEADLOCKED");
    expect(d.outcome).not.toBe("APPROVED");
    expect(d.outcome).not.toBe("REJECTED");
    expect(d.explanation).toMatch(/no automatic tie-break/i);
  });

  it("ties deadlock under every configured majority rule", () => {
    for (const rule of ["SIMPLE", "TWO_THIRDS", "UNANIMOUS"] as const) {
      expect(
        decideResolution({
          majorityRule: rule,
          quorum,
          tally: { for: 2, against: 2, abstain: 0, recused: 0 },
          votingConcluded: true,
        }).outcome,
      ).toBe("DEADLOCKED");
    }
  });

  it("no chair casting vote is applied implicitly", () => {
    // A chair exists among the members but must not break the tie.
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 1, against: 1, abstain: 0, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("DEADLOCKED");
  });
});

describe("decision timing", () => {
  const quorum = calculateQuorum(
    { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 3 },
    [ballot("M1", "FOR"), ballot("M2", "FOR"), ballot("M3", "FOR")],
  );

  it("returns PENDING while voting remains open", () => {
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum,
      tally: { for: 3, against: 0, abstain: 0, recused: 0 },
      votingConcluded: false,
    });
    expect(d.outcome).toBe("PENDING");
  });

  it("defers when voting concludes without quorum", () => {
    const shortQuorum = calculateQuorum(
      { eligibleMemberIds: members(5), recusedMemberIds: [], quorumMinimum: 4 },
      [ballot("M1", "FOR")],
    );
    const d = decideResolution({
      majorityRule: "SIMPLE",
      quorum: shortQuorum,
      tally: { for: 1, against: 0, abstain: 0, recused: 0 },
      votingConcluded: true,
    });
    expect(d.outcome).toBe("DEFERRED");
    expect(d.explanation).toMatch(/quorum not met/i);
  });

  it("detects when every eligible member has voted", () => {
    const ballots = [ballot("M1", "FOR"), ballot("M2", "AGAINST"), ballot("M3", "ABSTAIN")];
    expect(allEligibleHaveVoted(members(3), [], ballots)).toBe(true);
    expect(allEligibleHaveVoted(members(4), [], ballots)).toBe(false);
    // A recused member is not awaited.
    expect(allEligibleHaveVoted(members(4), ["M4"], ballots)).toBe(true);
  });
});

describe("voting window — half-open [opensAt, closesAt)", () => {
  const opensAt = new Date("2026-01-10T00:00:00Z");
  const closesAt = new Date("2026-01-20T00:00:00Z");
  const w = { opensAt, closesAt };

  it("rejects a vote before opening", () => {
    expect(votingWindowState(w, new Date("2026-01-09T23:59:59Z"))).toBe("NOT_OPEN");
  });

  it("accepts a vote exactly at opensAt (inclusive lower bound)", () => {
    expect(votingWindowState(w, opensAt)).toBe("OPEN");
  });

  it("accepts a vote inside the window", () => {
    expect(votingWindowState(w, new Date("2026-01-15T12:00:00Z"))).toBe("OPEN");
  });

  it("rejects a vote exactly at closesAt (exclusive upper bound)", () => {
    expect(votingWindowState(w, closesAt)).toBe("CLOSED");
  });

  it("rejects a vote after closing", () => {
    expect(votingWindowState(w, new Date("2026-01-20T00:00:01Z"))).toBe("CLOSED");
  });

  it("treats absent boundaries as unbounded", () => {
    expect(votingWindowState({ opensAt: null, closesAt: null }, new Date())).toBe("OPEN");
  });
});

describe("tally", () => {
  it("counts each vote value independently", () => {
    const t = tallyBallots([
      ballot("M1", "FOR"),
      ballot("M2", "FOR"),
      ballot("M3", "AGAINST"),
      ballot("M4", "ABSTAIN"),
      ballot("M5", "RECUSED"),
    ]);
    expect(t).toEqual({ for: 2, against: 1, abstain: 1, recused: 1 });
  });
});
