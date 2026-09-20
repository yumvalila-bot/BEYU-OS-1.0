import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies, governanceCharters, governanceCharterTerms, governanceMembers, resolutions, resolutionVotes } from "../../src/db/schema";
export const charterFixtureRules = { quorumMinimum: 4, majorityRule: "SIMPLE", minimumVotingMembers: 4, maximumVotingMembers: 8, requiredSeats: [{ role: "CHAIR", minimum: 1, maximum: 1 }, { role: "SECRETARY", minimum: 1, maximum: 1 }] };
/** Ballot fixture only. Caller must run the real decision endpoint to approve. */
export async function concludedCharterBallot(charterId: string, authorityBodyId?: string) {
 const [c] = await db.select().from(governanceCharters).where(eq(governanceCharters.id, charterId));
 authorityBodyId ??= c.authorityBodyId ?? c.bodyId;
 const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, authorityBodyId));
 const id = `RES_CHARTER_${randomUUID()}`;
 await db.insert(resolutions).values({ id, reference: id, bodyId: authorityBodyId, tenantId: body.tenantId, title: "Adopt the specified charter version", category: "POLICY", summary: "Governed charter fixture", rationale: "Approve immutable charter terms", dataBasis: "Scoped document snapshot", consequences: "Restrictive composition controls; no membership grant", proposedBy: c.createdByUserId, status: "TABLED", requiredMajority: body.majorityRule, classification: "RESTRICTED", linkedObjectType: "GOVERNANCE_CHARTER", linkedObjectId: charterId, votingOpensAt: new Date(0), votingClosesAt: new Date(1) });
 const seats = await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, authorityBodyId));
 for (const seat of seats) await db.insert(resolutionVotes).values({ id: `${id}_${seat.id}`, resolutionId: id, memberId: seat.id, vote: "FOR" });
 return id;
}
export async function cleanupCharters(ids: string[], resolutionIds: string[]) {
 if (ids.length) { await db.delete(governanceCharterTerms).where(inArray(governanceCharterTerms.id, ids)); await db.delete(governanceCharters).where(inArray(governanceCharters.id, ids)); }
 if (resolutionIds.length) { await db.delete(resolutionVotes).where(inArray(resolutionVotes.resolutionId, resolutionIds)); await db.delete(resolutions).where(inArray(resolutions.id, resolutionIds)); }
}
