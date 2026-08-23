import { z } from "zod";
import { RESOLUTION_CATEGORIES } from "./governance";
import { CLASSIFICATION_ORDER } from "./constants";

/**
 * Transport contract for the governance resolution proposal.
 *
 * Kept out of the route module so it can be unit-tested directly: route files
 * import `next/server`, which is awkward to load in a plain Node test context.
 * Previously the contract was only asserted by grepping the route source for
 * `.strict()` (finding A-04) — this module makes it executable.
 */

/**
 * Fields the server derives from trusted state. A client that supplies any of
 * these is attempting actor impersonation, tenant escalation, lifecycle forgery
 * or vote injection, so the request is rejected rather than silently sanitised.
 */
export const SERVER_CONTROLLED_FIELDS = [
  "id",
  "tenantId",
  "reference",
  "status",
  "proposedBy",
  "proposedByUserId",
  "actorId",
  "userId",
  "requiredMajority",
  "quorumMet",
  "votesFor",
  "votesAgainst",
  "votesAbstain",
  "decisionDate",
  "createdAt",
] as const;

export type ServerControlledField = (typeof SERVER_CONTROLLED_FIELDS)[number];

/**
 * `.strict()` makes unknown keys an error. Combined with the explicit
 * server-controlled check in the route, a forged `tenantId` or `status` fails
 * loudly (422) instead of being ignored.
 */
export const ProposeResolutionSchema = z
  .object({
    bodyId: z.string().min(3).max(64),
    title: z.string().trim().min(8).max(200),
    category: z.enum(RESOLUTION_CATEGORIES),
    summary: z.string().trim().min(20).max(2000),
    rationale: z.string().trim().min(20).max(2000),
    dataBasis: z.string().trim().min(10).max(2000),
    consequences: z.string().trim().min(10).max(2000),
    classification: z.enum(CLASSIFICATION_ORDER),
    authorityPolicyId: z.string().min(3).max(64).nullish(),
    linkedObjectType: z.string().min(2).max(64).nullish(),
    linkedObjectId: z.string().min(2).max(64).nullish(),
    amount: z.number().nonnegative().finite().nullish(),
    matterTrigger: z
      .enum([
        "CAPITAL_ALLOCATION",
        "OWNERSHIP_CHANGE",
        "NEW_SECTOR_OS",
        "POLICY_CONSTITUTION",
        "DISTRIBUTION",
        "RISK_ACCEPTANCE",
        "AUDIT_FINDING_CLOSURE",
        "AGGRESSIVE_TAX_POSITION",
        "BENEFICIARY_ELIGIBILITY",
        "SUCCESSION",
        "FAMILY_CONSTITUTION",
        "TRUST_DISTRIBUTION",
        "TRUST_AMENDMENT",
      ])
      .nullish(),
  })
  .strict();

export type ProposeResolutionPayload = z.infer<typeof ProposeResolutionSchema>;

/** First server-controlled field present in a raw payload, if any. */
export function findServerControlledField(raw: Record<string, unknown>): ServerControlledField | null {
  return SERVER_CONTROLLED_FIELDS.find((field) => field in raw) ?? null;
}
