import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { users, parties, roleAssignments, governanceMembers, governanceBodyActivations, resolutions, resolutionVotes } from "../../src/db/schema";
import { initialAppointmentFixture } from "./initial-appointments";
import { appointmentInput, appointmentBallot, asAppointmentActor as as } from "./appointments";
import { cleanupEstablishments } from "./establishments";
import { executionPrincipal } from "./governance-execution";
import { nominateMember, commandAppointment } from "../../src/lib/governance/appointment-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
export const activationContext = { traceId: "BODY_ACTIVATION_PROOF" };
export async function bodyActivationFixture(prefix: string, documentId = "DOC_D4", nominationCount = 4) {
 const f = await initialAppointmentFixture(prefix), ctx = activationContext;
 const [u] = await db.select().from(users).where(eq(users.id, f.candidate.userId));
 const [party] = await db.select().from(parties).where(eq(parties.id, f.candidate.partyId));
 const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, u.id));
 const candidates = [f.candidate];
 for (let i=1;i<4;i++) {
  const userId=`USR_${prefix}_${i}`,partyId=`PTY_${prefix}_${i}`;
  await db.insert(parties).values({ ...party,id:partyId,displayName:`Initial member ${i}` });
  await db.insert(users).values({ ...u,id:userId,partyId,email:`${prefix.toLowerCase()}_${i}@beyu.os` });
  for (const g of grants) await db.insert(roleAssignments).values({ ...g,id:`${prefix}_${i}_${g.id}`,userId });
  candidates.push(await executionPrincipal(userId));
 }
 const nominations = [];
 for (let i=0;i<nominationCount;i++) {
  const candidate = candidates[i], seatRole = i===0 ? "CHAIR" : i===1 ? "SECRETARY" : "MEMBER";
  const a = await as(f.chair,()=>nominateMember(f.chair,f.childId,appointmentInput(candidate.userId,{seatRole,documentId}),ctx));
  const resolutionId = await appointmentBallot(a.id,f.chair);
  await as(f.secretary,()=>commandAppointment(f.secretary,f.childId,a.id,{command:"APPROVE",expectedRevision:1,resolutionId,note:"Independent initial appointment approval"},ctx));
  nominations.push(await as(candidate,()=>commandAppointment(candidate,f.childId,a.id,{command:"ACCEPT",expectedRevision:2,note:"I consent to my documented initial duties"},ctx)));
 }
 return {...f,candidates,nominations};
}
export async function activationBallot(id: string, f: Awaited<ReturnType<typeof bodyActivationFixture>>) {
 const [plan] = await db.select().from(governanceBodyActivations).where(eq(governanceBodyActivations.id,id));
 const resolutionId=`RES_${id}`;
 await db.insert(resolutions).values({ id:resolutionId,reference:resolutionId,tenantId:f.chair.tenantId,bodyId:f.bodyId,title:"Activate the exact initial committee composition",category:"RESERVED_MATTER",summary:"Immutable activation fixture",rationale:"Independent superior approval",dataBasis:"Exact charter and consented nomination set",consequences:"Membership is not RBAC or Finance authority",proposedBy:f.chair.userId,status:"TABLED",requiredMajority:"SIMPLE",classification:plan.classification,linkedObjectType:"GOVERNANCE_BODY_ACTIVATION",linkedObjectId:id,votingOpensAt:new Date(0),votingClosesAt:new Date(1) });
 for (const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.bodyId))) await db.insert(resolutionVotes).values({id:`${resolutionId}_${m.id}`,resolutionId,memberId:m.id,vote:"FOR"});
 await as(f.chair,()=>decideResolutionClosure(f.chair,{resolutionId},activationContext));
 return resolutionId;
}
export async function cleanupBodyActivation(prefix: string) {
 await db.execute(sql`delete from governance_body_activations where body_id in (select body_id from governance_body_establishments where parent_body_id=${`GOV_${prefix}`})`);
 await db.execute(sql`delete from governance_members where body_id in (select body_id from governance_body_establishments where parent_body_id=${`GOV_${prefix}`})`);
 await cleanupEstablishments(prefix);
 for(let i=1;i<4;i++) {
  const id=`USR_${prefix}_${i}`;
  await db.execute(sql`delete from notifications where user_id=${id}`);await db.execute(sql`delete from sessions where user_id=${id}`);
  await db.delete(roleAssignments).where(eq(roleAssignments.userId,id));await db.delete(users).where(eq(users.id,id));await db.delete(parties).where(eq(parties.id,`PTY_${prefix}_${i}`));
 }
}
