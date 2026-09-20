import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies, governanceMembers, governanceAppointments, users, parties, roleAssignments, resolutions, resolutionVotes } from "../../src/db/schema";
import { executionPrincipal } from "./governance-execution";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import type { Principal } from "../../src/lib/authz";
export async function asAppointmentActor<T>(p: Principal, fn: () => Promise<T>) { return db.transaction(async (tx) => { await tx.execute(sql`set local role beyu_runtime`); return withTenantDatabaseContext(p, fn); }); }
export async function appointmentFixture(prefix: string) {
 const chair = await executionPrincipal(), secretary = await executionPrincipal("USR_GRACE_KILELE");
 const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, "GOV_GROUP_BOARD"));
 const bodyId = `GOV_${prefix}`;
 await db.insert(governanceBodies).values({ ...body, id: bodyId, code: bodyId });
 for (const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id))) await db.insert(governanceMembers).values({ ...m, id: `${prefix}_${m.id}`, bodyId });
 const [u] = await db.select().from(users).where(eq(users.id, chair.userId));
 const [party] = await db.select().from(parties).where(eq(parties.id, u.partyId!));
 await db.insert(parties).values({ ...party, id: `PTY_${prefix}`, displayName: "Disposable appointment nominee" });
 await db.insert(users).values({ ...u, id: `USR_${prefix}`, partyId: `PTY_${prefix}`, email: `${prefix.toLowerCase()}@beyu.os` });
 for (const grant of await db.select().from(roleAssignments).where(eq(roleAssignments.userId, u.id))) await db.insert(roleAssignments).values({ ...grant, id: `${prefix}_${grant.id}`, userId: `USR_${prefix}` });
 return { bodyId, chair, secretary, candidate: await executionPrincipal(`USR_${prefix}`) };
}
export const appointmentInput = (userId: string, extra = {}) => ({ nomineeUserId: userId, documentId: "DOC_D4", seatRole: "MEMBER", votingRights: true, appointedOn: new Date().toISOString().slice(0,10), retiredOn: "2030-12-31", rationale: "Review the candidate's eligibility, competence and documented term", ...extra });
export async function appointmentBallot(id: string, chair: Principal, decide = true) {
 const [a] = await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, id));
 const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, a.bodyId));
 const resolutionId = `RES_${id}`;
 await db.insert(resolutions).values({ id: resolutionId, reference: resolutionId, tenantId: body.tenantId, bodyId: body.id, title: "Appoint the identified nominee", category: "APPOINTMENT", summary: "Fixture", rationale: "Fixture", dataBasis: "Fixture", consequences: "No RBAC grant", proposedBy: chair.userId, status: "TABLED", requiredMajority: body.majorityRule, classification: a.classification, linkedObjectType: "GOVERNANCE_APPOINTMENT", linkedObjectId: id, votingOpensAt: new Date(0), votingClosesAt: new Date(1) });
 for (const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id))) await db.insert(resolutionVotes).values({ id: `${resolutionId}_${m.id}`, resolutionId, memberId: m.id, vote: m.partyId === a.partyId ? "RECUSED" : "FOR" });
 if (decide) await asAppointmentActor(chair, () => decideResolutionClosure(chair, { resolutionId }, { traceId: "APPOINTMENT_FIXTURE" }));
 return resolutionId;
}
export async function cleanupAppointments(prefix: string) {
 const bodyId = `GOV_${prefix}`, uid = `USR_${prefix}`;
 await db.delete(governanceAppointments).where(eq(governanceAppointments.bodyId, bodyId));
 await db.execute(sql`delete from resolution_votes where resolution_id in (select id from resolutions where body_id=${bodyId})`);
 await db.delete(resolutions).where(eq(resolutions.bodyId, bodyId)); await db.delete(governanceMembers).where(eq(governanceMembers.bodyId, bodyId)); await db.delete(governanceBodies).where(eq(governanceBodies.id, bodyId));
 await db.execute(sql`delete from notifications where user_id=${uid}`); await db.execute(sql`delete from sessions where user_id=${uid}`); await db.delete(roleAssignments).where(eq(roleAssignments.userId, uid)); await db.delete(users).where(eq(users.id, uid)); await db.delete(parties).where(eq(parties.id, `PTY_${prefix}`));
}
