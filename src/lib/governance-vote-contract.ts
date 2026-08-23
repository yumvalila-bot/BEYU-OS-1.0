import { z } from "zod";
import { SUBSTANTIVE_VOTES } from "./governance-voting";

/**
 * Transport contract for governance voting.
 *
 * Kept out of the route modules so it is directly unit-testable (route files
 * import `next/server`). Mirrors the proposal contract: `.strict()` so a forged
 * field fails loudly rather than being silently ignored.
 */

/**
 * Fields derived from trusted server state. A client supplying any of these is
 * attempting actor impersonation, tenant escalation, membership forgery or
 * lifecycle forgery.
 *
 * RECUSED is deliberately NOT castable through this endpoint: recusal is a
 * distinct governance act, not a vote value a member may self-assign.
 */
export const VOTE_SERVER_CONTROLLED_FIELDS = [
  "id",
  "memberId",
  "resolutionId",
  "tenantId",
  "actorId",
  "userId",
  "actorUserId",
  "castAt",
  "status",
  "quorumMet",
  "votesFor",
  "votesAgainst",
  "votesAbstain",
  "decisionDate",
  "outcome",
] as const;

export type VoteServerControlledField = (typeof VOTE_SERVER_CONTROLLED_FIELDS)[number];

export const CastVoteSchema = z
  .object({
    vote: z.enum(SUBSTANTIVE_VOTES),
    comment: z.string().trim().max(2000).nullish(),
  })
  .strict();

export type CastVotePayload = z.infer<typeof CastVoteSchema>;

export const TableResolutionSchema = z
  .object({
    votingClosesAt: z.string().datetime().nullish(),
  })
  .strict();

export type TableResolutionPayload = z.infer<typeof TableResolutionSchema>;

/**
 * Decision/closure request.
 *
 * The outcome is DELIBERATELY absent. A decision authority closes a resolution;
 * it does not choose the result. `decisionNote` is ordinary metadata recorded in
 * the audit ledger and can never influence the computed outcome.
 *
 * `.strict()` means a client attempting to supply `outcome`, `status` or a tally
 * fails validation loudly rather than having it silently ignored.
 */
export const DecideResolutionSchema = z
  .object({
    decisionNote: z.string().trim().max(2000).nullish(),
  })
  .strict();

export type DecideResolutionPayload = z.infer<typeof DecideResolutionSchema>;

/**
 * Outcome-bearing fields a client must never supply to the decision endpoint.
 * These are in addition to VOTE_SERVER_CONTROLLED_FIELDS, which already covers
 * status, tallies, decisionDate and outcome.
 */
export const DECISION_SERVER_CONTROLLED_FIELDS = [
  "decision",
  "finalOutcome",
  "voteCount",
  "quorumResult",
  "approvalResult",
  "quorum",
  "tally",
  "majorityRule",
  "decidedByMemberId",
  "explanation",
] as const;

export type DecisionServerControlledField = (typeof DECISION_SERVER_CONTROLLED_FIELDS)[number];

/**
 * Detect a forged field on a decision request, checking both the shared
 * vote-level fields and the decision-specific outcome fields.
 */
export function findDecisionServerControlledField(
  raw: Record<string, unknown>,
): VoteServerControlledField | DecisionServerControlledField | null {
  return (
    findVoteServerControlledField(raw) ??
    DECISION_SERVER_CONTROLLED_FIELDS.find((field) => field in raw) ??
    null
  );
}

export function findVoteServerControlledField(
  raw: Record<string, unknown>,
): VoteServerControlledField | null {
  return VOTE_SERVER_CONTROLLED_FIELDS.find((field) => field in raw) ?? null;
}
